const test=require('node:test'),assert=require('node:assert/strict'),DM=require('../renderer/model'),P=require('../renderer/path-tools'),paper=require('paper');
paper.setup(new paper.Size(500,500));
const node=(x,y)=>({p:[x,y],i:[x,y],o:[x,y]});
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function geometry(i){const p=new paper.CompoundPath({pathData:P.data(P.contours(i)),insert:false});p.fillRule='evenodd';return p;}
test('editable Bézier paths preserve handles, position, holes and sharing',()=>{
 const c=[{closed:false,nodes:[{p:[10,20],i:[10,20],o:[25,5]},{p:[40,20],i:[25,35],o:[40,20]}]}],i=P.artwork(c,{strokeWidth:1,fill:'none'});
 const restored=DM.readPack(DM.pack([{name:'Curve',scale:32,art:i}])).decals[0].art;assert.deepEqual(restored,i);const round=P.contours(restored);for(let n=0;n<2;n++)for(const k of ['p','i','o'])for(let j=0;j<2;j++)near(round[0].nodes[n][k][j],c[0].nodes[n][k][j]);
 const p=geometry(i),before=p.length;P.split(c[0],0);const split=P.artwork(c,{strokeWidth:1,fill:'none'}),after=geometry(split);assert(Math.abs(before-after.length)<1e-5);p.remove();after.remove();
 for(const bad of [{...i,pathContours:[]},{...i,pathContours:[{closed:false,nodes:[node(0,0)]}]},{...i,pathContours:[{closed:true,nodes:[node(-1,0),node(1,1)]}]}])assert.throws(()=>DM.validateItem(bad));
});
test('boolean shapes have real merged geometry and transparent cut-outs',()=>{
 const a=DM.item('rect',{x:10,y:10,w:20,h:20}),b=DM.item('rect',{x:20,y:10,w:20,h:20}),snapshot=JSON.stringify([a,b]);
 for(const [op,area] of [['unite',600],['subtract',200],['intersect',200],['exclude',400]]){const r=P.combine([a,b],op),p=geometry(r);near(op==='exclude'?(p.children||[p]).reduce((n,c)=>n+Math.abs(c.area),0):Math.abs(p.area),area);assert.equal(r.kind,'path');assert(r.pathContours.every(c=>c.closed));p.remove();}
 const hole=DM.item('ellipse',{x:15,y:15,w:10,h:10}),cut=P.combine([a,hole],'subtract'),p=geometry(cut);assert(!p.contains([20,20]));assert(p.contains([12,12]));assert(cut.pathContours.some(c=>c.nodes.some(n=>n.i[0]!==n.p[0]||n.i[1]!==n.p[1])));p.remove();
 assert.equal(JSON.stringify([a,b]),snapshot);assert.throws(()=>P.combine([a,{...a,id:DM.uid()}],'subtract'),/no shape/);assert.throws(()=>P.combine([a,{...b,x:50}],'intersect'),/no shape/);
 assert.throws(()=>P.combine([a,{...b,locked:true}],'unite'),/unlocked/);assert.throws(()=>P.combine([a,{...b,fill:'none'}],'unite'),/filled/);
});
test('boolean operations honour rotations, mirrors, resized groups and base choice',()=>{
 const a=DM.item('rect',{x:40,y:40,w:20,h:10,rotation:90,flipX:true}),b=DM.item('rect',{x:45,y:35,w:10,h:20}),r=P.combine([a,b],'intersect'),p=geometry(r);near(Math.abs(p.area),200);p.remove();
 const group=DM.item('group',{x:10,y:10,w:20,h:20,baseW:10,baseH:10,children:[DM.item('rect',{x:0,y:0,w:10,h:10})]}),hole=DM.item('rect',{x:15,y:15,w:5,h:5,fill:'#abcdef'}),cut=P.combine([group,hole],'subtract'),g=geometry(cut);near(Math.abs(g.area),375);assert(!g.contains([17,17]));g.remove();
 const intersection=P.combine([group,hole],'intersect',hole.id);assert.equal(intersection.fill,'#abcdef');
});
test('freehand smoothing produces editable curved nodes',()=>{
 const points=Array.from({length:100},(_,n)=>[10+n*.3,20+Math.sin(n/15)*5]),c=P.smooth(points,.2);assert(c.nodes.length<100);assert(c.nodes.length>=2);assert(c.nodes.some(n=>n.p[0]!==n.o[0]||n.p[1]!==n.o[1]));DM.validateItem(P.artwork([c],{strokeWidth:.5}));
});

test('small paths tolerate floating point rounding without changing their geometry',()=>{
 for(const [size,width] of [[.011,1.1],[.013,1.3]]){
  const c=[{closed:false,nodes:[node(0,0),node(size,size)]}],i=P.artwork(c,{strokeWidth:width}),round=P.contours(i);
  for(let n=0;n<2;n++)for(const k of ['p','i','o'])for(let j=0;j<2;j++)near(round[0].nodes[n][k][j],c[0].nodes[n][k][j]);
 }
});
test('merging groups uses visible child fill rather than unused wrapper fill',()=>{
 const child=DM.item('rect',{x:0,y:0,w:10,h:10,fill:'#123abc'}),nested=DM.item('group',{x:0,y:0,w:10,h:10,baseW:10,baseH:10,fill:'none',children:[child]}),group=DM.item('group',{x:0,y:0,w:10,h:10,baseW:10,baseH:10,fill:'#ff0000',children:[nested]}),other=DM.item('rect',{x:5,y:0,w:10,h:10});
 for(const base of [nested,group])assert.equal(P.combine([base,other],'unite').fill,'#123abc');
});
