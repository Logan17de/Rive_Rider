import assert from 'node:assert/strict';
import { createDocument, createNode } from '../src/veyra/model.js';
import { VeyraStore } from '../src/veyra/store.js';
import { createVeyraDataRuntime } from '../src/veyra/dataGraph.js';
import { createVeyraRuntimeHost } from '../src/veyra/runtimeHost.js';
import { createVeyraControlPlane } from '../src/veyra/controlPlane.js';
import { createComponentRuntimeRegistry } from '../src/veyra/components.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { serializeVeyra } from '../src/veyra/io.js';

const ref = (kind, id) => ({ kind, id });
const art = ref('artboard', 'source');
const board = id => ({ id, name: id, x: 0, y: 0, width: 640, height: 480, background: '#ffffff' });
const data = (instance, ...ids) => ({ kind: 'data', instance: ref('viewModelInstance', instance), path: ids.map(id => ref('dataProperty', id)) });
const prop = address => ({ kind: 'property', address });
const snapshot = s => [serializeVeyra(s.document), s.revision, JSON.stringify(s.commandHistory)];
const add = (s, id, source, target, extra = {}) => s.createBinding({ id, artboard: art, source, target, ...extra });

function base() {
  const s = new VeyraStore(createDocument({
    id: 'm8_c5', artboards: [board('source')], nodes: [
      createNode('rectangle', { id: 'box', opacity: 1 }),
      createNode('polygon', { id: 'poly', opacity: 1 }),
      createNode('rectangle', { id: 'other', opacity: 1 }),
      createNode('rectangle', { id: 'event', visible: false }),
    ],
  }));
  s.createViewModel({ id: 'child_model', properties: [{ id: 'value', type: 'number', defaultValue: .2, min: 0, max: 1 }] });
  s.createViewModel({ id: 'root_model', properties: [
    { id: 'number', type: 'number', defaultValue: .25, min: 0, max: 1 },
    { id: 'wide', type: 'number', defaultValue: .2 },
    { id: 'trigger', type: 'trigger' },
    { id: 'nested', type: 'viewModel', viewModel: ref('viewModel', 'child_model'), defaultValue: null },
    { id: 'selector', type: 'viewModel', viewModel: ref('viewModel', 'child_model'), defaultValue: null },
  ] });
  for (const [id, value] of [['child', .2], ['child2', .9], ['child3', .7]]) {
    s.createViewModelInstance({ id, viewModel: ref('viewModel', 'child_model'), artboard: art,
      initialValues: [{ property: ref('dataProperty', 'value'), value }] });
  }
  s.createViewModelInstance({ id: 'root', viewModel: ref('viewModel', 'root_model'), artboard: art, initialValues: [
    { property: ref('dataProperty', 'nested'), value: ref('viewModelInstance', 'child') },
    { property: ref('dataProperty', 'selector'), value: ref('viewModelInstance', 'child2') },
  ] });
  const r = createVeyraDataRuntime(() => s.document);
  const cp = createVeyraControlPlane(s);
  const host = createVeyraRuntimeHost({ store: s, dataRuntime: r, controlPlane: cp, getContext: () => ({ artboardId: 'source' }) }).api;
  return { s, r, cp, host };
}

function advance(f, scopePath = []) { return f.r.evaluateBindings(f.s.document, { artboardId: 'source', scopePath }); }
function warm(f, scopePath = []) { advance(f, scopePath); assert.equal(advance(f, scopePath).stats.evaluatedBindings, 0); }
function scene(f, extra = {}) { return evaluateDocument(f.s.document, {}, null, { dataRuntime: f.r, artboardId: 'source', ...extra }); }
function nodeValue(out, id, path) { return path.split('.').reduce((value, key) => value?.[key], out.nodes.find(node => node.id === id)); }
function derived(writerId = 'reference_writer', twoWayId = 'two_way') {
  const f = base();
  add(f.s, writerId, data('root', 'selector'), data('root', 'nested'));
  add(f.s, twoWayId, data('root', 'nested', 'value'), prop('node:box/opacity'), { mode: 'twoWay' });
  return f;
}

{
  const f = derived('z_writer', 'a_two_way');
  warm(f);
  const beforeStats = f.r.stats;
  assert.equal(f.r.setTwoWayTarget('a_two_way', .47), true);
  assert.equal(f.r.getValue('child', 'value'), .2);
  assert.equal(f.r.getValue('child2', 'value'), .47);
  assert.equal(beforeStats.evaluations, f.r.stats.evaluations, 'reverse resolution must use an observation snapshot, not advance the live evaluator');
  assert.equal(advance(f).overrides['node:box/opacity'], .47);
}

