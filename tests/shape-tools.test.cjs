const test=require('node:test'),assert=require('node:assert/strict'),DM=require('../renderer/model.js'),Shapes=require('../renderer/shape-tools.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const sizes=g=>g.children.map(c=>({w:c.w*g.w/g.baseW,h:c.h*g.h/g.baseH,y:c.y*g.h/g.baseH}));
test('shape and pattern presets retain editable vector geometry through sharing',()=>{
 for(const type of Object.keys(Shapes.presets)){
  const shape=Shapes.create(type,{w:60,h:25,fill:'#112233',fill2:'#abcdef'});assert.equal(DM.artworkType(shape),'Vector');
  if(!['checkerboard','stripes'].includes(type)){assert.equal(shape.w,60);assert.equal(shape.h,25);}
  const restored=DM.readPack(DM.pack([{name:type,scale:32,art:shape}])).decals[0].art;assert.deepEqual(restored,shape);
  if(shape.kind==='polygon')for(const [x,y] of shape.points)assert(x>=0&&x<=1&&y>=0&&y<=1);
  else for(const child of sizes(shape)){assert(child.w<=shape.w+1e-8);assert(child.y+child.h<=shape.h+1e-8);}
 }
 assert.equal(Shapes.create('star',{count:7}).points.length,14);
 const outline=Shapes.create('star',{fill:'none',stroke:'#abcdef',strokeWidth:.8});assert.equal(outline.fill,'none');assert.equal(outline.strokeWidth,.8);
 for(const [type,options] of [['star',{count:3.5}],['polygon',{count:13}],['checkerboard',{rows:11}],['checkerboard',{squareSize:1000}],['arrow',{head:99}],['stripes',{count:13}],['stripes',{widths:[1]}],['stripes',{gapMm:-1}],['stripes',{stripeWidth:1000}],['shield',{fill:'url(bad)'}]])assert.throws(()=>Shapes.create(type,options));
 assert.throws(()=>Shapes.create('toString'));assert.throws(()=>DM.validateItem({...outline,points:[[0,0],[1,1],[-1,0]]}));
});
test('checkerboards grow by whole squares without changing square size',()=>{
 for(const [columns,rows] of [[3,2],[12,4],[20,10]]){
  const board=Shapes.create('checkerboard',{squareSize:2.5,columns,rows});near(board.w,columns*2.5);near(board.h,rows*2.5);assert.equal(board.children.length,columns*rows);
  for(const square of sizes(board)){near(square.w,2.5);near(square.h,2.5);}
 }
});
test('stripe counts and equal spacing preserve individual widths',()=>{
 for(const count of [1,5,12])for(const gapMm of [0,1,3.5]){
  const widths=Array.from({length:count},(_,n)=>n===1?4:2),stripes=Shapes.create('stripes',{count,w:55,stripeWidth:2,widths,gapMm}),parts=sizes(stripes);
  near(stripes.h,widths.reduce((s,w)=>s+w,0)+(count-1)*gapMm);near(stripes.w,55);
  parts.forEach((part,n)=>{near(part.h,widths[n]);near(part.w,55);if(n)near(part.y-parts[n-1].y-parts[n-1].h,gapMm);});
  const restored=DM.readPack(DM.pack([{name:'Stripes',scale:32,art:stripes}])).decals[0].art;
  assert.deepEqual(restored.shapeOptions.widths,widths);assert.equal(restored.shapeOptions.gapMm,gapMm);
 }
});
test('pattern adjustment reads scaled geometry and upgrades legacy double stripes',()=>{
 const legacy=DM.item('stripe',{w:55,h:5,fill:'#123456',fill2:'#abcdef'}),converted=Shapes.create('stripes',Shapes.optionsFor(legacy));near(converted.w,55);near(converted.h,5);near(sizes(converted)[0].h,2.1);near(converted.shapeOptions.gapMm,.8);
 const oldGroup=DM.item('group',{w:30,h:10,baseW:60,baseH:20,shapeOptions:{type:'stripes',count:3,gap:20,fill:'#123456',fill2:'#abcdef'},children:[0,1,2].map(n=>DM.item('rect',{x:0,y:n*(16/3+2),w:60,h:16/3}))});
 const upgraded=Shapes.create('stripes',Shapes.optionsFor(oldGroup));near(upgraded.h,10);near(sizes(upgraded)[0].h,8/3);near(upgraded.shapeOptions.gapMm,1);
 const stripes=Shapes.create('stripes',{count:3,widths:[1,2,3],gapMm:1,fill:'#123456',fill2:'#abcdef'});stripes.h*=.1;
 const adjusted=Shapes.create('stripes',Shapes.optionsFor(stripes));near(adjusted.h,stripes.h);near(sizes(adjusted)[1].h,.2);assert.equal(adjusted.children[0].fill,'#123456');
 const board=Shapes.create('checkerboard',{squareSize:2,columns:20,rows:10});board.w=.1;board.h=.1;const tiny=Shapes.create('checkerboard',Shapes.optionsFor(board));for(const square of sizes(tiny))near(square.w,square.h);
});
