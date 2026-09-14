import assert from 'node:assert/strict';
import { createDocument, createNode } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createVeyraDataRuntime } from '../src/veyra/dataGraph.js';
import { createVeyraRuntimeHost } from '../src/veyra/runtimeHost.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { serializeVeyra } from '../src/veyra/io.js';

const BASELINE = '602a62ef929f1fc73c3c15dcedc65abc9b9ea19b';
const ref = (kind,id) => ({kind,id});
const art = ref('artboard','source');
const board = id => ({id,name:id,x:0,y:0,width:640,height:480,background:'#ffffff'});
const data = (instance,...ids) => ({kind:'data',instance:ref('viewModelInstance',instance),path:ids.map(id=>ref('dataProperty',id))});
const prop = address => ({kind:'property',address});
const results=[];
function probe(name, fn){
  try { const actual=fn(); results.push({name,status:'PASS',actual}); console.log(JSON.stringify({name,status:'PASS',actual})); }
  catch(error){ results.push({name,status:'FAIL',error:String(error?.stack||error)}); console.log(JSON.stringify({name,status:'FAIL',error:String(error?.message||error)})); }
}
function base(){
  const s=new VeyraStore(createDocument({id:'review',artboards:[board('source')],nodes:[
    createNode('rectangle',{id:'box',opacity:1}),
    createNode('rectangle',{id:'other',opacity:.4}),
    createNode('rectangle',{id:'third',opacity:.6}),
  ]}));
  s.createViewModel({id:'child_model',properties:[{id:'value',type:'number',defaultValue:.2,min:0,max:1}]});
  s.createViewModel({id:'root_model',properties:[
    {id:'number',type:'number',defaultValue:.25,min:0,max:1},
    {id:'wide',type:'number',defaultValue:.2},
    {id:'choice',type:'number',defaultValue:1},
    {id:'trigger',type:'trigger'},
    {id:'nested',type:'viewModel',viewModel:ref('viewModel','child_model'),defaultValue:null},
    {id:'selector',type:'viewModel',viewModel:ref('viewModel','child_model'),defaultValue:null},
  ]});
  for(const [id,value] of [['child',.2],['child2',.9],['child3',.7]]) s.createViewModelInstance({id,viewModel:ref('viewModel','child_model'),artboard:art,initialValues:[{property:ref('dataProperty','value'),value}]});
  s.createViewModelInstance({id:'root',viewModel:ref('viewModel','root_model'),artboard:art,initialValues:[
    {property:ref('dataProperty','nested'),value:ref('viewModelInstance','child')},
    {property:ref('dataProperty','selector'),value:ref('viewModelInstance','child2')},
  ]});
  const r=createVeyraDataRuntime(()=>s.document); const cp=createVeyraControlPlane(s);
  const host=createVeyraRuntimeHost({store:s,dataRuntime:r,controlPlane:cp,getContext:()=>({artboardId:'source'})}).api;
  return {s,r,cp,host};
}
const add=(s,id,source,target,extra={})=>s.createBinding({id,artboard:art,source,target,...extra});
const advance=f=>f.r.evaluateBindings(f.s.document,{artboardId:'source'});
const scene=f=>evaluateDocument(f.s.document,{},null,{dataRuntime:f.r,artboardId:'source'});
const node=(out,id)=>out.nodes.find(n=>n.id===id);

probe('control: direct derived retarget reverse-write uses current terminal without live advance',()=>{
  const f=base(); add(f.s,'writer',data('root','selector'),data('root','nested')); add(f.s,'tw',data('root','nested','value'),prop('node:box/opacity'),{mode:'twoWay'});
  advance(f); advance(f); const before=f.r.stats.evaluations;
  assert.equal(f.host.setTwoWayBindingTarget('tw',.47),true);
  assert.equal(f.r.getValue('child','value'),.2); assert.equal(f.r.getValue('child2','value'),.47); assert.equal(f.r.stats.evaluations,before);
  return [.2,.47,before];
});

