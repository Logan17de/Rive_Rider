/*
 * Veyra feature graph
 * -------------------
 *
 * The editor started as a vector/rig document and grew a state-machine and
 * data graph.  This module is the common, dependency-free contract for the
 * feature families that make an animation document useful outside the
 * canvas: text, layout, events, accessibility, scripts, shaders, render
 * presets, and interchange metadata.  It deliberately does not import the
 * model so it can be used by importers and AI tooling without creating a
 * module cycle.
 */
import { createReference, normalizeReference, referenceId } from './references.js';

export const VEYRA_FEATURE_VERSION = 8;

export const VEYRA_FEATURE_KINDS = Object.freeze([
  'text', 'textRun', 'textModifier', 'layout', 'layoutItem', 'event',
  'eventAction', 'accessibility', 'script', 'shader', 'renderPreset',
  'interchangeAsset',
]);

export const VEYRA_TEXT_MODIFIER_TYPES = Object.freeze([
  'fill', 'stroke', 'opacity', 'tracking', 'weight', 'size', 'position', 'warp',
]);
export const VEYRA_LAYOUT_MODES = Object.freeze(['absolute', 'flex', 'grid', 'stack', 'none']);
export const VEYRA_LAYOUT_ALIGN = Object.freeze(['start', 'center', 'end', 'stretch', 'space-between', 'space-around']);
export const VEYRA_EVENT_TYPES = Object.freeze([
  'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave',
  'click', 'hover', 'focus', 'blur', 'load', 'complete', 'marker', 'custom',
]);
export const VEYRA_EVENT_ACTION_TYPES = Object.freeze([
  'setProperty', 'setData', 'fireTrigger', 'play', 'pause', 'stop', 'seek',
  'setInput', 'emit', 'navigate', 'script',
]);
export const VEYRA_ACCESSIBILITY_ROLES = Object.freeze([
  'none', 'image', 'button', 'link', 'heading', 'text', 'group', 'slider',
  'checkbox', 'tab', 'tabpanel', 'dialog', 'status',
]);
export const VEYRA_SCRIPT_LANGUAGES = Object.freeze(['javascript', 'typescript', 'lua', 'python', 'custom']);
export const VEYRA_SHADER_LANGUAGES = Object.freeze(['wgsl', 'glsl', 'custom']);
export const VEYRA_RENDER_FORMATS = Object.freeze(['svg', 'png', 'webp', 'gif', 'mp4', 'webm', 'lottie', 'dotlottie']);

const COLLECTIONS = Object.freeze({
  texts: 'text',
  layouts: 'layout',
  events: 'event',
  accessibility: 'accessibility',
  scripts: 'script',
  shaders: 'shader',
  renderPresets: 'renderPreset',
  interchangeAssets: 'interchangeAsset',
});

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

let fallbackId = 0;
function createId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  fallbackId += 1;
  return `${prefix}_${Date.now().toString(36)}_${fallbackId.toString(36)}`;
}

function plain(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  return value;
}

function string(value, path, fallback = '') {
  const next = value == null ? fallback : String(value);
  if (!next && fallback === null) throw new TypeError(`${path} is required.`);
  return next;
}

function finite(value, path, fallback = 0) {
  const next = Number(value ?? fallback);
  if (!Number.isFinite(next)) throw new TypeError(`${path} must be finite.`);
  return next;
}

function bounded(value, path, min, max, fallback) {
  const next = finite(value, path, fallback);
  if (next < min || next > max) throw new RangeError(`${path} must be between ${min} and ${max}.`);
  return next;
}

function bool(value, fallback = false) { return value == null ? fallback : Boolean(value); }

function uniqueId(value, kind) {
  const id = String(value || createId(kind));
  if (!id) throw new TypeError(`${kind}.id is required.`);
  return id;
}

function typed(value, expectedKind, path, { optional = false } = {}) {
  if (value == null && optional) return null;
  const ref = normalizeReference(value, expectedKind, path);
  if (!ref) throw new TypeError(`${path} is required.`);
  return ref;
}

function json(value, path, fallback = null) {
  const next = value === undefined ? fallback : value;
  try { return clone(next); } catch (error) { throw new TypeError(`${path} must be JSON-safe: ${error.message}`); }
}

