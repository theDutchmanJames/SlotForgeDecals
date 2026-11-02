(function(){
 'use strict';
 const q=s=>document.querySelector(s),E=DM.esc;
 const fonts=()=>[...new Map(['Arial','Georgia','Verdana','Courier New',...activeFonts().map(f=>f.family)].map(f=>[f,activeFonts().find(x=>x.family===f)?.name||f])).entries()];
 const fontOptions=selected=>fonts().map(([f,name])=>`<option value="${E(f)}" ${f===selected?'selected':''}>${E(name)}</option>`).join('');
 function numberDialog(commit){
  showDialog('Racing numbers','Create an editable decal, or a matching pair for both sides of your car.',`
   <div class="number-layout"><section><div class="field"><label for="number-style">Template</label><select id="number-style">${Object.entries(Creation.styles).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
   <div class="field"><label for="number-text">Race number</label><input id="number-text" value="27" maxlength="6"></div>
   <div class="fields2"><div class="field"><label for="number-w">Width (mm)</label><input id="number-w" type="number" min="5" max="150" step=".1" value="18"></div><div class="field"><label for="number-h">Height (mm)</label><input id="number-h" type="number" min="5" max="150" step=".1" value="18" disabled></div></div>
   <div class="field"><label for="number-font">Typeface</label><select id="number-font">${fontOptions('Arial')}</select></div><label class="check"><input id="number-bold" type="checkbox" checked>Bold number</label>
   <div class="number-colours">${[['background','Background','#ffffff'],['foreground','Number','#111827'],['outline','Border','#e21e32']].map(([key,label,value])=>`<div class="field"><label for="number-${key}">${label}</label><input id="number-${key}" type="color" value="${value}"></div>`).join('')}</div>
   <div class="fields2"><div class="field"><label for="number-border">Border (mm)</label><input id="number-border" type="number" min="0" max="3.6" step=".1" value=".6"></div><div class="field"><label for="number-count">Add to sheet</label><select id="number-count"><option value="1">One decal</option><option value="2">Matching pair</option></select></div></div></section>
   <section><div id="number-preview" class="creation-preview"></div><p id="number-size" class="hint"></p><div class="notice">Numbers stay readable on both sides: a matching pair contains two identical, independent decals. Select one and choose Edit group to customise its text and shapes.</div></section></div>`,
   '<button data-action="close">Cancel</button><button class="primary" id="number-add">Add to sheet</button>',true);
  let decal;
  function update(){try{const style=q('#number-style').value;if(style==='roundel')q('#number-h').value=q('#number-w').value;q('#number-h').disabled=style==='roundel';q('#number-border').max=Math.min(5,Number(q('#number-w').value)/5,Number(q('#number-h').value)/5);
   const options={style,text:q('#number-text').value,font:q('#number-font').value,bold:q('#number-bold').checked};for(const key of ['w','h','border','background','foreground','outline'])options[key]=q('#number-'+key).value;
   decal=Creation.numberTemplate(options,Art.textBox);q('#number-preview').innerHTML=`<img alt="Racing number preview" src="${Art.url(Art.standalone(decal,activeFonts()))}">`;
   q('#number-size').textContent=`${decal.w.toFixed(1)} × ${decal.h.toFixed(1)} mm each · ${q('#number-count').value==='2'?'Two identical decals':'One decal'} · Vector artwork`;
   q('#dialog-error').textContent='';q('#number-add').disabled=false;
  }catch(e){decal=null;q('#dialog-error').textContent=e.message;q('#number-add').disabled=true;}}
  for(const el of document.querySelectorAll('.number-layout input,.number-layout select'))el.oninput=update;
  q('#number-add').onclick=()=>{try{update();if(!decal)return;commit(decal,Number(q('#number-count').value));closeDialog();}catch(e){q('#dialog-error').textContent=e.message;}};update();
 }
 function groupDialog(source,commit){
  const session=Creation.session(source);let scope=[],index=0;
  showDialog('Edit group',source.name+' · Changes apply together when you save.',`
   <div class="group-editor-toolbar"><div id="group-breadcrumbs"></div><button id="group-undo">Undo</button><button id="group-redo">Redo</button></div>
   <div class="group-editor-layout"><section><div id="group-preview" class="creation-preview"></div><p id="group-size-note" class="hint"></p><div class="group-elements" id="group-elements" aria-label="Group elements"></div><div class="row"><button id="group-add-text">Add text</button><button id="group-add-rect">Rectangle</button><button id="group-add-ellipse">Ellipse</button></div></section><section id="group-fields"></section></div>`,
   '<button data-action="close">Cancel</button><button class="primary" id="group-apply">Apply changes</button>',true);
  const error=e=>{q('#dialog-error').textContent=e.message;q('#group-apply').disabled=true;};
  function change(fn,options){try{session.change([...scope,index],fn,options);render();}catch(e){error(e);}}
  function render(){
   const draft=session.draft;while(scope.length){try{if(Creation.at(draft,scope).kind!=='group')throw Error('Not a group');break;}catch{scope.pop();}}
   const parent=Creation.at(draft,scope);index=Math.max(0,Math.min(index,parent.children.length-1));const item=parent.children[index];
   q('#group-apply').disabled=false;q('#dialog-error').textContent='';q('#group-undo').disabled=!session.canUndo;q('#group-redo').disabled=!session.canRedo;
   q('#group-breadcrumbs').innerHTML=[[],...scope.map((_,n)=>scope.slice(0,n+1))].map((path,n)=>`<button data-group-level="${n}" ${n===scope.length?'disabled':''}>${E(Creation.at(draft,path).name)}</button>`).join('<span aria-hidden="true"> / </span>');
   for(const button of document.querySelectorAll('[data-group-level]'))button.onclick=()=>{scope=scope.slice(0,Number(button.dataset.groupLevel));index=0;render();};
   const b=DM.union([DM.item('rect',{x:0,y:0,w:parent.baseW,h:parent.baseH}),...parent.children]),pad=Math.max(b.w,b.h)*.06;
   const transform=`translate(${item.x+item.w/2} ${item.y+item.h/2}) rotate(${item.rotation}) translate(${-item.w/2} ${-item.h/2})`;
   q('#group-preview').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x-pad} ${b.y-pad} ${b.w+2*pad} ${b.h+2*pad}" role="img" aria-label="Group design preview"><rect x="0" y="0" width="${parent.baseW}" height="${parent.baseH}" fill="none" stroke="#66778b" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>${parent.children.map((c,n)=>`<g data-group-item="${n}">${Art.element({...c,ink:'colour'},'group-edit-'+n)}<rect transform="translate(${c.x+c.w/2} ${c.y+c.h/2}) rotate(${c.rotation}) translate(${-c.w/2} ${-c.h/2})" width="${c.w}" height="${c.h}" fill="transparent"/></g>`).join('')}<rect transform="${transform}" width="${item.w}" height="${item.h}" fill="none" stroke="#e5484d" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/></svg>`;
   const visible=DM.bounds({...draft,x:0,y:0,rotation:0,flipX:false,flipY:false});
   q('#group-size-note').textContent=`Upright design: ${parent.baseW.toFixed(1)} × ${parent.baseH.toFixed(1)} mm. Fields use this design’s coordinates. Sheet frame: ${draft.w.toFixed(1)} × ${draft.h.toFixed(1)} mm; artwork bounds: ${visible.w.toFixed(1)} × ${visible.h.toFixed(1)} mm. Print checks and previews include elements beyond the frame; sheet rotation, mirroring and car placement are kept.`;
   q('#group-elements').innerHTML=parent.children.map((c,n)=>`<button data-group-item="${n}" aria-pressed="${n===index}"><span>${E(c.name)}</span><small>${E(c.kind)}${c.locked?' · Locked':''}</small></button>`).join('');
   for(const el of document.querySelectorAll('[data-group-item]'))el.onclick=()=>{index=Number(el.dataset.groupItem);render();};
   const paint=!['group','svg','image','slice'].includes(item.kind),outline=paint&&!['line','stripe'].includes(item.kind);
   const field=(label,key,value,min=-10000,max=10000,step=.1)=>`<div class="field"><label for="group-${key}">${label}</label><input id="group-${key}" data-group-prop="${key}" type="number" value="${Number(value.toFixed(3))}" min="${min}" max="${max}" step="${step}"></div>`;
   q('#group-fields').innerHTML=`<div class="row group-element-heading"><strong>${E(item.name)}</strong><button id="group-lock">${item.locked?'Unlock':'Lock'}</button></div><fieldset class="group-edit-fields" ${item.locked?'disabled':''}>
   <div class="field"><label for="group-name">Element name</label><input id="group-name" value="${E(item.name)}" maxlength="160"></div>
   ${item.kind==='group'&&!item.artOutline?'<button id="group-enter" class="wide">Edit nested group</button>':''}
   ${item.kind==='text'?`<div class="field"><label for="group-text">Text / number</label><input id="group-text" maxlength="500" value="${E(item.text)}"></div><div class="field"><label for="group-font">Typeface</label><select id="group-font">${fontOptions(item.font)}</select></div><div class="row"><label class="check"><input id="group-bold" type="checkbox" ${item.bold?'checked':''}>Bold</label><label class="check"><input id="group-italic" type="checkbox" ${item.italic?'checked':''}>Italic</label></div>${field('Letter spacing','spacing',item.spacing||0,-10,50,.5)}${field('Text bend (°)','curve',item.curve||0,-300,300,5)}<p class="hint">Positive bends up, negative bends down, 0 is straight. Keeps letter size and centre.</p>`:''}
   <div class="fields2">${field('Design X (mm)','x',item.x)}${field('Design Y (mm)','y',item.y)}</div><div class="fields2">${field('Design width (mm)','w',item.w,.1,1000)}${field('Design height (mm)','h',item.h,.1,1000)}</div><div class="fields2">${field('Rotation (°)','rotation',item.rotation,-3600,3600,1)}${field('Opacity','opacity',item.opacity,0,1,.05)}</div>
   ${paint?`<div class="number-colours"><div class="field"><label for="group-fill">Fill</label><input id="group-fill" type="color" value="${item.fill==='none'?'#ffffff':item.fill}"></div>${outline?`<div class="field"><label for="group-stroke">Outline</label><input id="group-stroke" type="color" value="${item.stroke}"></div>`:''}${item.kind==='stripe'?`<div class="field"><label for="group-fill2">Second stripe</label><input id="group-fill2" type="color" value="${item.fill2||'#245cc3'}"></div>`:''}</div><label class="check"><input id="group-no-fill" type="checkbox" ${item.fill==='none'?'checked':''}>Transparent fill</label>${outline?field('Design outline (mm)','strokeWidth',item.strokeWidth,0,50):'<p class="hint">Design height sets the line or stripe thickness.</p>'}${item.kind==='rect'?field('Corner radius (mm)','radius',item.radius||0,0,500):''}`:'<p class="hint">Imported artwork keeps its original contents. Position, size and opacity are editable here.</p>'}
   <div class="row"><button id="group-back">Backward</button><button id="group-forward">Forward</button><button id="group-remove" class="danger" ${parent.children.length===1?'disabled':''}>Remove</button></div></fieldset>`;
   q('#group-lock').onclick=()=>change(i=>i.locked=!i.locked,{unlock:true});
   q('#group-name').onchange=e=>change(i=>i.name=e.target.value.trim()||'Element');
   function measureText(i){if(i.kind==='text'){const cx=i.x+i.w/2;i.textBounds=Art.textBox(i);i.w=i.h*i.textBounds.w/i.textBounds.h;i.x=cx-i.w/2;}}
   for(const el of document.querySelectorAll('[data-group-prop]'))el.onchange=()=>change(i=>{const key=el.dataset.groupProp;if(key==='curve'){Art.bendText(i,el.value);return;}i[key]=DM.number(el.value,Number(el.min),Number(el.max),key);if(key==='spacing')measureText(i);});
   for(const key of ['fill','stroke','fill2','text','font','bold','italic']){const el=q('#group-'+key);if(el)el.onchange=()=>change(i=>{i[key]=el.type==='checkbox'?el.checked:el.value;if(['text','font','bold','italic'].includes(key))measureText(i);});}
   if(q('#group-no-fill'))q('#group-no-fill').onchange=e=>change(i=>i.fill=e.target.checked?'none':'#ffffff');
   if(q('#group-enter'))q('#group-enter').onclick=()=>{scope.push(index);index=0;render();};
   q('#group-back').disabled=item.locked||index===0;q('#group-forward').disabled=item.locked||index===parent.children.length-1;
   const reorder=step=>{try{session.change([...scope,index],(_i,p,n)=>{[p.children[n],p.children[n+step]]=[p.children[n+step],p.children[n]];});index+=step;render();}catch(e){error(e);}};
   q('#group-back').onclick=()=>reorder(-1);q('#group-forward').onclick=()=>reorder(1);
   q('#group-remove').onclick=()=>{try{session.remove([...scope,index]);render();}catch(e){error(e);}};
  }
  q('#group-undo').onclick=()=>{session.undo();render();};q('#group-redo').onclick=()=>{session.redo();render();};
  for(const kind of ['text','rect','ellipse'])q('#group-add-'+kind).onclick=()=>{try{const p=Creation.at(session.draft,scope),w=Math.max(.1,p.baseW*.45),h=Math.max(.1,p.baseH*.3),i=DM.item(kind,{x:p.baseW*.2,y:p.baseH*.2,w,h,fill:'#111827'});if(kind==='text'){Object.assign(i,{text:'27',font:'Arial',bold:true});i.textBounds=Art.textBox(i);i.w=i.h*i.textBounds.w/i.textBounds.h;}index=session.add(scope,i);render();}catch(e){error(e);}};
  q('#group-apply').onclick=()=>{try{commit(session.draft);closeDialog();}catch(e){error(e);}};
  render();
 }
 window.CreationUI={numberDialog,groupDialog};
})();
