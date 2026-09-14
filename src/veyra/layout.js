/* Deterministic, dependency-free layout evaluation for the feature graph. */
import { localBounds } from './geometry.js';
import { referenceId } from './references.js';

export const VEYRA_LAYOUT_EVALUATION_MODES = Object.freeze([
  'absolute', 'flex', 'grid', 'stack', 'none',
]);

const EPSILON = 1e-9;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value, min))); }

function length(value, available, fallback = 0) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.endsWith('%')) return available * clamp(Number.parseFloat(text.slice(0, -1)) / 100, -1000, 1000);
    if (text === 'auto' || text === '') return fallback;
  }
  return finite(value, fallback);
}

function padding(value) {
  if (typeof value === 'number') {
    const amount = Math.max(0, finite(value));
    return { top: amount, right: amount, bottom: amount, left: amount };
  }
  const source = value && typeof value === 'object' ? value : {};
  return {
    top: Math.max(0, finite(source.top)),
    right: Math.max(0, finite(source.right)),
    bottom: Math.max(0, finite(source.bottom)),
    left: Math.max(0, finite(source.left)),
  };
}

function dimensions(node, layout, artboard) {
  const bounds = localBounds(node);
  const intrinsicWidth = bounds ? Math.max(0, bounds.maxX - bounds.minX) : Math.max(0, finite(artboard?.width, 0));
  const intrinsicHeight = bounds ? Math.max(0, bounds.maxY - bounds.minY) : Math.max(0, finite(artboard?.height, 0));
  // `auto` keeps the target's intrinsic size while percentages resolve against
  // that same stable reference. This makes imported responsive layouts
  // deterministic even when the target is a group with no geometry of its own.
  const width = Math.max(0, length(layout?.width, intrinsicWidth, intrinsicWidth));
  const height = Math.max(0, length(layout?.height, intrinsicHeight, intrinsicHeight));
  return { width, height };
}

function itemSize(node, item, axis, available = 0) {
  const bounds = localBounds(node);
  const intrinsicWidth = bounds ? Math.max(0, bounds.maxX - bounds.minX) : 0;
  const intrinsicHeight = bounds ? Math.max(0, bounds.maxY - bounds.minY) : 0;
  const basis = item?.basis;
  const basisNumber = typeof basis === 'number' && Number.isFinite(basis)
    ? Math.max(0, basis)
    : typeof basis === 'string' && basis.trim().endsWith('%')
      ? Math.max(0, length(basis, available, 0))
      : null;
  const minWidth = item?.minWidth == null ? 0 : finite(item.minWidth, 0);
  const maxWidth = item?.maxWidth == null ? 100000 : finite(item.maxWidth, 100000);
  const minHeight = item?.minHeight == null ? 0 : finite(item.minHeight, 0);
  const maxHeight = item?.maxHeight == null ? 100000 : finite(item.maxHeight, 100000);
  const width = clamp(item?.width ?? (axis === 'row' && basisNumber != null ? basisNumber : intrinsicWidth), minWidth, maxWidth);
  const height = clamp(item?.height ?? (axis === 'column' && basisNumber != null ? basisNumber : intrinsicHeight), minHeight, maxHeight);
  return { width, height };
}

function axisValue(direction, x, y) { return direction === 'column' ? y : x; }
function setAxis(direction, value, point) {
  if (direction === 'column') point.y = value;
  else point.x = value;
}
function crossValue(direction, x, y) { return direction === 'column' ? x : y; }
function setCross(direction, value, point) {
  if (direction === 'column') point.x = value;
  else point.y = value;
}

function alignOffset(mode, free) {
  if (mode === 'center') return free / 2;
  if (mode === 'end') return free;
  return 0;
}

function justifyOffsets(mode, free, count) {
  if (count <= 0) return { start: 0, gap: 0 };
  if (mode === 'center') return { start: free / 2, gap: 0 };
  if (mode === 'end') return { start: free, gap: 0 };
  if (mode === 'space-between' && count > 1) return { start: 0, gap: free / (count - 1) };
  if (mode === 'space-around') return { start: free / (count * 2), gap: free / count };
  return { start: 0, gap: 0 };
}

