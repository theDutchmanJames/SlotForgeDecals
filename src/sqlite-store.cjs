'use strict';
// Storage runs in a worker. Existing portable JSON formats remain boundary formats.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite'),DM=require('../renderer/model.js');
const FILE='decals.sqlite',APP=0x53464443,VERSION=2,MAX=160*1024*1024;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const own=(o,k,v)=>Object.defineProperty(o,k,{value:v,writable:true,enumerable:true,configurable:true});
const filename=id=>'project-'+hash(id).slice(0,24)+'.sfsheet';
function connection(file,create=false){
 if(!create){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Choose a regular Decals database file.');}
 const db=new DatabaseSync(file,{timeout:5000});
 try{db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL;');
 if(create){db.exec(`BEGIN IMMEDIATE;
 CREATE TABLE state(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
 CREATE TABLE assets(hash TEXT PRIMARY KEY,value BLOB NOT NULL) STRICT;
 CREATE TABLE documents(hash TEXT PRIMARY KEY,json TEXT NOT NULL) STRICT;
 CREATE TABLE document_links(parent TEXT NOT NULL REFERENCES documents(hash) ON DELETE CASCADE,child TEXT NOT NULL REFERENCES documents(hash),PRIMARY KEY(parent,child)) STRICT;
 CREATE INDEX document_children ON document_links(child);
 CREATE TABLE asset_links(document TEXT NOT NULL REFERENCES documents(hash) ON DELETE CASCADE,asset TEXT NOT NULL REFERENCES assets(hash),PRIMARY KEY(document,asset)) STRICT;
 CREATE INDEX asset_owners ON asset_links(asset);
 CREATE TABLE records(scope TEXT NOT NULL,key TEXT NOT NULL,document TEXT NOT NULL REFERENCES documents(hash),metadata TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(scope,key)) STRICT;
 CREATE INDEX records_scope ON records(scope);
 CREATE TABLE migration_issues(file TEXT PRIMARY KEY,scope TEXT NOT NULL,message TEXT NOT NULL) STRICT;
 PRAGMA application_id=${APP}; PRAGMA user_version=1; COMMIT;`);
 db.prepare('INSERT INTO state VALUES(?,?)').run('identity',crypto.randomUUID());db.prepare('INSERT INTO state VALUES(?,?)').run('revision','0');
 }else{
 if(db.prepare('PRAGMA application_id').get().application_id!==APP||![1,VERSION].includes(db.prepare('PRAGMA user_version').get().user_version))throw Error('Unsupported Decals database. Keep this file and use a compatible app or restore a complete backup.');
 const tables=db.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
 if(tables.some(t=>!['state','assets','documents','records','records_scope','migration_issues','document_links','document_children','asset_links','asset_owners','catalog_name','catalog_added','catalog_updated','catalog_identity'].includes(t.name)||!['table','index'].includes(t.type))||tables.filter(t=>t.type==='table').length!==7)throw Error('Unexpected Decals database schema.');
 if(db.prepare("SELECT value FROM state WHERE key='complete'").get()?.value!=='true')throw Error('Incomplete Decals database. Originals have been retained for recovery.');
 if(!db.prepare("SELECT value FROM state WHERE key='identity'").get())throw Error('Missing database identity.');
 }return db;
 }catch(e){db.close();throw e;}
}
function asset(db,value){const id=hash(value);db.prepare('INSERT OR IGNORE INTO assets VALUES(?,?)').run(id,Buffer.from(value));return id;}
function readAsset(db,id){const row=db.prepare('SELECT value FROM assets WHERE hash=?').get(id);if(!row||hash(row.value)!==id)throw Error('An artwork asset is missing or damaged. Restore a verified backup.');return Buffer.from(row.value).toString('utf8');}
function pack(db,value){
 const refs=[];
 function visit(v,trail=[]){
 if(typeof v==='string'&&(/^data:(image|font)\//.test(v)||(trail.at(-1)==='svg'&&v.startsWith('<svg')))){refs.push({path:trail,asset:asset(db,v)});return null;}
 if(Array.isArray(v))return v.map((entry,n)=>{if(['items','library'].includes(trail.at(-1))){refs.push({path:[...trail,n],document:pack(db,entry)});return null;}return visit(entry,[...trail,n]);});
 if(v&&typeof v==='object'){const out={};for(const [key,entry]of Object.entries(v))own(out,key,visit(entry,[...trail,key]));return out;}return v;
 }
 const json=JSON.stringify({value:visit(value),refs}),id=hash(json);const inserted=db.prepare('INSERT OR IGNORE INTO documents VALUES(?,?)').run(id,json).changes;
 if(inserted)for(const ref of refs){if(ref.asset)db.prepare('INSERT OR IGNORE INTO asset_links VALUES(?,?)').run(id,ref.asset);else db.prepare('INSERT OR IGNORE INTO document_links VALUES(?,?)').run(id,ref.document);}return id;
}
function unpack(db,id,ancestors=new Set()){
 if(ancestors.has(id)||ancestors.size>20)throw Error('Invalid stored artwork references.');const next=new Set([...ancestors,id]);
 const row=db.prepare('SELECT json FROM documents WHERE hash=?').get(id);if(!row||hash(row.json)!==id)throw Error('Saved artwork is missing or damaged. Restore a verified backup.');
 const data=JSON.parse(row.json);if(!Array.isArray(data.refs)||!Object.hasOwn(data,'value'))throw Error('Invalid saved document.');
 for(const ref of data.refs){if(!Array.isArray(ref.path)||ref.path.length>100)throw Error('Invalid saved reference.');let host=data,key='value';for(const part of ref.path){host=host[key];key=part;if(!host||!Object.hasOwn(host,key))throw Error('Invalid saved reference.');}if(host[key]!==null)throw Error('Invalid saved reference placeholder.');own(host,key,ref.asset?readAsset(db,ref.asset):unpack(db,ref.document,next));}return data.value;
}
const state=(db,key)=>db.prepare('SELECT value FROM state WHERE key=?').get(key)?.value;
const setState=(db,key,value)=>db.prepare('INSERT INTO state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));
function collect(db){let count;do{count=db.prepare('DELETE FROM documents WHERE hash NOT IN (SELECT document FROM records) AND hash NOT IN (SELECT child FROM document_links)').run().changes;}while(count);db.exec('DELETE FROM assets WHERE hash NOT IN (SELECT asset FROM asset_links)');}
function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();collect(db);db.exec('COMMIT');return result;}catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}}
function put(db,scope,key,value,metadata={}){
 metadata=require('./catalog.cjs').indexMetadata(metadata);const id=pack(db,value),old=db.prepare('SELECT * FROM records WHERE scope=? AND key=?').get(scope,key),meta=JSON.stringify(metadata);
 if(old?.document===id&&old.metadata===meta)return old;
 const revision=Number(state(db,'revision'))+1;setState(db,'revision',revision);
 db.prepare('INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(scope,key) DO UPDATE SET document=excluded.document,metadata=excluded.metadata,revision=excluded.revision').run(scope,key,id,meta,revision);
 return{scope,key,document:id,metadata:meta,revision};
}
function meta(project,modified=new Date().toISOString()){return{id:project.id,name:project.name,pages:project.pages,pageSize:project.pageSize,orientation:project.orientation,scale:project.scale,count:project.items.length,added:project.added||modified,updated:project.updated,modified,recent:modified};}
function safeLegacy(root,relative){const file=path.join(root,relative),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||!fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep))throw Error('Legacy file must be a regular file inside the workspace.');if(stat.size>MAX)throw Error('Legacy file exceeds the existing 160 MB limit.');return{raw:JSON.parse(fs.readFileSync(file,'utf8')),stat};}
function sheet(raw){if(raw?.format!=='slotforge-decals-sheet'||![1,2].includes(raw.version))throw Error('Unsupported saved sheet.');return{...raw,project:DM.validateProject(raw.project)};}
function migrate(root,file){
 const temp=file+'.migration-'+crypto.randomUUID(),db=connection(temp,true);let published=false;
 try{transaction(db,()=>{
 let current=null,currentFailed=false,recent={};
 try{const value=safeLegacy(root,'Projects/.recent.json').raw;if(value&&typeof value==='object'&&!Array.isArray(value))recent=value;}catch{} 
 for(const relative of ['workspace.json',...Array.from({length:3},(_,n)=>`Backups/workspace-${n+1}.json`)]){
  if(!fs.existsSync(path.join(root,relative)))continue;
  let source;try{const {raw,stat}=safeLegacy(root,relative);source={data:DM.validateWorkspace(raw),stat};}
  catch(e){if(relative==='workspace.json')currentFailed=true;db.prepare('INSERT INTO migration_issues VALUES(?,?,?)').run(relative,'workspace',e.message);continue;}
  const {data,stat}=source,key=relative==='workspace.json'?'current':path.basename(relative);put(db,'workspace',key,data,meta(data.project,stat.mtime.toISOString()));assert.deepEqual(unpack(db,pack(db,data)),data);if(!current){current=data;if(key!=='current'){put(db,'workspace','current',data,meta(data.project,stat.mtime.toISOString()));setState(db,'recovered','true');}}
 }
 if(currentFailed&&!current)throw Error('Your workspace could not be migrated. The original is unchanged. Restore a readable workspace backup first.');
 for(const [folder,scope]of [['Projects','projects'],['Projects/History','history']]){
  const dir=path.join(root,folder);if(!fs.existsSync(dir))continue;
  for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.sfsheet'))){const relative=path.join(folder,name);let source;try{const {raw,stat}=safeLegacy(root,relative);source={data:sheet(raw),stat};}catch(e){db.prepare('INSERT INTO migration_issues VALUES(?,?,?)').run(relative,scope,e.message);continue;}const {data,stat}=source;const metadata=meta(data.project,stat.mtime.toISOString());if(scope==='projects'&&typeof recent[name]==='string'&&Number.isFinite(Date.parse(recent[name])))metadata.recent=new Date(recent[name]).toISOString();put(db,scope,name,data,metadata);assert.deepEqual(unpack(db,pack(db,data)),data);}
 }
 setState(db,'complete','true');setState(db,'migrated',new Date().toISOString());
 });db.close();const verify=connection(temp);try{verifyAll(verify);}finally{verify.close();}
 // Never replace another process's database, even if it appeared during migration.
 fs.linkSync(temp,file);published=true;
 }finally{try{db.close();}catch{}try{fs.unlinkSync(temp);}catch{} }
 return published;
}
function initialize(root,migrateMissing=true){fs.mkdirSync(root,{recursive:true});const real=fs.realpathSync(root);for(const folder of ['Projects','Projects/History','Library','Backups','Exports']){const dir=path.join(root,folder);fs.mkdirSync(dir,{recursive:true});if(!fs.realpathSync(dir).startsWith(real+path.sep))throw Error('Workspace folders must stay inside the workspace.');}const file=path.join(root,FILE);if(migrateMissing&&!fs.existsSync(file))migrate(root,file);return file;}
function validateRecord(row,value){if(row.scope==='decals'){require('./catalog.cjs').validateDecal(value);return;}if(row.scope==='catalog-fonts'){DM.validateLibrary([],value.fonts);return;}if(row.scope==='workspace')DM.validateWorkspace(value);else if(['projects','history'].includes(row.scope))sheet(value);else throw Error('Invalid saved record type.');}
function verifyAll(db){
 if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Database integrity check failed.');
 for(const row of db.prepare('SELECT * FROM documents').iterate()){
  if(hash(row.json)!==row.hash)throw Error('Saved document integrity check failed.');const document=JSON.parse(row.json);if(!Array.isArray(document.refs))throw Error('Invalid saved references.');
  const expectedAssets=[...new Set(document.refs.filter(r=>r.asset).map(r=>r.asset))].sort(),expectedDocuments=[...new Set(document.refs.filter(r=>r.document).map(r=>r.document))].sort();
  assert.deepEqual(db.prepare('SELECT asset FROM asset_links WHERE document=? ORDER BY asset').all(row.hash).map(r=>r.asset),expectedAssets,'Artwork reference index is damaged.');
  assert.deepEqual(db.prepare('SELECT child FROM document_links WHERE parent=? ORDER BY child').all(row.hash).map(r=>r.child),expectedDocuments,'Document reference index is damaged.');
 }
 for(const row of db.prepare('SELECT * FROM records').iterate()){const value=unpack(db,row.document);validateRecord(row,value);const m=JSON.parse(row.metadata);if(typeof m.name!=='string'||m.id!==(value.project?.id||value.decal?.id||row.key))throw Error('Invalid saved metadata.');}
 for(const row of db.prepare('SELECT hash,value FROM assets').iterate())if(hash(row.value)!==row.hash)throw Error('Asset integrity check failed.');
}
function token(db,row){return state(db,'identity')+':'+row.revision+':'+row.document;}
function workspaceRead(db){const row=db.prepare("SELECT * FROM records WHERE scope='workspace' AND key='current'").get();return{data:row?DM.validateWorkspace(unpack(db,row.document)):null,recovered:state(db,'recovered')==='true',stamp:row?token(db,row):state(db,'identity')+':empty',libraryCount:db.prepare("SELECT count(*) n FROM records WHERE scope='decals'").get().n,warnings:db.prepare('SELECT file,message FROM migration_issues').all()};}
function workspaceSave(db,{data,expected}){const valid=DM.validateWorkspace(data);valid.libraryMode='external';if(valid.library.length||valid.libraryFonts.length)throw Error('Autosave cannot replace the decal library.');if(Buffer.byteLength(JSON.stringify(valid))>MAX)throw Error('Workspace exceeds 160 MB. Export unused decals first.');return transaction(db,()=>{
 const old=db.prepare("SELECT * FROM records WHERE scope='workspace' AND key='current'").get();const stamp=old?token(db,old):state(db,'identity')+':empty';if(expected&&expected!==stamp)throw Error('Workspace changed in another session. Reopen Decals before saving.');
 const id=pack(db,valid);if(old?.document===id)return{stamp};
 for(let n=3;n>=1;n--){const previous=db.prepare("SELECT * FROM records WHERE scope='workspace' AND key=?").get(n===1?'current':`workspace-${n-1}.json`);if(previous){const revision=Number(state(db,'revision'))+1;setState(db,'revision',revision);db.prepare("INSERT INTO records VALUES('workspace',?,?,?,?) ON CONFLICT(scope,key) DO UPDATE SET document=excluded.document,metadata=excluded.metadata,revision=excluded.revision").run(`workspace-${n}.json`,previous.document,previous.metadata,revision);}}
 const row=put(db,'workspace','current',valid,meta(valid.project));setState(db,'recovered','false');return{stamp:token(db,row)};
 });}
