/* Edit only the solid-colour path SVGs produced by the tracer. */
window.TraceRefine={
 color(value){
  const s=String(value||'').trim().toLowerCase();
  if(/^#[0-9a-f]{6}$/.test(s))return s;
  if(/^#[0-9a-f]{3}$/.test(s))return '#'+s.slice(1).split('').map(c=>c+c).join('');
  const m=s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if(m&&m.slice(1).every(n=>+n<=255))return '#'+m.slice(1).map(n=>(+n).toString(16).padStart(2,'0')).join('');
  throw Error('Re-trace this artwork to edit its solid colours and shapes.');
 },
 load(source){
  const clean=Art.sanitize(source),doc=new DOMParser().parseFromString(clean.svg,'image/svg+xml'),root=doc.documentElement;
  if([...root.children].some(e=>!['path','title','desc'].includes(e.localName)||e.children.length)||root.hasAttribute('style')||root.hasAttribute('class'))throw Error('Re-trace this artwork to edit its colours and shapes.');
  let nodes=[...root.querySelectorAll('path')];
  if(!nodes.length||nodes.length>18000)throw Error('The trace needs between 1 and 18,000 shapes.');
  for(const p of nodes){if(p.hasAttribute('style')||p.hasAttribute('class')||p.hasAttribute('clip-path')||p.hasAttribute('mask'))throw Error('Re-trace this artwork to edit its colours and shapes.');TraceRefine.color(p.getAttribute('fill'));}
  const serialize=()=>new XMLSerializer().serializeToString(root);
  return{
   get count(){return nodes.length;},
   svg:serialize,
   palette(){const colors=new Map();nodes.forEach((p,n)=>{const color=TraceRefine.color(p.getAttribute('fill'));if(!colors.has(color))colors.set(color,[]);colors.get(color).push(n);});return [...colors].map(([color,shapes])=>({color,shapes}));},
   recolor(color,next){if(!/^#[\da-f]{6}$/i.test(next))throw Error('Enter a six-digit colour such as #e5484d.');let changed=0;for(const p of nodes)if(TraceRefine.color(p.getAttribute('fill'))===color){const old=p.getAttribute('fill');if(p.getAttribute('stroke')===old)p.setAttribute('stroke',next);p.setAttribute('fill',next);changed++;}return changed;},
   remove(index){if(nodes.length===1)throw Error('Keep at least one shape in the decal.');if(!Number.isInteger(index)||!nodes[index])throw Error('Click a shape in the vector preview first.');nodes[index].remove();nodes.splice(index,1);},
   preview(selected){
    const clone=root.cloneNode(true);clone.removeAttribute('width');clone.removeAttribute('height');clone.setAttribute('aria-label','Editable traced vector preview');
    [...clone.querySelectorAll('path')].forEach((p,n)=>{p.setAttribute('data-trace-shape',n);p.setAttribute('tabindex','-1');p.setAttribute('pointer-events','visiblePainted');if(n===selected){p.setAttribute('stroke','#ffa000');p.setAttribute('stroke-width','2');p.setAttribute('vector-effect','non-scaling-stroke');}});
    return new XMLSerializer().serializeToString(clone);
   }
  };
 }
};
