(function(root,factory){if(typeof module==='object')module.exports=factory(require('./model.js'));else root.Layout=factory(root.DM);})(globalThis,DM=>{
 'use strict';
 function selection(p,ids,min=1,unlocked=false){
  const wanted=new Set(ids),list=p.items.filter(i=>wanted.has(i.id));
  if(list.length<min)throw Error(min===1?'Select at least one decal.':`Select at least ${min} decals.`);
  if(list.some(i=>i.page!==list[0].page))throw Error('Select decals on the same page.');
  if(unlocked&&list.some(i=>i.locked))throw Error('Unlock all selected decals before arranging them.');
  return list;
 }
 function gridPlan(p,ids,options){
  const sources=selection(p,ids),b=DM.union(sources),rows=DM.number(options.rows,1,100,'Rows'),columns=DM.number(options.columns,1,100,'Columns'),
   gapX=DM.number(options.gapX,0,100,'Horizontal gap'),gapY=DM.number(options.gapY,0,100,'Vertical gap');
  if(!Number.isInteger(rows)||!Number.isInteger(columns))throw Error('Rows and columns must be whole numbers.');
  if(rows*columns<2)throw Error('Choose at least two cells. The first cell is your original selection.');
  const added=(rows*columns-1)*sources.length;
  if(p.items.length+added>2000)throw Error('A project supports up to 2,000 decals. Reduce the rows or columns.');
  const width=columns*b.w+(columns-1)*gapX,height=rows*b.h+(rows-1)*gapY,s=DM.size(p),m=p.margin;
  if(b.x<m-.00001||b.y<m-.00001||b.x+width>s.w-m+.00001||b.y+height>s.h-m+.00001)
   throw Error('This grid extends beyond the printable margins. Reduce its rows, columns or gaps, or move the original selection toward the top left.');
  return{sources,bounds:b,rows,columns,gapX,gapY,width,height,added};
 }
 function grid(p,ids,options){
  const plan=gridPlan(p,ids,options),out=DM.clone(p),selected=plan.sources.map(i=>i.id);
  for(let row=0;row<plan.rows;row++)for(let col=0;col<plan.columns;col++){
   if(row===0&&col===0)continue;
   for(const source of plan.sources){const i=DM.clone(source);i.id=DM.uid();i.x+=col*(plan.bounds.w+plan.gapX);i.y+=row*(plan.bounds.h+plan.gapY);i.locked=false;delete i.carPositions;out.items.push(i);selected.push(i.id);}
  }
  return{project:out,ids:selected,added:plan.added};
 }
 function align(p,ids,axis,edge){
  if(!['x','y'].includes(axis)||!['start','center','end'].includes(edge))throw Error('Invalid alignment.');
  const out=DM.clone(p),list=selection(out,ids,2,true),b=DM.union(list),size=axis==='x'?'w':'h',factor={start:0,center:.5,end:1}[edge],target=b[axis]+b[size]*factor;
  for(const i of list){const ib=DM.bounds(i);i[axis]+=target-ib[axis]-ib[size]*factor;}return out;
 }
 function distribute(p,ids,axis){
  if(!['x','y'].includes(axis))throw Error('Invalid distribution.');
  const out=DM.clone(p),list=selection(out,ids,3,true).sort((a,b)=>DM.bounds(a)[axis]-DM.bounds(b)[axis]),size=axis==='x'?'w':'h',boxes=list.map(DM.bounds);
  const first=boxes[0],last=boxes.at(-1),gap=(last[axis]+last[size]-first[axis]-boxes.reduce((s,b)=>s+b[size],0))/(list.length-1);
  if(gap<-.00001)throw Error('Not enough space for equal gaps. Move the two outer decals farther apart first.');
  let position=first[axis]+first[size]+Math.max(0,gap);
  for(let n=1;n<list.length-1;n++){list[n][axis]+=position-boxes[n][axis];position+=boxes[n][size]+Math.max(0,gap);}return out;
 }
 function mirror(p,ids,axis){
  if(!['x','y'].includes(axis))throw Error('Invalid mirror direction.');
  const out=DM.clone(p),list=selection(out,ids,1,true),key=axis==='x'?'flipX':'flipY';
  for(const i of list){i[key]=!i[key];i.rotation=-(i.rotation||0);}return out;
 }
 function movePage(p,ids,target){
  const out=DM.clone(p),list=selection(out,ids,1,true),page=DM.number(target,0,49,'Page');
  if(!Number.isInteger(page)||page>p.pages)throw Error('Choose an existing page or the next new page.');
  if(page===list[0].page)throw Error('These decals are already on that page.');
  out.pages=Math.max(out.pages,page+1);for(const i of list)i.page=page;return out;
 }
 return{selection,gridPlan,grid,align,distribute,mirror,movePage};
});
