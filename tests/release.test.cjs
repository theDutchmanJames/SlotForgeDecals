const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {installerNames}=require('../scripts/release-manifest.cjs');
const {options}=require('../scripts/build-desktop.cjs');
test('Release assets distinguish native Linux labels and Mac architectures',()=>{
  assert.deepEqual(installerNames('0.2.12','linux','x64'),['SlotForgeDecals-0.2.12-linux-x86_64.AppImage','SlotForgeDecals-0.2.12-linux-amd64.deb']);
  assert.equal(new Set(['windows','mac','linux'].flatMap(p=>(p==='windows'?['x64']:['x64','arm64']).flatMap(a=>installerNames('0.2.12',p,a)))).size,9);
  assert.throws(()=>installerNames('../bad','linux','x64'));assert.throws(()=>installerNames('0.2.12','windows','arm64'));
});
test('Native builder validates target arguments and supports unattended runs',()=>{
  assert.deepEqual(options(['mac','--arch','arm64','--no-pause','--quick']),{platform:'mac',arch:'arm64',quick:true,pause:false,help:false});
  assert.throws(()=>options(['mac','--arch','ia32']));assert.throws(()=>options(['linux','--unknown']));
});
test('Native packages keep converter resources external and retain all import runtimes',()=>{
  const pkg=require('../package.json'),lock=require('../package-lock.json');
  assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
  assert(pkg.build.extraResources.some(r=>r.to==='ghostscript'&&r.filter.includes('bin/gs')&&r.filter.includes('bin/gswin64c.exe')));
  assert(pkg.build.asarUnpack.includes('node_modules/mupdf/**/*'));assert(pkg.build.files.includes('vendor/imagetracer/**/*'));
  assert(fs.readFileSync('scripts/publish-release.cjs','utf8').includes('Release tag must match the tested source'));
});
