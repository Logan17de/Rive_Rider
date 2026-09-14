/* Lottie / dotLottie interchange without a runtime dependency. */
import {
  createAsset,
  createDocument,
  createId,
  createNode,
  createTimeline,
  createTrack,
  normalizeDocument,
  cloneValue,
} from './model.js';
import { createReference, referenceId } from './references.js';
import { createInterchangeAsset, createText, createEvent } from './featureGraph.js';

export const VEYRA_LOTTIE_FORMAT = 'lottie';
export const VEYRA_DOTLOTTIE_FORMAT = 'dotlottie';
export const VEYRA_LOTTIE_VERSION = 1;

function clone(value) { return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
function parseJson(value, path = 'Lottie') {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (error) { throw new SyntaxError(`${path} JSON is invalid: ${error.message}`); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be a JSON object.`);
  return clone(value);
}
function number(value, fallback = 0) { const result = Number(value); return Number.isFinite(result) ? result : fallback; }
function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, number(value, min))); }
function colorFromLottie(value, fallback = '#ffffff') {
  const c = Array.isArray(value) ? value : value?.k;
  if (!Array.isArray(c)) return typeof value === 'string' ? value : fallback;
  const rgb = c.slice(0, 3).map((item) => Math.round(clamp(item) * 255).toString(16).padStart(2, '0'));
  return `#${rgb.join('')}`;
}
function colorToLottie(value, fallback = [1, 1, 1, 1]) {
  const match = /^#?([0-9a-f]{6,8})$/i.exec(String(value || ''));
  if (!match) return fallback;
  const hex = match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).concat(hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1);
}
function propertyValue(property, fallback) {
  if (property == null) return fallback;
  return property.k ?? property;
}
function firstPropertyValue(property, fallback) {
  let value = propertyValue(property, fallback);
  if (Array.isArray(value) && value[0] && typeof value[0] === 'object') value = value[0].s ?? value[0].k ?? value[0].e ?? fallback;
  return value;
}
function transformValue(ks, key, fallback, index = 0) {
  const value = firstPropertyValue(ks?.[key], fallback);
  return Array.isArray(value) ? number(value[index], fallback) : number(value, fallback);
}
function lottieKeyframes(property, convert = (value) => value) {
  if (!property) return [];
  if (property.a !== 1 || !Array.isArray(property.k)) return [{ frame: 0, value: convert(propertyValue(property, 0)) }];
  return property.k.flatMap((keyframe) => {
    if (!keyframe || keyframe.t == null) return [];
    const values = keyframe.s ?? keyframe.k ?? keyframe.e ?? 0;
    return [{ frame: number(keyframe.t), value: convert(Array.isArray(values) && values.length === 1 ? values[0] : values) }];
  });
}
function makeNodeId(layer, index) { return String(layer?.__veyraId || layer?.nm || `layer_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_') || `layer_${index + 1}`; }
function uniqueId(base, used) { let id = base, index = 2; while (used.has(id)) id = `${base}_${index++}`; used.add(id); return id; }

function flattenShapeItems(shapes = []) {
  return (Array.isArray(shapes) ? shapes : []).flatMap((shape) => {
    if (shape?.ty === 'gr') return flattenShapeItems(shape.it);
    return shape ? [shape] : [];
  });
}

function pathGeometryFromLottie(shape, vertexPrefix = 'path') {
  const value = firstPropertyValue(shape?.ks, null);
  if (!value || typeof value !== 'object' || !Array.isArray(value.v)) return null;
  const vertices = value.v.map((point, index) => {
    const x = number(point?.[0]);
    const y = number(point?.[1]);
    const inPoint = value.i?.[index];
    const outPoint = value.o?.[index];
    return {
      id: `${vertexPrefix}_vertex_${index + 1}`,
      x,
      y,
      // Bodymovin stores Bezier tangents relative to each vertex. Veyra uses
      // the same relative handle contract, so keep the authored offsets
      // intact instead of treating the tangent arrays as absolute points.
      inX: inPoint ? number(inPoint[0]) : 0,
      inY: inPoint ? number(inPoint[1]) : 0,
      outX: outPoint ? number(outPoint[0]) : 0,
      outY: outPoint ? number(outPoint[1]) : 0,
      handleMode: (inPoint || outPoint) ? 'detached' : 'straight',
      cornerRadius: 0,
    };
  });
  return { closed: value.c !== false, vertices };
}

function importShapeLayer(layer, index, state) {
  const groupId = uniqueId(makeNodeId(layer, index), state.nodeIds);
  const ks = layer.ks || {};
  const group = createNode('group', {
    id: groupId,
    name: String(layer.nm || `Layer ${index + 1}`),
    // Parent indices are resolved in a second pass. Lottie children can
    // legally appear before their parent in the reverse painter-order walk.
    parent: null,
    visible: layer.hd !== true,
    opacity: clamp(transformValue(ks, 'o', 100) / 100),
    transform: {
      x: transformValue(ks, 'p', 0, 0), y: transformValue(ks, 'p', 0, 1),
      rotation: number(propertyValue(ks.r ?? ks.rz, 0)),
      scaleX: Array.isArray(propertyValue(ks.s, [100, 100])) ? number(propertyValue(ks.s, [100, 100])[0], 100) / 100 : 1,
      scaleY: Array.isArray(propertyValue(ks.s, [100, 100])) ? number(propertyValue(ks.s, [100, 100])[1], 100) / 100 : 1,
    },
  });
  state.nodes.push(group);
  state.layerNodeRefs.set(layer.ind ?? index + 1, createReference('node', groupId));
  if (layer.parent != null) state.layerParents.set(groupId, layer.parent);
  const shapes = flattenShapeItems(layer.shapes);
  let shapeIndex = 0;
  for (const shape of shapes) {
    if (!shape || ['gr', 'fl', 'st', 'tr'].includes(shape.ty)) continue;
    const type = shape.ty === 'rc' ? 'rectangle' : shape.ty === 'el' ? 'ellipse' : shape.ty === 'sr' ? (Number(propertyValue(shape.sy, 1)) === 2 ? 'star' : 'polygon') : shape.ty === 'sh' ? 'path' : null;
    if (!type) { state.unsupported.push({ layer: layer.ind ?? index + 1, shape: shape.ty || 'unknown' }); continue; }
    const nodeId = uniqueId(`${groupId}_${type}_${shapeIndex + 1}`, state.nodeIds);
    const p = propertyValue(shape.p, [0, 0]);
    const s = propertyValue(shape.s, [100, 100]);
    const node = createNode(type, {
      id: nodeId,
      name: String(shape.nm || `${layer.nm || 'Layer'} ${type}`),
      parent: createReference('node', groupId),
      transform: { x: number(p?.[0]), y: number(p?.[1]), rotation: number(propertyValue(shape.r, 0)) },
      geometry: type === 'rectangle' ? { width: number(s?.[0], 100), height: number(s?.[1], 100), cornerRadius: number(propertyValue(shape.r, 0)) }
        : type === 'ellipse' ? { width: number(s?.[0], 100), height: number(s?.[1], 100) }
          : type === 'polygon' ? { radius: number(propertyValue(shape.or, 50), 50), sides: Math.max(3, Math.trunc(number(propertyValue(shape.pt, 6), 6))) }
            : type === 'star' ? { outerRadius: number(propertyValue(shape.or, 88), 88), innerRadius: number(propertyValue(shape.ir, 42), 42), points: Math.max(3, Math.trunc(number(propertyValue(shape.pt, 5), 5))) }
            : pathGeometryFromLottie(shape, nodeId) || undefined,
    });
    const fill = shapes.find((candidate) => candidate?.ty === 'fl');
    const stroke = shapes.find((candidate) => candidate?.ty === 'st');
    if (fill) node.paint.fill = { type: 'solid', color: colorFromLottie(propertyValue(fill.c, [1, 1, 1, 1])) };
    if (stroke) { node.paint.stroke = colorFromLottie(propertyValue(stroke.c, [0, 0, 0, 1]), '#000000'); node.paint.strokeWidth = number(propertyValue(stroke.w, 0)); }
    state.nodes.push(node);
    shapeIndex += 1;
  }
  state.addTransformTracks(groupId, ks, layer);
  return group;
}

function importImageLayer(layer, index, state) {
  const nodeId = uniqueId(makeNodeId(layer, index), state.nodeIds);
  const assetId = layer.refId ? `asset_lottie_${layer.refId}` : null;
  const asset = assetId ? state.assetRecords.get(assetId) : null;
  if (assetId && !asset) state.unsupported.push({ layer: layer.ind ?? index + 1, type: 'missing-image-asset', refId: layer.refId });
  const imageWidth = number(asset?.w, state.w) > 0 ? number(asset?.w, state.w) : state.w;
  const imageHeight = number(asset?.h, state.h) > 0 ? number(asset?.h, state.h) : state.h;
  const group = createNode('image', {
    id: nodeId,
    name: String(layer.nm || `Image ${index + 1}`),
    parent: null,
    asset: assetId && asset ? createReference('asset', assetId) : null,
    visible: layer.hd !== true,
    opacity: clamp(transformValue(layer.ks || {}, 'o', 100) / 100),
    transform: {
      x: transformValue(layer.ks || {}, 'p', 0, 0), y: transformValue(layer.ks || {}, 'p', 0, 1),
      rotation: number(propertyValue(layer.ks?.r ?? layer.ks?.rz, 0)),
      scaleX: Array.isArray(propertyValue(layer.ks?.s, [100, 100])) ? number(propertyValue(layer.ks.s, [100, 100])[0], 100) / 100 : 1,
      scaleY: Array.isArray(propertyValue(layer.ks?.s, [100, 100])) ? number(propertyValue(layer.ks.s, [100, 100])[1], 100) / 100 : 1,
    },
    geometry: { width: imageWidth, height: imageHeight, fit: 'contain' },
  });
  state.nodes.push(group);
  state.layerNodeRefs.set(layer.ind ?? index + 1, createReference('node', nodeId));
  if (layer.parent != null) state.layerParents.set(nodeId, layer.parent);
  state.addTransformTracks(nodeId, layer.ks || {}, layer);
  return group;
}

function importTextLayer(layer, index, state) {
  const group = importShapeLayer({ ...layer, shapes: [] }, index, state);
  const textData = layer.t?.d?.k?.[0]?.s || layer.t?.d?.k?.[0] || {};
  const text = createText({
    id: uniqueId(`${group.id}_text`, state.featureIds),
    name: String(layer.nm || 'Text'),
    node: createReference('node', group.id),
    content: String(textData.t || ''),
    runs: [{ id: `${group.id}_run_1`, text: String(textData.t || ''), fontFamily: textData.f || 'Inter', fontSize: number(textData.s, 16), fill: colorFromLottie(textData.fc, '#ffffff'), fontWeight: number(textData.fWeight, 400) }],
    metadata: { lottie: { documentData: cloneValue(layer.t) } },
  });
  state.texts.push(text);
  return group;
}

function importLayers(raw, state) {
  const layers = Array.isArray(raw.layers) ? raw.layers : [];
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (layer.ty === 5) importTextLayer(layer, index, state);
    else if (layer.ty === 2) importImageLayer(layer, index, state);
    else if (layer.ty === 4 || layer.ty === 0 || layer.ty === 3) importShapeLayer(layer, index, state);
    else state.unsupported.push({ layer: layer.ind ?? index + 1, type: layer.ty, name: layer.nm || '' });
  }
}

function importMarkers(raw, state) {
  for (const marker of raw.markers || []) {
    const name = String(marker.cm || marker.name || `marker_${marker.tm}`);
    state.events.push(createEvent({
      id: uniqueId(`event_marker_${name}`, state.featureIds), name, type: 'marker', marker: name,
      payload: { frame: number(marker.tm), duration: number(marker.dr) }, actions: [],
    }));
  }
}

function stateForLottie(raw, options = {}) {
  const w = Math.max(1, Math.trunc(number(raw.w, options.width || 960)));
  const h = Math.max(1, Math.trunc(number(raw.h, options.height || 640)));
  const ip = number(raw.ip, 0);
  const op = Math.max(ip + 1, number(raw.op, 60));
  const fps = Math.max(1, number(raw.fr, 30));
  const artboardId = String(options.artboardId || 'artboard_lottie');
  const timelineId = String(options.timelineId || 'timeline_lottie_main');
  const state = {
    nodeIds: new Set(), featureIds: new Set(), layerNodeRefs: new Map(), layerParents: new Map(), nodes: [], texts: [], events: [], unsupported: [],
    assetRecords: new Map((raw.assets || []).filter((asset) => asset?.id).map((asset) => [`asset_lottie_${asset.id}`, asset])),
    timelines: [], addTransformTracks(nodeId, ks, layer) {
      const tracks = [];
      const values = [
        ['x', ks.p, (value) => Array.isArray(value) ? number(value[0]) : number(value)],
        ['y', ks.p, (value) => Array.isArray(value) ? number(value[1]) : number(value)],
        ['scaleX', ks.s, (value) => (Array.isArray(value) ? number(value[0], 100) : number(value, 100)) / 100],
        ['scaleY', ks.s, (value) => (Array.isArray(value) ? number(value[1], 100) : number(value, 100)) / 100],
        ['rotation', ks.r || ks.rz, (value) => number(value)],
        ['opacity', ks.o, (value) => number(value) / 100],
      ];
      for (const [property, source, convert] of values) {
        const frames = lottieKeyframes(source, convert);
        if (!frames.length) continue;
        tracks.push(createTrack(`node:${nodeId}/${property === 'opacity' ? 'opacity' : `transform/${property}`}`, { id: `${timelineId}_${nodeId}_${property}`, keyframes: frames.map((item, index) => ({ id: `${timelineId}_${nodeId}_${property}_${index}`, frame: item.frame - ip, value: item.value })) }));
      }
      state.timelineTracks.push(...tracks);
    },
    timelineTracks: [],
  };
  importLayers(raw, state);
  // Resolve parent links after every layer has registered its stable node ref.
  // Missing parents are retained as bounded import diagnostics instead of
  // silently inventing a hierarchy.
  for (const [nodeId, parentIndex] of state.layerParents) {
    const node = state.nodes.find((candidate) => candidate.id === nodeId);
    const parent = state.layerNodeRefs.get(parentIndex);
    if (node && parent) node.parent = parent;
    else if (node) state.unsupported.push({ layer: nodeId, type: 'missing-parent', parent: parentIndex });
  }
  importMarkers(raw, state);
  state.timelines.push(createTimeline({ id: timelineId, name: String(raw.nm || 'Lottie Animation'), duration: Math.max(1, Math.round(op - ip)), fps, loop: false, tracks: state.timelineTracks }));
  return { w, h, ip, op, fps, artboardId, timelineId, ...state };
}

/** Import a Lottie JSON object/string into a normalized Veyra document. */
export function importLottie(input, options = {}) {
  const raw = parseJson(input, 'Lottie');
  if (raw.v === undefined && !Array.isArray(raw.layers)) throw new TypeError('Lottie input must contain layers.');
  const state = stateForLottie(raw, options);
  const assets = (raw.assets || []).filter((asset) => asset && (asset.p || asset.u || asset.e)).map((asset, index) => createAsset('image', {
    id: `asset_lottie_${asset.id || index + 1}`,
    name: String(asset.nm || asset.id || `Image ${index + 1}`),
    mimeType: 'image/*',
    source: asset.e ? { kind: 'embedded', data: String(asset.p || '') } : { kind: 'external', uri: asset.p ? `${asset.u || ''}${asset.p}` : String(asset.u || '') },
    metadata: { width: number(asset.w, null), height: number(asset.h, null) },
  }));
  const unsupported = state.unsupported.concat((raw.__veyra?.unsupported || []).map(clone));
  const interchange = createInterchangeAsset({ id: `interchange_lottie_${String(raw.nm || 'animation').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, format: 'lottie', version: String(raw.v || 'unknown'), externalId: String(raw.nm || ''), unsupported, extensions: raw.__veyra?.extensions || {} });
  const rawDocument = createDocument({ id: options.documentId || createId('document'), name: String(options.name || raw.nm || 'Imported Lottie'), artboard: { x: 0, y: 0, width: state.w, height: state.h, background: options.background || '#130d17' }, nodes: state.nodes, assets, timelines: state.timelines, texts: state.texts, events: state.events, interchangeAssets: [interchange] });
  const document = normalizeDocument({ ...rawDocument, version: 7, artboards: [{ id: state.artboardId, name: String(raw.nm || 'Main'), x: 0, y: 0, width: state.w, height: state.h, background: options.background || '#130d17' }], nodes: state.nodes.map((node) => ({ ...node, artboard: { kind: 'artboard', id: state.artboardId } })), timelines: state.timelines.map((timeline) => ({ ...timeline, artboard: { kind: 'artboard', id: state.artboardId } })), assets, texts: state.texts.map((text) => ({ ...text, artboard: { kind: 'artboard', id: state.artboardId } })), events: state.events.map((event) => ({ ...event, artboard: { kind: 'artboard', id: state.artboardId } })), interchangeAssets: [interchange] });
  return { document, diagnostics: { unsupported, importedLayers: (raw.layers || []).length, importedNodes: document.nodes.length, importedMarkers: document.events?.length || 0 }, mapping: { artboard: createReference('artboard', state.artboardId), timeline: createReference('timeline', state.timelineId), layers: document.nodes.map((node) => createReference('node', node.id)) } };
}

function staticOrAnimated(values, convert = (value) => value) {
  const frames = values || [];
  if (frames.length <= 1) return { a: 0, k: convert(frames[0]?.value ?? 0) };
  return { a: 1, k: frames.map((item, index) => ({ t: item.frame, s: [convert(item.value)], e: [convert(frames[index + 1]?.value ?? item.value)], i: { x: [0.33], y: [1] }, o: { x: [0.67], y: [0] } })) };
}
function trackFor(document, timeline, nodeId, path) { return timeline?.tracks?.find((track) => track.address === `node:${nodeId}/${path}`) || null; }
function nodeToLottieLayer(document, node, index, timeline, visualIndexById) {
  const transform = node.transform || {};
  const xTrack = trackFor(document, timeline, node.id, 'transform/x');
  const yTrack = trackFor(document, timeline, node.id, 'transform/y');
  const sxTrack = trackFor(document, timeline, node.id, 'transform/scaleX');
  const syTrack = trackFor(document, timeline, node.id, 'transform/scaleY');
  const rTrack = trackFor(document, timeline, node.id, 'transform/rotation');
  const oTrack = trackFor(document, timeline, node.id, 'opacity');
  const p = xTrack || yTrack ? { a: 1, k: [...new Set([...(xTrack?.keyframes || []), ...(yTrack?.keyframes || [])].map((item) => item.frame))].sort((a,b) => a-b).map((frame) => ({ t: frame, s: [xTrack?.keyframes.find((k) => k.frame === frame)?.value ?? transform.x, yTrack?.keyframes.find((k) => k.frame === frame)?.value ?? transform.y, 0], e: [xTrack?.keyframes.find((k) => k.frame === frame)?.value ?? transform.x, yTrack?.keyframes.find((k) => k.frame === frame)?.value ?? transform.y, 0] })) } : { a: 0, k: [transform.x || 0, transform.y || 0, 0] };
  const layer = { ddd: 0, ind: index + 1, ty: node.type === 'image' ? 2 : 4, nm: node.name, ip: 0, op: timeline?.duration || 60, st: 0, sr: 1, ks: {
    o: oTrack ? staticOrAnimated(oTrack.keyframes, (value) => number(value) * 100) : { a: 0, k: number(node.opacity, 1) * 100 },
    p,
    a: { a: 0, k: [0, 0, 0] },
    s: (sxTrack || syTrack) ? { a: 1, k: [...new Set([...(sxTrack?.keyframes || []), ...(syTrack?.keyframes || [])].map((item) => item.frame))].sort((a,b)=>a-b).map((frame) => ({ t: frame, s: [(sxTrack?.keyframes.find((k)=>k.frame===frame)?.value ?? transform.scaleX) * 100, (syTrack?.keyframes.find((k)=>k.frame===frame)?.value ?? transform.scaleY) * 100, 100], e: [(sxTrack?.keyframes.find((k)=>k.frame===frame)?.value ?? transform.scaleX) * 100, (syTrack?.keyframes.find((k)=>k.frame===frame)?.value ?? transform.scaleY) * 100, 100] })) } : { a: 0, k: [number(transform.scaleX, 1) * 100, number(transform.scaleY, 1) * 100, 100] },
    r: rTrack ? staticOrAnimated(rTrack.keyframes, number) : { a: 0, k: number(transform.rotation, 0) },
  }, shapes: [] };
  if (node.type === 'image') {
    const assetId = referenceId(node.asset, 'asset');
    if (assetId) layer.refId = assetId;
    return layer;
  }
  if (node.type === 'group') {
    const parentId = referenceId(node.parent, 'node');
    const parentIndex = visualIndexById?.get(parentId);
    if (parentIndex != null) layer.parent = parentIndex + 1;
    return layer;
  }
  const g = node.geometry;
  // The node transform lives on the Lottie layer. Shape positions therefore
  // stay at the local origin; duplicating x/y here would double-transform a
  // round-tripped shape.
  if (node.type === 'rectangle') layer.shapes.push({ ty: 'rc', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [number(g?.width, 100), number(g?.height, 100)] }, r: { a: 0, k: number(g?.cornerRadius, 0) }, nm: node.name });
  else if (node.type === 'ellipse') layer.shapes.push({ ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [number(g?.width, 100), number(g?.height, 100)] }, nm: node.name });
  else if (node.type === 'polygon') layer.shapes.push({ ty: 'sr', sy: 1, p: { a: 0, k: [0, 0] }, pt: { a: 0, k: number(g?.sides, 6) }, or: { a: 0, k: number(g?.radius, 50) }, nm: node.name });
  else if (node.type === 'star') layer.shapes.push({ ty: 'sr', sy: 2, p: { a: 0, k: [0, 0] }, pt: { a: 0, k: number(g?.points, 5) }, or: { a: 0, k: number(g?.outerRadius, 88) }, ir: { a: 0, k: number(g?.innerRadius, 42) }, nm: node.name });
  else if (node.type === 'path') layer.shapes.push({ ty: 'sh', ks: { a: 0, k: { c: Boolean(g?.closed), v: (g?.vertices || []).map((vertex) => [number(vertex.x), number(vertex.y)]), i: (g?.vertices || []).map((vertex) => [number(vertex.inX), number(vertex.inY)]), o: (g?.vertices || []).map((vertex) => [number(vertex.outX), number(vertex.outY)]) } }, nm: node.name });
  const fill = node.paint?.fill?.type === 'solid' ? node.paint.fill.color : '#ffffff';
  layer.shapes.push({ ty: 'fl', c: { a: 0, k: colorToLottie(fill) }, o: { a: 0, k: 100 }, r: 1, nm: 'Fill' });
  if (node.paint?.stroke && node.paint.stroke !== 'none' && Number(node.paint.strokeWidth) > 0) {
    layer.shapes.push({ ty: 'st', c: { a: 0, k: colorToLottie(node.paint.stroke, [0, 0, 0, 1]) }, o: { a: 0, k: 100 }, w: { a: 0, k: number(node.paint.strokeWidth, 0) }, lc: 2, lj: 2, nm: 'Stroke' });
  }
  if (node.parent) {
    const parentId = referenceId(node.parent, 'node');
    const parentIndex = visualIndexById?.get(parentId);
    if (parentIndex != null) layer.parent = parentIndex + 1;
  }
  return layer;
}

