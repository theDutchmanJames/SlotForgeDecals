const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  queryLibrary:args=>ipcRenderer.invoke('library-query',args),readDecal:entry=>ipcRenderer.invoke('decal-read',entry),saveDecal:data=>ipcRenderer.invoke('decal-save',data),importDecals:data=>ipcRenderer.invoke('decal-import',data),deleteDecal:entry=>ipcRenderer.invoke('decal-delete',entry),exportLibrary:data=>ipcRenderer.invoke('library-export',data),exportWorkspace:data=>ipcRenderer.invoke('workspace-export',data),restoreWorkspace:data=>ipcRenderer.invoke('workspace-restore',data),
  load:()=>ipcRenderer.invoke('load'),save:data=>ipcRenderer.invoke('save',data),
  listProjects:options=>ipcRenderer.invoke('projects-list',options),readProject:(entry,remember=false)=>ipcRenderer.invoke('projects-read',{entry,remember}),
  saveProject:data=>ipcRenderer.invoke('projects-save',data),
  importProjects:data=>ipcRenderer.invoke('projects-import',data),
  exportFile:(type,name,data)=>ipcRenderer.invoke('export-file',{type,name,data}),
  exportPDF:payload=>ipcRenderer.invoke('export-pdf',payload),
  convert:payload=>ipcRenderer.invoke('convert',payload),
  reloadWorkspace:()=>ipcRenderer.send('reload-workspace'),storageStats:()=>ipcRenderer.invoke('storage-stats'),completeBackup:()=>ipcRenderer.invoke('complete-backup'),completeRestore:()=>ipcRenderer.invoke('complete-restore'),
  folder:()=>ipcRenderer.invoke('folder'),onClose:callback=>ipcRenderer.on('close-request',callback),closeReady:()=>ipcRenderer.send('close-ready')
});
