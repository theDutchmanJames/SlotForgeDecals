const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','collections-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=(overrides={})=>electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env:{...env,...overrides}});
 let app=await launch(),page=await app.firstWindow();const errors=[];
 const attach=async()=>{page.on('pageerror',e=>errors.push(e.message));await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.showInactive();w.setSize(1100,800);});await page.waitForFunction(()=>window.Studio?.ready);};
 const close=()=>page.locator('#dialog [data-action="close"]').first().click();
 const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Studio.project)));
 const confirm=async()=>{await page.locator('#collection-confirm').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);};
 const browser=async()=>{await page.locator('nav [data-action="projects"]').click();await page.waitForSelector('.collection-item');};
 const card=name=>page.locator('.collection-item').filter({has:page.locator('h3',{hasText:new RegExp('^'+name+'$')})});
 try{
  await attach();await close();
  await page.evaluate(async()=>{
   const p=Studio.project;p.name='Zulu Current';p.pageSize='a5';p.pages=3;p.items=[DM.item('rect',{page:0}),DM.item('stripe',{page:1}),DM.item('text',{page:2,text:'RACING'})];page=2;Studio.select([p.items[2].id]);
   for(const name of ['Alfa Sprint','Bravo Endurance']){const q=DM.project(name);q.pageSize='photo4x6';q.items=[DM.item('ellipse',{name})];await desktop.saveProject({project:q});}
  });
  await page.locator('#font-file').setInputFiles(process.env.TEST_FONT||(process.platform==='win32'?'C:/Windows/Fonts/arial.ttf':process.platform==='darwin'?'/System/Library/Fonts/Supplemental/Arial.ttf':'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'));
  await page.waitForFunction(()=>Studio.project.fonts.length===1);
  await page.locator('.projectbar [data-action="save-sheet"]').click();await page.waitForFunction(()=>!projectTask);
  await page.keyboard.press('Control+s');await page.waitForFunction(()=>!projectTask);assert.equal((await fs.readdir(path.join(run,'exports')).catch(()=>[])).length,0);
  const original=await state();
  await page.locator('nav [data-action="sharing"]').click();
  for(const theme of ['dark','light']){
   await page.evaluate(t=>setTheme(t),theme);
   const styles=await page.locator('.transfer-button').evaluateAll(buttons=>buttons.map(b=>({x:b.getBoundingClientRect().x,bg:getComputedStyle(b).backgroundColor,colour:getComputedStyle(b.querySelector('strong')).color,exporting:b.classList.contains('transfer-export')})));
   assert.equal(styles.length,6);for(const b of styles){assert.equal(b.bg,'rgb(255, 255, 255)');assert.equal(b.colour,b.exporting?'rgb(199, 46, 59)':'rgb(38, 48, 61)');}assert(styles.filter(x=>x.exporting).every(x=>x.x>styles[0].x));
   await page.screenshot({path:path.join(run,'sharing-'+theme+'.png')});
  }
  await close();await browser();await page.locator('#project-sort').selectOption('name');
  await page.screenshot({path:path.join(run,'sheet-library-grid.png')});
  assert.deepEqual(await page.locator('.collection-name h3').allTextContents(),['Alfa Sprint','Bravo Endurance','Zulu Current']);assert(await page.locator('#library-export-selected').isDisabled());
  await card('Alfa Sprint').locator('.collection-name').click();await card('Zulu Current').locator('.collection-name').click({modifiers:['Shift']});assert.match(await page.locator('#collection-count').textContent(),/^3 selected/);
  await card('Bravo Endurance').locator('.collection-name').click({modifiers:['Control']});assert.match(await page.locator('#collection-count').textContent(),/^2 selected/);assert.deepEqual(await state(),original);
  await page.locator('[data-view="list"]').click();await page.locator('#project-search').fill('Alfa');assert.match(await page.locator('#collection-count').textContent(),/1 hidden/);await page.locator('#project-search').fill('');
  await page.screenshot({path:path.join(run,'sheet-library-list.png')});await page.locator('#library-export-selected').click();await page.waitForSelector('#collection-confirm');assert.equal(await page.locator('[data-select]:checked').count(),2);
  await card('Zulu Current').locator('[data-pages]').click();await card('Zulu Current').locator('[data-page-index="0"]').uncheck();await card('Zulu Current').locator('[data-page-index="1"]').uncheck();
  await confirm();const file=path.join(run,'exports','My sheet collection.sfsheet'),shared=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(shared.format,'slotforge-decals-sheets');assert.equal(shared.sheets.length,2);const zulu=shared.sheets.find(e=>e.project.name==='Zulu Current').project;assert.equal(zulu.pages,1);assert.equal(zulu.items[0].text,'RACING');assert.equal(zulu.items[0].page,0);assert.equal(zulu.fonts.length,1);assert.deepEqual(await state(),original);
  // Import only one collection member, without changing the active sheet.
  await page.locator('#project-file').setInputFiles(file);await card('Alfa Sprint').locator('[data-select]').uncheck();await confirm();assert.deepEqual(await state(),original);
  let all=(await page.evaluate(()=>desktop.listProjects())).entries;assert.equal(all.length,4);const copy=all.find(e=>e.name==='Zulu Current'&&e.id!==original.id);assert(copy);assert.equal(copy.pages,1);
  await page.locator('#project-file').setInputFiles(file);await confirm();all=(await page.evaluate(()=>desktop.listProjects())).entries;assert.equal(all.length,6);assert.equal(new Set(all.map(e=>e.id)).size,6);
  // Legacy single-sheet export, page selection on import, and a blank template.
  await page.locator('.projectbar [data-action="export-sheet"]').click();await confirm();const single=path.join(run,'exports','Zulu Current.sfsheet');assert.deepEqual(JSON.parse(await fs.readFile(single,'utf8')).project,original);
  await page.locator('#project-file').setInputFiles(single);await page.locator('[data-pages]').click();await page.locator('[data-page-index="0"]').uncheck();await confirm();assert((await page.evaluate(()=>desktop.listProjects())).entries.some(e=>e.pages===2));
  const blank=await page.evaluate(()=>({...DM.project(),pageSize:'a5',scale:43,margin:8}));await page.locator('#project-file').setInputFiles({name:'blank.sfsheet',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'slotforge-decals-sheet',version:2,project:blank}))});await confirm();
  const blankEntry=(await page.evaluate(()=>desktop.listProjects())).entries.find(e=>e.name==='Untitled sheet');assert(blankEntry);assert.deepEqual(await state(),original);
  await page.evaluate(e=>openProjectEntry(e),blankEntry);await page.evaluate(()=>{Studio.project.margin=11;});
  const blankFile=path.join(run,'workspace','Projects',blankEntry.file),blankBytes=await fs.readFile(blankFile),beforeFailure=await state();await fs.writeFile(blankFile,'{broken');
  await page.locator('.projectbar [data-action="new"]').click();await page.waitForFunction(()=>!projectTask&&document.querySelector('#toast').classList.contains('error'));assert.deepEqual(await state(),beforeFailure);await fs.writeFile(blankFile,blankBytes);
  await page.locator('.projectbar [data-action="new"]').click();await page.waitForFunction(()=>!projectTask);
  const refreshed=(await page.evaluate(()=>desktop.listProjects())).entries.find(e=>e.id===blankEntry.id);assert.equal((await page.evaluate(e=>desktop.readProject(e),refreshed)).project.margin,11);
  // Decal selections use the same controls; only selected decals travel.
  await page.evaluate(()=>{library=['Alfa Badge','Bravo Badge','Charlie Badge'].map((name,n)=>({id:DM.uid(),name,scale:32,added:new Date(2020+n,0,1).toISOString(),updated:new Date(2020+n,0,1).toISOString(),art:DM.item('rect',{name,w:10+n})}));libraryFonts=[];revision++;render();});
  const beforeDecals=await state();await page.locator('nav [data-action="library"]').click();await page.locator('#project-sort').selectOption('name');await page.locator('[data-view="list"]').click();await card('Bravo Badge').locator('[data-select]').check();assert.deepEqual(await state(),beforeDecals);
  await page.locator('#library-export-selected').click();assert.equal(await page.locator('[data-select]:checked').count(),1);await confirm();const decalFile=path.join(run,'exports','Bravo Badge.sfdecal');assert.equal(JSON.parse(await fs.readFile(decalFile,'utf8')).decals.length,1);
  await page.locator('#pack-file').setInputFiles(decalFile);await confirm();assert.equal(await page.evaluate(()=>Studio.library.length),4);
  await page.locator('nav [data-action="library"]').click();await page.locator('#project-sort').selectOption('name-desc');await page.screenshot({path:path.join(run,'decal-library-list.png')});await close();
  // Backups cannot be restored accidentally through Import Decals.
  const backup=await page.evaluate(()=>assetsSnapshot()),backupFile={name:'workspace.sfbackup',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))};
  await page.locator('#pack-file').setInputFiles(backupFile);await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('own import options'));assert.deepEqual(await state(),beforeDecals);
  await page.locator('nav [data-action="settings"]').click();const chooser=page.waitForEvent('filechooser');await page.locator('[data-action="restore-backup"]').click();await(await chooser).setFiles(backupFile);await page.waitForSelector('#confirm');assert.match(await page.locator('#dialog h2').textContent(),/Restore workspace backup/);await close();
  // Failed or cancelled export keeps the picker and current work intact.
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('export-file');ipcMain.handle('export-file',()=>null);});await page.locator('.projectbar [data-action="export-sheet"]').click();await page.locator('#collection-confirm').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Sheet export cancelled'));assert(await page.locator('#dialog').isVisible());await close();
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('export-file');ipcMain.handle('export-file',()=>{throw Error('Simulated write failure');});});await page.locator('.projectbar [data-action="export-sheet"]').click();await page.locator('#collection-confirm').click();await page.waitForFunction(()=>document.querySelector('#dialog-error').textContent.includes('Simulated write failure'));assert.deepEqual(await state(),beforeDecals);await close();
  await page.evaluate(()=>Studio.flush());await app.close();app=await launch();page=await app.firstWindow();await attach();
  await page.locator('nav [data-action="library"]').click();assert.equal(await page.locator('#collection-items').getAttribute('data-view'),'list');assert.equal(await page.locator('#project-sort').inputValue(),'name-desc');assert.equal(await page.evaluate(()=>Studio.library.length),4);await close();await browser();assert.equal(await page.locator('#collection-items').getAttribute('data-view'),'list');assert.equal(await page.locator('#project-sort').inputValue(),'name');assert.deepEqual(errors,[]);
  await close();await page.evaluate(()=>setTheme('dark'));await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,720));await page.locator('nav [data-action="library"]').click();await page.locator('[data-view="grid"]').click();await page.screenshot({path:path.join(run,'decal-library-dark-grid.png')});
  const foot=await page.locator('.dialog-foot').boundingBox();assert(foot.y+foot.height<=await page.evaluate(()=>innerHeight));await close();
  // Another installation can import the collection and edit the embedded-font page.
  await app.close();app=await launch({SLOTFORGE_WORKSPACE:path.join(run,'recipient-workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'recipient-profile')});page=await app.firstWindow();await attach();await close();const recipientBefore=await state();
  await page.locator('#project-file').setInputFiles(file);await confirm();assert.deepEqual(await state(),recipientBefore);
  const received=(await page.evaluate(()=>desktop.listProjects())).entries;assert.equal(received.length,2);await page.evaluate(e=>openProjectEntry(e),received.find(e=>e.name==='Zulu Current'));
  assert.equal((await state()).fonts[0].data,zulu.fonts[0].data);assert.equal((await state()).items[0].text,'RACING');assert.equal(await page.evaluate(()=>Studio.library.length),0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,checks:'white import/export columns in both themes, shared libraries, sort and view persistence, checkbox/Ctrl/Shift selection, hidden selections, multi-sheet editable collections, selected pages, embedded fonts, legacy/blank imports, independent identities, current-sheet preservation, decal selection round trips, failed/cancelled exports and restart',errors}));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