function setOverride(overrides, nodeId, point) {
  if (!nodeId || !point) return;
  if (Number.isFinite(point.x)) overrides[`node:${encodeURIComponent(nodeId)}/transform/x`] = point.x;
  if (Number.isFinite(point.y)) overrides[`node:${encodeURIComponent(nodeId)}/transform/y`] = point.y;
}

function itemConstraints(item, container, size, base) {
  const constraints = item?.constraints || {};
  const result = { x: base.x, y: base.y };
  const horizontal = container.width - size.width;
  const vertical = container.height - size.height;
  if (constraints.left !== undefined) result.x = -container.width / 2 + padding(container.padding).left + length(constraints.left, container.width) + size.width / 2;
  if (constraints.right !== undefined) result.x = container.width / 2 - padding(container.padding).right - length(constraints.right, container.width) - size.width / 2;
  if (constraints.centerX !== undefined) result.x = length(constraints.centerX, horizontal, 0) - horizontal / 2;
  if (constraints.top !== undefined) result.y = -container.height / 2 + padding(container.padding).top + length(constraints.top, container.height) + size.height / 2;
  if (constraints.bottom !== undefined) result.y = container.height / 2 - padding(container.padding).bottom - length(constraints.bottom, container.height) - size.height / 2;
  if (constraints.centerY !== undefined) result.y = length(constraints.centerY, vertical, 0) - vertical / 2;
  return result;
}

function layoutAbsolute(layout, entries, container, overrides) {
  for (const { node, item } of entries) {
    const point = itemConstraints(item, container, itemSize(node, item, 'row'), {
      x: finite(node.transform?.x), y: finite(node.transform?.y),
    });
    setOverride(overrides, node.id, point);
  }
}

function layoutStack(layout, entries, container, overrides) {
  const pad = padding(layout.padding);
  const centerX = (pad.left - pad.right) / 2;
  const centerY = (pad.top - pad.bottom) / 2;
  for (const { node } of entries) setOverride(overrides, node.id, { x: centerX, y: centerY });
}

function distributeMain(entries, direction, available, gap) {
  const sizes = entries.map(({ node, item }) => itemSize(node, item, direction, available));
  const main = (size) => direction === 'column' ? size.height : size.width;
  const total = sizes.reduce((sum, size) => sum + main(size), 0) + Math.max(0, entries.length - 1) * gap;
  const free = available - total;
  if (free > EPSILON) {
    const grow = entries.reduce((sum, entry) => sum + Math.max(0, finite(entry.item.grow)), 0);
    if (grow > EPSILON) entries.forEach((entry, index) => {
      const delta = free * Math.max(0, finite(entry.item.grow)) / grow;
      if (direction === 'column') sizes[index].height += delta; else sizes[index].width += delta;
    });
  } else if (free < -EPSILON) {
    const shrink = entries.reduce((sum, entry) => sum + Math.max(0, finite(entry.item.shrink, 1)), 0);
    if (shrink > EPSILON) entries.forEach((entry, index) => {
      const delta = free * Math.max(0, finite(entry.item.shrink, 1)) / shrink;
      if (direction === 'column') sizes[index].height = Math.max(0, sizes[index].height + delta); else sizes[index].width = Math.max(0, sizes[index].width + delta);
    });
  }
  // Flex growth/shrink is bounded by each item's declared min/max contract.
  // A second pass is intentionally conservative: it avoids a redistribution
  // loop while guaranteeing that an authored cap can never be exceeded.
  entries.forEach(({ item }, index) => {
    const minWidth = item?.minWidth == null ? 0 : finite(item.minWidth, 0);
    const maxWidth = item?.maxWidth == null ? 100000 : finite(item.maxWidth, 100000);
    const minHeight = item?.minHeight == null ? 0 : finite(item.minHeight, 0);
    const maxHeight = item?.maxHeight == null ? 100000 : finite(item.maxHeight, 100000);
    sizes[index].width = clamp(sizes[index].width, minWidth, maxWidth);
    sizes[index].height = clamp(sizes[index].height, minHeight, maxHeight);
  });
  return sizes;
}

