const {app,BrowserWindow,ipcMain,dialog,shell,utilityProcess}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises');
const {Workspace}=require('./storage.cjs');
const {Projects}=require('./projects.cjs');
const {writeExport}=require('./export-file.cjs');
let win,workspace,allowClose=false;
app.setName('SlotForge Decals');
if(process.env.SLOTFORGE_TEST_PROFILE)app.setPath('userData',process.env.SLOTFORGE_TEST_PROFILE);
if(!app.requestSingleInstanceLock())app.quit();else{
app.on('second-instance',()=>{win?.show();win?.focus();});
app.whenReady().then(async()=>{
 const root=process.env.SLOTFORGE_WORKSPACE||path.join(app.getPath('documents'),'SlotForge Decals');workspace=new Workspace(root);
 win=new BrowserWindow({width:1600,height:1050,minWidth:1100,minHeight:720,backgroundColor:'#171b21',title:'SlotForge Decals',icon:path.join(__dirname,'../assets/icon.png'),show:!process.env.SLOTFORGE_TEST_PROFILE,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 const handle=(name,fn)=>ipcMain.handle(name,async(e,arg)=>{if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw Error('Invalid request.');return fn(arg);});
 handle('load',async()=>({...await workspace.read(),root,version:app.getVersion()}));
 handle('save',data=>workspace.save(data));
 const projects=new Projects(root);
 handle('projects-list',options=>projects.list(options));
 handle('projects-read',({entry,remember})=>projects.read(entry,{remember:remember===true}));
 handle('projects-save',data=>projects.save(data));
 handle('projects-import',data=>projects.importMany(data));
 handle('folder',()=>shell.openPath(root));
 handle('storage-stats',()=>workspace.stats());
 handle('complete-backup',async()=>{let file;if(process.env.SLOTFORGE_EXPORT_DIR){await fs.mkdir(process.env.SLOTFORGE_EXPORT_DIR,{recursive:true});file=path.join(process.env.SLOTFORGE_EXPORT_DIR,'SlotForge-Decals-complete.sfdbbackup');}else{const result=await dialog.showSaveDialog(win,{defaultPath:path.join(root,'Backups','SlotForge-Decals-complete.sfdbbackup'),filters:[{name:'Complete Decals backup',extensions:['sfdbbackup']}]});if(result.canceled)return null;file=result.filePath;}return workspace.backup(file);});
 handle('complete-restore',async()=>{const picked=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Complete Decals backup',extensions:['sfdbbackup']}]});if(picked.canceled)return null;const choice=await dialog.showMessageBox(win,{type:'warning',buttons:['Cancel','Restore Complete Backup'],defaultId:0,cancelId:0,message:'Replace the complete workspace?',detail:'This replaces all saved sheets, sheet history, decals and settings. A recovery copy of the current database will be kept first.'});if(choice.response!==1)return null;return workspace.restore(picked.filePaths[0]);});
 handle('export-file',async({type,name,data})=>{if(!['sfdecal','sfsheet','sfbackup','svg'].includes(type))throw Error('Unsupported export.');if(type==='svg'&&(typeof data!=='string'||!data.startsWith('<svg')||data.length>40e6))throw Error('Invalid SVG export.');const text=type==='svg'?data:JSON.stringify(data,null,2);if(Buffer.byteLength(text)>160e6)throw Error('Export exceeds 160 MB.');let file;if(process.env.SLOTFORGE_EXPORT_DIR){await fs.mkdir(process.env.SLOTFORGE_EXPORT_DIR,{recursive:true});file=path.join(process.env.SLOTFORGE_EXPORT_DIR,`${safeName(name)}.${type}`);}else{const result=await dialog.showSaveDialog(win,{defaultPath:path.join(root,type==='sfbackup'?'Backups':'Exports',`${safeName(name)}.${type}`),filters:[{name:'SlotForge file',extensions:[type]}]});if(result.canceled)return null;file=result.filePath;}await writeExport(root,file,type,text);return file;});
 handle('convert',data=>new Promise((resolve,reject)=>{const child=utilityProcess.fork(path.join(__dirname,'converter-worker.cjs'));const timer=setTimeout(()=>{child.kill();reject(Error('Conversion took too long. Simplify the artwork.'));},35000);child.on('message',msg=>{clearTimeout(timer);child.kill();msg.error?reject(Error(msg.error)):resolve(msg.result);});child.on('exit',()=>{clearTimeout(timer);reject(Error('The converter stopped before completing.'));});child.postMessage(data);}));
 handle('export-pdf',async({html,name,pageSize='a4',landscape,masks,spotName,customSize})=>{
  const DM=require('../renderer/model.js'),printDimensions=DM.size({pageSize,orientation:landscape?'landscape':'portrait'});
  // Render on the standard sheet first. Chromium quantizes tiny CSS page sizes;
  // cropping the resulting PDF preserves the original artwork scale.
  const dimensions=customSize?{w:DM.number(customSize.w,1,printDimensions.w,'Slice width'),h:DM.number(customSize.h,1,printDimensions.h,'Slice height')}:printDimensions;
  if(typeof html!=='string'||html.length>100e6)throw Error('Invalid print document.');
  let file;if(process.env.SLOTFORGE_EXPORT_DIR){await fs.mkdir(process.env.SLOTFORGE_EXPORT_DIR,{recursive:true});file=path.join(process.env.SLOTFORGE_EXPORT_DIR,safeName(name)+'.pdf');}else{const result=await dialog.showSaveDialog(win,{defaultPath:path.join(root,'Exports',safeName(name)+'.pdf'),filters:[{name:'PDF document',extensions:['pdf']}]});if(result.canceled)return null;file=result.filePath;}
  const print=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});print.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  // Isolated print window has no app APIs and cannot fetch network resources.
  const temp=path.join(app.getPath('temp'),'slotforge-decals-'+require('node:crypto').randomUUID()+'.html');
  try{await fs.writeFile(temp,html);await print.loadFile(temp);await print.webContents.executeJavaScript('Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.decode())]).then(()=>true)');let bytes=await print.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,pageSize:{width:printDimensions.w/25.4,height:printDimensions.h/25.4},landscape:false,margins:{top:0,bottom:0,left:0,right:0},displayHeaderFooter:false});bytes=await require('./white-pdf.cjs').exactPage(bytes,dimensions);if(masks?.some(Boolean))bytes=await require('./white-pdf.cjs').addWhitePlate(bytes,masks,spotName);await writeExport(root,file,'pdf',bytes);return file;}finally{print.destroy();await fs.unlink(temp).catch(()=>{});}
 });
 ipcMain.on('reload-workspace',e=>{if(e.sender===win.webContents&&e.senderFrame===win.webContents.mainFrame)win.webContents.reload();});
 ipcMain.on('close-ready',e=>{if(e.sender===win.webContents){allowClose=true;win.close();}});
 win.on('close',e=>{if(!allowClose&&!process.env.SLOTFORGE_TEST_PROFILE){e.preventDefault();win.webContents.send('close-request');}});
 await win.loadFile(path.join(__dirname,'../renderer/index.html'));
});
app.on('window-all-closed',()=>app.quit());
}
function safeName(value){return String(value||'Decal sheet').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,100).replace(/[. ]+$/,'')||'Decal sheet';}
