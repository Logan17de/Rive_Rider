from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Renderer: persistent Pen gestures, multi-selection overlays, stable vertex ids
# ---------------------------------------------------------------------------
p = Path('src/veyra/renderer.js')
t = p.read_text()
t = replace_once(t,
"""  paintServerId,
  transformAttribute,""",
"""  paintServerId,
  pathData,
  transformAttribute,""",
'renderer pathData import')
t = replace_once(t,
"""    this.selectedRef = null;
    this.dragging = false;""",
"""    this.selectedRef = null;
    this.selectedRefs = [];
    this.overlayVisibility = { selection: true, vertices: true, rig: true, guides: true };
    this.dragging = false;""",
'renderer selection state')
t = replace_once(t,
"""  setDraftPath(points = []) {
    this.draftPath = points.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    if (this.scene && !this.dragging) this.render(this.scene, this.selectedRef);
  }
""",
"""  setDraftPath(points = []) {
    this.draftPath = points.map((point) => ({
      ...point,
      x: Number(point.x), y: Number(point.y),
      inX: Number(point.inX || 0), inY: Number(point.inY || 0),
      outX: Number(point.outX || 0), outY: Number(point.outY || 0),
      handleMode: point.handleMode || 'straight',
      cornerRadius: Math.max(0, Number(point.cornerRadius || 0)),
    }));
    if (this.scene && !this.dragging) this.render(this.scene, this.selectedRef, this.selectedRefs);
  }

  setOverlayVisibility(next = {}) {
    this.overlayVisibility = { ...this.overlayVisibility, ...Object.fromEntries(Object.entries(next).map(([key, value]) => [key, Boolean(value)])) };
    if (this.scene && !this.dragging) this.render(this.scene, this.selectedRef, this.selectedRefs);
    return { ...this.overlayVisibility };
  }

  getOverlayVisibility() { return { ...this.overlayVisibility }; }
""",
'renderer draft/overlay API')
t = replace_once(t,
"""  render(scene, selectedRef = null) {""",
"""  render(scene, selectedRef = null, selectedRefs = null) {""",
'render signature')
t = replace_once(t,
"""    this.selectedRef = typeof selectedRef === 'string'
      ? { kind: 'node', id: selectedRef }
      : selectedRef;
    this.#applyViewBox();""",
"""    this.selectedRef = typeof selectedRef === 'string'
      ? { kind: 'node', id: selectedRef }
      : selectedRef;
    const supplied = Array.isArray(selectedRefs) ? selectedRefs : (this.selectedRef ? [this.selectedRef] : []);
    const seen = new Set();
    this.selectedRefs = supplied.filter((ref) => {
      if (!ref?.kind || !ref?.id) return false;
      const key = `${ref.kind}:${ref.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((ref) => ({ kind: ref.kind, id: ref.id }));
    this.#applyViewBox();""",
'render selected refs')
# pencil background/workspace uses pointer gesture instead of instant click
for anchor in [
"""        this.callbacks.drawPoint?.(this.#screenPoint(event, this.svg));
        return;""",
]:
    # two occurrences, replace both
    if t.count(anchor) < 2:
        raise SystemExit('missing pencil catcher anchors')
    t = t.replace(anchor, """        this.#startPenPoint(event);
        return;""", 2)
