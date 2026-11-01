'use strict';
let projectTask=false,projectBrowserGeneration=0;
const projectDate=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'Unknown date':date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});};
async function projectThumbnail(p){
 await Art.loadFonts(p.fonts);const svg=Art.sheet(p,0),img=new Image();img.src=Art.url(svg);await img.decode();
 const s=DM.size(p),c=document.createElement('canvas');c.width=Math.round(300*s.w/Math.max(s.w,s.h));c.height=Math.round(300*s.h/Math.max(s.w,s.h));
 const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/png');
}
async function projectRun(fn){
 if(projectTask)return;projectTask=true;
 const owned=!$('#dialog').open;if(owned)showDialog('Saving your sheet','Please wait…','<p class="hint">Keeping your work in the local workspace.</p>');
 $('#dialog-content').inert=true;
 try{return await fn();}finally{projectTask=false;$('#dialog-content').inert=false;if(owned&&$('#dialog').open)closeDialog();}
}
async function saveCurrentProject(includeBlank=false){
 await flush();const p=DM.validateProject(DM.clone(project));
 if(!includeBlank&&!p.items.length&&p.name==='Untitled sheet')return null;
 const thumbnail=await projectThumbnail(p).catch(()=>null);await desktop.saveProject({project:p,thumbnail});return{project:p,thumbnail};
}
async function exportEditableProject(){
 await projectRun(async()=>{const saved=await saveCurrentProject(true),p=saved.project,thumbnail=saved.thumbnail;
  const file=await desktop.exportFile('sfsheet',p.name,{format:'slotforge-decals-sheet',version:DM.fileVersion(p),project:p,thumbnail});
  if(file)toast('Editable sheet saved, including its artwork.');else toast('Sheet kept in Projects. File export cancelled.');
 });
}
async function switchProject(incoming,{recovered=false}={}){
 const next=DM.validateProject(incoming);Art.inspectItems(next.items);
 if(recovered){next.id=DM.uid();next.name=(next.name+' · recovered').slice(0,160);next.updated=new Date().toISOString();}
 await Art.loadFonts(next.fonts);await saveCurrentProject();
 if(next.items.length||next.name!=='Untitled sheet')await desktop.saveProject({project:next,thumbnail:await projectThumbnail(next).catch(()=>null)});
 const previous={project,page,selected,history,future};
 project=next;page=0;selected=new Set();history=[];future=[];changed();
 try{await flush();}catch(e){({project,page,selected,history,future}=previous);changed();render();throw e;}
 closeDialog();render();toast(recovered?'Opened a recovered copy. Your other projects and library are kept.':'Opened '+next.name+'.');
}
async function openProjectEntry(entry){await projectRun(async()=>{const data=await desktop.readProject(entry,true);await switchProject(data.project);});}
async function newProject(){await projectRun(()=>switchProject(DM.project()));}
async function saveProjectFromBrowser(){if(projectTask)return;await projectRun(async()=>{await saveCurrentProject(true);toast('Saved to Projects. Earlier saved versions are kept.');});await projectBrowser();}
function projectCard(entry,index,current=false){
 return `<article class="project-card" data-project-card="${index}"><div class="project-thumbnail">${entry.thumbnail?`<img src="${E(entry.thumbnail)}" alt="First page of ${E(entry.name)}">`:`<span class="hint">${current?'Preview unavailable':'Loading preview…'}</span>`}</div><div class="project-card-body"><h3 title="${E(entry.name)}">${E(entry.name)}</h3><p class="micro">${entry.pages} ${E(DM.pageFormat(entry).label)} ${entry.pages===1?'page':'pages'} · ${entry.count} decals · 1:${entry.scale}</p><p class="micro">${current?'Current sheet · autosaved workspace':'Recent: '+E(projectDate(entry.recent))}</p><div class="row"><button class="primary" data-project-open="${index}">${current?'Continue editing':'Open sheet'}</button><button data-project-versions="${index}">Versions</button></div></div></article>`;
}
async function projectBrowser(){
 const generation=++projectBrowserGeneration;
 showDialog('Your projects','Local decal sheets · your library stays with you.',
  '<div class="project-browser-tools"><input id="project-search" type="search" placeholder="Find a sheet…" aria-label="Find a project"><select id="project-sort" aria-label="Sort projects"><option value="recent">Recently used</option><option value="name">Name</option><option value="modified">Last saved</option></select></div><p class="hint">The sheet you leave is saved to Projects before switching. Save current keeps a version you can return to later.</p><p id="projects-notice" class="hint" role="status">Loading projects…</p><div id="project-cards" class="project-cards"></div>',
  '<button data-action="recover-workspace">Workspace recovery</button><button data-action="open-sheet-file">Open sheet file…</button><button data-action="new">New sheet</button><button id="project-save-current" class="primary">Save current</button>',true);
 $('#project-save-current').onclick=()=>saveProjectFromBrowser().catch(fail);
 try{
  const result=await desktop.listProjects(),current=DM.clone(project),thumbnail=await projectThumbnail(current).catch(()=>null);
  if(generation!==projectBrowserGeneration||!$('#dialog').open||!$('#project-cards'))return;
  const live={name:current.name,id:current.id,pages:current.pages,pageSize:current.pageSize,count:current.items.length,scale:current.scale,thumbnail,recent:current.updated,modified:current.updated,current:true},
   entries=[live,...result.entries.filter(e=>e.id!==current.id)];
  const previews=new Map();entries.forEach((e,n)=>{if(e.thumbnail)previews.set(n,e.thumbnail);});
  const refresh=()=>{
   const q=$('#project-search').value.trim().toLowerCase(),sort=$('#project-sort').value,shown=entries.map((e,n)=>({...e,index:n})).filter(e=>e.name.toLowerCase().includes(q));
   shown.sort((a,b)=>Number(!!b.current)-Number(!!a.current)||(sort==='name'?a.name.localeCompare(b.name):Date.parse(b[sort])-Date.parse(a[sort])));
   $('#projects-notice').textContent=`${shown.length} ${shown.length===1?'sheet':'sheets'}${result.unreadable?' · '+result.unreadable+' unreadable file(s) kept in the workspace folder':''}`;
   $('#project-cards').innerHTML=shown.map(e=>projectCard({...e,thumbnail:previews.get(e.index)},e.index,e.current)).join('')||'<p class="no-selection">No sheets match your search.</p>';
   for(const button of $$('[data-project-open]'))button.onclick=()=>{const e=entries[Number(button.dataset.projectOpen)];if(e.current)closeDialog();else openProjectEntry(e).catch(fail);};
   for(const button of $$('[data-project-versions]'))button.onclick=()=>projectVersions(entries[Number(button.dataset.projectVersions)]).catch(fail);
  };
  $('#project-search').oninput=refresh;$('#project-sort').onchange=refresh;refresh();
  // Legacy .sfsheet files have no cached PNG; generate their previews without changing files.
  for(let n=1;n<entries.length;n++){if(generation!==projectBrowserGeneration||!$('#dialog').open||!$('#project-cards'))break;if(previews.has(n))continue;
   try{const data=await desktop.readProject(entries[n]),p=DM.validateProject(data.project);Art.inspectItems(p.items);const png=await projectThumbnail(p);previews.set(n,png);
    if(generation!==projectBrowserGeneration||!$('#dialog').open||!$('#project-cards'))break;const box=$(`[data-project-card="${n}"] .project-thumbnail`);if(box)box.innerHTML=`<img src="${E(png)}" alt="First page of ${E(p.name)}">`;
   }catch{if(generation!==projectBrowserGeneration)break;const box=$(`[data-project-card="${n}"] .project-thumbnail`);if(box)box.textContent='Preview unavailable';}
  }
 }catch(e){if($('#projects-notice'))$('#projects-notice').textContent=e.message;}
}
async function projectVersions(entry){
 const generation=++projectBrowserGeneration;
 const workspace=!entry;
 showDialog(workspace?'Workspace sheet recovery':'Saved versions',workspace?'Recover a sheet from the last three automatic workspace backups.':entry.name,
  '<p class="hint">Recovery opens a separate copy of the sheet. Your current sheet is saved first; your library and preferences stay as they are.</p><div id="project-versions" class="project-versions">Loading versions…</div>',
  '<button data-action="projects">Back to projects</button><button data-action="folder">Open workspace folder</button>',true);
 const result=await desktop.listProjects(workspace?{scope:'workspace'}:{scope:'history',projectId:entry.id});if(generation!==projectBrowserGeneration||!$('#dialog').open||!$('#project-versions'))return;
 $('#project-versions').innerHTML=result.entries.length?result.entries.map((e,n)=>`<article class="project-version"><div><strong>${E(e.name)}</strong><p class="micro">${E(projectDate(workspace?e.updated:e.modified))} · ${e.count} decals · ${e.pages} ${E(DM.pageFormat(e).label)} ${e.pages===1?'page':'pages'}</p></div><button data-recover-preview="${n}">Preview & recover</button></article>`).join(''):'<p class="no-selection">No earlier versions yet. Saved project versions appear here when you save changes or switch sheets.</p>';
 if(result.unreadable)$('#project-versions').insertAdjacentHTML('beforeend',`<p class="hint">${result.unreadable} unreadable file(s) were kept in the workspace folder.</p>`);
 for(const button of $$('[data-recover-preview]'))button.onclick=()=>recoveryPreview(result.entries[Number(button.dataset.recoverPreview)]).catch(fail);
}
async function recoveryPreview(entry){
 await projectRun(async()=>{const data=await desktop.readProject(entry),p=DM.validateProject(data.project);Art.inspectItems(p.items);const thumbnail=await projectThumbnail(p);
  showDialog('Recover this sheet?',p.name,`<div class="recovery-preview"><img src="${E(thumbnail)}" alt="Recovered sheet preview"><div><p><strong>${p.count??p.items.length} decals · ${p.pages} ${E(DM.pageFormat(p).label)} ${p.pages===1?'page':'pages'}</strong></p><p class="hint">${E(projectDate(p.updated))}</p><p>A separate recovered copy will open. Your current sheet is saved first. Your library and preferences are kept.</p></div></div>`,
   '<button data-action="projects">Back to projects</button><button id="recover-project" class="primary">Open recovered copy</button>',true);
  // Keep the reviewed snapshot in memory: rotating workspace backup filenames cannot change it.
  $('#recover-project').onclick=()=>projectRun(()=>switchProject(p,{recovered:true})).catch(fail);
 });
}
