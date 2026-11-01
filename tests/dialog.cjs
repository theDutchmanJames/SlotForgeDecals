const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','dialog-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});
 try{
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  await page.locator('#dialog [data-action="close"]').last().click();
  const file={name:'Square.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>')};
  await page.locator('#art-file').setInputFiles(file);await page.locator('#place-import').waitFor();
  // HTML dialog close events are queued: a previous dialog can dispatch after reopening.
  await page.evaluate(()=>document.querySelector('#dialog').dispatchEvent(new Event('close')));
  await page.locator('#place-import').click();await page.waitForFunction(()=>Studio.project.items.length===1,null,{timeout:3000});
  await page.locator('#art-file').setInputFiles(file);await page.locator('#place-import').waitFor();
  await page.evaluate(()=>document.querySelector('#dialog').dispatchEvent(new Event('close')));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#dialog').open);
  assert.equal(await page.evaluate(()=>Studio.project.items.length),1,'Escape still cancels after a stale close event');
  await page.locator('#art-file').setInputFiles(file);await page.locator('#place-import').click();await page.waitForFunction(()=>Studio.project.items.length===2);
  console.log('Delayed close events cannot cancel new imports; Escape and later imports remain functional.');
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