function layoutFlex(layout, entries, container, overrides) {
  const direction = layout.direction === 'column' ? 'column' : 'row';
  const pad = padding(layout.padding);
  const mainAvailable = Math.max(0, (direction === 'column' ? container.height - pad.top - pad.bottom : container.width - pad.left - pad.right));
  const crossAvailable = Math.max(0, (direction === 'column' ? container.width - pad.left - pad.right : container.height - pad.top - pad.bottom));
  const gap = Math.max(0, finite(layout.gap));
  const ordered = [...entries].sort((a, b) => finite(a.item.order) - finite(b.item.order) || a.node.id.localeCompare(b.node.id));
  const sizes = distributeMain(ordered, direction, mainAvailable, gap);
  const lines = [];
  let current = [];
  let used = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const main = axisValue(direction, sizes[index].width, sizes[index].height);
    const next = current.length ? used + gap + main : main;
    if (layout.wrap && current.length && next > mainAvailable + EPSILON) {
      lines.push({ entries: current, used }); current = []; used = 0;
    }
    current.push({ ...ordered[index], size: sizes[index] });
    used += current.length > 1 ? gap + main : main;
  }
  if (current.length) lines.push({ entries: current, used });
  const crossGap = layout.wrap ? gap : 0;
  const totalCross = lines.reduce((sum, line) => sum + Math.max(...line.entries.map(({ size }) => crossValue(direction, size.width, size.height)), 0), 0) + Math.max(0, lines.length - 1) * crossGap;
  let crossCursor = -crossAvailable / 2 + (direction === 'column' ? pad.left : pad.top);
  if (!layout.wrap) crossCursor = -crossAvailable / 2 + (direction === 'column' ? pad.left : pad.top);
  const crossFree = Math.max(0, crossAvailable - totalCross);
  const lineCrossStart = layout.wrap ? alignOffset(layout.align === 'stretch' ? 'start' : layout.align, crossFree) : 0;
  crossCursor += lineCrossStart;
  for (const line of lines) {
    const lineCross = Math.max(...line.entries.map(({ size }) => crossValue(direction, size.width, size.height)), 0);
    const mainFree = Math.max(0, mainAvailable - line.used);
    const { start, gap: justifiedGap } = justifyOffsets(layout.justify, mainFree, line.entries.length);
    let mainCursor = -mainAvailable / 2 + (direction === 'column' ? pad.top : pad.left) + start;
    for (const { node, item, size } of line.entries) {
      const mainSize = axisValue(direction, size.width, size.height);
      const crossSize = crossValue(direction, size.width, size.height);
      const point = { x: 0, y: 0 };
      setAxis(direction, mainCursor + mainSize / 2, point);
      const align = item.metadata?.align || layout.align;
      const crossFreeForItem = Math.max(0, lineCross - crossSize);
      setCross(direction, crossCursor + lineCross / 2 + (align === 'stretch' ? 0 : alignOffset(align, crossFreeForItem)), point);
      setOverride(overrides, node.id, point);
      mainCursor += mainSize + gap + justifiedGap;
    }
    crossCursor += lineCross + crossGap;
  }
}

