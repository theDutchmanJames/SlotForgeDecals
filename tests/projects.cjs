const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','project-browser-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});
 let app=await launch(),page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const done=()=>page.locator('#dialog [data-action="close"]').first().click();
 const browser=async()=>{await page.locator('nav [data-action="projects"]').click();await page.waitForSelector('.project-card');};
 const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Studio.project)));
 const entries=()=>page.evaluate(()=>desktop.listProjects());
 const card=name=>page.locator('.project-card').filter({has:page.locator('h3',{hasText:new RegExp('^'+name+'$')})});
 const saveCurrent=async()=>{await page.locator('#project-save-current').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Saved to Sheet Library')&&!projectTask);await page.waitForSelector('.project-card');};
 const open=name=>card(name).locator('[data-project-open]').click();
 try{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForFunction(()=>window.Studio?.ready);await done();
  await page.evaluate(()=>{const p=Studio.project;p.name='GT Sprint';p.items=[DM.item('svg',{id:'badge',name:'GT number',x:20,y:20,w:20,h:20,svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#e5484d"/><text x="20" y="68" font-size="52" fill="white" font-family="Arial">27</text></svg>'})];Studio.select(['badge']);});
  await page.locator('#inspector [data-action="save-decal"]').click();await page.locator('#save-decal-confirm').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);assert.equal(await page.evaluate(()=>Studio.libraryCount),1);
  await browser();await saveCurrent();assert.equal((await entries()).entries.length,1);const original=await state();await done();
  await page.locator('#prop-w').fill('25');await page.locator('#prop-w').press('Tab');await browser();await saveCurrent();assert.equal((await page.evaluate(id=>desktop.listProjects({scope:'history',projectId:id}),original.id)).entries.length,1);
  await page.locator('#dialog [data-action="new"]').click();await page.waitForFunction(()=>Studio.project.name==='Untitled sheet'&&!projectTask);assert.equal((await entries()).entries.length,1);
  await page.locator('#project-name').click();await page.locator('#name-input').fill('Night Endurance');await page.locator('#name-submit').click();await page.locator('[data-action="shapes"]').click();await page.locator('[data-create="stripe"]').click();
  await browser();assert.equal(await page.locator('.project-card').count(),2);await page.locator('#project-search').fill('GT');await page.waitForFunction(()=>document.querySelectorAll('.project-card').length===1);assert.equal(await page.locator('.project-card').count(),1);await open('GT Sprint');await page.waitForFunction(()=>Studio.project.name==='GT Sprint'&&!projectTask);assert.equal((await state()).items[0].w,25);
  assert.ok((await entries()).entries.some(e=>e.name==='Night Endurance'),'Switching preserved the outgoing sheet without a manual save');
  const libraryBefore=await page.evaluate(async()=>JSON.stringify((await desktop.queryLibrary({scope:'decals'})).entries));
  await browser();await card('GT Sprint').locator('[data-project-versions]').click();await page.locator('[data-recover-preview]').first().click();await page.waitForSelector('#recover-project');await page.locator('#recover-project').click();await page.waitForFunction(()=>Studio.project.name.endsWith(' · recovered')&&!projectTask);
  const recovered=await state();assert.notEqual(recovered.id,original.id);assert.equal(recovered.items[0].w,20);assert.equal(await page.evaluate(async()=>JSON.stringify((await desktop.queryLibrary({scope:'decals'})).entries)),libraryBefore);
  // A legacy project gets a generated thumbnail; a bad file remains intact.
  const legacy=await page.evaluate(()=>{const p=DM.project('Classic Stripes');p.items=[DM.item('stripe',{x:15,y:20,w:60,h:8,fill:'#245cc3',fill2:'#e5484d'})];return{format:'slotforge-decals-sheet',version:1,project:p};});
  await page.locator('#project-file').setInputFiles({name:'Classic.sfsheet',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await page.locator('#collection-confirm').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);
  await browser();await card('Classic Stripes').locator('img').waitFor();
  await page.locator('#project-sort').selectOption('name');await page.waitForFunction(()=>document.querySelector('#collection-items')?.dataset.loading==='false');assert.equal(await page.locator('.project-card').nth(1).locator('h3').textContent(),'Classic Stripes');await page.screenshot({path:path.join(run,'projects-dark.png')});await done();await page.locator('[data-action="theme-light"]').click();await browser();await page.screenshot({path:path.join(run,'projects-light.png')});
  await open('Classic Stripes');await page.waitForFunction(()=>Studio.project.name==='Classic Stripes'&&!projectTask);assert.equal((await state()).items[0].w,60);
  // Workspace rotation after preview must not change the version the user reviewed.
  await browser();await page.locator('[data-action="recover-workspace"]').click();await page.locator('[data-recover-preview]').first().click();await page.waitForSelector('#recover-project');
  const previewName=await page.locator('.dialog-head p').textContent();await page.evaluate(async()=>{await Studio.flush();await Studio.flush();await Studio.flush();});await page.locator('#recover-project').click();await page.waitForFunction(()=>!projectTask&&!document.querySelector('#dialog').open);
  assert.equal((await state()).name,previewName+' · recovered');assert.equal(await page.evaluate(async()=>JSON.stringify((await desktop.queryLibrary({scope:'decals'})).entries)),libraryBefore);
  // A failed outgoing save must leave the active sheet unchanged.
  const beforeFailure=await state(),currentEntry=(await entries()).entries.find(e=>e.id===beforeFailure.id),corrupt=require('./sqlite-fixture.cjs').corruptSheet(path.join(run,'workspace'),currentEntry.file);
  await page.locator('.projectbar [data-action="new"]').click();await page.waitForFunction(()=>!projectTask&&document.querySelector('#toast').classList.contains('error'));assert.deepEqual(await state(),beforeFailure);corrupt.restore();
  await page.evaluate(()=>Studio.flush());const saved=await state();await app.close();app=await launch();page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForFunction(()=>window.Studio?.ready);assert.deepEqual(await state(),saved);await browser();assert.ok(await page.locator('.project-card').count()>=4);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,800));await page.screenshot({path:path.join(run,'projects-compact.png')});
  await page.locator('#dialog [data-action="new"]').click();await page.waitForFunction(()=>!projectTask);const blank=await state();await browser();await saveCurrent();assert.ok((await entries()).entries.some(e=>e.id===blank.id),'Explicitly saving a blank sheet creates a project too');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,checks:'thumbnail browser, search/sort, native legacy projects, save history, automatic preservation on switch/new, recovered copies, backup rotation after preview, unreadable files, failed-save protection, theme and restart persistence',errors},null,2));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
