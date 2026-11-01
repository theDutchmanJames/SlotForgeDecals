const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  load:()=>ipcRenderer.invoke('load'),save:data=>ipcRenderer.invoke('save',data),
  listProjects:options=>ipcRenderer.invoke('projects-list',options),readProject:(entry,remember=false)=>ipcRenderer.invoke('projects-read',{entry,remember}),
  saveProject:data=>ipcRenderer.invoke('projects-save',data),
  exportFile:(type,name,data)=>ipcRenderer.invoke('export-file',{type,name,data}),
  exportPDF:payload=>ipcRenderer.invoke('export-pdf',payload),
  convert:payload=>ipcRenderer.invoke('convert',payload),
  folder:()=>ipcRenderer.invoke('folder'),onClose:callback=>ipcRenderer.on('close-request',callback),closeReady:()=>ipcRenderer.send('close-ready')
});