function layoutGrid(layout, entries, container, overrides) {
  const pad = padding(layout.padding);
  const columns = Math.max(1, Math.trunc(finite(layout.columns, 1)));
  const rows = Math.max(1, Math.trunc(finite(layout.rows, 1)), Math.ceil(entries.length / columns));
  const gap = Math.max(0, finite(layout.gap));
  const innerWidth = Math.max(0, container.width - pad.left - pad.right);
  const innerHeight = Math.max(0, container.height - pad.top - pad.bottom);
  const cellWidth = Math.max(0, (innerWidth - Math.max(0, columns - 1) * gap) / columns);
  const cellHeight = Math.max(0, (innerHeight - Math.max(0, rows - 1) * gap) / rows);
  const ordered = [...entries].sort((a, b) => finite(a.item.order) - finite(b.item.order) || a.node.id.localeCompare(b.node.id));
  for (let index = 0; index < ordered.length; index += 1) {
    const { node, item } = ordered[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    const size = itemSize(node, item, 'row', cellWidth);
    const xCell = -container.width / 2 + pad.left + cellWidth * column + gap * column;
    const yCell = -container.height / 2 + pad.top + cellHeight * row + gap * row;
    const align = item.metadata?.align || layout.align;
    const justify = item.metadata?.justify || layout.justify;
    const point = {
      x: xCell + cellWidth / 2 + (align === 'stretch' ? 0 : alignOffset(align, Math.max(0, cellWidth - size.width))),
      y: yCell + cellHeight / 2 + (justify === 'stretch' ? 0 : alignOffset(justify, Math.max(0, cellHeight - size.height))),
    };
    setOverride(overrides, node.id, point);
  }
}

function cycleNodes(layouts) {
  const byTarget = new Map();
  for (const layout of layouts) {
    const target = referenceId(layout.target, 'node');
    if (target) byTarget.set(target, layout.id);
  }
  const edges = new Map();
  for (const layout of layouts) {
    const source = referenceId(layout.target, 'node');
    if (!source) continue;
    for (const item of layout.items || []) {
      const target = referenceId(item.target, 'node');
      if (target && byTarget.has(target)) {
        if (!edges.has(source)) edges.set(source, []);
        edges.get(source).push(target);
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const blocked = new Set();
  const visit = (node, path = []) => {
    if (visiting.has(node)) { const index = path.indexOf(node); path.slice(index < 0 ? 0 : index).forEach((id) => blocked.add(id)); return; }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const child of edges.get(node) || []) visit(child, [...path, node]);
    visiting.delete(node); visited.add(node);
  };
  for (const node of edges.keys()) visit(node);
  return blocked;
}

/**
 * Evaluate feature-graph layouts into transient transform overrides. The
 * result is intentionally JSON-safe and can be applied as a normal evaluator
 * layer; the source document is never mutated.
 */
export function evaluateLayouts(document, options = {}) {
  const layouts = Array.isArray(document?.layouts) ? document.layouts.filter((layout) => layout?.enabled !== false) : [];
  const overrides = {};
  const diagnostics = [];
  const stats = { layoutsEvaluated: 0, layoutItemsEvaluated: 0, layoutSkips: 0, layoutCycles: 0 };
  if (!layouts.length || options.includeLayouts === false) return { overrides, diagnostics, stats };
  const nodesById = new Map((document.nodes || []).map((node) => [node.id, node]));
  const blockedTargets = cycleNodes(layouts);
  const ordered = [...layouts].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const layout of ordered) {
    const targetId = referenceId(layout.target, 'node');
    if (targetId && blockedTargets.has(targetId)) {
      stats.layoutCycles += 1; stats.layoutSkips += 1;
      diagnostics.push({ code: 'layout-cycle', layoutId: layout.id, targetId, message: 'Layout cycle skipped fail-closed.' });
      continue;
    }
    const entries = (layout.items || []).map((item) => ({ item, node: nodesById.get(referenceId(item.target, 'node')) })).filter(({ node }) => node);
    if (!entries.length) { stats.layoutSkips += 1; continue; }
    const target = targetId ? nodesById.get(targetId) : null;
    const container = dimensions(target, layout, document.artboard);
    container.padding = layout.padding;
    if (layout.mode === 'none') { stats.layoutSkips += 1; continue; }
    if (layout.mode === 'absolute') layoutAbsolute(layout, entries, container, overrides);
    else if (layout.mode === 'stack') layoutStack(layout, entries, container, overrides);
    else if (layout.mode === 'grid') layoutGrid(layout, entries, container, overrides);
    else layoutFlex(layout, entries, container, overrides);
    stats.layoutsEvaluated += 1;
    stats.layoutItemsEvaluated += entries.length;
  }
  return { overrides, diagnostics, stats };
}
