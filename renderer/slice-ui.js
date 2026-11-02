'use strict';
function sliceDialog(state){
 if(!state){
  const snapshot=DM.clone(project),size=DM.size(snapshot);
  if(!snapshot.items.some(i=>i.page===page))throw Error('Add artwork to this page before slicing.');
  state={snapshot,page,box:{x:0,y:0,w:size.w,h:Math.min(80,size.h)},whole:false,name:snapshot.name+' — slice',tags:''};
 }
 const size=DM.size(state.snapshot);
 showDialog('Slice area',`Page ${state.page+1} · ${DM.pageFormat(state.snapshot).label} · Draw a rectangle or enter its size in millimetres.`,
  `<div class="slice-layout"><div class="slice-stage"><svg id="slice-canvas" viewBox="0 0 ${size.w} ${size.h}" role="img" aria-label="Draw a slice on this sheet"><rect width="${size.w}" height="${size.h}" fill="white"/>${Art.sheet(state.snapshot,state.page,false,false,size,true).replace(`width="${size.w}mm" height="${size.h}mm"`,`width="${size.w}" height="${size.h}"`)}<g id="slice-overlay" pointer-events="none"></g></svg></div><section><div class="fields2">${[['x','Left'],['y','Top'],['w','Width'],['h','Height']].map(([k,label])=>`<div class="field"><label for="slice-${k}">${label} (mm)</label><input id="slice-${k}" type="number" step="0.1" min="${k==='x'||k==='y'?0:1}" max="${k==='x'||k==='w'?size.w:size.h}" value="${state.box[k]}"></div>`).join('')}</div><div class="field"><label for="slice-boundary">At the boundary</label><select id="slice-boundary"><option value="clip">Clip at boundary</option><option value="whole">Expand to include whole decals</option></select></div><p id="slice-summary" class="notice" role="status"></p><div class="field"><label for="slice-name">Slice name</label><input id="slice-name" maxlength="160" value="${E(state.name)}"></div><div class="field"><label for="slice-tags">Library tags (optional)</label><input id="slice-tags" maxlength="300" value="${E(state.tags)}"></div><p class="hint">The original sheet stays unchanged. A library slice retains its transparent background, arrangement, fonts and individual ink settings. It can be moved and resized as one decal.</p><p class="hint">Library placement follows your model scale. Use the same scale to keep the saved millimetre size.</p></section></div>`,
  '<button data-action="close">Cancel</button><button id="slice-save">Save to library</button><button id="slice-print">Print this area…</button><button class="primary" id="slice-crop">Export cropped PDF…</button>',true);
 $('#slice-boundary').value=state.whole?'whole':'clip';
 let result=null,gesture=null;
 const canvas=$('#slice-canvas');
 const update=()=>{
  try{
   state.box=Object.fromEntries(['x','y','w','h'].map(k=>[k,Number($('#slice-'+k).value)]));state.whole=$('#slice-boundary').value==='whole';
   result=Slice.region(state.snapshot,state.page,state.box,state.whole);const b=result.box;
   $('#slice-overlay').innerHTML=`<path d="M0 0H${size.w}V${size.h}H0Z M${b.x} ${b.y}v${b.h}h${b.w}v${-b.h}Z" fill="#101725" fill-opacity=".62" fill-rule="evenodd"/><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#e5484d" stroke-width=".8" vector-effect="non-scaling-stroke"/>`;
   $('#slice-summary').textContent=`${result.items.length} ${result.items.length===1?'decal':'decals'} · ${format(b.w)} × ${format(b.h)} mm · left ${format(b.x)}, top ${format(b.y)} mm${state.whole?' · expanded to whole decals':''}`;
   $('#dialog-error').textContent='';
  }catch(e){result=null;$('#dialog-error').textContent=e.message;$('#slice-summary').textContent='Adjust the rectangle to continue.';$('#slice-overlay').innerHTML='';}
  for(const id of ['slice-save','slice-print','slice-crop'])$('#'+id).disabled=!result?.items.length;
 };
 function format(n){return Number(n.toFixed(2));}
 const setBox=b=>{const x=format(b.x),y=format(b.y);b={x,y,w:Math.min(format(b.w),size.w-x),h:Math.min(format(b.h),size.h-y)};for(const k of ['x','y','w','h'])$('#slice-'+k).value=format(b[k]);update();};
 const point=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(canvas.getScreenCTM().inverse());return{x:Math.max(0,Math.min(size.w,p.x)),y:Math.max(0,Math.min(size.h,p.y))};};
 canvas.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();gesture={id:e.pointerId,start:point(e),before:{...state.box}};canvas.setPointerCapture(e.pointerId);};
 canvas.onpointermove=e=>{if(!gesture||e.pointerId!==gesture.id)return;const end=point(e),start=gesture.start;const x=Math.min(start.x,end.x),y=Math.min(start.y,end.y);setBox({x:Math.min(x,size.w-1),y:Math.min(y,size.h-1),w:Math.max(1,Math.abs(end.x-start.x)),h:Math.max(1,Math.abs(end.y-start.y))});};
 canvas.onpointerup=e=>{if(gesture?.id!==e.pointerId)return;gesture=null;canvas.releasePointerCapture(e.pointerId);};
 canvas.onpointercancel=canvas.onlostpointercapture=()=>{if(gesture){const before=gesture.before;gesture=null;setBox(before);}};
 for(const k of ['x','y','w','h'])$('#slice-'+k).oninput=update;
 $('#slice-boundary').onchange=update;
 const remember=()=>{state.name=$('#slice-name').value.trim()||'Sheet slice';state.tags=$('#slice-tags').value;};
 $('#slice-save').onclick=async()=>{
  try{
   remember();const art=Slice.artwork(result,state.name),entry={id:DM.uid(),name:state.name,tags:state.tags,scale:state.snapshot.scale,art,updated:new Date().toISOString()};
   const fonts=[...new Map([...libraryFonts,...DM.fontsFor([art],state.snapshot.fonts)].map(f=>[f.family,f])).values()],valid=DM.validateLibrary([...library,entry],fonts);
   library=valid.library;libraryFonts=valid.libraryFonts;revision++;scheduleSave();closeDialog();renderLibrary();await flush();toast('Slice saved to your library. Your original sheet is unchanged.');
  }catch(e){if($('#dialog').open)$('#dialog-error').textContent=e.message;else fail(e);}
 };
 for(const [id,cropped] of [['slice-print',false],['slice-crop',true]])$('#'+id).onclick=()=>{try{remember();slicePrintPreview(state,result,cropped);}catch(e){$('#dialog-error').textContent=e.message;}};
 update();
}
function slicePrintPreview(state,result,cropped){
 const out=Slice.output(state.snapshot,result,cropped,state.name+(cropped?' — cropped':' — print area')),s=out.dimensions,b=result.box;
 showDialog(cropped?'Cropped PDF preview':'Print area preview',`${Number(s.w.toFixed(2))} × ${Number(s.h.toFixed(2))} mm · Actual size / 100%`,
  `<div class="slice-print-preview"><img src="${Art.url(Art.sheet(out.project,0,false,false,s))}" alt="Only the selected slice on the output page"></div><p class="notice">${cropped?'The PDF page is exactly the size of your slice. Your printer or print shop must support this custom paper size.':`The PDF keeps your ${E(DM.pageFormat(state.snapshot).label)} paper size. Only the slice prints, at its original position: left ${Number(b.x.toFixed(2))} mm, top ${Number(b.y.toFixed(2))} mm.`}</p><p class="hint">Save the PDF, then print from your PDF viewer at Actual size / 100%, with Fit to page disabled. Check your printer’s margins. This does not automatically feed or position a physical offcut.</p>${out.project.items.some(DM.hasWhite)?'<p class="hint">White ink is retained as a separate spot plate; white-only artwork is absent from the colour preview.</p>':''}`,
  '<button id="slice-back">Back to slice</button><button class="primary" id="slice-export">Save print PDF</button>',true);
 $('#slice-back').onclick=()=>sliceDialog(state);
 $('#slice-export').onclick=async()=>{
  if(busy)return;
  const button=$('#slice-export');button.disabled=true;busy=true;
  try{
   if(out.project.items.some(DM.hasWhite)&&!out.project.whiteInk)throw Error('Enable white ink in Paper & white ink before printing this slice.');
   await Art.loadFonts(out.project.fonts);
   const masks=out.project.whiteInk?await Art.masks(out.project,s):null;
   const file=await desktop.exportPDF({html:Art.printHTML(out.project),name:out.project.name,pageSize:out.project.pageSize,landscape:out.project.orientation==='landscape',...(cropped?{customSize:s}:{}),masks,spotName:out.project.spotName});
   if(file){if(button.isConnected)closeDialog();toast('Slice PDF saved. Print at Actual size / 100%.');}
  }catch(e){if(button.isConnected&&$('#dialog').open)$('#dialog-error').textContent=e.message;else fail(e);}finally{busy=false;button.disabled=false;}
 };
}
