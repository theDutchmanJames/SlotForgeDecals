const {PDFDocument,PDFName}=require('./pdf-lib.cjs');
async function exactA4(bytes,landscape=false){const pdf=await PDFDocument.load(bytes),w=(landscape?297:210)*72/25.4,h=(landscape?210:297)*72/25.4;for(const page of pdf.getPages()){page.setMediaBox(0,0,w,h);page.setCropBox(0,0,w,h);}pdf.setProducer('SlotForge Decals');return pdf.save();}
async function addWhitePlate(bytes,masks,spotName='RDG_WHITE'){
 const pdf=await PDFDocument.load(bytes);const ctx=pdf.context;
 if(!/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(spotName))throw Error('Invalid white spot name.');
 if(masks.length!==pdf.getPageCount())throw Error('White mask page count mismatch.');
 for(let n=0;n<masks.length;n++){
  const mask=masks[n];if(!mask)continue;
  if(!Number.isInteger(mask.width)||!Number.isInteger(mask.height)||mask.width>7100||mask.height>7100||mask.width<1||mask.height<1)throw Error('Invalid white mask dimensions.');
  const data=Buffer.from(mask.bits,'base64');if(data.length!==Math.ceil(mask.width/8)*mask.height)throw Error('Invalid white mask.');
  const page=pdf.getPage(n),resources=page.node.Resources()||ctx.obj({});page.node.set(PDFName.of('Resources'),resources);
  const tint=ctx.register(ctx.obj({FunctionType:2,Domain:[0,1],C0:[0,0,0,0],C1:[0,0,0,0],N:1}));
  const spaces=resources.lookupMaybe(PDFName.of('ColorSpace'),require('./pdf-lib.cjs').PDFDict)||ctx.obj({});spaces.set(PDFName.of('SFWhite'),ctx.obj([PDFName.of('Separation'),PDFName.of(spotName),PDFName.of('DeviceCMYK'),tint]));resources.set(PDFName.of('ColorSpace'),spaces);
  const objects=resources.lookupMaybe(PDFName.of('XObject'),require('./pdf-lib.cjs').PDFDict)||ctx.obj({});objects.set(PDFName.of('SFWhiteMask'),ctx.register(ctx.flateStream(data,{Type:'XObject',Subtype:'Image',Width:mask.width,Height:mask.height,ImageMask:true,BitsPerComponent:1,Decode:[0,1],Interpolate:false})));resources.set(PDFName.of('XObject'),objects);
  const {width,height}=page.getSize();const plate=ctx.register(ctx.flateStream(`q\n/SFWhite cs\n1 scn\n${width} 0 0 ${height} 0 0 cm\n/SFWhiteMask Do\nQ\n`));
  // Append an overprinting spot plate: colour content remains intact in separation-aware RIPs.
  const gs=resources.lookupMaybe(PDFName.of('ExtGState'),require('./pdf-lib.cjs').PDFDict)||ctx.obj({});gs.set(PDFName.of('SFWhiteOverprint'),ctx.obj({Type:'ExtGState',OP:true,op:true,OPM:1}));resources.set(PDFName.of('ExtGState'),gs);
  const start=ctx.register(ctx.flateStream('q /SFWhiteOverprint gs\n'));const end=ctx.register(ctx.flateStream('Q\n'));
  page.node.addContentStream(start);page.node.addContentStream(plate);page.node.addContentStream(end);
 }
 pdf.setProducer('SlotForge Decals');return pdf.save();
}
module.exports={addWhitePlate,exactA4};
