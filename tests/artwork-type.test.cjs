const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../renderer/model.js');
test('artwork badges distinguish original raster, traced paths, embedded images and nested groups',()=>{
 const raster=M.item('image'),vector=M.item('svg',{svg:'<svg><path/></svg>'}),trace={...vector,traceSource:{src:'original'}},mixed={...vector,svg:'<svg><image/></svg>'};
 assert.equal(M.artworkType(raster),'Raster');assert.equal(M.artworkType(vector),'Vector');assert.equal(M.artworkType(trace),'Traced vector');assert.equal(M.artworkType(mixed),'Mixed raster / vector');
 assert.equal(M.artworkType(M.group([raster,raster])),'Raster');assert.equal(M.artworkType(M.group([vector,trace])),'Vector + traced');assert.equal(M.artworkType(M.group([M.group([vector,trace]),raster])),'Mixed raster / vector');
});
