'use strict';
let projectTask=false,projectBrowserGeneration=0;
const projectDate=value=>{const date=new Date(typeof value==='string'?value:NaN);return Number.isNaN(date.getTime())?'Unknown date':date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});};
async function projectThumbnail(p){
 await Art.loadFonts(p.fonts);const svg=Art.sheet(p,0),img=new Image();img.src=Art.url(svg);await img.decode();
 const s=DM.size(p),c=document.createElement('canvas');c.width=Math.round(300*s.w/Math.max(s.w,s.h));c.height=Math.round(300*s.h/Math.max(s.w,s.h));
 const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/png');
}
async function projectRun(fn){
 CanvasTools.resolve();
 if(projectTask)return;projectTask=true;
 const owned=!$('#dialog').open;if(owned)showDialog('Saving your sheet','Please wait…','<p class="hint">Keeping your work in the local workspace.</p>');
 $('#dialog-content').inert=true;
 try{return await fn();}finally{projectTask=false;$('#dialog-content').inert=false;if(owned&&$('#dialog').open)closeDialog();}
}
async function saveCurrentProject(includeBlank=false){
 CanvasTools.resolve();
 await flush();const p=DM.validateProject(DM.clone(project));
 // Skip a new empty workspace, but preserve edits to explicitly saved/imported templates.
 if(!includeBlank&&!p.items.length&&p.name==='Untitled sheet'){
  const saved=await desktop.listProjects();
  if(!saved.unreadable&&!saved.entries.some(e=>e.id===p.id))return null;
 }
 const thumbnail=await projectThumbnail(p).catch(()=>null);await desktop.saveProject({project:p,thumbnail});return{project:p,thumbnail};
}
async function saveEditableProject(){
 if(projectTask)return;
 await projectRun(()=>saveCurrentProject(true));
 toast('Saved to Sheet Library. Earlier saved versions are kept.');
}
async function exportEditableProject(entry=null){
 await sheetExportDialog([entry?.id||project.id]);
}
async function switchProject(incoming,{recovered=false,imported=false}={}){
 const next=DM.validateProject(incoming);Art.inspectItems(next.items);
 if(recovered){next.id=DM.uid();next.name=(next.name+' · recovered').slice(0,160);next.updated=new Date().toISOString();}
 if(imported){next.id=DM.uid();next.updated=new Date().toISOString();}
 await Art.loadFonts(next.fonts);await saveCurrentProject();
 if(imported||recovered||next.items.length||next.name!=='Untitled sheet')await desktop.saveProject({project:next,thumbnail:await projectThumbnail(next).catch(()=>null)});
 const previous={project,page,selected,history,future};
 project=next;page=0;selected=new Set();history=[];future=[];changed();
 try{await flush();}catch(e){({project,page,selected,history,future}=previous);changed();render();throw e;}
 closeDialog();render();toast(recovered?'Opened a recovered copy. Your other sheets and decal library are kept.':imported?'Imported an independent copy into Sheet Library.':'Opened '+next.name+'.');
}
async function openProjectEntry(entry){await projectRun(async()=>{const data=await desktop.readProject(entry,true);await switchProject(data.project);});}
async function newProject(){await projectRun(()=>switchProject(DM.project()));}
async function saveProjectFromBrowser(){if(projectTask)return;await saveEditableProject();await projectBrowser();}
function sheetRow(p,source={}){
 return {...source,id:p.id,name:p.name,pages:p.pages,added:p.added,updated:p.updated||source.modified,
  meta:p.pages+' '+DM.pageFormat(p).label+' '+(p.pages===1?'page':'pages')+' · '+(p.count??p.items.length)+' decals · 1:'+p.scale};
}
async function sheetEntries(){
 const result=await desktop.listProjects(),current=DM.clone(project);
 return {unreadable:result.unreadable,entries:[sheetRow(current,{current:true,project:current}),...result.entries.filter(e=>e.id!==current.id).map(e=>sheetRow(e,e))]};
}
async function loadSheetRow(e){
 const p=e.current?DM.validateProject(project):e.project?DM.validateProject(e.project):DM.validateProject((await desktop.readProject(e)).project);
 Art.inspectItems(p.items);return p;
}
async function sheetPreviews(session,entries){session.watchPreviews(async e=>projectThumbnail(await loadSheetRow(e)));}