# draft render
old = """  #renderDraftPath() {
    const group = svgElement('g', { class: 'draftPath', 'pointer-events': 'none' });
    if (this.draftPath.length > 1) {
      group.appendChild(svgElement('polyline', {
        points: this.draftPath.map((point) => `${point.x},${point.y}`).join(' '),
        fill: 'none', stroke: 'currentColor', 'stroke-width': 2 / this.zoom,
        'vector-effect': 'non-scaling-stroke',
      }));
    }
    for (const point of this.draftPath) {
      group.appendChild(svgElement('circle', { cx: point.x, cy: point.y, r: 4 / this.zoom, fill: 'currentColor' }));
    }
    return group;
  }
"""
new = """  #renderDraftPath() {
    const group = svgElement('g', { class: 'draftPath', 'pointer-events': 'none' });
    if (!this.overlayVisibility.guides) return group;
    if (this.draftPath.length > 1) {
      group.appendChild(svgElement('path', {
        d: pathData({ closed: false, vertices: this.draftPath }),
        fill: 'none', stroke: 'currentColor', 'stroke-width': 2 / this.zoom,
        'vector-effect': 'non-scaling-stroke',
      }));
    }
    for (const point of this.draftPath) {
      if (Math.hypot(point.inX || 0, point.inY || 0) > 0.0001 || Math.hypot(point.outX || 0, point.outY || 0) > 0.0001) {
        group.appendChild(svgElement('line', {
          x1: point.x + (point.inX || 0), y1: point.y + (point.inY || 0),
          x2: point.x + (point.outX || 0), y2: point.y + (point.outY || 0),
          class: 'handleLine', 'stroke-width': 1 / this.zoom,
        }));
      }
      group.appendChild(svgElement('circle', { cx: point.x, cy: point.y, r: 4 / this.zoom, fill: 'currentColor' }));
    }
    return group;
  }
"""
t = replace_once(t, old, new, 'draft path renderer')
# selection condition
old = """    if (this.selectedRef?.kind === 'node' && node.id === this.selectedRef.id) this.#appendSelection(group, node, children);
    return group;"""
new = """    const selected = this.selectedRefs.some((ref) => ref.kind === 'node' && ref.id === node.id);
    const primary = this.selectedRef?.kind === 'node' && node.id === this.selectedRef.id;
    if (selected && this.overlayVisibility.selection) this.#appendSelection(group, node, children, primary);
    return group;"""
t = replace_once(t, old, new, 'multi selection render')
# rig overlay hide
old = """  #renderRigOverlay() {
    const overlay = svgElement('g', { class: 'rigOverlay' });
    if (!shouldShowDetailedRigOverlay(this.zoom)) {"""
new = """  #renderRigOverlay() {
    const overlay = svgElement('g', { class: 'rigOverlay' });
    if (!this.overlayVisibility.rig) {
      overlay.setAttribute('data-overlay-policy', 'hidden-clean-preview');
      return overlay;
    }
    if (!shouldShowDetailedRigOverlay(this.zoom)) {"""
