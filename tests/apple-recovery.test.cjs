const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../scripts/validate-apple-recovery.cjs');
const repo='owner/repo',sha='a'.repeat(40);
const record={id:42,status:'completed',event:'push',head_branch:'main',path:'.github/workflows/native-release.yml',head_repository:{full_name:repo},head_sha:sha};
const jobs=['sources','windows x64','mac x64','linux x64','linux arm64'].map(name=>({name,conclusion:'success'}));
const artifacts=['release-sources','release-windows-x64','release-mac-x64','release-linux-x64','release-linux-arm64'].map(name=>({name,expired:false,size_in_bytes:100,workflow_run:{id:42,head_sha:sha}}));
test('Apple recovery requires the exact main-branch release run and four successful platforms',()=>{
  assert.equal(validate(record,jobs,artifacts,repo,sha),sha);
  for(const change of [{status:'in_progress'},{event:'pull_request'},{head_branch:'other'},{path:'other.yml'},{head_sha:'b'.repeat(40)}])
    assert.throws(()=>validate({...record,...change},jobs,artifacts,repo,sha));
  assert.throws(()=>validate(record,jobs,artifacts,'other/repo',sha));
  for(const missing of jobs)assert.throws(()=>validate(record,jobs.filter(j=>j!==missing),artifacts,repo,sha));
  assert.throws(()=>validate(record,[...jobs,{name:'mac arm64',conclusion:'success'}],artifacts,repo,sha));
});
test('Apple recovery rejects missing, duplicate, expired, empty or unrelated artifacts',()=>{
  for(const missing of artifacts)assert.throws(()=>validate(record,jobs,artifacts.filter(a=>a!==missing),repo,sha));
  assert.throws(()=>validate(record,jobs,[...artifacts,artifacts[0]],repo,sha));
  for(const change of [{expired:true},{size_in_bytes:0},{workflow_run:{id:99,head_sha:sha}},{workflow_run:{id:42,head_sha:'b'.repeat(40)}}])
    assert.throws(()=>validate(record,jobs,[{...artifacts[0],...change},...artifacts.slice(1)],repo,sha));
});
