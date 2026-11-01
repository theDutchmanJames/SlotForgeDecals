const {test}=require('node:test'),assert=require('node:assert/strict');
const Trace=require('../renderer/trace-core.js'),engine=require('../vendor/imagetracer/imagetracer_v1.2.6.js'),DM=require('../renderer/model.js');
function fixture(w,h,color){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(color(x,y),(y*w+x)*4);return{width:w,height:h,data};}
test('trace makes vector paths, keeps a transparent hole and removes invisible RGB',async()=>{
 const input=fixture(64,48,(x,y)=>x>=8&&x<56&&y>=8&&y<40&&!(x>=24&&x<40&&y>=16&&y<32)?[220,20,40,255]:[15,240,80,0]);
 const result=Trace.trace(input,{colors:2,detail:'fine'},engine);assert.ok(result.svg.includes('<path'));assert.ok(!result.svg.includes('<image'));assert.equal(result.colors,1);assert.equal(result.paths,1);assert.ok(result.svg.includes('viewBox="0 0 64 48"'));
 assert.equal((result.svg.match(/M /g)||[]).length,2,'Outer shape and its cut-out remain separate subpaths');assert.ok(!result.svg.includes('opacity="0"'),'Invisible colours do not produce vector shapes');
});
test('white removal is opt-in, edge-connected, and preserves enclosed white',()=>{
 const input=fixture(40,40,(x,y)=>x>5&&x<34&&y>5&&y<34&&(x<10||x>29||y<10||y>29)?[0,0,0,255]:[255,255,255,255]);
 const kept=Trace.prepare(input,{colors:2}),removed=Trace.prepare(input,{colors:2,removeWhite:true});assert.equal(kept.image.data[3],255);assert.equal(removed.image.data[3],0);assert.equal(removed.image.data[(20*40+20)*4+3],255);assert.ok(removed.removed>0);assert.equal(input.data[3],255);
});
test('tracing is deterministic, validates bounds and reports empty artwork',()=>{
 const input=fixture(24,24,(x,y)=>x<12?[255,0,0,255]:[0,0,255,255]);const first=Trace.trace(input,{colors:2},engine);assert.equal(first.svg,Trace.trace(input,{colors:2},engine).svg);assert.equal(first.colors,2);
 assert.throws(()=>Trace.trace(input,{colors:99},engine),/colours/);assert.throws(()=>Trace.prepare({width:2000,height:1,data:new Uint8Array(8000)},{}),/1536/);assert.throws(()=>Trace.trace(fixture(10,10,()=>[255,255,255,255]),{removeWhite:true},engine),/No visible/);
});
test('transparency cutoff is explicit and source metadata survives sharing',()=>{
 const input=fixture(16,16,(x,y)=>[0,0,0,x<8?80:200]);const prepared=Trace.prepare(input,{threshold:128});assert.equal(prepared.image.data[3],0);assert.equal(prepared.image.data[8*4+3],255);assert.equal(prepared.translucent,256);
 const item=DM.item('svg',{svg:'<svg/>',traceSource:{src:'data:image/png;base64,AAAA',pixelsW:16,pixelsH:16},traceSettings:{colors:2,detail:'fine',threshold:80,removeWhite:true}});const pack=DM.readPack(DM.pack([{name:'Trace',scale:32,art:item}]));assert.deepEqual(pack.decals[0].art.traceSource,item.traceSource);assert.deepEqual(pack.decals[0].art.traceSettings,item.traceSettings);assert.throws(()=>DM.validateItem({...item,traceSource:{...item.traceSource,src:'https://example.com/image.png'}}),/Invalid original/);
});
