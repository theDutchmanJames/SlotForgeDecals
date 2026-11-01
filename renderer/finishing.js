(function(root,factory){const api=factory(typeof module==='object'?require('./model.js'):root.DM);if(typeof module==='object')module.exports=api;else root.Finishing=api;})(globalThis,DM=>{
 'use strict';
 function arc(length,degrees){const angle=DM.number(degrees,-300,300,'Text bend');if(!angle)return null;length=DM.number(length,.001,1000000,'Text length');const a=Math.abs(angle)*Math.PI/180,r=length/a,x=r*Math.sin(a/2),y=Math.sign(angle)*r*(1-Math.cos(a/2));return `M ${-x} ${y} A ${r} ${r} 0 ${Math.abs(angle)>180?1:0} ${angle>0?1:0} ${x} ${y}`;}
 // ImageTracer contours use absolute M/L/Q/Z commands. Convert coordinates to
 // millimetres before stroking so the outline is round and physically uniform.
 function scalePath(d,sx,sy){
  if(typeof d!=='string'||/[^MLQZ\s,\d.eE+\-]/.test(d))throw Error('Unsupported outline contour.');
  const tokens=d.match(/[MLQZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];let out=[],n=0;
  while(n<tokens.length){const command=tokens[n++],count={M:2,L:2,Q:4,Z:0}[command];if(count===undefined)throw Error('Invalid outline contour.');out.push(command);for(let j=0;j<count;j++){const value=Number(tokens[n++]);if(!Number.isFinite(value))throw Error('Invalid outline coordinates.');out.push(Number((value*(j%2?sy:sx)).toFixed(6)));}}
  return out.join(' ');
 }
 function source(item){
  if(!item.artOutline){if(!['svg','image'].includes(item.kind))throw Error('Select imported artwork or an outlined decal.');return DM.clone(item);}
  const child=DM.clone(item.children[1]),kx=item.w/item.baseW,ky=item.h/item.baseH,w=child.w*kx,h=child.h*ky;
  Object.assign(child,{id:item.id,name:item.name,x:item.x+(item.w-w)/2,y:item.y+(item.h-h)/2,w,h,page:item.page,rotation:item.rotation,flipX:item.flipX,flipY:item.flipY,opacity:item.opacity,locked:item.locked,ink:item.ink});
  for(const key of ['libraryId','referenceScale'])if(item[key]!==undefined)child[key]=item[key];
  if(item.carPositions){child.carPositions=DM.clone(item.carPositions);for(const pos of Object.values(child.carPositions)){pos.x+=(item.w-w)/2;pos.y+=(item.h-h)/2;}}
  return DM.validateItem(child);
 }
 function outlined(original,paths,settings){
  if(!['svg','image'].includes(original.kind))throw Error('Select imported artwork.');
  if(!Array.isArray(paths)||!paths.length||paths.length>18000)throw Error('No supported silhouette was found.');
  const width=DM.number(settings.width,.05,10,'Outline width'),threshold=DM.number(settings.threshold,1,254,'Transparency threshold'),color=settings.color;
  if(!Number.isInteger(threshold)||!/^#[a-f\d]{6}$/i.test(color))throw Error('Invalid outline settings.');
  const w=original.w+2*width,h=original.h+2*width;
  const content=DM.clone(original);Object.assign(content,{id:DM.uid(),x:width,y:width,page:0,rotation:0,flipX:false,flipY:false,opacity:1,locked:false,ink:'colour'});delete content.carPositions;delete content.libraryId;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><g transform="translate(${width} ${width})" fill="none" stroke="${color}" stroke-width="${2*width}" stroke-linejoin="round" stroke-linecap="round">${paths.map(d=>`<path d="${DM.esc(d)}"/>`).join('')}</g></svg>`;
  const border=DM.item('svg',{name:'Artwork outline',x:0,y:0,w,h,svg,strokeWidth:0});
  const group=DM.item('group',{id:original.id,name:original.name,x:original.x-width,y:original.y-width,w,h,baseW:w,baseH:h,page:original.page,rotation:original.rotation,flipX:original.flipX,flipY:original.flipY,opacity:original.opacity,locked:original.locked,ink:original.ink,children:[border,content],artOutline:{width,color,threshold,ppi:settings.ppi}});
  for(const key of ['libraryId','referenceScale'])if(original[key]!==undefined)group[key]=original[key];
  if(original.carPositions){group.carPositions=DM.clone(original.carPositions);for(const pos of Object.values(group.carPositions)){pos.x-=width;pos.y-=width;}}
  return DM.validateItem(group);
 }
 return {arc,scalePath,source,outlined};
});