t = replace_once(t, old, new, 'clean rig overlay')
# appendSelection primary arg + resize/path controls
old = """  #appendSelection(group, node, children) {"""
new = """  #appendSelection(group, node, children, primary = true) {"""
t = replace_once(t, old, new, 'selection primary arg')
t = replace_once(t,
"""      if (node.type === 'group' && !node.locked && this.tool === 'select') {""",
"""      if (primary && node.type === 'group' && !node.locked && this.tool === 'select') {""",
'group hit primary')
t = replace_once(t,
"""      if (node.type !== 'group' && !node.locked && this.tool === 'select') {""",
"""      if (primary && node.type !== 'group' && !node.locked && this.tool === 'select') {""",
'resize primary')
t = replace_once(t,
"""      group.appendChild(svgElement('circle', {
        class: 'originPoint',""",
"""      if (primary) group.appendChild(svgElement('circle', {
        class: 'originPoint',""",
'origin primary')
t = replace_once(t,
"""    if (node.type !== 'path' || node.locked || !['select', 'vertex'].includes(this.tool)) return;
    this.#appendPathControls(group, node);""",
"""    if (!primary || !this.overlayVisibility.vertices || node.type !== 'path' || node.locked || !['select', 'vertex'].includes(this.tool)) return;
    this.#appendPathControls(group, node);""",
'path controls primary')
# Stable vertex IDs and corner radius handle. Replace whole #appendPathControls.
start = t.index("  #appendPathControls(group, node) {")
end = t.index("  #clientPoint(clientX, clientY, coordinateElement) {", start)
new_controls = """  #appendPathControls(group, node) {
    const controls = svgElement('g', { class: 'vertexControls' });
    node.geometry.vertices.forEach((vertex, index) => {
      for (const prefix of ['in', 'out']) {
        const offsetX = Number(vertex[`${prefix}X`]);
        const offsetY = Number(vertex[`${prefix}Y`]);
        if (Math.abs(offsetX) < 0.0001 && Math.abs(offsetY) < 0.0001) continue;
        const handleX = vertex.x + offsetX;
        const handleY = vertex.y + offsetY;
        controls.appendChild(svgElement('line', {
          class: 'handleLine', x1: vertex.x, y1: vertex.y, x2: handleX, y2: handleY,
          'stroke-width': 1 / this.zoom,
        }));
        const handle = svgElement('circle', {
          class: 'bezierHandle', 'data-handle': prefix, 'data-vertex-id': vertex.id,
          cx: handleX, cy: handleY, r: 4 / this.zoom, 'stroke-width': 1 / this.zoom,
        });
        handle.addEventListener('pointerdown', (event) => this.#startHandleDrag(event, node, vertex.id, prefix, group));
        controls.appendChild(handle);
      }
      if ((vertex.handleMode || 'straight') === 'straight') {
        const radiusX = vertex.x + Math.max(Number(vertex.cornerRadius || 0), 14 / this.zoom);
        controls.appendChild(svgElement('line', {
          class: 'cornerRadiusLine', x1: vertex.x, y1: vertex.y, x2: radiusX, y2: vertex.y,
          'stroke-width': 1 / this.zoom,
        }));
        const radiusHandle = svgElement('circle', {
          class: 'cornerRadiusHandle', 'data-vertex-id': vertex.id,
          cx: radiusX, cy: vertex.y, r: 3.5 / this.zoom, 'stroke-width': 1 / this.zoom,
        });
        radiusHandle.addEventListener('pointerdown', (event) => this.#startCornerRadiusDrag(event, node, vertex.id, group));
        controls.appendChild(radiusHandle);
      }
      const point = svgElement('circle', {
        class: 'vertexPoint', 'data-vertex-id': vertex.id, 'data-vertex-index': index,
        cx: vertex.x, cy: vertex.y, r: 5 / this.zoom, 'stroke-width': 2 / this.zoom,
      });
      point.addEventListener('pointerdown', (event) => this.#startVertexDrag(event, node, vertex.id, group));
      controls.appendChild(point);
    });
    group.appendChild(controls);
  }
"""
t = t[:start] + new_controls + t[end:]
# Pen gesture method before clientPoint
anchor = """  #clientPoint(clientX, clientY, coordinateElement) {"""
pen_method = """  #startPenPoint(event) {
    if (event.button !== 0 || this.tool !== 'pencil') return;
    event.preventDefault();
    event.stopPropagation();
    const start = this.#screenPoint(event, this.svg);
    const first = this.draftPath[0];
    if (first && this.draftPath.length >= 2) {
      const client = this.worldToClient(first.x, first.y);
      if (client && Math.hypot(client.x - event.clientX, client.y - event.clientY) <= 8) {
        this.callbacks.finishPath?.({ closed: true });
        return;
      }
    }
    const startClient = { x: event.clientX, y: event.clientY };
    let last = start;
    const guide = svgElement('line', {
      class: 'penGesturePreview', x1: start.x, y1: start.y, x2: start.x, y2: start.y,
      'stroke-width': 1.5 / this.zoom, 'vector-effect': 'non-scaling-stroke',
    });
    this.svg.querySelector(':scope > .draftPath')?.appendChild(guide);
    this.svg.setPointerCapture?.(event.pointerId);
    const cleanup = () => {
      this.svg.removeEventListener('pointermove', move);
      this.svg.removeEventListener('pointerup', end);
      this.svg.removeEventListener('pointercancel', cancel);
      this.svg.removeEventListener('lostpointercapture', cancel);
      guide.remove();
    };
    const move = (nextEvent) => {
      if (nextEvent.pointerId !== event.pointerId) return;
      last = this.#screenPoint(nextEvent, this.svg);
      applyAttributes(guide, { x2: last.x, y2: last.y });
    };
    const end = (nextEvent) => {
      if (nextEvent.pointerId !== event.pointerId) return;
      last = this.#screenPoint(nextEvent, this.svg);
      const dragged = Math.hypot(nextEvent.clientX - startClient.x, nextEvent.clientY - startClient.y) >= 3;
      cleanup();
      try { this.svg.releasePointerCapture?.(event.pointerId); } catch {}
      const dx = last.x - start.x;
      const dy = last.y - start.y;
      this.callbacks.drawVertex?.(dragged
        ? { x: start.x, y: start.y, inX: -dx, inY: -dy, outX: dx, outY: dy, handleMode: 'mirrored', cornerRadius: 0 }
        : { x: start.x, y: start.y, inX: 0, inY: 0, outX: 0, outY: 0, handleMode: 'straight', cornerRadius: 0 });
    };
    const cancel = (nextEvent) => {
      if (nextEvent.pointerId != null && nextEvent.pointerId !== event.pointerId) return;
      cleanup();
    };
    this.svg.addEventListener('pointermove', move);
    this.svg.addEventListener('pointerup', end);
    this.svg.addEventListener('pointercancel', cancel);
    this.svg.addEventListener('lostpointercapture', cancel);
  }

  #clientPoint(clientX, clientY, coordinateElement) {"""
