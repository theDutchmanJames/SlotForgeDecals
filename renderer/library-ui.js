'use strict';
// Only metadata pages and a small thumbnail cache live here. Full artwork is transient.
const Library=(()=>{
 let count=0,epoch=0,sidebarOffset=0,sidebarKey='',sidebarRequest=0,observer=null,queue=Promise.resolve(),cacheBytes=0;
 const cache=new Map(),pending=new Map();
 const metadata=e=>({...e,meta:`${e.artworkType} · 1:${e.scale} · ${e.w.toFixed(1)} × ${e.h.toFixed(1)} mm`});
 async function query(args){const result=await desktop.queryLibrary({...args,scope:'decals'});count=result.libraryCount;return{...result,entries:result.entries.map(metadata)};}
 function invalidate(){epoch++;sidebarKey='';cache.clear();cacheBytes=0;renderSidebar();}
 async function thumbnail(key,build,valid=()=>true){
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
  if(pending.has(key))return pending.get(key);
  const start=epoch,task=queue.catch(()=>{}).then(async()=>{if(start!==epoch||!valid())return null;const value=await build();if(start!==epoch||!valid())return null;if(typeof value==='string'&&value.length<8e6){cache.set(key,value);cacheBytes+=value.length;while(cache.size>64||cacheBytes>8e6){const first=cache.keys().next().value;cacheBytes-=cache.get(first).length;cache.delete(first);}}return value;});
  pending.set(key,task);queue=task;try{return await task;}finally{pending.delete(key);}
 }
 const preview=(e,valid)=>thumbnail('decal:'+e.stamp,async()=>{const value=await desktop.readDecal(e);Art.inspectItems([value.decal.art]);return decalThumbnail(value.decal.art,value.fonts);},valid);
 async function save(decal,fonts,expected){const result=await desktop.saveDecal({decal,fonts:DM.fontsFor([decal.art],fonts),expected});if(!expected)count++;invalidate();return result;}
 async function importEntries(decals,fonts){const result=await desktop.importDecals({decals,fonts});count+=result.length;invalidate();return result;}
 async function remove(entry){await desktop.deleteDecal(entry);count=Math.max(0,count-1);invalidate();}
 function renderSidebar(){
  if(!ready)return;const panel=$('#sidebar-library'),container=$('#library-grid'),search=$('#library-search').value;
  panel.open=settings.sidebarLibraryOpen!==false;$('#library-count').textContent=count.toLocaleString();
  const view=settings.sidebarLibraryView==='list'?'list':'grid';container.dataset.libraryView=view;
  for(const b of $$('[data-sidebar-view]'))b.setAttribute('aria-pressed',String(b.dataset.sidebarView===view));
  if(!panel.open){sidebarKey='';sidebarRequest++;observer?.disconnect();return;}
  const base=JSON.stringify([search,filter,epoch]);if(container.dataset.query!==base){sidebarOffset=0;container.dataset.query=base;}
  const key=JSON.stringify([base,sidebarOffset,view]);if(key===sidebarKey)return;sidebarKey=key;const request=++sidebarRequest;
  observer?.disconnect();container.inert=true;
  query({search,filter,offset:sidebarOffset,limit:24,sort:'added'}).then(result=>{
   if(request!==sidebarRequest||!panel.open)return;if(sidebarOffset>=result.total&&sidebarOffset){sidebarOffset=Math.max(0,Math.floor((result.total-1)/24)*24);sidebarKey='';renderSidebar();return;}
   $('#library-count').textContent=count.toLocaleString();container.inert=false;container.scrollTop=0;
   container.innerHTML=result.entries.map(d=>`<article class="library-card"><div class="library-thumb" tabindex="0" role="button" aria-label="Add ${E(d.name)} to sheet" draggable="true" data-lib="${E(d.id)}"><img data-decal-thumb="${E(d.id)}" alt="${E(d.name)}"></div><span class="lib-name">${E(d.name)}</span><small class="lib-type">${E(d.artworkType)} · 1:${d.scale}</small><button class="lib-menu" data-lib-menu="${E(d.id)}" aria-label="Manage ${E(d.name)}">⋯</button></article>`).join('')||`<div class="empty-library"><strong>${count?'No matching decals':'Your own decal collection'}</strong>${count?'Try another search.':'Select artwork and choose “Save decal to library”.'}</div>`;
   $('#sidebar-page').textContent=result.total?`${sidebarOffset+1}–${Math.min(sidebarOffset+24,result.total)} / ${result.total}`:'0 items';$('#sidebar-prev').disabled=!sidebarOffset;$('#sidebar-next').disabled=sidebarOffset+24>=result.total;
   $('#sidebar-prev').onclick=()=>{sidebarOffset=Math.max(0,sidebarOffset-24);renderSidebar();};$('#sidebar-next').onclick=()=>{sidebarOffset+=24;renderSidebar();};
   observer=new IntersectionObserver(changes=>{for(const hit of changes){if(!hit.isIntersecting)continue;observer.unobserve(hit.target);const e=result.entries.find(d=>d.id===hit.target.dataset.decalThumb);preview(e,()=>request===sidebarRequest&&hit.target.isConnected&&panel.open).then(src=>{if(src&&request===sidebarRequest&&hit.target.isConnected)hit.target.src=src;}).catch(error=>{if(hit.target.isConnected)hit.target.title=error.message;});}},{root:container,rootMargin:'40px'});
   for(const img of container.querySelectorAll('[data-decal-thumb]'))observer.observe(img);
   for(const el of container.querySelectorAll('[data-lib]')){el.onclick=()=>addFromLibrary(el.dataset.lib).catch(fail);el.onkeydown=e=>{if(e.key==='Enter')addFromLibrary(el.dataset.lib).catch(fail);};el.ondragstart=e=>e.dataTransfer.setData('application/x-slotforge-decal',el.dataset.lib);}
   for(const el of container.querySelectorAll('[data-lib-menu]'))el.onclick=()=>libraryDetails(el.dataset.libMenu).catch(fail);
  }).catch(error=>{if(request===sidebarRequest){sidebarKey='';container.inert=false;container.textContent=error.message;}});
 }
 return{query,preview,thumbnail,save,import:importEntries,remove,invalidate,renderSidebar,setCount(n){count=n||0;epoch++;sidebarKey='';},get count(){return count;},get cacheInfo(){return{entries:cache.size,bytes:cacheBytes};}};
})();

