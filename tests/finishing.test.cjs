const {test}=require('node:test'),assert=require('node:assert/strict'),DM=require('../renderer/model.js'),F=require('../renderer/finishing.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('curved text arcs preserve baseline length and reverse their sweep',()=>{
 assert.equal(F.arc(100,0),null);const up=F.arc(100,180).split(' ').map(Number),down=F.arc(100,-180).split(' ').map(Number);
 near(up[4],100/Math.PI);near(up[4],up[5]);near(up[1],-100/Math.PI);near(up[9],100/Math.PI);assert.equal(up[8],1);assert.equal(down[8],0);near(up[2],-down[2]);assert.throws(()=>F.arc(100,301),/bend/);
 const curved=DM.item('text',{text:'RACING',curve:120,textBounds:{x:-50,y:-100,w:100,h:100,advance:600}});assert.deepEqual(DM.readPack(DM.pack([{name:'Curve',art:curved,scale:32}])).decals[0].art,DM.validateItem(curved));assert.throws(()=>DM.validateItem({...curved,curve:Infinity}),/bend/);
});
test('contours become millimetre geometry without scaling their stroke width',()=>{
 assert.equal(F.scalePath('M 10 20 L 30 40 Q 50 60 70 80 Z',.1,.2),'M 1 4 L 3 8 Q 5 12 7 16 Z');assert.equal(F.scalePath('M -1.5 2e1 Z',2,3),'M -3 60 Z');assert.throws(()=>F.scalePath('M0 0 C1 2 3 4 5 6Z',1,1),/Unsupported/);assert.throws(()=>F.scalePath('M 0',1,1),/Invalid/);
});
test('outlines preserve artwork size and centre and restore sources after scaling',()=>{
 const i=DM.item('svg',{svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>',x:20,y:30,w:20,h:10,rotation:33,flipX:true,opacity:.8,ink:'colour-white',carPositions:{side:{x:45,y:10}},libraryId:'master'}),before=DM.clone(i);
 const o=F.outlined(i,['M 0 0 L 20 0 L 20 10 L 0 10 Z'],{width:.5,color:'#ffffff',threshold:128,ppi:600});assert.deepEqual(i,before);near(o.w,21);near(o.h,11);near(o.x+o.w/2,i.x+i.w/2);near(o.y+o.h/2,i.y+i.h/2);assert.equal(o.rotation,i.rotation);assert.equal(o.flipX,true);assert.equal(o.children[1].opacity,1);assert.equal(o.opacity,.8);assert.equal(o.ink,'colour-white');assert.equal(o.children[1].w,20);assert.ok(o.children[0].svg.includes('stroke-width="1"'));
 const restored=F.source(o);for(const key of ['id','x','y','w','h','rotation','flipX','opacity','ink','svg','carPositions','libraryId'])assert.deepEqual(restored[key],i[key]);
 o.w*=2;o.h*=3;const scaled=F.source(o);near(scaled.w,40);near(scaled.h,30);near(scaled.x+scaled.w/2,o.x+o.w/2);near(scaled.carPositions.side.x+scaled.w/2,o.carPositions.side.x+o.w/2);
 assert.deepEqual(DM.readPack(DM.pack([{name:'Outline',art:o,scale:32}])).decals[0].art,o);assert.throws(()=>F.outlined(i,['M 0 0 Z'],{width:0,color:'#ffffff',threshold:128,ppi:600}),/width/);assert.throws(()=>DM.validateItem({...o,children:[o.children[0]]}),/outlined/);
});
