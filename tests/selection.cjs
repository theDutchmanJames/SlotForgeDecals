const {_electron:electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const root=path.resolve(__dirname,'..'),run=path.join(root,'test-output','selection-'+Date.now());await fs.mkdir(run,{recursive:true});
 const env={...process.env,SLOTFORGE_WORKSPACE:path.join(run,'workspace'),SLOTFORGE_TEST_PROFILE:path.join(run,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({executablePath:process.env.SLOTFORGE_TEST_EXE||require('electron'),args:process.env.SLOTFORGE_TEST_EXE?[]:[root],env});
 let app=await launch(),page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const done=()=>page.locator('#dialog [data-action="close"]').last().click();
 const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(Studio.project.items)));
 const selected=()=>page.locator('#paper [data-id]:has(.selection)').evaluateAll(es=>es.map(e=>e.dataset.id).sort());
 const point=(x,y,selector='#paper')=>page.locator(selector).evaluate(async(svg,p)=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const q=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM());return{x:q.x,y:q.y};},{x,y});
 const click=async(x,y,modifier)=>{const p=await point(x,y);if(modifier)await page.keyboard.down(modifier);await page.mouse.click(p.x,p.y);if(modifier)await page.keyboard.up(modifier);};
 const box=async(x1,y1,x2,y2,modifier,cancel=false)=>{const p=await point(x1,y1),q=await point(x2,y2);if(modifier)await page.keyboard.down(modifier);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:8});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(modifier)await page.keyboard.up(modifier);};
 try{
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());await page.waitForFunction(()=>window.Studio?.ready);await done();
  await page.evaluate(()=>{Studio.project.pages=2;Studio.project.items=[
   DM.item('rect',{id:'a',name:'Number panel',x:20,y:25,w:20,h:10}),
   DM.item('stripe',{id:'b',name:'Side stripe',x:55,y:25,w:25,h:5}),
   DM.item('line',{id:'c',name:'Rotated line',x:100,y:90,w:25,h:2,rotation:45}),
   DM.item('ellipse',{id:'d',name:'Locked badge',x:20,y:100,w:10,h:10,locked:true}),
   DM.item('rect',{id:'e',name:'Other page',x:20,y:25,w:20,h:10,page:1})];Studio.select([]);});
  const original=await state();
  await box(10,15,85,50);assert.deepEqual(await selected(),['a','b']);assert.equal(await page.locator('#car-stage [data-car-id]').count(),2);assert.ok(await page.locator('#undo').isDisabled());
  await box(85,50,10,15);assert.deepEqual(await selected(),['a','b']);
  await click(25,30,'Control');assert.deepEqual(await selected(),['b']);
  await click(25,30,'Shift');assert.deepEqual(await selected(),['a','b']);
  await box(15,95,35,115,'Control');assert.deepEqual(await selected(),['a','b','d']);
  await box(140,150,150,160,null,true);assert.deepEqual(await selected(),['a','b','d']);assert.equal(await page.locator('.selection-marquee').count(),0);
  await box(25,30,35,40);let art=await state();assert.equal(art[0].x,30);assert.equal(art[1].x,65);assert.deepEqual(art[3],original[3]);assert.deepEqual(art[4],original[4]);
  await page.keyboard.press('Control+z');assert.deepEqual(await state(),original);
  await page.evaluate(()=>Studio.select(['a','b']));await box(25,30,45,50,null,true);assert.deepEqual(await state(),original);assert.ok(await page.locator('#undo').isDisabled());assert.ok(await page.locator('#redo').isEnabled());
  await click(150,160);assert.deepEqual(await selected(),[]);assert.ok(await page.locator('#redo').isEnabled());
  await page.locator('summary:has-text("Sheet layers")').click();await page.locator('[data-layer="a"]').click();await page.locator('[data-layer="b"]').click({modifiers:['Control']});assert.deepEqual(await selected(),['a','b']);await page.locator('[data-layer="a"]').click({modifiers:['Shift']});assert.deepEqual(await selected(),['b']);
  await page.evaluate(()=>Studio.select(['a','b']));await page.locator('[data-action="expand-car"]').click();assert.equal(await page.locator('#expanded-car [data-car-id]').count(),2);assert.ok(await page.locator('#preview-w').isDisabled());assert.equal(await page.locator('#preview-selected-name').textContent(),'2 decals selected');
  // Two selected decals preserve their relative spacing and their actual dimensions.
  const rects=await page.locator('#expanded-car [data-car-id] > rect').evaluateAll(es=>es.map(e=>({x:+e.getAttribute('x'),y:+e.getAttribute('y'),w:+e.getAttribute('width'),h:+e.getAttribute('height')})));
  assert.equal(rects[1].x-rects[0].x,35);assert.deepEqual(rects.map(r=>[r.w,r.h]),[[20,10],[25,5]]);
  // Raw mouse coordinates need a stable, visible preview target before dragging.
  await page.locator('#expanded-car [data-car-id]').first().hover();
  const p=await point(rects[0].x+5,rects[0].y+5,'#expanded-car > svg'),q=await point(rects[0].x+13,rects[0].y+8,'#expanded-car > svg');
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:6});await page.mouse.up();
  art=await state();if(!art[0].carPositions){await page.screenshot({path:path.join(run,'car-drag-failure.png')});console.error(await page.evaluate(({p,q})=>({p,q,viewport:[innerWidth,innerHeight],hit:document.elementFromPoint(p.x,p.y)?.outerHTML,active:CanvasTools.active?.kind}),{p,q}));}assert.ok(Math.abs(art[0].carPositions.side.x-rects[0].x-8)<.3);assert.ok(Math.abs(art[0].carPositions.side.y-rects[0].y-3)<.3);assert.deepEqual(art[1],original[1]);assert.equal(art[0].x,20);assert.equal(art[0].y,25);assert.deepEqual(await selected(),['a','b']);
  const saved=JSON.parse(JSON.stringify(art));
  // Escape rolls back a car drag without closing the enlarged preview.
  const p2=await point(art[0].carPositions.side.x+5,art[0].carPositions.side.y+5,'#expanded-car > svg');
  await page.mouse.move(p2.x,p2.y);await page.mouse.down();await page.mouse.move(p2.x+30,p2.y+10,{steps:5});
  await page.evaluate(()=>Studio.flush());const duringDrag=(await new (require('../src/storage.cjs').Workspace)(path.join(run,'workspace')).read()).data;assert.deepEqual(duringDrag.project.items,saved,'Autosave keeps the last committed placement while a drag is cancellable');
  await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await state(),saved);assert.ok(await page.locator('#dialog').evaluate(d=>d.open));
  await page.screenshot({path:path.join(run,'multi-car-preview.png')});await done();await page.keyboard.press('Control+z');assert.deepEqual(await state(),original);await page.keyboard.press('Control+Shift+z');assert.deepEqual(await state(),saved);
  await page.evaluate(()=>Studio.select(['a']));await page.locator('[data-action="expand-car"]').click();assert.ok(await page.locator('#preview-w').isEnabled());await done();
  // Start selection outside the paper, and test zoomed coordinates.
  await box(-4,15,85,50);assert.deepEqual(await selected(),['a','b']);await page.locator('[data-action="zoom-in"]').click();await box(10,15,85,50);assert.deepEqual(await selected(),['a','b']);
  await page.locator('[data-action="fit"]').click();await page.screenshot({path:path.join(run,'multi-selection.png')});await page.evaluate(()=>Studio.flush());await app.close();
  app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.Studio?.ready);assert.deepEqual(await state(),saved);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({run,checks:'marquee both directions and outside paper, zoom, Ctrl/Shift and layers, additive selection, locked and other-page protection, group drag, cancellation, undo/redo, all selected decals at actual size, individual car positioning and persistence',errors},null,2));
 }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
