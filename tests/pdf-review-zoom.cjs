const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','pdf-review-zoom-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.showInactive();w.setSize(1100,800);});
  await page.waitForFunction(()=>window.Studio?.ready);await page.locator('#dialog [data-action="close"]').first().click();
  await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=c.height=1000;c.getContext('2d').fillRect(0,0,1000,1000);const src=c.toDataURL();
   const image=DM.item('image',{id:'bitmap',name:'High resolution logo',x:10,y:10,w:10,h:10,src,pixelsW:1000,pixelsH:1000});
   const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10H0Z" fill="#00ff00"/></svg>';
   Studio.project.name='Artwork review';Studio.project.pages=2;Studio.project.items=[image,
    DM.item('rect',{name:'Vector shape',x:25,y:10,w:10,h:10}),
    DM.item('svg',{name:'Traced logo',x:40,y:10,w:10,h:10,svg,traceSource:{src,pixelsW:1000,pixelsH:1000}}),
    DM.item('svg',{name:'SVG with pixels',x:55,y:10,w:10,h:10,svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="${src}" width="10" height="10"/></svg>`}),
    DM.item('slice',{name:'Saved slice',page:1,x:10,y:10,w:10,h:10,baseW:10,baseH:10,children:[DM.item('group',{name:'Sponsor group',x:0,y:0,w:10,h:10,baseW:10,baseH:10,children:[{...image,name:'Nested bitmap',x:0,y:0}]})]})];Studio.select([]);
  });
  const original=await page.evaluate(()=>JSON.stringify(Studio.project));
  const open=()=>page.locator('.projectbar [data-action="pdf"]').click(),close=()=>page.locator('#dialog [data-action="close"]').first().click();
  await open();assert.equal(await page.locator('.pdf-artwork-list tbody tr').count(),5);assert.equal(await page.locator('.contains-raster').count(),3);
  assert.match(await page.locator('.pdf-raster-warning').textContent(),/3 artwork elements/);
  const nested=page.locator('.pdf-artwork-list tr').filter({hasText:'Saved slice › Sponsor group › Nested bitmap'});assert.equal(await nested.locator('td').nth(1).textContent(),'2');
  assert.equal(await page.locator('.pdf-artwork-list tr').filter({hasText:'Traced logo'}).locator('td').last().textContent(),'Traced vector');
  await page.screenshot({path:path.join(run,'review-dark.png')});await close();assert.equal(await page.evaluate(()=>JSON.stringify(Studio.project)),original);
  await page.locator('[data-action="theme-light"]').click();await open();await page.screenshot({path:path.join(run,'review-light.png')});await page.locator('#export-anyway').click();await page.waitForFunction(()=>!busy);
  assert((await fs.stat(path.join(run,'exports','Artwork review.pdf'))).size>0);
  // Slice review covers only decals included in the selected area and page.
  await page.locator('[data-action="slice"]').click();await page.locator('#slice-crop').click();assert.equal(await page.locator('.pdf-artwork-list tbody tr').count(),4);assert.equal(await page.locator('.contains-raster').count(),2);await close();
  await page.evaluate(()=>{Studio.project.items=Studio.project.items.filter(i=>!['image','slice'].includes(i.kind)&&i.name!=='SVG with pixels');Studio.project.items[0].ink='colour-white';Studio.project.whiteInk=true;Studio.select([]);});
  await open();assert.equal(await page.locator('.pdf-raster-warning').count(),0);assert.match(await page.locator('.pdf-white-note').textContent(),/600 PPI/);await close();
  // Zoom changes the viewport, never decal dimensions or the Electron UI scale.
  const beforeZoom=await page.evaluate(()=>JSON.stringify(Studio.project));
  for(let n=0;n<6;n++)await page.locator('[data-action="zoom-in"]').click();
  const area=await page.locator('#sheet-scroll').boundingBox(),cursor={x:area.x+area.width/2,y:area.y+area.height/2};
  await page.mouse.move(cursor.x,cursor.y);
  const point=()=>page.evaluate(({x,y})=>{const r=document.querySelector('#paper').getBoundingClientRect(),s=DM.size(Studio.project);return{w:r.width,x:(x-r.left)*s.w/r.width,y:(y-r.top)*s.h/r.height};},cursor);
  const a=await point();await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');await page.waitForFunction(w=>document.querySelector('#paper').getBoundingClientRect().width>w,a.w);const b=await point();assert(Math.abs(a.x-b.x)<.4);assert(Math.abs(a.y-b.y)<.4);
  await page.keyboard.down('Control');await page.mouse.wheel(0,100);await page.keyboard.up('Control');await page.waitForFunction(w=>document.querySelector('#paper').getBoundingClientRect().width<w,b.w);
  const w=(await point()).w,scroll=await page.locator('#sheet-scroll').evaluate(e=>e.scrollTop);await page.mouse.wheel(0,100);await page.waitForFunction(top=>document.querySelector('#sheet-scroll').scrollTop>top,scroll);assert.equal((await point()).w,w);
  // Line/page wheel units and zoom bounds, including suppressed background zoom in dialogs.
  await page.locator('#sheet-scroll').evaluate(el=>{for(let n=0;n<30;n++)el.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-3,deltaMode:2,bubbles:true,cancelable:true}));});
  assert.equal(await page.evaluate(()=>zoom),12);
  await open();const frozen=(await point()).w;await page.locator('#sheet-scroll').evaluate(el=>el.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:3,deltaMode:1,bubbles:true,cancelable:true})));assert.equal((await point()).w,frozen);await close();
  await page.locator('#sheet-scroll').evaluate(el=>{for(let n=0;n<80;n++)el.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:3,deltaMode:1,bubbles:true,cancelable:true}));});assert.equal(await page.evaluate(()=>zoom),.5);
  await page.locator('#zoom').click();assert.equal(await page.evaluate(()=>zoom),0);assert.equal(await page.evaluate(()=>JSON.stringify(Studio.project)),beforeZoom);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()),1);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,checks:'export artwork types, nested groups/slices, mixed SVG, retained trace originals, white mask, PDF export, slice review, themes, cursor-anchored Ctrl-wheel, normal scroll, limits, fit and unchanged physical sizes',errors}));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
