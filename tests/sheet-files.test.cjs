const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const DM=require('../renderer/model.js'),Sheets=require('../renderer/sheet-files.js'),{Projects}=require('../src/projects.cjs');
test('sheet collections retain independent settings, fonts and editable nested artwork; legacy files still open',()=>{
 const a=DM.project('A'),b=DM.project('B');a.pages=3;a.pageSize='a5';b.scale=43;b.whiteInk=true;
 a.fonts=[{family:'sf-font-number',data:'data:font/ttf;base64,AAAA'},{family:'sf-font-unused',data:'data:font/ttf;base64,AAAA'}];
 const child=DM.item('text',{font:'sf-font-number',text:'27',page:0});
 a.items=[DM.item('rect',{page:0}),DM.item('slice',{page:2,x:22,y:31,w:10,h:10,baseW:10,baseH:10,children:[child]})];
 Object.assign(a,DM.validateProject(a));const snapshot=DM.clone(a),file=Sheets.pack([a,b]);assert.deepEqual(Sheets.read(JSON.parse(JSON.stringify(file))),[a,b]);
 assert.deepEqual(Sheets.read(Sheets.pack([a])),[a]);assert.equal(Sheets.pack([a]).version,2);assert.equal(Sheets.pack([b]).version,1);
 const selected=Sheets.pages(a,[2,1,2]);assert.equal(selected.pages,2);assert.equal(selected.items.length,1);assert.deepEqual(selected.items[0],{...a.items[1],page:1});assert.equal(selected.fonts.length,1);assert.deepEqual(a,snapshot);
 assert.deepEqual(Sheets.pages(a,[0,1,2]),a);for(const pages of [[],[-1],[3],[.5],['1']])assert.throws(()=>Sheets.pages(a,pages));
 for(const raw of [{...file,version:99},{...file,sheets:[]},{...file,sheets:[{project:b},{project:{}}]},{...file,sheets:Array(101).fill({project:b})}])assert.throws(()=>Sheets.read(raw));
 const unknown=DM.validateProject({...b,added:{toString:'invalid'},updated:'not a date'});assert.equal(unknown.added,null);assert.equal(unknown.updated,null);
});
test('batch sheet import is independent, persistent and rolls back a failed batch',async t=>{
 const parent=path.resolve(__dirname,'../test-output');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'sheet-import-'));t.after(()=>fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 const store=new Projects(dir),p=DM.project('Original');p.items=[DM.item('rect')];await store.save({project:p});
 const before=(await store.list()).entries[0],original=await store.read(before);
 const imported=await store.importMany([p,p]);assert.equal(new Set([p.id,...imported.map(p=>p.id)]).size,3);
 assert.equal((await new Projects(dir).list()).entries.length,3);assert.deepEqual(await store.read(before),original);
 const snapshot=(await store.list()).entries;await assert.rejects(store.importMany([p,{items:null}]));assert.deepEqual((await store.list()).entries,snapshot);
});
