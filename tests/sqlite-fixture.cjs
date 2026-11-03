// Deliberately damage only a disposable test database, then restore its exact bytes.
const path=require('node:path'),{DatabaseSync}=require('node:sqlite');
function corruptSheet(root,file){
 const resolved=path.resolve(root);if(!resolved.startsWith(path.resolve(__dirname,'../test-output')+path.sep))throw Error('Corruption fixtures must stay inside test-output.');
 const db=new DatabaseSync(path.join(root,'decals.sqlite'));
 const row=db.prepare("SELECT d.hash,d.json FROM records r JOIN documents d ON d.hash=r.document WHERE r.scope='projects' AND r.key=?").get(file);if(!row)throw Error('Missing test sheet.');
 db.prepare("UPDATE documents SET json='{broken' WHERE hash=?").run(row.hash);db.close();
 return{restore(){const connection=new DatabaseSync(path.join(root,'decals.sqlite'));try{connection.prepare('UPDATE documents SET json=? WHERE hash=?').run(row.json,row.hash);}finally{connection.close();}}};
}
module.exports={corruptSheet};
