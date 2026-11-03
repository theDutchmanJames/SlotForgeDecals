(function(root,factory){const api=factory(typeof module==='object'?require('./model.js'):root.DM,typeof module==='object'?require('paper'):root.paper);if(typeof module==='object')module.exports=api;else root.PathTools=api;})(globalThis,(DM,paper)=>{
 'use strict';
 const scope=new paper.PaperScope();scope.setup(new scope.Size(1000,1000));scope.settings.insertItems=false;
 function contours(item){
  return item.pathContours.map(c=>({closed:c.closed,nodes:c.nodes.map(n=>Object.fromEntries(['p','i','o'].map(k=>[k,world(item,[item.strokeWidth/2+n[k][0]*Math.max(.001,item.w-item.strokeWidth),item.strokeWidth/2+n[k][1]*Math.max(.001,item.h-item.strokeWidth)])])))}));
 }
 function world(i,p){const x=(i.flipX?i.w-p[0]:p[0])-i.w/2,y=(i.flipY?i.h-p[1]:p[1])-i.h/2,a=i.rotation*Math.PI/180;return[i.x+i.w/2+x*Math.cos(a)-y*Math.sin(a),i.y+i.h/2+x*Math.sin(a)+y*Math.cos(a)];}
 function artwork(contours,style={}){
  const points=contours.flatMap(c=>c.nodes.flatMap(n=>[n.p,n.i,n.o]));if(!points.length)throw Error('Draw a path first.');
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys),sw=style.strokeWidth??.5,w=Math.max(.1,Math.max(...xs)-left+sw),h=Math.max(.1,Math.max(...ys)-top+sw);
  const normalized=contours.map(c=>({closed:!!c.closed,nodes:c.nodes.map(n=>Object.fromEntries(['p','i','o'].map(k=>[k,[Math.max(0,Math.min(1,(n[k][0]-left)/Math.max(.001,w-sw))),Math.max(0,Math.min(1,(n[k][1]-top)/Math.max(.001,h-sw)))]])))}));
  return DM.validateItem(DM.item('path',{...style,x:left-sw/2,y:top-sw/2,w,h,rotation:0,flipX:false,flipY:false,strokeWidth:sw,pathContours:normalized}));
 }
 function data(contours,map=p=>p){return contours.map(c=>{if(!c.nodes.length)return '';const xy=p=>map(p).join(' '),nodes=c.nodes;let d='M '+xy(nodes[0].p);for(let n=1;n<nodes.length+(c.closed?1:0);n++){const prev=nodes[n-1],next=nodes[n%nodes.length];d+=' C '+xy(prev.o)+' '+xy(next.i)+' '+xy(next.p);}return d+(c.closed?' Z':'');}).join(' ');}
 function paperPath(contours){scope.activate();const p=new scope.CompoundPath({pathData:data(contours),insert:false});p.fillRule='evenodd';return p;}
 function fromPaper(p){return(p.className==='Path'?[p]:p.children||[]).filter(c=>c.segments?.length>=2).map(c=>({closed:c.closed,nodes:c.segments.map(s=>({p:[s.point.x,s.point.y],i:[s.point.x+s.handleIn.x,s.point.y+s.handleIn.y],o:[s.point.x+s.handleOut.x,s.point.y+s.handleOut.y]}))}));}
 function smooth(points,tolerance=.6){scope.activate();const p=new scope.Path({segments:points,insert:false});try{p.simplify(tolerance);return fromPaper(p)[0];}finally{p.remove();}}
 function split(contour,index){
  const n=contour.nodes,next=(index+1)%n.length;if(!contour.closed&&next===0)throw Error('Choose a point before the end of the line.');
  const a=n[index],b=n[next],mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],ab=mid(a.p,a.o),bc=mid(a.o,b.i),cd=mid(b.i,b.p),abc=mid(ab,bc),bcd=mid(bc,cd),p=mid(abc,bcd);a.o=ab;b.i=cd;n.splice(index+1,0,{p,i:abc,o:bcd});return index+1;
 }
 function eligible(i){return !i.locked&&(i.kind==='group'?i.children.every(eligible):['rect','ellipse','triangle','polygon','line','stripe','path'].includes(i.kind)&&i.fill!=='none'&&(i.kind!=='path'||i.pathContours.every(c=>c.closed)));}
 function geometry(i){
  scope.activate();if(!eligible(i))throw Error('Use unlocked, filled native shapes or closed paths. Ungroup to select individual shapes; imported images, SVGs and text cannot be combined here.');
  let p;const sw=i.strokeWidth||0,x=sw/2,w=Math.max(.001,i.w-sw),h=Math.max(.001,i.h-sw);
  if(i.kind==='group'){
   const children=i.children.map(geometry);p=children.shift();try{for(const child of children){const next=p.unite(child,{insert:false});p.remove();child.remove();p=next;}}catch(e){p.remove();children.forEach(c=>c.remove());throw e;}p.scale(i.w/i.baseW,i.h/i.baseH,new scope.Point(0,0));
  }else if(i.kind==='path')p=paperPath(i.pathContours.map(c=>({closed:c.closed,nodes:c.nodes.map(n=>Object.fromEntries(['p','i','o'].map(k=>[k,[x+n[k][0]*w,x+n[k][1]*h]])))})));
  else if(i.kind==='rect')p=new scope.Path.Rectangle({rectangle:[x,x,w,h],radius:Math.min(i.radius||0,w/2,h/2),insert:false});
  else if(i.kind==='ellipse')p=new scope.Path.Ellipse({rectangle:[x,x,w,h],insert:false});
  else if(i.kind==='line')p=new scope.Path.Rectangle({rectangle:[0,0,i.w,i.h],insert:false});
  else if(i.kind==='stripe'){p=new scope.CompoundPath({children:[new scope.Path.Rectangle({rectangle:[0,0,i.w,i.h*.42],insert:false}),new scope.Path.Rectangle({rectangle:[0,i.h*.58,i.w,i.h*.42],insert:false})],insert:false});}
  else{const points=i.kind==='triangle'?[[.5,0],[1,1],[0,1]]:i.points;p=new scope.Path({segments:points.map(([a,b])=>[x+a*w,x+b*h]),closed:true,insert:false});}
  p.fillRule='evenodd';p.scale(i.flipX?-1:1,i.flipY?-1:1,new scope.Point(i.w/2,i.h/2));p.rotate(i.rotation||0,new scope.Point(i.w/2,i.h/2));p.translate([i.x,i.y]);return p;
 }
 function baseFill(i){return i.kind==='group'?baseFill(i.children[0]):i.fill;}
 function combine(items,operation,baseId){
  if(!['unite','subtract','intersect','exclude'].includes(operation))throw Error('Choose a shape operation.');
  if(items.length<2||items.length>20)throw Error('Select 2–20 shapes.');if(new Set(items.map(i=>i.page)).size>1)throw Error('Choose shapes on the same page.');
  let nodes=0;const count=i=>{nodes+=i.pathContours?.reduce((n,c)=>n+c.nodes.length,0)||i.points?.length||4;i.children?.forEach(count);};items.forEach(count);if(nodes>4000)throw Error('Simplify the selection before combining (maximum 4,000 points).');
  const base=items.find(i=>i.id===baseId)||items[0],ordered=[base,...items.filter(i=>i!==base)],paths=[];
  try{
   for(const i of ordered)paths.push(geometry(i));let result=paths[0];
   for(let n=1;n<ordered.length;n++){result=result[operation](paths[n],{insert:false});paths.push(result);}
   const c=fromPaper(result);if(!c.length||!(result.className==='Path'?[result]:result.children||[]).some(p=>Math.abs(p.area)>1e-8))throw Error('This operation leaves no shape. Try another operation or reposition the shapes.');
   return artwork(c,{name:({unite:'Merged shape',subtract:'Cut shape',intersect:'Overlap shape',exclude:'Excluded overlap'})[operation],fill:baseFill(base),stroke:base.stroke,strokeWidth:0,opacity:base.opacity,ink:base.ink,page:base.page});
  }finally{paths.forEach(p=>p.remove());}
 }
 return{contours,artwork,data,smooth,split,combine,eligible};
});
