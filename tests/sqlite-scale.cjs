'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),D=require('../renderer/model'),S=require('../src/sqlite-store.cjs');
const root=fs.mkdtempSync(path.resolve('test-output/sqlite-scale-')),results=[];
// Repeated artwork represents the same sponsor decal placed on many saved sheets.
const source='data:image/png;base64,'+Buffer.alloc(16*1024,42).toString('base64');
const project=D.project('Scale fixture');project.items=[D.item('image',{src:source,pixelsW:100,pixelsH:100})];
fs.mkdirSync(path.join(root,'Projects'),{recursive:true});
let legacyBytes=0;
for(let n=0;n<1000;n++){const text=JSON.stringify({format:'slotforge-decals-sheet',version:1,project:{...project,id:'sheet-'+n,name:'Sheet '+n}});legacyBytes+=Buffer.byteLength(text);fs.writeFileSync(path.join(root,'Projects',n+'.sfsheet'),text);}
let started=performance.now();S.execute(root,'load');const migrationMs=performance.now()-started;
for(const count of [100,500,1000]){
 const data=D.validateWorkspace({format:'slotforge-decals-workspace',version:1,project,library:Array.from({length:count},(_,n)=>({id:'decal-'+n,name:'Decal '+n,scale:32,art:project.items[0]})),libraryFonts:[],settings:{}});
 started=performance.now();S.execute(root,'save',{data});const saveMs=performance.now()-started;
 started=performance.now();const loaded=S.execute(root,'load');const loadMs=performance.now()-started;assert.equal(loaded.data.library.length,count);assert.equal(loaded.data.library.at(-1).art.src,source);
 data.project.items[0].x+=1;started=performance.now();S.execute(root,'save',{data});const editMs=performance.now()-started;
 started=performance.now();const rows=S.execute(root,'list').entries;const listMs=performance.now()-started;assert.equal(rows.length,1000);assert(rows.every(r=>!r.project&&!r.thumbnail&&!r.art));assert.equal(S.execute(root,'stats').assets,1);
 results.push({decals:count,saveMs:Math.round(saveMs),loadMs:Math.round(loadMs),editMs:Math.round(editMs),listMs:Math.round(listMs),metadataBytes:Buffer.byteLength(JSON.stringify(rows)),...S.execute(root,'stats')});
}
assert(S.execute(root,'verify'));assert(fs.existsSync(path.join(root,'Projects/0.sfsheet')));
console.log(JSON.stringify({root,migrationMs:Math.round(migrationMs),legacyBytes,results},null,2));