probe('converter-derived reference retargets twice and reverse-write follows the latest terminal',()=>{
  const f=base();
  f.s.createConverter({id:'choose',type:'conditional',inputType:'number',outputType:'viewModel',outputDescriptor:{type:'viewModel',viewModel:ref('viewModel','child_model')},config:{equals:1,then:ref('viewModelInstance','child2'),else:ref('viewModelInstance','child3')}});
  add(f.s,'writer',data('root','choice'),data('root','nested'),{converterChain:[ref('converter','choose')]});
  add(f.s,'tw',data('root','nested','value'),prop('node:box/opacity'),{mode:'twoWay'});
  f.host.setTwoWayBindingTarget('tw',.51);
  assert.equal(f.r.getValue('child2','value'),.51); assert.equal(f.r.getValue('child','value'),.2);
  f.host.setDataRuntimeValue('root','choice',0);
  f.host.setTwoWayBindingTarget('tw',.61);
  assert.equal(f.r.getValue('child3','value'),.61); assert.equal(f.r.getValue('child2','value'),.51);
  f.host.setDataRuntimeValue('root','choice',1);
  f.host.setTwoWayBindingTarget('tw',.71);
  assert.equal(f.r.getValue('child2','value'),.71); assert.equal(f.r.getValue('child3','value'),.61);
  return [.71,.61];
});

probe('unresolved effective reverse-write fails before touching the previous child',()=>{
  const f=base(); add(f.s,'writer',data('root','selector'),data('root','nested')); add(f.s,'tw',data('root','nested','value'),prop('node:box/opacity'),{mode:'twoWay'});
  f.host.setDataRuntimeValue('root','selector',null);
  const before=[f.r.getValue('child','value'),f.r.getValue('child2','value'),serializeVeyra(f.s.document)];
  assert.throws(()=>f.host.setTwoWayBindingTarget('tw',.88),/binding-two-way-source-unresolved|binding-runtime-path/);
  assert.deepEqual([f.r.getValue('child','value'),f.r.getValue('child2','value'),serializeVeyra(f.s.document)],before);
  return before.slice(0,2);
});

probe('invalid ordinary-property output suppresses its downstream consumer, not independent branches',()=>{
  const f=base(); add(f.s,'bad',data('root','wide'),prop('node:box/opacity')); add(f.s,'dependent',prop('node:box/opacity'),prop('node:other/opacity')); add(f.s,'independent',data('root','number'),prop('node:third/opacity'));
  scene(f); f.r.setValue('root','wide',2); const out=scene(f);
  assert.equal(node(out,'box').opacity,1); assert.equal(node(out,'other').opacity,.4); assert.equal(node(out,'third').opacity,.25);
  assert.ok(out.data.diagnostics.errors.some(e=>e.binding?.id==='bad'));
  assert.ok(out.data.diagnostics.errors.some(e=>e.binding?.id==='dependent' && e.code==='binding-runtime-upstream'));
  return [node(out,'box').opacity,node(out,'other').opacity,node(out,'third').opacity];
});

probe('trigger feeding an invalid visual branch is not consumed until that branch becomes publishable',()=>{
  const f=base();
  f.s.createConverter({id:'pulse',type:'conditional',inputType:'boolean',outputType:'number',config:{equals:true,then:2,else:.1}});
  add(f.s,'pulse-bind',data('root','trigger'),prop('node:box/opacity'),{converterChain:[ref('converter','pulse')]});
  f.r.fire('root','trigger'); const bad=scene(f);
  assert.equal(node(bad,'box').opacity,1); assert.equal(f.r.getValue('root','trigger'),true); assert.ok(bad.data.diagnostics.errors.some(e=>e.binding?.id==='pulse-bind'));
  f.s.updateConverter('pulse',{config:{equals:true,then:.5,else:.1}}); const good=scene(f);
  assert.equal(node(good,'box').opacity,.5); assert.equal(f.r.getValue('root','trigger'),false);
  return [1,true,.5,false];
});

probe('visual value contract isolates non-finite and scale-range failures and recovers',()=>{
  const f=base(); add(f.s,'scale',data('root','wide'),prop('node:box/transform/scaleX')); add(f.s,'independent',data('root','number'),prop('node:other/opacity'));
  f.r.setValue('root','wide',101); let out=scene(f); assert.equal(node(out,'box').transform.scaleX,1); assert.equal(node(out,'other').opacity,.25); assert.ok(out.data.diagnostics.errors.some(e=>e.binding?.id==='scale'));
  f.r.setValue('root','wide',-50); out=scene(f); assert.equal(node(out,'box').transform.scaleX,-50); assert.equal(out.data.diagnostics.errors.length,0);
  return [-50,.25];
});

const failed=results.filter(r=>r.status==='FAIL');
await import('node:fs').then(fs=>fs.writeFileSync('verification/m8-c5-review-results.json',JSON.stringify({baseline:BASELINE,results},null,2)));
console.log(`INDEPENDENT M8-C5 REVIEW: ${results.length-failed.length}/${results.length} passed`);
if(failed.length) process.exit(1);