function textToLottieLayer(text, document, index, timeline) {
  const node = document.nodes.find((candidate) => candidate.id === referenceId(text.node, 'node'));
  const run = text.runs?.[0] || {};
  const transform = node?.transform || {};
  return {
    ddd: 0, ind: index + 1, ty: 5, nm: text.name, ip: 0, op: timeline?.duration || 60, st: 0, sr: 1,
    ks: {
      o: { a: 0, k: Number(node?.opacity ?? 1) * 100 },
      p: { a: 0, k: [number(transform.x), number(transform.y), 0] },
      a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] }, r: { a: 0, k: number(transform.rotation, 0) },
    },
    t: { d: { k: [{ s: { t: String(run.text || ''), f: String(run.fontFamily || 'Inter'), s: number(run.fontSize, 16), fc: colorToLottie(run.fill, [1, 1, 1, 1]), fWeight: number(run.fontWeight, 400), j: text.align === 'center' ? 2 : text.align === 'end' ? 1 : 0 }, t: 0 }] } },
    __veyraId: text.id,
  };
}

function assetToLottieAsset(asset) {
  const source = asset.source || {};
  if (source.kind === 'embedded') {
    return { id: asset.id, w: number(asset.metadata?.width, 0), h: number(asset.metadata?.height, 0), e: 1, p: String(source.data || ''), u: '' };
  }
  const uri = String(source.uri || '');
  const slash = Math.max(uri.lastIndexOf('/'), uri.lastIndexOf('\\'));
  const directory = slash >= 0 ? uri.slice(0, slash + 1) : '';
  const path = slash >= 0 ? uri.slice(slash + 1) : uri;
  return { id: asset.id, w: number(asset.metadata?.width, 0), h: number(asset.metadata?.height, 0), e: 0, p: path, u: directory };
}

