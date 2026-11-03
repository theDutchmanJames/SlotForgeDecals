'use strict';
const {Worker}=require('node:worker_threads'),path=require('node:path');
let worker=null,active=null,sequence=0;const queue=[];
function failed(w,error){if(worker!==w)return;worker=null;const jobs=[...(active?[active]:[]),...queue.splice(0)];active=null;for(const job of jobs)job.reject(error);w.terminate().catch(()=>{});}
function pump(){if(active||!queue.length)return;if(!worker){let w;try{w=new Worker(path.join(__dirname,'sqlite-worker.cjs'));}catch(error){for(const job of queue.splice(0))job.reject(error);return;}worker=w;w.on('message',msg=>{if(worker!==w)return;if(msg.id!==active?.id)return failed(w,Error('Unexpected storage acknowledgement.'));const job=active;active=null;msg.error?job.reject(Error(msg.error)):job.resolve(msg.value);if(queue.length)pump();else w.unref();});w.on('error',e=>failed(w,e));w.on('exit',()=>failed(w,Error('Storage worker stopped before confirming the operation.')));}active=queue.shift();worker.ref();try{const {id,root,method,args}=active;worker.postMessage({id,root,method,args});}catch(e){failed(worker,e);}}
function call(root,method,args){return new Promise((resolve,reject)=>{queue.push({id:++sequence,root:path.resolve(root),method,args,resolve,reject});pump();});}
module.exports={call};
