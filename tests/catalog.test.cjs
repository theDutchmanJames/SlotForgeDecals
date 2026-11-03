const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),S=require('../src/sqlite-store.cjs'),D=require('../renderer/model');
function fixture(t){fs.mkdirSync('test-output',{recursive:true});const root=fs.mkdtempSync(path.resolve('test-output/catalog-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5}));return{root,run:(method,args)=>S.execute(root,method,args)};}
const snapshot=()=>({format:'slotforge-decals-workspace',version:1,libraryMode:'external',project:D.project('Current sheet'),library:[],libraryFonts:[],settings:{theme:'dark'}});
const decal=(n,art=D.item('rect'))=>({id:'decal-'+n,name:'Decal '+n,tags:n%2?'Team red':'Team blue',scale:32,art,added:'2026-01-01T00:00:00Z',updated:'2026-01-01T00:00:00Z'});
test('upgrade splits v1 library, preserves originals and leaves a verified pre-upgrade backup',t=>{
 const {root,run}=fixture(t),original={...snapshot(),library:[decal(1),decal(1)],libraryFonts:[]};delete original.libraryMode;const bytes=JSON.stringify(original);fs.writeFileSync(path.join(root,'workspace.json'),bytes);
 const loaded=run('load');assert.equal(loaded.libraryCount,2);assert.deepEqual(loaded.data.library,[]);assert.equal(loaded.data.libraryMode,'external');assert.equal(fs.readFileSync(path.join(root,'workspace.json'),'utf8'),bytes);
 const entries=run('catalog-query').entries;assert.equal(new Set(entries.map(e=>e.id)).size,2);assert.deepEqual(entries.map(e=>run('catalog-read',e).decal.art.id).sort(),original.library.map(e=>e.art.id).sort());
 const backup=fs.readdirSync(path.join(root,'Backups')).find(n=>n.startsWith('before-library-upgrade-'));assert(backup);const db=S.connection(path.join(root,'Backups',backup));try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,1);S.verifyAll(db);}finally{db.close();}assert(run('verify'));
});
test('queries page metadata only, search tags literally, sort naturally and filter artwork',t=>{
 const {run}=fixture(t);run('catalog-import',{decals:Array.from({length:140},(_,n)=>decal(n)),fonts:[]});
 const a=run('catalog-query',{sort:'name',limit:48}),b=run('catalog-query',{sort:'name',limit:48,offset:48});assert.equal(a.total,140);assert.equal(a.entries[2].name,'Decal 2');assert.equal(b.entries[0].name,'Decal 48');assert.equal(new Set([...a.entries,...b.entries].map(e=>e.id)).size,96);assert(a.entries.every(e=>!e.art&&!e.fonts&&!e.thumbnail));
 assert.equal(run('catalog-query',{search:'TEAM RED'}).total,70);assert.equal(run('catalog-query',{search:'%'}).total,0);assert.equal(run('catalog-query',{filter:'image'}).total,0);assert.throws(()=>run('catalog-query',{limit:61}),/page/);assert.throws(()=>run('catalog-query',{sort:'DROP TABLE records'}),/order/);
});
test('autosave cannot overwrite the library, and updates/deletes require current record stamps',t=>{
 const {run}=fixture(t),saved=run('catalog-save',{decal:decal(1),fonts:[]}),value=run('catalog-read',saved),data=snapshot();run('save',{data});data.project.name='Edited';run('save',{data});assert.equal(run('load').libraryCount,1);assert.throws(()=>run('save',{data:{...data,library:[decal(2)]}}),/Autosave/);assert.equal(run('catalog-query').total,1);
 const updated=run('catalog-save',{...value,decal:{...value.decal,name:'New name'},expected:saved.stamp});assert.throws(()=>run('catalog-read',saved),/changed/);assert.throws(()=>run('catalog-delete',saved),/changed/);assert.throws(()=>run('catalog-save',{...value,expected:saved.stamp}),/changed/);run('catalog-delete',updated);assert.equal(run('load').libraryCount,0);
});
test('failed imports are atomic and selected exports preserve artwork and required fonts',t=>{
 const {run}=fixture(t),font={family:'sf-font-test',data:'data:font/ttf;base64,AAAA'},art=D.item('text',{font:font.family,text:'27'});const a=run('catalog-save',{decal:decal(1,art),fonts:[font]});assert.throws(()=>run('catalog-import',{decals:[decal(2),{art:null}],fonts:[]}));assert.equal(run('catalog-query').total,1);
 const pack=JSON.parse(run('catalog-export',{kind:'decals',entries:[a]}));assert.equal(pack.decals[0].art.text,'27');assert.deepEqual(pack.fonts,[font]);assert.equal(D.readPack(pack).decals.length,1);
 const project=snapshot().project;project.pages=2;project.items=[D.item('rect',{page:0}),D.item('ellipse',{page:1})];const sheets=JSON.parse(run('catalog-export',{kind:'sheets',entries:[{current:true,pagesSelected:[1]}],current:project}));assert.equal(sheets.project.pages,1);assert.equal(sheets.project.items[0].kind,'ellipse');
});
test('10,000 decals stay out of startup and autosave payloads, survive backup and enforce the limit',t=>{
 const {root,run}=fixture(t);const src='data:image/png;base64,'+Buffer.alloc(1024,42).toString('base64'),art=D.item('image',{src,pixelsW:10,pixelsH:10});
 for(let n=0;n<20;n++)run('catalog-import',{decals:Array.from({length:500},(_,i)=>decal(n*500+i,art)),fonts:[]});
 const data=snapshot();run('save',{data});const loaded=run('load');assert.equal(loaded.libraryCount,10000);assert(Buffer.byteLength(JSON.stringify(loaded))<10000);assert.equal(loaded.data.library.length,0);
 const last=run('catalog-query',{sort:'name',offset:9984,limit:48});assert.equal(last.entries.length,16);assert.equal(last.entries.at(-1).name,'Decal 9999');assert.equal(run('catalog-read',last.entries[0]).decal.art.src,src);
 assert.throws(()=>run('catalog-save',{decal:decal('overflow'),fonts:[]}),/10,000/);const first=run('catalog-read',run('catalog-query').entries[0]);run('catalog-save',{...first,expected:first.entry.stamp});assert.equal(run('load').libraryCount,10000);
 assert.throws(()=>run('legacy-export',{data}),/Complete Backup/);const destination=path.join(root,'all.sfdbbackup');run('backup',{destination});run('catalog-delete',run('catalog-query').entries[0]);assert.equal(run('load').libraryCount,9999);run('restore',{source:destination});assert.equal(run('load').libraryCount,10000);assert(run('verify'));
});

test('a failed v1 split rolls back and its complete backup restores with every original decal',t=>{
 const {root,run}=fixture(t),font={family:'sf-font-kept',data:'data:font/ttf;base64,AAAA'},original={...snapshot(),library:[decal(1,D.item('text',{font:font.family})),decal(2)],libraryFonts:[font]};delete original.libraryMode;
 fs.writeFileSync(path.join(root,'workspace.json'),JSON.stringify(original));S.initialize(root);const put=S.put;let writes=0;
 try{S.put=(db,scope,...args)=>{if(scope==='decals'&&++writes===2)throw Error('Injected catalog write failure');return put(db,scope,...args);};assert.throws(()=>run('load'),/Injected/);}finally{S.put=put;}
 const db=S.connection(path.join(root,S.FILE));try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,1);assert.equal(db.prepare("SELECT count(*) n FROM records WHERE scope='decals'").get().n,0);assert.equal(S.workspaceRead(db).data.library.length,2);S.verifyAll(db);}finally{db.close();}
 const oldBackup=path.join(root,'Backups',fs.readdirSync(path.join(root,'Backups')).find(n=>n.startsWith('before-library-upgrade-')));
 run('load');run('catalog-delete',run('catalog-query').entries[0]);assert.equal(run('load').libraryCount,1);const restored=run('restore',{source:oldBackup});assert.equal(restored.libraryCount,2);assert.deepEqual(restored.data.library,[]);
 const pack=JSON.parse(run('legacy-export',{data:restored.data}));assert.deepEqual(pack.libraryFonts,[font]);assert.deepEqual(pack.library.map(d=>d.art).sort((a,b)=>a.id.localeCompare(b.id)),original.library.map(d=>D.validateItem(d.art)).sort((a,b)=>a.id.localeCompare(b.id)));assert(run('verify'));
});
test('legacy export includes unsaved edits and restore keeps recovery metadata and rejects stale writes',t=>{
 const {root,run}=fixture(t),data=snapshot();run('save',{data});run('catalog-save',{decal:decal(1),fonts:[]});data.project.name='Unsaved name';const backup=JSON.parse(run('legacy-export',{data}));assert.equal(backup.project.name,'Unsaved name');assert.equal(backup.library.length,1);assert(!backup.libraryMode);
 const stale=run('load').stamp;data.project.name='Newer';run('save',{data});assert.throws(()=>run('legacy-restore',{data:backup,expected:stale}),/changed/);assert.equal(run('load').data.project.name,'Newer');assert.equal(run('load').libraryCount,1);
 const restored=run('legacy-restore',{data:backup,expected:run('load').stamp});assert.equal(restored.data.project.name,'Unsaved name');assert.equal(restored.libraryCount,1);assert(restored.data.libraryMode);run('save',{data:{...restored.data,project:{...restored.data.project,name:'After restore'}}});const recovery=run('catalog-query',{scope:'workspace'}).entries.find(e=>e.name==='Unsaved name');assert.equal(recovery.pages,1);assert.equal(recovery.count,0);assert(recovery.updated);assert(fs.readdirSync(path.join(root,'Backups')).some(n=>n.startsWith('before-workspace-restore-')));assert(run('verify'));
});
test('selected decal exports reject font name collisions without changing originals',t=>{
 const {run}=fixture(t),font={family:'sf-font-same',data:'data:font/ttf;base64,AAAA'},other={...font,data:'data:font/ttf;base64,BBBB'},art=D.item('text',{font:font.family});const a=run('catalog-save',{decal:decal(1,art),fonts:[font]}),b=run('catalog-save',{decal:decal(2,art),fonts:[other]});assert.throws(()=>run('catalog-export',{kind:'decals',entries:[a,b]}),/different fonts/);assert.deepEqual(run('catalog-read',a).fonts,[font]);assert.deepEqual(run('catalog-read',b).fonts,[other]);
});

test('legacy workspace recovery attaches the embedded fonts used by its sheet',t=>{
 const {root,run}=fixture(t),font={family:'sf-font-recovery',data:'data:font/ttf;base64,AAAA'},data=snapshot();data.libraryFonts=[font];data.project.items=[D.item('text',{font:font.family,text:'Recover me'})];delete data.libraryMode;
 fs.mkdirSync(path.join(root,'Backups'));fs.writeFileSync(path.join(root,'Backups','workspace-1.json'),JSON.stringify(data));fs.writeFileSync(path.join(root,'workspace.json'),JSON.stringify(snapshot()));run('load');const entry=run('catalog-query',{scope:'workspace'}).entries[0];assert.deepEqual(run('read',{entry}).project.fonts,[font]);assert.equal(run('read',{entry}).project.items[0].text,'Recover me');
});
