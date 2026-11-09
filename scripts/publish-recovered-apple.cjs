// Attach tested Apple Silicon downloads to the exact existing release, without replacing assets.
const assert=require('node:assert/strict');
function validate(release,sha,tagSha,hashes){
 assert.match(sha||'',/^[a-f0-9]{40}$/);
 assert.equal(tagSha,sha,'Release tag must match the tested source');
 assert(!release.draft&&!release.prerelease,'Expected a public stable release');
 for(const [name,digest] of Object.entries(hashes)){
  const matches=release.assets.filter(a=>a.name===name);
  assert(matches.length<=1,`Duplicate asset: ${name}`);
  if(matches.length)assert.equal(matches[0].digest,digest,`Existing release asset differs: ${name}`);
  else assert(/^(SlotForgeDecals-[\d.]+-mac-arm64\.(dmg|zip)|SHA256SUMS-mac-arm64\.txt)$/.test(name),`Missing original release asset: ${name}`);
 }
}
function notes(body){
 return body.replace(/\*\*Platform availability:\*\*[^\n]*\n\n/,'')
  .replace('Apple Silicon is excluded. ','')
  .replace('Apple Silicon downloads will be added after the separate build and tests pass. ','')
  .replace(/\| Intel Mac \|[^\n]*\n/,line=>line+(body.includes('| Apple Silicon Mac (M1 or newer) |')?'':'| Apple Silicon Mac (M1 or newer) | mac-arm64.dmg — drag Decals to Applications; ZIP also available |\n'));
}
if(require.main===module){
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
 const repo=process.env.GH_REPO,sha=process.env.GITHUB_SHA;
 assert.equal(repo,'theDutchmanJames/SlotForgeDecals');
 const version=require(path.resolve('package.json')).version,tag=`v${version}`,dir=path.resolve('release-assets');
 const gh=args=>execFileSync('gh',args,{encoding:'utf8'});
 const releases=JSON.parse(gh(['api',`repos/${repo}/releases?per_page=100`]));
 let release=releases.find(r=>r.tag_name===tag);
 if(!release||release.draft){execFileSync(process.execPath,['scripts/publish-release.cjs'],{stdio:'inherit',env:{...process.env,OMIT_APPLE_SILICON:'false'}});process.exit(0);}
 const expected=['SlotForgeDecals-source.tar.gz','ghostscript-10.08.0.tar.xz','mupdf-1.28.1-complete-source.tar.gz','BUILDING.md','MUPDF-SOURCE-REVISIONS.txt','SHA256SUMS-sources.txt'];
 const {installerNames}=require(path.resolve('scripts/release-manifest.cjs'));
 for(const [platform,arch]of [['windows','x64'],['mac','x64'],['mac','arm64'],['linux','x64'],['linux','arm64']])expected.push(...installerNames(version,platform,arch),`SHA256SUMS-${platform}-${arch}.txt`);
 const hashes=Object.fromEntries(expected.map(name=>{const bytes=fs.readFileSync(path.join(dir,name));assert(bytes.length>0,`Empty asset: ${name}`);return[name,'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex')];}));
 const tagSha=()=>JSON.parse(gh(['api',`repos/${repo}/commits/${tag}`])).sha;
 validate(release,sha,tagSha(),hashes);
 for(const name of expected)if(!release.assets.some(a=>a.name===name))gh(['release','upload',tag,path.join(dir,name)]);
 release=JSON.parse(gh(['api',`repos/${repo}/releases/${release.id}`]));
 validate(release,sha,tagSha(),hashes);
 for(const name of expected)assert(release.assets.some(a=>a.name===name),`Upload missing: ${name}`);
 const file=path.join(dir,'apple-release-notes.md');fs.writeFileSync(file,notes(release.body||''));
 gh(['release','edit',tag,'--notes-file',file]);
 console.log(`Added verified Apple Silicon downloads to ${tag}; existing downloads unchanged.`);
}
module.exports={validate,notes};
