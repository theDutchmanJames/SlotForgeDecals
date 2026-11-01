const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
 const root=path.resolve(__dirname,'..'),pkg=require('../package.json'),label=process.env.SLOTFORGE_BUILD_LABEL||pkg.version;
 if(!/^[a-zA-Z0-9._-]+$/.test(label))throw Error('Invalid build label.');
 const out=path.join(root,'dist','SlotForge Decals '+label);
 try{await fs.access(out);throw Error('Build folder exists. Use a new SLOTFORGE_BUILD_LABEL or rename the old folder.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const archives={'ghostscript-10.08.0.tar.xz':'c20492bc8ebb96c87fa2e52a0926e1cda8cde95d66145e018ac713fed5da38cf','mupdf-1.28.1-complete-source.tar.gz':'421b6882db04c120dc8ec789fb830387b9434972bdebff421b6faa3917fc5c3f'};
 for(const [name,hash]of Object.entries(archives)){const bytes=await fs.readFile(path.join(root,'vendor/sources',name));if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Source archive hash mismatch: '+name);}
 await fs.access(path.join(root,'vendor/ghostscript/bin/gswin64c.exe'));
 await fs.cp(path.join(root,'node_modules/electron/dist'),out,{recursive:true});await fs.rename(path.join(out,'electron.exe'),path.join(out,'SlotForge Decals.exe'));
 await require('./windows-icon.cjs').embedIcon(path.join(out,'SlotForge Decals.exe'),path.join(root,'assets/icon.ico'));
 const app=path.join(out,'resources/app');await fs.mkdir(app,{recursive:true});
 const firstParty=['src','renderer','assets','scripts','tests','docs','package.json','package-lock.json','README.md','LICENSE','NOTICE','THIRD-PARTY-NOTICES.txt','Start SlotForge Decals.cmd'];
 for(const name of firstParty)await fs.cp(path.join(root,name),path.join(app,name),{recursive:true});
 await fs.cp(path.join(root,'node_modules/mupdf'),path.join(app,'node_modules/mupdf'),{recursive:true});
 await fs.cp(path.join(root,'vendor/PDF-LIB-LICENSE.md'),path.join(app,'vendor/PDF-LIB-LICENSE.md'),{recursive:true});
 for(const name of ['bin','doc','lib','Resource','iccprofiles'])await fs.cp(path.join(root,'vendor/ghostscript',name),path.join(app,'vendor/ghostscript',name),{recursive:true});
 await fs.cp(path.join(root,'vendor/imagetracer'),path.join(app,'vendor/imagetracer'),{recursive:true});
 const sources=path.join(out,'Sources');await fs.mkdir(sources,{recursive:true});
 for(const name of [...Object.keys(archives),'MUPDF-SOURCE-REVISIONS.txt'])await fs.copyFile(path.join(root,'vendor/sources',name),path.join(sources,name));
 await fs.writeFile(path.join(sources,'SHA256SUMS.txt'),Object.entries(archives).map(([n,h])=>h+'  '+n).join('\n')+'\n');
 for(const name of firstParty)await fs.cp(path.join(root,name),path.join(sources,'SlotForge Decals',name),{recursive:true});
 await fs.cp(path.join(root,'vendor/PDF-LIB-LICENSE.md'),path.join(sources,'SlotForge Decals/vendor/PDF-LIB-LICENSE.md'),{recursive:true});
 await fs.cp(path.join(root,'vendor/imagetracer'),path.join(sources,'SlotForge Decals/vendor/imagetracer'),{recursive:true});
 await fs.copyFile(path.join(root,'README.md'),path.join(out,'README.md'));await fs.copyFile(path.join(root,'THIRD-PARTY-NOTICES.txt'),path.join(out,'THIRD-PARTY-NOTICES.txt'));await fs.copyFile(path.join(root,'LICENSE'),path.join(out,'SLOTFORGE-LICENSE.txt'));
 console.log(path.join(out,'SlotForge Decals.exe'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