function normalizeRun(run, index, textPath) {
  plain(run, `${textPath}.runs[${index}]`);
  return {
    id: uniqueId(run.id, 'textRun'),
    text: string(run.text, `${textPath}.runs[${index}].text`),
    fontFamily: string(run.fontFamily, `${textPath}.runs[${index}].fontFamily`, 'Inter'),
    fontSize: bounded(run.fontSize, `${textPath}.runs[${index}].fontSize`, 0.01, 4096, 16),
    fontWeight: bounded(run.fontWeight, `${textPath}.runs[${index}].fontWeight`, 100, 1000, 400),
    lineHeight: bounded(run.lineHeight, `${textPath}.runs[${index}].lineHeight`, 0.01, 100, 1.2),
    letterSpacing: finite(run.letterSpacing, `${textPath}.runs[${index}].letterSpacing`, 0),
    fill: string(run.fill, `${textPath}.runs[${index}].fill`, '#ffffff'),
    stroke: string(run.stroke, `${textPath}.runs[${index}].stroke`, 'none'),
    strokeWidth: bounded(run.strokeWidth, `${textPath}.runs[${index}].strokeWidth`, 0, 4096, 0),
    language: string(run.language, `${textPath}.runs[${index}].language`, 'und'),
    features: json(run.features, `${textPath}.runs[${index}].features`, {}),
  };
}

function normalizeModifier(modifier, index, path) {
  plain(modifier, `${path}.modifiers[${index}]`);
  const type = string(modifier.type, `${path}.modifiers[${index}].type`, null);
  if (!VEYRA_TEXT_MODIFIER_TYPES.includes(type)) throw new TypeError(`${path}.modifiers[${index}].type is unsupported.`);
  return {
    id: uniqueId(modifier.id, 'textModifier'),
    type,
    selector: json(modifier.selector, `${path}.modifiers[${index}].selector`, { kind: 'all' }),
    value: json(modifier.value, `${path}.modifiers[${index}].value`, null),
    enabled: bool(modifier.enabled, true),
  };
}

export function createText(overrides = {}) {
  plain(overrides, 'text');
  const node = overrides.node ?? overrides.nodeId;
  const result = {
    id: uniqueId(overrides.id, 'text'),
    name: string(overrides.name, 'text.name', 'Text'),
    node: node == null ? null : typed(node, 'node', 'text.node'),
    artboard: overrides.artboard == null ? null : typed(overrides.artboard, 'artboard', 'text.artboard'),
    runs: (Array.isArray(overrides.runs) ? overrides.runs : [{ text: string(overrides.content, 'text.content', '') }]).map((run, index) => normalizeRun(run, index, 'text')),
    modifiers: (Array.isArray(overrides.modifiers) ? overrides.modifiers : []).map((modifier, index) => normalizeModifier(modifier, index, 'text')),
    direction: string(overrides.direction, 'text.direction', 'auto'),
    align: string(overrides.align, 'text.align', 'start'),
    wrap: bool(overrides.wrap, true),
    maxWidth: overrides.maxWidth == null ? null : bounded(overrides.maxWidth, 'text.maxWidth', 0.01, 100000, 960),
    autoSize: bool(overrides.autoSize, true),
    metadata: json(overrides.metadata, 'text.metadata', {}),
  };
  if (!['auto', 'ltr', 'rtl'].includes(result.direction)) throw new TypeError('text.direction must be auto, ltr, or rtl.');
  if (!['start', 'center', 'end', 'justify'].includes(result.align)) throw new TypeError('text.align is unsupported.');
  return result;
}

function normalizeLayoutItem(item, index, path) {
  plain(item, `${path}.items[${index}]`);
  const target = typed(item.target ?? item.node ?? item.nodeId, 'node', `${path}.items[${index}].target`);
  const anchors = ['left', 'right', 'top', 'bottom', 'centerX', 'centerY'];
  const constraints = {};
  for (const key of anchors) if (item.constraints?.[key] !== undefined) constraints[key] = json(item.constraints[key], `${path}.items[${index}].constraints.${key}`);
  return {
    id: uniqueId(item.id, 'layoutItem'),
    target,
    order: Number.isFinite(Number(item.order)) ? Math.trunc(Number(item.order)) : index,
    grow: bounded(item.grow, `${path}.items[${index}].grow`, 0, 100000, 0),
    shrink: bounded(item.shrink, `${path}.items[${index}].shrink`, 0, 100000, 1),
    basis: item.basis == null ? 'auto' : json(item.basis, `${path}.items[${index}].basis`),
    minWidth: item.minWidth == null ? null : bounded(item.minWidth, `${path}.items[${index}].minWidth`, 0, 100000, 0),
    maxWidth: item.maxWidth == null ? null : bounded(item.maxWidth, `${path}.items[${index}].maxWidth`, 0, 100000, 100000),
    minHeight: item.minHeight == null ? null : bounded(item.minHeight, `${path}.items[${index}].minHeight`, 0, 100000, 0),
    maxHeight: item.maxHeight == null ? null : bounded(item.maxHeight, `${path}.items[${index}].maxHeight`, 0, 100000, 100000),
    constraints,
    metadata: json(item.metadata, `${path}.items[${index}].metadata`, {}),
  };
}

