'use strict';
const ShapeToolsUI={
 open(source=null){
  if(source){if(source.locked)throw Error('Unlock this decal before changing its shape.');return this.configure(source.kind==='stripe'?'stripes':source.shapeOptions.type,source);}
  const basic=[['rect','Rectangle','▭'],['ellipse','Circle / Ellipse','○'],['triangle','Triangle','△'],['line','Line','╱'],['stripe','Double stripe','☰']];
  const tiles=Object.entries(ShapeTools.presets).map(([type,name])=>{const i=ShapeTools.create(type);return `<button data-shape-type="${type}"><img src="${E(Art.url(Art.standalone(i)))}" alt=""><span>${E(name)}</span></button>`;}).join('');
  showDialog('Shapes & Patterns','Choose a shape or build an editable racing pattern.',`<h3>Basic shapes</h3><div class="shape-gallery basic-shapes">${basic.map(([kind,name,symbol])=>`<button data-basic-shape="${kind}" data-create="${kind}"><span class="shape-symbol">${symbol}</span><span>${name}</span></button>`).join('')}</div><h3>Shapes & racing patterns</h3><div class="shape-gallery">${tiles}</div><p class="hint">All shapes stay vector. Set dimensions and colours before adding; adjust them later in the inspector. Patterns contain individually editable shapes.</p>`,'<button data-action="number-template">Racing Number Plates</button><button data-action="close">Cancel</button>',true);
  for(const button of $$('[data-basic-shape]'))button.onclick=()=>{closeDialog();};
  for(const button of $$('[data-shape-type]'))button.onclick=()=>this.configure(button.dataset.shapeType);
 },
 configure(type,source=null){
  let draft;
  const defaults=ShapeTools.create(type,source?ShapeTools.optionsFor(source):{}).shapeOptions;
  const pattern=['checkerboard','stripes'].includes(type);
  const field=(key,label,value,min,max,step=.1)=>`<div class="field"><label for="shape-${key}">${label}</label><input id="shape-${key}" data-shape-value="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  showDialog(source?'Adjust '+ShapeTools.presets[type]:ShapeTools.presets[type],'Create at the exact size you want to print.',`<div class="shape-config"><div class="shape-live-preview" id="shape-preview"></div><section>${type==='checkerboard'?'':type==='stripes'?field('w','Stripe length (mm)',defaults.w,.1,1000):`<div class="fields2">${field('w','Width (mm)',defaults.w,.1,1000)}${field('h','Height (mm)',defaults.h,.1,1000)}</div>`}${(ShapeTools.parameters[type]||[]).map(([key,label,value,min,max,step])=>field(key,label,defaults[key],min,max,step)).join('')}${type==='stripes'?`${field('gapMm','Space between stripes (mm)',defaults.gapMm,0,1000)}${field('stripeWidth','Default stripe width (mm)',defaults.stripeWidth,.001,1000)}<button id="shape-equal-widths">Apply width to all stripes</button><details open><summary>Individual stripe widths</summary><div id="shape-stripe-widths" class="fields2"></div></details>`:''}<div class="fields2"><div class="field"><label for="shape-fill">Colour</label><input id="shape-fill" data-shape-value="fill" type="color" value="${defaults.fill==='none'?'#e5484d':defaults.fill}"></div>${['checkerboard','stripes'].includes(type)?`<div class="field"><label for="shape-fill2">Second colour</label><input id="shape-fill2" data-shape-value="fill2" type="color" value="${defaults.fill2}"></div>`:''}</div>${!['checkerboard','stripes'].includes(type)?`<label class="check"><input id="shape-transparent" type="checkbox" ${defaults.fill==='none'?'checked':''}>Transparent fill</label><div class="fields2">${field('strokeWidth','Outline (mm)',defaults.strokeWidth,0,50)}<div class="field"><label for="shape-stroke">Outline colour</label><input id="shape-stroke" type="color" data-shape-value="stroke" value="${defaults.stroke}"></div></div>`:''}<p class="hint">${type==='checkerboard'&&source&&Math.abs(source.w/defaults.columns-source.h/defaults.rows)>.00001?'This pattern was stretched. Applying restores equal square sides using the square size above. ':''}${source?.kind==='group'?'Applying regenerates the pattern and replaces individual child edits. Cancel keeps the existing pattern.':'Resize, rotate, recolour and add an outline using the inspector.'}</p></section></div>`,'<button id="shape-back">'+(source?'Cancel':'Back to Shapes')+'</button><button id="shape-apply" class="primary">'+(source?'Apply changes':'Add to Sheet')+'</button>',true);
  let widths=[...(defaults.widths||[])];
  const renderWidths=count=>{
   const host=$('#shape-stripe-widths');if(!host||!Number.isInteger(count)||count<1||count>12)return;
   while(widths.length<count)widths.push(Number($('#shape-stripeWidth').value));
   host.innerHTML=Array.from({length:count},(_,n)=>`<div class="field"><label for="stripe-width-${n}">Stripe ${n+1} width (mm)</label><input id="stripe-width-${n}" data-stripe-width="${n}" type="number" min=".001" max="1000" step=".1" value="${widths[n]}"></div>`).join('');
   for(const input of host.querySelectorAll('[data-stripe-width]'))input.oninput=()=>{widths[Number(input.dataset.stripeWidth)]=Number(input.value);update();};
  };
  const update=()=>{try{
   const values={...defaults};for(const input of $$('[data-shape-value]'))values[input.dataset.shapeValue]=input.type==='color'?input.value:Number(input.value);
   if(type==='stripes'){
    if(!Number.isInteger(values.count)||values.count<1||values.count>12)throw Error('Choose 1–12 stripes.');
    if($('#shape-stripe-widths').children.length!==values.count)renderWidths(values.count);
    values.widths=widths.slice(0,values.count);
   }
   if($('#shape-transparent')?.checked)values.fill='none';draft=ShapeTools.create(type,values);
   $('#shape-preview').innerHTML=`<img src="${E(Art.url(Art.standalone(draft)))}" alt="${E(draft.name)} preview">${pattern?'<p class="hint" id="shape-total-size" aria-live="polite"></p>':''}`;
   if(pattern)$('#shape-total-size').textContent=`Overall size: ${Number(draft.w.toFixed(3))} × ${Number(draft.h.toFixed(3))} mm. Preview fits this window. Adding ${type==='stripes'?'stripes or spacing':'rows or columns'} grows the pattern; individual ${type==='stripes'?'widths':'squares'} stay the same.`;
   $('#dialog-error').textContent='';$('#shape-apply').disabled=false;
  }catch(e){draft=null;$('#dialog-error').textContent=e.message;$('#shape-apply').disabled=true;}};
  if(type==='stripes'){
   renderWidths(defaults.count);
   $('#shape-equal-widths').onclick=()=>{const width=Number($('#shape-stripeWidth').value);if(!Number.isFinite(width)||width<.001||width>1000){$('#dialog-error').textContent='Stripe width must be between 0.001 and 1000 mm.';return;}widths=widths.map(()=>width);renderWidths(Number($('#shape-count').value));update();};
  }
  for(const input of $$('[data-shape-value]'))input.oninput=update;if($('#shape-transparent'))$('#shape-transparent').onchange=update;update();
  $('#shape-back').onclick=()=>source?closeDialog():this.open();
  $('#shape-apply').onclick=()=>{if(!draft)return;try{mutate(()=>{if(source){const i=project.items.find(i=>i.id===source.id);if(!i||i.locked)throw Error('The selected shape is unavailable or locked.');Object.assign(i,{w:draft.w,h:draft.h,fill:draft.fill,stroke:draft.stroke,strokeWidth:draft.strokeWidth,shapeOptions:draft.shapeOptions});if(i.kind==='polygon')i.points=draft.points;else Object.assign(i,{kind:'group'},{children:draft.children,baseW:draft.baseW,baseH:draft.baseH});}else place(DM.clone(draft));});closeDialog();}catch(e){$('#dialog-error').textContent=e.message;}};
 }
};
