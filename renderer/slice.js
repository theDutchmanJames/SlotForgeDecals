(function(root,factory){const api=factory(typeof module==='object'?require('./model.js'):root.DM);if(typeof module==='object')module.exports=api;else root.Slice=api;})(globalThis,DM=>{
 'use strict';
 function rectangle(raw,size){
  const b={x:DM.number(raw.x,0,size.w,'Left'),y:DM.number(raw.y,0,size.h,'Top'),w:DM.number(raw.w,1,size.w,'Width'),h:DM.number(raw.h,1,size.h,'Height')};
  if(b.x+b.w>size.w+1e-7||b.y+b.h>size.h+1e-7)throw Error('Keep the slice inside the sheet.');
  return b;
 }
 function region(project,page,raw,whole=false){
  const size=DM.size(project),requested=rectangle(raw,size),all=project.items.filter(i=>i.page===page);
  let box={...requested},list=[];
  // Expanding the rectangle can bring another decal into its path. Continue
  // until every intersected decal fits, so the whole-decals option never cuts one.
  for(let pass=0;pass<=all.length;pass++){
   list=all.filter(i=>DM.overlaps(DM.bounds(i),box)&&DM.intersectsSelection(i,box));
   if(!whole||!list.length)break;
   const b=DM.union(list),x=Math.min(box.x,b.x),y=Math.min(box.y,b.y),right=Math.max(box.x+box.w,b.x+b.w),bottom=Math.max(box.y+box.h,b.y+b.h);
   if(x<0||y<0||right>size.w+1e-7||bottom>size.h+1e-7)throw Error('A whole decal extends outside the sheet. Move it inside or choose Clip at boundary.');
   if(x===box.x&&y===box.y&&right===box.x+box.w&&bottom===box.y+box.h)break;
   box={x,y,w:right-x,h:bottom-y};
  }
  return{box,items:list,requested};
 }
 function artwork(result,name='Sheet slice'){
  if(!result.items.length)throw Error('Draw a slice over at least one decal.');
  const b=result.box;
  return DM.validateItem(DM.item('slice',{name,x:0,y:0,w:b.w,h:b.h,baseW:b.w,baseH:b.h,children:result.items.map(i=>({...DM.clone(i),x:i.x-b.x,y:i.y-b.y,page:0,locked:false}))}));
 }
 function output(project,result,cropped=false,name='Sheet slice'){
  const art=artwork(result,name);art.x=cropped?0:result.box.x;art.y=cropped?0:result.box.y;
  const snapshot=DM.clone(project);snapshot.name=name;snapshot.items=[art];snapshot.pages=1;snapshot.fonts=DM.fontsFor([art],project.fonts);
  return{project:snapshot,dimensions:cropped?{w:result.box.w,h:result.box.h}:DM.size(project)};
 }
 return{rectangle,region,artwork,output};
});
