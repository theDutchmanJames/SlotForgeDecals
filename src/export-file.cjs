'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
// Exports must never replace the database or retained migration originals.
async function writeExport(root,file,type,data){
 const destination=path.resolve(file),parent=await fs.realpath(path.dirname(destination)),realRoot=await fs.realpath(root);
 const canonical=path.join(parent,path.basename(destination)),relative=path.relative(realRoot,canonical).toLowerCase();
 if(path.extname(destination).toLowerCase()!=='.'+type)throw Error('Choose a .'+type+' filename.');
 if(relative==='workspace.json'||relative.startsWith('projects'+path.sep)||/^backups[\\/]workspace-[123]\.json$/.test(relative)||/^decals\.sqlite(?:$|[-.])/.test(relative))throw Error('Choose an export location outside the live workspace files.');
 try{const stat=await fs.lstat(destination);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Choose a regular export file.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const temp=destination+'.'+crypto.randomUUID()+'.tmp';
 try{const handle=await fs.open(temp,'wx');try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}await fs.rename(temp,destination);}finally{await fs.unlink(temp).catch(()=>{});}
}
module.exports={writeExport};
