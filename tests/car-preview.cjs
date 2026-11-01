const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','car-preview-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});
 let app=await launch(),page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const open=()=>page.locator('[data-action="expand-car"]').click();
 const done=()=>page.locator('#dialog [data-action="close"]').last().click();
 const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Studio.project.items)));
 try{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForSelector('#dialog [data-action="demo"]');await done();
  await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=120;const x=c.getContext('2d');x.fillStyle='#e5484d';x.fillRect(0,0,240,120);x.fillStyle='#fff';x.font='bold 100px Arial';x.fillText('27',65,96);const i=DM.item('image',{name:'My PNG decal',src:c.toDataURL(),pixelsW:240,pixelsH:120,x:25,y:35,w:20,h:10,rotation:25,carPositions:{side:{x:50,y:20},top:{x:60,y:25}}});Studio.project.items=[i,DM.item('rect',{x:80,y:40,w:10,h:5})];Studio.select([i.id]);});
  const original=await state();await open();assert.equal(await page.locator('#preview-w').inputValue(),'20');assert.equal(await page.locator('#preview-h').inputValue(),'10');
  await page.locator('#preview-w').fill('3');await page.locator('#preview-w').fill('30');
  let items=await state();assert.equal(items[0].w,30);assert.equal(items[0].h,15);assert.equal(items[0].x,25);assert.equal(items[0].y,35);assert.equal(items[0].rotation,25);assert.deepEqual(items[0].carPositions,{side:{x:45,y:17.5},top:{x:55,y:22.5}});assert.deepEqual(items[1],original[1]);
  assert.equal(await page.locator('#prop-w').inputValue(),'30');assert.equal(await page.locator('#paper .sheet-item').first().locator('image').getAttribute('width'),'30');assert.equal(await page.locator('#expanded-car .car-decal image').getAttribute('width'),'30');
  await page.locator('#preview-w').press('Enter');await done();await page.locator('[data-action="undo"]').click();items=await state();assert.equal(items[0].w,20,'One undo reverts the whole typing session');assert.equal(items[0].h,10);await page.locator('[data-action="redo"]').click();await page.evaluate(()=>Studio.select([Studio.project.items[0].id]));
  await open();await page.locator('#preview-aspect').uncheck();await page.locator('#preview-h').fill('12');await page.locator('#preview-h').press('Enter');items=await state();assert.equal(items[0].w,30);assert.equal(items[0].h,12);assert.equal(await page.locator('#prop-h').inputValue(),'12');
  await page.locator('#preview-view-top').click();assert.equal(await page.evaluate(()=>Studio.project.preview.view),'top');assert.equal(await page.locator('#expanded-car .car-decal image').getAttribute('height'),'12');
  await page.locator('#preview-h').fill('0');assert.ok(await page.locator('#preview-h').getAttribute('aria-invalid'));assert.equal((await state())[0].h,12);await page.locator('#preview-h').press('Enter');assert.equal(await page.locator('#preview-h').inputValue(),'12');
  await page.locator('#preview-view-side').click();await page.screenshot({path:path.join(run,'resize-preview.png')});await done();
  await page.locator('[data-action="lock"]').click();await open();assert.ok(await page.locator('#preview-w').isDisabled());assert.ok(await page.locator('#preview-h').isDisabled());await done();await page.locator('[data-action="lock"]').click();
  await page.evaluate(()=>Studio.select([]));await open();assert.ok(await page.locator('#preview-w').isDisabled());assert.ok((await page.locator('#preview-size-note').textContent()).includes('Select one decal'));await done();
  await page.evaluate(()=>Studio.flush());await app.close();app=await launch();page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForFunction(()=>window.Studio?.ready);await page.evaluate(()=>Studio.select([Studio.project.items[0].id]));await open();assert.equal(await page.locator('#preview-w').inputValue(),'30');assert.equal(await page.locator('#preview-h').inputValue(),'12');assert.equal(await page.locator('#preview-aspect').isChecked(),false);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,checks:'live PNG sizing on car and A4, proportions, stable sheet placement, centred car position, one undo per edit, independent dimensions, side/top views, invalid values, locks, no selection, persistence',errors},null,2));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