export function createLayout(overrides = {}) {
  plain(overrides, 'layout');
  const mode = string(overrides.mode, 'layout.mode', 'absolute');
  if (!VEYRA_LAYOUT_MODES.includes(mode)) throw new TypeError(`layout.mode must be one of ${VEYRA_LAYOUT_MODES.join(', ')}.`);
  const align = string(overrides.align, 'layout.align', 'start');
  const justify = string(overrides.justify, 'layout.justify', 'start');
  if (!VEYRA_LAYOUT_ALIGN.includes(align) || !VEYRA_LAYOUT_ALIGN.includes(justify)) throw new TypeError('layout align/justify value is unsupported.');
  const target = overrides.target == null && overrides.node == null && overrides.nodeId == null
    ? null : typed(overrides.target ?? overrides.node ?? overrides.nodeId, 'node', 'layout.target');
  return {
    id: uniqueId(overrides.id, 'layout'),
    name: string(overrides.name, 'layout.name', 'Layout'),
    artboard: overrides.artboard == null ? null : typed(overrides.artboard, 'artboard', 'layout.artboard'),
    target,
    mode,
    width: json(overrides.width, 'layout.width', 'auto'),
    height: json(overrides.height, 'layout.height', 'auto'),
    gap: bounded(overrides.gap, 'layout.gap', 0, 100000, 0),
    padding: json(overrides.padding, 'layout.padding', { top: 0, right: 0, bottom: 0, left: 0 }),
    align,
    justify,
    columns: Number.isFinite(Number(overrides.columns)) ? Math.max(1, Math.trunc(Number(overrides.columns))) : 1,
    rows: Number.isFinite(Number(overrides.rows)) ? Math.max(1, Math.trunc(Number(overrides.rows))) : 1,
    wrap: bool(overrides.wrap, false),
    enabled: bool(overrides.enabled, true),
    items: (Array.isArray(overrides.items) ? overrides.items : []).map((item, index) => normalizeLayoutItem(item, index, 'layout')),
    metadata: json(overrides.metadata, 'layout.metadata', {}),
  };
}

function normalizeEventAction(action, index, path) {
  plain(action, `${path}.actions[${index}]`);
  const type = string(action.type, `${path}.actions[${index}].type`, null);
  if (!VEYRA_EVENT_ACTION_TYPES.includes(type)) throw new TypeError(`${path}.actions[${index}].type is unsupported.`);
  return {
    id: uniqueId(action.id, 'eventAction'),
    type,
    target: action.target == null ? null : json(action.target, `${path}.actions[${index}].target`),
    value: json(action.value, `${path}.actions[${index}].value`, null),
    params: json(action.params, `${path}.actions[${index}].params`, {}),
    once: bool(action.once, false),
    enabled: bool(action.enabled, true),
  };
}

export function createEvent(overrides = {}) {
  plain(overrides, 'event');
  const type = string(overrides.type, 'event.type', null);
  if (!VEYRA_EVENT_TYPES.includes(type)) throw new TypeError(`event.type must be one of ${VEYRA_EVENT_TYPES.join(', ')}.`);
  const target = overrides.target == null ? null : typed(overrides.target, String(overrides.target?.kind || 'node'), 'event.target');
  return {
    id: uniqueId(overrides.id, 'event'),
    name: string(overrides.name, 'event.name', 'Event'),
    type,
    target,
    artboard: overrides.artboard == null ? null : typed(overrides.artboard, 'artboard', 'event.artboard'),
    event: overrides.event == null ? null : string(overrides.event, 'event.event', ''),
    marker: overrides.marker == null ? null : string(overrides.marker, 'event.marker', ''),
    payload: json(overrides.payload, 'event.payload', null),
    actions: (Array.isArray(overrides.actions) ? overrides.actions : []).map((action, index) => normalizeEventAction(action, index, 'event')),
    enabled: bool(overrides.enabled, true),
    metadata: json(overrides.metadata, 'event.metadata', {}),
  };
}

