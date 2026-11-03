'use strict';
const {parentPort}=require('node:worker_threads');
parentPort.on('message',({id,root,method,args})=>{try{parentPort.postMessage({id,value:require('./sqlite-store.cjs').execute(root,method,args)});}catch(e){parentPort.postMessage({id,error:e.message});}});
