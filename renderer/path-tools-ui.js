'use strict';
// Canvas tools own a temporary preview. Only Finish / Apply writes to the sheet.
const CanvasTools={
 active:null,
 resolve(){const tool=this.active;if(!tool)return;if(tool.kind==='path')tool.finish(true);else tool.cancel();},
 cancel(){this.active?.cancel();},
 mount(){this.active?.mount();},
 draw(){this.active?.draw();this.buttons();},
 buttons(){for(const b of document.querySelectorAll('.creation-launchers [data-action]'))b.setAttribute('aria-pressed',String((b.dataset.action==='draw-path'&&this.active?.kind==='path')||(b.dataset.action==='combine-shapes'&&this.active?.kind==='combine')));document.querySelector('#paper')?.classList.toggle('path-tool-active',this.active?.kind==='path');document.querySelector('.toolbar [data-action="select"]')?.classList.toggle('active',!this.active);},
 pointer(type,e){const tool=this.active;if(tool?.kind!=='path')return false;tool.pointer(type,e);return true;},
 key(e){return this.active?.key?.(e)||false;}
};
function canvasToolOverlay(){let overlay=$('#canvas-tool-overlay');if(!overlay){overlay=document.createElementNS('http://www.w3.org/2000/svg','g');overlay.id='canvas-tool-overlay';$('#paper').append(overlay);}return overlay;}
function resetCanvasTool(){CanvasTools.active=null;render();}
function startPathTool(source=null){
 if(CanvasTools.active?.kind==='path'&&CanvasTools.active.sourceId===(source?.id||null))return;
 CanvasTools.resolve();if(source&&source.kind!=='path')throw Error('Select an editable path.');if(source?.locked)throw Error('Unlock this path before editing.');
 if($('#dialog').open)closeDialog();
 const original=source?DM.clone(source):null,toolPage=page;
 let contours=source?PathTools.contours(source):[],ci=0,ni=-1,mode=source?'edit':'pen',gesture=null,undo=[],redo=[];
 const style={name:source?.name||'Drawn path',fill:source?.fill||'#e5484d',stroke:source?.stroke||'#111827',strokeWidth:source?.strokeWidth??.5,opacity:source?.opacity??1,ink:source?.ink||'colour',page:toolPage};
 const initialContours=JSON.stringify(contours);
 const state=()=>DM.clone(contours),point=()=>contours[ci]?.nodes[ni],remember=before=>{undo.push(before);if(undo.length>40)undo.shift();redo=[];};
 function change(fn){const before=state(),selection=[ci,ni];try{fn();remember(before);draw();}catch(e){contours=before;[ci,ni]=selection;draw();message(e);}}
 const message=e=>{if($('#path-error'))$('#path-error').textContent=e.message||e;};
 const coords=e=>{const p=svgPoint(e);return[Math.max(-1000,Math.min(2000,p.x)),Math.max(-1000,Math.min(2000,p.y))];};
 const readStyle=()=>({...style,strokeWidth:DM.number($('#path-width').value,0,50,'Line width'),stroke:$('#path-stroke').value,fill:$('#path-no-fill').checked?'none':$('#path-fill').value});
 function result(){const out=PathTools.artwork(contours,readStyle());if(contours.some(c=>!c.closed)&&!out.strokeWidth)throw Error('Open lines need a line width greater than zero.');return out;}
 function mount(){
  if($('#path-controls'))return;
  $('#inspector').innerHTML=`<section id="path-controls" class="canvas-tool-panel"><h2 class="inspector-title">Path Tool</h2><p class="hint">${original?'Edit points directly on your sheet.':'Draw directly on your sheet.'} Finish keeps the path; Cancel discards this edit.</p><div class="canvas-tool-commit"><button id="path-apply" class="primary">Finish Path</button><button id="path-cancel">Cancel</button></div><div class="path-toolbar">${[['pen','Pen / Bézier'],['freehand','Freehand'],['edit','Edit Points'],['pan','Pan']].map(([id,label])=>`<button data-path-mode="${id}">${label}</button>`).join('')}</div><div class="row"><button id="path-fit">Fit Sheet</button><button id="path-fit-art">Fit Path</button></div><div class="row"><button id="path-undo">Undo drawing</button><button id="path-redo">Redo</button></div><label class="check"><input id="path-closed" type="checkbox">Closed shape</label><div class="field"><label for="path-width">Line width (mm)</label><input id="path-width" type="number" min="0" max="50" step=".1" value="${style.strokeWidth}"></div><div class="fields2"><div class="field"><label for="path-stroke">Line colour</label><input id="path-stroke" type="color" value="${style.stroke}"></div><div class="field"><label for="path-fill">Fill colour</label><input id="path-fill" type="color" value="${style.fill==='none'?'#e5484d':style.fill}"></div></div><label class="check"><input id="path-no-fill" type="checkbox" ${style.fill==='none'?'checked':''}>No fill</label><details open><summary>Selected point</summary><div class="fields2"><div class="field"><label for="path-x">X (mm)</label><input id="path-x" type="number" step=".1"></div><div class="field"><label for="path-y">Y (mm)</label><input id="path-y" type="number" step=".1"></div></div><div class="path-point-actions"><button id="path-smooth">Smooth point</button><button id="path-corner">Corner point</button><button id="path-insert">Insert point after</button><button id="path-delete">Delete point</button></div></details><p id="path-info" class="hint" role="status"></p><p id="path-error" class="dialog-error" role="alert"></p><p class="hint">Click to place points; drag while placing to curve them. Click the first point to close. Drag handles to bend; Shift mirrors the opposite handle. Ctrl + wheel zooms. Enter finishes, Escape cancels.</p></section>`;
  for(const b of $$('[data-path-mode]'))b.onclick=()=>{mode=b.dataset.pathMode;draw();};
  $('#path-fit').onclick=()=>{zoom=0;renderPaper();};
  $('#path-fit-art').onclick=()=>{try{const b=DM.bounds(result()),area=$('#sheet-scroll');zoom=Math.max(.5,Math.min(12,(area.clientWidth-70)/(b.w+10),(area.clientHeight-70)/(b.h+10)));renderPaper();const r=$('#paper').getBoundingClientRect(),a=area.getBoundingClientRect();area.scrollLeft+=r.left+(b.x+b.w/2)*zoom-(a.left+area.clientWidth/2);area.scrollTop+=r.top+(b.y+b.h/2)*zoom-(a.top+area.clientHeight/2);}catch(e){message(e);}};
  $('#path-closed').onchange=e=>{const checked=e.target.checked;change(()=>{for(const c of contours)c.closed=checked;});};
  for(const id of ['path-width','path-stroke','path-fill','path-no-fill'])$('#'+id).oninput=draw;
  $('#path-undo').onclick=()=>{if(!undo.length)return;redo.push(state());contours=undo.pop();ni=-1;draw();};$('#path-redo').onclick=()=>{if(!redo.length)return;undo.push(state());contours=redo.pop();ni=-1;draw();};
  for(const [id,k] of [['path-x',0],['path-y',1]])$('#'+id).onchange=e=>change(()=>{const p=[...point().p];p[k]=DM.number(e.target.value,-1000,2000,'Point position');moveNode(point(),p);});
  $('#path-corner').onclick=()=>change(()=>{const n=point();n.i=[...n.p];n.o=[...n.p];});
  $('#path-smooth').onclick=()=>change(()=>{const c=contours[ci],nodes=c.nodes,n=point(),prev=nodes[(ni+nodes.length-1)%nodes.length].p,next=nodes[(ni+1)%nodes.length].p,a=!c.closed&&ni===0?n.p:prev,b=!c.closed&&ni===nodes.length-1?n.p:next,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,d=(!c.closed&&(ni===0||ni===nodes.length-1)?len:Math.min(Math.hypot(n.p[0]-prev[0],n.p[1]-prev[1]),Math.hypot(next[0]-n.p[0],next[1]-n.p[1])))/3;n.i=[n.p[0]-dx/len*d,n.p[1]-dy/len*d];n.o=[n.p[0]+dx/len*d,n.p[1]+dy/len*d];});
  $('#path-insert').onclick=()=>change(()=>ni=PathTools.split(contours[ci],ni));
  $('#path-delete').onclick=()=>change(()=>{contours[ci].nodes.splice(ni,1);if(!contours[ci].nodes.length)contours.splice(ci,1);ni=-1;});
  $('#path-apply').onclick=()=>{try{finish();}catch(e){message(e);}};$('#path-cancel').onclick=cancel;
 }
 function draw(){
  mount();const p=point(),radius=5/Math.max(.001,Math.abs($('#paper').getScreenCTM()?.a||1));let paint;try{paint=readStyle();}catch{paint=style;}
  for(const el of $$('#paper .sheet-item'))if(el.dataset.id===original?.id)el.style.visibility='hidden';
  $('#path-drawing')?.remove();
  const overlay=canvasToolOverlay();overlay.innerHTML=`<g id="path-drawing" pointer-events="none" opacity="${paint.opacity}">${[true,false].map(closed=>`<path d="${PathTools.data(contours.filter(c=>c.closed===closed))}" fill="${closed?paint.fill:'none'}" fill-rule="evenodd" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</g><g id="path-nodes">${contours.map((c,cindex)=>c.nodes.map((n,index)=>{const active=cindex===ci&&index===ni;return(active?['i','o'].map(k=>`<line x1="${n.p[0]}" y1="${n.p[1]}" x2="${n[k][0]}" y2="${n[k][1]}" stroke="#2463b8" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/><circle data-path-handle="${k}" cx="${n[k][0]}" cy="${n[k][1]}" r="${radius*.7}" fill="#fff" stroke="#2463b8" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join(''):'')+`<circle data-path-ci="${cindex}" data-path-ni="${index}" cx="${n.p[0]}" cy="${n.p[1]}" r="${radius}" fill="${active?'#e5484d':'#fff'}" stroke="#a92331" stroke-width="1" vector-effect="non-scaling-stroke"/>`;})).join('')}</g>`;
  if(original){const sourceLayer=$$('#paper .sheet-item').find(el=>el.dataset.id===original.id);sourceLayer?.after($('#path-drawing'));}
  for(const b of $$('[data-path-mode]'))b.setAttribute('aria-pressed',String(b.dataset.pathMode===mode));
  for(const id of ['path-x','path-y','path-smooth','path-corner','path-insert','path-delete'])$('#'+id).disabled=!p;
  if(p){$('#path-x').value=Number(p.p[0].toFixed(3));$('#path-y').value=Number(p.p[1].toFixed(3));}
  $('#path-undo').disabled=!undo.length;$('#path-redo').disabled=!redo.length;$('#undo').disabled=!undo.length;$('#redo').disabled=!redo.length;$('#path-closed').checked=!!contours.length&&contours.every(c=>c.closed);
  try{const out=result();$('#path-info').textContent=`${contours.reduce((n,c)=>n+c.nodes.length,0)} points · ${out.w.toFixed(2)} × ${out.h.toFixed(2)} mm`;$('#path-apply').disabled=false;message('');}catch(e){$('#path-apply').disabled=true;$('#path-info').textContent=contours.length?e.message:'Choose Pen or Freehand, then draw on the canvas.';}
 }
 function moveNode(n,to){const dx=to[0]-n.p[0],dy=to[1]-n.p[1];for(const k of ['p','i','o'])n[k]=[n[k][0]+dx,n[k][1]+dy];}
 function pointer(type,e){
  if(type==='down'){
   if(e.button!==0||gesture||!e.target.closest('#paper'))return;e.preventDefault();const start=coords(e),before=state();
   if(mode==='pan'){gesture={id:e.pointerId,kind:'pan',client:[e.clientX,e.clientY],scroll:[$('#sheet-scroll').scrollLeft,$('#sheet-scroll').scrollTop],before};}
   else{
    const hit=e.target.closest('[data-path-ni]'),handle=e.target.closest('[data-path-handle]');
    if(mode==='pen'&&hit&&Number(hit.dataset.pathNi)===0&&Number(hit.dataset.pathCi)===ci&&contours[ci]?.nodes.length>=3&&!contours[ci].closed){change(()=>contours[ci].closed=true);mode='edit';draw();return;}
    if(handle&&point())gesture={id:e.pointerId,kind:handle.dataset.pathHandle,before};
    else if(hit){ci=Number(hit.dataset.pathCi);ni=Number(hit.dataset.pathNi);gesture={id:e.pointerId,kind:'point',before};}
    else if(mode==='edit'){ni=-1;draw();return;}
    else if(mode==='freehand'){ci=contours.length;contours.push({closed:false,nodes:[{p:start,i:[...start],o:[...start]}]});ni=0;gesture={id:e.pointerId,kind:'freehand',before,samples:[start]};}
    else{if(!contours[ci]||contours[ci].closed){ci=contours.length;contours.push({closed:false,nodes:[]});}if(contours.reduce((n,c)=>n+c.nodes.length,0)>=2048){message('Maximum 2,048 points per path.');return;}contours[ci].nodes.push({p:start,i:[...start],o:[...start]});ni=contours[ci].nodes.length-1;gesture={id:e.pointerId,kind:'new',before};}
   }
   $('#sheet-scroll').setPointerCapture(e.pointerId);draw();return;
  }
  if(gesture?.id!==e.pointerId)return;
  if(type==='up'||type==='cancel'){endGesture(type==='cancel');return;}
  const pos=coords(e),g=gesture,n=point();
  if(g.kind==='pan'){$('#sheet-scroll').scrollLeft=g.scroll[0]+g.client[0]-e.clientX;$('#sheet-scroll').scrollTop=g.scroll[1]+g.client[1]-e.clientY;return;}
  if(g.kind==='freehand'){const last=g.samples.at(-1);if(g.samples.length<1500&&Math.hypot(pos[0]-last[0],pos[1]-last[1])>=.5/(zoom||fitScale())){g.samples.push(pos);contours[ci].nodes.push({p:pos,i:[...pos],o:[...pos]});ni=contours[ci].nodes.length-1;}}
  else if(g.kind==='point')moveNode(n,pos);
  else{const key=g.kind==='new'?'o':g.kind;n[key]=pos;if(g.kind==='new'||e.shiftKey)n[key==='o'?'i':'o']=[2*n.p[0]-pos[0],2*n.p[1]-pos[1]];}
  draw();
 }
 function endGesture(revert){const g=gesture;if(!g)return;gesture=null;if(revert){contours=g.before;if(g.kind==='pan'){$('#sheet-scroll').scrollLeft=g.scroll[0];$('#sheet-scroll').scrollTop=g.scroll[1];}}else if(g.kind!=='pan'){if(g.kind==='freehand'){if(g.samples.length<2)contours=g.before;else{try{contours[ci]=PathTools.smooth(g.samples,1/(zoom||fitScale()));ni=contours[ci].nodes.length-1;}catch{contours=g.before;}}}remember(g.before);}if($('#sheet-scroll').hasPointerCapture(g.id))$('#sheet-scroll').releasePointerCapture(g.id);draw();}
 function finish(allowEmpty=false){
  endGesture(false);if(!contours.length&&allowEmpty){cancel();return;}
  if(original&&JSON.stringify(contours)===initialContours&&JSON.stringify(readStyle())===JSON.stringify(style)){resetCanvasTool();return;}
  let out;try{out=result();}catch(e){message(e);throw Error('Finish or cancel the Path Tool first. '+e.message);}
  CanvasTools.active=null;
  try{mutate(()=>{if(original){const index=project.items.findIndex(i=>i.id===original.id);if(index<0||project.items[index].locked)throw Error('This path is unavailable or locked.');project.items[index]={...project.items[index],...out,id:original.id};selected=new Set([original.id]);}else{out.page=toolPage;project.items.push(out);selected=new Set([out.id]);}});}catch(e){CanvasTools.active=controller;render();throw e;}
 }
 function cancel(){endGesture(true);resetCanvasTool();}
 const controller={kind:'path',sourceId:source?.id||null,mount,draw,pointer,finish,cancel,key(e){
  if($('#dialog').open)return false;
  if(e.key==='Escape'){e.preventDefault();gesture?endGesture(true):cancel();return true;}
  const ctrl=e.ctrlKey||e.metaKey;
  if(ctrl&&e.key.toLowerCase()==='s'){e.preventDefault();try{e.target.blur?.();finish(true);saveEditableProject().catch(fail);}catch(err){fail(err);}return true;}
  if(e.target.matches('input,textarea,select'))return true;
  if(gesture&&ctrl&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();endGesture(true);return true;}
  if(e.key==='Enter'){e.preventDefault();try{finish();}catch(err){message(err);}return true;}
  if(ctrl&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();$('#path-'+(e.shiftKey||e.key.toLowerCase()==='y'?'redo':'undo')).click();}
  if(e.key==='Delete'&&point()){e.preventDefault();$('#path-delete').click();}return true;
 }};
 CanvasTools.active=controller;selected=source?new Set([source.id]):new Set();render();$('.right-sidebar').scrollTop=0;
}

function startCombineTool(){
 CanvasTools.resolve();if($('#dialog').open)closeDialog();let result=null,chosen=[],operation='unite',baseId=null,keep=false;
 function mount(){if($('#combine-controls'))return;$('#inspector').innerHTML=`<section id="combine-controls" class="canvas-tool-panel"><h2 class="inspector-title">Merge & Cut</h2><p class="hint">Select shapes directly on the canvas. Ctrl / Shift-click adds or removes shapes. Drag empty space to select a group.</p><div class="canvas-tool-commit"><button id="combine-apply" class="primary" disabled>Apply</button><button id="combine-cancel">Cancel</button></div><div class="field"><label for="combine-operation">Operation</label><select id="combine-operation"><option value="unite">Merge</option><option value="subtract">Cut from base</option><option value="intersect">Keep Overlap</option><option value="exclude">Exclude Overlap</option></select></div><div class="field"><label for="combine-base">Base shape / result colour</label><select id="combine-base"></select></div><label class="check"><input id="combine-keep" type="checkbox">Keep original shapes too</label><p id="combine-info" class="hint" role="status"></p><p id="combine-error" class="dialog-error" role="alert"></p><p class="hint">The canvas shows the result at its actual position. Apply keeps it; Cancel keeps the original shapes.</p><details><summary>Supported artwork</summary><p class="hint">2–20 unlocked, filled native shapes or closed paths, including groups of them. Imported SVGs, images and text cannot be combined. Uses filled areas, omits outlines and keeps the base shape’s fill, opacity and ink treatment. For a group, the first child supplies the fill colour.</p></details></section>`;
  $('#combine-operation').value=operation;$('#combine-keep').checked=keep;
  $('#combine-operation').onchange=e=>{operation=e.target.value;renderPaper();};$('#combine-base').onchange=e=>{baseId=e.target.value;renderPaper();};$('#combine-keep').onchange=e=>{keep=e.target.checked;renderPaper();};$('#combine-cancel').onclick=()=>resetCanvasTool();
  $('#combine-apply').onclick=()=>{if(!result)return;const out=DM.clone(result),ids=new Set(chosen.map(i=>i.id));CanvasTools.active=null;try{mutate(()=>{if(project.items.filter(i=>ids.has(i.id)).length!==ids.size)throw Error('The selection changed. Select your shapes again.');const index=Math.max(...project.items.map((i,n)=>ids.has(i.id)?n:-1))+1;project.items.splice(index,0,out);if(!keep)project.items=project.items.filter(i=>!ids.has(i.id));selected=new Set([out.id]);});}catch(e){CanvasTools.active=controller;render();$('#combine-error').textContent=e.message;}};
 }
 function draw(){mount();chosen=items().filter(i=>i.page===page).map(DM.clone);const select=$('#combine-base');if(!chosen.some(i=>i.id===baseId))baseId=chosen[0]?.id||null;select.innerHTML=chosen.map(i=>`<option value="${E(i.id)}">${E(i.name)}</option>`).join('');select.value=baseId||'';
  const overlay=canvasToolOverlay();overlay.setAttribute('pointer-events','none');overlay.innerHTML='';
  try{result=PathTools.combine(chosen,operation,baseId);const ids=new Set(chosen.map(i=>i.id));for(const el of $$('#paper .sheet-item'))if(ids.has(el.dataset.id)){// Keep hit areas and selection borders available while previewing the replacement.
    const inner=el.firstElementChild;for(const child of [...inner.children])if(!child.classList.contains('item-hit')&&!child.classList.contains('selection')&&!child.classList.contains('handle'))child.style.opacity=keep?'1':'0';
   }overlay.innerHTML=Art.element(result,'combine-preview','all');const topLayer=$$('#paper .sheet-item').filter(el=>ids.has(el.dataset.id)).at(-1);topLayer?.after(overlay);$('#combine-info').textContent=`${chosen.length} shapes → ${result.w.toFixed(2)} × ${result.h.toFixed(2)} mm`;$('#combine-error').textContent='';$('#combine-apply').disabled=false;
  }catch(e){result=null;$('#combine-info').textContent=`${chosen.length} shapes selected`;$('#combine-error').textContent=chosen.length<2?'Select at least two shapes on the canvas.':e.message;$('#combine-apply').disabled=true;}
 }
 const controller={kind:'combine',mount,draw,cancel:resetCanvasTool,key(e){if(e.key==='Escape'&&!$('#dialog').open){e.preventDefault();resetCanvasTool();return true;}return false;}};
 CanvasTools.active=controller;render();$('.right-sidebar').scrollTop=0;
}
// Switching away finishes a valid path; shape-operation previews require explicit Apply.
document.addEventListener('click',e=>{
 if(!CanvasTools.active||e.target.closest('#inspector,#sheet-scroll,#dialog,.theme-switch,[data-path-mode]'))return;
 const action=e.target.closest('[data-action]')?.dataset.action;
 if(action==='draw-path'&&CanvasTools.active.kind==='path'&&CanvasTools.active.sourceId===null)return;
 if(['zoom-in','zoom-out','fit','theme-light','theme-dark','sidebar-grid','sidebar-list'].includes(action)||e.target.closest('summary')||e.target.closest('#snap'))return;
 if(CanvasTools.active.kind==='path'&&['undo','redo'].includes(action)){e.preventDefault();e.stopImmediatePropagation();$('#path-'+action)?.click();return;}
 try{CanvasTools.resolve();}catch(err){e.preventDefault();e.stopImmediatePropagation();fail(err);}
},true);
