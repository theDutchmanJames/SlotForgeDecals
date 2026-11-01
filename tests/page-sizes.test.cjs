const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const DM=require('../renderer/model.js'),{Projects}=require('../src/projects.cjs'),{Workspace}=require('../src/storage.cjs'),{PDFDocument}=require('../src/pdf-lib.cjs'),{exactPage,addWhitePlate}=require('../src/white-pdf.cjs');
test('Supported paper dimensions, orientation and legacy A4 are exact',()=>{
 for(const [pageSize,w,h] of [['a4',210,297],['a5',148,210],['photo4x6',101.6,152.4]]){
  assert.deepEqual(DM.size({pageSize}),{w,h});assert.deepEqual(DM.size({pageSize,orientation:'landscape'}),{w:h,h:w});
 }
 const old=DM.project();delete old.pageSize;assert.equal(DM.validateProject(old).pageSize,'a4');
 assert.throws(()=>DM.validateProject({...old,pageSize:'letter'}),/Unsupported sheet size/);assert.throws(()=>DM.size({pageSize:'__proto__'}));assert.throws(()=>DM.size({pageSize:['a4']}));
});
test('Smaller sheets change bounds and arrangement without rescaling artwork',()=>{
 const p=DM.project();p.items=[DM.item('rect',{x:170,y:50,w:20,h:12})];assert.equal(DM.warnings(p).length,0);
 const smaller=DM.validateProject({...p,pageSize:'a5'});assert.deepEqual(smaller.items,p.items);assert(DM.warnings(smaller).some(w=>w.type==='margin'));
 for(const pageSize of ['a5','photo4x6']){const packed=DM.arrange({...smaller,pageSize});assert.equal(packed.items[0].w,20);assert.equal(packed.items[0].h,12);assert.equal(DM.warnings(packed).length,0);}
 assert.throws(()=>DM.arrange({...p,pageSize:'photo4x6',items:[DM.item('rect',{w:100,h:20})]}),/larger than the printable area/);
});
test('Proof rulers fit every sheet and name their actual lengths',()=>{
 for(const pageSize of Object.keys(DM.PAGE_SIZES))for(const orientation of ['portrait','landscape']){const p={pageSize,orientation},s=DM.size(p),b=DM.proofBars(p);assert(b.x+10<=s.w-10);assert(b.y+10<=s.h-10);}
 assert.deepEqual(DM.proofBars({pageSize:'photo4x6'}),{x:50,y:100});assert.deepEqual(DM.proofBars({pageSize:'photo4x6',orientation:'landscape'}),{x:100,y:50});
});
test('Projects, histories and workspace reload retain sheet size and use compatible file versions',async t=>{
 const dir=await fs.mkdtemp(path.join(path.resolve('test-output'),'page-size-'));t.after(()=>fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 const store=new Projects(dir),p=DM.project('Small sheet');p.pageSize='a5';p.items=[DM.item('rect')];await store.save({project:p});p.pageSize='photo4x6';await store.save({project:p});
 const list=await new Projects(dir).list();assert.equal(list.entries[0].pageSize,'photo4x6');assert.equal((await store.read(list.entries[0])).project.pageSize,'photo4x6');
 const raw=JSON.parse(await fs.readFile(path.join(dir,'Projects',list.entries[0].file),'utf8'));assert.equal(raw.version,2);
 const history=await store.list({scope:'history',projectId:p.id});assert.equal(history.entries[0].pageSize,'a5');
 const ws=new Workspace(dir);await ws.save({format:'slotforge-decals-workspace',version:1,project:p,library:[]});const saved=(await new Workspace(dir).read()).data;assert.equal(saved.version,2);assert.equal(saved.project.pageSize,'photo4x6');assert.equal(DM.fileVersion(DM.project()),1);
});
test('Exact PDF boxes and white separation retain all paper sizes',async()=>{
 for(const pageSize of Object.keys(DM.PAGE_SIZES))for(const orientation of ['portrait','landscape']){const s=DM.size({pageSize,orientation}),p=await PDFDocument.create();p.addPage();const bytes=await exactPage(await p.save(),s),out=await PDFDocument.load(await addWhitePlate(bytes,[{width:8,height:1,bits:Buffer.from([0x7f]).toString('base64')}],'WHITE'));
  assert(Math.abs(out.getPage(0).getWidth()-s.w*72/25.4)<.00001);assert(Math.abs(out.getPage(0).getHeight()-s.h*72/25.4)<.00001);
 }
});
