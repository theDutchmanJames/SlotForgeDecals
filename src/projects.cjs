'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{call}=require('./sqlite-client.cjs');
class Projects {
 constructor(root){this.root=root;}
 async init(){for(const folder of ['Projects','Projects/History','Backups'])await fs.mkdir(path.join(this.root,folder),{recursive:true});}
 list(options){return call(this.root,'list',options);}
 read(entry,{remember=false}={}){return call(this.root,'read',{entry,remember});}
 save(data){return call(this.root,'saveSheet',data);}
 importMany(data){return call(this.root,'import',data);}
}
module.exports={Projects};
