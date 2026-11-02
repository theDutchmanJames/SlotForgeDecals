const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','slice-regressions-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForFunction(()=>window.Studio?.ready);
  await page.locator('#dialog [data-action="close"]').first().click();
  await page.evaluate(()=>{Studio.project.items=[DM.item('rect',{name:'Left edge marker',x:1,y:10,w:3,h:10,fill:'#00ff00'})];Studio.select([]);});
  await page.locator('[data-action="slice"]').click();await page.locator('#slice-save').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);await page.locator('#library-grid [data-lib]').first().click();
  const placement=await page.evaluate(()=>{const i=Studio.project.items.at(-1);return{x:i.x,y:i.y,w:i.w,h:i.h};});assert.equal(placement.x,0);assert.equal(placement.w,210);assert.equal(placement.h,80);
  await page.evaluate(async()=>{Studio.project.items=[Studio.project.items.at(-1)];Studio.project.name='Full-width library slice';await Studio.exportPDF(false,true);});
  const m=await import('mupdf');
  const rendered=async name=>{
   const doc=m.Document.openDocument(await fs.readFile(path.join(run,'exports',name+'.pdf')),'application/pdf'),sheet=doc.loadPage(0),pix=sheet.toPixmap(m.Matrix.scale(2,2),m.ColorSpace.DeviceRGB,false);
   const result={pixels:Buffer.from(pix.getPixels()),stride:pix.getStride(),width:pix.getWidth(),height:pix.getHeight()};pix.destroy();sheet.destroy();doc.destroy();return result;
  };
  const pdf=await rendered('Full-width library slice'),x=Math.floor(2*72/25.4*2),y=Math.floor((placement.y+15)*72/25.4*2),at=y*pdf.stride+x*3;assert.deepEqual([...pdf.pixels.subarray(at,at+3)],[0,255,0]);
  // Change ink through the actual inspector, then ungroup through the toolbar.
  for(const ink of ['white-only','colour-white']){
   await page.evaluate(()=>{
    const p=DM.project();p.items=[DM.item('rect',{x:10,y:10,w:10,h:10,fill:'#00ff00'}),DM.item('rect',{x:25,y:10,w:10,h:10,fill:'#ff0000',ink:'white-only'})];
    const inner=Slice.artwork(Slice.region(p,0,{x:5,y:5,w:35,h:20}));inner.x=5;inner.y=5;p.items=[inner];
    const outer=Slice.artwork(Slice.region(p,0,{x:0,y:0,w:45,h:30}));outer.x=20;outer.y=20;
    const g=DM.validateItem(DM.group([outer,DM.item('rect',{x:80,y:20,w:10,h:10,ink:'white-only',fill:'#0000ff'})]));
    Studio.project.items=[g];Studio.project.whiteInk=true;Studio.select([g.id]);
   });
   await page.locator('#inspector details > summary').filter({hasText:'Text & appearance'}).click();await page.locator('#ink').selectOption(ink);
   const before=await page.evaluate(async()=>({mask:(await Art.masks(Studio.project))[0],project:JSON.stringify(Studio.project.items)}));
   await page.evaluate(async name=>{Studio.project.name=name;await Studio.exportPDF(false,true);},ink+' before');
   await page.locator('.toolbar [data-action="ungroup"]').click();
   const after=await page.evaluate(async()=>({mask:(await Art.masks(Studio.project))[0],slice:Studio.project.items.find(i=>i.kind==='slice'),other:Studio.project.items.find(i=>i.kind==='rect')}));
   assert.deepEqual(after.mask,before.mask,'The entire white mask stays identical after ungroup');assert.equal(after.other.ink,'white-only');
   assert.equal(after.slice.children[0].children[0].ink,ink);assert.equal(after.slice.children[0].children[1].ink,'white-only');
   await page.evaluate(async name=>{Studio.project.name=name;await Studio.exportPDF(false,true);},ink+' after');
   const a=await rendered(ink+' before'),b=await rendered(ink+' after');assert.deepEqual(a,b,'Rendered PDF colour output stays identical');
   await page.locator('#undo').click();assert.equal(await page.evaluate(()=>JSON.stringify(Studio.project.items)),before.project);await page.locator('#redo').click();
   const roundTrip=await page.evaluate(()=>{const a=Studio.project.items.find(i=>i.kind==='slice');return DM.readPack(DM.pack([{name:'Ink regression',scale:32,art:a}])).decals[0].art;});assert.deepEqual(roundTrip,after.slice);
   await page.evaluate(()=>Studio.flush());
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({run,placement,checks:'full-width library slice and edge artwork in real PDF; white-only and white backing through inspector, ungroup, undo/redo and sharing; identical colour PDFs and complete white masks',errors},null,2));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
