'use strict';
const {call}=require('./sqlite-client.cjs');
class Workspace {
 constructor(root){this.root=root;this.queue=Promise.resolve();this.stamp=null;}
 async init(){await call(this.root,'stats');}
 async read(){await this.queue.catch(()=>{});const result=await call(this.root,'load');this.stamp=result.stamp;return result;}
 save(data){const snapshot=structuredClone(data);const job=this.queue.catch(()=>{}).then(async()=>{const result=await call(this.root,'save',{data:snapshot,expected:this.stamp});this.stamp=result.stamp;return true;});this.queue=job;return job;}
 stats(){return call(this.root,'stats');}
 async backup(destination){await this.queue;return call(this.root,'backup',{destination});}
 async restore(source){await this.queue;const result=await call(this.root,'restore',{source});this.stamp=result.stamp;return result;}
}
module.exports={Workspace};
