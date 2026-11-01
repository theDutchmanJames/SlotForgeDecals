// EPS/PDF import preserves gradients and embedded raster artwork; it does not trace pixels.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
async function convert({bytes,format,page=null}){
 if(!['eps','pdf'].includes(format)||!bytes?.length||bytes.length>25*1024*1024)throw Error('Choose an EPS or PDF smaller than 25 MB.');
 let input=Buffer.from(bytes),temp;
 try{if(format==='eps'){
   if(!input.subarray(0,32).toString().startsWith('%!PS')&&!input.subarray(0,4).equals(Buffer.from([197,208,211,198])))throw Error('This is not an EPS file.');
   temp=await fs.mkdtemp(path.join(os.tmpdir(),'slotforge-decals-'));const source=path.join(temp,'art.eps'),output=path.join(temp,'art.pdf');await fs.writeFile(source,input);
   const filename=process.platform==='win32'?'gswin64c.exe':'gs';
   const bundled=process.resourcesPath&&path.join(process.resourcesPath,'ghostscript/bin',filename);
   const gs=bundled&&require('node:fs').existsSync(bundled)?bundled:path.resolve(__dirname,'../vendor/ghostscript/bin',filename);
   await new Promise((resolve,reject)=>{const child=spawn(gs,['-dSAFER','-dBATCH','-dNOPAUSE','-dQUIET','-dEPSCrop','-sDEVICE=pdfwrite',`-sOutputFile=${output}`,'-f',source],{cwd:temp,windowsHide:true,stdio:'ignore',env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:temp,TMP:temp,HOME:temp}});const timeout=setTimeout(()=>{child.kill();reject(Error('EPS conversion timed out. Simplify the artwork.'));},25000);child.on('error',()=>{clearTimeout(timeout);reject(Error('The bundled EPS converter is unavailable.'));});child.on('close',c=>{clearTimeout(timeout);c===0?resolve():reject(Error('EPS conversion failed. Re-export the artwork as SVG.'));});});if((await fs.stat(output)).size>60e6)throw Error('Converted artwork exceeds 60 MB.');input=await fs.readFile(output);
 }else if(!input.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('This is not a PDF file.');
 const m=await import('mupdf');let doc,sheet,buffer,writer,device;
 try{doc=m.Document.openDocument(input,'application/pdf');if(doc.needsPassword())throw Error('Unlock this PDF before importing.');const pages=doc.countPages();if(page===null&&pages>1)return{pages};const chosen=page??1;if(!Number.isInteger(chosen)||chosen<1||chosen>pages||pages>500)throw Error('Invalid PDF page.');sheet=doc.loadPage(chosen-1);const b=sheet.getBounds();buffer=new m.Buffer();writer=new m.DocumentWriter(buffer,'svg','text=path');device=writer.beginPage(b);sheet.run(device,m.Matrix.identity);writer.endPage();device=null;writer.close();const svg=buffer.asString();if(svg.length>12e6)throw Error('This artwork is too large. Export a simpler SVG.');return{pages,svg,widthMm:(b[2]-b[0])*25.4/72,heightMm:(b[3]-b[1])*25.4/72};}finally{device?.destroy();writer?.destroy();buffer?.destroy();sheet?.destroy();doc?.destroy();}
 }finally{if(temp)await fs.rm(temp,{recursive:true,force:true});}
}
module.exports={convert};
