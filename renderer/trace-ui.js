/* Trace refinements stay in the preview until applied. */
window.TraceUI={open(item,onApply){
 const source=item.kind==='image'?{src:item.src,pixelsW:item.pixelsW,pixelsH:item.pixelsH}:item.traceSource;
 if(!source)throw Error('Select a PNG, JPEG or WebP image to trace.');
 const initial={colors:6,detail:'balanced',threshold:128,removeWhite:false,...item.traceSettings};
 showDialog('Trace & refine',item.name+' · '+item.w.toFixed(1)+' × '+item.h.toFixed(1)+' mm',
 '<div class="trace-view-tools"><label>Compare detail <select id="trace-zoom" aria-label="Comparison zoom"><option value="1">Fit</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label><span class="hint">Scroll either preview to compare the same area.</span></div>'+
 '<div class="trace-compare"><section><h3>Original image</h3><div id="trace-original-view" class="trace-image trace-viewport"><div id="trace-original-zoom" class="trace-zoom-content"><img id="trace-original" alt="Original imported image"></div></div></section><section><h3>Vector preview <span id="trace-badge">Preparing…</span></h3><div id="trace-vector-view" class="trace-image trace-viewport"><div id="trace-vector-zoom" class="trace-zoom-content"><div id="trace-preview" hidden></div><span id="trace-placeholder">Preparing your preview…</span></div></div></section></div>'+
 '<fieldset id="trace-shape-tools" class="trace-shape-tools" disabled><span id="trace-selected">Click a vector shape to select it.</span><button id="trace-prev-shape" title="Select previous shape">Previous</button><button id="trace-next-shape" title="Select next shape">Next</button><button id="trace-remove-shape" class="danger" disabled>Remove shape</button></fieldset>'+
 '<div class="trace-refinement-head"><strong>Traced colours</strong><button id="trace-edit-undo" disabled>Undo refinement</button><button id="trace-edit-redo" disabled>Redo</button></div><fieldset id="trace-palette" class="trace-palette" disabled></fieldset>'+
 '<p class="hint">Change a colour to replace it throughout the trace. Click unwanted shapes to remove them; enclosed cut-outs stay part of their shape. Previous/Next can select tiny shapes.</p>'+
 '<details class="trace-generation" open><summary>Tracing settings</summary><div class="trace-controls"><div class="field"><label for="trace-colors">Maximum colours</label><input id="trace-colors" type="number" min="1" max="16" value="'+initial.colors+'"></div><div class="field"><label for="trace-detail">Detail</label><select id="trace-detail"><option value="smooth">Smooth · fewer shapes</option><option value="balanced">Balanced</option><option value="fine">Fine · small details</option></select></div><div class="field"><label for="trace-threshold">Transparency threshold</label><input id="trace-threshold" type="number" min="1" max="254" value="'+initial.threshold+'"></div></div>'+
 '<label class="check trace-white"><input id="trace-white" type="checkbox" '+(initial.removeWhite?'checked':'')+'>Remove white background connected to the image edges</label><p class="hint">Re-tracing starts again from the retained image and replaces manual refinements in this preview. Undo refinement can restore the previous result.</p></details>'+
 '<p id="trace-status" class="hint" role="status" aria-live="polite">Tracing runs locally on your computer.</p><p class="hint">Best for logos, numbers and flat colours. Tracing approximates pixels; gradients and shadows become solid shapes. The original image is kept for restoration.</p>',
 '<button data-action="close">Cancel</button><button id="trace-update">Re-trace image</button><button id="trace-copy" disabled>Add vector copy</button><button class="primary" id="trace-apply" disabled>Replace with vector</button>',true);
 const dialog=document.querySelector('#dialog'),q=s=>dialog.querySelector(s);q('#trace-original').src=source.src;q('#trace-detail').value=initial.detail;
 let worker=null,timer=null,result=null,editor=null,sequence=0,disposed=false,valid=false,colorPending=false,selected=-1,undo=[],redo=[];
 const stop=()=>{worker?.terminate();worker=null;clearTimeout(timer);};
 const dispose=()=>{if(disposed)return;disposed=true;sequence++;stop();observer.disconnect();resizeObserver.disconnect();dialog.removeEventListener('close',dispose);dialog.removeEventListener('keydown',keys);};
 const observer=new MutationObserver(()=>{if(!q('#trace-original'))dispose();});observer.observe(document.querySelector('#dialog-content'),{childList:true});dialog.addEventListener('close',dispose);
 const capture=()=>editor&&result?{result:{...DM.clone(result),svg:editor.svg()},selected}:null;
 const remember=state=>{if(state){undo.push(state);if(undo.length>20)undo.shift();}redo=[];};
 function buttons(){q('#trace-apply').disabled=q('#trace-copy').disabled=!valid||colorPending;q('#trace-palette').disabled=q('#trace-shape-tools').disabled=!valid;q('#trace-edit-undo').disabled=!undo.length;q('#trace-edit-redo').disabled=!redo.length;q('#trace-remove-shape').disabled=!valid||selected<0||editor.count<2;}
 function zoom(){
  if(disposed)return;const factor=Number(q('#trace-zoom').value),aspect=source.pixelsW/source.pixelsH,view=q('#trace-original-view'),baseW=Math.min(view.clientWidth-2,(view.clientHeight-2)*aspect),baseH=baseW/aspect;
  for(const [viewport,content,picture]of [['#trace-original-view','#trace-original-zoom','#trace-original'],['#trace-vector-view','#trace-vector-zoom','#trace-preview']]){
   const v=q(viewport),c=q(content),p=q(picture);c.style.width=Math.max(v.clientWidth,baseW*factor)+'px';c.style.height=Math.max(v.clientHeight,baseH*factor)+'px';p.style.width=baseW*factor+'px';p.style.height=baseH*factor+'px';
  }
 }
 const resizeObserver=new ResizeObserver(zoom);resizeObserver.observe(q('#trace-original-view'));q('#trace-zoom').onchange=zoom;
 const scrollTargets=new WeakMap();
 for(const [a,b]of [['#trace-original-view','#trace-vector-view'],['#trace-vector-view','#trace-original-view']])q(a).onscroll=()=>{
  if(disposed)return;const x=q(a),y=q(b),expected=scrollTargets.get(x);scrollTargets.delete(x);
  // Ignore the scroll event caused by syncing the other pane, while allowing a
  // newer user scroll to supersede it before that queued event is delivered.
  if(expected&&Math.abs(x.scrollLeft-expected.left)<.5&&Math.abs(x.scrollTop-expected.top)<.5)return;
  if(Math.abs(y.scrollLeft-x.scrollLeft)>.5||Math.abs(y.scrollTop-x.scrollTop)>.5){scrollTargets.set(y,{left:x.scrollLeft,top:x.scrollTop});y.scrollLeft=x.scrollLeft;y.scrollTop=x.scrollTop;}
 };
 function renderPalette(){
  q('#trace-palette').innerHTML=editor.palette().map(({color,shapes})=>'<label class="trace-colour-row"><input type="color" data-trace-colour="'+color+'" value="'+color+'" aria-label="Replace '+color+'"><input type="text" data-trace-hex="'+color+'" value="'+color+'" maxlength="7" aria-label="Hex colour '+color+'"><span>'+shapes.length+' '+(shapes.length===1?'shape':'shapes')+'</span></label>').join('');
  for(const input of q('#trace-palette').querySelectorAll('input')){
   input.oninput=()=>{colorPending=true;buttons();};
   input.onchange=()=>{const old=input.dataset.traceColour||input.dataset.traceHex,next=input.value.trim().toLowerCase();
    if(!/^#[a-f\d]{6}$/.test(next)){colorPending=true;input.setAttribute('aria-invalid','true');q('#dialog-error').textContent='Enter a six-digit colour such as #e5484d.';buttons();return;}
    colorPending=false;q('#dialog-error').textContent='';if(next!==old)commit(()=>editor.recolor(old,next));else{input.removeAttribute('aria-invalid');buttons();}
   };
  }
 }
 function renderEditor(palette=true){
  result.svg=editor.svg();result.paths=editor.count;result.colors=editor.palette().length;
  q('#trace-preview').innerHTML=editor.preview(selected);q('#trace-preview').hidden=false;q('#trace-placeholder').hidden=true;
  q('#trace-badge').textContent='Traced vector · '+editor.count.toLocaleString()+' paths · '+result.colors+' colours';
  q('#trace-selected').textContent=selected<0?'Click a vector shape to select it.':'Shape '+(selected+1)+' of '+editor.count+(editor.count===1?' · keep at least one shape':'');
  q('#trace-status').textContent='Printed size stays '+item.w.toFixed(1)+' × '+item.h.toFixed(1)+' mm. '+(result.width<source.pixelsW?'Trace generated at '+result.width+' × '+result.height+' px; the full-resolution original is kept. ':'')+'Review small lettering and cut-outs before applying.';
  if(palette){colorPending=false;renderPalette();}buttons();zoom();
 }
 function commit(fn){if(!valid)return;try{const before=capture();fn();remember(before);q('#dialog-error').textContent='';renderEditor();}catch(error){q('#dialog-error').textContent=error.message;}}
 function restore(state){sequence++;stop();result=DM.clone(state.result);editor=TraceRefine.load(result.svg);selected=state.selected<editor.count?state.selected:-1;valid=true;
  q('#trace-colors').value=result.settings.colors;q('#trace-detail').value=result.settings.detail;q('#trace-threshold').value=result.settings.threshold;q('#trace-white').checked=result.settings.removeWhite;q('#dialog-error').textContent='';renderEditor();
 }
 q('#trace-edit-undo').onclick=()=>{if(!undo.length)return;const current=capture();if(current)redo.push(current);restore(undo.pop());};
 q('#trace-edit-redo').onclick=()=>{if(!redo.length)return;const current=capture();if(current)undo.push(current);restore(redo.pop());};
 q('#trace-preview').onclick=e=>{if(!valid)return;const p=e.target.closest('[data-trace-shape]');selected=p?Number(p.dataset.traceShape):-1;renderEditor(false);};
 q('#trace-prev-shape').onclick=()=>{selected=selected<0?editor.count-1:(selected+editor.count-1)%editor.count;renderEditor(false);};
 q('#trace-next-shape').onclick=()=>{selected=(selected+1)%editor.count;renderEditor(false);};
 const remove=()=>commit(()=>{editor.remove(selected);selected=-1;});q('#trace-remove-shape').onclick=remove;
 function keys(e){if(e.target.matches('input,textarea,select'))return;if(e.key==='Delete'&&valid&&selected>=0){e.preventDefault();remove();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();q(e.shiftKey?'#trace-edit-redo':'#trace-edit-undo').click();}}
 dialog.addEventListener('keydown',keys);
 const invalidate=()=>{sequence++;stop();valid=false;buttons();q('#trace-badge').textContent='Update needed';q('#trace-status').textContent='Settings changed. Re-trace to review the new result, or cancel to keep your decal.';};
 for(const id of ['#trace-colors','#trace-detail','#trace-threshold','#trace-white'])q(id).oninput=invalidate;
 async function update(){
  stop();const token=++sequence,previous=capture();valid=false;buttons();q('#dialog-error').textContent='';q('#trace-badge').textContent='Tracing…';q('#trace-status').textContent='Tracing locally… You can change settings or cancel while it runs.';
  try{
   const settings=DecalTrace.options({colors:q('#trace-colors').value,detail:q('#trace-detail').value,threshold:q('#trace-threshold').value,removeWhite:q('#trace-white').checked});
   const image=new Image();image.src=source.src;await image.decode();if(disposed||token!==sequence)return;
   const maxEdge=settings.detail==='fine'?1536:1024,factor=Math.min(1,maxEdge/Math.max(image.naturalWidth,image.naturalHeight));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
   worker=new Worker('trace-worker.js');
   const failed=message=>{if(disposed||token!==sequence)return;stop();valid=false;buttons();q('#dialog-error').textContent=message;q('#trace-badge').textContent='No result';q('#trace-status').textContent='Your artwork has not changed.';};
   worker.onerror=event=>{event.preventDefault();failed('Tracing could not start. Close this window and try again.');};
   worker.onmessage=event=>{if(disposed||token!==sequence)return;stop();if(event.data.error){failed(event.data.error);return;}
    try{const next=event.data.result,nextEditor=TraceRefine.load(next.svg);remember(previous);result=next;editor=nextEditor;selected=-1;valid=true;renderEditor();}catch(error){failed(error.message);}
   };
   timer=setTimeout(()=>failed('Tracing took too long. Try fewer colours or Smooth detail.'),45000);
   worker.postMessage({width:pixels.width,height:pixels.height,buffer:pixels.data.buffer,settings},[pixels.data.buffer]);canvas.width=canvas.height=1;
  }catch(error){if(!disposed&&token===sequence){stop();valid=false;buttons();q('#dialog-error').textContent=error.message;q('#trace-badge').textContent='No result';}}
 }
 const apply=copy=>{if(!valid||colorPending||!result)return;try{const vector={...DM.clone(item),kind:'svg',svg:editor.svg(),mixed:false,traceSource:DM.clone(source),traceSettings:result.settings};delete vector.src;delete vector.pixelsW;delete vector.pixelsH;onApply(vector,copy);dispose();closeDialog();}catch(error){q('#dialog-error').textContent=error.message;}};
 q('#trace-apply').onclick=()=>apply(false);q('#trace-copy').onclick=()=>apply(true);q('#trace-update').onclick=update;
 if(item.traceSource){try{editor=TraceRefine.load(item.svg);const vb=Art.sanitize(item.svg).viewBox;result={svg:item.svg,width:vb[2],height:vb[3],settings:initial};valid=true;renderEditor();}catch(error){q('#dialog-error').textContent=error.message;q('#trace-badge').textContent='Re-trace to refine';q('#trace-placeholder').textContent='Use Re-trace image to create editable paths.';buttons();}}
 else update();
}};
