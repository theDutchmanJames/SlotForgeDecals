// Reuse exact, checksum-pinned corresponding sources already supplied with Livery 1.1.0.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const archives={
  'ghostscript-10.08.0.tar.xz':'c20492bc8ebb96c87fa2e52a0926e1cda8cde95d66145e018ac713fed5da38cf',
  'mupdf-1.28.1-complete-source.tar.gz':'421b6882db04c120dc8ec789fb830387b9434972bdebff421b6faa3917fc5c3f',
  'MUPDF-SOURCE-REVISIONS.txt':'63a215227e59a0c164ac29a6663b01543266cd67cb140eb662640c96e0ee13b0'
};
async function main(){
  await fs.mkdir('source-assets',{recursive:true});
  const names=Object.keys(archives);
  for(const name of names){
    let data;try{data=await fs.readFile(path.join('vendor/sources',name));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!data){const response=await fetch(`https://github.com/theDutchmanJames/SlotForgeLivery/releases/download/v1.1.0/${name}`);if(!response.ok)throw Error(`Source download failed: ${response.status}`);data=Buffer.from(await response.arrayBuffer());}
    if(crypto.createHash('sha256').update(data).digest('hex')!==archives[name])throw Error(`Source checksum mismatch: ${name}`);
    await fs.writeFile(path.join('source-assets',name),data);
  }
  const source='SlotForgeDecals-source.tar.gz';
  execFileSync('git',['archive','--format=tar.gz','--prefix=SlotForgeDecals-source/','-o',path.join('source-assets',source),'HEAD']);
  await fs.copyFile('docs/BUILDING.md','source-assets/BUILDING.md');names.push(source,'BUILDING.md');
  const lines=[];for(const name of names)lines.push(crypto.createHash('sha256').update(await fs.readFile(path.join('source-assets',name))).digest('hex')+'  '+name);
  await fs.writeFile('source-assets/SHA256SUMS-sources.txt',lines.join('\n')+'\n');
  console.log('Application and complete converter sources verified.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
