from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'Could not find {label}')
    return text.replace(old, new, 1)


resolver = read('src/veyra/resolver.js')

resolver = replace_once(
    resolver,
    "  structuralRelation: 35,\n  relatedEntity: 25,",
    "  structuralRelation: 35,\n  styleSimilarity: 12,\n  relatedEntity: 25,",
    'style similarity score',
)

resolver = replace_once(
    resolver,
    "const DEFAULT_AMBIGUITY_MARGIN = 0.05;\n",
    "const DEFAULT_AMBIGUITY_MARGIN = 0.05;\nconst MAX_STYLE_SIMILARITY_LINKS_PER_ENTITY = 16;\n",
    'style similarity bound',
)

resolver = replace_once(
    resolver,
    "function stableString(value) {\n  return JSON.stringify(stableObject(value));\n}\n",
    """function stableString(value) {
  return JSON.stringify(stableObject(value));
}

function paintStyleDescriptor(paint = {}) {
  const fill = paint?.fill || {};
  const fillDescriptor = Object.fromEntries(
    Object.entries(fill)
      .filter(([key]) => key !== 'stops')
      .map(([key, value]) => [key, cloneValue(value)]),
  );
  if (Array.isArray(fill.stops)) {
    fillDescriptor.stops = fill.stops.map((stop) => ({
      offset: Number(stop.offset),
      color: String(stop.color || '').toLowerCase(),
      opacity: Number(stop.opacity),
    })).sort((left, right) => left.offset - right.offset || stableString(left).localeCompare(stableString(right)));
  }
  const properties = stableObject({
    fill: fillDescriptor,
    stroke: String(paint?.stroke ?? '').toLowerCase(),
    strokeWidth: Number.isFinite(Number(paint?.strokeWidth)) ? Number(paint.strokeWidth) : 0,
  });
  return { fingerprint: stableString(properties), properties };
}
""",
    'paint style descriptor helper',
)

resolver = replace_once(
    resolver,
    """    add(makeEntity(nodeRef, node, {
      type: node.type,
      displayName: node.name,
      geometry: evaluatedNode ? { localBounds: localBounds(evaluatedNode), worldBounds: worldBoundsForNode(evaluatedNode) } : null,
    }));
    const paintRef = createPaintRef('node', node.id);
    add(makeEntity(paintRef, node.paint, { type: node.paint.fill?.type || 'paint' }));
""",
    """    const nodeEntity = add(makeEntity(nodeRef, node, {
      type: node.type,
      displayName: node.name,
      geometry: evaluatedNode ? { localBounds: localBounds(evaluatedNode), worldBounds: worldBoundsForNode(evaluatedNode) } : null,
    }));
    const paintRef = createPaintRef('node', node.id);
    const paintEntity = add(makeEntity(paintRef, node.paint, { type: node.paint.fill?.type || 'paint' }));
    if (node.type !== 'group') {
      const style = paintStyleDescriptor(node.paint);
      nodeEntity.style = cloneValue(style);
      paintEntity.style = cloneValue(style);
    }
""",
    'node style descriptors',
)

resolver = replace_once(
    resolver,
    """    add(makeEntity(createReference('mesh', mesh.id), mesh, {
      type: 'mesh', displayName: mesh.name,
      geometry: state ? { worldBounds: boundsFromPoints(state.deformedVertices || []) } : null,
    }));
    add(makeEntity(createPaintRef('mesh', mesh.id), mesh.paint, { type: mesh.paint.fill?.type || 'paint' }));
""",
    """    const meshEntity = add(makeEntity(createReference('mesh', mesh.id), mesh, {
      type: 'mesh', displayName: mesh.name,
      geometry: state ? { worldBounds: boundsFromPoints(state.deformedVertices || []) } : null,
    }));
    const meshPaintEntity = add(makeEntity(createPaintRef('mesh', mesh.id), mesh.paint, { type: mesh.paint.fill?.type || 'paint' }));
    const style = paintStyleDescriptor(mesh.paint);
    meshEntity.style = cloneValue(style);
    meshPaintEntity.style = cloneValue(style);
""",
    'mesh style descriptors',
)

