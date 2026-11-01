'use strict';
importScripts('../vendor/imagetracer/imagetracer_v1.2.6.js','trace-core.js');
self.onmessage=event=>{try{const {width,height,buffer,settings}=event.data;self.postMessage({result:DecalTrace.trace({width,height,data:new Uint8ClampedArray(buffer)},settings,ImageTracer)});}catch(error){self.postMessage({error:error.message||'The image could not be traced.'});}};
