(function(root,factory){const api=factory(typeof module==='object'?require('./model.js'):root.DM);if(typeof module==='object')module.exports=api;else root.ShapeTools=api;})(globalThis,DM=>{
 const presets={diamond:'Diamond',star:'Star',polygon:'Regular polygon',arrow:'Arrow',chevron:'Chevron',trapezoid:'Trapezoid',shield:'Shield',checkerboard:'Checkerboard',stripes:'Racing stripes'};
 const parameters={star:[['count','Points',5,3,12,1],['inset','Inner radius (%)',45,15,85,1]],polygon:[['count','Sides',6,3,12,1]],arrow:[['head','Arrowhead length (%)',35,15,75,1],['shaft','Shaft thickness (%)',35,10,90,1]],chevron:[['head','Point depth (%)',40,10,80,1],['shaft','Band width (%)',30,10,60,1]],trapezoid:[['inset','Top inset (%)',25,0,45,1]],checkerboard:[['squareSize','Square size (mm)',5,.001,1000,.1],['columns','Columns',8,1,20,1],['rows','Rows',2,1,10,1]],stripes:[['count','Stripe count',3,1,12,1]]};
 function create(type,raw={}){
  if(!Object.hasOwn(presets,type))throw Error('Choose a supported shape.');
  const o={type,w:DM.number(raw.w??(['checkerboard','stripes'].includes(type)?60:type==='arrow'?40:25),.1,1000,'Width'),h:DM.number(raw.h??(['checkerboard','stripes'].includes(type)?20:type==='arrow'?16:25),.1,1000,'Height'),fill:raw.fill||'#e5484d',fill2:raw.fill2||'#ffffff',stroke:raw.stroke||'#111827',strokeWidth:DM.number(raw.strokeWidth??0,0,50,'Outline thickness')};
  for(const [key,label,value,min,max,step] of parameters[type]||[]){o[key]=DM.number(raw[key]??value,min,max,label);if(step===1&&!Number.isInteger(o[key]))throw Error(label+' must be a whole number.');}
  if(type==='checkerboard'){o.squareSize=DM.number(raw.squareSize??5,.001,1000,'Square size');o.w=o.columns*o.squareSize;o.h=o.rows*o.squareSize;}
  if(type==='stripes'){
   o.stripeWidth=DM.number(raw.stripeWidth??2,.001,1000,'Stripe width');o.gapMm=DM.number(raw.gapMm??1,0,1000,'Spacing');
   if(raw.widths!==undefined&&(!Array.isArray(raw.widths)||raw.widths.length!==o.count))throw Error('Set a width for every stripe.');
   o.widths=Array.from({length:o.count},(_,n)=>DM.number(raw.widths?.[n]??o.stripeWidth,.001,1000,'Stripe '+(n+1)+' width'));
   o.h=o.widths.reduce((sum,w)=>sum+w,0)+(o.count-1)*o.gapMm;delete o.gap;
  }
  for(const key of ['w','h'])DM.number(o[key],.1,1000,'Overall '+(key==='w'?'width':'height'));
  for(const key of ['fill','fill2','stroke'])if(!/^#[a-f\d]{6}$/i.test(o[key])&&!(key==='fill'&&o[key]==='none'))throw Error('Choose a valid colour.');
  let points;
  if(type==='diamond')points=[[.5,0],[1,.5],[.5,1],[0,.5]];
  if(type==='shield')points=[[0,0],[1,0],[1,.55],[.85,.8],[.5,1],[.15,.8],[0,.55]];
  if(type==='star'||type==='polygon'){
   const count=type==='star'?o.count*2:o.count;
   points=Array.from({length:count},(_,n)=>{const a=-Math.PI/2+n*Math.PI*2/count,r=type==='star'&&n%2?o.inset/100:1;return[Math.cos(a)*r,Math.sin(a)*r];});
   const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;points=points.map(([a,b])=>[(a-x)/w,(b-y)/h]);
  }
  if(type==='arrow'){const x=1-o.head/100,y=(1-o.shaft/100)/2;points=[[0,y],[x,y],[x,0],[1,.5],[x,1],[x,1-y],[0,1-y]];}
  if(type==='chevron'){const x=o.head/100,t=o.shaft/100;points=[[0,0],[t,0],[1,.5],[t,1],[0,1],[1-x,.5]];}
  if(type==='trapezoid')points=[[o.inset/100,0],[1-o.inset/100,0],[1,1],[0,1]];
  if(points)return DM.validateItem(DM.item('polygon',{name:presets[type],w:o.w,h:o.h,fill:o.fill,stroke:o.stroke,strokeWidth:o.strokeWidth,points,shapeOptions:o}));
  // Keep child geometry editable even when the printed pattern is very small.
  const children=[],baseW=Math.max(o.w,type==='checkerboard'?o.columns*.2:.1),baseH=Math.max(o.h,type==='checkerboard'?o.rows*.2:o.h*.2/Math.min(...o.widths));
  if(type==='checkerboard')for(let row=0;row<o.rows;row++)for(let col=0;col<o.columns;col++)children.push(DM.item('rect',{x:col*baseW/o.columns,y:row*baseH/o.rows,w:baseW/o.columns,h:baseH/o.rows,fill:(row+col)%2?o.fill2:o.fill}));
  if(type==='stripes'){let y=0;const scale=baseH/o.h;for(let n=0;n<o.count;n++){const height=o.widths[n]*scale;children.push(DM.item('rect',{x:0,y,w:baseW,h:height,fill:n%2?o.fill2:o.fill}));y+=height+o.gapMm*scale;}}
  return DM.validateItem(DM.item('group',{name:presets[type],w:o.w,h:o.h,fill:o.fill,fill2:o.fill2,baseW,baseH,children,shapeOptions:o}));
 }
 function optionsFor(source){
  const o={...source.shapeOptions,w:source.w,h:source.h,fill:source.kind==='group'?source.shapeOptions.fill:source.fill,stroke:source.stroke,strokeWidth:source.strokeWidth};
  if(source.kind==='stripe')return{...o,type:'stripes',count:2,stripeWidth:source.h*.42,widths:[source.h*.42,source.h*.42],gapMm:source.h*.16,fill2:source.fill2||'#245cc3'};
  if(o.type==='checkerboard')o.squareSize=Math.max(.1/o.columns,.1/o.rows,source.w/o.columns);
  if(o.type==='stripes'){
   const scale=source.h/source.baseH,children=source.children;
   o.widths=Array.from({length:o.count},(_,n)=>(children[n]?.h??children[0].h)*scale);o.stripeWidth=o.widths[0];
   o.gapMm=o.count>1?Math.max(0,((children[1]?.y??0)-children[0].y-children[0].h)*scale):(o.gapMm??1);
  }
  return o;
 }
 return{presets,parameters,create,optionsFor};
});