export function createAccessibility(overrides = {}) {
  plain(overrides, 'accessibility');
  const role = string(overrides.role, 'accessibility.role', 'none');
  if (!VEYRA_ACCESSIBILITY_ROLES.includes(role)) throw new TypeError(`accessibility.role must be one of ${VEYRA_ACCESSIBILITY_ROLES.join(', ')}.`);
  return {
    id: uniqueId(overrides.id, 'accessibility'),
    target: typed(overrides.target ?? overrides.node ?? overrides.nodeId, 'node', 'accessibility.target'),
    role,
    label: string(overrides.label, 'accessibility.label', ''),
    description: string(overrides.description, 'accessibility.description', ''),
    language: string(overrides.language, 'accessibility.language', 'und'),
    hidden: bool(overrides.hidden, false),
    focusable: bool(overrides.focusable, false),
    tabIndex: Number.isFinite(Number(overrides.tabIndex)) ? Math.trunc(Number(overrides.tabIndex)) : null,
    live: ['off', 'polite', 'assertive'].includes(overrides.live) ? overrides.live : 'off',
    actions: json(overrides.actions, 'accessibility.actions', []),
    metadata: json(overrides.metadata, 'accessibility.metadata', {}),
  };
}

export function createScript(overrides = {}) {
  plain(overrides, 'script');
  const language = string(overrides.language, 'script.language', 'javascript');
  if (!VEYRA_SCRIPT_LANGUAGES.includes(language)) throw new TypeError(`script.language must be one of ${VEYRA_SCRIPT_LANGUAGES.join(', ')}.`);
  return {
    id: uniqueId(overrides.id, 'script'),
    name: string(overrides.name, 'script.name', 'Script'),
    language,
    source: string(overrides.source, 'script.source', ''),
    enabled: bool(overrides.enabled, true),
    sandbox: bool(overrides.sandbox, true),
    inputs: json(overrides.inputs, 'script.inputs', []),
    outputs: json(overrides.outputs, 'script.outputs', []),
    triggers: json(overrides.triggers, 'script.triggers', []),
    target: overrides.target == null ? null : json(overrides.target, 'script.target'),
    metadata: json(overrides.metadata, 'script.metadata', {}),
  };
}

export function createShader(overrides = {}) {
  plain(overrides, 'shader');
  const language = string(overrides.language, 'shader.language', 'wgsl');
  if (!VEYRA_SHADER_LANGUAGES.includes(language)) throw new TypeError(`shader.language must be one of ${VEYRA_SHADER_LANGUAGES.join(', ')}.`);
  return {
    id: uniqueId(overrides.id, 'shader'),
    name: string(overrides.name, 'shader.name', 'Shader'),
    language,
    source: string(overrides.source, 'shader.source', ''),
    enabled: bool(overrides.enabled, true),
    uniforms: json(overrides.uniforms, 'shader.uniforms', []),
    textures: json(overrides.textures, 'shader.textures', []),
    target: overrides.target == null ? null : json(overrides.target, 'shader.target'),
    metadata: json(overrides.metadata, 'shader.metadata', {}),
  };
}

export function createRenderPreset(overrides = {}) {
  plain(overrides, 'renderPreset');
  const format = string(overrides.format, 'renderPreset.format', 'svg');
  if (!VEYRA_RENDER_FORMATS.includes(format)) throw new TypeError(`renderPreset.format must be one of ${VEYRA_RENDER_FORMATS.join(', ')}.`);
  return {
    id: uniqueId(overrides.id, 'renderPreset'),
    name: string(overrides.name, 'renderPreset.name', 'Render Preset'),
    format,
    width: bounded(overrides.width, 'renderPreset.width', 1, 100000, 960),
    height: bounded(overrides.height, 'renderPreset.height', 1, 100000, 640),
    fps: bounded(overrides.fps, 'renderPreset.fps', 1, 240, 30),
    duration: bounded(overrides.duration, 'renderPreset.duration', 0, 1000000, 0),
    loop: bool(overrides.loop, false),
    transparent: bool(overrides.transparent, false),
    background: string(overrides.background, 'renderPreset.background', '#00000000'),
    quality: bounded(overrides.quality, 'renderPreset.quality', 0, 1, 0.9),
    scale: bounded(overrides.scale, 'renderPreset.scale', 0.01, 100, 1),
    metadata: json(overrides.metadata, 'renderPreset.metadata', {}),
  };
}