t = replace_once(t, anchor, pen_method, 'pen gesture method')
# Replace old pair/handle/vertex drag methods region in one shot.
start = t.index("  #startHandlePairDrag(event, node, vertexIndex, group) {")
end = t.index("  #startControlDrag(event, control) {", start)
new_vertex_methods = """  #startHandlePairDrag(event, node, vertexId, group) {
    const vertex = node.geometry.vertices.find((candidate) => candidate.id === vertexId);
    if (!vertex) return;
    this.dragKind = 'handle';
    this.callbacks.begin?.(`Create ${node.name} curve handles`);
    this.#captureDrag(
      event,
      (nextEvent) => {
        const point = this.#screenPoint(nextEvent, group);
        let offset = { x: point.x - vertex.x, y: point.y - vertex.y };
        if (nextEvent.shiftKey) {
          const distance = Math.hypot(offset.x, offset.y);
          const angle = Math.round(Math.atan2(offset.y, offset.x) / (Math.PI / 4)) * (Math.PI / 4);
          offset = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
        }
        this.callbacks.setVertexModePreview?.(node.id, vertexId, 'mirrored');
        this.callbacks.moveHandle?.(node.id, vertexId, 'out', offset);
        Object.assign(vertex, { outX: offset.x, outY: offset.y, inX: -offset.x, inY: -offset.y, handleMode: 'mirrored' });
        this.#updateLiveGeometry(node.id);
      },
      () => this.callbacks.commit?.(),
    );
  }

  #startHandleDrag(event, node, vertexId, prefix, group) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (!['select', 'vertex'].includes(this.tool)) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.callbacks.removeHandleCommand?.(node.id, vertexId, prefix);
      return;
    }
    this.dragKind = 'handle';
    const vertex = node.geometry.vertices.find((candidate) => candidate.id === vertexId);
    if (!vertex) return;
    const startPoint = this.#screenPoint(event, group);
    const start = { x: Number(vertex[`${prefix}X`]), y: Number(vertex[`${prefix}Y`]) };
    this.callbacks.begin?.(`Move ${node.name} ${prefix} handle`);
    if (event.altKey) {
      this.callbacks.setVertexModePreview?.(node.id, vertexId, 'detached');
      vertex.handleMode = 'detached';
    }
    this.#captureDrag(
      event,
      (nextEvent) => {
        const point = this.#screenPoint(nextEvent, group);
        const next = { x: start.x + point.x - startPoint.x, y: start.y + point.y - startPoint.y };
        this.callbacks.moveHandle?.(node.id, vertexId, prefix, next);
        const target = node.geometry.vertices.find((candidate) => candidate.id === vertexId);
        if (target) Object.assign(vertex, target);
        this.#updateLiveGeometry(node.id);
      },
      () => this.callbacks.commit?.(),
    );
  }

  #startCornerRadiusDrag(event, node, vertexId, group) {
    if (event.button !== 0 || !['select', 'vertex'].includes(this.tool)) return;
    event.stopPropagation();
    const vertex = node.geometry.vertices.find((candidate) => candidate.id === vertexId);
    if (!vertex) return;
    const startPoint = this.#screenPoint(event, group);
    const startRadius = Number(vertex.cornerRadius || 0);
    this.dragKind = 'corner-radius';
    this.callbacks.begin?.(`Set ${node.name} corner radius`);
    this.#captureDrag(event, (nextEvent) => {
      const point = this.#screenPoint(nextEvent, group);
      const radius = Math.max(0, startRadius + point.x - startPoint.x);
      this.callbacks.setCornerRadiusPreview?.(node.id, vertexId, radius);
      vertex.cornerRadius = radius;
      this.#updateLiveGeometry(node.id);
    }, () => this.callbacks.commit?.());
  }

  #startVertexDrag(event, node, vertexId, group) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (!['select', 'vertex'].includes(this.tool)) return;
    const vertex = node.geometry.vertices.find((candidate) => candidate.id === vertexId);
    if (!vertex) return;
    this.callbacks.selectVertex?.(node.id, vertexId);
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.callbacks.toggleVertexSmooth?.(node.id, vertexId, (vertex.handleMode || 'straight') === 'straight' ? 'mirrored' : 'straight');
      return;
    }
    const hasHandle = Math.hypot(vertex.inX || 0, vertex.inY || 0) > 0.0001 || Math.hypot(vertex.outX || 0, vertex.outY || 0) > 0.0001;
    if (event.altKey) {
      if (hasHandle) {
        this.callbacks.setVertexModeCommand?.(node.id, vertexId, 'detached');
        return;
      }
      this.#startHandlePairDrag(event, node, vertexId, group);
      return;
    }
    this.dragKind = 'vertex';
    const startPoint = this.#screenPoint(event, group);
    const start = { x: vertex.x, y: vertex.y };
    this.callbacks.begin?.(`Move ${node.name} vertex`);
    this.#captureDrag(event, (nextEvent) => {
      const point = this.#screenPoint(nextEvent, group);
      const next = { x: start.x + point.x - startPoint.x, y: start.y + point.y - startPoint.y };
      Object.assign(vertex, next);
      this.callbacks.moveVertex?.(node.id, vertexId, next);
      this.#updateLiveGeometry(node.id);
    }, () => this.callbacks.commit?.());
  }

"""
t = t[:start] + new_vertex_methods + t[end:]
# pencil on scene node + shift/multi/deep parent selection. Replace startNodeDrag beginning block.
old = """  #startNodeDrag(event, node, group) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (this.tool === 'pencil') {
      this.callbacks.drawPoint?.(this.#screenPoint(event, this.svg));
      return;
    }
    if (this.tool === 'vertex') {
      this.callbacks.select?.({ kind: 'node', id: node.id });
      return;
    }
    if (this.tool !== 'select') {
      this.callbacks.select?.({ kind: 'node', id: node.id });
      return;
    }
    if (node.locked) {
      this.callbacks.select?.({ kind: 'node', id: node.id });
      return;
    }

    const parentSpace = group.parentElement;"""
