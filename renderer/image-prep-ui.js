/* Pixel edits stay in a disposable preview until the user applies them. */
window.ImagePrepUI={open(item,onApply){
 const source=ImagePrep.source(item);
 if(item.kind!=='image'||!source.src)throw Error('Select a PNG, JPEG or WebP image to prepare.');
 if(source.pixelsW*source.pixelsH>ImagePrep.MAX_PIXELS)throw Error('Image preparation supports up to 16 megapixels. Import a smaller image to prepare it; your current artwork is unchanged.');
 const full={x:0,y:0,w:source.pixelsW,h:source.pixelsH},initial=item.imageEdits||{crop:full,removeBackground:false,color:'#ffffff',tolerance:12};
 showDialog('Prepare image',item.name,`
  <div class="prep-view-tools"><span class="hint">Preview background</span><div role="group" aria-label="Preview background"><button data-prep-bg="transparent" aria-pressed="true">Transparent</button><button data-prep-bg="light" aria-pressed="false">Light</button><button data-prep-bg="dark" aria-pressed="false">Dark</button></div></div>
  <div class="prep-compare" data-background="transparent"><section><h3>Original · drag to crop</h3><div class="prep-picture"><svg id="prep-original" viewBox="0 0 ${source.pixelsW} ${source.pixelsH}" aria-label="Original image crop area"><image href="${E(source.src)}" width="${source.pixelsW}" height="${source.pixelsH}"/><path id="prep-shade" fill="#000" fill-opacity=".45" fill-rule="evenodd" pointer-events="none"/><rect id="prep-crop-box" fill="none" stroke="#e5484d" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/></svg></div></section><section><h3>Prepared image <span id="prep-badge">Preparing…</span></h3><div class="prep-picture"><img id="prep-preview" alt="Prepared image preview" hidden><span id="prep-placeholder" class="hint">Preparing preview…</span></div></section></div>
  <div class="prep-crop-fields">${[['x','Left (px)'],['y','Top (px)'],['w','Width (px)'],['h','Height (px)']].map(([key,label])=>`<div class="field"><label for="prep-${key}">${label}</label><input id="prep-${key}" type="number" min="${key==='w'||key==='h'?1:0}" step="1" value="${initial.crop[key]}"></div>`).join('')}<button id="prep-full">Full image</button></div>
  <div class="prep-background-controls"><label class="check"><input id="prep-remove" type="checkbox" ${initial.removeBackground?'checked':''}>Remove background colour</label><div class="field"><label for="prep-color">Colour</label><input id="prep-color" type="color" value="${E(initial.color)}"></div><button id="prep-pick">Pick from original</button><div class="field"><label for="prep-tolerance">Tolerance (0–100)</label><input id="prep-tolerance" type="number" min="0" max="100" value="${initial.tolerance}"></div><button id="prep-trim">Trim transparent edges</button></div>
  <p class="hint">Removes matching colour connected to the crop edges. Enclosed matching areas stay intact. Best for plain backgrounds; this does not automatically separate subjects in photographs.</p>
  <p id="prep-status" class="notice" role="status" aria-live="polite">Preparing locally…</p><p class="hint">Cropping keeps the artwork at its current printed scale and placement. It removes border space without enlarging the logo. Your original image is retained.</p>`,
  '<button data-action="close">Cancel</button><button id="prep-reset">Reset edits</button><button id="prep-update">Update preview</button><button id="prep-copy" disabled>Add prepared copy</button><button id="prep-apply" class="primary" disabled>Apply to decal</button>',true);
 const dialog=$('#dialog'),q=s=>dialog.querySelector(s),svg=q('#prep-original'),canvas=document.createElement('canvas');
 let worker=null,timer=null,result=null,sequence=0,disposed=false,loaded=false,picking=false,cropDrag=null;
 const stop=()=>{worker?.terminate();worker=null;clearTimeout(timer);};
 const dispose=()=>{if(disposed)return;disposed=true;sequence++;stop();canvas.width=canvas.height=1;observer.disconnect();dialog.removeEventListener('close',dispose);dialog.removeEventListener('keydown',cancelCrop);};
 const observer=new MutationObserver(()=>{if(!q('#prep-original'))dispose();});observer.observe($('#dialog-content'),{childList:true});dialog.addEventListener('close',dispose);
 const crop=()=>Object.fromEntries(['x','y','w','h'].map(key=>[key,Number(q('#prep-'+key).value)]));
 const options=()=>ImagePrep.settings({crop:crop(),removeBackground:q('#prep-remove').checked,color:q('#prep-color').value,tolerance:q('#prep-tolerance').value},source.pixelsW,source.pixelsH);
 const setCrop=r=>{for(const key of ['x','y','w','h'])q('#prep-'+key).value=r[key];drawCrop();};
 function drawCrop(){try{const r=ImagePrep.cropRect(crop(),source.pixelsW,source.pixelsH);for(const key of ['x','y','width','height'])q('#prep-crop-box').setAttribute(key,r[{width:'w',height:'h'}[key]||key]);q('#prep-shade').setAttribute('d',`M0 0H${source.pixelsW}V${source.pixelsH}H0Z M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z`);}catch{/* Invalid coordinates are explained when updating the preview. */}}
 function invalidate(){sequence++;stop();result=null;q('#prep-apply').disabled=q('#prep-copy').disabled=true;q('#prep-badge').textContent='Update needed';q('#prep-status').textContent='Settings changed. Update the preview before applying.';drawCrop();}
 const point=e=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return{x:Math.max(0,Math.min(source.pixelsW,p.x)),y:Math.max(0,Math.min(source.pixelsH,p.y))};};
 svg.onpointerdown=e=>{
  if(e.button!==0||!loaded)return;e.preventDefault();
  if(picking){const p=point(e),pixel=canvas.getContext('2d').getImageData(Math.min(source.pixelsW-1,Math.floor(p.x)),Math.min(source.pixelsH-1,Math.floor(p.y)),1,1).data;
   if(!pixel[3]){q('#dialog-error').textContent='Pick a visible background pixel.';return;}
   q('#prep-color').value='#'+[...pixel.slice(0,3)].map(c=>c.toString(16).padStart(2,'0')).join('');q('#prep-remove').checked=true;picking=false;q('#prep-pick').textContent='Pick from original';invalidate();return;
  }
  cropDrag={start:point(e),before:crop(),id:e.pointerId,moved:false};svg.setPointerCapture(e.pointerId);
 };
 svg.onpointermove=e=>{if(!cropDrag||e.pointerId!==cropDrag.id)return;const p=point(e),start=cropDrag.start;if(Math.hypot(p.x-start.x,p.y-start.y)<1)return;cropDrag.moved=true;const x=Math.min(source.pixelsW-1,Math.floor(Math.min(p.x,start.x))),y=Math.min(source.pixelsH-1,Math.floor(Math.min(p.y,start.y)));setCrop({x,y,w:Math.max(1,Math.ceil(Math.max(p.x,start.x))-x),h:Math.max(1,Math.ceil(Math.max(p.y,start.y))-y)});invalidate();};
 function finishCrop(cancel){if(!cropDrag)return;const d=cropDrag;cropDrag=null;if(cancel){setCrop(d.before);invalidate();}if(svg.hasPointerCapture(d.id))svg.releasePointerCapture(d.id);}
 svg.onpointerup=()=>finishCrop(false);svg.onpointercancel=()=>finishCrop(true);svg.onlostpointercapture=()=>{if(cropDrag)finishCrop(true);};
 function cancelCrop(e){if(e.key==='Escape'&&cropDrag){e.preventDefault();e.stopPropagation();finishCrop(true);}}dialog.addEventListener('keydown',cancelCrop);
 for(const key of ['x','y','w','h','remove','color','tolerance'])q('#prep-'+key).oninput=invalidate;
 for(const button of dialog.querySelectorAll('[data-prep-bg]'))button.onclick=()=>{q('.prep-compare').dataset.background=button.dataset.prepBg;for(const b of dialog.querySelectorAll('[data-prep-bg]'))b.setAttribute('aria-pressed',String(b===button));};
 q('#prep-full').onclick=()=>{setCrop(full);invalidate();};
 q('#prep-reset').onclick=()=>{setCrop(full);q('#prep-remove').checked=false;q('#prep-color').value='#ffffff';q('#prep-tolerance').value=12;invalidate();update();};
 q('#prep-pick').onclick=()=>{picking=!picking;q('#prep-pick').textContent=picking?'Click a background pixel…':'Pick from original';};
 const failed=message=>{stop();result=null;q('#dialog-error').textContent=message;q('#prep-badge').textContent='No result';q('#prep-status').textContent='Your decal has not changed.';q('#prep-update').textContent='Update preview';q('#prep-apply').disabled=q('#prep-copy').disabled=true;};
 async function update(trim=false){
  if(!loaded||disposed)return;stop();const token=++sequence;result=null;q('#prep-apply').disabled=q('#prep-copy').disabled=true;q('#dialog-error').textContent='';q('#prep-badge').textContent='Processing…';q('#prep-status').textContent='Preparing locally at full resolution. You can cancel while it runs.';
  try{const settings={...options(),trim},pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);worker=new Worker('image-prep-worker.js');
   worker.onerror=e=>{e.preventDefault();if(!disposed&&token===sequence)failed('Image preparation could not start. Close this window and try again.');};
   worker.onmessage=e=>{if(disposed||token!==sequence)return;stop();if(e.data.error){failed(e.data.error);return;}
    try{const next=e.data.result,out=document.createElement('canvas');out.width=next.width;out.height=next.height;out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(next.buffer),next.width,next.height),0,0);const src=out.toDataURL('image/png');out.width=out.height=1;if(src.length>28e6)throw Error('Prepared PNG exceeds the artwork size limit. Choose a smaller crop.');
     const prepared=ImagePrep.prepared(item,next,src);DM.validateItem(prepared);result=prepared;setCrop(next.settings.crop);q('#prep-preview').src=src;q('#prep-preview').hidden=false;q('#prep-placeholder').hidden=true;q('#prep-badge').textContent='Raster PNG';
     q('#prep-status').textContent=`${next.width.toLocaleString()} × ${next.height.toLocaleString()} pixels · ${prepared.w.toFixed(2)} × ${prepared.h.toFixed(2)} mm · ${Math.round(Math.min(next.width/prepared.w,next.height/prepared.h)*25.4)} PPI. ${next.removed.toLocaleString()} background pixels removed. Original retained; this remains a raster image.`;
     q('#prep-apply').disabled=q('#prep-copy').disabled=false;
    }catch(error){failed(error.message);}
   };
   timer=setTimeout(()=>{if(!disposed&&token===sequence)failed('Preparation took too long. Choose a smaller image or crop.');},45000);
   worker.postMessage({width:pixels.width,height:pixels.height,buffer:pixels.data.buffer,settings},[pixels.data.buffer]);
  }catch(error){if(!disposed&&token===sequence)failed(error.message);}
 }
 const apply=copy=>{if(!result)return;try{onApply(result,copy);dispose();closeDialog();}catch(error){q('#dialog-error').textContent=error.message;}};
 q('#prep-apply').onclick=()=>apply(false);q('#prep-copy').onclick=()=>apply(true);q('#prep-update').onclick=()=>update();q('#prep-trim').onclick=()=>update(true);
 drawCrop();const image=new Image();image.src=source.src;image.decode().then(()=>{if(disposed)return;if(image.naturalWidth!==source.pixelsW||image.naturalHeight!==source.pixelsH)throw Error('Original pixel dimensions do not match the image. Reimport it before preparing.');
  canvas.width=source.pixelsW;canvas.height=source.pixelsH;canvas.getContext('2d',{willReadFrequently:true}).drawImage(image,0,0);loaded=true;update();
 }).catch(error=>{if(!disposed)failed(error.message);});
}};
