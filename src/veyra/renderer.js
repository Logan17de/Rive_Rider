import {
  fillPaintValue,
  geometryDescriptor,
  gradientDescriptor,
  localBounds,
  paintServerId,
  transformAttribute,
} from './geometry.js';
import { referenceId } from './references.js';
import { transformPoint } from './contracts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value != null) element.setAttribute(name, String(value));
  }
  return element;
}

function applyAttributes(element, attributes) {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
}

function gradientElement(fill, id) {
  const descriptor = gradientDescriptor(fill, id);
  if (!descriptor) return null;
  const gradient = svgElement(descriptor.tag, descriptor.attributes);
  for (const stop of descriptor.stops) {
    gradient.appendChild(svgElement('stop', {
      'data-stop-id': stop.id,
      offset: stop.offset,
      'stop-color': stop.color,
      'stop-opacity': stop.opacity,
    }));
  }
  return gradient;
}

export class VeyraRenderer {
  constructor(svg, callbacks = {}) {
    if (!(svg instanceof SVGElement)) throw new TypeError('VeyraRenderer requires an SVG element.');
    this.svg = svg;
    this.callbacks = callbacks;
    this.zoom = 1;
    this.scene = null;
    this.selectedRef = null;
    this.dragging = false;
    this.dragKind = null;
    this.tool = 'select';
    this.viewCenter = null;
    this.viewDocumentId = null;
    this.draftPath = [];
  }

  setTool(tool) {
    this.tool = tool || 'select';
  }

  setDraftPath(points = []) {
    this.draftPath = points.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    if (this.scene && !this.dragging) this.render(this.scene, this.selectedRef);
  }

  setZoom(value, anchor = null) {
    const nextZoom = Math.min(8, Math.max(0.1, Number(value) || 1));
    if (this.scene && anchor && this.viewCenter) {
      const oldWidth = this.scene.artboard.width / this.zoom;
      const oldHeight = this.scene.artboard.height / this.zoom;
      const relativeX = (anchor.x - (this.viewCenter.x - oldWidth / 2)) / oldWidth;
      const relativeY = (anchor.y - (this.viewCenter.y - oldHeight / 2)) / oldHeight;
      const nextWidth = this.scene.artboard.width / nextZoom;
      const nextHeight = this.scene.artboard.height / nextZoom;
      this.viewCenter = {
        x: anchor.x - (relativeX - 0.5) * nextWidth,
        y: anchor.y - (relativeY - 0.5) * nextHeight,
      };
    }
    this.zoom = nextZoom;
    this.#applyViewBox();
    return this.zoom;
  }

  resetView() {
    if (this.scene) {
      this.viewCenter = {
        x: this.scene.artboard.width / 2,
        y: this.scene.artboard.height / 2,
      };
    }
    this.zoom = 1;
    this.#applyViewBox();
    return this.zoom;
  }

  panBy(x, y) {
    if (!this.scene || !this.viewCenter) return;
    this.viewCenter.x += Number(x) || 0;
    this.viewCenter.y += Number(y) || 0;
    this.#applyViewBox();
  }

  clientPoint(clientX, clientY) {
    return this.#clientPoint(clientX, clientY, this.svg);
  }

  worldToClient(x, y) {
    const matrix = this.svg.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(x, y).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }

  #applyViewBox() {
    if (!this.scene) return;
    const { width, height } = this.scene.artboard;
    if (!this.viewCenter) this.viewCenter = { x: width / 2, y: height / 2 };
    const visibleWidth = width / this.zoom;
    const visibleHeight = height / this.zoom;
    this.svg.setAttribute('viewBox', [
      this.viewCenter.x - visibleWidth / 2,
      this.viewCenter.y - visibleHeight / 2,
      visibleWidth,
      visibleHeight,
    ].join(' '));
  }

  render(scene, selectedRef = null) {
    if (scene?.kind !== 'veyra-evaluated-scene') {
      throw new TypeError('VeyraRenderer requires an evaluated scene.');
    }
    const resetView = this.viewDocumentId !== scene.documentId;
    this.scene = scene;
    if (resetView) {
      this.viewDocumentId = scene.documentId;
      this.viewCenter = { x: scene.artboard.width / 2, y: scene.artboard.height / 2 };
    }
    this.selectedRef = typeof selectedRef === 'string'
      ? { kind: 'node', id: selectedRef }
      : selectedRef;
    this.#applyViewBox();
    if (this.dragging) {
      if (['bone', 'control'].includes(this.dragKind)) {
        this.svg.querySelector(':scope > .rigMeshes')?.replaceWith(this.#renderMeshes());
        this.svg.querySelector(':scope > .rigOverlay')?.replaceWith(this.#renderRigOverlay());
      }
      return;
    }

    this.svg.setAttribute('aria-label', `${scene.name} artboard`);
    const background = svgElement('rect', {
      class: 'artboardBackground',
      x: 0,
      y: 0,
      width: scene.artboard.width,
      height: scene.artboard.height,
      fill: scene.artboard.background,
    });
    background.addEventListener('pointerdown', (event) => {
      if (this.tool === 'pencil') {
        event.stopPropagation();
        this.callbacks.drawPoint?.(this.#screenPoint(event, this.svg));
        return;
      }
      this.callbacks.select?.(null);
    });

    const definitions = svgElement('defs');
    for (const node of scene.nodes) {
      if (node.type === 'group') continue;
      const gradient = gradientElement(node.paint.fill, paintServerId('node', node.id));
      if (gradient) definitions.appendChild(gradient);
    }
    for (const mesh of scene.meshes || []) {
      const gradient = gradientElement(mesh.paint.fill, paintServerId('mesh', mesh.id));
      if (gradient) definitions.appendChild(gradient);
    }

    // Invisible catcher so the workspace (outside the artboard) behaves like
    // the artboard: pencil drops points, any other tool deselects.
    const workspace = svgElement('rect', {
      class: 'workspaceCatcher',
      x: -1000000,
      y: -1000000,
      width: 2000000,
      height: 2000000,
    });
    workspace.addEventListener('pointerdown', (event) => {
      if (this.tool === 'pencil') {
        event.stopPropagation();
        this.callbacks.drawPoint?.(this.#screenPoint(event, this.svg));
        return;
      }
      this.callbacks.select?.(null);
    });

    const sceneGroup = svgElement('g', { class: 'veyraScene' });
    const children = new Map();
    for (const node of scene.nodes) {
      const key = referenceId(node.parent, 'node') || '__root__';
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(node);
    }
    for (const node of children.get('__root__') || []) {
      sceneGroup.appendChild(this.#renderNode(node, children));
    }
    const meshGroup = this.#renderMeshes();
    const rigOverlay = this.#renderRigOverlay();
    const draftOverlay = this.#renderDraftPath();
    const childrenToRender = [workspace, background];
    if (definitions.childNodes.length) childrenToRender.push(definitions);
    childrenToRender.push(sceneGroup, meshGroup, rigOverlay, draftOverlay);
    this.svg.replaceChildren(...childrenToRender);
  }

  #renderDraftPath() {
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

  #renderNode(node, children) {
    const group = svgElement('g', {
      'data-node-id': node.id,
      'data-node-type': node.type,
      transform: transformAttribute(node.localMatrix),
      opacity: node.opacity,
      visibility: node.visible ? 'visible' : 'hidden',
      class: `sceneNode${node.locked ? ' isLocked' : ''}`,
    });

    if (node.type !== 'group') {
      const descriptor = geometryDescriptor(node);
      const shape = svgElement(descriptor.tag, {
        ...descriptor.attributes,
        fill: fillPaintValue(node.paint.fill, paintServerId('node', node.id)),
        stroke: node.paint.stroke,
        'stroke-width': node.paint.strokeWidth,
        'vector-effect': 'non-scaling-stroke',
        class: 'sceneShape',
        tabindex: '-1',
      });
      shape.addEventListener('pointerdown', (event) => this.#startNodeDrag(event, node, group));
      group.appendChild(shape);
    }

    for (const child of children.get(node.id) || []) {
      group.appendChild(this.#renderNode(child, children));
    }

    if (this.selectedRef?.kind === 'node' && node.id === this.selectedRef.id) this.#appendSelection(group, node, children);
    return group;
  }

  #renderMeshes() {
    const group = svgElement('g', { class: 'rigMeshes' });
    for (const mesh of this.scene.meshes || []) {
      if (!mesh.visible) continue;
      const byId = new Map(mesh.deformedVertices.map((vertex) => [vertex.id, vertex]));
      const meshGroup = svgElement('g', {
        class: `rigMesh${this.selectedRef?.kind === 'mesh' && this.selectedRef.id === mesh.id ? ' isSelected' : ''}`,
        'data-mesh-id': mesh.id,
        opacity: mesh.opacity,
      });
      for (const triangle of mesh.triangles) {
        const points = triangle
          .map((reference) => byId.get(referenceId(reference, 'meshVertex')))
          .filter(Boolean)
          .map((vertex) => `${vertex.x},${vertex.y}`)
          .join(' ');
        const polygon = svgElement('polygon', {
          class: 'meshTriangle',
          points,
          fill: fillPaintValue(mesh.paint.fill, paintServerId('mesh', mesh.id)),
          stroke: mesh.paint.stroke,
          'stroke-width': mesh.paint.strokeWidth,
          'vector-effect': 'non-scaling-stroke',
        });
        polygon.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
          this.callbacks.select?.({ kind: 'mesh', id: mesh.id });
        });
        meshGroup.appendChild(polygon);
      }
      if (this.selectedRef?.kind === 'mesh' && this.selectedRef.id === mesh.id) {
        for (const vertex of mesh.deformedVertices) {
          meshGroup.appendChild(svgElement('circle', {
            class: vertex.weightSum > 0 ? 'meshVertex' : 'meshVertex isUnweighted',
            cx: vertex.x,
            cy: vertex.y,
            r: 3.5 / this.zoom,
            'stroke-width': 1.5 / this.zoom,
          }));
        }
      }
      group.appendChild(meshGroup);
    }
    return group;
  }

  #renderRigOverlay() {
    const overlay = svgElement('g', { class: 'rigOverlay' });
    for (const constraint of this.scene.constraints || []) {
      if (!constraint.enabled || constraint.type !== 'ik') continue;
      const boneId = referenceId(constraint.bones.at(-1), 'bone');
      const bone = this.scene.bones.find((candidate) => candidate.id === boneId);
      const control = this.scene.controls.find((candidate) => candidate.id === referenceId(constraint.target, 'control'));
      if (bone && control) overlay.appendChild(svgElement('line', {
        class: 'constraintGuide',
        x1: bone.end.x,
        y1: bone.end.y,
        x2: control.position.x,
        y2: control.position.y,
        'stroke-width': 1 / this.zoom,
      }));
    }

    for (const bone of this.scene.bones || []) {
      if (!bone.visible) continue;
      const selected = this.selectedRef?.kind === 'bone' && this.selectedRef.id === bone.id;
      const ikDriven = this.scene.constraints.some((constraint) => constraint.enabled
        && constraint.type === 'ik'
        && constraint.bones.some((reference) => referenceId(reference, 'bone') === bone.id));
      const boneGroup = svgElement('g', {
        class: `rigBone${selected ? ' isSelected' : ''}${ikDriven ? ' isConstrained' : ''}${bone.locked ? ' isLocked' : ''}`,
        'data-bone-id': bone.id,
        transform: transformAttribute(bone.worldMatrix),
        color: bone.color,
        role: 'button',
        tabindex: '0',
        'aria-label': `${bone.name} bone${ikDriven ? ', IK constrained' : ''}`,
      });
      const hit = svgElement('line', { class: 'boneHit', x1: 0, y1: 0, x2: bone.length, y2: 0 });
      const shaft = svgElement('path', {
        class: 'boneShaft',
        d: `M 0 0 L ${Math.max(8, bone.length * 0.2)} -7 L ${bone.length} 0 L ${Math.max(8, bone.length * 0.2)} 7 Z`,
        'stroke-width': 1.5 / this.zoom,
      });
      const joint = svgElement('circle', { class: 'boneJoint', cx: 0, cy: 0, r: 5 / this.zoom, 'stroke-width': 2 / this.zoom });
      const end = svgElement('circle', { class: 'boneEnd', cx: bone.length, cy: 0, r: 6 / this.zoom, 'stroke-width': 2 / this.zoom });
      for (const element of [hit, shaft, end]) element.addEventListener('pointerdown', (event) => this.#startBoneDrag(event, bone, 'end'));
      joint.addEventListener('pointerdown', (event) => this.#startBoneDrag(event, bone, 'start'));
      boneGroup.append(hit, shaft, joint, end);
      overlay.appendChild(boneGroup);
    }

    for (const control of this.scene.controls || []) {
      if (!control.visible) continue;
      const selected = this.selectedRef?.kind === 'control' && this.selectedRef.id === control.id;
      const controlGroup = svgElement('g', {
        class: `rigControl${selected ? ' isSelected' : ''}${control.locked ? ' isLocked' : ''}`,
        'data-control-id': control.id,
        transform: `translate(${control.position.x} ${control.position.y})`,
        color: control.color,
      });
      const radius = 10 / this.zoom;
      const handle = svgElement('path', {
        class: 'controlHandle',
        d: `M 0 ${-radius} L ${radius} 0 L 0 ${radius} L ${-radius} 0 Z`,
        'stroke-width': 2 / this.zoom,
      });
      handle.addEventListener('pointerdown', (event) => this.#startControlDrag(event, control));
      controlGroup.appendChild(handle);
      overlay.appendChild(controlGroup);
    }
    return overlay;
  }

  #groupBounds(node, children) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const absorb = (bounds, matrix) => {
      if (!bounds || !matrix) return;
      for (const [px, py] of [[bounds.minX, bounds.minY], [bounds.maxX, bounds.minY], [bounds.minX, bounds.maxY], [bounds.maxX, bounds.maxY]]) {
        const point = transformPoint(matrix, { x: px, y: py });
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    };
    for (const child of children.get(node.id) || []) {
      const bounds = child.type === 'group' ? this.#groupBounds(child, children) : localBounds(child);
      absorb(bounds, child.localMatrix);
    }
    return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }

  #appendSelection(group, node, children) {
    const bounds = node.type === 'group' ? this.#groupBounds(node, children) : localBounds(node);
    if (bounds) {
      const pad = 7 / this.zoom;
      group.appendChild(svgElement('rect', {
        class: 'selectionBox',
        x: bounds.minX - pad,
        y: bounds.minY - pad,
        width: bounds.maxX - bounds.minX + pad * 2,
        height: bounds.maxY - bounds.minY + pad * 2,
        'stroke-width': 1.5 / this.zoom,
      }));
      if (node.type === 'group' && !node.locked && this.tool === 'select') {
        const hit = svgElement('rect', {
          class: 'groupHit',
          x: bounds.minX - pad,
          y: bounds.minY - pad,
          width: bounds.maxX - bounds.minX + pad * 2,
          height: bounds.maxY - bounds.minY + pad * 2,
        });
        hit.addEventListener('pointerdown', (event) => this.#startGroupDrag(event, node, group));
        group.appendChild(hit);
      }
      group.appendChild(svgElement('circle', {
        class: 'originPoint',
        cx: 0,
        cy: 0,
        r: 3.5 / this.zoom,
        'stroke-width': 1.5 / this.zoom,
      }));
    }

    if (node.type !== 'path' || node.locked || !['select', 'vertex'].includes(this.tool)) return;
    this.#appendPathControls(group, node);
  }

  #appendPathControls(group, node) {
    const controls = svgElement('g', { class: 'vertexControls' });
    node.geometry.vertices.forEach((vertex, index) => {
      for (const prefix of ['in', 'out']) {
        const offsetX = Number(vertex[`${prefix}X`]);
        const offsetY = Number(vertex[`${prefix}Y`]);
        // KD-1 (ratified 2026-09-04, contract doc): a zero-offset handle sits at
        // exactly the vertex position, painted under the larger vertex point, so
        // it is invisible AND ungrabbable — a control that can never receive a
        // click. The model decides, the presenter reports: emit only handles for
        // offsets that actually exist in the document. Corner-to-smooth from the
        // canvas is a NAMED GAP until a vertex-type affordance ships; AI reaches
        // the capability today via veyra.moveHandle (veyra.js:168).
        if (Math.abs(offsetX) < 0.0001 && Math.abs(offsetY) < 0.0001) continue;
        const handleX = vertex.x + offsetX;
        const handleY = vertex.y + offsetY;
        controls.appendChild(svgElement('line', {
          class: 'handleLine',
          x1: vertex.x,
          y1: vertex.y,
          x2: handleX,
          y2: handleY,
          'stroke-width': 1 / this.zoom,
        }));
        const handle = svgElement('circle', {
          class: 'bezierHandle',
          'data-handle': prefix,
          'data-vertex-index': index,
          cx: handleX,
          cy: handleY,
          r: 4 / this.zoom,
          'stroke-width': 1 / this.zoom,
        });
        handle.addEventListener('pointerdown', (event) =>
          this.#startHandleDrag(event, node, index, prefix, group));
        controls.appendChild(handle);
      }
      const point = svgElement('circle', {
        class: 'vertexPoint',
        'data-vertex-index': index,
        cx: vertex.x,
        cy: vertex.y,
        r: 5 / this.zoom,
        'stroke-width': 2 / this.zoom,
      });
      point.addEventListener('pointerdown', (event) =>
        this.#startVertexDrag(event, node, index, group));
      controls.appendChild(point);
    });
    group.appendChild(controls);
  }
  #clientPoint(clientX, clientY, coordinateElement) {
    const matrix = coordinateElement.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  #screenPoint(event, coordinateElement) {
    return this.#clientPoint(event.clientX, event.clientY, coordinateElement);
  }

  #captureDrag(event, move, end) {
    this.dragging = true;
    this.svg.setPointerCapture?.(event.pointerId);
    const pointerMove = (nextEvent) => move(nextEvent);
    const pointerEnd = (nextEvent) => {
      this.svg.removeEventListener('pointermove', pointerMove);
      this.svg.removeEventListener('pointerup', pointerEnd);
      this.svg.removeEventListener('pointercancel', pointerCancel);
      this.svg.releasePointerCapture?.(event.pointerId);
      this.dragging = false;
      this.dragKind = null;
      end(nextEvent);
    };
    const pointerCancel = () => {
      this.svg.removeEventListener('pointermove', pointerMove);
      this.svg.removeEventListener('pointerup', pointerEnd);
      this.svg.removeEventListener('pointercancel', pointerCancel);
      this.dragging = false;
      this.dragKind = null;
      this.callbacks.cancel?.();
    };
    this.svg.addEventListener('pointermove', pointerMove);
    this.svg.addEventListener('pointerup', pointerEnd);
    this.svg.addEventListener('pointercancel', pointerCancel);
  }

  #startNodeDrag(event, node, group) {
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

    const parentSpace = group.parentElement;
    const startPoint = this.#screenPoint(event, parentSpace);
    const start = { x: node.transform.x, y: node.transform.y };
    // Suppress a canvas rebuild when selection changes on this pointerdown;
    // replacing the captured SVG node would invalidate its coordinate space.
    this.dragging = true;
    this.dragKind = 'node';
    this.callbacks.select?.({ kind: 'node', id: node.id });
    this.callbacks.begin?.(`Move ${node.name}`);
    this.#captureDrag(
      event,
      (nextEvent) => {
        const point = this.#screenPoint(nextEvent, parentSpace);
        const next = {
          x: start.x + point.x - startPoint.x,
          y: start.y + point.y - startPoint.y,
        };
        this.callbacks.moveNode?.(node.id, next);
        const liveGroup = this.svg.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
        if (liveGroup) liveGroup.setAttribute('transform', transformAttribute({ ...node.transform, ...next }));
      },
      () => this.callbacks.commit?.(),
    );
  }

  #startGroupDrag(event, node, group) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (this.tool !== 'select') {
      this.callbacks.select?.({ kind: 'node', id: node.id });
      return;
    }
    if (node.locked) {
      this.callbacks.select?.({ kind: 'node', id: node.id });
      return;
    }
    const parentSpace = group.parentElement;
    const startPoint = this.#screenPoint(event, parentSpace);
    this.dragging = true;
    this.dragKind = 'group';
    this.callbacks.select?.({ kind: 'node', id: node.id });
    this.callbacks.begin?.(`Move ${node.name}`);
    this.#captureDrag(
      event,
      (nextEvent) => {
        const point = this.#screenPoint(nextEvent, parentSpace);
        this.callbacks.moveGroup?.(node.id, {
          x: point.x - startPoint.x,
          y: point.y - startPoint.y,
        });
      },
      () => this.callbacks.commit?.(),
    );
  }

  #startHandlePairDrag(event, node, vertexIndex, group) {
    const vertex = node.geometry.vertices[vertexIndex];
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
        this.callbacks.moveHandle?.(node.id, vertexIndex, 'out', offset);
        this.callbacks.moveHandle?.(node.id, vertexIndex, 'in', { x: -offset.x, y: -offset.y });
        Object.assign(vertex, { outX: offset.x, outY: offset.y, inX: -offset.x, inY: -offset.y });
        this.#updateLiveGeometry(node.id);
      },
      () => this.callbacks.commit?.(),
    );
  }

  #startHandleDrag(event, node, vertexIndex, prefix, group) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (!['select', 'vertex'].includes(this.tool)) return;
    this.dragKind = 'handle';
    const vertex = node.geometry.vertices[vertexIndex];
    const startPoint = this.#screenPoint(event, group);
    const start = { x: Number(vertex[`${prefix}X`]), y: Number(vertex[`${prefix}Y`]) };
    this.callbacks.begin?.(`Move ${node.name} ${prefix} handle`);
    this.#captureDrag(
      event,
      (nextEvent) => {
        const point = this.#screenPoint(nextEvent, group);
        const next = {
          x: start.x + point.x - startPoint.x,
          y: start.y + point.y - startPoint.y,
        };
        this.callbacks.moveHandle?.(node.id, vertexIndex, prefix, next);
        this.#updateLiveGeometry(node.id);
      },
      () => this.callbacks.commit?.(),
    );
  }

  #startVertexDrag(event, node, vertexIndex, group) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (!['select', 'vertex'].includes(this.tool)) return;
    if (event.altKey) {
      this.#startHandlePairDrag(event, node, vertexIndex, group);
      return;
    }
    this.dragKind = 'vertex';
    const vertex = node.geometry.vertices[vertexIndex];
    const startPoint = this.#screenPoint(event, group);
    const start = { x: vertex.x, y: vertex.y };
    this.callbacks.begin?.(`Move ${node.name} vertex`);
    this.#captureDrag(
      event,
      (nextEvent) => {
        const point = this.#screenPoint(nextEvent, group);
        const next = {
          x: start.x + point.x - startPoint.x,
          y: start.y + point.y - startPoint.y,
        };
        Object.assign(node.geometry.vertices[vertexIndex], next);
        this.callbacks.moveVertex?.(node.id, vertexIndex, next);
        this.#updateLiveGeometry(node.id);
      },
      () => this.callbacks.commit?.(),
    );
  }

  #startControlDrag(event, control) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (!['select', 'control'].includes(this.tool)) {
      this.callbacks.select?.({ kind: 'control', id: control.id });
      return;
    }
    if (control.locked) {
      this.callbacks.select?.({ kind: 'control', id: control.id });
      return;
    }
    const startPoint = this.#screenPoint(event, this.svg);
    const start = { ...control.position };
    this.dragging = true;
    this.dragKind = 'control';
    this.callbacks.select?.({ kind: 'control', id: control.id });
    this.callbacks.begin?.(`Move ${control.name}`);
    this.#captureDrag(
      event,
      (nextEvent) => {
        const point = this.#screenPoint(nextEvent, this.svg);
        const next = {
          x: start.x + point.x - startPoint.x,
          y: start.y + point.y - startPoint.y,
        };
        this.callbacks.moveControl?.(control.id, next);
      },
      () => this.callbacks.commit?.(),
    );
  }

  #startBoneDrag(event, bone, handle) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (!['select', 'bone'].includes(this.tool)) {
      this.callbacks.select?.({ kind: 'bone', id: bone.id });
      return;
    }
    if (bone.locked) {
      this.callbacks.select?.({ kind: 'bone', id: bone.id });
      return;
    }
    this.dragging = true;
    this.dragKind = 'bone';
    this.callbacks.select?.({ kind: 'bone', id: bone.id });
    this.callbacks.begin?.(`${handle === 'start' ? 'Move' : 'Pose'} ${bone.name}`);
    this.#captureDrag(
      event,
      (nextEvent) => {
        const point = this.#screenPoint(nextEvent, this.svg);
        const modifiers = {
          shift: nextEvent.shiftKey,
          control: nextEvent.ctrlKey || nextEvent.metaKey,
          alt: nextEvent.altKey,
        };
        if (handle === 'start') this.callbacks.moveBoneStart?.(bone.id, point, modifiers);
        else this.callbacks.moveBoneEnd?.(bone.id, point, modifiers);
      },
      () => this.callbacks.commit?.(),
    );
  }

  #updateLiveGeometry(nodeId) {
    const node = this.scene.nodes.find((candidate) => candidate.id === nodeId);
    const group = this.svg.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`);
    const shape = group?.querySelector(':scope > .sceneShape');
    if (!node || !shape) return;
    const descriptor = geometryDescriptor(node);
    applyAttributes(shape, descriptor.attributes);
    const controls = group.querySelector(':scope > .vertexControls');
    if (controls) {
      controls.remove();
      this.#appendSelectionControlsOnly(group, node);
    }
  }

  #appendSelectionControlsOnly(group, node) {
    this.#appendPathControls(group, node);
  }
}
