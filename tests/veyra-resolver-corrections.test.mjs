import assert from 'node:assert/strict';
import {
  createDocument,
  createNode,
  createSemanticRecord,
  createSolidFill,
  normalizeDocument,
} from '../src/veyra/model.js';
import { buildSemanticIndex, queryEntities, resolveSemantic, VEYRA_RESOLVER_SCORING } from '../src/veyra/resolver.js';
import { serializeVeyra } from '../src/veyra/io.js';

function node(id, paint = null, overrides = {}) {
  return createNode('ellipse', {
    id,
    name: overrides.name ?? id,
    transform: overrides.transform || { x: 0, y: 0 },
    geometry: overrides.geometry || { width: 50, height: 30 },
    ...(paint ? { paint } : {}),
    ...(overrides.parent ? { parent: overrides.parent } : {}),
  });
}

function semantic(target, id, { status = 'confirmed', source = 'ai', confidence, alias, role, tags = [], relations = [] } = {}) {
  return createSemanticRecord({ kind: 'node', id: target }, {
    id,
    status,
    provenance: { source, ...(confidence === undefined ? {} : { confidence }) },
    aliases: alias ? [{ namespace: 'test', owner: 'agent', value: alias }] : [],
    canonicalRole: role || '',
    tags,
    relations,
  });
}

// Correction 1A: status/source are real semantic filters and combine on the same eligible record set.
{
  const nodes = ['confirmed_ai', 'inferred_ai', 'confirmed_user', 'no_semantics', 'mixed'].map((id) => node(id));
  const document = normalizeDocument(createDocument({
    id: 'semantic_filter_doc',
    nodes,
    semantics: [
      semantic('confirmed_ai', 'sem_confirmed_ai', { status: 'confirmed', source: 'ai' }),
      semantic('inferred_ai', 'sem_inferred_ai', { status: 'inferred', source: 'ai', confidence: 0.7 }),
      semantic('confirmed_user', 'sem_confirmed_user', { status: 'confirmed', source: 'user' }),
      semantic('mixed', 'sem_mixed_confirmed_user', { status: 'confirmed', source: 'user' }),
      semantic('mixed', 'sem_mixed_inferred_ai', { status: 'inferred', source: 'ai', confidence: 0.8 }),
    ],
  }));

  const confirmed = queryEntities(document, { kinds: ['node'], semantic: { status: 'confirmed' } });
  assert.deepEqual(confirmed.entities.map((entity) => entity.ref.id), ['confirmed_ai', 'confirmed_user', 'mixed']);
  assert.ok(!confirmed.entities.some((entity) => entity.ref.id === 'no_semantics'));

  const ai = queryEntities(document, { kinds: ['node'], semantic: { source: 'ai' } });
  assert.deepEqual(ai.entities.map((entity) => entity.ref.id), ['confirmed_ai', 'inferred_ai', 'mixed']);
  assert.ok(!ai.entities.some((entity) => entity.ref.id === 'no_semantics'));

  const confirmedAi = queryEntities(document, { kinds: ['node'], semantic: { status: 'confirmed', source: 'ai' } });
  assert.deepEqual(confirmedAi.entities.map((entity) => entity.ref.id), ['confirmed_ai']);
}

function relationDocument(status, confidence = undefined) {
  return normalizeDocument(createDocument({
    id: `relation_${status}_${confidence ?? 'none'}`,
    nodes: [node('relation_source'), node('relation_target')],
    semantics: [semantic('relation_source', `sem_relation_${status}_${confidence ?? 'none'}`, {
      status,
      source: 'ai',
      confidence,
      relations: [{ predicate: 'paired_with', target: { kind: 'node', id: 'relation_target' } }],
    })],
  }));
}

function forwardRelation(document, options = { minConfidence: 0 }) {
  return resolveSemantic(document, {
    kinds: ['node'],
    relatedTo: { kind: 'node', id: 'relation_target' },
    relation: 'paired_with',
  }, options);
}

function reverseRelation(document, options = { minConfidence: 0 }) {
  return resolveSemantic(document, {
    kinds: ['node'],
    relatedTo: { kind: 'node', id: 'relation_source' },
    relation: 'semantic_relation_from',
  }, options);
}

