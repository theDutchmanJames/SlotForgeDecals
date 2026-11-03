'use strict';
let collectionTask=null;
// One browser is used for both libraries and every sharing selection window.
function collectionBrowser(options){
 let entries=options.entries||[];const remote=!!options.query,kind=options.kind||'sheets',prefs=settings.collections?.[kind]||{};
 let view=prefs.view==='list'?'list':'grid',sort=['name','name-desc','added','updated'].includes(prefs.sort)?prefs.sort:'added',anchor=null,working=false;
 const initial=(options.selected||[]),chosen=new Map(initial.map(e=>typeof e==='string'?[e,entries.find(x=>x.id===e)]:[e.id,e])),expanded=new Set(),pageChoices=new Map();let offset=0,total=entries.length,generation=0,loading=false;const pageSize=48;
 showDialog(options.title,options.subtitle,
  `<section class="collection-browser"><div class="collection-tools"><input id="project-search" type="search" placeholder="Search ${kind}…" aria-label="Search ${kind}"><select id="project-sort" aria-label="Sort ${kind}"><option value="name">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="added">Newest added</option><option value="updated">Recently updated</option></select><div class="collection-views" aria-label="Library view"><button data-view="grid">Grid</button><button data-view="list">List</button></div></div><div class="collection-selection"><button id="collection-all">${remote?'Select this page':'Select all shown'}</button><button id="collection-clear">Clear selection</button><span id="collection-count" role="status"></span></div><p id="projects-notice" class="hint" role="status"></p><div id="collection-items" class="collection-items"></div>${remote?'<div class="collection-pager"><button id="collection-prev">← Previous</button><span id="collection-page" role="status"></span><button id="collection-next">Next →</button></div>':''}${options.note?`<p class="hint collection-note">${options.note}</p>`:''}</section>`,
  `${options.footer||''}${options.commit?'<button id="collection-confirm" class="'+(options.commitLabel==='Import'?'':'collection-export')+'">'+E(options.commitLabel||'Export')+'</button>':''}<button data-action="close">${options.commit?'Cancel':'Done'}</button>`,true);
 const host=$('.collection-browser'),container=$('#collection-items'),confirm=$('#collection-confirm');
 const alive=()=>host.isConnected&&$('#dialog').open;
 const selectedEntries=()=>[...chosen.values()].filter(Boolean);
 const savePrefs=()=>{settings.collections={...settings.collections,[kind]:{view,sort}};revision++;scheduleSave();};
 const shown=()=>{if(remote)return entries;
  const q=$('#project-search').value.trim().toLowerCase();
  return entries.filter(e=>`${e.name} ${e.search||''}`.toLowerCase().includes(q)).sort((a,b)=>{
   if(sort==='name'||sort==='name-desc')return (sort==='name-desc'?-1:1)*a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});
   return (Date.parse(b[sort])||0)-(Date.parse(a[sort])||0)||a.name.localeCompare(b.name);
  });
 };
 const update=()=>{
  if(!alive())return;
  for(const id of pageChoices.keys())if(!chosen.has(id))pageChoices.delete(id);
  const visible=shown(),hidden=selectedEntries().filter(e=>!visible.some(v=>v.id===e.id)).length;
  $('#collection-count').textContent=`${chosen.size} selected${hidden?` · ${hidden} on other pages or hidden by search`:''}`;
  for(const card of container.querySelectorAll('[data-entry]')){const active=chosen.has(entries[Number(card.dataset.entry)].id);card.classList.toggle('is-selected',active);card.querySelector('[data-select]').checked=active;}
  $('#collection-clear').disabled=!chosen.size;$('#collection-all').disabled=loading||!visible.length;
  if(confirm){confirm.disabled=loading||!chosen.size||chosen.size>(options.max||Infinity);confirm.textContent=options.countLabel?options.countLabel(chosen.size):`${options.commitLabel||'Export'} ${chosen.size} ${kind==='sheets'?(chosen.size===1?'Sheet':'Sheets'):(chosen.size===1?'Decal':'Decals')}`;}
  const exportButton=$('#library-export-selected');if(exportButton)exportButton.disabled=!chosen.size;
 };
 const render=()=>{
  if(!alive())return;const list=shown();container.dataset.view=view;
  for(const b of host.querySelectorAll('button[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
  $('#projects-notice').textContent=`${remote?total:list.length} ${kind}${options.unreadable?` · ${options.unreadable} unreadable file(s) kept in the workspace folder`:''}`;
  container.innerHTML=list.map(e=>{
   const n=entries.indexOf(e),date=Date.parse(e.updated)?projectDate(e.updated):'Unknown date';
   return `<article class="collection-item ${kind==='sheets'?'project-card':'decal-card'}" data-entry="${n}"><label class="collection-check"><input type="checkbox" data-select="${n}" aria-label="Select ${E(e.name)}"></label><button class="collection-preview" data-select-card="${n}" aria-label="Select ${E(e.name)}">${e.thumbnail?`<img src="${E(e.thumbnail)}" alt="">`:'<span>Preview</span>'}</button><div class="collection-info"><button class="collection-name" data-select-card="${n}" title="${E(e.name)}"><h3>${E(e.name)}</h3></button><p class="micro">${E(e.meta||'')}${e.current?' · Current sheet':''}</p><p class="micro">Updated: ${E(date)}</p><div class="collection-actions">${options.actions?options.actions(e,n):''}${options.pages&&e.pages>1?`<button data-pages="${n}" aria-expanded="${expanded.has(e.id)}">Choose pages… <span>${pageChoices.get(e.id)?.length||e.pages}/${e.pages}</span></button>`:''}</div></div>${expanded.has(e.id)?`<div class="collection-pages" data-page-area="${n}"></div>`:''}</article>`;
  }).join('')||`<p class="no-selection">${entries.length?'No items match your search.':options.empty||'Your library is empty.'}</p>`;
  if(remote){$('#collection-prev').disabled=loading||offset===0;$('#collection-next').disabled=loading||offset+pageSize>=total;$('#collection-page').textContent=total?`${offset+1}–${Math.min(offset+list.length,total)} of ${total}`:'No items';}update();for(const e of list)if(expanded.has(e.id))renderPages(e).catch(error);
 };
 const refresh=async()=>{if(!remote){render();return;}const request=++generation;loading=true;container.inert=true;container.dataset.loading='true';update();try{const result=await options.query({search:$('#project-search').value,sort,offset,limit:pageSize});if(!alive()||request!==generation)return;total=result.total;options.unreadable=result.unreadable||0;if(offset>=total&&offset){offset=Math.max(0,Math.floor((total-1)/pageSize)*pageSize);return refresh();}entries=result.entries;loading=false;container.inert=false;container.dataset.loading='false';container.scrollTop=0;render();}catch(e){if(alive()&&request===generation){loading=false;container.inert=false;container.dataset.loading='false';error(e);update();}}};
 const error=e=>{if(alive())$('#dialog-error').textContent=e.message;else fail(e);};
 const renderPages=async e=>{
  const n=entries.indexOf(e),area=container.querySelector(`[data-page-area="${n}"]`);if(!area)return;
  const selectedPages=pageChoices.get(e.id)||Array.from({length:e.pages},(_,i)=>i);
  area.innerHTML=Array.from({length:e.pages},(_,i)=>`<label class="collection-page"><span><input type="checkbox" data-page-index="${i}" data-page-entry="${n}" ${selectedPages.includes(i)?'checked':''}>Page ${i+1}</span></label>`).join('');
 };
 const choose=e=>{if(chosen.size>=(options.selectionLimit||500)&&!chosen.has(e.id)){error(Error('Select up to '+(options.selectionLimit||500)+' items at a time.'));return;}chosen.set(e.id,{...e,thumbnail:undefined});};
 const toggle=(e,event,checkbox=false)=>{
  const list=shown(),start=list.findIndex(x=>x.id===anchor),end=list.indexOf(e);
  if(event.shiftKey&&start>=0){if(!event.ctrlKey&&!event.metaKey&&!checkbox)chosen.clear();for(const row of list.slice(Math.min(start,end),Math.max(start,end)+1))choose(row);}
  else if(checkbox||event.ctrlKey||event.metaKey){if(chosen.has(e.id))chosen.delete(e.id);else choose(e);}
  else{chosen.clear();choose(e);}
  anchor=e.id;update();
 };
 container.addEventListener('click',event=>{
  if(working||loading)return;const target=event.target;
  const cb=target.closest('[data-select]'),card=target.closest('[data-select-card]');
  if(cb||card){toggle(entries[Number((cb||card).dataset[cb?'select':'selectCard'])],event,!!cb);return;}
  const pagesButton=target.closest('[data-pages]');if(pagesButton){const e=entries[Number(pagesButton.dataset.pages)];if(expanded.has(e.id))expanded.delete(e.id);else{expanded.clear();expanded.add(e.id);}render();return;}
  const action=target.closest('[data-collection-action]');if(action)Promise.resolve().then(()=>options.action(action.dataset.collectionAction,entries[Number(action.dataset.index)])).catch(error);
 });
 container.addEventListener('change',event=>{
  const input=event.target.closest('[data-page-index]');if(!input)return;const e=entries[Number(input.dataset.pageEntry)],area=input.closest('.collection-pages');
  const indices=[...area.querySelectorAll('[data-page-index]:checked')].map(el=>Number(el.dataset.pageIndex));
  if(!indices.length){input.checked=true;$('#dialog-error').textContent='Keep at least one page, or deselect the whole sheet.';return;}
  $('#dialog-error').textContent='';
  choose(e);if(!chosen.has(e.id)){render();return;}pageChoices.set(e.id,indices);update();const label=container.querySelector(`[data-pages="${input.dataset.pageEntry}"] span`);if(label)label.textContent=`${indices.length}/${e.pages}`;
 });
 $('#project-sort').value=sort;$('#project-sort').onchange=e=>{sort=e.target.value;offset=0;anchor=null;savePrefs();refresh();};
 let searchTimer;$('#project-search').oninput=()=>{anchor=null;offset=0;generation++;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(alive())refresh();},160);};
 for(const b of host.querySelectorAll('[data-view]'))b.onclick=()=>{view=b.dataset.view;savePrefs();render();};
 $('#collection-all').onclick=()=>{shown().forEach(choose);update();};$('#collection-clear').onclick=()=>{chosen.clear();update();};
 if(remote){$('#collection-prev').onclick=()=>{offset=Math.max(0,offset-pageSize);anchor=null;refresh();};$('#collection-next').onclick=()=>{offset+=pageSize;anchor=null;refresh();};}
 let previewObserver=null,previewMutations=null;
 const session={selected:selectedEntries,pageChoices,render,refresh,alive,watchPreviews:loader=>{
  previewObserver?.disconnect();previewMutations?.disconnect();const pending=new Set();let chain=Promise.resolve();
  previewObserver=new IntersectionObserver(changes=>{for(const hit of changes){if(!hit.isIntersecting||!alive())continue;const e=entries[Number(hit.target.dataset.entry)];if(!e||e.thumbnail||pending.has(e))continue;pending.add(e);previewObserver.unobserve(hit.target);chain=chain.then(async()=>{if(!alive()||!entries.includes(e))return;try{e.thumbnail=await loader(e);session.thumbnail(e);}catch{}finally{pending.delete(e);}});}}, {root:container,rootMargin:'80px'});
  const observe=()=>{for(const card of container.querySelectorAll('[data-entry]'))previewObserver.observe(card);};previewMutations=new MutationObserver(observe);previewMutations.observe(container,{childList:true});observe();
  $('#dialog').addEventListener('close',()=>{previewObserver?.disconnect();previewMutations?.disconnect();},{once:true});
 },thumbnail:e=>{
  if(!alive()||!e.thumbnail)return;const preview=container.querySelector(`[data-select-card="${entries.indexOf(e)}"]`);
  if(preview)preview.innerHTML=`<img src="${E(e.thumbnail)}" alt="">`;
 }};
 if(confirm)confirm.onclick=async()=>{
  if(working||confirm.disabled)return;working=true;const content=$('#dialog-content'),dialog=$('#dialog'),prevent=e=>e.preventDefault();content.inert=true;dialog.addEventListener('cancel',prevent);$('#dialog-error').textContent='';
  const task=Promise.resolve().then(()=>options.commit(selectedEntries(),pageChoices));collectionTask=task;
  try{const completed=await task;if(completed!==false&&alive())closeDialog();}
  catch(e){error(e);}finally{if(collectionTask===task)collectionTask=null;working=false;content.inert=false;dialog.removeEventListener('cancel',prevent);if(alive())update();}
 };
 render();if(remote)refresh();if(options.preview)session.watchPreviews(options.preview);else if(entries.some(e=>e.preview))session.watchPreviews(e=>e.preview());return session;
}

