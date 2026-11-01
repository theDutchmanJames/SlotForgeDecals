const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {PDFDocument,PDFName}=require('../src/pdf-lib.cjs');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','paper-sizes-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});
 let app=await launch(),page=await app.firstWindow();const errors=[],measurements=[];page.on('pageerror',e=>errors.push(e.message));
 const m=await import('mupdf');
 try{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForFunction(()=>window.Studio?.ready);await page.locator('#dialog [data-action="close"]').first().click();
  const picker=page.getByLabel('Sheet size',{exact:true});assert.equal(await picker.inputValue(),'a4');
  await page.evaluate(()=>{const p=Studio.project;p.items=[DM.item('rect',{name:'18 by 10 mm',x:20,y:30,w:18,h:10,fill:'#00ff00'}),DM.item('rect',{x:170,y:30,w:18,h:10})];Studio.select([p.items[0].id]);});
  const original=await page.evaluate(()=>JSON.stringify(Studio.project.items));await picker.selectOption('a5');assert.equal(await page.evaluate(()=>JSON.stringify(Studio.project.items)),original);assert(await page.evaluate(()=>DM.warnings(Studio.project).some(w=>w.type==='margin')));
  await page.locator('#undo').click();assert.equal(await picker.inputValue(),'a4');await page.locator('#redo').click();assert.equal(await picker.inputValue(),'a5');
  await page.evaluate(()=>{Studio.project.items.pop();Studio.select([]);});await page.locator('#paper-folder > summary').click();
  for(const [size,w,h] of [['a4',210,297],['a5',148,210],['photo4x6',101.6,152.4]])for(const orientation of ['portrait','landscape']){
   await picker.selectOption(size);await page.locator('#orientation').selectOption(orientation);const width=orientation==='portrait'?w:h,height=orientation==='portrait'?h:w,name=size+'-'+orientation;
   assert.equal(await page.locator('#paper').getAttribute('viewBox'),`0 0 ${width} ${height}`);
   await page.evaluate(name=>{Studio.project.name=name;Studio.project.pages=2;Studio.project.items=[Studio.project.items[0],{...Studio.project.items[0],id:DM.uid(),page:1}];Studio.select([]);},name);
   await page.evaluate(()=>Studio.exportPDF(false,true));const bytes=await fs.readFile(path.join(run,'exports',name+'.pdf')),pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),2);
   for(const sheet of pdf.getPages()){assert(Math.abs(sheet.getWidth()-width*72/25.4)<.001);assert(Math.abs(sheet.getHeight()-height*72/25.4)<.001);}
   const doc=m.Document.openDocument(bytes,'application/pdf'),measured=[];
   for(let n=0;n<2;n++){const sheet=doc.loadPage(n),dev=new m.Device({fillPath(p,evenOdd,ctm,cs,color){if(color[1]>.99&&color[0]<.01){const pts=[];p.walk({moveTo(x,y){pts.push([x,y]);},lineTo(x,y){pts.push([x,y]);},closePath(){}});const transformed=pts.map(([x,y])=>[x*ctm[0]+y*ctm[2]+ctm[4],x*ctm[1]+y*ctm[3]+ctm[5]]),xs=transformed.map(p=>p[0]),ys=transformed.map(p=>p[1]);measured.push({w:(Math.max(...xs)-Math.min(...xs))*25.4/72,h:(Math.max(...ys)-Math.min(...ys))*25.4/72});}}});sheet.run(dev,m.Matrix.identity);dev.close();dev.destroy();sheet.destroy();}doc.destroy();
   assert.equal(measured.length,2);for(const b of measured){assert(Math.abs(b.w-18)<.01,JSON.stringify({name,...b}));assert(Math.abs(b.h-10)<.01);}
   measurements.push({name,width,height,artwork:measured[0]});
   if(size==='photo4x6'){
    await page.evaluate(()=>Studio.exportPDF(true));const proofBytes=await fs.readFile(path.join(run,'exports',name+'-sizing-proof.pdf')),proof=m.Document.openDocument(proofBytes,'application/pdf'),sheet=proof.loadPage(0),text=sheet.toStructuredText().asText();
    assert(text.includes(orientation==='portrait'?'50 mm horizontal':'100 mm horizontal'));assert(text.includes(orientation==='portrait'?'100 mm vertical':'50 mm vertical'));sheet.destroy();proof.destroy();
   }
  }
  await page.evaluate(()=>{Studio.project.name='Photo white';Studio.project.whiteInk=true;Studio.project.items[0].ink='colour-white';});await page.evaluate(()=>Studio.exportPDF(false,true));
  const white=await PDFDocument.load(await fs.readFile(path.join(run,'exports','Photo white.pdf')));assert.equal(white.getPage(0).node.Resources().lookup(PDFName.of('ColorSpace')).lookup(PDFName.of('SFWhite')).get(1).toString(),'/RDG_WHITE');assert(Math.abs(white.getPage(0).getWidth()-432)<.001);
  await page.locator('.projectbar [data-action="save-sheet"]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Editable sheet saved'));
  const saved=path.join(run,'exports','Photo white.sfsheet'),data=JSON.parse(await fs.readFile(saved));assert.equal(data.version,2);assert.equal(data.project.pageSize,'photo4x6');
  await picker.selectOption('a4');await page.locator('#pack-file').setInputFiles(saved);await page.locator('#confirm').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);assert.equal(await picker.inputValue(),'photo4x6');
  for(const [width,height,theme] of [[1600,1050,'dark'],[1100,720,'dark'],[1100,720,'light']]){
   await app.evaluate(({BrowserWindow},[w,h])=>BrowserWindow.getAllWindows()[0].setSize(w,h),[width,height]);await page.locator(`[data-action="theme-${theme}"]`).click();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await page.evaluate(()=>{const selectors=['#project-name','#sheet-size-select','#scale-badge','#undo','#redo','.projectbar [data-action="new"]','.projectbar [data-action="save-sheet"]','.projectbar [data-action="pdf"]'];return{w:innerWidth,boxes:selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return{s,x:r.x,right:r.right,y:r.y,bottom:r.bottom};})};});
   for(let i=0;i<layout.boxes.length;i++){const b=layout.boxes[i];assert(b.x>=0&&b.right<=layout.w,JSON.stringify(layout));assert(b.y>=0&&b.bottom<=130);assert(Math.abs((b.y+b.bottom)/2-(layout.boxes[0].y+layout.boxes[0].bottom)/2)<=1,'Project controls share a vertical centre: '+JSON.stringify(layout));if(i)assert(layout.boxes[i-1].right<=b.x+.1,JSON.stringify(layout));}
   await page.screenshot({path:path.join(run,`picker-${width}-${theme}.png`)});
  }
  await page.evaluate(()=>Studio.flush());await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.Studio?.ready);assert.equal(await page.locator('#sheet-size-select').inputValue(),'photo4x6');assert.equal(await page.evaluate(()=>Studio.project.orientation),'landscape');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,measurements,checks:'visible picker at minimum window size in both themes, undo/redo, unscaled artwork, bounds warnings, six real two-page PDFs, photo proofs, white ink, editable sharing, restart persistence',errors},null,2));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
