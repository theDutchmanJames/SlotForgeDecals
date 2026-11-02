// Reuse only verified artifacts from the exact original main-branch release run.
const assert=require('node:assert/strict');
const requiredJobs=['sources','windows x64','mac x64','linux x64','linux arm64'];
const requiredArtifacts=['release-sources','release-windows-x64','release-mac-x64','release-linux-x64','release-linux-arm64'];
function validate(record,jobs,artifacts,repo,expectedSha){
  assert.equal(record.status,'completed','Stop the stalled workflow before recovery');
  assert.equal(record.event,'push','Recover a main-branch push build only');
  assert.equal(record.head_branch,'main');
  assert.equal(record.path,'.github/workflows/native-release.yml');
  assert.equal(record.head_repository.full_name,repo);
  assert.match(expectedSha||'',/^[a-f0-9]{40}$/);
  assert.equal(record.head_sha,expectedSha,'The source run must match the requested release commit');
  for(const name of requiredJobs)
    assert(jobs.some(j=>j.name===name&&j.conclusion==='success'),`Missing successful ${name} job`);
  assert(!jobs.some(j=>j.name==='mac arm64'&&j.conclusion==='success'),'Use normal resume when all platforms passed');
  for(const name of requiredArtifacts){
    const matches=artifacts.filter(a=>a.name===name);
    assert.equal(matches.length,1,`Expected one ${name} artifact`);
    const artifact=matches[0];
    assert(!artifact.expired&&artifact.size_in_bytes>0,`Unavailable artifact: ${name}`);
    assert.equal(artifact.workflow_run.id,record.id,'Artifact belongs to another run');
    assert.equal(artifact.workflow_run.head_sha,expectedSha,'Artifact belongs to another source commit');
  }
  return expectedSha;
}
if(require.main===module){
  const fs=require('node:fs'),{execFileSync}=require('node:child_process');
  const {SOURCE_RUN:run,SOURCE_SHA:expectedSha,GH_REPO:repo}=process.env;
  assert.equal(repo,'theDutchmanJames/SlotForgeDecals');
  assert.match(run||'',/^\d+$/);
  const gh=endpoint=>JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8'}));
  const record=gh(`repos/${repo}/actions/runs/${run}`);
  const sha=validate(record,gh(`repos/${repo}/actions/runs/${run}/jobs?filter=all&per_page=100`).jobs,
    gh(`repos/${repo}/actions/runs/${run}/artifacts?per_page=100`).artifacts,repo,expectedSha);
  const content=gh(`repos/${repo}/contents/package.json?ref=${sha}`);
  const {version}=JSON.parse(Buffer.from(content.content,'base64').toString('utf8'));
  assert.match(version,/^\d+\.\d+\.\d+$/);
  const tag=`v${version}`,refs=gh(`repos/${repo}/git/matching-refs/tags/${tag}`);
  if(refs.some(r=>r.ref===`refs/tags/${tag}`))
    assert.equal(gh(`repos/${repo}/commits/${tag}`).sha,sha,'Existing release tag belongs to another commit');
  fs.appendFileSync(process.env.GITHUB_OUTPUT,`sha=${sha}\nversion=${version}\n`);
  console.log(`Recovering Apple Silicon for ${version} from ${sha}; retaining four tested native builds.`);
}
module.exports={validate};