// Correction 1B: semantic relation provenance is direction-invariant.
for (const status of ['rejected', 'stale']) {
  const document = relationDocument(status, 0.9);
  assert.equal(forwardRelation(document).status, 'notFound', `${status} forward relation must contribute zero`);
  assert.equal(reverseRelation(document).status, 'notFound', `${status} reverse relation must contribute zero`);
}

{
  const document = relationDocument('inferred', 0.2);
  const forward = forwardRelation(document);
  const reverse = reverseRelation(document);
  assert.equal(forward.status, 'resolved');
  assert.equal(reverse.status, 'resolved');
  assert.equal(forward.score, VEYRA_RESOLVER_SCORING.inferredRelation * 0.2);
  assert.equal(reverse.score, forward.score);
  assert.deepEqual(
    forward.evidence.find((item) => item.kind === 'semantic-relation').score,
    reverse.evidence.find((item) => item.kind === 'semantic-relation').score,
  );
  const reverseEdge = buildSemanticIndex(document).entities
    .find((entity) => entity.ref.id === 'relation_target').relationships
    .find((item) => item.relation === 'semantic_relation_from');
  assert.equal(reverseEdge.detail.status, 'inferred');
  assert.equal(reverseEdge.detail.source, 'ai');
  assert.equal(reverseEdge.detail.confidence, 0.2);
  assert.match(reverseEdge.detail.semanticId, /^sem_relation_/);
}

{
  const document = relationDocument('confirmed', 0.2);
  const forward = forwardRelation(document);
  const reverse = reverseRelation(document);
  assert.equal(forward.status, 'resolved');
  assert.equal(reverse.status, 'resolved');
  assert.equal(forward.score, VEYRA_RESOLVER_SCORING.confirmedRelation);
  assert.equal(reverse.score, forward.score);
}

// Correction 2: ambiguity uses non-lossy raw-score gaps even when presentation confidence saturates.
function saturationDocument(mode) {
  const semantics = [semantic('strong', `strong_${mode}`, {
    alias: 'focus', role: 'role.focus', tags: ['focus'], status: 'confirmed', source: 'ai',
  })];
  if (mode === 'material') {
    semantics.push(semantic('weak', 'weak_material', { alias: 'focus', tags: ['focus'], status: 'confirmed', source: 'ai' }));
  } else if (mode === 'equal') {
    semantics.push(semantic('weak', 'weak_equal', { alias: 'focus', role: 'role.focus', tags: ['focus'], status: 'confirmed', source: 'ai' }));
  } else if (mode === 'near') {
    semantics.push(
      semantic('weak', 'weak_near_confirmed', { alias: 'focus', role: 'role.focus', status: 'confirmed', source: 'ai' }),
      semantic('weak', 'weak_near_tag', { tags: ['focus'], status: 'inferred', source: 'ai', confidence: 1 }),
    );
  }
  return normalizeDocument(createDocument({ id: `saturation_${mode}`, nodes: [node('strong'), node('weak')], semantics }));
}

const saturationIntent = { kinds: ['node'], alias: 'focus', role: 'role.focus', tags: ['focus'] };
{
  const result = resolveSemantic(saturationDocument('material'), saturationIntent);
  assert.equal(result.status, 'resolved');
  assert.equal(result.target.id, 'strong');
  assert.ok(result.score > 100);
  assert.ok(result.alternatives[0].score > 100);
  assert.equal(result.confidence, 1);
  assert.equal(result.alternatives[0].confidence, 1);
}
{
  const result = resolveSemantic(saturationDocument('equal'), saturationIntent);
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates.map((candidate) => candidate.target.id), ['strong', 'weak']);
}
{
  const document = saturationDocument('near');
  const result = resolveSemantic(document, saturationIntent, { ambiguityMargin: 0.05 });
  assert.equal(result.status, 'ambiguous');
  assert.ok(result.candidates.every((candidate) => candidate.score > 100));
  const repeats = Array.from({ length: 4 }, () => resolveSemantic(document, saturationIntent, { ambiguityMargin: 0.05 }));
  for (const repeated of repeats.slice(1)) assert.deepEqual(repeated, repeats[0]);
}

