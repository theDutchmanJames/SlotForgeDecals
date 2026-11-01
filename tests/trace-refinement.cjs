const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','trace-refinement-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile'),SLOTFORGE_EXPORT_DIR:path.join(run,'exports')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});
 let app=await launch(),page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const done=()=>page.locator('#dialog [data-action="close"]').last().click();
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#trace-apply').disabled);
 const open=async()=>{await page.locator('[data-action="trace"]').click();await ready();};
 const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Studio.project.items[0])));
 const paths=()=>page.locator('#trace-preview [data-trace-shape]').count();
 try{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForFunction(()=>window.Studio?.ready);await done();
  await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='#ed2438';ctx.fillRect(30,40,130,140);ctx.clearRect(60,70,70,80);ctx.fillRect(230,190,40,20);ctx.fillStyle='#245cc3';ctx.fillRect(250,70,80,80);ctx.fillStyle='#000';ctx.fillRect(10,10,8,8);
   const i=DM.item('image',{name:'Refinement fixture',src:c.toDataURL(),pixelsW:400,pixelsH:240,x:20,y:30,w:40,h:24,rotation:17,flipX:true,carPositions:{side:{x:35,y:15}}});Studio.project.items=[i];Studio.select([i.id]);});
  const original=await state();assert.equal(await page.locator('.artwork-badge').textContent(),'Raster');await open();
  await page.locator('#trace-colors').fill('3');await page.locator('#trace-detail').selectOption('fine');await page.locator('#trace-update').click();await ready();assert.equal(await paths(),4);
  const red=page.locator('[data-trace-hex="#ed2438"]');await red.fill('oops');await red.press('Tab');assert.ok(await page.locator('#trace-apply').isDisabled());assert.ok((await page.locator('#dialog-error').textContent()).includes('six-digit'));
  await red.fill('#00aa44');await red.press('Tab');assert.equal(await page.locator('#trace-preview path[fill="#00aa44"]').count(),2);assert.ok(await page.locator('#trace-apply').isEnabled());assert.deepEqual(await state(),original);
  await page.locator('#trace-preview path[fill="rgb(0,0,0)"]').click();assert.ok(await page.locator('#trace-remove-shape').isEnabled());await page.locator('#trace-remove-shape').click();assert.equal(await paths(),3);
  await page.locator('#trace-edit-undo').click();assert.equal(await paths(),4);await page.locator('#trace-edit-redo').click();assert.equal(await paths(),3);
  await page.locator('#trace-zoom').selectOption('4');await page.locator('#trace-vector-view').evaluate(e=>{e.scrollLeft=160;e.scrollTop=80;});await page.waitForFunction(()=>document.querySelector('#trace-original-view').scrollLeft===document.querySelector('#trace-vector-view').scrollLeft&&document.querySelector('#trace-original-view').scrollTop===80);
  await page.locator('#trace-original-view').evaluate(e=>{e.scrollLeft=90;e.scrollTop=40;});await page.waitForFunction(()=>document.querySelector('#trace-vector-view').scrollLeft===90&&document.querySelector('#trace-vector-view').scrollTop===40,{},{timeout:5000});
  await page.locator('#trace-zoom').selectOption('1');await page.locator('#trace-next-shape').click();await page.locator('.trace-generation summary').click();await page.screenshot({path:path.join(run,'refined-preview.png')});
  await page.locator('#trace-apply').click();const refined=await state();assert.equal(refined.kind,'svg');for(const key of ['x','y','w','h','rotation','flipX'])assert.equal(refined[key],original[key]);assert.deepEqual(refined.carPositions,original.carPositions);
  assert.ok(!refined.svg.includes('data-trace-shape'));assert.ok(!refined.svg.includes('#ffa000'));assert.equal(await page.locator('.artwork-badge').textContent(),'Traced vector');
  const samples=await page.evaluate(async()=>{const im=new Image();im.src=Art.url(Studio.project.items[0].svg);await im.decode();const c=document.createElement('canvas');c.width=400;c.height=240;const ctx=c.getContext('2d');ctx.drawImage(im,0,0,400,240);return [[40,100],[80,100],[12,12],[260,100],[240,200]].map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);});
  assert.deepEqual(samples,[[0,170,68,255],[0,0,0,0],[0,0,0,0],[36,92,195,255],[0,170,68,255]]);
  await page.keyboard.press('Control+z');assert.deepEqual(await state(),original);await page.keyboard.press('Control+Shift+z');await page.evaluate(()=>Studio.select([Studio.project.items[0].id]));
  await open();assert.equal(await paths(),3);assert.equal(await page.locator('[data-trace-hex="#00aa44"]').count(),1);assert.ok(await page.locator('#trace-edit-undo').isDisabled(),'Reopening loads the edited SVG without re-tracing');
  await page.locator('#trace-update').click();await ready();assert.equal(await paths(),4);assert.equal(await page.locator('[data-trace-hex="#ed2438"]').count(),1);await page.locator('#trace-edit-undo').click();assert.equal(await paths(),3);assert.equal(await page.locator('[data-trace-hex="#00aa44"]').count(),1);
  await page.locator('#trace-edit-redo').click();assert.equal(await paths(),4);await page.locator('#trace-edit-undo').click();
  // Prevent deleting every path, and undo the local removals.
  for(let n=0;n<2;n++){await page.locator('#trace-next-shape').click();await page.locator('#trace-remove-shape').click();}assert.equal(await paths(),1);await page.locator('#trace-next-shape').click();assert.ok(await page.locator('#trace-remove-shape').isDisabled());await page.locator('#trace-edit-undo').click();await page.locator('#trace-edit-undo').click();assert.equal(await paths(),3);
  await page.locator('[data-trace-hex="#245cc3"]').fill('#ffff00');await page.locator('[data-trace-hex="#245cc3"]').press('Tab');await done();assert.equal((await state()).svg,refined.svg);
  await page.evaluate(()=>{Studio.project.name='Refined vector';});await page.evaluate(()=>Studio.exportPDF(false,true));
  const m=await import('mupdf'),doc=m.Document.openDocument(await fs.readFile(path.join(run,'exports','Refined vector.pdf')),'application/pdf'),sheet=doc.loadPage(0);let images=0,green=0,black=0;
  const dev=new m.Device({fillImage(){images++;},fillPath(p,eo,ctm,cs,color){if(Math.abs(color[0])<.01&&Math.abs(color[1]-170/255)<.01&&Math.abs(color[2]-68/255)<.01)green++;if(color.slice(0,3).every(c=>c<.01))black++;}});sheet.run(dev,m.Matrix.identity);dev.close();dev.destroy();sheet.destroy();doc.destroy();assert.equal(images,0);assert.equal(green,2);assert.equal(black,0);
  await page.locator('#inspector [data-action="save-decal"]').click();await page.locator('#save-decal-confirm').click();assert.ok((await page.locator('.lib-type').first().textContent()).includes('Traced vector'));
  await page.locator('[data-action="export-pack"]').first().click();await page.locator('#pack-export').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Decal pack exported'));
  const pack=JSON.parse(await fs.readFile(path.join(run,'exports','Refinement fixture.sfdecal'),'utf8'));assert.equal(pack.decals[0].art.svg,refined.svg);
  // Reject unsupported styled SVGs rather than injecting stylesheet rules into the app.
  assert.ok(await page.evaluate(()=>{try{TraceRefine.load('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>button{fill:red}</style><path d="M0 0H10V10Z" fill="#ff0000"/></svg>');return false;}catch{return true;}}));
  await page.evaluate(()=>Studio.flush());await app.close();app=await launch();page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForFunction(()=>window.Studio?.ready);await page.evaluate(()=>Studio.select([Studio.project.items[0].id]));await open();assert.equal(await paths(),3);assert.equal(await page.locator('[data-trace-hex="#00aa44"]').count(),1);await done();await page.locator('[data-action="restore-image"]').click();assert.equal((await state()).src,original.src);assert.equal(await page.locator('.artwork-badge').textContent(),'Raster');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,samples,pdf:{images,green,black},checks:'palette replacement across shapes, invalid colours, individual removal, local and sheet undo/redo, linked zoom/scroll, preserved holes, clean SVG/vector PDF, saved refinements on reopening, reversible re-trace, cancellation, sharing, badges and restart persistence',errors},null,2));
 }catch(error){console.log(await page.evaluate(()=>({error:document.querySelector('#dialog-error')?.textContent,scroll:['trace-original-view','trace-vector-view'].map(id=>{const e=document.getElementById(id);return e&&{id,left:e.scrollLeft,top:e.scrollTop,w:e.clientWidth,h:e.clientHeight,sw:e.scrollWidth,sh:e.scrollHeight};})})));throw error;}finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
