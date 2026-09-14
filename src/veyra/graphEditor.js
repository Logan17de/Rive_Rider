/* State-machine graph editor primitives. Rendering is a pure SVG string so
 * browser UI, tests, and future native hosts all share the same layout rules. */
import { cloneValue, machineById, machineLayerById, machineStateById, machineTransitionsFrom } from './model.js';
import { referenceId, createReference } from './references.js';

export const VEYRA_GRAPH_NODE_WIDTH = 168;
export const VEYRA_GRAPH_NODE_HEIGHT = 72;
export const VEYRA_GRAPH_SNAP = 8;

function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

export function snapGraphPoint(point, grid = VEYRA_GRAPH_SNAP) {
  const size = Math.max(1, finite(grid, VEYRA_GRAPH_SNAP));
  return { x: Math.round(finite(point?.x) / size) * size, y: Math.round(finite(point?.y) / size) * size };
}

export function graphNodePoint(state, node, { snap = true } = {}) {
  const point = node?.graph || { x: 0, y: 0 };
  const value = { x: finite(point.x), y: finite(point.y) };
  return snap ? snapGraphPoint(value, state.snapGrid) : value;
}

export function graphNodeBounds(state, node) {
  const point = graphNodePoint(state, node, { snap: false });
  return { x: point.x, y: point.y, width: VEYRA_GRAPH_NODE_WIDTH, height: VEYRA_GRAPH_NODE_HEIGHT };
}

export class GraphEditorState {
  #machine = null;
  #layerId = null;
  #selected = null;
  #selection = new Set();
  #pan = { x: 0, y: 0 };
  #zoom = 1;
  #snapGrid = VEYRA_GRAPH_SNAP;
  #drag = null;

