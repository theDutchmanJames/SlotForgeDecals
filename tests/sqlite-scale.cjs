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
const data=D.validateWorkspace({format:'slotforge-decals-workspace',version:1,libraryMode:'external',project,library:[],libraryFonts:[],settings:{}});
let inserted=0;
for(const count of [100,1000,5000,10000]){
 started=performance.now();
 while(inserted<count){const batch=Math.min(500,count-inserted);S.execute(root,'catalog-import',{decals:Array.from({length:batch},(_,n)=>({id:'decal-'+(inserted+n),name:'Decal '+(inserted+n),scale:32,art:project.items[0]})),fonts:[]});inserted+=batch;}
 const importMs=performance.now()-started;
 S.execute(root,'save',{data});started=performance.now();const loaded=S.execute(root,'load');const loadMs=performance.now()-started;assert.equal(loaded.libraryCount,count);assert.equal(loaded.data.library.length,0);
 data.project.items[0].x+=1;started=performance.now();S.execute(root,'save',{data});const editMs=performance.now()-started;
 started=performance.now();const result=S.execute(root,'catalog-query',{scope:'projects',limit:48});const listMs=performance.now()-started;assert.equal(result.total,1000);assert.equal(result.entries.length,48);assert(result.entries.every(r=>!r.project&&!r.thumbnail&&!r.art));assert.equal(S.execute(root,'stats').assets,1);
 const one=S.execute(root,'catalog-read',S.execute(root,'catalog-query',{offset:count-1,limit:1}).entries[0]);assert.equal(one.decal.art.src,source);
 results.push({decals:count,importMs:Math.round(importMs),loadMs:Math.round(loadMs),editMs:Math.round(editMs),listMs:Math.round(listMs),startupBytes:Buffer.byteLength(JSON.stringify(loaded)),metadataBytes:Buffer.byteLength(JSON.stringify(result)),...S.execute(root,'stats')});
}
assert(S.execute(root,'verify'));assert(fs.existsSync(path.join(root,'Projects/0.sfsheet')));
console.log(JSON.stringify({root,migrationMs:Math.round(migrationMs),legacyBytes,results},null,2));
