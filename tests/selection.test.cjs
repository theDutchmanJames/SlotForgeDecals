const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../renderer/model.js');
test('marquee touches artwork rather than empty corners of a rotated bounding box',()=>{
 const i=M.item('line',{x:10,y:10,w:20,h:2,rotation:45}),b=M.bounds(i);
 assert.equal(M.intersectsSelection(i,{x:b.x+b.w-1,y:b.y,w:1,h:1}),false);
 assert.equal(M.intersectsSelection(i,{x:19,y:10,w:2,h:2}),true);
 assert.equal(M.intersectsSelection(i,{x:0,y:0,w:40,h:40}),true);
 assert.equal(M.intersectsSelection(i,{x:40,y:40,w:2,h:2}),false);
 const r=M.item('rect',{x:10,y:10,w:20,h:10});
 assert.equal(M.intersectsSelection(r,{x:29,y:15,w:5,h:5}),true);
 assert.equal(M.intersectsSelection(r,{x:31,y:15,w:5,h:5}),false);
});
