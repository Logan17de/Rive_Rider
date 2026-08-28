import assert from 'node:assert/strict';
import {
  cloneValue,
  createDocument,
  createGradientStop,
  createLinearGradient,
  createNode,
  createRadialGradient,
  createSemanticRecord,
  createStarterDocument,
  createTimeline,
  normalizeDocument,
} from '../src/veyra/model.js';
import { pathData, renderSvgString, starPoints } from '../src/veyra/geometry.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { parseVeyra, safeFilename, serializeVeyra } from '../src/veyra/io.js';
import { createNodeRef } from '../src/veyra/references.js';
import { VeyraStore } from '../src/veyra/store.js';

const starter = createStarterDocument();
assert.equal(starter.format, 'veyra');
assert.equal(starter.version, 3);
assert.equal(starter.nodes[0].paint.fill.type, 'solid');
assert.equal(starter.name, 'Veyra Bloom Rig');
assert.equal(starter.nodes.length, 9);
assert.equal(starter.bones.length, 2);
assert.equal(starter.meshes.length, 1);
assert.equal(starter.controls.length, 1);
assert.equal(starter.constraints.length, 1);
assert.equal(new Set(starter.nodes.map((node) => node.id)).size, starter.nodes.length);
assert.equal(starter.semantics.length, 5);

const roundTrip = parseVeyra(serializeVeyra(starter));
assert.deepEqual(roundTrip, starter);
assert.match(renderSvgString(evaluateDocument(starter)), /<svg[\s\S]*Veyra/);
assert.match(renderSvgString(evaluateDocument(starter)), /<path/);
assert.equal(starPoints(10, 5, 6).length, 12);

const gradientNodes = [
  createNode('rectangle', {
    id: 'node_linear',
    paint: {
      fill: createLinearGradient({
        x1: 0,
        y1: 0.5,
        x2: 1,
        y2: 0.5,
        stops: [
          createGradientStop({ id: 'stop_end', offset: 1, color: '#22d3ee' }),
          createGradientStop({ id: 'stop_start', offset: 0, color: '#ec4899' }),
        ],
      }),
    },
  }),
  createNode('ellipse', {
    id: 'node_radial',
    paint: { fill: createRadialGradient() },
  }),
];
const gradientDocument = normalizeDocument(createDocument({ nodes: gradientNodes }));
assert.equal(gradientDocument.nodes[0].paint.fill.type, 'linearGradient');
assert.deepEqual(gradientDocument.nodes[0].paint.fill.stops.map((stop) => stop.id), ['stop_start', 'stop_end']);
assert.equal(gradientDocument.nodes[1].paint.fill.type, 'radialGradient');
const gradientSvg = renderSvgString(evaluateDocument(gradientDocument));
assert.match(gradientSvg, /<linearGradient/);
assert.match(gradientSvg, /<radialGradient/);
assert.match(gradientSvg, /fill="url\(#veyra-node-node_linear-fill\)"/);

const smile = starter.nodes.find((node) => node.name === 'Smile');
const smilePath = pathData(smile.geometry);
assert.match(smilePath, /^M /);
assert.match(smilePath, /C /);
assert.doesNotMatch(smilePath, / Z$/);

const group = createNode('group', { name: 'Rig' });
const child = createNode('rectangle', { parent: createNodeRef(group.id) });
const documentModel = normalizeDocument(createDocument({
  nodes: [group, child],
  semantics: [createSemanticRecord(child.id, { tags: ['body'] })],
}));
const store = new VeyraStore(documentModel);
store.select(child.id);
store.execute('Move child', (document) => {
  document.nodes.find((node) => node.id === child.id).transform.x = 42;
});
assert.equal(store.selectedNode.transform.x, 42);
assert.equal(store.canUndo, true);
store.undo();
assert.equal(store.selectedNode.transform.x, 0);
store.redo();
assert.equal(store.selectedNode.transform.x, 42);

assert.throws(() => store.execute('Invalid scale', (document) => {
  document.nodes.find((node) => node.id === child.id).transform.x = Number.NaN;
}), /must be finite/);
assert.equal(store.selectedNode.transform.x, 42, 'Rejected commands must roll back atomically.');

store.begin('Drag child');
store.mutate((document) => {
  document.nodes.find((node) => node.id === child.id).transform.y = 18;
});
store.commit();
assert.equal(store.selectedNode.transform.y, 18);
store.undo();
assert.equal(store.selectedNode.transform.y, 0);

store.remove(group.id);
assert.equal(store.document.nodes.length, 0);
assert.equal(store.document.semantics.length, 0);

const duplicate = cloneValue(starter);
duplicate.nodes[1].id = duplicate.nodes[0].id;
assert.throws(() => normalizeDocument(duplicate), /Duplicate node id/);

const dangling = cloneValue(starter);
dangling.nodes[0].parent = createNodeRef('missing-parent');
assert.throws(() => normalizeDocument(dangling), /dangling parent/);

const cycle = cloneValue(starter);
cycle.nodes[0].parent = createNodeRef(cycle.nodes[1].id);
cycle.nodes[1].parent = createNodeRef(cycle.nodes[0].id);
assert.throws(() => normalizeDocument(cycle), /cycle/i);