/** Export a normalized Veyra document as deterministic Lottie JSON. */
export function exportLottie(input, options = {}) {
  const document = normalizeDocument(input);
  const timeline = document.timelines.find((item) => item.id === options.timelineId) || document.timelines[0] || null;
  // Export all authored nodes by default so nested groups, paths and shape
  // children survive a round trip. Hosts that only want painter roots can opt
  // into the compact legacy view with `includeChildren: false`.
  const visualNodes = options.includeChildren === false
    ? document.nodes.filter((node) => !node.parent)
    : document.nodes;
  const visualIndexById = new Map(visualNodes.map((node, index) => [node.id, index]));
  const layers = [
    ...visualNodes.map((node, index) => nodeToLottieLayer(document, node, index, timeline, visualIndexById)),
    ...(document.texts || []).map((text, index) => textToLottieLayer(text, document, visualNodes.length + index, timeline)),
  ];
  const result = { v: String(options.version || '5.7.0'), fr: number(timeline?.fps, 30), ip: number(timeline?.workStart, 0), op: number(timeline?.workEnd, timeline?.duration || 60), w: number(options.width, document.artboard.width), h: number(options.height, document.artboard.height), nm: String(options.name || document.name), ddd: 0, assets: (document.assets || []).filter((asset) => asset.type === 'image').map(assetToLottieAsset), layers: layers.reverse(), markers: (document.events || []).filter((event) => event.type === 'marker').map((event) => ({ tm: number(event.payload?.frame, 0), dr: number(event.payload?.duration, 0), cm: event.marker || event.name })), __veyra: { format: 'veyra-lottie-bridge', version: VEYRA_LOTTIE_VERSION, unsupported: (document.interchangeAssets || []).flatMap((item) => item.unsupported || []), extensions: cloneValue(document.interchangeAssets?.find((item) => item.format === 'lottie')?.extensions || {}) } };
  return options.as === 'string' ? JSON.stringify(result, null, 2) : result;
}

