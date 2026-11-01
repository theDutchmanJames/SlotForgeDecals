/* Deterministic colour preparation for the bundled ImageTracer engine. */
(function(root,factory){if(typeof module==='object')module.exports=factory();else root.DecalTrace=factory();})(globalThis,()=>{
 'use strict';
 const MAX_EDGE=1536;
 function options(raw={}){
  const colors=Number(raw.colors??6),threshold=Number(raw.threshold??128);
  if(!Number.isInteger(colors)||colors<1||colors>16)throw Error('Choose between 1 and 16 colours.');
  if(!Number.isInteger(threshold)||threshold<1||threshold>254)throw Error('Transparency threshold must be between 1 and 254.');
  const detail=raw.detail??'balanced';if(!['smooth','balanced','fine'].includes(detail))throw Error('Choose a supported detail level.');
  return{colors,threshold,detail,removeWhite:raw.removeWhite===true};
 }
 function removeWhiteEdges(data,w,h){
  const visited=new Uint8Array(w*h),queue=new Uint32Array(w*h);let read=0,write=0,removed=0;
  const add=n=>{if(visited[n])return;visited[n]=1;const p=n*4;if(data[p+3]===0||(data[p]>=245&&data[p+1]>=245&&data[p+2]>=245))queue[write++]=n;};
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
  while(read<write){const n=queue[read++],p=n*4;if(data[p+3])removed++;data[p]=data[p+1]=data[p+2]=data[p+3]=0;const x=n%w;if(x)add(n-1);if(x<w-1)add(n+1);if(n>=w)add(n-w);if(n<w*(h-1))add(n+w);}
  return removed;
 }
 function paletteFor(hist,count){
  let boxes=[Array.from(hist.values())];
  const extent=box=>{const range=['r','g','b'].map(k=>Math.max(...box.map(c=>c[k]/c.n))-Math.min(...box.map(c=>c[k]/c.n)));const axis=range.indexOf(Math.max(...range));return{axis:['r','g','b'][axis],range:range[axis],weight:box.reduce((n,c)=>n+c.n,0)};};
  while(boxes.length<count){let chosen=-1,score=-1,axis;
   boxes.forEach((box,n)=>{if(box.length<2)return;const e=extent(box),s=e.range*Math.sqrt(e.weight);if(s>score){score=s;chosen=n;axis=e.axis;}});
   if(chosen<0)break;const box=boxes[chosen].sort((a,b)=>a[axis]/a.n-b[axis]/b.n||a.key-b.key),half=box.reduce((n,c)=>n+c.n,0)/2;let sum=0,cut=1;
   for(;cut<box.length;cut++){sum+=box[cut-1].n;if(sum>=half)break;}cut=Math.min(cut,box.length-1);boxes.splice(chosen,1,box.slice(0,cut),box.slice(cut));
  }
  return boxes.map(box=>{const n=box.reduce((sum,c)=>sum+c.n,0);return{r:Math.round(box.reduce((s,c)=>s+c.r,0)/n),g:Math.round(box.reduce((s,c)=>s+c.g,0)/n),b:Math.round(box.reduce((s,c)=>s+c.b,0)/n),a:255};});
 }
 function prepare(image,raw){
  const settings=options(raw),{width,height}=image;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_EDGE||height>MAX_EDGE||!image.data||image.data.length!==width*height*4)throw Error('Invalid tracing image. Use at most 1536 pixels per edge.');
  const data=new Uint8ClampedArray(image.data),hist=new Map();let translucent=0,visible=0;
  for(let p=0;p<data.length;p+=4){if(data[p+3]>0&&data[p+3]<255)translucent++;if(data[p+3]<settings.threshold)data[p]=data[p+1]=data[p+2]=data[p+3]=0;else data[p+3]=255;}
  const removed=settings.removeWhite?removeWhiteEdges(data,width,height):0;
  for(let p=0;p<data.length;p+=4){if(!data[p+3])continue;visible++;const key=((data[p]>>3)<<10)|((data[p+1]>>3)<<5)|(data[p+2]>>3);let c=hist.get(key);if(!c){c={key,r:0,g:0,b:0,n:0};hist.set(key,c);}c.r+=data[p];c.g+=data[p+1];c.b+=data[p+2];c.n++;}
  if(!visible)throw Error('No visible artwork remains. Lower the transparency threshold or keep the white background.');
  const palette=paletteFor(hist,settings.colors),cache=new Map();
  // Weighted median cuts can split a dominant colour across two boxes. Refine
  // against the actual colour clusters so a small black logo stays black.
  for(let cycle=0;cycle<5;cycle++){
   const sums=palette.map(()=>({r:0,g:0,b:0,n:0}));
   for(const c of hist.values()){let best=0,distance=Infinity;palette.forEach((p,n)=>{const d=(p.r-c.r/c.n)**2+(p.g-c.g/c.n)**2+(p.b-c.b/c.n)**2;if(d<distance){best=n;distance=d;}});const sum=sums[best];sum.r+=c.r;sum.g+=c.g;sum.b+=c.b;sum.n+=c.n;}
   sums.forEach((c,n)=>{if(c.n)palette[n]={r:Math.round(c.r/c.n),g:Math.round(c.g/c.n),b:Math.round(c.b/c.n),a:255};});
  }
  for(const [key,c]of hist){let best=0,distance=Infinity;palette.forEach((p,n)=>{const d=(p.r-c.r/c.n)**2+(p.g-c.g/c.n)**2+(p.b-c.b/c.n)**2;if(d<distance){best=n;distance=d;}});cache.set(key,best);}
  for(let p=0;p<data.length;p+=4){if(!data[p+3])continue;const c=palette[cache.get(((data[p]>>3)<<10)|((data[p+1]>>3)<<5)|(data[p+2]>>3))];data[p]=c.r;data[p+1]=c.g;data[p+2]=c.b;}
  if(visible<width*height)palette.push({r:0,g:0,b:0,a:0});
  return{image:{width,height,data},palette,settings,translucent,removed};
 }
 function trace(image,raw,engine){
  const p=prepare(image,raw),detail={smooth:{ltres:2,qtres:2,pathomit:12},balanced:{ltres:1,qtres:1,pathomit:4},fine:{ltres:.25,qtres:.25,pathomit:0}}[p.settings.detail];
  const settings={...detail,pal:p.palette,colorquantcycles:1,mincolorratio:0,layering:0,rightangleenhance:true,strokewidth:0,viewbox:true,roundcoords:2,desc:false,blurradius:0};
  const traced=engine.imagedataToTracedata(p.image,settings);
  traced.palette.forEach((color,n)=>{if(color.a===0)traced.layers[n]=[];});
  const paths=traced.layers.reduce((sum,layer)=>sum+layer.filter(p=>!p.isholepath).length,0);
  if(!paths)throw Error('No shapes were found. Try Fine detail or a lower transparency threshold.');
  if(paths>18000)throw Error('This trace has too many shapes. Reduce colours or choose Smooth detail.');
  const svg=engine.getsvgstring(traced,settings);if(svg.length>12e6)throw Error('This trace is too complex. Reduce colours or choose Smooth detail.');
  return{svg,paths,colors:traced.palette.filter((c,n)=>c.a>0&&traced.layers[n].some(p=>!p.isholepath)).length,translucent:p.translucent,removed:p.removed,width:image.width,height:image.height,settings:p.settings};
 }
 return{options,prepare,trace,MAX_EDGE};
});
