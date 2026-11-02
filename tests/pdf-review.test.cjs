const test=require('node:test'),assert=require('node:assert/strict');
const {artwork,markup}=require('../renderer/pdf-review.js');
test('PDF review finds nested raster content and ignores retained originals of traced artwork',()=>{
 const rows=artwork([
  {kind:'image',name:'Photo',page:0},
  {kind:'svg',name:'Traced logo',svg:'<svg><path/></svg>',traceSource:{src:'original.png'},page:0},
  {kind:'svg',name:'Embedded',svg:'<svg><image/></svg>',page:0},
  {kind:'slice',name:'Slice',page:2,children:[{kind:'group',name:'Group',page:0,children:[{kind:'image',name:'Nested',page:0},{kind:'text',name:'Number'}]}]}
 ]);
 assert.deepEqual(rows.map(r=>r.type),['Raster','Traced vector','Mixed raster / vector','Raster','Vector']);
 assert.deepEqual(rows.map(r=>r.raster),[true,false,true,true,false]);
 assert.equal(rows[3].name,'Slice › Group › Nested');assert.equal(rows[3].page,3);
});
test('PDF review escapes decal names and explains the separate white mask',()=>{
 const items=[{kind:'rect',name:'<img onerror="bad">',ink:'colour-white'}];
 const html=markup(items,true);
 assert(html.includes('&lt;img'));assert(!html.includes('<img onerror'));
 assert(html.includes('All listed artwork is vector'));assert(html.includes('600 PPI raster mask'));
 assert(!markup(items,false).includes('600 PPI raster mask'));
});