// Correction 3: normalized paint/style similarity is explicit, deterministic and weak.
const redStyle = { fill: createSolidFill('#ff0000'), stroke: '#111111', strokeWidth: 2 };
const blueStyle = { fill: createSolidFill('#0000ff'), stroke: '#111111', strokeWidth: 2 };
{
  const document = normalizeDocument(createDocument({
    id: 'style_doc',
    nodes: [
      node('style_anchor', redStyle),
      node('style_peer', redStyle),
      node('style_only', redStyle),
      node('semantic_target', blueStyle),
      node('different_style', { fill: createSolidFill('#00ff00'), stroke: '#111111', strokeWidth: 5 }),
    ],
    semantics: [semantic('semantic_target', 'sem_style_winner', { alias: 'winner', status: 'confirmed', source: 'ai' })],
  }));
  const index = buildSemanticIndex(document);
  const anchor = index.entities.find((entity) => entity.ref.id === 'style_anchor');
  const peer = index.entities.find((entity) => entity.ref.id === 'style_peer');
  const different = index.entities.find((entity) => entity.ref.id === 'different_style');
  assert.equal(anchor.style.fingerprint, peer.style.fingerprint);
  assert.notEqual(anchor.style.fingerprint, different.style.fingerprint);
  assert.ok(anchor.relationships.some((item) => item.relation === 'style_similar' && item.target.id === 'style_peer' && item.source === 'style'));
  assert.ok(!anchor.relationships.some((item) => item.relation === 'style_similar' && item.target.id === 'different_style'));

  const renamedReordered = normalizeDocument(createDocument({
    ...document,
    nodes: [...document.nodes].reverse().map((item, indexValue) => ({ ...item, name: `renamed_${indexValue}` })),
  }));
  const renamedAnchor = buildSemanticIndex(renamedReordered).entities.find((entity) => entity.ref.id === 'style_anchor');
  assert.equal(renamedAnchor.style.fingerprint, anchor.style.fingerprint);
  assert.deepEqual(
    renamedAnchor.relationships.filter((item) => item.relation === 'style_similar').map((item) => item.target.id),
    anchor.relationships.filter((item) => item.relation === 'style_similar').map((item) => item.target.id),
  );

  const semanticWins = resolveSemantic(document, {
    kinds: ['node'], alias: 'winner',
    relatedTo: { kind: 'node', id: 'style_anchor' }, relation: 'style_similar',
  }, { minConfidence: 0 });
  assert.equal(semanticWins.status, 'resolved');
  assert.equal(semanticWins.target.id, 'semantic_target');
  assert.ok(semanticWins.score >= VEYRA_RESOLVER_SCORING.confirmedAlias);
  assert.ok(semanticWins.alternatives.some((candidate) => candidate.evidence.some((item) => item.kind === 'style-similarity')));
}

{
  const owner = createNode('group', { id: 'style_owner', name: '' });
  const document = normalizeDocument(createDocument({
    id: 'style_symmetric_doc', artboard: { width: 800, height: 400 },
    nodes: [
      owner,
      node('style_left', redStyle, { name: '', parent: 'style_owner', transform: { x: 300, y: 200 } }),
      node('style_right', redStyle, { name: '', parent: 'style_owner', transform: { x: 500, y: 200 } }),
    ],
  }));
  const index = buildSemanticIndex(document);
  const left = index.entities.find((entity) => entity.ref.id === 'style_left');
  assert.ok(left.relationships.some((item) => item.relation === 'style_similar' && item.target.id === 'style_right'));
  const before = serializeVeyra(document);
  const result = resolveSemantic(document, { kinds: ['node'], type: 'ellipse' }, { minConfidence: 0 });
  assert.equal(result.status, 'ambiguous', 'style similarity must not manufacture anatomical meaning');
  assert.equal(serializeVeyra(document), before, 'style indexing/resolution remains read-only');
}

console.log('veyra M2 resolver correction tests passed');
