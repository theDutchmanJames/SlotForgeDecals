// Launch the actual packaged application; exercise import, physical PDF geometry and persistence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const version=require('../package.json').version,root=path.resolve(__dirname,'..'),dist=path.join(root,'dist',`v${version}`);
const candidates=process.platform==='win32'?['win-unpacked/SlotForge Decals.exe']:process.platform==='darwin'?['mac-arm64/SlotForge Decals.app/Contents/MacOS/SlotForge Decals','mac/SlotForge Decals.app/Contents/MacOS/SlotForge Decals']:['linux-unpacked/slotforge-decals','linux-arm64-unpacked/slotforge-decals'];
const executable=candidates.map(p=>path.join(dist,p)).find(p=>fs.existsSync(p));
assert(executable,'The native unpacked application must exist');
const env={...process.env,SLOTFORGE_TEST_EXE:executable};
for(const suite of ['dialog','integration','review-fixes','ui']){
  console.log(`Packaged ${process.platform}/${process.arch}: ${suite}`);
  const result=spawnSync(process.execPath,[`tests/${suite}.cjs`],{cwd:root,stdio:'inherit',env});
  if(result.error)throw result.error;
  assert.equal(result.status,0,`Packaged ${suite} checks pass`);
}