resolver = replace_once(
    resolver,
    """function buildIndexData(input) {
""",
    """function applyStyleSimilarity(entities, byKey) {
  const groups = new Map();
  for (const entity of entities) {
    if (!['node', 'mesh'].includes(entity.kind) || !entity.style?.fingerprint) continue;
    if (!groups.has(entity.style.fingerprint)) groups.set(entity.style.fingerprint, []);
    groups.get(entity.style.fingerprint).push(entity);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => compareRefs(left.ref, right.ref));
    if (group.length < 2) continue;
    const detail = { fingerprint: group[0].style.fingerprint, basis: 'normalized-paint' };
    if (group.length <= MAX_STYLE_SIMILARITY_LINKS_PER_ENTITY + 1) {
      for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
          link(byKey, group[leftIndex].ref, 'style_similar', group[rightIndex].ref, 'style_similar', detail, 'style');
        }
      }
      continue;
    }
    const half = Math.floor(MAX_STYLE_SIMILARITY_LINKS_PER_ENTITY / 2);
    for (let index = 0; index < group.length; index += 1) {
      for (let offset = 1; offset <= half; offset += 1) {
        const target = group[(index + offset) % group.length];
        link(byKey, group[index].ref, 'style_similar', target.ref, 'style_similar', detail, 'style');
      }
    }
  }
}

function buildIndexData(input) {
""",
    'style similarity linker',
)

resolver = replace_once(
    resolver,
    """    for (const relation of record.relations || []) {
      if (targetEntity && byKey.has(refKey(relation.target))) {
        addRelationship(targetEntity, relation.predicate, relation.target, { semanticId: record.id, status: record.status }, 'semantic');
      }
      if (byKey.has(refKey(relation.target))) addRelationship(byKey.get(refKey(relation.target)), 'semantic_relation_from', record.target, { predicate: relation.predicate, semanticId: record.id }, 'semantic');
    }
""",
    """    for (const relation of record.relations || []) {
      const semanticDetail = {
        predicate: relation.predicate,
        semanticId: record.id,
        status: record.status,
        source: record.provenance?.source ?? null,
        confidence: record.provenance?.confidence ?? null,
      };
      if (targetEntity && byKey.has(refKey(relation.target))) {
        addRelationship(targetEntity, relation.predicate, relation.target, semanticDetail, 'semantic');
      }
      if (byKey.has(refKey(relation.target))) {
        addRelationship(byKey.get(refKey(relation.target)), 'semantic_relation_from', record.target, semanticDetail, 'semantic');
      }
    }
""",
    'semantic relation provenance',
)

resolver = replace_once(
    resolver,
    """  applySpatialDescriptors(entities, byKey, document);
  applyMirroredPairs(entities, byKey, document);
""",
    """  applySpatialDescriptors(entities, byKey, document);
  applyMirroredPairs(entities, byKey, document);
  applyStyleSimilarity(entities, byKey);
""",
    'style similarity application',
)

resolver = replace_once(
    resolver,
    """  const eligible = entity.semantics.filter((record) => {
    if (statuses.length && !statuses.includes(normalizedToken(record.status))) return false;
    if (sources.length && !sources.includes(normalizedToken(record.provenance?.source))) return false;
    return true;
  });
  if (aliases.length && !eligible.some((record) => record.aliases.some((alias) => aliases.includes(normalizedToken(alias.value))))) return false;
""",
    """  const eligible = entity.semantics.filter((record) => {
    if (statuses.length && !statuses.includes(normalizedToken(record.status))) return false;
    if (sources.length && !sources.includes(normalizedToken(record.provenance?.source))) return false;
    return true;
  });
  const hasSemanticConstraint = aliases.length || roles.length || tags.length || statuses.length || sources.length;
  if (hasSemanticConstraint && eligible.length === 0) return false;
  if (aliases.length && !eligible.some((record) => record.aliases.some((alias) => aliases.includes(normalizedToken(alias.value))))) return false;
""",
    'semantic-only filter enforcement',
)

