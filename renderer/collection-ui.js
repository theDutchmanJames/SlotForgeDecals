'use strict';
let collectionTask=null;
// One browser is used for both libraries and every sharing selection window.
function collectionBrowser(options){
 const entries=options.entries,kind=options.kind||'sheets',prefs=settings.collections?.[kind]||{};
 let view=prefs.view==='list'?'list':'grid',sort=['name','name-desc','added','updated'].includes(prefs.sort)?prefs.sort:'added',anchor=null,working=false;
 const chosen=new Set(options.selected||[]),expanded=new Set(),pageChoices=new Map();
 showDialog(options.title,options.subtitle,
  `<section class="collection-browser"><div class="collection-tools"><input id="project-search" type="search" placeholder="Search ${kind}…" aria-label="Search ${kind}"><select id="project-sort" aria-label="Sort ${kind}"><option value="name">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="added">Newest added</option><option value="updated">Recently updated</option></select><div class="collection-views" aria-label="Library view"><button data-view="grid">Grid</button><button data-view="list">List</button></div></div><div class="collection-selection"><button id="collection-all">Select all shown</button><button id="collection-clear">Clear selection</button><span id="collection-count" role="status"></span></div><p id="projects-notice" class="hint" role="status"></p><div id="collection-items" class="collection-items"></div>${options.note?`<p class="hint collection-note">${options.note}</p>`:''}</section>`,
  `${options.footer||''}${options.commit?'<button id="collection-confirm" class="'+(options.commitLabel==='Import'?'':'collection-export')+'">'+E(options.commitLabel||'Export')+'</button>':''}<button data-action="close">${options.commit?'Cancel':'Done'}</button>`,true);
 const host=$('.collection-browser'),container=$('#collection-items'),confirm=$('#collection-confirm');
 const alive=()=>host.isConnected&&$('#dialog').open;
 const selectedEntries=()=>entries.filter(e=>chosen.has(e.id));
 const savePrefs=()=>{settings.collections={...settings.collections,[kind]:{view,sort}};revision++;scheduleSave();};
 const shown=()=>{
  const q=$('#project-search').value.trim().toLowerCase();
  return entries.filter(e=>`${e.name} ${e.search||''}`.toLowerCase().includes(q)).sort((a,b)=>{
   if(sort==='name'||sort==='name-desc')return (sort==='name-desc'?-1:1)*a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});
   return (Date.parse(b[sort])||0)-(Date.parse(a[sort])||0)||a.name.localeCompare(b.name);
  });
 };
 const update=()=>{
  if(!alive())return;
  const visible=shown(),hidden=selectedEntries().filter(e=>!visible.includes(e)).length;
  $('#collection-count').textContent=`${chosen.size} selected${hidden?` · ${hidden} hidden by search`:''}`;
  for(const card of container.querySelectorAll('[data-entry]')){const active=chosen.has(entries[Number(card.dataset.entry)].id);card.classList.toggle('is-selected',active);card.querySelector('[data-select]').checked=active;}
  $('#collection-clear').disabled=!chosen.size;$('#collection-all').disabled=!visible.length;
  if(confirm){confirm.disabled=!chosen.size||chosen.size>(options.max||Infinity);confirm.textContent=options.countLabel?options.countLabel(chosen.size):`${options.commitLabel||'Export'} ${chosen.size} ${kind==='sheets'?(chosen.size===1?'Sheet':'Sheets'):(chosen.size===1?'Decal':'Decals')}`;}
  const exportButton=$('#library-export-selected');if(exportButton)exportButton.disabled=!chosen.size;
 };
 const render=()=>{
  if(!alive())return;const list=shown();container.dataset.view=view;
  for(const b of host.querySelectorAll('button[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
  $('#projects-notice').textContent=`${list.length} ${kind}${options.unreadable?` · ${options.unreadable} unreadable file(s) kept in the workspace folder`:''}`;
  container.innerHTML=list.map(e=>{
   const n=entries.indexOf(e),date=Date.parse(e.updated)?projectDate(e.updated):'Unknown date';
   return `<article class="collection-item ${kind==='sheets'?'project-card':'decal-card'}" data-entry="${n}"><label class="collection-check"><input type="checkbox" data-select="${n}" aria-label="Select ${E(e.name)}"></label><button class="collection-preview" data-select-card="${n}" aria-label="Select ${E(e.name)}">${e.thumbnail?`<img src="${E(e.thumbnail)}" alt="">`:'<span>Preview</span>'}</button><div class="collection-info"><button class="collection-name" data-select-card="${n}" title="${E(e.name)}"><h3>${E(e.name)}</h3></button><p class="micro">${E(e.meta||'')}${e.current?' · Current sheet':''}</p><p class="micro">Updated: ${E(date)}</p><div class="collection-actions">${options.actions?options.actions(e,n):''}${options.pages&&e.pages>1?`<button data-pages="${n}" aria-expanded="${expanded.has(e.id)}">Choose pages… <span>${pageChoices.get(e.id)?.length||e.pages}/${e.pages}</span></button>`:''}</div></div>${expanded.has(e.id)?`<div class="collection-pages" data-page-area="${n}"></div>`:''}</article>`;
  }).join('')||`<p class="no-selection">${entries.length?'No items match your search.':options.empty||'Your library is empty.'}</p>`;
  update();for(const e of list)if(expanded.has(e.id))renderPages(e).catch(error);
 };
 const error=e=>{if(alive())$('#dialog-error').textContent=e.message;else fail(e);};
 const renderPages=async e=>{
  const n=entries.indexOf(e),area=container.querySelector(`[data-page-area="${n}"]`);if(!area)return;
  area.textContent='Loading pages…';
  const p=await options.load(e);if(!alive()||!area.isConnected)return;await Art.loadFonts(p.fonts);if(!alive()||!area.isConnected)return;
  const selectedPages=pageChoices.get(e.id)||Array.from({length:p.pages},(_,i)=>i);
  area.innerHTML=Array.from({length:p.pages},(_,i)=>`<label class="collection-page"><img src="${E(Art.url(Art.sheet(p,i)))}" alt="Page ${i+1}"><span><input type="checkbox" data-page-index="${i}" data-page-entry="${n}" ${selectedPages.includes(i)?'checked':''}>Page ${i+1}</span></label>`).join('');
 };
 const toggle=(e,event,checkbox=false)=>{
  const list=shown(),start=list.findIndex(x=>x.id===anchor),end=list.indexOf(e);
  if(event.shiftKey&&start>=0){if(!event.ctrlKey&&!event.metaKey&&!checkbox)chosen.clear();for(const row of list.slice(Math.min(start,end),Math.max(start,end)+1))chosen.add(row.id);}
  else if(checkbox||event.ctrlKey||event.metaKey){if(chosen.has(e.id))chosen.delete(e.id);else chosen.add(e.id);}
  else{chosen.clear();chosen.add(e.id);}
  anchor=e.id;update();
 };
 container.addEventListener('click',event=>{
  if(working)return;const target=event.target;
  const cb=target.closest('[data-select]'),card=target.closest('[data-select-card]');
  if(cb||card){toggle(entries[Number((cb||card).dataset[cb?'select':'selectCard'])],event,!!cb);return;}
  const pagesButton=target.closest('[data-pages]');if(pagesButton){const e=entries[Number(pagesButton.dataset.pages)];expanded.has(e.id)?expanded.delete(e.id):expanded.add(e.id);render();return;}
  const action=target.closest('[data-collection-action]');if(action)Promise.resolve().then(()=>options.action(action.dataset.collectionAction,entries[Number(action.dataset.index)])).catch(error);
 });
 container.addEventListener('change',event=>{
  const input=event.target.closest('[data-page-index]');if(!input)return;const e=entries[Number(input.dataset.pageEntry)],area=input.closest('.collection-pages');
  const indices=[...area.querySelectorAll('[data-page-index]:checked')].map(el=>Number(el.dataset.pageIndex));
  if(!indices.length){input.checked=true;$('#dialog-error').textContent='Keep at least one page, or deselect the whole sheet.';return;}
  $('#dialog-error').textContent='';
  pageChoices.set(e.id,indices);const label=container.querySelector(`[data-pages="${input.dataset.pageEntry}"] span`);if(label)label.textContent=`${indices.length}/${e.pages}`;
 });
 $('#project-sort').value=sort;$('#project-sort').onchange=e=>{sort=e.target.value;savePrefs();render();};
 $('#project-search').oninput=()=>{anchor=null;render();};
 for(const b of host.querySelectorAll('[data-view]'))b.onclick=()=>{view=b.dataset.view;savePrefs();render();};
 $('#collection-all').onclick=()=>{shown().forEach(e=>chosen.add(e.id));update();};$('#collection-clear').onclick=()=>{chosen.clear();update();};
 let previewObserver=null,previewMutations=null;
 const session={selected:selectedEntries,pageChoices,render,alive,watchPreviews:loader=>{
  previewObserver?.disconnect();previewMutations?.disconnect();const pending=new Set();let chain=Promise.resolve();
  previewObserver=new IntersectionObserver(changes=>{for(const hit of changes){if(!hit.isIntersecting||!alive())continue;const e=entries[Number(hit.target.dataset.entry)];if(!e||e.thumbnail||pending.has(e))continue;pending.add(e);previewObserver.unobserve(hit.target);chain=chain.then(async()=>{if(!alive())return;try{e.thumbnail=await loader(e);session.thumbnail(e);}catch{}finally{pending.delete(e);}});}}, {root:container,rootMargin:'80px'});
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
 render();if(entries.some(e=>e.preview))session.watchPreviews(e=>e.preview());return session;
}

const decalThumbnailCache=new WeakMap();
async function decalThumbnail(art,fonts){
 if(decalThumbnailCache.has(art))return decalThumbnailCache.get(art);
 const task=(async()=>{await Art.loadFonts(fonts);const img=new Image();img.src=Art.url(Art.standalone(art,fonts));await img.decode();const size=200,k=size/Math.max(img.naturalWidth,img.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*k));canvas.height=Math.max(1,Math.round(img.naturalHeight*k));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');})();decalThumbnailCache.set(art,task);try{return await task;}catch(e){decalThumbnailCache.delete(art);throw e;}
}
function decalRows(decals=library,fonts=activeFonts()){
 return decals.map(d=>({id:d.id,name:d.name,source:d,search:`${d.tags||''} ${d.creator||''}`,added:d.added||d.updated,updated:d.updated,
  meta:`${DM.artworkType(d.art)} · 1:${d.scale} · ${d.art.w.toFixed(1)} × ${d.art.h.toFixed(1)} mm`,preview:()=>decalThumbnail(d.art,fonts)}));
}
function decalBrowser(){
 const entries=decalRows(),session=collectionBrowser({title:'Decal Library',subtitle:'Select decals to export. Add a saved decal to your current sheet.',kind:'decals',entries,
  empty:'Select artwork on your sheet and choose Save decal to library.',
  footer:'<button data-action="import-pack">Import Decals</button><button id="library-export-selected" class="collection-export" disabled>Export Decals</button>',
  actions:(e,n)=>`<button data-collection-action="add" data-index="${n}">Add to Sheet</button><button data-collection-action="details" data-index="${n}">Details</button>`,
  action:(action,e)=>{if(action==='details')libraryDetails(e.id);else{addFromLibrary(e.id);closeDialog();}}
 });$('#library-export-selected').onclick=()=>packDialog(session.selected().map(e=>e.id));
}
function decalExportDialog(ids=null){
 const entries=decalRows();
 return collectionBrowser({title:'Export Decals',subtitle:'Choose saved decals to share with another SlotForge Decals user.',kind:'decals',entries,selected:ids||entries.map(e=>e.id),max:DM.LIMITS.pack,commitLabel:'Export',
  empty:'Save artwork to your Decal Library before exporting.',note:'Editable artwork, printed sizes and required fonts travel together. Maximum 500 decals per file. Only share fonts you may redistribute.',
  commit:chosen=>exportDecals(chosen.map(e=>e.source))
 });
}
function decalImportDialog(pack){
 const entries=decalRows(pack.decals,pack.fonts);
 return collectionBrowser({title:'Import Decals',subtitle:'Choose decals to add to your library as independent copies.',kind:'decals',entries,selected:entries.map(e=>e.id),max:DM.LIMITS.pack,commitLabel:'Import',
  commit:async selected=>{
   const now=new Date().toISOString(),chosen=selected.map(e=>({...e.source,added:now}));
   const fonts=[...new Map([...libraryFonts,...DM.fontsFor(chosen.map(d=>d.art),pack.fonts)].map(f=>[f.family,f])).values()],valid=DM.validateLibrary([...library,...chosen],fonts);
   await Art.loadFonts([...activeFonts(),...valid.libraryFonts]);
   const before={library,libraryFonts};library=valid.library;libraryFonts=valid.libraryFonts;revision++;
   try{await flush();}catch(e){library=before.library;libraryFonts=before.libraryFonts;revision++;scheduleSave();throw e;}
   render();toast(`Imported ${chosen.length} decal(s).`);return true;
  }
 });
}