{
  const f = derived();
  f.s.addArtboard(board('host'));
  f.s.addArtboard(board('middle'));
  f.s.createComponent('source', { id: 'leaf' });
  f.s.addComponentInstance('leaf', { id: 'inner', artboard: ref('artboard', 'middle') });
  f.s.createComponent('middle', { id: 'outer' });
  for (const id of ['A', 'B']) f.s.addComponentInstance('outer', { id, artboard: ref('artboard', 'host') });
  const paths = ['A', 'B'].map(id => [ref('componentInstance', id), ref('componentInstance', 'inner')]);
  const components = createComponentRuntimeRegistry(() => f.s.document);
  f.host = createVeyraRuntimeHost({ store: f.s, dataRuntime: f.r, componentRuntime: components, controlPlane: f.cp,
    getContext: () => ({ artboardId: 'host' }) }).api;
  for (const path of paths) warm(f, path);
  const before = snapshot(f.s);
  f.host.setDataRuntimeValue('root', 'selector', ref('viewModelInstance', 'child3'), { scopePath: paths[0] });
  // No read/render/advance between the retarget and reverse write.
  assert.equal(f.host.setTwoWayBindingTarget('two_way', .63, { scopePath: paths[0] }), true);
  assert.equal(f.r.getValue('child', 'value', { scopePath: paths[0] }), .2);
  assert.equal(f.r.getValue('child3', 'value', { scopePath: paths[0] }), .63);
  assert.equal(f.r.getValue('child2', 'value', { scopePath: paths[1] }), .9);
  assert.deepEqual(paths.map(scopePath => f.host.read('node:box/opacity', { scopePath }).evaluatedValue), [.63, .9]);
  assert.deepEqual(snapshot(f.s), before);
}

{
  const f = base();
  add(f.s, 'bad', data('root', 'wide'), prop('node:box/opacity'));
  add(f.s, 'independent', data('root', 'number'), prop('node:other/opacity'));
  add(f.s, 'event', data('root', 'trigger'), prop('node:event/visible'));
  warm(f);
  f.r.setValue('root', 'wide', 2);
  f.r.fire('root', 'trigger');
  const out = scene(f);
  assert.equal(nodeValue(out, 'box', 'opacity'), 1, 'invalid branch must be suppressed');
  assert.equal(nodeValue(out, 'other', 'opacity'), .25, 'independent branch must survive');
  assert.equal(nodeValue(out, 'event', 'visible'), true, 'valid event branch must still publish');
  assert.equal(f.r.getValue('root', 'trigger'), false, 'event is consumed only after a scene is safely returned');
  assert.ok(out.data.diagnostics.errors.some(error => error.binding?.id === 'bad'));
  f.r.setValue('root', 'wide', .6);
  const recovered = scene(f);
  assert.equal(nodeValue(recovered, 'box', 'opacity'), .6);
  assert.equal(recovered.data.diagnostics.errors.length, 0);
}

{
  const f = base();
  f.s.createConverter({ id: 'color', type: 'conditional', inputType: 'number', outputType: 'color',
    config: { equals: .66, then: 'not-a-color', else: '#112233' } });
  add(f.s, 'color', data('root', 'number'), prop('node:box/paint/stroke'), { converterChain: [ref('converter', 'color')] });
  add(f.s, 'independent', data('root', 'wide'), prop('node:other/opacity'));
  warm(f);
  f.r.setValue('root', 'number', .66);
  const failed = scene(f);
  assert.equal(nodeValue(failed, 'box', 'paint.stroke'), '#2c1830');
  assert.equal(nodeValue(failed, 'other', 'opacity'), .2);
  assert.ok(failed.data.diagnostics.errors.some(error => error.binding?.id === 'color'));
  f.r.setValue('root', 'number', .25);
  const recovered = scene(f);
  assert.equal(nodeValue(recovered, 'box', 'paint.stroke'), '#112233');
  assert.equal(recovered.data.diagnostics.errors.length, 0);
}

{
  const f = base();
  add(f.s, 'sides', data('root', 'wide'), prop('node:poly/geometry/sides'));
  f.r.setValue('root', 'wide', 4);
  warm(f);
  assert.equal(nodeValue(scene(f), 'poly', 'geometry.sides'), 4);
  f.r.setValue('root', 'wide', 2);
  const failed = scene(f);
  assert.equal(nodeValue(failed, 'poly', 'geometry.sides'), 6);
  assert.ok(failed.data.diagnostics.errors.some(error => error.binding?.id === 'sides'));
  f.r.setValue('root', 'wide', 8);
  assert.equal(nodeValue(scene(f), 'poly', 'geometry.sides'), 8);
}

{
  const f = base();
  f.s.updateDataProperty('root_model', 'wide', { defaultValue: 2 });
  const command = { action: 'createBinding', args: { overrides: {
    id: 'invalid-default', artboard: art, source: data('root', 'wide'), target: prop('node:box/opacity'),
  } } };
  const before = snapshot(f.s);
  const preview = f.cp.previewCommand(command);
  const dispatch = f.cp.dispatchCommand(command);
  let rawError = null;
  try { scene(f); } catch (error) { rawError = String(error.message); }
  assert.equal(rawError, null, 'accepted or rejected command must never leave canonical evaluation crashable');
  assert.equal(typeof preview.ok, 'boolean');
  if (!dispatch.ok) assert.deepEqual(snapshot(f.s), before);
}

console.log('Veyra M8-C5 effective reverse-write and safe visual-output regressions: PASS');
