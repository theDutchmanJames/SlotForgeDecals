const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {PDFDocument,PDFName}=require('../src/pdf-lib.cjs');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','slicing-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});
 let app=await launch(),page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const close=()=>page.locator('#dialog [data-action="close"]').first().click();
 const open=()=>page.locator('.toolbar [data-action="slice"]').click();
 const box=async b=>{for(const k of ['w','h','x','y'])await page.locator('#slice-'+k).fill(String(b[k]));};
 const exported=async()=>page.waitForFunction(()=>!document.querySelector('#dialog').open);
 const pdf=async name=>PDFDocument.load(await fs.readFile(path.join(run,'exports',name+'.pdf')));
 const dimensions=(doc,w,h)=>{assert.equal(doc.getPageCount(),1);assert(Math.abs(doc.getPage(0).getWidth()*25.4/72-w)<.001);assert(Math.abs(doc.getPage(0).getHeight()*25.4/72-h)<.001);};
 try{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForFunction(()=>window.Studio?.ready);await close();
  await page.evaluate(()=>{Studio.project.name='Slice test';Studio.project.items=[DM.item('rect',{name:'Green vector',x:10,y:10,w:20,h:10,fill:'#00ff00'}),DM.item('rect',{name:'Outside',x:100,y:100,w:20,h:20,fill:'#ff0000'}),DM.item('rect',{name:'Other page',page:1,x:10,y:10,w:10,h:10})];Studio.project.pages=2;Studio.select([]);});
  const original=await page.evaluate(()=>JSON.stringify(Studio.project));
  await open();await box({x:15,y:5,w:10,h:20});assert.match(await page.locator('#slice-summary').textContent(),/^1 decal/);
  // Reverse drag uses SVG coordinates despite the preview's letterboxing.
  const points=await page.evaluate(()=>{const m=document.querySelector('#slice-canvas').getScreenCTM();return [[25,25],[15,5]].map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(m);return{x:p.x,y:p.y};});});
  await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:5});await page.mouse.up();assert(Math.abs(Number(await page.locator('#slice-w').inputValue())-10)<.1);
  await box({x:15,y:5,w:10,h:20});await page.locator('#slice-boundary').selectOption('whole');assert.match(await page.locator('#slice-summary').textContent(),/20 × 20 mm/);await page.locator('#slice-boundary').selectOption('clip');
  await page.locator('#slice-name').fill('Saved strip');await page.screenshot({path:path.join(run,'slice-dark.png')});await page.locator('#slice-save').click();await exported();
  assert.equal(await page.evaluate(()=>JSON.stringify(Studio.project)),original);
  const art=await page.evaluate(async()=>(await desktop.readDecal((await desktop.queryLibrary({scope:'decals',limit:1})).entries[0])).decal.art);assert.equal(art.kind,'slice');assert.equal(art.w,10);assert.equal(art.children[0].x,-5);
  await open();await box({x:15,y:5,w:10,h:20});await page.locator('#slice-name').fill('Cropped');await page.locator('#slice-crop').click();await page.locator('#slice-export').click();await exported();dimensions(await pdf('Cropped — cropped'),10,20);
  const m=await import('mupdf'),bytes=await fs.readFile(path.join(run,'exports','Cropped — cropped.pdf')),doc=m.Document.openDocument(bytes,'application/pdf'),sheet=doc.loadPage(0),paths=[];
  const device=new m.Device({fillPath(p,evenOdd,ctm,cs,color){if(color[1]>.99&&color[0]<.01){const pts=[];p.walk({moveTo(x,y){pts.push([x,y]);},lineTo(x,y){pts.push([x,y]);},closePath(){}});const xs=pts.map(([x,y])=>x*ctm[0]+y*ctm[2]+ctm[4]),ys=pts.map(([x,y])=>x*ctm[1]+y*ctm[3]+ctm[5]);paths.push({w:(Math.max(...xs)-Math.min(...xs))*25.4/72,h:(Math.max(...ys)-Math.min(...ys))*25.4/72});}}});sheet.run(device,m.Matrix.identity);device.close();device.destroy();assert.equal(paths.length,1);assert(Math.abs(paths[0].w-20)<.01);assert(Math.abs(paths[0].h-10)<.01);
  // Render the actual PDF: the clipped green band occupies the middle 10 mm.
  const pix=sheet.toPixmap(m.Matrix.scale(10,10),m.ColorSpace.DeviceRGB,false),pixels=pix.getPixels(),stride=pix.getStride();const pixel=(x,y)=>Array.from(pixels.subarray(y*stride+x*3,y*stride+x*3+3));assert.deepEqual(pixel(50,20),[255,255,255]);assert.deepEqual(pixel(50,200),[0,255,0]);assert.deepEqual(pixel(50,500),[255,255,255]);pix.destroy();sheet.destroy();doc.destroy();
  await open();await box({x:15,y:5,w:10,h:20});await page.locator('#slice-name').fill('Full sheet');await page.locator('#slice-print').click();await page.locator('#slice-export').click();await exported();dimensions(await pdf('Full sheet — print area'),210,297);
  for(const length of [1,5]){await open();await box({x:15,y:12,w:length,h:length});await page.locator('#slice-name').fill('Tiny'+length);await page.locator('#slice-crop').click();await page.locator('#slice-export').click();await exported();dimensions(await pdf('Tiny'+length+' — cropped'),length,length);const d=m.Document.openDocument(await fs.readFile(path.join(run,'exports','Tiny'+length+' — cropped.pdf')),'application/pdf'),sh=d.loadPage(0),px=sh.toPixmap(m.Matrix.scale(10,10),m.ColorSpace.DeviceRGB,false);assert.deepEqual(Array.from(px.getPixels().subarray(px.getStride()+3,px.getStride()+6)),[0,255,0]);px.destroy();sh.destroy();d.destroy();}
  // Mixed white settings must retain only the original white backing in the mask.
  await page.evaluate(()=>{Studio.project.whiteInk=true;Studio.project.items[0].ink='colour-white';Studio.project.items.push(DM.item('rect',{x:10,y:22,w:20,h:3,ink:'white-only',fill:'#ff0000'}),DM.item('rect',{x:10,y:26,w:20,h:3,fill:'#0000ff'}));Studio.select([]);});
  const maskSamples=await page.evaluate(async()=>{const result=Slice.region(Studio.project,0,{x:15,y:5,w:10,h:25}),out=Slice.output(Studio.project,result,true),mask=(await Art.masks(out.project,out.dimensions))[0],bits=atob(mask.bits),stride=Math.ceil(mask.width/8);return [1,7,18,23].map(mm=>{const x=Math.floor(2/10*mask.width),y=Math.floor(mm/25*mask.height);return (bits.charCodeAt(y*stride+(x>>3))>>(7-(x&7)))&1;});});assert.deepEqual(maskSamples,[1,0,0,1]);
  await open();await box({x:15,y:5,w:10,h:25});await page.locator('#slice-name').fill('White slice');await page.locator('#slice-crop').click();await page.locator('#slice-export').click();await exported();const white=await pdf('White slice — cropped');dimensions(white,10,25);assert.equal(white.getPage(0).node.Resources().lookup(PDFName.of('ColorSpace')).lookup(PDFName.of('SFWhite')).get(1).toString(),'/RDG_WHITE');
  // Sharing and reuse preserve clipping without changing the saved original.
  await page.evaluate(async()=>{await exportDecals((await desktop.queryLibrary({scope:'decals',limit:1})).entries);});const pack=path.join(run,'exports','Saved strip.sfdecal');await page.locator('#pack-file').setInputFiles(pack);await page.locator('#collection-confirm').click();await exported();assert.equal(await page.evaluate(()=>Studio.libraryCount),2);
  await page.locator('#library-grid [data-lib]').first().click();await page.waitForFunction(()=>Studio.project.items.at(-1).kind==='slice');assert.equal(await page.evaluate(()=>Studio.project.items.at(-1).kind),'slice');assert.equal(await page.locator('#ink').isDisabled(),true);
  await page.evaluate(()=>Studio.flush());await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.Studio?.ready);assert.equal(await page.evaluate(async()=>(await desktop.readDecal((await desktop.queryLibrary({scope:'decals',limit:1})).entries[0])).decal.art.w),10);assert.equal(await page.evaluate(()=>Studio.project.items.at(-1).kind),'slice');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.locator('[data-action="theme-light"]').click();await open();await page.screenshot({path:path.join(run,'slice-light.png')});await close();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,720));await open();await box({x:205,y:0,w:10,h:10});assert(await page.locator('#slice-save').isDisabled());assert.match(await page.locator('#dialog-error').textContent(),/inside the sheet/);await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,checks:'draw, exact fields, expansion, transparent library slice, sharing, restart, 1/5/10 mm cropped PDFs, full A4 output, vector geometry, rendered clipping and spot white',errors},null,2));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
