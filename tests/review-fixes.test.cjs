const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),DM=require('../renderer/model.js'),{Workspace}=require('../src/storage.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('pointer resizing respects both dimension limits and scaled outlines',()=>{
 const line=DM.item('line',{w:40,h:1});const small=DM.resizeDimensions(line,2,.05);near(small.w,4);near(small.h,.1);near(small.w/small.h,40);DM.validateItem({...line,...small});
 const outlined=DM.item('rect',{w:20,h:10,strokeWidth:5});const large=DM.resizeDimensions(outlined,500,250);near(large.w,200);near(large.h,100);near(large.strokeWidth,50);DM.validateItem({...outlined,...large});
 for(const proportional of [true,false])for(const [w,h]of [[-10,-20],[10000,10000],[.001,.001]])DM.validateItem({...line,...DM.resizeDimensions(line,w,h,proportional)});
});
test('bounds include nested overflow through rotation, mirroring and nonuniform scales',()=>{
 const child=DM.item('rect',{x:20,y:0,w:10,h:10}),g=DM.item('group',{x:195,y:20,w:10,h:10,baseW:10,baseH:10,children:[child]});
 assert.deepEqual(DM.bounds(g),{x:195,y:20,w:30,h:10});const p=DM.project();p.items=[g];assert.ok(DM.warnings(p).some(w=>w.type==='margin'));assert.ok(DM.intersectsSelection(g,{x:215,y:20,w:1,h:1}));
 const arranged=DM.arrange(p);assert.deepEqual(DM.warnings(arranged),[]);near(DM.bounds(arranged.items[0]).x,5);assert.equal(arranged.items[0].children[0].x,20);
 const outer=DM.item('group',{x:0,y:0,w:20,h:30,baseW:10,baseH:10,rotation:90,flipX:true,children:[{...g,x:0,y:0}]});const b=DM.bounds(outer);near(b.x,-5);near(b.y,-35);near(b.w,30);near(b.h,60);
});
test('ungroup preserves effective opacity and rejects unsafe overlapping transparency',()=>{
 const a=DM.item('rect',{x:0,y:0,w:10,h:10,opacity:.8}),b=DM.item('rect',{x:20,y:0,w:10,h:10,opacity:.6}),g=DM.group([a,b]);g.opacity=.5;
 const children=DM.ungroup(g);near(children[0].opacity,.4);near(children[1].opacity,.3);assert.equal(g.opacity,.5);
 g.children[1].x=5;assert.throws(()=>DM.ungroup(g),/share.*transparency/);g.opacity=1;assert.equal(DM.ungroup(g).length,2);g.locked=true;assert.throws(()=>DM.ungroup(g),/Unlock/);
});
test('library and pack limits are enforced before publishing invalid state',()=>{
 const art=DM.item('rect'),entries=Array.from({length:1001},(_,n)=>({id:String(n),name:'Decal '+n,scale:32,art}));
 assert.equal(DM.validateLibrary(entries.slice(0,1000)).library.length,1000);assert.throws(()=>DM.validateLibrary(entries),/1,000/);
 assert.throws(()=>DM.pack(entries.slice(0,501)),/1–500/);assert.equal(DM.readPack(DM.pack(entries.slice(0,500))).decals.length,500);
 const fonts=Array.from({length:31},(_,n)=>({family:'sf-font-'+n,data:'data:font/ttf;base64,AAAA'}));assert.throws(()=>DM.validateLibrary([],fonts),/fonts/);
 const text=DM.item('text',{font:fonts[0].family,text:'27'}),pack=DM.pack([{name:'Number',scale:32,art:text}],fonts);assert.equal(pack.fonts.length,1);assert.equal(DM.readPack(pack).fonts.length,1);
});
test('invalid workspace saves cannot replace the current file or rotate backups',async t=>{
 const parent=path.resolve(__dirname,'../test-output');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'safe-save-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=new Workspace(dir),p=DM.project('Valid');p.items=[DM.item('line')];const data={format:'slotforge-decals-workspace',version:1,project:p,library:[]};await store.save(data);await store.save({...data,project:{...p,name:'Current'}});
 const before=await fs.readFile(path.join(dir,'workspace.json'),'utf8'),backup=await fs.readFile(path.join(dir,'Backups/workspace-1.json'),'utf8');const invalid=DM.clone(data);invalid.project.items[0].h=.05;await assert.rejects(store.save(invalid),/h must/);assert.equal(await fs.readFile(path.join(dir,'workspace.json'),'utf8'),before);assert.equal(await fs.readFile(path.join(dir,'Backups/workspace-1.json'),'utf8'),backup);
 invalid.project=p;invalid.library=Array.from({length:1001},()=>({art:DM.item('rect')}));await assert.rejects(store.save(invalid),/1,000/);assert.equal(await fs.readFile(path.join(dir,'workspace.json'),'utf8'),before);
});
test('workspace recovery skips semantically invalid primary data and retains it on disk',async t=>{
 const parent=path.resolve(__dirname,'../test-output');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'safe-recovery-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=new Workspace(dir),data={format:'slotforge-decals-workspace',version:1,project:DM.project('Known good'),library:[]};await store.save(data);await store.save({...data,project:{...data.project,name:'Latest'}});
 const bad={...data,project:{...data.project,items:[DM.item('line',{h:.05})]}},bytes=JSON.stringify(bad);await fs.writeFile(path.join(dir,'workspace.json'),bytes);const loaded=await store.read();assert.equal(loaded.recovered,true);assert.equal(loaded.data.project.name,'Known good');assert.equal(await fs.readFile(path.join(dir,'workspace.json'),'utf8'),bytes);
});
