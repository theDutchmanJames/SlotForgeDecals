const {test}=require('node:test'),assert=require('node:assert/strict'),DM=require('../renderer/model.js'),C=require('../renderer/creation.js');
const measure=i=>({x:0,y:-80,w:i.text.length*60,h:100});
const options={style:'roundel',text:'27',w:18,h:18,border:.6,background:'#ffffff',foreground:'#111827',outline:'#e21e32'};
const template=(extra={})=>C.numberTemplate({...options,...extra},measure);
test('number templates fit centred typography inside borders and keep independent editable elements',()=>{
 for(const style of Object.keys(C.styles))for(const text of ['1','888888','A-27']){const g=template({style,text,w:24,h:16}),[bg,t]=g.children;
  assert.equal(bg.kind,style==='plate'?'rect':'ellipse');assert.equal(g.h,style==='roundel'?24:16);assert.equal(t.text,text);
  assert.ok(Math.abs(t.w/t.h-t.textBounds.w/t.textBounds.h)<1e-8);assert.ok(t.x>bg.strokeWidth&&t.y>bg.strokeWidth);assert.ok(Math.abs(t.x*2+t.w-g.w)<1e-8);assert.ok(Math.abs(t.y*2+t.h-g.h)<1e-8);
  assert.deepEqual(DM.readPack(DM.pack([{name:g.name,scale:32,art:g}])).decals[0].art,g);
 }
 assert.throws(()=>template({text:'<svg>'}),/letters/);assert.throws(()=>template({border:4}),/Border/);assert.throws(()=>template({w:0}),/Width/);assert.throws(()=>template({foreground:'red'}),/colour/);
});
test('group sessions isolate edits, preserve transforms and undo nested changes',()=>{
 const inner=template(),g=DM.group([inner,DM.item('text',{text:'Sponsor'})]);Object.assign(g,{rotation:27,flipX:true,w:g.w*2,h:g.h*1.5,carPositions:{side:{x:30,y:20}},ink:'colour-white',libraryId:'saved-master'});
 const before=DM.clone(g),s=C.session(g);s.change([0,1],i=>i.text='99');assert.equal(s.draft.children[0].children[1].text,'99');assert.deepEqual(g,before);
 for(const k of ['id','x','y','w','h','baseW','baseH','rotation','flipX','carPositions','ink','libraryId'])assert.deepEqual(s.draft[k],before[k]);
 s.undo();assert.deepEqual(s.draft,g);s.redo();assert.equal(s.draft.children[0].children[1].text,'99');
 s.undo();s.change([1],i=>i.fill='#123456');assert.equal(s.canRedo,false);
});
test('invalid edits are atomic and locks protect nested elements',()=>{
 const g=template(),s=C.session(g);assert.throws(()=>s.change([1],i=>i.w=0),/w/);assert.deepEqual(s.draft,g);assert.equal(s.canUndo,false);
 s.change([1],i=>i.locked=true);const locked=s.draft;assert.throws(()=>s.change([1],i=>i.text='18'),/Unlock/);assert.deepEqual(s.draft,locked);
 s.change([1],i=>i.locked=false,{unlock:true});s.change([1],i=>i.text='18');assert.equal(s.draft.children[1].text,'18');
 g.locked=true;assert.throws(()=>C.session(g),/Unlock/);
 const outer=DM.group([{...template(),locked:true}]),nested=C.session(outer);assert.throws(()=>nested.change([0,1],i=>i.text='1'),/Unlock/);assert.throws(()=>nested.add([0],DM.item('rect')),/Unlock/);
});
test('removal keeps groups valid, additions undo cleanly and drafts are detached',()=>{
 const g=template(),s=C.session(g);s.remove([0]);assert.equal(s.draft.children.length,1);assert.throws(()=>s.remove([0]),/at least one/);s.undo();assert.deepEqual(s.draft,g);
 const added=DM.item('ellipse');assert.equal(s.add([],added),2);added.fill='#123456';assert.notEqual(s.draft.children[2].fill,added.fill);const copy=s.draft;copy.children=[];assert.equal(s.draft.children.length,3);s.undo();assert.deepEqual(s.draft,g);
 assert.throws(()=>s.change([],i=>i.w=99),/contents/);assert.throws(()=>s.change([55],()=>{}),/no longer/);
});
