const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp'),S=require('../src/sqlite-store.cjs'),D=require('../renderer/model');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','paged-libraries-'+Date.now()),workspace=path.join(run,'workspace');await fs.mkdir(workspace,{recursive:true});
 const png='data:image/png;base64,'+(await sharp({create:{width:40,height:30,channels:4,background:'#df2345'}}).png().toBuffer()).toString('base64');
 const art=D.item('image',{src:png,pixelsW:40,pixelsH:30,w:20,h:15});
 S.execute(workspace,'catalog-import',{decals:Array.from({length:155},(_,n)=>({id:'seed-'+n,name:'Sponsor '+n,tags:n%2?'Red team':'Blue team',scale:32,art})),fonts:[]});
 for(let n=0;n<110;n++){const project=D.project('Saved '+n);project.items=[art];S.execute(workspace,'saveSheet',{project});}
 const env={...process.env,SLOTFORGE_WORKSPACE:workspace,SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});let app=await launch(),page=await app.firstWindow();const errors=[];
 const attach=async()=>{page.on('pageerror',e=>errors.push(e.message));await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.showInactive();win.setSize(1100,800);});await page.waitForFunction(()=>window.Studio?.ready&&!document.body.inert);};
 const loaded=()=>page.waitForFunction(()=>document.querySelector('#collection-items')?.dataset.loading==='false');
 const close=()=>page.locator('#dialog [data-action="close"]').first().click();
 try{
  await attach();await close();await page.locator('#library-grid [data-lib]').first().waitFor();assert.equal(await page.evaluate(()=>Studio.libraryCount),155);assert.equal(await page.locator('#library-grid .library-card').count(),24);
  assert.equal(await page.evaluate(()=>assetsSnapshot().library.length),0);assert((await page.evaluate(()=>JSON.stringify(assetsSnapshot()).length))<10000);
  await page.locator('#sidebar-next').click();await page.waitForFunction(()=>document.querySelector('#sidebar-page').textContent.startsWith('25–'));assert.equal(await page.locator('#library-grid .library-card').count(),24);
  await page.locator('nav [data-action="library"]').click();await loaded();await page.locator('#project-sort').selectOption('name');await loaded();assert.equal(await page.locator('.collection-item').count(),48);
  await page.locator('.collection-item [data-select]').first().check();const first=await page.locator('.collection-name h3').first().textContent();
  await page.locator('#collection-next').click();await loaded();assert.equal(await page.locator('.collection-name h3').first().textContent(),'Sponsor 48');await page.locator('.collection-item [data-select]').first().check();assert.match(await page.locator('#collection-count').textContent(),/^2 selected/);
  await page.locator('#project-search').fill('Sponsor 154');await page.waitForFunction(()=>document.querySelectorAll('.collection-item').length===1&&document.querySelector('.collection-name h3')?.textContent==='Sponsor 154');assert.match(await page.locator('#collection-count').textContent(),/2 on other pages or hidden/);
  await page.locator('#library-export-selected').click();await loaded();assert.match(await page.locator('#collection-confirm').textContent(),/2 Decals/);await page.locator('#collection-confirm').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);
  const pack=JSON.parse(await fs.readFile(path.join(run,'exports','My decal collection.sfdecal'),'utf8'));assert.deepEqual(pack.decals.map(d=>d.name).sort(),[first,'Sponsor 48'].sort());assert(pack.decals.every(d=>d.art.src===png));
  await page.locator('nav [data-action="library"]').click();await loaded();await page.locator('#project-search').fill('Sponsor 1');await page.locator('#project-search').fill('Sponsor 154');await page.waitForFunction(()=>document.querySelectorAll('.collection-item').length===1&&document.querySelector('.collection-name h3')?.textContent==='Sponsor 154');
  await page.locator('[data-collection-action="add"]').click();await page.waitForFunction(()=>Studio.project.items.length===1&&!document.querySelector('#dialog').open);assert.equal(await page.evaluate(()=>Studio.project.items[0].src),png);
  await page.locator('nav [data-action="projects"]').click();await loaded();assert.equal(await page.locator('.collection-item').count(),48);await page.locator('[data-view="list"]').click();assert.equal(await page.locator('#collection-items').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),2);
  await page.locator('#collection-next').click();await loaded();assert.equal(await page.locator('.collection-item').count(),48);await page.locator('#collection-next').click();await loaded();assert.equal(await page.locator('.collection-item').count(),15);await page.screenshot({path:path.join(run,'paged-sheets-dark.png')});await close();
  await page.evaluate(()=>setTheme('light'));await page.locator('nav [data-action="library"]').click();await loaded();await page.locator('[data-view="list"]').click();await page.screenshot({path:path.join(run,'paged-decals-light.png')});
  const geometry=await page.locator('.dialog-foot').boundingBox();assert(geometry.y+geometry.height<=await page.evaluate(()=>innerHeight));await close();
  await page.evaluate(()=>Studio.flush());const cache=await page.evaluate(()=>Library.cacheInfo);assert(cache.entries<=64&&cache.bytes<=8e6);
  // Conflicting embedded font names must not silently change existing text.
  await page.evaluate(async()=>{const f={family:'sf-font-collision',data:'data:font/ttf;base64,AAAA'},other={...f,data:'data:font/ttf;base64,BBBB'};project.fonts=[f];const e=await Library.save({id:DM.uid(),name:'Collision',scale:32,art:DM.item('text',{font:f.family})},[other]);let message='';try{await addFromLibrary(e.id);}catch(error){message=error.message;}if(!message.includes('different font')||project.fonts[0].data!==f.data)throw Error('Font collision changed sheet');await Library.remove(e);project.fonts=[];await Studio.flush();});
  // Exercise the in-app restore path as well as startup recovery.
  await page.evaluate(()=>desktop.completeBackup());const backup=path.join(run,'exports','SlotForge-Decals-complete.sfdbbackup');
  await page.evaluate(async()=>{await Library.remove((await Library.query({limit:1})).entries[0]);});assert.equal(await page.evaluate(()=>Studio.libraryCount),154);
  await app.evaluate(({dialog},backup)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[backup]});dialog.showMessageBox=async()=>({response:1});},backup);
  await page.evaluate(()=>actions['complete-restore']());assert.equal(await page.evaluate(()=>Studio.libraryCount),155);assert.equal(await page.evaluate(()=>Studio.project.items[0].src),png);
  await app.close();app=await launch();page=await app.firstWindow();await attach();assert.equal(await page.evaluate(()=>Studio.libraryCount),155);assert.equal(await page.evaluate(()=>Studio.project.items[0].src),png);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,checks:'bounded sidebar and dialog pages, SQL search and natural sorting, cross-page selections and exports, rapid searches, on-demand placement, both themes, compact layout, bounded thumbnail cache, lean autosave and restart',cache,errors}));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