function list(db,{scope='projects',projectId}={}){
 if(!['projects','history','workspace'].includes(scope))throw Error('Invalid project list.');let entries=db.prepare('SELECT * FROM records WHERE scope=?').all(scope).filter(r=>r.key!=='current').map(row=>({...JSON.parse(row.metadata),scope,file:row.key,stamp:token(db,row)}));
 if(scope==='history'&&projectId)entries=entries.filter(e=>e.id===projectId);
 if(scope==='projects')entries=[...entries.reduce((m,e)=>{const old=m.get(e.id);if(!old||e.modified>old.modified)m.set(e.id,e);return m;},new Map()).values()];
 entries.sort((a,b)=>b.recent.localeCompare(a.recent)||a.file.localeCompare(b.file));return{entries,unreadable:db.prepare('SELECT count(*) n FROM migration_issues WHERE scope=?').get(scope).n};
}
function read(db,{entry,remember=false}){if(!['projects','history','workspace'].includes(entry?.scope)||typeof entry.file!=='string'||entry.file!==path.basename(entry.file)||/[\\/:]/.test(entry.file))throw Error('Invalid project file.');const row=db.prepare('SELECT * FROM records WHERE scope=? AND key=?').get(entry.scope,entry.file);if(!row)throw Error('This saved sheet is unavailable. Refresh the library.');if(entry.stamp&&entry.stamp!==token(db,row))throw Error('This version changed. Refresh the library.');const data=unpack(db,row.document);validateRecord(row,data);if(remember)transaction(db,()=>{const m=JSON.parse(row.metadata);m.recent=new Date().toISOString();db.prepare('UPDATE records SET metadata=? WHERE scope=? AND key=?').run(JSON.stringify(m),entry.scope,entry.file);});if(entry.scope==='workspace'&&data.libraryFonts?.length){const used=DM.fontsFor(data.project.items,data.libraryFonts);data.project.fonts=[...new Map([...used,...data.project.fonts].map(f=>[f.family,f])).values()];DM.validateProject(data.project);}return{project:data.project,thumbnail:data.thumbnail||null,stamp:token(db,row),modified:JSON.parse(row.metadata).modified};}
function saveSheet(db,{project,thumbnail},failAt){const p=DM.validateProject(project),key=filename(p.id),data={format:'slotforge-decals-sheet',version:DM.fileVersion(p),project:p,thumbnail:typeof thumbnail==='string'&&thumbnail.length<2e6&&/^data:image\/png;base64,[A-Za-z\d+/=]+$/.test(thumbnail)?thumbnail:null};if(Buffer.byteLength(JSON.stringify(data))>MAX)throw Error('Project exceeds 160 MB.');
 if(db.prepare('SELECT 1 FROM migration_issues WHERE file=?').get(path.join('Projects',key)))throw Error('The original saved project is unreadable and has been kept. Recover it before replacing this sheet.');
 const previous=db.prepare("SELECT * FROM records WHERE scope='projects' AND key=?").get(key);
 if(previous){const old=sheet(unpack(db,previous.document));if(JSON.stringify(old.project)!==JSON.stringify(p))put(db,'history',key.slice(0,-8)+'-'+crypto.randomUUID()+'.sfsheet',old,meta(old.project));else if(old.thumbnail===data.thumbnail)return{name:key,file:key};}
 if(failAt)throw Error('Injected write failure');put(db,'projects',key,data,meta(p));return{name:key,file:key};
}
function stats(db,file){return{bytes:fs.statSync(file).size,assets:db.prepare('SELECT count(*) n FROM assets').get().n,assetBytes:db.prepare('SELECT coalesce(sum(length(value)),0) n FROM assets').get().n,decals:db.prepare("SELECT count(*) n FROM records WHERE scope='decals'").get().n,sheets:db.prepare("SELECT count(DISTINCT json_extract(metadata,'$.id')) n FROM records WHERE scope='projects'").get().n,history:db.prepare("SELECT count(*) n FROM records WHERE scope='history'").get().n};}
function backup(db,file,destination){
 destination=path.resolve(destination);if(!destination.endsWith('.sfdbbackup')||destination===path.resolve(file))throw Error('Choose a separate .sfdbbackup file.');
 if(fs.existsSync(destination)&&(!fs.lstatSync(destination).isFile()||fs.lstatSync(destination).isSymbolicLink()))throw Error('Choose a regular backup file.');
 const temp=destination+'.'+crypto.randomUUID()+'.tmp';
 try{db.prepare('VACUUM INTO ?').run(temp);const copy=connection(temp);try{verifyAll(copy);}finally{copy.close();}fs.renameSync(temp,destination);return destination;}finally{try{fs.unlinkSync(temp);}catch{}}
}
function restore(root,source){
 source=path.resolve(source);const file=path.join(root,FILE);if(source===path.resolve(file))throw Error('Choose a separate backup file.');
 // Copy a consistent snapshot first. Never attach an unverified or changing input.
 const input=connection(source),staging=path.join(root,'restore-'+crypto.randomUUID()+'.sfdbbackup');
 try{verifyAll(input);backup(input,source,staging);}finally{input.close();}
 try{const stagedUpgrade=connection(staging);try{require('./catalog.cjs').upgrade(stagedUpgrade,staging,false);}finally{stagedUpgrade.close();}if(!fs.existsSync(file)){const staged=connection(staging);let loaded;try{transaction(staged,()=>setState(staged,'identity',crypto.randomUUID()));loaded=workspaceRead(staged);}finally{staged.close();}fs.linkSync(staging,file);return{...loaded,recovery:null};}let current;try{current=connection(file);verifyAll(current);}catch(error){
  try{current?.close();}catch{}
  if(['-journal','-wal','-shm'].some(suffix=>fs.existsSync(file+suffix)))throw Error('The damaged database has recovery journal files. Keep these files together for recovery before restoring.');
  const recovery=path.join(root,'Backups','damaged-database-'+crypto.randomUUID()+'.sqlite');fs.copyFileSync(file,recovery,fs.constants.COPYFILE_EXCL);const fd=fs.openSync(recovery,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(staging,file);const restored=connection(file);try{transaction(restored,()=>setState(restored,'identity',crypto.randomUUID()));return{...workspaceRead(restored),recovery};}finally{restored.close();}
 }try{
 const expected=state(current,'identity')+':'+state(current,'revision'),recovery=path.join(root,'Backups','before-restore-'+crypto.randomUUID()+'.sfdbbackup');backup(current,file,recovery);
 current.prepare('ATTACH DATABASE ? AS incoming').run(staging);
 transaction(current,()=>{if(state(current,'identity')+':'+state(current,'revision')!==expected)throw Error('Workspace changed during restore. Try again.');
 current.exec('DELETE FROM records; DELETE FROM document_links; DELETE FROM asset_links; DELETE FROM documents; DELETE FROM assets; DELETE FROM migration_issues; DELETE FROM state; INSERT INTO assets SELECT * FROM incoming.assets; INSERT INTO documents SELECT * FROM incoming.documents; INSERT INTO document_links SELECT * FROM incoming.document_links; INSERT INTO asset_links SELECT * FROM incoming.asset_links; INSERT INTO records SELECT * FROM incoming.records; INSERT INTO migration_issues SELECT * FROM incoming.migration_issues; INSERT INTO state SELECT * FROM incoming.state; PRAGMA user_version=2;');require('./catalog.cjs').indexes(current);setState(current,'identity',crypto.randomUUID());});
 return{...workspaceRead(current),recovery};
 }finally{current.close();}}finally{try{fs.unlinkSync(staging);}catch{}}
}
function execute(root,method,args={}){const file=initialize(root,method!=='restore');if(method==='restore')return restore(root,args.source);const db=connection(file);try{
 const catalog=require('./catalog.cjs');catalog.upgrade(db,file);if(method.startsWith('catalog-'))return catalog.execute(db,method.slice(8),args);if(method==='legacy-restore')return catalog.restoreLegacy(db,file,args);if(method==='legacy-export')return catalog.exportLegacy(db,args);
 switch(method){case 'load':return workspaceRead(db);case 'save':return workspaceSave(db,args);case 'list':return list(db,args);case 'read':return read(db,args);case 'saveSheet':return transaction(db,()=>saveSheet(db,args));case 'import':return transaction(db,()=>{if(!Array.isArray(args)||!args.length||args.length>100)throw Error('Import 1–100 sheets at a time.');if(Buffer.byteLength(JSON.stringify(args))>MAX)throw Error('Sheet import exceeds 160 MB.');return args.map(p=>{const project=DM.validateProject(p);project.id=crypto.randomUUID();project.added=new Date().toISOString();saveSheet(db,{project});return{id:project.id,name:project.name};});});case 'stats':return stats(db,file);case 'verify':verifyAll(db);return true;case 'backup':return backup(db,file,args.destination);default:throw Error('Unknown storage operation.');}
 }finally{db.close();}}
module.exports={execute,connection,initialize,verifyAll,pack,unpack,transaction,put,workspaceRead,workspaceSave,saveSheet,FILE,APP,VERSION,hash,token,state,setState,backup,read,list,meta};
