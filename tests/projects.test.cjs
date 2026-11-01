const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),DM=require('../renderer/model.js'),{Projects}=require('../src/projects.cjs'),{Workspace}=require('../src/storage.cjs');
async function setup(t){const parent=path.resolve(__dirname,'../test-output');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'projects-'));t.after(()=>fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100}));return{dir,store:new Projects(dir)};}
test('project saves are serialized, versioned and discoverable across restarts',async t=>{
 const {dir,store}=await setup(t),p=DM.project('Club decals');p.items=[DM.item('rect')];const old=DM.clone(p);
 await store.save({project:p});p.items[0].w=40;
 await Promise.all([store.save({project:p}),store.save({project:p})]);
 const list=await new Projects(dir).list();assert.equal(list.entries.length,1);assert.equal(list.entries[0].name,'Club decals');assert.equal((await store.read(list.entries[0])).project.items[0].w,40);
 const versions=await store.list({scope:'history',projectId:p.id});assert.equal(versions.entries.length,1);assert.deepEqual((await store.read(versions.entries[0])).project,old);
 const q=DM.project('Other');await store.save({project:q});await store.read(list.entries[0],{remember:true});assert.equal((await new Projects(dir).list()).entries[0].name,'Club decals');
});
test('legacy files and duplicate IDs are handled without overwriting unreadable files',async t=>{
 const {dir,store}=await setup(t);await store.init();const p=DM.project('Legacy file');await fs.writeFile(path.join(dir,'Projects','old.sfsheet'),JSON.stringify({format:'slotforge-decals-sheet',version:1,project:p}));
 await fs.writeFile(path.join(dir,'Projects','bad.sfsheet'),'{broken');
 let list=await store.list();assert.equal(list.entries.length,1);assert.equal(list.unreadable,1);await store.save({project:p});list=await store.list();assert.equal(list.entries.length,1);
 const saved=await store.save({project:p}),file=path.join(dir,'Projects',saved.file);await fs.writeFile(file,'{broken');
 await assert.rejects(store.save({project:p}));assert.equal(await fs.readFile(file,'utf8'),'{broken');assert.ok(await fs.stat(path.join(dir,'Projects','old.sfsheet')));
});
test('stale snapshots, traversal and missing files cannot open another project',async t=>{
 const {store}=await setup(t),p=DM.project('Safe');p.id='../outside';await store.save({project:p});const entry=(await store.list()).entries[0];
 p.name='Changed and longer';await store.save({project:p});await assert.rejects(store.read(entry),/changed/);
 for(const file of ['../workspace.json','..\\workspace.json','C:\\outside.sfsheet','x.sfsheet:stream'])await assert.rejects(store.read({scope:'projects',file}));
 await assert.rejects(store.read({scope:'other',file:'a.sfsheet'}));assert.equal((await store.list()).entries[0].name,p.name);
});
test('workspace recovery reads sheet data and rejects rotated backup tokens',async t=>{
 const {dir,store}=await setup(t),ws=new Workspace(dir),p=DM.project('First');
 const data={format:'slotforge-decals-workspace',version:1,project:p,library:[]};await ws.save(data);await ws.save({...data,project:{...p,name:'Second'}});
 const entry=(await store.list({scope:'workspace'})).entries[0],snapshot=await store.read(entry);assert.equal(snapshot.project.name,'First');
 await ws.save({...data,project:{...p,name:'Third'}});await assert.rejects(store.read(entry),/changed/);assert.equal(snapshot.project.name,'First');
});