export function createInterchangeAsset(overrides = {}) {
  plain(overrides, 'interchangeAsset');
  const format = string(overrides.format, 'interchangeAsset.format', null).toLowerCase();
  if (!['lottie', 'dotlottie', 'rive', 'veyra'].includes(format)) throw new TypeError('interchangeAsset.format must be lottie, dotlottie, rive, or veyra.');
  return {
    id: uniqueId(overrides.id, 'interchangeAsset'),
    format,
    version: string(overrides.version, 'interchangeAsset.version', '1'),
    sourceUri: overrides.sourceUri == null ? null : string(overrides.sourceUri, 'interchangeAsset.sourceUri', ''),
    sourceHash: overrides.sourceHash == null ? null : string(overrides.sourceHash, 'interchangeAsset.sourceHash', ''),
    externalId: overrides.externalId == null ? null : string(overrides.externalId, 'interchangeAsset.externalId', ''),
    importedAt: overrides.importedAt == null ? null : string(overrides.importedAt, 'interchangeAsset.importedAt', ''),
    unsupported: json(overrides.unsupported, 'interchangeAsset.unsupported', []),
    extensions: json(overrides.extensions, 'interchangeAsset.extensions', {}),
  };
}

const CREATORS = Object.freeze({ text: createText, layout: createLayout, event: createEvent, accessibility: createAccessibility, script: createScript, shader: createShader, renderPreset: createRenderPreset, interchangeAsset: createInterchangeAsset });

export function createFeatureRecord(kind, overrides = {}) {
  if (!VEYRA_FEATURE_KINDS.includes(kind)) throw new TypeError(`Unsupported Veyra feature kind: ${kind}.`);
  if (kind === 'textRun') return normalizeRun(overrides, 0, 'text');
  if (kind === 'textModifier') return normalizeModifier(overrides, 0, 'text');
  if (kind === 'layoutItem') return normalizeLayoutItem(overrides, 0, 'layout');
  if (kind === 'eventAction') return normalizeEventAction(overrides, 0, 'event');
  return CREATORS[kind](overrides);
}

export function featureRef(kind, id) { return createReference(kind, id); }

function normalizeCollection(input, collection, kind) {
  if (input == null) return null;
  if (!Array.isArray(input)) throw new TypeError(`${collection} must be an array.`);
  const ids = new Set();
  const result = input.map((value) => createFeatureRecord(kind, value));
  for (const item of result) {
    if (ids.has(item.id)) throw new TypeError(`Duplicate ${kind} id ${item.id}.`);
    ids.add(item.id);
  }
  return result;
}

function validateTargetRefs(document, collections) {
  const nodeIds = new Set((document?.nodes || []).map((item) => item.id));
  const artboardIds = new Set((document?.artboards || []).map((item) => item.id));
  const validate = (ref, expected, path) => {
    if (!ref) return;
    if (expected === 'node' && !nodeIds.has(ref.id)) throw new TypeError(`${path} references missing node ${ref.id}.`);
    if (expected === 'artboard' && !artboardIds.has(ref.id)) throw new TypeError(`${path} references missing artboard ${ref.id}.`);
  };
  for (const text of collections.texts || []) { validate(text.node, 'node', `text:${text.id}.node`); validate(text.artboard, 'artboard', `text:${text.id}.artboard`); }
  for (const layout of collections.layouts || []) { validate(layout.target, 'node', `layout:${layout.id}.target`); validate(layout.artboard, 'artboard', `layout:${layout.id}.artboard`); for (const item of layout.items) validate(item.target, 'node', `layoutItem:${item.id}.target`); }
  for (const event of collections.events || []) { validate(event.target?.kind === 'node' ? event.target : null, 'node', `event:${event.id}.target`); validate(event.artboard, 'artboard', `event:${event.id}.artboard`); }
  for (const item of collections.accessibility || []) validate(item.target, 'node', `accessibility:${item.id}.target`);
}

/** Normalize optional feature collections without changing legacy document bytes. */
export function normalizeFeatureGraphDocument(input, document) {
  const collections = {};
  let hasFeatures = false;
  for (const [collection, kind] of Object.entries(COLLECTIONS)) {
    const normalized = normalizeCollection(input?.[collection], collection, kind);
    if (normalized !== null) { collections[collection] = normalized; hasFeatures = true; }
  }
  if (!hasFeatures) {
    return input?.featureVersion == null ? document : { ...document, featureVersion: Number(input.featureVersion) || VEYRA_FEATURE_VERSION };
  }
  validateTargetRefs(document, { ...Object.fromEntries(Object.keys(COLLECTIONS).map((key) => [key, collections[key] || []])) });
  // Feature collections are an additive capability layer. Keep the core
  // project version at the layered-machine v7 contract so existing readers
  // and saved projects remain compatible; featureVersion advertises the
  // richer graph independently.
  return { ...document, ...collections, version: Number(document.version || 0), featureVersion: VEYRA_FEATURE_VERSION };
}