const invalidNumber = cloneValue(starter);
invalidNumber.nodes[1].transform.x = Number.NaN;
assert.throws(() => normalizeDocument(invalidNumber), /must be finite/);

const invalidV3Fill = cloneValue(starter);
invalidV3Fill.nodes[0].paint.fill = '#ec4899';
assert.throws(() => normalizeDocument(invalidV3Fill), /tagged fill object/);

const invalidGradient = cloneValue(gradientDocument);
invalidGradient.nodes[0].paint.fill.stops = [invalidGradient.nodes[0].paint.fill.stops[0]];
assert.throws(() => normalizeDocument(invalidGradient), /at least two gradient stops/);
const duplicateGradientStop = cloneValue(gradientDocument);
duplicateGradientStop.nodes[0].paint.fill.stops[1].id = duplicateGradientStop.nodes[0].paint.fill.stops[0].id;
assert.throws(() => normalizeDocument(duplicateGradientStop), /duplicate stop id/);

const invalidPolygon = createNode('polygon');
invalidPolygon.geometry.sides = 2;
assert.throws(
  () => normalizeDocument(createDocument({ nodes: [invalidPolygon] })),
  /between 3 and 256/,
);

assert.equal(safeFilename('Veyra: Bloom'), 'Veyra- Bloom.veyra');
assert.equal(safeFilename('mark.svg', '.svg'), 'mark.svg');
assert.throws(() => parseVeyra('{broken'), /Invalid Veyra JSON/);

// Test: timeline work area (workStart/workEnd) schema
{
  // The factory defaults keep the legacy full-duration playback range.
  const created = createTimeline({ duration: 60 });
  assert.equal(created.workStart, 0);
  assert.equal(created.workEnd, 60);

  // A v3 timeline omitting both fields normalizes to the legacy range.
  const legacy = normalizeDocument(createDocument({
    timelines: [{ id: 'tl_legacy_work', name: 'Legacy Work', duration: 60, fps: 30, loop: 'none', tracks: [] }],
  }));
  assert.equal(legacy.timelines[0].workStart, 0);
  assert.equal(legacy.timelines[0].workEnd, 60);

  // Explicit valid values survive normalization and canonical serialization.
  const explicit = normalizeDocument(createDocument({
    timelines: [createTimeline({ id: 'tl_explicit_work', duration: 60, workStart: 10, workEnd: 20 })],
  }));
  assert.equal(explicit.timelines[0].workStart, 10);
  assert.equal(explicit.timelines[0].workEnd, 20);
  assert.deepEqual(parseVeyra(serializeVeyra(explicit)).timelines[0], explicit.timelines[0]);

  // The factory rejects invalid supplied work areas immediately.
  assert.throws(() => createTimeline({ duration: 60, workStart: 90 }), /workStart/);
  assert.throws(() => createTimeline({ duration: 60, workStart: 10, workEnd: 10 }), /workEnd/);
}

// Test: invalid work areas are rejected during normalization
{
  const invalidTimeline = (changes) => ({
    id: 'tl_invalid_work',
    name: 'Invalid Work',
    duration: 60,
    fps: 30,
    loop: 'none',
    tracks: [],
    ...changes,
  });
  assert.throws(() => normalizeDocument(createDocument({ timelines: [invalidTimeline({ workStart: -1 })] })), /timelines\[0\]\.workStart/);
  assert.throws(() => normalizeDocument(createDocument({ timelines: [invalidTimeline({ workStart: 10.5 })] })), /timelines\[0\]\.workStart/);
  assert.throws(() => normalizeDocument(createDocument({ timelines: [invalidTimeline({ workEnd: Number.NaN })] })), /timelines\[0\]\.workEnd/);
  assert.throws(() => normalizeDocument(createDocument({ timelines: [invalidTimeline({ workEnd: 61 })] })), /timelines\[0\]\.workEnd/);
  assert.throws(() => normalizeDocument(createDocument({ timelines: [invalidTimeline({ workStart: 20, workEnd: 20 })] })), /workEnd/);
  assert.throws(() => normalizeDocument(createDocument({ timelines: [invalidTimeline({ workStart: 30, workEnd: 20 })] })), /timelines\[0\]\.workEnd/);
}

// Test: store.updateTimeline persists work area markers atomically
{
  const documentWithTimeline = normalizeDocument(createDocument({
    timelines: [createTimeline({ id: 'tl_store_work', name: 'Store Work', duration: 60, fps: 30 })],
  }));
  const workStore = new VeyraStore(documentWithTimeline);
  workStore.updateTimeline('tl_store_work', { workStart: 10, workEnd: 20 }, 'Set work area');
  assert.equal(workStore.document.timelines[0].workStart, 10);
  assert.equal(workStore.document.timelines[0].workEnd, 20);

  assert.throws(
    () => workStore.updateTimeline('tl_store_work', { workStart: 25, workEnd: 15 }, 'Invalid work area'),
    /timelines\[0\]\.workEnd/,
  );
  // The rejected update must roll back atomically to the previous state.
  assert.equal(workStore.document.timelines[0].workStart, 10);
  assert.equal(workStore.document.timelines[0].workEnd, 20);
  workStore.undo();
  assert.equal(workStore.document.timelines[0].workStart, 0);
  assert.equal(workStore.document.timelines[0].workEnd, 60);
}

console.log('veyra model tests passed');
