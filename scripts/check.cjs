const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
let failed=false;for(const dir of ['src','renderer','scripts','tests'])for(const name of fs.readdirSync(dir)){if(!/\.(c?js)$/.test(name)||name==='pdf-lib.cjs')continue;const file=path.join(dir,name),r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status){failed=true;console.error(file,r.stderr);}}
if(failed)process.exit(1);console.log('JavaScript syntax checks passed.');