  constructor(options = {}) {
    this.#machine = options.machine || null;
    this.#layerId = options.layerId || this.#machine?.layers?.[0]?.id || null;
    this.#pan = { x: finite(options.pan?.x), y: finite(options.pan?.y) };
    this.#zoom = clamp(finite(options.zoom, 1), 0.25, 4);
    this.#snapGrid = Math.max(1, finite(options.snapGrid, VEYRA_GRAPH_SNAP));
  }
  get machine() { return this.#machine; }
  get layer() { return this.#machine?.layers?.find((layer) => layer.id === this.#layerId) || null; }
  get layerId() { return this.#layerId; }
  get zoom() { return this.#zoom; }
  get pan() { return { ...this.#pan }; }
  get snapGrid() { return this.#snapGrid; }
  get selected() { return this.#selected ? cloneValue(this.#selected) : null; }
  get selection() { return [...this.#selection].map((id) => createReference('machineState', id)); }
  setMachine(machine, layerId = null) {
    this.#machine = machine || null;
    this.#layerId = layerId || this.#machine?.layers?.[0]?.id || null;
    this.clearSelection();
    return this;
  }
  setLayer(layerId) {
    if (this.#machine && !this.#machine.layers.some((layer) => layer.id === layerId)) throw new TypeError(`Unknown machine layer ${layerId}.`);
    this.#layerId = layerId;
    this.clearSelection();
    return this;
  }
  select(refOrId, additive = false) {
    const id = typeof refOrId === 'string' ? refOrId : refOrId?.id;
    if (!id || !this.layer?.states?.some((state) => state.id === id)) return false;
    if (!additive) this.#selection.clear();
    this.#selection.add(id);
    this.#selected = createReference('machineState', id);
    return this.#selected;
  }
  selectTransition(refOrId) {
    const id = typeof refOrId === 'string' ? refOrId : refOrId?.id;
    if (!id || !this.layer?.transitions?.some((transition) => transition.id === id)) return false;
    this.#selected = createReference('machineTransition', id);
    this.#selection.clear();
    return this.#selected;
  }
  clearSelection() { this.#selected = null; this.#selection.clear(); }
  panBy(delta) { this.#pan.x += finite(delta?.x); this.#pan.y += finite(delta?.y); return this.pan; }
  setPan(value) { this.#pan = { x: finite(value?.x), y: finite(value?.y) }; return this.pan; }
  zoomAt(factor, anchor = { x: 0, y: 0 }) {
    const next = clamp(this.#zoom * finite(factor, 1), 0.25, 4);
    const ratio = next / this.#zoom;
    this.#pan.x = finite(anchor.x) - (finite(anchor.x) - this.#pan.x) * ratio;
    this.#pan.y = finite(anchor.y) - (finite(anchor.y) - this.#pan.y) * ratio;
    this.#zoom = next;
    return this.#zoom;
  }
  moveState(stateId, point, { snap = true } = {}) {
    const state = this.layer?.states?.find((candidate) => candidate.id === stateId);
    if (!state) return false;
    const graph = snap ? snapGraphPoint(point, this.#snapGrid) : { x: finite(point?.x), y: finite(point?.y) };
    state.graph = graph;
    return graph;
  }
  beginDrag(stateId, point, { additive = false } = {}) {
    if (!this.select(stateId, additive)) return false;
    this.#drag = {
      stateId,
      start: graphNodePoint(this, this.layer.states.find((state) => state.id === stateId), { snap: false }),
      pointer: { x: finite(point?.x), y: finite(point?.y) },
    };
    return true;
  }
  dragTo(point) { if (!this.#drag) return false; const delta = { x: finite(point?.x) - this.#drag.pointer.x, y: finite(point?.y) - this.#drag.pointer.y }; return this.moveState(this.#drag.stateId, { x: this.#drag.start.x + delta.x, y: this.#drag.start.y + delta.y }); }
  endDrag() { const result = this.#drag ? this.layer?.states?.find((state) => state.id === this.#drag.stateId)?.graph || null : null; this.#drag = null; return cloneValue(result); }
  hitTest(point) {
    const candidates = (this.layer?.states || []).map((state) => ({ state, bounds: graphNodeBounds(this, state) })).reverse();
    return candidates.find(({ bounds }) => point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height)?.state?.id || null;
  }
  snapshot() {
    return { format: 'veyra-graph-editor-state', version: 1, machineId: this.#machine?.id || null, layerId: this.#layerId, selected: this.selected, selection: this.selection, pan: this.pan, zoom: this.#zoom, snapGrid: this.#snapGrid };
  }
}

export function createGraphEditorState(options = {}) { return new GraphEditorState(options); }

export function createGraphEditorController(store, options = {}) {
  if (!store || typeof store !== 'object') throw new TypeError('Graph editor controller requires a VeyraStore.');
  const state = options.state || createGraphEditorState({ machine: cloneValue(machineById(store.document, options.machineId || store.document.stateMachines?.[0]?.id)), layerId: options.layerId });
  const refresh = () => state.setMachine(cloneValue(machineById(store.document, state.machine?.id)), state.layerId);
  return {
    state,
    refresh,
    select: (ref, additive) => state.select(ref, additive),
    selectTransition: (ref) => state.selectTransition(ref),
    moveState: (stateId, graph, command = {}) => {
      const machine = state.machine;
      if (!machine) return false;
      const result = store.moveMachineState(machine.id, stateId, graph, command);
      refresh();
      return result;
    },
    addLayer: (overrides, command = {}) => { const id = store.addMachineLayer(state.machine.id, overrides, command); refresh(); return id; },
    removeLayer: (layerId, command = {}) => { const result = store.removeMachineLayer(state.machine.id, layerId, command); refresh(); return result; },
    addState: (overrides, command = {}) => { const id = store.addMachineState(state.machine.id, overrides, command, state.layerId); refresh(); return id; },
    removeState: (stateId, command = {}) => { const result = store.removeMachineState(state.machine.id, stateId, command); refresh(); return result; },
    addTransition: (overrides, command = {}) => { const id = store.addMachineTransition(state.machine.id, overrides, command, state.layerId); refresh(); return id; },
    removeTransition: (transitionId, command = {}) => { const result = store.removeMachineTransition(state.machine.id, transitionId, command); refresh(); return result; },
  };
}

function stateColor(type) {
  return { entry: '#22d3ee', exit: '#fb7185', any: '#facc15', animation: '#ec4899', blend1d: '#a78bfa', directBlend: '#8b5cf6', additiveBlend: '#34d399' }[type] || '#bcaabd';
}
function transitionPath(from, to) {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const dx = Math.max(32, Math.abs(endX - startX) * 0.45);
  return `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
}

/** Render only the graph; no document or runtime mutation occurs. */
export function renderMachineGraphSvg(graphState, options = {}) {
  const layer = graphState.layer || graphState;
  const state = graphState instanceof GraphEditorState ? graphState : createGraphEditorState({ machine: options.machine, layerId: layer.id });
  const nodes = layer.states || [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selected = graphState.selected?.id || null;
  const paths = (layer.transitions || []).map((transition) => {
    const from = byId.get(referenceId(transition.from, 'machineState'));
    const to = byId.get(referenceId(transition.to, 'machineState'));
    if (!from || !to) return '';
    const a = graphNodeBounds(state, from), b = graphNodeBounds(state, to);
    return `<path class="veyra-graph-transition${selected === transition.id ? ' is-selected' : ''}" data-transition-id="${esc(transition.id)}" d="${transitionPath(a, b)}" marker-end="url(#veyra-graph-arrow)"/>`;
  }).join('');
  const cards = nodes.map((node) => {
    const bounds = graphNodeBounds(state, node);
    const color = stateColor(node.type);
    const title = node.type === 'entry' ? 'Entry' : node.type === 'exit' ? 'Exit' : node.type === 'any' ? 'Any' : node.name || node.id;
    const detail = node.type === 'blend1d' ? `1D Blend · ${(node.children || []).length} clips` : node.type === 'directBlend' ? `Direct Blend · ${(node.children || []).length} clips` : node.type === 'additiveBlend' ? `Additive Blend · ${(node.children || []).length} clips` : node.type;
    return `<g class="veyra-graph-state${selected === node.id ? ' is-selected' : ''}" data-state-id="${esc(node.id)}" transform="translate(${bounds.x} ${bounds.y})"><rect width="${bounds.width}" height="${bounds.height}" rx="10" fill="#19111f" stroke="${color}"/><rect width="4" height="${bounds.height}" rx="2" fill="${color}"/><text x="16" y="27" class="veyra-graph-title">${esc(title)}</text><text x="16" y="48" class="veyra-graph-detail">${esc(detail)}</text></g>`;
  }).join('');
  const width = options.width || 1000, height = options.height || 600;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="veyra-machine-graph" viewBox="0 0 ${width} ${height}" role="group" aria-label="State machine graph"><defs><marker id="veyra-graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8Z" fill="#806f83"/></marker></defs><g transform="translate(${graphState.pan?.x || 0} ${graphState.pan?.y || 0}) scale(${graphState.zoom || 1})">${paths}${cards}</g></svg>`;
}
