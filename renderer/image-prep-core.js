(function(root,factory){if(typeof module==='object')module.exports=factory();else root.ImagePrep=factory();})(globalThis,()=>{
 'use strict';
 const MAX_PIXELS=16e6;
 const clone=o=>JSON.parse(JSON.stringify(o));
 function cropRect(raw,width,height){
  const r={x:Number(raw?.x??0),y:Number(raw?.y??0),w:Number(raw?.w??width),h:Number(raw?.h??height)};
  if(Object.values(r).some(n=>!Number.isInteger(n))||r.x<0||r.y<0||r.w<1||r.h<1||r.x+r.w>width||r.y+r.h>height)throw Error('Crop coordinates must be whole pixels inside the original image.');
  return r;
 }
 function settings(raw,width,height){
  const crop=cropRect(raw?.crop,width,height),color=raw?.color??'#ffffff',tolerance=Number(raw?.tolerance??12);
  if(!/^#[a-f\d]{6}$/i.test(color))throw Error('Choose a background colour.');
  if(!Number.isFinite(tolerance)||tolerance<0||tolerance>100)throw Error('Tolerance must be between 0 and 100.');
  return{crop,color,tolerance,removeBackground:raw?.removeBackground===true};
 }
 function process(image,raw={}){
  const {width,height}=image;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>20000||height>20000||width*height>MAX_PIXELS||image.data?.length!==width*height*4)throw Error('Image preparation supports up to 16 megapixels and 20,000 pixels per edge. Import a smaller image to prepare it.');
  const options=settings(raw,width,height),crop=options.crop,w=crop.w,h=crop.h,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)data.set(image.data.subarray(((crop.y+y)*width+crop.x)*4,((crop.y+y)*width+crop.x+w)*4),y*w*4);
  let removed=0;
  if(options.removeBackground){
   const rgb=[1,3,5].map(n=>parseInt(options.color.slice(n,n+2),16)),limit=options.tolerance*2.55,visited=new Uint8Array(w*h),queue=new Uint32Array(w*h);let read=0,write=0;
   const add=n=>{if(visited[n])return;visited[n]=1;const p=n*4;if(data[p+3]===0||Math.max(Math.abs(data[p]-rgb[0]),Math.abs(data[p+1]-rgb[1]),Math.abs(data[p+2]-rgb[2]))<=limit)queue[write++]=n;};
   for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
   while(read<write){const n=queue[read++],p=n*4;if(data[p+3])removed++;data[p]=data[p+1]=data[p+2]=data[p+3]=0;const x=n%w;if(x)add(n-1);if(x<w-1)add(n+1);if(n>=w)add(n-w);if(n<w*(h-1))add(n+w);}
  }
  let left=w,top=h,right=-1,bottom=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<0)throw Error('No visible artwork remains. Reduce tolerance, keep the background, or choose a different crop.');
  if(raw.trim===true){
   const tw=right-left+1,th=bottom-top+1,trimmed=new Uint8ClampedArray(tw*th*4);
   for(let y=0;y<th;y++)trimmed.set(data.subarray(((top+y)*w+left)*4,((top+y)*w+left+tw)*4),y*tw*4);
   options.crop={x:crop.x+left,y:crop.y+top,w:tw,h:th};return{width:tw,height:th,data:trimmed,settings:options,removed};
  }
  return{width:w,height:h,data,settings:options,removed};
 }
 function geometry(item,previous,next){
  const sx=item.w/previous.w,sy=item.h/previous.h,w=next.w*sx,h=next.h*sy;
  if(w<.1||h<.1||w>1000||h>1000)throw Error('This crop would be outside the 0.1–1,000 mm decal size range. Resize the decal in the editor first.');
  const dx=(next.x+next.w/2-previous.x-previous.w/2)*sx*(item.flipX?-1:1),dy=(next.y+next.h/2-previous.y-previous.h/2)*sy*(item.flipY?-1:1),a=(item.rotation||0)*Math.PI/180,
   ox=dx*Math.cos(a)-dy*Math.sin(a)+(item.w-w)/2,oy=dx*Math.sin(a)+dy*Math.cos(a)+(item.h-h)/2;
  const result={w,h,x:item.x+ox,y:item.y+oy};
  if(item.carPositions)result.carPositions=Object.fromEntries(Object.entries(item.carPositions).map(([view,p])=>[view,{x:p.x+ox,y:p.y+oy}]));
  return result;
 }
 function source(item){return item.imageSource||{src:item.src,pixelsW:item.pixelsW,pixelsH:item.pixelsH};}
 function prepared(item,result,src){
  const original=source(item),previous=item.imageEdits?.crop||{x:0,y:0,w:original.pixelsW,h:original.pixelsH};
  return{...clone(item),...geometry(item,previous,result.settings.crop),src,pixelsW:result.width,pixelsH:result.height,ratio:result.width/result.height,imageSource:clone(original),imageEdits:clone(result.settings)};
 }
 function restore(item){
  if(!item.imageSource)throw Error('This image has no retained preparation original.');
  const s=item.imageSource,full={x:0,y:0,w:s.pixelsW,h:s.pixelsH},out={...clone(item),...geometry(item,item.imageEdits.crop,full),...clone(s),ratio:s.pixelsW/s.pixelsH};
  delete out.imageSource;delete out.imageEdits;return out;
 }
 return{MAX_PIXELS,cropRect,settings,process,geometry,source,prepared,restore};
});
