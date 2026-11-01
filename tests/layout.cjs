const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','layout-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});
 let app=await launch(),page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const arrange=()=>page.locator('[data-action="arrange-selection"]').first().click();
 const done=()=>page.locator('#dialog [data-action="close"]').last().click();
 const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Studio.project)));
 const selectAll=()=>page.evaluate(()=>Studio.select(Studio.project.items.filter(i=>i.page===0).map(i=>i.id)));
 try{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForFunction(()=>window.Studio?.ready);await done();
  await page.evaluate(()=>{Studio.project.items=[DM.item('stripe',{id:'a',name:'Side stripes',x:20,y:20,w:30,h:6}),DM.item('text',{id:'b',name:'Race number',text:'27',x:55,y:20,w:12,h:10,font:'Arial',bold:true,italic:false,spacing:0})];Studio.select(['a','b']);});
  const original=await state();await arrange();await page.locator('[data-action="grid-copies"]').click();await page.locator('#grid-rows').fill('3');await page.locator('#grid-columns').fill('2');await page.locator('#grid-gap-x').fill('4');await page.locator('#grid-gap-y').fill('6');
  assert.ok((await page.locator('#grid-summary').textContent()).includes('adds 10 decals'));assert.equal(await page.locator('#grid-preview use').count(),6);await page.screenshot({path:path.join(run,'grid-preview.png')});
  await page.locator('#grid-rows').fill('100');assert.ok(await page.locator('#grid-apply').isDisabled());assert.ok((await page.locator('#dialog-error').textContent()).includes('margins'));assert.deepEqual(await state(),original);
  await page.locator('#grid-rows').fill('3');await page.locator('#grid-apply').click();let p=await state();assert.equal(p.items.length,12);assert.deepEqual(p.items.slice(0,2),original.items);assert.equal(p.items[2].x,71);assert.equal(p.items[4].y,36);
  await page.keyboard.press('Control+z');assert.deepEqual((await state()).items,original.items);await page.keyboard.press('Control+Shift+z');assert.equal((await state()).items.length,12);
  await selectAll();await arrange();await page.locator('[data-action="move-page"]').click();await page.locator('#move-apply').click();p=await state();assert.equal(p.pages,2);assert.ok(p.items.every(i=>i.page===1));assert.equal(await page.locator('#paper .selection').count(),12);
  await page.keyboard.press('Control+z');p=await state();assert.equal(p.pages,1);assert.ok(p.items.every(i=>i.page===0));await page.keyboard.press('Control+Shift+z');assert.equal((await state()).pages,2);
  await page.evaluate(()=>Studio.select(Studio.project.items.map(i=>i.id))); // render filters to the current page after undo/redo
  await page.locator('[data-page="1"]').click();await page.evaluate(()=>Studio.select(Studio.project.items.map(i=>i.id)));await arrange();await page.locator('[data-action="move-page"]').click();await page.locator('#move-target').selectOption('0');await page.locator('#move-apply').click();assert.ok((await state()).items.every(i=>i.page===0));
  await page.evaluate(()=>{Studio.project.items=[DM.item('rect',{id:'l',x:10,y:20,w:10,h:10}),DM.item('rect',{id:'m',x:35,y:35,w:20,h:10}),DM.item('rect',{id:'r',x:100,y:50,w:10,h:10})];Studio.select(['l','m','r']);});
  await arrange();await page.locator('[data-layout-operation="distribute-x"]').click();p=await state();assert.equal(p.items[1].x,50);assert.equal(p.items[0].x,10);assert.equal(p.items[2].x,100);
  await arrange();await page.locator('[data-layout-operation="align-y-end"]').click();p=await state();assert.ok(p.items.every(i=>i.y===50));
  await page.evaluate(()=>{Studio.project.items[1].locked=true;Studio.select(['l','m','r']);});await arrange();assert.ok(await page.locator('[data-layout-operation="mirror-x"]').isDisabled());assert.ok(await page.locator('[data-action="move-page"]').isDisabled());assert.ok(await page.locator('[data-action="grid-copies"]').isEnabled());await done();
  // An asymmetric imported vector confirms the actual print transform.
  await page.evaluate(()=>{Studio.project.name='Mirrored vector';Studio.project.pages=1;Studio.project.items=[DM.item('svg',{id:'arrow',name:'Asymmetric vector',x:20,y:30,w:20,h:10,svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><path d="M0 0H20L0 10Z" fill="#00ff00"/></svg>'})];Studio.select(['arrow']);});
  await arrange();await page.locator('[data-layout-operation="mirror-x"]').click();assert.equal((await state()).items[0].flipX,true);assert.equal(await page.locator('#paper [data-mirror]').count(),1);assert.equal(await page.locator('#car-stage [data-mirror]').count(),1);
  await page.evaluate(()=>Studio.exportPDF(false,true));const bytes=await fs.readFile(path.join(run,'exports','Mirrored vector.pdf')),m=await import('mupdf'),doc=m.Document.openDocument(bytes,'application/pdf');const sheet=doc.loadPage(0),vertices=[];let images=0;
  const dev=new m.Device({fillImage(){images++;},fillPath(p,eo,ctm,cs,color){if(color[1]>.99&&color[0]<.01&&color[2]<.01){p.walk({moveTo(x,y){vertices.push([(x*ctm[0]+y*ctm[2]+ctm[4])*25.4/72,(x*ctm[1]+y*ctm[3]+ctm[5])*25.4/72]);},lineTo(x,y){vertices.push([(x*ctm[0]+y*ctm[2]+ctm[4])*25.4/72,(x*ctm[1]+y*ctm[3]+ctm[5])*25.4/72]);},closePath(){}});}}});sheet.run(dev,m.Matrix.identity);dev.close();dev.destroy();sheet.destroy();doc.destroy();
  for(const [x,y]of [[40,30],[20,30],[40,40]])assert.ok(vertices.some(p=>Math.abs(p[0]-x)<.01&&Math.abs(p[1]-y)<.01),JSON.stringify(vertices));assert.equal(images,0);
  const samples=await page.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=20;c.height=10;const ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,10,10);ctx.fillStyle='#0000ff';ctx.fillRect(10,0,10,10);
   const i=DM.item('image',{src:c.toDataURL(),pixelsW:20,pixelsH:10,w:20,h:10,flipX:true}),img=new Image();img.src=Art.url(Art.standalone(i));await img.decode();ctx.clearRect(0,0,20,10);ctx.drawImage(img,0,0,20,10);
   return{left:[...ctx.getImageData(2,5,1,1).data],right:[...ctx.getImageData(17,5,1,1).data]};
  });assert.deepEqual(samples,{left:[0,0,255,255],right:[255,0,0,255]});
  // Mirrored groups render identically after ungrouping, including rotated children.
  const difference=await page.evaluate(async()=>{
   const g=DM.group([DM.item('rect',{x:20,y:20,w:20,h:10,rotation:30}),DM.item('triangle',{x:50,y:25,w:10,h:15})]);g.flipX=true;g.flipY=true;
   const p=DM.project();p.items=[g];const render=async()=>{const im=new Image();im.src=Art.url(Art.sheet(p,0));await im.decode();const c=document.createElement('canvas');c.width=840;c.height=1188;const ctx=c.getContext('2d');ctx.drawImage(im,0,0,c.width,c.height);return ctx.getImageData(0,0,c.width,c.height).data;};
   const a=await render();p.items=DM.ungroup(g);const b=await render();let total=0;for(let n=0;n<a.length;n++)total+=Math.abs(a[n]-b[n]);return total;
  });assert.ok(difference<5000,'Mirrored ungroup pixel difference: '+difference);
  await page.evaluate(()=>Studio.flush());const saved=(await state()).items;await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.Studio?.ready);assert.deepEqual((await state()).items,saved);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,vertices,images,groupPixelDifference:difference,checks:'grid preview and margin validation, exact gaps and source preservation, undo/redo, move to new/existing pages, alignment/distribution, locks, mirrored vector PDF and bitmap pixels, ungroup fidelity and persistence',errors},null,2));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
