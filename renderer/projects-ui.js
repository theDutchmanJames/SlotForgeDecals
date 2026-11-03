'use strict';
let projectTask=false,projectBrowserGeneration=0;
const projectDate=value=>{const date=new Date(typeof value==='string'?value:NaN);return Number.isNaN(date.getTime())?'Unknown date':date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});};
async function projectThumbnail(p){
 const svg=Art.sheet(p,0),img=new Image();img.src=Art.url(svg);await img.decode();
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
  const saved=await desktop.queryLibrary({scope:'projects',id:p.id,limit:1});
  if(!saved.unreadable&&!saved.total)return null;
 }
 const thumbnail=await projectThumbnail(p).catch(()=>null);await desktop.saveProject({project:p,thumbnail});return{project:p,thumbnail};
}
async function saveEditableProject(){
 if(projectTask)return;
 await projectRun(()=>saveCurrentProject(true));
 toast('Saved to Sheet Library. Earlier saved versions are kept.');
}
async function exportEditableProject(entry=null){
 await sheetExportDialog(entry?[entry]:undefined);
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
async function sheetEntries(args={}){
 const includeCurrent=!args.search||project.name.normalize('NFKC').toLowerCase().includes(args.search.normalize('NFKC').toLowerCase()),offset=args.offset||0,limit=args.limit||48;
 const result=await desktop.queryLibrary({...args,scope:'projects',excludeId:project.id,offset:Math.max(0,offset-(includeCurrent?1:0)),limit:limit-(includeCurrent&&offset===0?1:0)});
 const entries=result.entries.map(e=>sheetRow(e,e));if(includeCurrent&&offset===0)entries.unshift(sheetRow({...project,count:project.items.length},{current:true}));return{...result,total:result.total+(includeCurrent?1:0),entries};
}
function sheetPreview(e){return Library.thumbnail('sheet:'+(e.stamp||project.id+':'+project.updated),async()=>projectThumbnail(await loadSheetRow(e)));}
async function loadSheetRow(e){
 const p=e.current?DM.validateProject(project):e.project?DM.validateProject(e.project):DM.validateProject((await desktop.readProject(e)).project);
 Art.inspectItems(p.items);return p;
}
async function sheetPreviews(session,entries){session.watchPreviews(async e=>projectThumbnail(await loadSheetRow(e)));}

async function projectBrowser(){
 const session=collectionBrowser({title:'Sheet Library',subtitle:'Select sheets across pages to export. Open a sheet to continue editing.',kind:'sheets',query:sheetEntries,preview:sheetPreview,selectionLimit:100,
  empty:'Save your current sheet to start your collection.',
  footer:'<button data-action="open-sheet-file">Import Sheet(s)</button><button id="library-export-selected" class="collection-export" disabled>Export Sheet(s)</button><button data-action="new">Add Sheet</button><button id="project-save-current">Save Current Sheet</button><button data-action="recover-workspace">Recovery</button>',
  actions:(e,n)=>'<button data-collection-action="open" data-project-open="'+n+'" data-index="'+n+'">'+(e.current?'Continue editing':'Open Sheet')+'</button><button data-collection-action="versions" data-project-versions="'+n+'" data-index="'+n+'">Versions</button>',
  action:async(action,e)=>{if(action==='versions')await projectVersions(e);else if(e.current)closeDialog();else await openProjectEntry(e);}
 });
 $('#library-export-selected').onclick=()=>sheetExportDialog(session.selected()).catch(fail);$('#project-save-current').onclick=()=>saveProjectFromBrowser().catch(fail);
}
async function sheetExportDialog(selected=[sheetRow({...project,count:project.items.length},{current:true})]){
 return collectionBrowser({title:'Export a Sheet',subtitle:'Choose sheets and pages. Selection stays checked when you change pages.',kind:'sheets',query:sheetEntries,preview:sheetPreview,selected,pages:true,max:100,selectionLimit:100,commitLabel:'Export',
  note:'Maximum 100 sheets and 160 MB per file. All pages are included unless you choose specific pages.',
  commit:async(entries,pageChoices)=>{
   if(entries.some(e=>e.current))await saveCurrentProject(true);
   const file=await desktop.exportLibrary({kind:'sheets',entries:entries.map(e=>({...e,pagesSelected:pageChoices.get(e.id)})),current:entries.some(e=>e.current)?DM.clone(project):undefined,name:entries.length===1?entries[0].name:'My sheet collection'});
   toast(file?'Editable sheet exported.':'Sheet export cancelled. Your saved sheets are kept.');return !!file;
  }});
}
async function sheetImportDialog(raw){
 const sheets=SheetFiles.read(raw);for(const p of sheets)Art.inspectItems(p.items);
 // Incoming IDs are not selection keys: a collection may contain independent copies.
 const entries=sheets.map((p,n)=>({...sheetRow(p,{project:p}),id:'incoming-'+n}));
 const session=collectionBrowser({title:'Import a Sheet',subtitle:'Choose sheets to add to your library. Your current work stays open.',kind:'sheets',entries,selected:entries.map(e=>e.id),pages:true,load:loadSheetRow,max:100,commitLabel:'Import',
  note:'Imported sheets become independent copies. All pages are included unless you choose specific pages.',
  commit:async(chosen,pageChoices)=>{
   const incoming=chosen.map(e=>SheetFiles.pages(e.project,pageChoices.get(e.id)||Array.from({length:e.pages},(_,n)=>n)));

   await flush();await desktop.importProjects(incoming);toast('Imported '+incoming.length+' sheet(s) into Sheet Library.');return true;
  }
 });sheetPreviews(session,entries).catch(fail);
}
async function projectVersions(entry){
 const workspace=!entry;collectionBrowser({title:workspace?'Workspace sheet recovery':'Saved versions',subtitle:workspace?'Recover a sheet from the last three automatic snapshots.':entry.name,kind:'sheets',
 query:async args=>{const result=await desktop.queryLibrary({...args,scope:workspace?'workspace':'history',projectId:entry?.id});return{...result,entries:result.entries.map(e=>({...sheetRow(e,e),id:e.scope+':'+e.file}))};},preview:sheetPreview,
 note:'Recovery opens a separate copy. Your decal library and preferences stay as they are.',footer:'<button data-action="projects">Back to Sheet Library</button>',
 actions:(e,n)=>`<button data-recover-preview="${n}" data-collection-action="recover" data-index="${n}">Preview & recover</button>`,action:(_action,e)=>recoveryPreview(e)});
}
async function recoveryPreview(entry){
 await projectRun(async()=>{const data=await desktop.readProject(entry),p=DM.validateProject(data.project);Art.inspectItems(p.items);const thumbnail=await projectThumbnail(p);
  showDialog('Recover this sheet?',p.name,`<div class="recovery-preview"><img src="${E(thumbnail)}" alt="Recovered sheet preview"><div><p><strong>${p.count??p.items.length} decals · ${p.pages} ${E(DM.pageFormat(p).label)} ${p.pages===1?'page':'pages'}</strong></p><p class="hint">${E(projectDate(p.updated))}</p><p>A separate recovered copy will open. Your current sheet is saved first. Your library and preferences are kept.</p></div></div>`,
   '<button data-action="projects">Back to Sheet Library</button><button id="recover-project" class="primary">Open recovered copy</button>',true);
  // Keep the reviewed snapshot in memory: rotating workspace backup filenames cannot change it.
  $('#recover-project').onclick=()=>projectRun(()=>switchProject(p,{recovered:true})).catch(fail);
 });
}
