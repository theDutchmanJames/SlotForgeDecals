'use strict';
const path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const DM=require('../renderer/model.js'),SheetFiles=require('../renderer/sheet-files.js'),S=require('./sqlite-store.cjs');
const MAX=160e6,PAGE=60;
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase();
function indexMetadata(m){return {...m,sortName:normalize(m.name).replace(/\d+/g,n=>n.padStart(20,'0')),search:normalize([m.name,m.tags,m.creator].filter(Boolean).join(' '))};}
function indexes(db){db.exec(`CREATE INDEX IF NOT EXISTS catalog_name ON records(scope,json_extract(metadata,'$.sortName'),key);
 CREATE INDEX IF NOT EXISTS catalog_added ON records(scope,json_extract(metadata,'$.added'),key);
 CREATE INDEX IF NOT EXISTS catalog_updated ON records(scope,json_extract(metadata,'$.updated'),key);
 CREATE INDEX IF NOT EXISTS catalog_identity ON records(scope,json_extract(metadata,'$.id'),json_extract(metadata,'$.modified'),key);`);}
function validateDecal(value){if(!value?.decal)throw Error('Invalid saved decal.');const valid=DM.validateLibrary([value.decal],value.fonts||[]);return{decal:valid.library[0],fonts:valid.libraryFonts};}
function decalMeta(d){return{id:d.id,name:d.name,tags:d.tags,creator:d.creator,scale:d.scale,w:d.art.w,h:d.art.h,kind:d.art.kind,artworkType:DM.artworkType(d.art),added:d.added,updated:d.updated};}
function writeDecal(db,value){const v=validateDecal(value);if(Buffer.byteLength(JSON.stringify(v))>MAX)throw Error('Decal exceeds 160 MB.');return S.put(db,'decals',v.decal.id,v,decalMeta(v.decal));}
function count(db){return db.prepare("SELECT count(*) n FROM records WHERE scope='decals'").get().n;}
function lean(data){const result=DM.validateWorkspace({...data,library:[],libraryFonts:[],libraryMode:'external'});return result;}
function replace(db,data){
 if(data.library.length>1000)throw Error('Legacy workspace backups support up to 1,000 decals. Use a complete database backup for larger libraries.');
 db.exec("DELETE FROM records WHERE scope IN ('decals','catalog-fonts')");
 const ids=new Set();for(const entry of data.library){const d=DM.clone(entry);if(ids.has(d.id))d.id=crypto.randomUUID();ids.add(d.id);const value={decal:d,fonts:DM.fontsFor([d.art],data.libraryFonts)},row=writeDecal(db,value);assert.deepEqual(S.unpack(db,row.document),validateDecal(value),'Decal migration verification failed.');}
 // Retain imported legacy fonts even when no current decal uses one.
 if(data.libraryFonts.length)S.put(db,'catalog-fonts','legacy',{fonts:data.libraryFonts},{id:'legacy',name:'Retained library fonts'});
 const p=DM.clone(data.project),used=DM.fontsFor(p.items,data.libraryFonts);p.fonts=[...new Map([...used,...p.fonts].map(f=>[f.family,f])).values()];return lean({...data,project:p});
}
function upgrade(db,file,keepBackup=true){
 if(db.prepare('PRAGMA user_version').get().user_version===2)return;
 if(keepBackup)S.backup(db,file,path.join(path.dirname(file),'Backups','before-library-upgrade-'+crypto.randomUUID()+'.sfdbbackup'));
 S.transaction(db,()=>{
  const current=db.prepare("SELECT * FROM records WHERE scope='workspace' AND key='current'").get();
  if(current){const original=DM.validateWorkspace(S.unpack(db,current.document)),data=replace(db,original);S.put(db,'workspace','current',data,JSON.parse(current.metadata));assert.equal(count(db),original.library.length);}
  for(const row of db.prepare('SELECT scope,key,metadata FROM records').all())db.prepare('UPDATE records SET metadata=? WHERE scope=? AND key=?').run(JSON.stringify(indexMetadata(JSON.parse(row.metadata))),row.scope,row.key);
  indexes(db);db.exec('PRAGMA user_version=2');
 });
}
function rowMeta(db,row){return{...JSON.parse(row.metadata),scope:row.scope,file:row.key,stamp:S.token(db,row)};}
function query(db,args={}){
 const {scope='decals',search='',sort='added',filter='all',projectId,excludeId}=args;
 if(!['decals','projects','history','workspace'].includes(scope))throw Error('Invalid library.');
 const limit=args.limit??48,offset=args.offset??0;if(!Number.isInteger(limit)||limit<1||limit>PAGE||!Number.isInteger(offset)||offset<0||offset>1e7)throw Error('Invalid library page.');
 const fields={name:"json_extract(metadata,'$.sortName') ASC",'name-desc':"json_extract(metadata,'$.sortName') DESC",added:"json_extract(metadata,'$.added') DESC",updated:"json_extract(metadata,'$.updated') DESC",recent:"json_extract(metadata,'$.recent') DESC"};if(!fields[sort])throw Error('Invalid library order.');
 const params=[scope],where=['scope=?'];
 if(scope==='workspace')where.push("key<>'current'");
 if(scope==='projects')where.push("NOT EXISTS (SELECT 1 FROM records newer WHERE newer.scope='projects' AND json_extract(newer.metadata,'$.id')=json_extract(records.metadata,'$.id') AND (json_extract(newer.metadata,'$.modified')>json_extract(records.metadata,'$.modified') OR (json_extract(newer.metadata,'$.modified')=json_extract(records.metadata,'$.modified') AND newer.key>records.key)))");
 if(excludeId){where.push("json_extract(metadata,'$.id')<>?");params.push(String(excludeId));}
 if(args.id){where.push("json_extract(metadata,'$.id')=?");params.push(String(args.id));}
 if(projectId){where.push("json_extract(metadata,'$.id')=?");params.push(String(projectId));}
 if(typeof search!=='string'||search.length>500)throw Error('Search is too long.');
 if(search){where.push("json_extract(metadata,'$.search') LIKE ? ESCAPE '\\'");params.push('%'+normalize(search).replace(/[\\%_]/g,'\\$&')+'%');}
 if(scope==='decals'&&filter!=='all'){
  if(filter==='svg')where.push("json_extract(metadata,'$.artworkType') NOT IN ('Raster','Mixed raster / vector')");
  else if(filter==='image')where.push("json_extract(metadata,'$.artworkType') IN ('Raster','Mixed raster / vector')");
  else if(filter==='group')where.push("json_extract(metadata,'$.kind')='group'");else throw Error('Invalid library filter.');
 }
 const clause=where.join(' AND '),total=db.prepare('SELECT count(*) n FROM records WHERE '+clause).get(...params).n;
 const rows=db.prepare(`SELECT key,scope,metadata,revision,document FROM records WHERE ${clause} ORDER BY ${fields[sort]},key ASC LIMIT ? OFFSET ?`).all(...params,limit,offset);
 return{entries:rows.map(r=>rowMeta(db,r)),total,offset,limit,libraryCount:count(db),identity:S.state(db,'identity'),unreadable:db.prepare('SELECT count(*) n FROM migration_issues WHERE scope=?').get(scope).n};
}
function decalRow(db,entry){const id=typeof entry==='string'?entry:entry?.id;if(typeof id!=='string'||id.length>1000)throw Error('Invalid decal identity.');const row=db.prepare("SELECT * FROM records WHERE scope='decals' AND key=?").get(id);if(!row)throw Error('This decal is no longer in the library. Refresh the library.');if(entry?.stamp&&entry.stamp!==S.token(db,row))throw Error('This decal changed. Refresh the library before using it.');return row;}
function readDecal(db,entry){const row=decalRow(db,entry);return{...validateDecal(S.unpack(db,row.document)),entry:rowMeta(db,row)};}
function save(db,args){return S.transaction(db,()=>{
 const value=validateDecal(args),id=value.decal.id;
 if(args.expected){const row=decalRow(db,{id,stamp:args.expected});value.decal.added=JSON.parse(row.metadata).added;}
 else{if(db.prepare("SELECT 1 FROM records WHERE scope='decals' AND key=?").get(id))throw Error('This decal already exists. Refresh before updating it.');if(count(db)>=DM.LIMITS.library)throw Error('The library limit is 10,000 decals. Remove a saved decal before adding another.');}
 value.decal.updated=new Date().toISOString();value.decal.added=value.decal.added||value.decal.updated;
 return rowMeta(db,writeDecal(db,value));
});}
function importDecals(db,args){
 if(!Array.isArray(args.decals)||!args.decals.length||args.decals.length>500)throw Error('Import 1–500 decals at a time.');if(Buffer.byteLength(JSON.stringify(args))>MAX)throw Error('Import exceeds 160 MB.');
 const valid=DM.validateLibrary(args.decals,args.fonts||[]);
 return S.transaction(db,()=>{if(count(db)+valid.library.length>DM.LIMITS.library)throw Error('The library limit is 10,000 decals. Remove saved decals before importing this pack.');return valid.library.map(d=>{d.id=crypto.randomUUID();d.added=d.updated=new Date().toISOString();return rowMeta(db,writeDecal(db,{decal:d,fonts:DM.fontsFor([d.art],valid.libraryFonts)}));});});
}
function mergeFonts(target,incoming){for(const font of incoming){const previous=target.get(font.family);if(previous&&previous.data!==font.data)throw Error('Selected artwork uses different fonts with the same internal name. Export those items separately.');target.set(font.family,font);}if(target.size>30)throw Error('A portable file supports up to 30 embedded fonts. Export fewer items.');}
function checkedJSON(value){const body=JSON.stringify(value);if(Buffer.byteLength(body)>MAX)throw Error('Export exceeds 160 MB. Select fewer items or use a complete backup.');return body;}
function exportSelected(db,{kind,entries,current}){
 const max=kind==='decals'?500:100;if(!['decals','sheets'].includes(kind)||!Array.isArray(entries)||!entries.length||entries.length>max)throw Error('Select 1–'+max+' items per export.');
 const values=[],fonts=new Map();let bytes=0;
 for(const entry of entries){let value;if(kind==='decals'){const result=readDecal(db,entry);value=result.decal;mergeFonts(fonts,result.fonts);}else{const p=entry.current?DM.validateProject(current):S.read(db,{entry}).project;value=SheetFiles.pages(p,entry.pagesSelected||Array.from({length:p.pages},(_,n)=>n));}
  bytes+=Buffer.byteLength(JSON.stringify(value));if(bytes>MAX)throw Error('Export exceeds 160 MB. Select fewer items.');values.push(value);
 }
 return checkedJSON(kind==='decals'?DM.pack(values,[...fonts.values()]):SheetFiles.pack(values));
}
function exportLegacy(db,{data}){
 if(count(db)>1000)throw Error('Legacy workspace backups support up to 1,000 decals. Use Export Complete Backup for your full library.');
 const result=lean(data),fonts=new Map();delete result.libraryMode;let bytes=Buffer.byteLength(JSON.stringify(result));
 const retained=db.prepare("SELECT document FROM records WHERE scope='catalog-fonts' AND key='legacy'").get();if(retained)mergeFonts(fonts,S.unpack(db,retained.document).fonts);
 for(const row of db.prepare("SELECT * FROM records WHERE scope='decals' ORDER BY key").iterate()){const value=validateDecal(S.unpack(db,row.document));bytes+=Buffer.byteLength(JSON.stringify(value));if(bytes>MAX)throw Error('Legacy backup exceeds 160 MB. Use Export Complete Backup.');result.library.push(value.decal);mergeFonts(fonts,value.fonts);}
 result.libraryFonts=[...fonts.values()];return checkedJSON(result);
}
function restoreLegacy(db,file,{data,expected}){
 const valid=DM.validateWorkspace(data);if(valid.library.length>1000||Buffer.byteLength(JSON.stringify(valid))>MAX)throw Error('Legacy backup exceeds supported limits.');
 S.backup(db,file,path.join(path.dirname(file),'Backups','before-workspace-restore-'+crypto.randomUUID()+'.sfdbbackup'));
 return S.transaction(db,()=>{const clean=replace(db,valid);/* workspaceSave owns its own transaction; perform the writes here. */
  const old=db.prepare("SELECT * FROM records WHERE scope='workspace' AND key='current'").get();if(expected&&expected!==(old?S.token(db,old):S.state(db,'identity')+':empty'))throw Error('Workspace changed. Reopen before restoring.');
  S.put(db,'workspace','current',clean,S.meta(clean.project));return S.workspaceRead(db);
 });
}
function execute(db,method,args){switch(method){case 'query':return query(db,args);case 'read':return readDecal(db,args);case 'save':return save(db,args);case 'import':return importDecals(db,args);case 'delete':return S.transaction(db,()=>{const row=decalRow(db,args);if(!args.stamp)throw Error('Refresh before deleting a decal.');db.prepare("DELETE FROM records WHERE scope='decals' AND key=?").run(row.key);return true;});case 'export':return exportSelected(db,args);default:throw Error('Unknown library operation.');}}
module.exports={execute,upgrade,indexes,indexMetadata,validateDecal,query,readDecal,exportLegacy,restoreLegacy};
