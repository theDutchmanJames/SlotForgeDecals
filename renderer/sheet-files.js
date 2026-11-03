(function(root,factory){const api=factory(typeof module==='object'?require('./model.js'):root.DM);if(typeof module==='object')module.exports=api;else root.SheetFiles=api;})(globalThis,DM=>{
 'use strict';
 const MAX_SHEETS=100;
 function read(raw){
  if(raw?.format==='slotforge-decals-sheet'){
   if(![1,2].includes(raw.version))throw Error('Unsupported sheet version.');
   return[DM.validateProject(raw.project)];
  }
  if(raw?.format!=='slotforge-decals-sheets'||raw.version!==1||!Array.isArray(raw.sheets)||!raw.sheets.length||raw.sheets.length>MAX_SHEETS)throw Error('Choose a supported sheet file (1–100 saved sheets).');
  return raw.sheets.map(entry=>DM.validateProject(entry.project));
 }
 function pages(source,chosen){
  const p=DM.validateProject(source),indices=[...new Set(chosen)].sort((a,b)=>a-b);
  if(!indices.length||indices.some(n=>!Number.isInteger(n)||n<0||n>=p.pages))throw Error('Select at least one valid page.');
  if(indices.length===p.pages)return p;
  p.items=p.items.filter(i=>indices.includes(i.page)).map(i=>({...i,page:indices.indexOf(i.page)}));p.pages=indices.length;
  p.fonts=DM.fontsFor(p.items,p.fonts);return DM.validateProject(p);
 }
 function pack(projects){
  if(!Array.isArray(projects)||!projects.length||projects.length>MAX_SHEETS)throw Error('Select 1–100 sheets per export.');
  const valid=projects.map(p=>DM.validateProject(p));
  return valid.length===1?{format:'slotforge-decals-sheet',version:DM.fileVersion(valid[0]),project:valid[0]}:{format:'slotforge-decals-sheets',version:1,sheets:valid.map(project=>({project}))};
 }
 return{read,pages,pack,MAX_SHEETS};
});
