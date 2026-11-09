/* Selective SVG editing. Source definitions and sibling order stay intact. */
const VectorEdit=(()=>{
 const drawable='path,rect,circle,ellipse,polygon,polyline,line,text,image,use';
 function load(source){
  const clean=Art.sanitize(source),doc=new DOMParser().parseFromString(clean.svg,'image/svg+xml'),root=doc.documentElement;
  const nodes=[...root.querySelectorAll(drawable)].filter(n=>!n.closest('defs,clipPath,mask,symbol,pattern,linearGradient,radialGradient'));
  if(!nodes.length)throw Error('This artwork has no selectable drawing shapes.');
  return{root,nodes,svg:()=>new XMLSerializer().serializeToString(root),remove(index){
   const n=nodes[index];if(!n)throw Error('Select a shape first.');
   const references=new Set([...root.querySelectorAll('use')].map(u=>u.getAttribute('href')||u.getAttributeNS('http://www.w3.org/1999/xlink','href')));let linked=false;for(let p=n;p&&p!==root;p=p.parentElement)if(p.id&&references.has('#'+p.id))linked=true;
   if(linked)throw Error('This shape is also used by linked copies. Select the visible copies instead, or expand them in a vector editor first.');
   // Hiding keeps CSS sibling selectors, clipping definitions and IDs stable.
   n.style.setProperty('display','none','important');
  }};
 }
 function open(item,onApply){
  if(item.kind!=='svg')throw Error('Select imported vector artwork.');if(item.locked)throw Error('Unlock this decal before editing it.');
  const original=item.vectorSource?.svg||item.svg,initial=Art.sanitize(item.svg).svg;Art.sanitize(original);
  let editor=load(initial),selected=-1,undo=[],redo=[],restored=false;
  showDialog('Edit Vector Artwork','Select a background shape and remove it. Your artwork stays vector.',
   '<div class="vector-controls"><div class="row"><button data-vector-bg="transparent" aria-pressed="true">Transparent</button><button data-vector-bg="light" aria-pressed="false">Light</button><button data-vector-bg="dark" aria-pressed="false">Dark</button></div><label>Zoom <select id="vector-zoom"><option value="1">Fit</option><option value="2">200%</option><option value="4">400%</option><option value="8">800%</option></select></label></div>'+
   '<div id="vector-view" class="vector-view" data-background="transparent"><div id="vector-surface"><div id="vector-art"></div><div id="vector-selection" hidden></div></div></div>'+
   '<div class="vector-controls"><div class="row"><button id="vector-prev">Previous shape</button><button id="vector-next">Next shape</button><button id="vector-white">Next white shape</button><button class="danger" id="vector-remove" disabled>Remove selected shape</button></div><span id="vector-selected" role="status">Click a shape in the preview.</span></div>'+
   '<p class="hint">White lettering and details are kept unless you select them. One path may contain several connected parts or cut-outs; removing it removes the whole path. Embedded bitmap backgrounds need the image preparation tool. Size and placement stay unchanged.</p>',
   '<button data-action="close">Cancel</button><button id="vector-undo" disabled>Undo</button><button id="vector-redo" disabled>Redo</button><button id="vector-restore">Restore original</button><button id="vector-apply" class="primary" disabled>Apply changes</button>',true);
  const dialog=$('#dialog'),host=$('#vector-art'),shadow=host.attachShadow({mode:'open'}),view=$('#vector-view'),surface=$('#vector-surface'),box=$('#vector-selection');
  let previewNodes=[],alive=true;
  const snapshot=()=>({svg:editor.svg(),restored});
  const remember=(stack,value)=>{stack.push(value);let bytes=stack.reduce((n,s)=>n+s.svg.length,0);while(stack.length>1&&(stack.length>30||bytes>24e6))bytes-=stack.shift().svg.length;};
  function visible(n){if(['hidden','collapse'].includes(getComputedStyle(n).visibility))return false;for(let p=n;p&&p!==shadow;p=p.parentNode){if(p.nodeType===1){const css=getComputedStyle(p);if(css.display==='none'||Number(css.opacity)===0)return false;}}return true;}
  function available(){return previewNodes.map((n,i)=>visible(n)?i:-1).filter(i=>i>=0);}
  function highlight(){
   if(!alive)return;const n=previewNodes[selected];box.hidden=!n||!visible(n);if(box.hidden)return;const b=n.getBoundingClientRect(),s=surface.getBoundingClientRect();Object.assign(box.style,{left:(b.x-s.x)+'px',top:(b.y-s.y)+'px',width:b.width+'px',height:b.height+'px'});
  }
  function controls(){
   const n=previewNodes[selected];$('#vector-remove').disabled=!n;$('#vector-undo').disabled=!undo.length;$('#vector-redo').disabled=!redo.length;$('#vector-apply').disabled=editor.svg()===initial&&!(restored&&item.vectorSource);
   $('#vector-selected').textContent=n?'Shape '+(selected+1)+' · '+n.localName+' · '+(n.id||getComputedStyle(n).fill):'Click a shape, or use Next white shape.';highlight();
  }
  function render(){
   shadow.replaceChildren(document.importNode(editor.root,true));const svg=shadow.firstElementChild;
   svg.setAttribute('data-vector-root','');for(const style of svg.querySelectorAll('style'))style.textContent=style.textContent.replace(/:root\b/g,'[data-vector-root]');
   svg.style.setProperty('width','100%','important');svg.style.setProperty('height','100%','important');if(getComputedStyle(svg).display==='inline')svg.style.setProperty('display','block','important');
   previewNodes=[...svg.querySelectorAll(drawable)].filter(n=>!n.closest('defs,clipPath,mask,symbol,pattern,linearGradient,radialGradient'));
   controls();
  }
  function change(fn){const before=snapshot(),previousSelection=selected;try{fn();const next=editor.svg();Art.sanitize(next);if(next!==before.svg||restored!==before.restored){remember(undo,before);redo=[];selected=-1;render();}$('#dialog-error').textContent='';}catch(e){editor=load(before.svg);restored=before.restored;selected=previousSelection;render();$('#dialog-error').textContent=e.message;}}
  function remove(){if(selected<0)return;if(available().length<=1){$('#dialog-error').textContent='Keep at least one drawing shape. Remove the whole decal from the sheet if it is empty.';return;}change(()=>editor.remove(selected));}
  function move(direction,white=false){const list=available().filter(i=>!white||/^rgba?\(255,\s*255,\s*255(?:,\s*1)?\)$/.test(getComputedStyle(previewNodes[i]).fill));if(!list.length){$('#dialog-error').textContent=white?'No visible white-filled shapes found. Select another shape directly.':'No visible shapes found.';return;}selected=direction>0?(list.find(i=>i>selected)??list[0]):([...list].reverse().find(i=>i<selected)??list.at(-1));$('#dialog-error').textContent='';controls();}
  shadow.addEventListener('click',e=>{const target=e.composedPath().find(n=>previewNodes.includes(n));selected=previewNodes.indexOf(target);controls();});
  $('#vector-prev').onclick=()=>move(-1);$('#vector-next').onclick=()=>move(1);$('#vector-white').onclick=()=>move(1,true);$('#vector-remove').onclick=remove;
  const travel=(from,to)=>{if(!from.length)return;remember(to,snapshot());const value=from.pop();editor=load(value.svg);restored=value.restored;selected=-1;render();$('#dialog-error').textContent='';};
  $('#vector-undo').onclick=()=>travel(undo,redo);$('#vector-redo').onclick=()=>travel(redo,undo);
  $('#vector-restore').onclick=()=>change(()=>{editor=load(original);restored=true;});
  for(const b of dialog.querySelectorAll('[data-vector-bg]'))b.onclick=()=>{view.dataset.background=b.dataset.vectorBg;for(const other of dialog.querySelectorAll('[data-vector-bg]'))other.setAttribute('aria-pressed',String(other===b));};
  $('#vector-zoom').onchange=()=>{const k=Number($('#vector-zoom').value);surface.style.width=(k*100)+'%';surface.style.height=(k*100)+'%';highlight();};
  $('#vector-apply').onclick=()=>{try{const clean=Art.sanitize(editor.svg()),next={...DM.clone(item),svg:clean.svg,mixed:clean.mixed};if(restored&&clean.svg===Art.sanitize(original).svg)delete next.vectorSource;else next.vectorSource={svg:original};DM.validateItem(next);onApply(next);closeDialog();}catch(e){$('#dialog-error').textContent=e.message;}};
  const keys=e=>{if(e.target.matches('input,select,textarea'))return;const mod=e.ctrlKey||e.metaKey;if(mod&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();if(e.key.toLowerCase()==='y'||e.shiftKey)travel(redo,undo);else travel(undo,redo);}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();remove();}};
  dialog.addEventListener('keydown',keys);const observer=new ResizeObserver(highlight);observer.observe(surface);
  const dispose=()=>{if(!alive)return;alive=false;observer.disconnect();dialog.removeEventListener('keydown',keys);dialog.removeEventListener('close',dispose);changes.disconnect();undo=[];redo=[];};
  const changes=new MutationObserver(()=>{if(!host.isConnected)dispose();});changes.observe($('#dialog-content'),{childList:true});dialog.addEventListener('close',dispose,{once:true});render();
 }
 return{load,open};
})();
function editVectorArtwork(){const item=current();if(!item)throw Error('Select vector artwork first.');VectorEdit.open(DM.clone(item),next=>{mutate(()=>{const n=project.items.findIndex(i=>i.id===item.id);if(n<0||project.items[n].locked)throw Error('This decal is unavailable or locked.');project.items[n]=next;});toast('Vector artwork updated. Save to your library to keep the edited decal.');});}