async function projectBrowser(){
 const generation=++projectBrowserGeneration;
 showDialog('Sheet Library','Loading saved sheets…','<p class="hint">Reading your local library.</p>','',true);
 const result=await sheetEntries();if(generation!==projectBrowserGeneration||!$('#dialog').open||$('.dialog-head h2').textContent!=='Sheet Library')return;
 const session=collectionBrowser({title:'Sheet Library',subtitle:'Select sheets to export. Open a sheet to continue editing.',kind:'sheets',...result,
  empty:'Save your current sheet to start your collection.',
  footer:'<button data-action="open-sheet-file">Import Sheet(s)</button><button id="library-export-selected" class="collection-export" disabled>Export Sheet(s)</button><button data-action="new">Add Sheet</button><button id="project-save-current">Save Current Sheet</button><button data-action="recover-workspace">Recovery</button>',
  actions:(e,n)=>'<button data-collection-action="open" data-project-open="'+n+'" data-index="'+n+'">'+(e.current?'Continue editing':'Open Sheet')+'</button><button data-collection-action="versions" data-project-versions="'+n+'" data-index="'+n+'">Versions</button>',
  action:async(action,e)=>{if(action==='versions')await projectVersions(e);else if(e.current)closeDialog();else await openProjectEntry(e);}
 });
 $('#library-export-selected').onclick=()=>sheetExportDialog(session.selected().map(e=>e.id)).catch(fail);
 $('#project-save-current').onclick=()=>saveProjectFromBrowser().catch(fail);
 sheetPreviews(session,result.entries).catch(fail);
}
async function sheetExportDialog(ids=[project.id]){
 showDialog('Export a Sheet','Loading saved sheets…','<p class="hint">Reading your local library.</p>');const loading=$('.dialog-head');
 const result=await sheetEntries();
 if(!loading.isConnected||!$('#dialog').open)return;
 const session=collectionBrowser({title:'Export a Sheet',subtitle:'Choose saved sheets. All pages are included unless you choose specific pages.',kind:'sheets',...result,selected:ids,pages:true,load:loadSheetRow,max:100,commitLabel:'Export',
  note:'One editable .sfsheet file keeps each selected sheet’s artwork, settings and fonts. Maximum 100 sheets. Only share fonts you may redistribute.',
  commit:async(entries,pageChoices)=>{
   const sheets=[];for(const e of entries){if(e.current)await saveCurrentProject(true);const p=await loadSheetRow(e);sheets.push(SheetFiles.pages(p,pageChoices.get(e.id)||Array.from({length:p.pages},(_,n)=>n)));}
   const file=await desktop.exportFile('sfsheet',sheets.length===1?sheets[0].name:'My sheet collection',SheetFiles.pack(sheets));
   toast(file?'Editable sheet exported. '+sheets.length+' saved sheet(s) included.':'Sheet export cancelled. Your saved sheets are kept.');return !!file;
  }
 });sheetPreviews(session,result.entries).catch(fail);
}
async function sheetImportDialog(raw){
 const sheets=SheetFiles.read(raw);for(const p of sheets)Art.inspectItems(p.items);
 // Incoming IDs are not selection keys: a collection may contain independent copies.
 const entries=sheets.map((p,n)=>({...sheetRow(p,{project:p}),id:'incoming-'+n}));
 const session=collectionBrowser({title:'Import a Sheet',subtitle:'Choose sheets to add to your library. Your current work stays open.',kind:'sheets',entries,selected:entries.map(e=>e.id),pages:true,load:loadSheetRow,max:100,commitLabel:'Import',
  note:'Imported sheets become independent copies. All pages are included unless you choose specific pages.',
  commit:async(chosen,pageChoices)=>{
   const incoming=chosen.map(e=>SheetFiles.pages(e.project,pageChoices.get(e.id)||Array.from({length:e.pages},(_,n)=>n)));
   for(const p of incoming)await Art.loadFonts(p.fonts);
   await flush();await desktop.importProjects(incoming);toast('Imported '+incoming.length+' sheet(s) into Sheet Library.');return true;
  }
 });sheetPreviews(session,entries).catch(fail);
}
async function projectVersions(entry){
 const generation=++projectBrowserGeneration;
 const workspace=!entry;
 showDialog(workspace?'Workspace sheet recovery':'Saved versions',workspace?'Recover a sheet from the last three automatic workspace backups.':entry.name,
  '<p class="hint">Recovery opens a separate copy of the sheet. Your current sheet is saved first; your library and preferences stay as they are.</p><div id="project-versions" class="project-versions">Loading versions…</div>',
  '<button data-action="projects">Back to Sheet Library</button><button data-action="folder">Open workspace folder</button>',true);
 const result=await desktop.listProjects(workspace?{scope:'workspace'}:{scope:'history',projectId:entry.id});if(generation!==projectBrowserGeneration||!$('#dialog').open||!$('#project-versions'))return;
 $('#project-versions').innerHTML=result.entries.length?result.entries.map((e,n)=>`<article class="project-version"><div><strong>${E(e.name)}</strong><p class="micro">${E(projectDate(workspace?e.updated:e.modified))} · ${e.count} decals · ${e.pages} ${E(DM.pageFormat(e).label)} ${e.pages===1?'page':'pages'}</p></div><button data-recover-preview="${n}">Preview & recover</button></article>`).join(''):'<p class="no-selection">No earlier versions yet. Saved project versions appear here when you save changes or switch sheets.</p>';
 if(result.unreadable)$('#project-versions').insertAdjacentHTML('beforeend',`<p class="hint">${result.unreadable} unreadable file(s) were kept in the workspace folder.</p>`);
 for(const button of $$('[data-recover-preview]'))button.onclick=()=>recoveryPreview(result.entries[Number(button.dataset.recoverPreview)]).catch(fail);
}
async function recoveryPreview(entry){
 await projectRun(async()=>{const data=await desktop.readProject(entry),p=DM.validateProject(data.project);Art.inspectItems(p.items);const thumbnail=await projectThumbnail(p);
  showDialog('Recover this sheet?',p.name,`<div class="recovery-preview"><img src="${E(thumbnail)}" alt="Recovered sheet preview"><div><p><strong>${p.count??p.items.length} decals · ${p.pages} ${E(DM.pageFormat(p).label)} ${p.pages===1?'page':'pages'}</strong></p><p class="hint">${E(projectDate(p.updated))}</p><p>A separate recovered copy will open. Your current sheet is saved first. Your library and preferences are kept.</p></div></div>`,
   '<button data-action="projects">Back to Sheet Library</button><button id="recover-project" class="primary">Open recovered copy</button>',true);
  // Keep the reviewed snapshot in memory: rotating workspace backup filenames cannot change it.
  $('#recover-project').onclick=()=>projectRun(()=>switchProject(p,{recovered:true})).catch(fail);
 });
}
