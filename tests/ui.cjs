const { _electron:electron }=require('playwright');
const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','ui-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env,timeout:30000});const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.waitForFunction(()=>window.Studio?.ready);await page.locator('#dialog [data-action="demo"]').click();await page.waitForFunction(()=>window.Studio.project.items.length>0);await page.screenshot({path:path.join(run,'editor.png')});
  assert.equal(await page.locator('.library-card').count(),6);assert.equal(await page.locator('#paper .sheet-item').count(),22);
  await page.locator('[data-create="text"]').click();await page.locator('#text-value').fill('JAMES');await page.locator('#text-value').press('Tab');await page.locator('#prop-h').fill('8');await page.locator('#prop-h').press('Tab');assert.equal(await page.evaluate(()=>Studio.project.items.at(-1).h),8);
  await page.locator('#font-file').setInputFiles(process.env.TEST_FONT||(process.platform==='win32'?'C:/Windows/Fonts/arial.ttf':process.platform==='darwin'?'/System/Library/Fonts/Supplemental/Arial.ttf':'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'));await page.waitForFunction(()=>Studio.project.fonts.length===1);assert.ok(await page.evaluate(()=>Studio.project.items.at(-1).font.startsWith('sf-font-')));
  // Exercise pointer edits with a rotated item, using its actual screen transform.
  await page.locator('#prop-rotation').fill('25');await page.locator('#prop-rotation').press('Tab');const old=await page.evaluate(()=>({...Studio.project.items.at(-1)}));
  await page.locator('#paper .sheet-item').last().scrollIntoViewIfNeeded();
  const center=await page.evaluate(()=>{const i=Studio.project.items.at(-1),p=new DOMPoint(i.x+i.w/2,i.y+i.h/2).matrixTransform(document.querySelector('#paper').getScreenCTM());return{x:p.x,y:p.y};});await page.mouse.move(center.x,center.y);await page.mouse.down();await page.mouse.move(center.x+20,center.y+10);await page.mouse.up();assert.notEqual(await page.evaluate(()=>Studio.project.items.at(-1).x),old.x);
  const handle=await page.locator('#paper [data-handle]').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+20,handle.y+handle.height/2+10);await page.mouse.up();assert.ok(await page.evaluate(()=>Studio.project.items.at(-1).w)>old.w);
  await page.locator('#inspector [data-action="save-decal"]').click();await page.locator('#save-decal-name').fill('My driver decal');await page.locator('#save-decal-confirm').click();assert.equal(await page.evaluate(()=>Studio.library.length),7);
  await page.locator('[data-action="undo"]').click();await page.locator('[data-action="redo"]').click();
  await page.locator('[data-action="arrange"]').click();await page.evaluate(()=>Studio.flush());
  await page.evaluate(()=>Studio.exportPDF(false,true));await page.evaluate(()=>Studio.exportPDF(true));
  await page.locator('[data-action="export-pack"]').first().click();await page.locator('#pack-export').click();
  await page.locator('[data-action="save-sheet"]').first().click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Editable sheet saved'));
  await page.locator('#pack-file').setInputFiles(path.join(run,'exports','Club Racing • No. 27.sfsheet'));await page.locator('#confirm').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);assert.equal(await page.evaluate(()=>Studio.project.fonts.length),1);
  const exports=await fs.readdir(path.join(run,'exports'));assert.ok(exports.some(f=>f.endsWith('.pdf')));assert.ok(exports.some(f=>f.endsWith('.sfdecal')));assert.ok(exports.some(f=>f.endsWith('.sfsheet')));
  await page.evaluate(()=>Studio.select([Studio.project.items[0].id]));await page.screenshot({path:path.join(run,'editor-final.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({run,exports,items:await page.evaluate(()=>Studio.project.items.length),errors},null,2));
 }catch(e){await page.screenshot({path:path.join(run,'failure.png')}).catch(()=>{});throw e;}finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