export function serializeLottie(input, options = {}) { return JSON.stringify(exportLottie(input, { ...options, as: undefined }), null, 2); }

/** A JSON-safe dotLottie package representation. Binary ZIP hosting can wrap this object. */
export function exportDotLottie(input, options = {}) {
  const animationId = String(options.animationId || 'animation');
  // The package's animation member is always JSON, even when the caller asks
  // for the outer dotLottie package as a string.
  const animation = exportLottie(input, { ...options, as: undefined });
  const document = normalizeDocument(input);
  const images = Object.fromEntries((document.assets || []).filter((asset) => asset.type === 'image').map((asset) => [asset.id, cloneValue(asset.source)]));
  const packageValue = { manifest: { version: '1.0', activeAnimationId: animationId, animations: [{ id: animationId, path: `animations/${animationId}.json` }], generator: 'veyra' }, animations: { [animationId]: animation }, images, fonts: {}, extensions: { veyra: { documentId: document.id, featureVersion: document.featureVersion || null } } };
  return options.as === 'string' ? JSON.stringify(packageValue, null, 2) : packageValue;
}

export function importDotLottie(input, options = {}) {
  const packageValue = parseJson(input, 'dotLottie');
  const active = options.animationId || packageValue.manifest?.activeAnimationId || Object.keys(packageValue.animations || {})[0];
  let animation = packageValue.animations?.[active] || packageValue.animations?.[`${active}.json`] || packageValue.animation;
  if (!animation) throw new TypeError('dotLottie package does not contain an animation payload.');
  if (typeof animation === 'string') animation = parseJson(animation, 'dotLottie animation');
  // dotLottie keeps image payloads beside animation JSON. If an animation
  // references one without embedding `p/u`, fold the package image record into
  // a temporary Lottie asset so image nodes remain renderable after import.
  if (animation && typeof animation === 'object' && Array.isArray(animation.assets) && packageValue.images && typeof packageValue.images === 'object') {
    animation = { ...animation, assets: animation.assets.map((asset) => {
      if (asset?.p || asset?.u || asset?.e || !packageValue.images[asset.id]) return asset;
      const source = packageValue.images[asset.id];
      if (typeof source === 'string') return { ...asset, e: 1, p: source, u: '' };
      if (source?.kind === 'embedded') return { ...asset, e: 1, p: source.data || '', u: '' };
      if (source?.kind === 'external') return { ...asset, e: 0, p: source.uri || '', u: '' };
      return asset;
    }) };
  }
  return importLottie(animation, { ...options, name: options.name || packageValue.manifest?.name || active });
}