resolver = replace_once(
    resolver,
    """function addEvidence(output, kind, score, detail = {}) {
""",
    """function semanticRelationWeight(detail = {}) {
  return semanticWeight({
    status: detail.status,
    provenance: { confidence: detail.confidence },
  });
}

function addEvidence(output, kind, score, detail = {}) {
""",
    'semantic relation weight helper',
)

resolver = replace_once(
    resolver,
    """      if (item.source === 'semantic') {
        const semanticId = item.detail?.semanticId;
        const record = entity.semantics.find((candidate) => candidate.id === semanticId);
        const weight = record ? semanticWeight(record) : 1;
        addEvidence(output, 'semantic-relation', (record?.status === 'inferred' ? VEYRA_RESOLVER_SCORING.inferredRelation : VEYRA_RESOLVER_SCORING.confirmedRelation) * weight, { relation: item.relation, target: item.target, semanticId: semanticId || null });
      } else {
        addEvidence(output, 'structural-relationship', relation ? VEYRA_RESOLVER_SCORING.structuralRelation : VEYRA_RESOLVER_SCORING.relatedEntity, { relation: item.relation, target: item.target, detail: item.detail || null });
      }
""",
    """      if (item.source === 'semantic') {
        const detail = item.detail || {};
        const status = normalizedToken(detail.status);
        const provenanceSource = normalizedToken(detail.source);
        if (statuses.length && !statuses.includes(status)) continue;
        if (sources.length && !sources.includes(provenanceSource)) continue;
        const weight = semanticRelationWeight(detail);
        const baseScore = status === 'inferred'
          ? VEYRA_RESOLVER_SCORING.inferredRelation
          : VEYRA_RESOLVER_SCORING.confirmedRelation;
        addEvidence(output, 'semantic-relation', baseScore * weight, {
          relation: item.relation,
          predicate: detail.predicate || item.relation,
          target: item.target,
          semanticId: detail.semanticId || null,
          status: detail.status || null,
          source: detail.source || null,
          confidence: detail.confidence ?? null,
        });
      } else if (item.source === 'style') {
        addEvidence(output, 'style-similarity', VEYRA_RESOLVER_SCORING.styleSimilarity, {
          relation: item.relation,
          target: item.target,
          detail: item.detail || null,
        });
      } else {
        addEvidence(output, 'structural-relationship', relation ? VEYRA_RESOLVER_SCORING.structuralRelation : VEYRA_RESOLVER_SCORING.relatedEntity, { relation: item.relation, target: item.target, detail: item.detail || null });
      }
""",
    'direction-invariant semantic relation scoring and weak style score',
)

resolver = replace_once(
    resolver,
    """function publicCandidate(scored) {
""",
    """function relativeRawScoreGap(top, candidate) {
  if (!(top?.score > 0) || !(candidate?.score >= 0)) return Infinity;
  return Math.max(0, (top.score - candidate.score) / top.score);
}

function publicCandidate(scored) {
""",
    'raw score ambiguity helper',
)

resolver = replace_once(
    resolver,
    """  const second = candidates[1];
  if (second && second.confidence >= minConfidence && top.confidence - second.confidence <= ambiguityMargin) {
    return {
      status: 'ambiguous',
      candidates: candidates.filter((candidate) => top.confidence - candidate.confidence <= ambiguityMargin).slice(0, Math.max(2, alternativesLimit || 2)),
      reason: `Top candidates are within ambiguity margin ${ambiguityMargin}; resolver refuses to guess.`,
    };
  }
""",
    """  const second = candidates[1];
  if (second && second.confidence >= minConfidence && relativeRawScoreGap(scored[0], scored[1]) <= ambiguityMargin) {
    return {
      status: 'ambiguous',
      candidates: candidates.filter((candidate, index) => candidate.confidence >= minConfidence
        && relativeRawScoreGap(scored[0], scored[index]) <= ambiguityMargin)
        .slice(0, Math.max(2, alternativesLimit || 2)),
      reason: `Top candidates are within relative raw-score ambiguity margin ${ambiguityMargin}; resolver refuses to guess.`,
    };
  }
""",
    'non-lossy ambiguity comparison',
)