new = """  #startNodeDrag(event, node, group) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (this.tool === 'pencil') {
      this.#startPenPoint(event);
      return;
    }
    const deep = Number(event.detail || 0) > 1;
    const target = this.#selectionTargetNode(node, deep);
    const targetRef = { kind: 'node', id: target.id };
    if (this.tool === 'vertex') {
      this.callbacks.select?.({ kind: 'node', id: node.id }, { toggle: event.shiftKey, deep: true });
      return;
    }
    if (this.tool !== 'select') {
      this.callbacks.select?.(targetRef, { toggle: event.shiftKey, deep });
      return;
    }
    if (event.shiftKey) {
      this.callbacks.select?.(targetRef, { toggle: true, deep });
      return;
    }
    if (target.id !== node.id) {
      this.callbacks.select?.(targetRef, { deep });
      return;
    }
    if (node.locked) {
      this.callbacks.select?.(targetRef, { deep });
      return;
    }

    const parentSpace = group.parentElement;"""
t = replace_once(t, old, new, 'node select deep/multi')
# selection target helper before startNodeDrag
anchor = """  #startNodeDrag(event, node, group) {"""
helper = """  #selectionTargetNode(node, deep = false) {
    if (deep) return node;
    let target = node;
    const byId = new Map((this.scene?.nodes || []).map((candidate) => [candidate.id, candidate]));
    let parentId = referenceId(target.parent, 'node');
    while (parentId && byId.has(parentId)) {
      target = byId.get(parentId);
      parentId = referenceId(target.parent, 'node');
    }
    return target;
  }

  #startNodeDrag(event, node, group) {"""
t = replace_once(t, anchor, helper, 'selection target helper')
# group drag shift toggle and current selected callback options
old = """    if (this.tool !== 'select') {
      this.callbacks.select?.({ kind: 'node', id: node.id });
      return;
    }"""
# First occurrence now likely in group drag (startNode no longer exact). replace one
new = """    if (this.tool !== 'select') {
      this.callbacks.select?.({ kind: 'node', id: node.id });
      return;
    }
    if (event.shiftKey) {
      this.callbacks.select?.({ kind: 'node', id: node.id }, { toggle: true });
      return;
    }"""
