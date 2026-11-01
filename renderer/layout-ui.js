/* Arrangement dialogs use the editor's existing transaction and selection state. */
'use strict';
function arrangeSelectionDialog(){
 const list=Layout.selection(project,selected),locked=list.some(i=>i.locked);
 const button=(label,operation,need=1)=>`<button data-layout-operation="${operation}" ${locked||list.length<need?'disabled':''}>${label}</button>`;
 showDialog('Arrange selection',`${list.length} ${list.length===1?'decal':'decals'} · measurements stay in millimetres`,
  `<div class="layout-sections"><section><h3>Align edges & centres</h3><div class="layout-buttons">${button('Left','align-x-start',2)}${button('Centre horizontally','align-x-center',2)}${button('Right','align-x-end',2)}${button('Top','align-y-start',2)}${button('Centre vertically','align-y-center',2)}${button('Bottom','align-y-end',2)}</div></section>
  <section><h3>Equal gaps</h3><p class="hint">Select at least three decals. The two outer decals stay in place; gaps between their rotated bounds become equal.</p><div class="row">${button('Distribute horizontally','distribute-x',3)}${button('Distribute vertically','distribute-y',3)}</div></section>
  <section><h3>Mirror artwork</h3><p class="hint">Mirror each decal in place. Text and logos are mirrored too. Duplicate first if you need both versions.</p><div class="row">${button('Mirror left / right','mirror-x')}${button('Mirror top / bottom','mirror-y')}</div></section></div>
  ${locked?'<p class="notice">Unlock the selected decals to align, distribute, mirror or move them. You can still make grid copies.</p>':''}
  <div class="layout-shortcuts"><button data-action="grid-copies">Rows & columns…</button><button data-action="move-page" ${locked?'disabled':''}>Move to page…</button></div>`,
  '<button class="primary" data-action="close">Done</button>',true);
 for(const button of $$('[data-layout-operation]'))button.onclick=()=>{
  try{const [operation,axis,edge]=button.dataset.layoutOperation.split('-');
   mutate(()=>{project=operation==='align'?Layout.align(project,selected,axis,edge):operation==='distribute'?Layout.distribute(project,selected,axis):Layout.mirror(project,selected,axis);});
   closeDialog();toast(operation==='mirror'?'Artwork mirrored. Undo restores the previous version.':'Selection arranged at its original sizes.');
  }catch(e){$('#dialog-error').textContent=e.message;}
 };
}
function gridCopiesDialog(){
 const sources=Layout.selection(project,selected),ids=sources.map(i=>i.id),b=DM.union(sources),s=DM.size(project);
 showDialog('Rows & columns','Repeat your selection with exact cutting gaps.',
  `<div class="grid-layout"><div><div class="fields2"><div class="field"><label for="grid-rows">Rows</label><input id="grid-rows" type="number" value="2" min="1" max="100" step="1"></div><div class="field"><label for="grid-columns">Columns</label><input id="grid-columns" type="number" value="2" min="1" max="100" step="1"></div></div>
  <div class="fields2"><div class="field"><label for="grid-gap-x">Horizontal gap (mm)</label><input id="grid-gap-x" type="number" value="${project.gap}" min="0" max="100" step=".1"></div><div class="field"><label for="grid-gap-y">Vertical gap (mm)</label><input id="grid-gap-y" type="number" value="${project.gap}" min="0" max="100" step=".1"></div></div>
  <p class="hint">The first cell is your original selection. Copies extend right and down. Each cell repeats all ${sources.length} selected ${sources.length===1?'decal':'decals'}, keeping their sizes, rotations and relative positions.</p>
  <p class="hint">Gaps are measured between cell edges. Existing decals stay in place; review print checks for overlaps.</p><p id="grid-summary" class="notice" aria-live="polite"></p></div><div><div id="grid-preview" class="grid-preview"></div><p class="micro">A4 · ${s.w} × ${s.h} mm · outlined cells repeat your selection</p></div></div>`,
  '<button data-action="arrange-selection">Back</button><button id="grid-apply" class="primary">Create copies</button>',true);
 const options=()=>({rows:$('#grid-rows').value,columns:$('#grid-columns').value,gapX:$('#grid-gap-x').value,gapY:$('#grid-gap-y').value});
 const refresh=()=>{try{
  const plan=Layout.gridPlan(project,ids,options()),cells=[];
  for(let row=0;row<plan.rows;row++)for(let col=0;col<plan.columns;col++)cells.push(`<g transform="translate(${b.x+col*(b.w+plan.gapX)} ${b.y+row*(b.h+plan.gapY)})"><use href="#grid-cell-art"/><rect width="${b.w}" height="${b.h}" fill="none" stroke="${row||col?'#e5484d':'#2680c2'}" stroke-width=".4"/></g>`);
  const existing=project.items.filter(i=>i.page===sources[0].page&&!ids.includes(i.id)).map(i=>{const p=DM.bounds(i);return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#d5d9df"/>`;}).join('');
  $('#grid-preview').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.w} ${s.h}" role="img" aria-label="A4 grid preview"><defs><g id="grid-cell-art">${sources.map((i,n)=>Art.element({...i,x:i.x-b.x,y:i.y-b.y},'grid'+n,'all')).join('')}</g></defs><rect width="${s.w}" height="${s.h}" fill="white"/><rect x="${project.margin}" y="${project.margin}" width="${s.w-2*project.margin}" height="${s.h-2*project.margin}" fill="none" stroke="#8d98a6" stroke-width=".3" stroke-dasharray="2 1"/>${existing}${cells.join('')}</svg>`;
  $('#grid-summary').textContent=`${plan.rows} × ${plan.columns} cells · adds ${plan.added} decals · ${plan.width.toFixed(1)} × ${plan.height.toFixed(1)} mm overall`;
  $('#dialog-error').textContent='';$('#grid-apply').disabled=false;
 }catch(e){$('#dialog-error').textContent=e.message;$('#grid-summary').textContent='Adjust the grid to fit this A4 page.';$('#grid-preview').innerHTML='<p class="hint">Preview appears when the grid fits the printable area.</p>';$('#grid-apply').disabled=true;}};
 for(const input of $$('#dialog input'))input.oninput=refresh;
 $('#grid-apply').onclick=()=>{try{const result=Layout.grid(project,ids,options());mutate(()=>{project=result.project;selected=new Set(result.ids);});closeDialog();toast(`Added ${result.added} grid copies. Original artwork kept in place.`);}catch(e){$('#dialog-error').textContent=e.message;}};
 refresh();
}
function moveSelectionDialog(){
 const list=Layout.selection(project,selected,1,true),from=list[0].page,options=Array.from({length:project.pages},(_,n)=>n).filter(n=>n!==from).map(n=>`<option value="${n}">Page ${n+1}</option>`);
 if(project.pages<50)options.push(`<option value="${project.pages}">New A4 page (${project.pages+1})</option>`);
 showDialog('Move selection to page',`${list.length} ${list.length===1?'decal':'decals'} from page ${from+1}`,
  `<div class="field"><label for="move-target">Destination</label><select id="move-target">${options.join('')}</select></div><p class="hint">Keep the same positions, dimensions and rotations on the destination A4 page. Existing artwork there stays in place. You will switch to that page after moving.</p>`,
  '<button data-action="arrange-selection">Back</button><button id="move-apply" class="primary">Move decals</button>');
 $('#move-apply').onclick=()=>{try{const target=Number($('#move-target').value),next=Layout.movePage(project,selected,target);mutate(()=>{project=next;page=target;});closeDialog();toast(`Moved selection to page ${target+1}.`);}catch(e){$('#dialog-error').textContent=e.message;}};
}