export function featureCollections(document) {
  return Object.fromEntries(Object.keys(COLLECTIONS).map((collection) => [collection, document?.[collection] || []]));
}

export function featureRecords(document) {
  const collections = featureCollections(document);
  const records = Object.entries(COLLECTIONS).flatMap(([collection, kind]) => (collections[collection] || []).flatMap((record) => {
    const root = [{ kind, ref: featureRef(kind, record.id), type: record.type || kind, record }];
    if (kind === 'text') {
      root.push(...(record.runs || []).map((child) => ({ kind: 'textRun', ref: featureRef('textRun', child.id), type: 'textRun', owner: featureRef('text', record.id), record: child })));
      root.push(...(record.modifiers || []).map((child) => ({ kind: 'textModifier', ref: featureRef('textModifier', child.id), type: child.type, owner: featureRef('text', record.id), record: child })));
    }
    if (kind === 'layout') root.push(...(record.items || []).map((child) => ({ kind: 'layoutItem', ref: featureRef('layoutItem', child.id), type: 'layoutItem', owner: featureRef('layout', record.id), record: child })));
    if (kind === 'event') root.push(...(record.actions || []).map((child) => ({ kind: 'eventAction', ref: featureRef('eventAction', child.id), type: child.type, owner: featureRef('event', record.id), record: child })));
    return root;
  }));
  return records.sort((left, right) => left.kind.localeCompare(right.kind) || left.ref.id.localeCompare(right.ref.id));
}

export function featureById(document, kind, id) {
  for (const [collection, collectionKind] of Object.entries(COLLECTIONS)) {
    if (collectionKind !== kind) continue;
    return (document?.[collection] || []).find((item) => item.id === String(id)) || null;
  }
  const nested = kind === 'textRun' || kind === 'textModifier'
    ? (document?.texts || []).flatMap((text) => kind === 'textRun' ? text.runs || [] : text.modifiers || [])
    : kind === 'layoutItem'
      ? (document?.layouts || []).flatMap((layout) => layout.items || [])
      : kind === 'eventAction'
        ? (document?.events || []).flatMap((event) => event.actions || [])
        : [];
  return nested.find((item) => item.id === String(id)) || null;
}

export function featureGraphSummary(document) {
  const collections = featureCollections(document);
  const counts = Object.fromEntries(Object.keys(COLLECTIONS).map((collection) => [collection, collections[collection].length]));
  counts.textRuns = (collections.texts || []).reduce((total, item) => total + (item.runs || []).length, 0);
  counts.textModifiers = (collections.texts || []).reduce((total, item) => total + (item.modifiers || []).length, 0);
  counts.layoutItems = (collections.layouts || []).reduce((total, item) => total + (item.items || []).length, 0);
  counts.eventActions = (collections.events || []).reduce((total, item) => total + (item.actions || []).length, 0);
  const records = featureRecords(document);
  return {
    format: 'veyra-feature-graph-summary',
    version: 1,
    featureVersion: Number(document?.featureVersion || 0),
    capabilities: [
      ...(counts.texts ? ['text.rich-runs', 'text.modifiers'] : []),
      ...(counts.layouts ? ['layout.flex-grid', 'layout.constraints'] : []),
      ...(counts.events ? ['events.unified-actions'] : []),
      ...(counts.accessibility ? ['accessibility.semantics', 'accessibility.keyboard'] : []),
      ...(counts.scripts ? ['scripting.sandboxed-contract'] : []),
      ...(counts.shaders ? ['shaders.wgsl'] : []),
      ...(counts.renderPresets ? ['render.queue-presets'] : []),
      ...(counts.interchangeAssets ? ['interchange.audit-trail'] : []),
    ],
    counts,
    records: records.map(({ kind, ref, type, record }) => ({ ref, kind, type, name: record.name || null, enabled: record.enabled ?? true })),
  };
}

export function featureCollectionForKind(kind) {
  return Object.entries(COLLECTIONS).find(([, value]) => value === kind)?.[0] || null;
}

export function validateFeatureGraph(document) {
  const normalized = normalizeFeatureGraphDocument(document, document);
  return normalized === document ? document : normalized;
}

export { COLLECTIONS as VEYRA_FEATURE_COLLECTIONS };