if old in t:
    t = t.replace(old, new, 1)
p.write_text(t)

# ---------------------------------------------------------------------------
# HTML editor-only affordances
# ---------------------------------------------------------------------------
p = Path('veyra.html')
t = p.read_text()
t = replace_once(t,
"""              <button class="toolButton" data-tool="pencil" aria-label="Draw path" aria-pressed="false" title="Draw Path (P)"><svg><use href="#i-path"/></svg><span>Draw Path</span></button>""",
"""              <button class="toolButton" data-tool="pencil" aria-label="Draw path" aria-pressed="false" title="Draw Path (P)"><svg><use href="#i-path"/></svg><span>Draw Path</span></button>
              <button class="toolButton m7DoneButton" id="finishPath" aria-label="Finish path editing" title="Finish current path/edit operation" hidden><svg><use href="#i-close"/></svg><span>Done</span></button>""",
'finish path button')
t = replace_once(t,
"""            <button id="focusSelection" class="zoomTextButton" aria-label="Focus selection" title="Focus Selection (Shift+F)">Focus</button>""",
"""            <button id="focusSelection" class="zoomTextButton" aria-label="Focus selection" title="Focus Selection (Shift+F)">Focus</button>
            <button id="cleanPreview" class="zoomTextButton" aria-label="Toggle clean artwork preview" title="Clean Preview — hide editor overlays">Clean</button>""",
'clean preview button')
t = replace_once(t,
"""          <div class="artboardFrame" id="artboardFrame">
            <span class="artboardLabel" aria-hidden="true">Artboard</span>
          </div>
        </div>
        <div class="statusbar">
          <span><span class="statusDot"></span><span id="statusText">Veyra document ready</span></span>
          <span id="selectionStatus">No selection</span>""",
"""          <div class="artboardFrame" id="artboardFrame">
            <span class="artboardLabel" aria-hidden="true">Artboard</span>
          </div>
          <div id="marqueeBox" class="marqueeBox" hidden aria-hidden="true"></div>
        </div>
        <div class="statusbar">
          <span><span class="statusDot"></span><span id="statusText">Veyra document ready</span></span>
          <output id="coordinateReadout" class="coordinateReadout" aria-live="off">X 0 · Y 0</output>
          <span id="selectionStatus">No selection</span>""",
'coordinate HUD marquee')
p.write_text(t)

# ---------------------------------------------------------------------------
# CSS editor-only M7 overlays
# ---------------------------------------------------------------------------
p = Path('veyra.css')
t = p.read_text()
t += """

/* M7 editor-authoring overlays: excluded from authored/runtime serialization. */
.coordinateReadout { margin-left: auto; margin-right: 12px; font-variant-numeric: tabular-nums; color: var(--ui-accent-soft); min-width: 118px; text-align: right; }
.marqueeBox { position: absolute; z-index: 30; pointer-events: none; border: 1px solid var(--ui-accent); background: color-mix(in srgb, var(--ui-accent) 14%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-accent) 22%, transparent) inset; }
.stageViewport.isMarqueeSelecting, .stageViewport.isMarqueeSelecting * { cursor: crosshair !important; user-select: none; }
.cornerRadiusLine { stroke: var(--ui-warning); opacity: .7; vector-effect: non-scaling-stroke; pointer-events: none; }
.cornerRadiusHandle { fill: var(--ui-surface); stroke: var(--ui-warning); cursor: ew-resize; vector-effect: non-scaling-stroke; }
.cornerRadiusHandle:hover { fill: var(--ui-warning); }
.penGesturePreview { stroke: var(--ui-accent); opacity: .85; pointer-events: none; }
#cleanPreview.isActive { border-color: var(--ui-accent); color: var(--ui-accent-soft); background: color-mix(in srgb, var(--ui-accent) 14%, transparent); }
.m7DoneButton { border-color: color-mix(in srgb, var(--ui-accent) 48%, var(--ui-border)); }
.treeRow.isMultiSelected .treeSelect { box-shadow: inset 3px 0 0 var(--ui-accent); background: color-mix(in srgb, var(--ui-accent) 11%, var(--ui-surface-2)); }
"""
p.write_text(t)

print('M7 renderer/html/css patches applied')
