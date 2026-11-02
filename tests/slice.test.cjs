const test=require('node:test'),assert=require('node:assert/strict');
const DM=require('../renderer/model.js'),Slice=require('../renderer/slice.js');
test('slice clips bounds without altering original geometry, fonts, raster quality or ink',()=>{
 const font={family:'sf-font-test',data:'data:font/ttf;base64,AAAA'},p=DM.project();p.fonts=[font];
 p.items=[DM.item('text',{font:font.family,text:'27',x:15,y:10,w:25,h:10,ink:'white-only'}),DM.item('image',{x:10,y:10,w:25.4,h:25.4,pixelsW:300,pixelsH:300,src:'data:image/png;base64,AAAA'}),DM.item('rect',{page:1})];
 const before=JSON.stringify(p),r=Slice.region(p,0,{x:20,y:5,w:10,h:20}),a=Slice.artwork(r);
 assert.equal(a.children.length,2);assert.equal(a.children[0].x,-5);assert.equal(a.ink,'colour-white');assert.deepEqual(DM.bounds(a),{x:0,y:0,w:10,h:20});assert.equal(DM.rasters(a)[0].ppi,300);
 const pack=DM.readPack(DM.pack([{id:'a',name:'Slice',scale:32,art:a}],p.fonts));assert.deepEqual(pack.fonts,[font]);assert.equal(pack.decals[0].art.children[0].ink,'white-only');
 const crop=Slice.output(p,r,true),paper=Slice.output(p,r,false);assert.deepEqual(crop.dimensions,{w:10,h:20});assert.equal(crop.project.items[0].x,0);assert.equal(paper.project.items[0].x,20);assert.deepEqual(paper.dimensions,{w:210,h:297});assert.equal(paper.project.pages,1);assert.equal(JSON.stringify(p),before);
});
test('whole-decal expansion includes rotated and cascading intersections but respects sheet edges',()=>{
 const p=DM.project();p.items=[DM.item('rect',{x:10,y:10,w:20,h:20}),DM.item('rect',{x:29,y:10,w:15,h:20}),DM.item('rect',{x:42,y:12,w:10,h:10,rotation:45})];
 const r=Slice.region(p,0,{x:11,y:11,w:2,h:2},true);assert.equal(r.items.length,3);assert(r.box.x<=10&&r.box.x+r.box.w>52);
 p.items.push(DM.item('rect',{x:-1,y:15,w:12,h:10}));assert.throws(()=>Slice.region(p,0,{x:11,y:11,w:2,h:2},true),/outside the sheet/);
 assert.doesNotThrow(()=>Slice.region(p,0,{x:11,y:11,w:2,h:2},false));
});
test('slice selection rejects invalid rectangles and empty saves; nested slices remain clipped',()=>{
 const p=DM.project();for(const b of [{x:0,y:0,w:0,h:1},{x:-1,y:0,w:1,h:1},{x:209,y:0,w:2,h:1},{x:0,y:0,w:NaN,h:1}])assert.throws(()=>Slice.region(p,0,b));
 assert.throws(()=>Slice.artwork(Slice.region(p,0,{x:0,y:0,w:1,h:1})),/at least one/);
 p.items=[DM.item('rect',{x:0,y:0,w:50,h:50})];const a=Slice.artwork(Slice.region(p,0,{x:0,y:0,w:10,h:10}));a.x=20;a.y=20;a.rotation=90;p.items=[a];
 const b=Slice.artwork(Slice.region(p,0,{x:22,y:22,w:3,h:3}));assert.deepEqual(DM.bounds(b),{x:0,y:0,w:3,h:3});assert.equal(b.children[0].kind,'slice');assert.equal(DM.artworkType(b),'Vector');
});
test('grouping and ungrouping a slice preserve its individual white treatments',()=>{
 const p=DM.project();p.items=[DM.item('rect',{x:10,y:10,w:20,h:20,ink:'colour-white'}),DM.item('ellipse',{x:35,y:10,w:20,h:20})];
 const a=Slice.artwork(Slice.region(p,0,{x:5,y:5,w:60,h:30})),other=DM.item('rect',{x:80,ink:'white-only'});
 const group=DM.validateItem(DM.group([a,other]));assert.equal(group.ink,'colour');assert.equal(group.children[0].ink,'colour-white');assert.equal(group.children[1].ink,'white-only');
 const children=DM.ungroup(group);assert.equal(children[1].ink,'white-only');assert.equal(children[0].children[1].ink,'colour');assert(DM.hasWhite(group));
});
test('sheet-sized library placements stay on paper without resizing, including rotated frames',()=>{
 for(const pageSize of Object.keys(DM.PAGE_SIZES))for(const orientation of ['portrait','landscape']){
  const p={...DM.project(),pageSize,orientation},s=DM.size(p);
  for(const [w,h,rotation] of [[s.w,30,0],[30,s.h,0],[s.w,s.h,0],[30,s.w,90]]){
   const i=DM.item('rect',{x:20,y:20,w,h,rotation}),before=JSON.stringify(i);
   const placed={...i,...DM.fitPlacement(i,p)},b=DM.bounds(placed);
   assert(b.x>=-1e-8&&b.y>=-1e-8);assert(b.x+b.w<=s.w+1e-8&&b.y+b.h<=s.h+1e-8);
   assert.equal(placed.w,w);assert.equal(placed.h,h);assert.equal(JSON.stringify(i),before);
  }
  const small=DM.item('rect',{x:-10,y:1000,w:10,h:10});assert.deepEqual(DM.fitPlacement(small,p),{x:5,y:s.h-15});
  const oversized=DM.item('rect',{w:s.w+20,h:s.h+20});assert.deepEqual(DM.fitPlacement(oversized,p),{x:0,y:0});
 }
});
test('ungroup bakes white overrides into nested slices and preserves white-only children through sharing',()=>{
 const p=DM.project();p.items=[DM.item('rect',{x:10,y:10,w:10,h:10}),DM.item('rect',{x:25,y:10,w:10,h:10,ink:'white-only'})];
 const inner=Slice.artwork(Slice.region(p,0,{x:5,y:5,w:35,h:20}));inner.x=5;inner.y=5;p.items=[inner];
 const outer=Slice.artwork(Slice.region(p,0,{x:0,y:0,w:45,h:30}));
 for(const ink of ['colour-white','white-only']){
  const group=DM.group([outer,DM.item('rect',{x:80,ink:'white-only'})]);group.ink=ink;
  const before=JSON.stringify(group),children=DM.ungroup(group).map(i=>DM.validateItem(i));
  assert.equal(JSON.stringify(group),before);assert.equal(children[1].ink,'white-only');
  const entry={name:'Inherited ink',scale:32,art:children[0]},shared=DM.readPack(DM.pack([entry])).decals[0].art;
  assert.equal(shared.children[0].children[0].ink,ink);assert.equal(shared.children[0].children[1].ink,'white-only');
 }
});
