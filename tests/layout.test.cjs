const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../renderer/model.js'),L=require('../renderer/layout.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('grid repeats rotated selections at measured cell gaps without changing originals',()=>{
 const p=M.project();p.items=[M.item('rect',{x:25,y:25,w:20,h:10,rotation:30,locked:true,carPositions:{side:{x:40,y:15}}}),M.item('text',{x:55,y:30,w:10,h:5,text:'27'})];
 const before=M.clone(p),ids=p.items.map(i=>i.id),plan=L.gridPlan(p,ids,{rows:2,columns:3,gapX:4,gapY:7}),r=L.grid(p,ids,plan);
 assert.deepEqual(p,before);assert.deepEqual(r.project.items.slice(0,2),p.items);assert.equal(r.added,10);assert.equal(new Set(r.ids).size,12);
 const b=M.union(r.project.items.slice(2,4));near(b.x-plan.bounds.x-plan.bounds.w,4);
 const secondRow=M.union(r.project.items.slice(6,8));near(secondRow.y-plan.bounds.y-plan.bounds.h,7);
 assert.equal(r.project.items[2].locked,false);assert.equal(r.project.items[2].carPositions,undefined);assert.equal(r.project.items[2].rotation,30);assert.equal(r.project.items[2].w,20);
 assert.throws(()=>L.grid(p,ids,{rows:1,columns:1,gapX:3,gapY:3}),/at least two/);
 assert.throws(()=>L.grid(p,ids,{rows:2.5,columns:2,gapX:3,gapY:3}),/whole numbers/);
 assert.throws(()=>L.grid(p,ids,{rows:100,columns:100,gapX:3,gapY:3}),/2,000/);
 assert.throws(()=>L.grid(p,ids,{rows:2,columns:20,gapX:3,gapY:3}),/margins/);
});
test('equal gaps preserve anchors, artwork sizes, other pages and rotation',()=>{
 const p=M.project();p.pages=2;p.items=[M.item('rect',{x:10,y:20,w:10,h:10}),M.item('rect',{x:35,y:30,w:20,h:10,rotation:30}),M.item('rect',{x:100,y:40,w:10,h:10}),M.item('rect',{page:1})];
 const ids=p.items.slice(0,3).map(i=>i.id),out=L.distribute(p,ids,'x'),b=out.items.map(M.bounds);
 near(b[1].x-b[0].x-b[0].w,b[2].x-b[1].x-b[1].w);assert.deepEqual(out.items[0],p.items[0]);assert.deepEqual(out.items[2],p.items[2]);assert.deepEqual(out.items[3],p.items[3]);
 assert.equal(out.items[1].rotation,30);assert.equal(out.items[1].w,20);assert.equal(out.items[1].y,30);
 p.items[1].locked=true;assert.throws(()=>L.distribute(p,ids,'x'),/Unlock/);p.items[1].locked=false;p.items[2].x=35;assert.throws(()=>L.distribute(p,ids,'x'),/Not enough space/);
});
test('alignment uses rotated edges and centres on either axis',()=>{
 const p=M.project();p.items=[M.item('rect',{x:20,y:20,w:20,h:10,rotation:45}),M.item('ellipse',{x:80,y:90,w:10,h:10})];const ids=p.items.map(i=>i.id);
 for(const axis of ['x','y'])for(const edge of ['start','center','end']){const out=L.align(p,ids,axis,edge),b=out.items.map(M.bounds),s=axis==='x'?'w':'h',k={start:0,center:.5,end:1}[edge];near(b[0][axis]+b[0][s]*k,b[1][axis]+b[1][s]*k);}
});
test('mirroring is reversible, preserves positions and survives sharing',()=>{
 const p=M.project();p.items=[M.item('text',{text:'27',x:20,y:20,rotation:35})];const ids=p.items.map(i=>i.id);
 for(const axis of ['x','y']){const out=L.mirror(p,ids,axis);assert.equal(out.items[0].rotation,-35);assert.equal(out.items[0].x,20);assert.equal(out.items[0][axis==='x'?'flipX':'flipY'],true);assert.deepEqual(L.mirror(out,ids,axis),p);const pack=M.readPack(M.pack([{name:'Mirror',scale:32,art:out.items[0]}]));assert.equal(pack.decals[0].art[axis==='x'?'flipX':'flipY'],true);}
 const g=M.group([M.item('text',{x:10,y:20,w:20,h:10,rotation:20}),M.item('rect',{x:40,y:25,w:10,h:5})]);g.flipX=true;const children=M.ungroup(g);
 near(children[0].x,g.x+(g.baseW-g.children[0].x-g.children[0].w));assert.equal(children[0].rotation,-20);assert.equal(children[0].flipX,true);
});
test('page moves keep layout, create only the next page and protect locked selections',()=>{
 const p=M.project();p.items=[M.item('rect',{rotation:15}),M.item('line',{x:80})];const ids=[p.items[0].id],out=L.movePage(p,ids,1);
 assert.equal(out.pages,2);assert.deepEqual(out.items[0],{...p.items[0],page:1});assert.deepEqual(out.items[1],p.items[1]);assert.equal(p.pages,1);
 assert.throws(()=>L.movePage(p,ids,0),/already/);assert.throws(()=>L.movePage(p,ids,3),/existing page/);p.items[0].locked=true;assert.throws(()=>L.movePage(p,ids,1),/Unlock/);
});
