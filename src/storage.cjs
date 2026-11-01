const fs=require('node:fs/promises');
const path=require('node:path');
const DM=require('../renderer/model.js');
class Workspace {
  constructor(root){this.root=root;this.queue=Promise.resolve();}
  async init(){await fs.mkdir(this.root,{recursive:true});for(const dir of ['Projects','Library','Backups','Exports'])await fs.mkdir(path.join(this.root,dir),{recursive:true});}
  async read(){await this.init();for(const name of ['workspace.json','Backups/workspace-1.json','Backups/workspace-2.json','Backups/workspace-3.json']){try{const value=DM.validateWorkspace(JSON.parse(await fs.readFile(path.join(this.root,name),'utf8')));return{data:value,recovered:name!=='workspace.json'};}catch(e){if(e.code==='ENOENT')continue;this.readError=e.message;}}const exists=await fs.stat(path.join(this.root,'workspace.json')).then(()=>true,()=>false);if(exists)throw Error('Your workspace could not be read. The original has been kept. Restore a backup from the workspace folder.');return{data:null,recovered:false};}
  save(data){const snapshot=DM.clone(data);const job=async()=>{const valid=DM.validateWorkspace(snapshot);await this.init();const body=JSON.stringify(valid);if(Buffer.byteLength(body)>160*1024*1024)throw Error('Workspace exceeds 160 MB. Export unused projects and decals first.');const file=path.join(this.root,'workspace.json'),tmp=file+'.tmp';await fs.writeFile(tmp,body);for(let i=3;i>=2;i--)await fs.copyFile(path.join(this.root,'Backups',`workspace-${i-1}.json`),path.join(this.root,'Backups',`workspace-${i}.json`)).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.copyFile(file,path.join(this.root,'Backups','workspace-1.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.rename(tmp,file);return true;};const result=this.queue.then(job);this.queue=result.catch(()=>{});return result;}
}
module.exports={Workspace};
