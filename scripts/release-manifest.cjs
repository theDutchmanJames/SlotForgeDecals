const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function installerNames(version,platform,arch){
  assert(/^\d+\.\d+\.\d+$/.test(version),'Expected a stable numeric version');
  assert(['windows','mac','linux'].includes(platform),'Unsupported platform');
  assert(['x64','arm64'].includes(arch)&&!(platform==='windows'&&arch!=='x64'),'Unsupported architecture');
  return (platform==='windows'?['exe']:platform==='mac'?['dmg','zip']:['AppImage','deb']).map(ext=>`SlotForgeDecals-${version}-${platform}-${platform==='linux'&&arch==='x64'?(ext==='deb'?'amd64':'x86_64'):arch}.${ext}`);
}
if(require.main===module){
  const [platform,arch]=process.argv.slice(2),version=require('../package.json').version,dir=path.resolve('dist',`v${version}`);
  const lines=installerNames(version,platform,arch).map(name=>{const bytes=fs.readFileSync(path.join(dir,name));assert(bytes.length>0,`Empty installer: ${name}`);return crypto.createHash('sha256').update(bytes).digest('hex')+'  '+name;});
  fs.writeFileSync(path.join(dir,`SHA256SUMS-${platform}-${arch}.txt`),lines.join('\n')+'\n');
}
module.exports={installerNames};
