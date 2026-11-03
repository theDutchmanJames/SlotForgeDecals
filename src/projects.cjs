const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),DM=require('../renderer/model.js');
const MAX_BYTES=160e6;
const stamp=s=>s.mtimeMs+':'+s.size;
const thumb=s=>typeof s==='string'&&s.length<2e6&&/^data:image\/png;base64,[A-Za-z\d+/=]+$/.test(s)?s:null;
class Projects{
 constructor(root){this.root=root;this.queue=Promise.resolve();this.cache=new Map();}
 async init(){await fs.mkdir(this.root,{recursive:true});this.realRoot=await fs.realpath(this.root);for(const name of ['Projects','Projects/History','Backups']){const dir=path.join(this.root,name);await fs.mkdir(dir,{recursive:true});const real=await fs.realpath(dir);if(!real.startsWith(this.realRoot+path.sep))throw Error('Project folders must stay inside the workspace.');}}
 enqueue(fn){const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
 async file(scope,name){
  const folder={projects:'Projects',history:'Projects/History',workspace:'Backups'}[scope];
  if(!folder||typeof name!=='string'||name!==path.basename(name)||/[\\/:]/.test(name)||name.length>255||name==='.'||name==='..')throw Error('Invalid project file.');
  if(scope==='workspace'?!/^workspace-[123]\.json$/.test(name):!name.endsWith('.sfsheet'))throw Error('Invalid project file.');
  const file=path.join(this.root,folder,name),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Choose a regular project file.');
  const real=await fs.realpath(file);if(!real.startsWith(this.realRoot+path.sep))throw Error('Project file is outside the workspace.');
  if(stat.size>MAX_BYTES)throw Error('Project exceeds 160 MB.');return{file,stat};
 }
 async readEntry(entry){
  const {file,stat}=await this.file(entry?.scope,entry?.file);
  if(entry.stamp&&entry.stamp!==stamp(stat))throw Error('This version changed. Refresh the project browser and choose it again.');
  const raw=JSON.parse(await fs.readFile(file,'utf8')),after=await fs.stat(file);
  if(stamp(stat)!==stamp(after))throw Error('This version changed while reading it. Refresh and try again.');
  const expected=entry.scope==='workspace'?'slotforge-decals-workspace':'slotforge-decals-sheet';
  if(raw.format!==expected||![1,2].includes(raw.version))throw Error('Unsupported project file.');
  const project=DM.validateProject(raw.project);
  return{project,thumbnail:thumb(raw.thumbnail),stamp:stamp(after),modified:after.mtime.toISOString()};
 }
 async recent(){try{const value=JSON.parse(await fs.readFile(path.join(this.root,'Projects','.recent.json'),'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
 async atomic(file,data){const tmp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(tmp,data,{flag:'wx'});await fs.rename(tmp,file);}finally{await fs.unlink(tmp).catch(()=>{});}}
 async remember(file){const recent=await this.recent();recent[file]=new Date().toISOString();await this.atomic(path.join(this.root,'Projects','.recent.json'),JSON.stringify(recent));}
 async list({scope='projects',projectId}={}){
  await this.queue;await this.init();if(!['projects','history','workspace'].includes(scope))throw Error('Invalid project list.');
  const dir=path.join(this.root,{projects:'Projects',history:'Projects/History',workspace:'Backups'}[scope]),names=(await fs.readdir(dir)).filter(n=>scope==='workspace'?/^workspace-[123]\.json$/.test(n):n.endsWith('.sfsheet'));
  const recent=scope==='projects'?await this.recent():{},entries=[];let unreadable=0;
  for(const name of names){try{
   const {stat}=await this.file(scope,name),key=scope+'/'+name,version=stamp(stat);let meta=this.cache.get(key);
   if(!meta||meta.stamp!==version){const data=await this.readEntry({scope,file:name,stamp:version}),p=data.project;meta={scope,file:name,stamp:version,id:p.id,name:p.name,pages:p.pages,pageSize:p.pageSize,orientation:p.orientation,scale:p.scale,count:p.items.length,added:p.added||data.modified,updated:p.updated,modified:data.modified,thumbnail:data.thumbnail};this.cache.set(key,meta);}
   if(scope==='history'&&projectId&&meta.id!==projectId)continue;
   entries.push({...meta,recent:recent[name]||meta.modified});
  }catch{unreadable++;}}
  // Named exports and the automatically saved copy of the same sheet share one card.
  const unique=scope==='projects'?Array.from(entries.reduce((map,e)=>{const old=map.get(e.id);if(!old||Date.parse(e.modified)>Date.parse(old.modified))map.set(e.id,e);return map;},new Map()).values()):entries;
  unique.sort((a,b)=>Date.parse(b.recent)-Date.parse(a.recent));return{entries:unique,unreadable};
 }
 async read(entry,{remember=false}={}){await this.queue;await this.init();const data=await this.readEntry(entry);if(remember&&entry.scope==='projects')await this.enqueue(()=>this.remember(entry.file));return data;}
 importMany(incoming){
  return this.enqueue(async()=>{
   if(!Array.isArray(incoming)||!incoming.length||incoming.length>100)throw Error('Import 1–100 sheets at a time.');
   const now=new Date().toISOString();
   const records=incoming.map(raw=>{
    const project=DM.validateProject(raw);project.id=crypto.randomUUID();project.added=now;
    const name='project-'+crypto.createHash('sha256').update(project.id).digest('hex').slice(0,24)+'.sfsheet';
    return{name,project,body:JSON.stringify({format:'slotforge-decals-sheet',version:DM.fileVersion(project),project,thumbnail:null})};
   });
   if(records.reduce((n,r)=>n+Buffer.byteLength(r.body),0)>MAX_BYTES)throw Error('Sheet import exceeds 160 MB.');
   await this.init();const created=new Set(),staged=[];
   try{
    // Publish only complete files: an interrupted write must not appear as a corrupt library sheet.
    for(const r of records){const file=path.join(this.root,'Projects',r.name),tmp=file+'.'+crypto.randomUUID()+'.tmp',handle=await fs.open(tmp,'wx');created.add(tmp);try{await handle.writeFile(r.body);await handle.sync();}finally{await handle.close();}staged.push({file,tmp});}
    for(const {file,tmp} of staged){
     try{await fs.lstat(file);throw Error('An imported sheet filename already exists. Please try again.');}catch(e){if(e.code!=='ENOENT')throw e;}
     await fs.rename(tmp,file);created.delete(tmp);created.add(file);
    }
   }catch(e){await Promise.all([...created].map(file=>fs.unlink(file)));throw e;}
   return records.map(r=>({id:r.project.id,name:r.project.name}));
  });
 }
 save({project,thumbnail}){
  return this.enqueue(async()=>{await this.init();const p=DM.validateProject(project),name='project-'+crypto.createHash('sha256').update(p.id).digest('hex').slice(0,24)+'.sfsheet',file=path.join(this.root,'Projects',name);
   const data={format:'slotforge-decals-sheet',version:DM.fileVersion(p),project:p,thumbnail:thumb(thumbnail)},body=JSON.stringify(data);if(Buffer.byteLength(body)>MAX_BYTES)throw Error('Project exceeds 160 MB.');
   let previous;
   try{const safe=await this.file('projects',name);previous=await fs.readFile(safe.file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
   if(previous){let raw;try{raw=JSON.parse(previous);}catch{throw Error('The saved project is unreadable. Its original has been kept. Export a full workspace backup from App Settings before repairing the project file.');}if(raw.format!=='slotforge-decals-sheet'||![1,2].includes(raw.version))throw Error('The saved project is unreadable. Its original has been kept.');
    if(JSON.stringify(raw.project)!==JSON.stringify(p)){const historyName=name.slice(0,-8)+'-'+Date.now()+'-'+crypto.randomUUID()+'.sfsheet';await this.atomic(path.join(this.root,'Projects','History',historyName),previous);}
    else if(raw.thumbnail===data.thumbnail){await this.remember(name);return{name,file:name};}
   }
   await this.atomic(file,body);await this.remember(name);this.cache.delete('projects/'+name);return{name,file:name};
  });
 }
}
module.exports={Projects};
