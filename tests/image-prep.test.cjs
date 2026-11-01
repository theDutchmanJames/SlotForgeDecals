const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../renderer/image-prep-core.js'),M=require('../renderer/model.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function image(w,h,color){const data=new Uint8ClampedArray(w*h*4);for(let n=0;n<w*h;n++)data.set(color,n*4);return{width:w,height:h,data};}
function set(im,x,y,color){im.data.set(color,(y*im.width+x)*4);}
function pixel(im,x,y){return [...im.data.slice((y*im.width+x)*4,(y*im.width+x)*4+4)];}
test('background removal is edge-connected, preserves enclosed colour and soft alpha, and trims exact pixels',()=>{
 const im=image(7,7,[255,255,255,255]);for(let y=1;y<6;y++)for(let x=1;x<6;x++)set(im,x,y,[0,0,0,255]);for(let y=2;y<5;y++)for(let x=2;x<5;x++)set(im,x,y,[255,255,255,255]);set(im,1,3,[0,0,0,128]);
 const before=new Uint8ClampedArray(im.data),result=P.process(im,{removeBackground:true,trim:true,color:'#ffffff',tolerance:0});
 assert.deepEqual(result.settings.crop,{x:1,y:1,w:5,h:5});assert.equal(result.removed,24);assert.deepEqual(pixel(result,2,2),[255,255,255,255]);assert.deepEqual(pixel(result,0,2),[0,0,0,128]);assert.deepEqual(im.data,before);
});
test('chosen colour and tolerance act on cropped edges and never replace the preview background',()=>{
 const im=image(6,6,[0,0,0,255]);for(let y=1;y<5;y++)for(let x=1;x<5;x++)set(im,x,y,[1,1,253,255]);set(im,3,3,[255,0,0,255]);
 const options={crop:{x:1,y:1,w:4,h:4},removeBackground:true,color:'#0000ff',tolerance:1},out=P.process(im,options);
 assert.deepEqual(pixel(out,0,0),[0,0,0,0]);assert.deepEqual(pixel(out,2,2),[255,0,0,255]);
 const noRemoval=P.process(im,{...options,removeBackground:false});assert.deepEqual(pixel(noRemoval,0,0),[1,1,253,255]);
 const exact=P.process(im,{...options,tolerance:0});assert.equal(exact.removed,0);
});
test('invalid, empty and oversized preparations fail without changing the source',()=>{
 const im=image(4,4,[255,255,255,255]);
 assert.throws(()=>P.process(im,{removeBackground:true}),/No visible/);
 assert.throws(()=>P.process(im,{crop:{x:0,y:0,w:0,h:4}}),/whole pixels/);
 assert.throws(()=>P.process(im,{crop:{x:2,y:0,w:4,h:4}}),/inside/);
 assert.throws(()=>P.process(im,{crop:{x:.5,y:0,w:2,h:2}}),/whole pixels/);
 assert.throws(()=>P.process(im,{tolerance:101}),/Tolerance/);
 assert.throws(()=>P.process({width:5000,height:5000,data:[]}),/16 megapixels/);
 assert.deepEqual(pixel(im,0,0),[255,255,255,255]);
});
test('crop placement and PPI stay fixed through rotations, mirrors and car positions',()=>{
 const prev={x:0,y:0,w:200,h:120},next={x:50,y:20,w:100,h:70};
 const world=(i,r,x,y)=>{let dx=((x-r.x)/r.w-.5)*i.w*(i.flipX?-1:1),dy=((y-r.y)/r.h-.5)*i.h*(i.flipY?-1:1),a=i.rotation*Math.PI/180;return{x:i.x+i.w/2+dx*Math.cos(a)-dy*Math.sin(a),y:i.y+i.h/2+dx*Math.sin(a)+dy*Math.cos(a)};};
 for(const flipX of [false,true])for(const flipY of [false,true]){const i=M.item('image',{x:20,y:30,w:40,h:24,rotation:37,flipX,flipY,pixelsW:200,pixelsH:120,carPositions:{side:{x:30,y:10},top:{x:50,y:20}}}),out={...i,...P.geometry(i,prev,next),pixelsW:100,pixelsH:70};
  const a=world(i,prev,60,40),b=world(out,next,60,40);near(a.x,b.x);near(a.y,b.y);near(M.rasters(i)[0].ppi,M.rasters(out)[0].ppi);
  for(const view of ['side','top']){const c=world({...i,...i.carPositions[view]},prev,60,40),d=world({...out,...out.carPositions[view]},next,60,40);near(c.x,d.x);near(c.y,d.y);}
 }
});
test('preparation metadata survives sharing and tracing, and restores at the current scale',()=>{
 const src='data:image/png;base64,AAAA',i=M.item('image',{src,pixelsW:200,pixelsH:120,w:40,h:24,rotation:30,flipX:true}),result={width:120,height:80,settings:{crop:{x:40,y:20,w:120,h:80},color:'#ffffff',tolerance:12,removeBackground:true}};
 const out=M.validateItem(P.prepared(i,result,src)),pack=M.readPack(M.pack([{name:'Prepared',scale:32,art:out}]));assert.deepEqual(pack.decals[0].art.imageEdits,out.imageEdits);
 const vector={...out,kind:'svg',svg:'<svg/>',traceSource:{src:out.src,pixelsW:out.pixelsW,pixelsH:out.pixelsH}};delete vector.src;delete vector.pixelsW;delete vector.pixelsH;assert.ok(M.validateItem(vector).imageSource);
 out.w*=2;out.h*=2;const restored=P.restore(out);assert.equal(restored.w,80);assert.equal(restored.h,48);assert.equal(restored.imageSource,undefined);assert.equal(restored.pixelsW,200);
 assert.throws(()=>M.validateItem({...out,imageEdits:{...out.imageEdits,crop:{x:0,y:0,w:10,h:10}}}),/dimensions/);
});