const decalThumbnailCache=new WeakMap();
async function decalThumbnail(art,fonts){
 if(decalThumbnailCache.has(art))return decalThumbnailCache.get(art);
 const task=(async()=>{const img=new Image();img.src=Art.url(Art.standalone(art,fonts));await img.decode();const size=200,k=size/Math.max(img.naturalWidth,img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*k));canvas.height=Math.max(1,Math.round(img.naturalHeight*k));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');})();decalThumbnailCache.set(art,task);try{return await task;}catch(e){decalThumbnailCache.delete(art);throw e;}
}
function decalRows(decals=[],fonts=activeFonts()){
 return decals.map(d=>({id:d.id,name:d.name,source:d,search:`${d.tags||''} ${d.creator||''}`,added:d.added||d.updated,updated:d.updated,
  meta:`${DM.artworkType(d.art)} · 1:${d.scale} · ${d.art.w.toFixed(1)} × ${d.art.h.toFixed(1)} mm`,preview:()=>decalThumbnail(d.art,fonts)}));
}
function decalBrowser(){
 const session=collectionBrowser({title:'Decal Library',subtitle:'Select decals across pages to export. Artwork loads when needed.',kind:'decals',query:args=>Library.query(args),preview:e=>Library.preview(e),
  footer:'<button data-action="import-pack">Import Decals</button><button id="library-export-selected" class="collection-export" disabled>Export Decals</button>',
  actions:(e,n)=>`<button data-collection-action="add" data-index="${n}">Add to Sheet</button><button data-collection-action="details" data-index="${n}">Details</button>`,
  action:async(action,e)=>{if(action==='details')await libraryDetails(e.id);else{await addFromLibrary(e.id);closeDialog();}}
 });$('#library-export-selected').onclick=()=>decalExportDialog(session.selected());
}
function decalExportDialog(selected=[]){
 return collectionBrowser({title:'Export Decals',subtitle:'Choose saved decals. Selection stays checked when you change pages.',kind:'decals',query:args=>Library.query(args),preview:e=>Library.preview(e),selected:selected||[],max:500,commitLabel:'Export',
 note:'Maximum 500 decals and 160 MB per file. Use a complete backup for the whole library.',commit:chosen=>exportDecals(chosen)});
}
function decalImportDialog(pack){
 const entries=decalRows(pack.decals,pack.fonts);
 return collectionBrowser({title:'Import Decals',subtitle:'Choose decals to add to your library as independent copies.',kind:'decals',entries,selected:entries.map(e=>e.id),max:DM.LIMITS.pack,commitLabel:'Import',
 commit:async selected=>{await Library.import(selected.map(e=>e.source),pack.fonts);toast(`Imported ${selected.length} decal(s).`);return true;}});
}
