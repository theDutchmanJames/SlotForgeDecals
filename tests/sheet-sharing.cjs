const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','sheet-sharing-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=environment=>electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env:environment});
 let app=await launch(env),page=await app.firstWindow();const errors=[];
 const attach=async()=>{page.on('pageerror',e=>errors.push(e.message));await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.showInactive();w.setSize(1100,800);});await page.waitForFunction(()=>window.Studio?.ready);};
 const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Studio.project)));
 const close=()=>page.locator('#dialog [data-action="close"]').first().click();
 const browser=async()=>{await page.locator('nav [data-action="projects"]').click();await page.waitForSelector('.project-card');assert.match(await page.locator('#projects-notice').textContent(),/^\d+ sheets?$/);};
 const card=name=>page.locator('.project-card').filter({has:page.locator('h3',{hasText:new RegExp('^'+name+'$')})});
 try{
  await attach();await close();
  await page.evaluate(()=>{
   const p=Studio.project;p.name='Shared racing sheets';p.pages=2;p.pageSize='a5';p.scale=24;
   const square=DM.item('rect',{name:'Panel',x:0,y:0,w:15,h:12,fill:'#e5484d'});
   p.items=[DM.item('text',{id:'lettering',name:'Editable lettering',text:'RACING',x:20,y:20,w:40,h:12}),DM.item('group',{name:'Grouped sponsor',x:20,y:40,w:15,h:12,baseW:15,baseH:12,children:[square]}),DM.item('slice',{name:'Saved strip',page:1,x:10,y:10,w:10,h:8,baseW:10,baseH:8,children:[square]})];Studio.select(['lettering']);
  });
  await page.locator('#font-file').setInputFiles(process.env.TEST_FONT||(process.platform==='win32'?'C:/Windows/Fonts/arial.ttf':process.platform==='darwin'?'/System/Library/Fonts/Supplemental/Arial.ttf':'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'));
  await page.waitForFunction(()=>Studio.project.fonts.length===1);
  await page.locator('.projectbar [data-action="save-sheet"]').click();await page.waitForFunction(()=>!projectTask&&document.querySelector('#toast').textContent.startsWith('Saved to Sheet Library'));
  assert.equal((await page.evaluate(()=>desktop.listProjects())).entries.length,1);assert.equal((await fs.readdir(path.join(run,'exports')).catch(()=>[])).length,0,'Local save must not export a file');
  // Ctrl+S is also a local save, including edits made after the first save.
  await page.evaluate(()=>{Studio.project.items[0].text='RACING TEAM';Studio.select([]);});await page.keyboard.press('Control+s');await page.waitForFunction(()=>!projectTask);
  const original=await state(),savedEntry=(await page.evaluate(()=>desktop.listProjects())).entries[0];
  assert.equal((await page.evaluate(e=>desktop.readProject(e),savedEntry)).project.items[0].text,'RACING TEAM');
  assert.equal((await fs.readdir(path.join(run,'exports')).catch(()=>[])).length,0);
  await page.locator('.projectbar [data-action="export-sheet"]').click();await page.waitForFunction(()=>!projectTask&&document.querySelector('#toast').textContent.startsWith('Editable sheet exported'));
  const sharedFile=path.join(run,'exports','Shared racing sheets.sfsheet'),shared=JSON.parse(await fs.readFile(sharedFile,'utf8'));
  assert.equal(shared.format,'slotforge-decals-sheet');assert.equal(shared.version,2);assert.deepEqual(shared.project,original);
  // Sharing a saved card must not open it or export the current sheet instead.
  await page.locator('.projectbar [data-action="new"]').click();await page.waitForFunction(()=>!projectTask);
  await page.evaluate(()=>{Studio.project.name='Current work';Studio.project.items=[DM.item('ellipse',{x:20,y:20,w:10,h:10})];Studio.select([]);});
  const active=await state();await fs.unlink(sharedFile);await browser();await card('Shared racing sheets').locator('[data-project-export]').click();await page.waitForFunction(()=>!projectTask);
  assert.deepEqual(await state(),active);assert.deepEqual(JSON.parse(await fs.readFile(sharedFile,'utf8')).project,original);
  assert.equal(await page.locator('#dialog h2').textContent(),'Sheet Library');await page.screenshot({path:path.join(run,'sheet-library-dark.png')});await close();
  await page.locator('[data-action="theme-light"]').click();await browser();await page.screenshot({path:path.join(run,'sheet-library-light.png')});await close();
  // Importing twice creates independent identities without overwriting the saved original.
  const ids=[];
  for(let n=0;n<2;n++){
   await browser();const chooser=page.waitForEvent('filechooser');await page.locator('#dialog [data-action="open-sheet-file"]').click();await (await chooser).setFiles(sharedFile);
   await page.locator('#confirm').click();await page.waitForFunction(()=>!projectTask&&!document.querySelector('#dialog').open);
   const imported=await state();ids.push(imported.id);assert.notEqual(imported.id,original.id);assert.deepEqual({...imported,id:original.id,updated:original.updated},original);
  }
  assert.notEqual(ids[0],ids[1]);assert.equal((await page.evaluate(()=>desktop.listProjects())).entries.length,4);
  assert.equal((await page.evaluate(e=>desktop.readProject(e),savedEntry)).project.id,original.id);
  // Header, toolbar and import/export remain usable at the minimum width.
  const layout=await page.evaluate(()=>{
   const bounds=s=>{const b=document.querySelector(s).getBoundingClientRect();return{x:b.x,right:b.right,y:b.y,bottom:b.bottom};};
   return{width:innerWidth,nav:bounds('nav'),tools:bounds('.header-tools'),buttons:['#project-name','#sheet-size-select','#scale-badge','#undo','#redo','[data-action="new"]','.projectbar [data-action="save-sheet"]','.projectbar [data-action="export-sheet"]','.projectbar [data-action="pdf"]'].map(bounds)};
  });
  assert(layout.nav.right<=layout.tools.x);for(let n=0;n<layout.buttons.length;n++){const b=layout.buttons[n];assert(b.right<=layout.width);if(n)assert(layout.buttons[n-1].right<=b.x);}
  await page.screenshot({path:path.join(run,'editor-compact.png')});
  await page.locator('nav [data-action="sharing"]').click();assert(await page.locator('#dialog [data-action="export-sheet"]').isVisible());assert(await page.locator('#dialog [data-action="open-sheet-file"]').isVisible());await close();
  // A separate workspace represents another user's installation.
  await app.close();app=await launch({...env,SLOTFORGE_WORKSPACE:path.join(run,'recipient-workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'recipient-profile')});page=await app.firstWindow();await attach();await close();
  await page.locator('#project-file').setInputFiles(sharedFile);await page.locator('#confirm').click();await page.waitForFunction(()=>!projectTask&&!document.querySelector('#dialog').open);
  const recipient=await state();assert.deepEqual({...recipient,id:original.id,updated:original.updated},original);assert.equal(await page.evaluate(()=>Studio.library.length),0);
  const recipientId=recipient.id;await page.evaluate(()=>Studio.flush());await app.close();app=await launch({...env,SLOTFORGE_WORKSPACE:path.join(run,'recipient-workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'recipient-profile')});page=await app.firstWindow();await attach();assert.equal((await state()).id,recipientId);assert.equal((await state()).fonts.length,1);assert.deepEqual(errors,[]);
  // Explicitly imported blank templates must survive switching to another sheet.
  const blank=await page.evaluate(()=>({...DM.project(),pageSize:'a5',scale:43,margin:8}));
  await page.locator('#project-file').setInputFiles({name:'Blank template.sfsheet',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'slotforge-decals-sheet',version:2,project:blank}))});
  await page.locator('#confirm').click();await page.waitForFunction(()=>!projectTask&&!document.querySelector('#dialog').open);const blankId=(await state()).id;
  assert((await page.evaluate(()=>desktop.listProjects())).entries.some(e=>e.id===blankId),'Imported blank template must be stored in Sheet Library');
  await page.evaluate(()=>{Studio.project.margin=11;});await page.locator('.projectbar [data-action="new"]').click();await page.waitForFunction(()=>!projectTask);
  const blankEntry=(await page.evaluate(()=>desktop.listProjects())).entries.find(e=>e.id===blankId);assert(blankEntry);assert.equal((await page.evaluate(e=>desktop.readProject(e),blankEntry)).project.margin,11);
  // An unreadable saved blank must block switching rather than being mistaken for a fresh blank.
  await page.evaluate(e=>openProjectEntry(e),blankEntry);const beforeFailure=await state(),blankFile=path.join(run,'recipient-workspace','Projects',blankEntry.file),blankBytes=await fs.readFile(blankFile);
  await fs.writeFile(blankFile,'{broken');await page.locator('.projectbar [data-action="new"]').click();await page.waitForFunction(()=>!projectTask&&document.querySelector('#toast').classList.contains('error'));assert.deepEqual(await state(),beforeFailure);await fs.writeFile(blankFile,blankBytes);
  // Cancelling a file export retains the local save. Failed writes never report success.
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('export-file');ipcMain.handle('export-file',()=>null);});
  await page.locator('.projectbar [data-action="export-sheet"]').click();await page.waitForFunction(()=>!projectTask&&document.querySelector('#toast').textContent.startsWith('Sheet export cancelled'));assert.deepEqual(await state(),beforeFailure);
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('export-file');ipcMain.handle('export-file',()=>{throw Error('Simulated export write failure');});});
  await page.locator('.projectbar [data-action="export-sheet"]').click();await page.waitForFunction(()=>!projectTask&&document.querySelector('#toast').classList.contains('error'));assert.match(await page.locator('#toast').textContent(),/Simulated export write failure/);assert.deepEqual(await state(),beforeFailure);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,checks:'local save and Ctrl+S without file export, explicit export, inactive card export, independent repeated imports, two-workspace round trip with fonts/groups/slices/multiple pages, recipient restart, blank template import, themes and compact layout',errors}));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
