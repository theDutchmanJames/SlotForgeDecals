const fs=require('node:fs/promises'),ResEdit=require('resedit');
async function embedIcon(executable,iconPath){
 const exe=ResEdit.NtExecutable.from(await fs.readFile(executable),{ignoreCert:true});
 const resources=ResEdit.NtExecutableResource.from(exe),icon=ResEdit.Data.IconFile.from(await fs.readFile(iconPath));
 const groups=ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
 for(const group of groups.length?groups:[{id:1,lang:1033}])ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries,group.id,group.lang,icon.icons.map(entry=>entry.data));
 resources.outputResource(exe);await fs.writeFile(executable,Buffer.from(exe.generate()));
 // Read back the PE resources: a valid ICO on disk alone does not prove that
 // Explorer and Windows shortcuts will receive the application's icon.
 const check=ResEdit.NtExecutableResource.from(ResEdit.NtExecutable.from(await fs.readFile(executable)));
 for(const group of ResEdit.Resource.IconGroupEntry.fromEntries(check.entries)){
  const actual=group.getIconItemsFromEntries(check.entries);
  if(actual.length!==icon.icons.length||actual.some((entry,n)=>!entry.isRaw()||!Buffer.from(entry.bin).equals(Buffer.from(icon.icons[n].data.bin))))throw Error('Packaged icon verification failed.');
 }
}
module.exports={embedIcon};