async function addFromLibrary(id,point){
 const target=project.id,targetPage=page,value=await desktop.readDecal(id),entry=value.decal;Art.inspectItems([entry.art]);
 const required=DM.fontsFor([entry.art],value.fonts);
 const merge=()=>{for(const f of required){const old=project.fonts.find(x=>x.family===f.family);if(old&&old.data!==f.data)throw Error('This decal uses a different font with the same internal name as a sheet font. Add it to a separate sheet.');}const fonts=[...new Map([...project.fonts,...required].map(f=>[f.family,f])).values()];DM.validateProject({...project,fonts});return fonts;};
 merge();await Art.loadFonts(required);
 if(project.id!==target||page!==targetPage)throw Error('The active sheet changed while loading. Add the decal again.');
 const fonts=merge();mutate(()=>{const i=DM.clone(entry.art),k=entry.scale/project.scale;i.w*=k;i.h*=k;i.strokeWidth*=k;i.name=entry.name;i.libraryId=entry.id;i.referenceScale=entry.scale;project.fonts=fonts;place(i,point);});toast(`Added ${entry.name} at 1:${project.scale}`);
}
async function libraryDetails(id){
 showDialog('Decal details','Loading artwork…','<p>Please wait…</p>');const loading=$('.dialog-head');
 const value=await desktop.readDecal(id);if(!loading.isConnected||!$('#dialog').open)return;const d=value.decal;Art.inspectItems([d.art]);
 showDialog(d.name,`Saved at 1:${d.scale} · ${d.art.w.toFixed(1)} × ${d.art.h.toFixed(1)} mm`,`<div class="import-preview"><img src="${Art.url(Art.standalone(d.art,value.fonts))}"></div><div class="field"><label>Name</label><input id="library-name" value="${E(d.name)}" maxlength="160"></div><div class="field"><label>Tags</label><input id="library-tags" value="${E(d.tags||'')}" maxlength="300"></div><div class="field"><label>Creator</label><input id="library-creator" value="${E(d.creator||'')}" maxlength="160"></div><p class="hint">Sheet copies remain independent. Deleting this library entry keeps existing sheets intact.</p>`,`<button class="danger" id="library-delete">Delete</button><button id="library-export">Export Decals</button><button class="primary" id="library-update">Save details</button>`);
 const act=fn=>async()=>{const host=$('#dialog-content');host.inert=true;try{await fn();closeDialog();}catch(e){$('#dialog-error').textContent=e.message;}finally{host.inert=false;}};
 $('#library-update').onclick=act(async()=>{d.name=$('#library-name').value.trim()||d.name;d.tags=$('#library-tags').value;d.creator=$('#library-creator').value;await Library.save(d,value.fonts,value.entry.stamp);});
 $('#library-delete').onclick=act(()=>Library.remove(value.entry));$('#library-export').onclick=()=>decalExportDialog([value.entry]);
}
async function saveDecal(){
 const list=items();if(!list.length)throw Error('Select artwork to save as a decal.');const art=list.length>1?DM.group(list):DM.clone(list[0]),fonts=DM.fontsFor([art],activeFonts()),scale=project.scale;art.x=art.y=0;art.page=0;art.locked=false;
 showDialog('Save Decal to Library',list.length>1?'Save '+list.length+' selected items together as one reusable decal.':'Name your selected artwork.',`<div class="import-preview"><img src="${Art.url(Art.standalone(art,fonts))}"></div><div class="field"><label>Decal name</label><input id="save-decal-name" value="${E(art.name)}" maxlength="160"></div><div class="field"><label>Tags (optional)</label><input id="save-decal-tags" maxlength="300"></div><p class="hint">${art.w.toFixed(1)} × ${art.h.toFixed(1)} mm · reference scale 1:${scale}</p>`,`<button data-action="close">Cancel</button>${list.length===1&&list[0].libraryId?'<button id="update-master" disabled>Update saved decal</button>':''}<button class="primary" id="save-decal-confirm">Save as new decal</button>`);
 const host=$('#save-decal-name');let master=null;
 if($('#update-master'))desktop.queryLibrary({scope:'decals',id:list[0].libraryId,limit:1}).then(r=>{if(host.isConnected){master=r.entries[0];$('#update-master').disabled=!master;}}).catch(fail);
 const commit=async update=>{const content=$('#dialog-content');content.inert=true;try{const name=$('#save-decal-name').value.trim();if(!name)throw Error('Enter a name.');const entry={id:update?master.id:DM.uid(),name,added:new Date().toISOString(),tags:$('#save-decal-tags').value,scale,art:{...art,name},updated:new Date().toISOString()};await Library.save(entry,fonts,update?master.stamp:undefined);closeDialog();toast(update?'Library decal updated. Existing sheet copies keep their artwork.':'Decal saved to your library.');}catch(e){$('#dialog-error').textContent=e.message;}finally{content.inert=false;}};
 $('#save-decal-confirm').onclick=()=>commit(false);if($('#update-master'))$('#update-master').onclick=()=>commit(true);
}
async function exportDecals(entries){const file=await desktop.exportLibrary({kind:'decals',entries,name:entries.length===1?entries[0].name:'My decal collection'});toast(file?'Decals exported. Share the .sfdecal file with another Decals user.':'Decal export cancelled.');return !!file;}