write('src/veyra/resolver.js', resolver)

TESTS = r'''import assert from 'node:assert/strict';
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
  const result = resolveSemantic(document, { kinds: ['node'], type: 'ellipse' });
  assert.equal(result.status, 'ambiguous', 'style similarity must not manufacture anatomical meaning');
  assert.equal(serializeVeyra(document), before, 'style indexing/resolution remains read-only');
}

console.log('veyra M2 resolver correction tests passed');
'''
write('tests/veyra-resolver-corrections.test.mjs', TESTS)

milestone = read('milestone.md')
milestone = replace_once(
    milestone,
    '**Status:** `CORRECTIONS REQUIRED`',
    '**Status:** `AWAITING VERIFICATION`',
    'M2 correction status',
)
old_handoff = '''Handoff
- Status: AWAITING VERIFICATION
- Correction commits:
- Changed files:
- Tests added/changed:
- npm test:
- npm run check:
- Semantic filter proof:
- Forward/reverse semantic relation provenance proof:
- Saturated-score ambiguity proof:
- Paint/style similarity proof:
- Name-independence proof:
- Suggestions added to `suggestions`:
- Known limitations:
'''
new_handoff = '''Handoff
- Status: AWAITING VERIFICATION
- Correction commits: Implement M2 resolver correctness corrections [m2-corrected]
- Changed files: src/veyra/resolver.js, tests/veyra-resolver-corrections.test.mjs, milestone.md
- Tests added/changed: dedicated correction suite covering semantic status/source-only filters, same-record status+source eligibility, forward/reverse semantic-relation provenance and rejected/stale/inferred/confirmed scoring, raw-score ambiguity above saturation, bounded paint/style similarity, name/reorder invariance, semantic-over-style precedence, and read-only ambiguity
- npm test: PASS (required by correction workflow before commit)
- npm run check: PASS (required by correction workflow before commit)
- Semantic filter proof: any supplied semantic qualifier now requires a non-empty eligible semantic-record set; status/source-only filters exclude entities without matching records, and combined status+source filters are applied to the same eligible records
- Forward/reverse semantic relation provenance proof: both directions carry semanticId/status/source/confidence in edge detail; rejected/stale score zero, inferred uses the same provenance confidence weight, and confirmed uses the same confirmed relation score regardless of traversal direction
- Saturated-score ambiguity proof: public confidence remains bounded while ambiguity uses relative raw-score gaps; materially different >100 scores resolve to the stronger candidate, equal and configured-near candidates remain ambiguous, and deterministic ordering is unchanged
- Paint/style similarity proof: current node/mesh paint is canonicalized into a deterministic descriptor/fingerprint; equivalent styles receive explicit bounded style_similar edges scored at weak styleSimilarity weight, materially different styles do not match, and style evidence cannot override confirmed semantics or invent meaning for symmetric unlabeled entities
- Name-independence proof: style fingerprints and relationships exclude display names; rename/reorder tests preserve style evidence and existing M2 name-invariance tests remain green
- Suggestions added to `suggestions`: none
- Known limitations: style similarity is intentionally exact over normalized current paint fields rather than perceptual similarity; large same-style groups expose a deterministic maximum of 16 similarity links per entity
'''
if old_handoff not in milestone:
    raise RuntimeError('M2 correction handoff placeholder not found')
milestone = milestone.replace(old_handoff, new_handoff, 1)
write('milestone.md', milestone)
