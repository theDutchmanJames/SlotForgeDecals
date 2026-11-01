importScripts('image-prep-core.js');
onmessage=e=>{try{const result=ImagePrep.process({width:e.data.width,height:e.data.height,data:new Uint8ClampedArray(e.data.buffer)},e.data.settings);postMessage({result:{...result,data:undefined,buffer:result.data.buffer}},[result.data.buffer]);}catch(error){postMessage({error:error.message});}};
