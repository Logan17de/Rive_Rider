from pathlib import Path


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Workspace: client-space camera compensation + deterministic rig-overlay gate
# ---------------------------------------------------------------------------
p = 'src/veyra/workspace.js'
t = read(p)
t = replace_once(t,
"export const VEYRA_MIN_NODE_SCALE = 0.01;\n",
"export const VEYRA_MIN_NODE_SCALE = 0.01;\nexport const VEYRA_RIG_OVERLAY_MIN_ZOOM = 0.2;\n",
'workspace overlay constant')
anchor = """export function workspaceCssVariables(layout, viewport = {}) {
  const normalized = normalizeWorkspaceLayout(layout, viewport);
  return {
    '--left-panel-width': normalized.leftCollapsed ? '0px' : `${normalized.leftWidth}px`,
    '--right-panel-width': normalized.rightCollapsed ? '0px' : `${normalized.rightWidth}px`,
    '--timeline-height': normalized.bottomCollapsed ? '48px' : `${normalized.bottomHeight}px`,
  };
}
"""
insert = anchor + """
function clientRectCenter(rect = {}) {
  const left = finite(rect.left, 0);
  const top = finite(rect.top, 0);
  const width = Math.max(0, finite(rect.width, finite(rect.right, left) - left));
  const height = Math.max(0, finite(rect.height, finite(rect.bottom, top) - top));
  return { x: left + width / 2, y: top + height / 2 };
}

/**
 * Preserve the absolute browser-client mapping of the current camera when UI
 * chrome changes the SVG viewport rectangle. This is editor state only: zoom
 * is unchanged and no authored artboard/object property participates.
 */
export function compensateViewportForClientRect(viewport = {}, beforeRect = {}, afterRect = {}) {
  const zoom = clampZoom(viewport.zoom ?? 1);
  const before = clientRectCenter(beforeRect);
  const after = clientRectCenter(afterRect);
  return {
    ...viewport,
    zoom,
    centerX: finite(viewport.centerX, 0) + (after.x - before.x) / zoom,
    centerY: finite(viewport.centerY, 0) + (after.y - before.y) / zoom,
  };
}

export function shouldShowDetailedRigOverlay(zoom) {
  return clampZoom(zoom ?? 1) >= VEYRA_RIG_OVERLAY_MIN_ZOOM;
}
"""
t = replace_once(t, anchor, insert, 'workspace client compensation helpers')
write(p, t)

# ---------------------------------------------------------------------------
# Renderer/export: authored strokes scale naturally; detailed rig overlay is
# hidden at very low zoom while editor selection handles remain screen-sized.
# ---------------------------------------------------------------------------
p = 'src/veyra/renderer.js'
t = read(p)
t = replace_once(t,
"import { resizeNodeTransform } from './workspace.js';",
"import { resizeNodeTransform, shouldShowDetailedRigOverlay } from './workspace.js';",
'renderer workspace import')
t = replace_once(t,
"""        stroke: node.paint.stroke,
        'stroke-width': node.paint.strokeWidth,
        'vector-effect': 'non-scaling-stroke',
        class: 'sceneShape',""",
"""        stroke: node.paint.stroke,
        'stroke-width': node.paint.strokeWidth,
        class: 'sceneShape',""",
'authored node stroke scaling')
t = replace_once(t,
"""          stroke: mesh.paint.stroke,
          'stroke-width': mesh.paint.strokeWidth,
          'vector-effect': 'non-scaling-stroke',
        });""",
"""          stroke: mesh.paint.stroke,
          'stroke-width': mesh.paint.strokeWidth,
        });""",
'authored mesh stroke scaling')
t = replace_once(t,
"if (this.selectedRef?.kind === 'mesh' && this.selectedRef.id === mesh.id) {",
"if (this.selectedRef?.kind === 'mesh' && this.selectedRef.id === mesh.id && shouldShowDetailedRigOverlay(this.zoom)) {",
'low zoom mesh vertex overlay')
t = replace_once(t,
"""  #renderRigOverlay() {
    const overlay = svgElement('g', { class: 'rigOverlay' });
    for (const constraint of this.scene.constraints || []) {""",
"""  #renderRigOverlay() {
    const overlay = svgElement('g', { class: 'rigOverlay' });
    if (!shouldShowDetailedRigOverlay(this.zoom)) {
      overlay.setAttribute('data-overlay-policy', 'hidden-low-zoom');
      return overlay;
    }
    for (const constraint of this.scene.constraints || []) {""",
'low zoom rig overlay policy')
write(p, t)

p = 'src/veyra/geometry.js'
t = read(p)
t = replace_once(t,
" stroke-width=\"${node.paint.strokeWidth}\" vector-effect=\"non-scaling-stroke\"/>",
" stroke-width=\"${node.paint.strokeWidth}\"/>",
'export node stroke scaling')
t = replace_once(t,
" stroke-width=\"${mesh.paint.strokeWidth}\" vector-effect=\"non-scaling-stroke\"/>",
" stroke-width=\"${mesh.paint.strokeWidth}\"/>",
'export mesh stroke scaling')
write(p, t)

# ---------------------------------------------------------------------------
# Component runtime: structured evaluated runtime scopes and path-keyed buckets
# ---------------------------------------------------------------------------
p = 'src/veyra/components.js'
t = read(p)
start = t.index('export class ComponentRuntimeRegistry {')
end = t.index('\nexport function createComponentRuntimeRegistry', start)
new_runtime = r'''export const VEYRA_COMPONENT_RUNTIME_SCOPE_KIND = 'componentRuntimeScope';

function runtimeScopeRef(value, index) {
  const id = typeof value === 'string' ? value : value?.kind === 'componentInstance' ? value.id : null;
  if (!id) throw new TypeError(`Component runtime scope path[${index}] must be a componentInstance ref.`);
  return { kind: 'componentInstance', id: String(id) };
}

export function createComponentRuntimeScope(value) {
  let path;
  if (typeof value === 'string' || value?.kind === 'componentInstance') path = [value];
  else if (Array.isArray(value)) path = value;
  else if (value?.kind === VEYRA_COMPONENT_RUNTIME_SCOPE_KIND && Array.isArray(value.path)) path = value.path;
  else throw new TypeError('Component runtime scope must be an instance id/ref, typed scope, or ordered instance-ref path.');
  if (!path.length) throw new TypeError('Component runtime scope path cannot be empty.');
  return { kind: VEYRA_COMPONENT_RUNTIME_SCOPE_KIND, path: path.map(runtimeScopeRef) };
}

export function componentRuntimeScopeKey(value) {
  const scope = createComponentRuntimeScope(value);
  return JSON.stringify(scope.path.map((ref) => [ref.kind, ref.id]));
}

function scopeHasPrefix(scope, prefix) {
  if (prefix.path.length > scope.path.length) return false;
  return prefix.path.every((ref, index) => scope.path[index]?.kind === ref.kind && scope.path[index]?.id === ref.id);
}

export class ComponentRuntimeRegistry {
  #getDocument;
  #buckets = new Map();

  constructor(documentOrGetter) {
    this.#getDocument = typeof documentOrGetter === 'function' ? documentOrGetter : () => documentOrGetter;
  }

  #resolveScope(scopeInput) {
    const document = this.#getDocument();
    const scope = createComponentRuntimeScope(scopeInput);
    let instance = null;
    let component = null;
    let expectedOwner = null;
    for (let index = 0; index < scope.path.length; index += 1) {
      const ref = scope.path[index];
      instance = componentInstanceById(document, ref.id);
      if (!instance) throw new TypeError(`Unknown component instance ${ref.id} in runtime scope.`);
      if (expectedOwner && instance.artboard.id !== expectedOwner) {
        throw new TypeError(`Component runtime scope path is invalid at ${ref.id}; expected instance owned by source artboard ${expectedOwner}.`);
      }
      component = componentById(document, instance.component.id);
      if (!component) throw new TypeError(`Component instance ${ref.id} references missing component ${instance.component.id}.`);
      expectedOwner = component.source.id;
    }
    return { document, scope, key: componentRuntimeScopeKey(scope), instance, component };
  }

  #bucket(scopeInput) {
    const resolved = this.#resolveScope(scopeInput);
    let bucket = this.#buckets.get(resolved.key);
    if (!bucket || bucket.documentId !== resolved.document.id) {
      bucket = {
        scope: cloneValue(resolved.scope),
        timelineTimes: new Map(),
        machines: new Map(),
        machineTargets: new Map(),
        documentId: resolved.document.id,
      };
      this.#buckets.set(resolved.key, bucket);
    }
    return { ...resolved, bucket };
  }

  #validateSourceRef(document, instance, ref) {
    const component = componentById(document, instance.component.id);
    const sourceArtboardId = component?.source.id;
    if (!sourceArtboardId || entityArtboardId(document, ref) !== sourceArtboardId) {
      throw new TypeError(`${ref.kind}:${ref.id} is not owned by source artboard ${sourceArtboardId || '(missing)'}.`);
    }
  }

  #machineRuntimeFor(document, instance, bucket, controllerId) {
    const controller = { kind: 'stateMachine', id: String(controllerId) };
    this.#validateSourceRef(document, instance, controller);
    const targetId = effectiveMachineId(instance, controller.id);
    const target = { kind: 'stateMachine', id: targetId };
    this.#validateSourceRef(document, instance, target);
    if (!bucket.machines.has(controller.id) || bucket.machineTargets.get(controller.id) !== targetId) {
      bucket.machines.set(controller.id, createMachineRuntime(() => this.#getDocument(), targetId));
      bucket.machineTargets.set(controller.id, targetId);
    }
    return bucket.machines.get(controller.id);
  }

  setTimelineTime(scopeInput, timelineId, timeSeconds) {
    const { document, instance, bucket } = this.#bucket(scopeInput);
    const ref = { kind: 'timeline', id: String(timelineId) };
    this.#validateSourceRef(document, instance, ref);
    const effective = { kind: 'timeline', id: effectiveTimelineId(instance, ref.id) };
    this.#validateSourceRef(document, instance, effective);
    const time = Number(timeSeconds);
    if (!Number.isFinite(time) || time < 0) throw new TypeError('Component timeline time must be a finite non-negative number.');
    bucket.timelineTimes.set(ref.id, time);
    return time;
  }

  clearTimeline(scopeInput, timelineId = null) {
    const { bucket } = this.#bucket(scopeInput);
    if (timelineId == null) bucket.timelineTimes.clear();
    else bucket.timelineTimes.delete(String(timelineId));
  }

  machineRuntime(scopeInput, machineId) {
    const { document, instance, bucket } = this.#bucket(scopeInput);
    return this.#machineRuntimeFor(document, instance, bucket, String(machineId));
  }

  setMachineInput(scopeInput, machineId, inputId, value) {
    return this.machineRuntime(scopeInput, machineId).setInput(inputId, value);
  }

  fireMachineInput(scopeInput, machineId, inputId) {
    return this.machineRuntime(scopeInput, machineId).fire(inputId);
  }

  stepMachine(scopeInput, machineId, deltaSeconds) {
    return this.machineRuntime(scopeInput, machineId).step(deltaSeconds);
  }

  resetInstance(scopeInput) {
    const scope = createComponentRuntimeScope(scopeInput);
    const bucket = this.#buckets.get(componentRuntimeScopeKey(scope));
    if (!bucket) return false;
    bucket.timelineTimes.clear();
    for (const runtime of bucket.machines.values()) runtime.reset();
    return true;
  }

  resetSubtree(scopeInput) {
    const prefix = this.#resolveScope(scopeInput).scope;
    let reset = 0;
    for (const bucket of this.#buckets.values()) {
      if (!scopeHasPrefix(bucket.scope, prefix)) continue;
      bucket.timelineTimes.clear();
      for (const runtime of bucket.machines.values()) runtime.reset();
      reset += 1;
    }
    return reset;
  }

  deleteInstance(instanceId) {
    let removed = 0;
    for (const [key, bucket] of [...this.#buckets.entries()]) {
      if (!bucket.scope.path.some((ref) => ref.id === String(instanceId))) continue;
      this.#buckets.delete(key);
      removed += 1;
    }
    return removed > 0;
  }

  prune() {
    for (const [key, bucket] of [...this.#buckets.entries()]) {
      try { this.#resolveScope(bucket.scope); }
      catch { this.#buckets.delete(key); }
    }
    return this.#buckets.size;
  }

  listRuntimeScopes() {
    return [...this.#buckets.values()]
      .map((bucket) => cloneValue(bucket.scope))
      .sort((a, b) => componentRuntimeScopeKey(a).localeCompare(componentRuntimeScopeKey(b)));
  }

  evaluate(scopeInput) {
    const { document, instance, bucket, scope } = this.#bucket(scopeInput);
    const overrides = {};
    const timelineControllers = new Map(bucket.timelineTimes);
    const selectedTimelineId = instance.runtime?.timeline?.id || null;
    if (selectedTimelineId && !timelineControllers.has(selectedTimelineId)) timelineControllers.set(selectedTimelineId, 0);
    const timelineMappings = [];
    for (const [controllerId, timeSeconds] of [...timelineControllers.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const controller = { kind: 'timeline', id: controllerId };
      this.#validateSourceRef(document, instance, controller);
      const sourceTimelineId = effectiveTimelineId(instance, controllerId);
      const effective = { kind: 'timeline', id: sourceTimelineId };
      this.#validateSourceRef(document, instance, effective);
      const timeline = document.timelines.find((item) => item.id === sourceTimelineId);
      if (!timeline) throw new TypeError(`Component runtime timeline ${sourceTimelineId} does not exist.`);
      Object.assign(overrides, evaluateTimeline(timeline, timeSeconds));
      timelineMappings.push({ controllerId, sourceTimelineId, timeSeconds });
    }

    const machineControllers = new Set(bucket.machines.keys());
    const selectedMachineId = instance.runtime?.stateMachine?.id || null;
    if (selectedMachineId) machineControllers.add(selectedMachineId);
    const machineMappings = [];
    for (const controllerId of [...machineControllers].sort()) {
      const runtime = this.#machineRuntimeFor(document, instance, bucket, controllerId);
      Object.assign(overrides, runtime.evaluate().overrides);
      machineMappings.push({ controllerId, sourceMachineId: runtime.machineId });
    }

    return {
      instanceId: instance.id,
      runtimeScope: cloneValue(scope),
      overrides: mixedRuntimeOverrides(document, overrides, instance.runtime?.mix ?? 1),
      timelineIds: [...timelineControllers.keys()].sort(),
      machineIds: [...machineControllers].sort(),
      mappings: { timeline: timelineMappings, stateMachine: machineMappings },
      mix: Number(instance.runtime?.mix ?? 1),
    };
  }

  get size() { return this.#buckets.size; }
}'''
t = t[:start] + new_runtime + t[end:]

t = replace_once(t,
"function evaluatedProvenance(item, kind, component, instance, directSource) {",
"function evaluatedProvenance(item, kind, component, instance, directSource, runtimeScope) {",
'provenance scope signature')
t = replace_once(t,
"""    componentInstanceRef: directSource ? { kind: 'componentInstance', id: instance.id } : cloneValue(item.componentInstanceRef),
    evaluatedIdentity:""",
"""    componentInstanceRef: directSource ? { kind: 'componentInstance', id: instance.id } : cloneValue(item.componentInstanceRef),
    componentRuntimeScope: directSource ? cloneValue(runtimeScope) : cloneValue(item.componentRuntimeScope || runtimeScope),
    evaluatedIdentity:""",
'provenance runtime scope field')
t = replace_once(t,
"""  depth = 0,
  componentPath = [],
}) {""",
"""  depth = 0,
  componentPath = [],
  runtimeScopePath = [],
}) {""",
'evaluation runtime scope arg')
t = replace_once(t,
"""    const sourceDocument = applyInstanceOverrides(document, instance);
    const runtimeResult = runtimeRegistry
      ? runtimeRegistry.evaluate(instance.id)
      : createComponentRuntimeRegistry(document).evaluate(instance.id);
    const sourceScene = evaluateSource(sourceDocument, component.source.id, { animation: runtimeResult.overrides }, {
      depth: depth + 1,
      componentPath: [...componentPath, component.id],
    });""",
"""    const sourceDocument = applyInstanceOverrides(document, instance);
    const runtimeScope = createComponentRuntimeScope([...runtimeScopePath, { kind: 'componentInstance', id: instance.id }]);
    const runtimeResult = runtimeRegistry
      ? runtimeRegistry.evaluate(runtimeScope)
      : createComponentRuntimeRegistry(document).evaluate(runtimeScope);
    const sourceScene = evaluateSource(sourceDocument, component.source.id, { animation: runtimeResult.overrides }, {
      depth: depth + 1,
      componentPath: [...componentPath, component.id],
      runtimeScopePath: runtimeScope.path,
    });""",
'nested runtime scope evaluation')
t = t.replace("evaluatedProvenance(sourceNode, 'node', component, instance, directSource)", "evaluatedProvenance(sourceNode, 'node', component, instance, directSource, runtimeScope)")
t = t.replace("evaluatedProvenance(sourceBone, 'bone', component, instance, directSource)", "evaluatedProvenance(sourceBone, 'bone', component, instance, directSource, runtimeScope)")
t = t.replace("evaluatedProvenance(sourceMesh, 'mesh', component, instance, directSource)", "evaluatedProvenance(sourceMesh, 'mesh', component, instance, directSource, runtimeScope)")
t = t.replace("evaluatedProvenance(sourceControl, 'control', component, instance, directSource)", "evaluatedProvenance(sourceControl, 'control', component, instance, directSource, runtimeScope)")
t = t.replace("evaluatedProvenance(sourceConstraint, 'constraint', component, instance, directSource)", "evaluatedProvenance(sourceConstraint, 'constraint', component, instance, directSource, runtimeScope)")
write(p, t)

p = 'src/veyra/evaluation.js'
t = read(p)
t = replace_once(t,
"""    depth: Number(options.depth || 0),
    componentPath: options.componentPath || [],
    evaluateSource:""",
"""    depth: Number(options.depth || 0),
    componentPath: options.componentPath || [],
    runtimeScopePath: options.runtimeScopePath || [],
    evaluateSource:""",
'evaluator runtime scope propagation')
write(p, t)

p = 'src/veyra/projectGraph.js'
t = read(p)
t = replace_once(t,
"""    runtimeIsolation: 'per-component-instance',
    runtimeMapping:""",
"""    runtimeIsolation: {
      authoredTopLevel: 'per-component-instance',
      evaluatedNested: 'per-component-runtime-scope',
      scope: { kind: 'componentRuntimeScope', pathItemKind: 'componentInstance', persistent: false },
    },
    runtimeMapping:""",
'project graph runtime scope capability')
write(p, t)

# ---------------------------------------------------------------------------
# Public exports / browser surface use the same structured runtime scope.
# ---------------------------------------------------------------------------
p = 'src/index.js'
t = read(p)
t = replace_once(t,
"  VEYRA_MIN_NODE_SCALE,\n",
"  VEYRA_MIN_NODE_SCALE,\n  VEYRA_RIG_OVERLAY_MIN_ZOOM,\n",
'index workspace overlay export')
t = replace_once(t,
"  classifyArtboardResizeZone,\n",
"  classifyArtboardResizeZone,\n  compensateViewportForClientRect,\n",
'index compensation export')
t = replace_once(t,
"  shouldSuppressCanvasContextMenu,\n",
"  shouldShowDetailedRigOverlay,\n  shouldSuppressCanvasContextMenu,\n",
'index overlay helper export')
t = replace_once(t,
"  ComponentRuntimeRegistry, createComponentRuntimeRegistry, componentInstanceSourceMatrix, evaluateComponentContent, evaluateComponentInstances,\n",
"  VEYRA_COMPONENT_RUNTIME_SCOPE_KIND, ComponentRuntimeRegistry, createComponentRuntimeRegistry, createComponentRuntimeScope, componentRuntimeScopeKey, componentInstanceSourceMatrix, evaluateComponentContent, evaluateComponentInstances,\n",
'index runtime scope exports')
write(p, t)

p = 'veyra.js'
t = read(p)
t = replace_once(t,
"import { createComponentRuntimeRegistry } from './src/veyra/components.js';",
"import { createComponentRuntimeRegistry, createComponentRuntimeScope } from './src/veyra/components.js';",
'browser runtime scope import')
t = replace_once(t,
"  classifyArtboardResizeZone,\n",
"  classifyArtboardResizeZone,\n  compensateViewportForClientRect,\n",
'browser compensation import')
old_apply = """function applyWorkspaceLayout(persist = true) {
  workspaceLayout = normalizeWorkspaceLayout(workspaceLayout, { width: window.innerWidth, height: window.innerHeight });
  for (const [property, value] of Object.entries(workspaceCssVariables(workspaceLayout, { width: window.innerWidth, height: window.innerHeight }))) {
    document.documentElement.style.setProperty(property, value);
  }
  workspace.dataset.leftCollapsed = String(workspaceLayout.leftCollapsed);
  workspace.dataset.rightCollapsed = String(workspaceLayout.rightCollapsed);
  timelinePanel.dataset.collapsed = String(workspaceLayout.bottomCollapsed);
  hierarchyCollapse?.setAttribute('aria-expanded', String(!workspaceLayout.leftCollapsed));
  inspectorCollapse?.setAttribute('aria-expanded', String(!workspaceLayout.rightCollapsed));
  $('toggleHierarchyPanel')?.setAttribute('aria-expanded', String(!workspaceLayout.leftCollapsed));
  $('toggleInspector')?.setAttribute('aria-expanded', String(!workspaceLayout.rightCollapsed));
  timelineToggle.setAttribute('aria-expanded', String(!workspaceLayout.bottomCollapsed));
  timelineToggle.title = workspaceLayout.bottomCollapsed ? 'Expand timeline' : 'Collapse timeline';
  if (persist) localStorage.setItem(UI_LAYOUT_KEY, JSON.stringify(workspaceLayout));
  requestAnimationFrame(() => {
    renderer.syncViewport();
    syncArtboardFrame();
  });
  return { ...workspaceLayout };
}
"""
new_apply = """function stageViewportClientRect() {
  const rect = stageViewport.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function captureWorkspaceClientAnchor() {
  return { viewport: renderer.getViewport(), rect: stageViewportClientRect() };
}

function applyWorkspaceLayout(persist = true, cameraAnchor = null) {
  workspaceLayout = normalizeWorkspaceLayout(workspaceLayout, { width: window.innerWidth, height: window.innerHeight });
  for (const [property, value] of Object.entries(workspaceCssVariables(workspaceLayout, { width: window.innerWidth, height: window.innerHeight }))) {
    document.documentElement.style.setProperty(property, value);
  }
  workspace.dataset.leftCollapsed = String(workspaceLayout.leftCollapsed);
  workspace.dataset.rightCollapsed = String(workspaceLayout.rightCollapsed);
  timelinePanel.dataset.collapsed = String(workspaceLayout.bottomCollapsed);
  hierarchyCollapse?.setAttribute('aria-expanded', String(!workspaceLayout.leftCollapsed));
  inspectorCollapse?.setAttribute('aria-expanded', String(!workspaceLayout.rightCollapsed));
  $('toggleHierarchyPanel')?.setAttribute('aria-expanded', String(!workspaceLayout.leftCollapsed));
  $('toggleInspector')?.setAttribute('aria-expanded', String(!workspaceLayout.rightCollapsed));
  timelineToggle.setAttribute('aria-expanded', String(!workspaceLayout.bottomCollapsed));
  timelineToggle.title = workspaceLayout.bottomCollapsed ? 'Expand timeline' : 'Collapse timeline';
  if (persist) localStorage.setItem(UI_LAYOUT_KEY, JSON.stringify(workspaceLayout));
  requestAnimationFrame(() => {
    if (cameraAnchor && renderer.scene) {
      const applied = renderer.setViewport(compensateViewportForClientRect(
        cameraAnchor.viewport,
        cameraAnchor.rect,
        stageViewportClientRect(),
      ));
      zoom = applied.zoom;
      updateZoomLabel();
    } else {
      renderer.syncViewport();
    }
    syncArtboardFrame();
  });
  return { ...workspaceLayout };
}
"""
t = replace_once(t, old_apply, new_apply, 'browser anchored workspace apply')

t = replace_once(t,
"""timelineToggle.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'bottom', !workspaceLayout.bottomCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};""",
"""timelineToggle.onclick = () => {
  const cameraAnchor = captureWorkspaceClientAnchor();
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'bottom', !workspaceLayout.bottomCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout(true, cameraAnchor);
};""",
'timeline anchored collapse')

t = replace_once(t,
"""    const startSize = workspaceLayout[property];
    element.setPointerCapture?.(event.pointerId);""",
"""    const startSize = workspaceLayout[property];
    const cameraAnchor = captureWorkspaceClientAnchor();
    element.setPointerCapture?.(event.pointerId);""",
'splitter immutable camera anchor')
t = t.replace('      applyWorkspaceLayout(false);\n', '      applyWorkspaceLayout(false, cameraAnchor);\n', 1)
t = t.replace('      applyWorkspaceLayout(true);\n', '      applyWorkspaceLayout(true, cameraAnchor);\n', 1)
t = replace_once(t,
"""  element.addEventListener('dblclick', () => {
    const property = panel === 'left' ? 'leftWidth' : panel === 'right' ? 'rightWidth' : 'bottomHeight';
    workspaceLayout = setWorkspacePanelSize(workspaceLayout, panel, VEYRA_WORKSPACE_LAYOUT_DEFAULTS[property], { width: window.innerWidth, height: window.innerHeight });
    applyWorkspaceLayout();
  });""",
"""  element.addEventListener('dblclick', () => {
    const cameraAnchor = captureWorkspaceClientAnchor();
    const property = panel === 'left' ? 'leftWidth' : panel === 'right' ? 'rightWidth' : 'bottomHeight';
    workspaceLayout = setWorkspacePanelSize(workspaceLayout, panel, VEYRA_WORKSPACE_LAYOUT_DEFAULTS[property], { width: window.innerWidth, height: window.innerHeight });
    applyWorkspaceLayout(true, cameraAnchor);
  });""",
splitter anchored reset')

t = replace_once(t,
"""hierarchyCollapse.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'left', !workspaceLayout.leftCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};
inspectorCollapse.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'right', !workspaceLayout.rightCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};""",
"""hierarchyCollapse.onclick = () => {
  const cameraAnchor = captureWorkspaceClientAnchor();
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'left', !workspaceLayout.leftCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout(true, cameraAnchor);
};
inspectorCollapse.onclick = () => {
  const cameraAnchor = captureWorkspaceClientAnchor();
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'right', !workspaceLayout.rightCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout(true, cameraAnchor);
};""",
'internal anchored collapse buttons')

t = replace_once(t,
"""toggleInspectorButton.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'right', !workspaceLayout.rightCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};
toggleHierarchyButton.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'left', !workspaceLayout.leftCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};""",
"""toggleInspectorButton.onclick = () => {
  const cameraAnchor = captureWorkspaceClientAnchor();
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'right', !workspaceLayout.rightCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout(true, cameraAnchor);
};
toggleHierarchyButton.onclick = () => {
  const cameraAnchor = captureWorkspaceClientAnchor();
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'left', !workspaceLayout.leftCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout(true, cameraAnchor);
};""",
'external anchored collapse buttons')

t = replace_once(t,
"""  getComponentRuntime: (instanceId) => cloneValue(componentRuntimeRegistry.evaluate(instanceId)),
  setComponentTimelineTime: (instanceId, timelineId, seconds) => { const result = componentRuntimeRegistry.setTimelineTime(instanceId, timelineId, seconds); evaluateCurrentFrame(); return result; },
  setComponentMachineInput: (instanceId, machineId, inputId, value) => { const result = componentRuntimeRegistry.setMachineInput(instanceId, machineId, inputId, value); evaluateCurrentFrame(); return result; },
  fireComponentMachineInput: (instanceId, machineId, inputId) => { const result = componentRuntimeRegistry.fireMachineInput(instanceId, machineId, inputId); evaluateCurrentFrame(); return result; },
  stepComponentMachine: (instanceId, machineId, deltaSeconds) => { const result = componentRuntimeRegistry.stepMachine(instanceId, machineId, deltaSeconds); evaluateCurrentFrame(); return result; },
  resetComponentRuntime: (instanceId) => { const result = componentRuntimeRegistry.resetInstance(instanceId); evaluateCurrentFrame(); return result; },""",
"""  createComponentRuntimeScope: (path) => cloneValue(createComponentRuntimeScope(path)),
  listComponentRuntimeScopes: () => cloneValue(componentRuntimeRegistry.listRuntimeScopes()),
  getComponentRuntime: (scope) => cloneValue(componentRuntimeRegistry.evaluate(scope)),
  setComponentTimelineTime: (scope, timelineId, seconds) => { const result = componentRuntimeRegistry.setTimelineTime(scope, timelineId, seconds); evaluateCurrentFrame(); return result; },
  setComponentMachineInput: (scope, machineId, inputId, value) => { const result = componentRuntimeRegistry.setMachineInput(scope, machineId, inputId, value); evaluateCurrentFrame(); return result; },
  fireComponentMachineInput: (scope, machineId, inputId) => { const result = componentRuntimeRegistry.fireMachineInput(scope, machineId, inputId); evaluateCurrentFrame(); return result; },
  stepComponentMachine: (scope, machineId, deltaSeconds) => { const result = componentRuntimeRegistry.stepMachine(scope, machineId, deltaSeconds); evaluateCurrentFrame(); return result; },
  resetComponentRuntime: (scope) => { const result = componentRuntimeRegistry.resetInstance(scope); evaluateCurrentFrame(); return result; },""",
'browser structured runtime scope API')
write(p, t)

# ---------------------------------------------------------------------------
# New focused adversarial suite for M6 Blockers 4 + 5.
# ---------------------------------------------------------------------------
test = r'''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformPoint } from '../src/veyra/contracts.js';
import { evaluateDocument } from '../src/veyra/evaluation.js';
import { renderSvgString } from '../src/veyra/geometry.js';
import { hitTestPoint } from '../src/veyra/hitTest.js';
import { parseVeyra, serializeVeyra } from '../src/veyra/io.js';
import { createDocument, createNode, createStateMachine, createTimeline, normalizeDocument } from '../src/veyra/model.js';
import { createArtboardRef, createComponentRef, createTimelineRef } from '../src/veyra/references.js';
import { projectGraphCapabilities } from '../src/veyra/projectGraph.js';
import { createComponentRuntimeRegistry, createComponentRuntimeScope, componentRuntimeScopeKey } from '../src/veyra/components.js';
import { createSvgViewBoxScreenTransform } from '../src/veyra/viewport.js';
import { VeyraStore } from '../src/veyra/store.js';
import {
  compensateViewportForClientRect,
  fitBoundsViewport,
  shouldShowDetailedRigOverlay,
} from '../src/veyra/workspace.js';

function close(actual, expected, epsilon = 1e-7, label = '') {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${label}: expected ${expected}, got ${actual}`);
}

function absoluteClient(world, artboard, viewport, rect) {
  const mapping = createSvgViewBoxScreenTransform(artboard, {
    width: rect.width, height: rect.height,
    zoom: viewport.zoom, centerX: viewport.centerX, centerY: viewport.centerY,
  });
  const local = transformPoint(mapping.matrix, world);
  return { x: rect.left + local.x, y: rect.top + local.y };
}

// Blocker 4A: panel chrome changes viewport client rectangles without moving a
// chosen world point on the monitor. Zoom is invariant and compensation is
// algebraic from one baseline, so splitter motion cannot accumulate drift.
{
  const artboard = { x: 0, y: 0, width: 1000, height: 700 };
  const viewport = { zoom: 1.75, centerX: 480, centerY: 330 };
  const world = { x: 410, y: 270 };
  const initial = { left: 250, top: 72, width: 900, height: 620 };
  const cases = [
    { left: 390, top: 72, width: 760, height: 620 },   // left panel wider
    { left: 250, top: 72, width: 760, height: 620 },   // right panel wider
    { left: 250, top: 72, width: 900, height: 470 },   // bottom panel taller
  ];
  const expected = absoluteClient(world, artboard, viewport, initial);
  for (const rect of cases) {
    const next = compensateViewportForClientRect(viewport, initial, rect);
    assert.equal(next.zoom, viewport.zoom);
    const actual = absoluteClient(world, artboard, next, rect);
    close(actual.x, expected.x, 1e-7, 'absolute client x');
    close(actual.y, expected.y, 1e-7, 'absolute client y');
  }

  const collapsed = { left: 0, top: 72, width: 1150, height: 620 };
  const collapsedView = compensateViewportForClientRect(viewport, initial, collapsed);
  const restored = compensateViewportForClientRect(collapsedView, collapsed, initial);
  close(restored.centerX, viewport.centerX, 1e-9, 'collapse roundtrip centerX');
  close(restored.centerY, viewport.centerY, 1e-9, 'collapse roundtrip centerY');
  assert.equal(restored.zoom, viewport.zoom);

  const sequence = [
    { left: 300, top: 72, width: 850, height: 620 },
    { left: 300, top: 72, width: 720, height: 620 },
    { left: 300, top: 72, width: 720, height: 440 },
    { left: 250, top: 72, width: 900, height: 620 },
  ];
  let currentView = viewport;
  let currentRect = initial;
  for (const rect of sequence) {
    currentView = compensateViewportForClientRect(currentView, currentRect, rect);
    currentRect = rect;
    assert.equal(currentView.zoom, viewport.zoom);
  }
  close(currentView.centerX, viewport.centerX, 1e-9, 'arbitrary sequence centerX');
  close(currentView.centerY, viewport.centerY, 1e-9, 'arbitrary sequence centerY');

  const node = createNode('rectangle', { id: 'anchored-hit', transform: { x: world.x, y: world.y }, geometry: { width: 80, height: 60 } });
  const doc = normalizeDocument(createDocument({ artboard, nodes: [node] }));
  const scene = evaluateDocument(doc);
  const finalRect = cases[0];
  const finalView = compensateViewportForClientRect(viewport, initial, finalRect);
  const mapping = createSvgViewBoxScreenTransform(artboard, { ...finalView, width: finalRect.width, height: finalRect.height });
  const local = transformPoint(mapping.matrix, world);
  assert.deepEqual(hitTestPoint(local, scene, { ...finalView, width: finalRect.width, height: finalRect.height }), { kind: 'node', id: 'anchored-hit' });
  const focused = fitBoundsViewport({ minX: 370, minY: 240, maxX: 450, maxY: 300 }, artboard, { width: finalRect.width, height: finalRect.height }, { padding: 44 });
  assert.ok(Number.isFinite(focused.centerX) && Number.isFinite(focused.centerY) && focused.zoom > 0);

  const store = new VeyraStore(doc);
  const beforeText = serializeVeyra(store.document);
  const beforeRevision = store.revision;
  const beforeHistory = store.commandHistory.length;
  compensateViewportForClientRect(viewport, initial, cases[1]);
  assert.equal(serializeVeyra(store.document), beforeText);
  assert.equal(store.revision, beforeRevision);
  assert.equal(store.commandHistory.length, beforeHistory);
}

// Blocker 4B: authored stroke width naturally follows the canonical camera
// scale; renderer/export do not opt authored content into non-scaling strokes.
{
  const artboard = { x: 0, y: 0, width: 800, height: 600 };
  const screen = { width: 800, height: 600 };
  for (const [zoom, expected] of [[0.1, 0.4], [0.5, 2], [1, 4], [2, 8]]) {
    const mapping = createSvgViewBoxScreenTransform(artboard, { ...screen, zoom, centerX: 400, centerY: 300 });
    close(4 * mapping.scale, expected, 1e-9, `4-world stroke at zoom ${zoom}`);
  }
  for (const zoom of [0.1, 0.25, 0.5, 1, 2, 4, 8]) {
    const mapping = createSvgViewBoxScreenTransform(artboard, { ...screen, zoom, centerX: 400, centerY: 300 });
    close((4 * mapping.scale) / (100 * mapping.scale), 0.04, 1e-12, `stroke/fill proportion ${zoom}`);
  }
  assert.equal(shouldShowDetailedRigOverlay(0.1), false);
  assert.equal(shouldShowDetailedRigOverlay(0.19), false);
  assert.equal(shouldShowDetailedRigOverlay(0.2), true);
  assert.equal(shouldShowDetailedRigOverlay(8), true);

  const node = createNode('rectangle', { id: 'stroke-node', geometry: { width: 100, height: 50 }, paint: { fill: '#ffffff', stroke: '#000000', strokeWidth: 4 } });
  const scene = evaluateDocument(normalizeDocument(createDocument({ artboard, nodes: [node] })));
  const svg = renderSvgString(scene);
  assert.doesNotMatch(svg, /non-scaling-stroke/, 'SVG export uses authored world-unit stroke semantics');
  const rendererSource = readFileSync(new URL('../src/veyra/renderer.js', import.meta.url), 'utf8');
  const geometrySource = readFileSync(new URL('../src/veyra/geometry.js', import.meta.url), 'utf8');
  assert.doesNotMatch(geometrySource, /non-scaling-stroke/);
  assert.match(rendererSource, /class: 'sceneShape'[\s\S]*?tabindex: '-1'/);
  assert.match(rendererSource, /class: 'meshTriangle'[\s\S]*?'stroke-width': mesh\.paint\.strokeWidth/);
  assert.equal((rendererSource.match(/non-scaling-stroke/g) || []).length, 1, 'only non-authored draft overlay retains non-scaling stroke');
  assert.match(rendererSource, /r: 5 \/ this\.zoom/, 'selection resize handles remain screen-sized/editor-only');
  assert.match(rendererSource, /data-overlay-policy', 'hidden-low-zoom'/);
}

function timeline(id, artboardId, address, from, to) {
  const item = createTimeline({
    id, name: id, duration: 30, fps: 30,
    tracks: [{ id: `${id}-track`, address, keyframes: [
      { id: `${id}-0`, frame: 0, value: from, easing: 'linear' },
      { id: `${id}-30`, frame: 30, value: to, easing: 'linear' },
    ] }],
  });
  item.artboard = createArtboardRef(artboardId);
  return item;
}

function oneStateMachine(id, artboardId, timelineId) {
  const machine = createStateMachine({
    id, name: id, initial: { kind: 'machineState', id: `${id}-state` },
    states: [{ id: `${id}-state`, name: 'State', type: 'animation', timeline: createTimelineRef(timelineId) }],
  });
  machine.artboard = createArtboardRef(artboardId);
  return machine;
}

function nestedRuntimeProject() {
  const node = createNode('rectangle', {
    id: 'inner-node', artboard: createArtboardRef('inner-source'),
    transform: { x: 10, y: 20 }, geometry: { width: 20, height: 20 },
    paint: { fill: '#33aa66', stroke: 'none', strokeWidth: 0 },
  });
  const txA = timeline('tx-a', 'inner-source', 'node:inner-node/transform/x', 10, 20);
  const txB = timeline('tx-b', 'inner-source', 'node:inner-node/transform/x', 100, 200);
  const tyA = timeline('ty-a', 'inner-source', 'node:inner-node/transform/y', 20, 30);
  const tyB = timeline('ty-b', 'inner-source', 'node:inner-node/transform/y', 80, 180);
  const machineA = oneStateMachine('machine-a', 'inner-source', 'ty-a');
  const machineB = oneStateMachine('machine-b', 'inner-source', 'ty-b');
  return normalizeDocument(createDocument({
    id: 'nested-runtime-scope',
    artboards: [
      { id: 'inner-source', name: 'Inner Source', x: 0, y: 0, width: 100, height: 100, background: '#ffffff' },
      { id: 'outer-source', name: 'Outer Source', x: 0, y: 0, width: 200, height: 120, background: '#ffffff' },
      { id: 'host', name: 'Host', x: 0, y: 0, width: 700, height: 300, background: '#eeeeee' },
    ],
    nodes: [node], timelines: [txA, txB, tyA, tyB], stateMachines: [machineA, machineB],
    components: [
      { id: 'inner-component', name: 'Inner', source: createArtboardRef('inner-source') },
      { id: 'outer-component', name: 'Outer', source: createArtboardRef('outer-source') },
    ],
    componentInstances: [
      {
        id: 'inner-instance', name: 'Nested Runtime', artboard: createArtboardRef('outer-source'), component: createComponentRef('inner-component'),
        transform: { x: 20, y: 0 }, frame: { width: 100, height: 100 }, fit: 'none',
        runtime: {
          timeline: createTimelineRef('tx-a'), stateMachine: { kind: 'stateMachine', id: 'machine-a' }, mix: 0.5,
          remap: { timeline: createTimelineRef('tx-b'), stateMachine: { kind: 'stateMachine', id: 'machine-b' } },
        },
      },
      { id: 'outer-A', name: 'Outer A', artboard: createArtboardRef('host'), component: createComponentRef('outer-component'), transform: { x: 100, y: 40 }, frame: { width: 200, height: 120 }, fit: 'none' },
      { id: 'outer-B', name: 'Outer B', artboard: createArtboardRef('host'), component: createComponentRef('outer-component'), transform: { x: 350, y: 40 }, frame: { width: 200, height: 120 }, fit: 'none' },
    ],
  }));
}

// Blocker 5: the same authored inner instance has independent runtime buckets
// under two outer evaluated paths. Scope identity is typed, ephemeral and name/
// order invariant.
{
  let doc = nestedRuntimeProject();
  const registry = createComponentRuntimeRegistry(() => doc);
  const scopeA = createComponentRuntimeScope([
    { kind: 'componentInstance', id: 'outer-A' },
    { kind: 'componentInstance', id: 'inner-instance' },
  ]);
  const scopeB = createComponentRuntimeScope([
    { kind: 'componentInstance', id: 'outer-B' },
    { kind: 'componentInstance', id: 'inner-instance' },
  ]);
  assert.notEqual(componentRuntimeScopeKey(scopeA), componentRuntimeScopeKey(scopeB));
  assert.deepEqual(scopeA.path.map((ref) => ref.kind), ['componentInstance', 'componentInstance']);

  registry.setTimelineTime(scopeA, 'tx-a', 1);
  registry.setTimelineTime(scopeB, 'tx-a', 0);
  registry.stepMachine(scopeA, 'machine-a', 1);
  registry.stepMachine(scopeB, 'machine-a', 0);
  const scene = evaluateDocument(doc, {}, null, { artboardId: 'host', componentRuntime: registry });
  const nested = scene.nodes.filter((item) => item.sourceRef?.id === 'inner-node');
  const a = nested.find((item) => componentRuntimeScopeKey(item.componentRuntimeScope) === componentRuntimeScopeKey(scopeA));
  const b = nested.find((item) => componentRuntimeScopeKey(item.componentRuntimeScope) === componentRuntimeScopeKey(scopeB));
  assert.ok(a && b, 'both evaluated nested runtime scopes are visible in the scene');
  close(a.worldMatrix[4] - 100, 125, 1e-7, 'outer A remapped/mixed timeline'); // 20 wrapper + mix(10,200,.5)=105
  close(b.worldMatrix[4] - 350, 75, 1e-7, 'outer B remapped/mixed timeline');   // 20 wrapper + mix(10,100,.5)=55
  close(a.worldMatrix[5] - 40, 100, 1e-7, 'outer A remapped/mixed machine');   // mix(20,180,.5)=100
  close(b.worldMatrix[5] - 40, 50, 1e-7, 'outer B remapped/mixed machine');    // mix(20,80,.5)=50

  assert.equal(doc.nodes.find((item) => item.id === 'inner-node').transform.x, 10);
  assert.equal(doc.nodes.find((item) => item.id === 'inner-node').transform.y, 20);
  assert.equal(registry.evaluate(scopeA).mappings.timeline[0].sourceTimelineId, 'tx-b');
  assert.equal(registry.evaluate(scopeB).mappings.stateMachine[0].sourceMachineId, 'machine-b');

  assert.equal(registry.resetInstance(scopeA), true);
  const resetScene = evaluateDocument(doc, {}, null, { artboardId: 'host', componentRuntime: registry });
  const resetA = resetScene.nodes.find((item) => item.sourceRef?.id === 'inner-node' && componentRuntimeScopeKey(item.componentRuntimeScope) === componentRuntimeScopeKey(scopeA));
  const liveB = resetScene.nodes.find((item) => item.sourceRef?.id === 'inner-node' && componentRuntimeScopeKey(item.componentRuntimeScope) === componentRuntimeScopeKey(scopeB));
  close(resetA.worldMatrix[4] - 100, 75, 1e-7, 'reset A returns only A timeline to default');
  close(liveB.worldMatrix[4] - 350, 75, 1e-7, 'B timeline remains independent');
  close(resetA.worldMatrix[5] - 40, 50, 1e-7, 'reset A machine returns to default');
  close(liveB.worldMatrix[5] - 40, 50, 1e-7, 'B machine remains unchanged');

  // Re-advance A, then rename/reorder authored instances. Stable IDs keep the
  // scoped runtime mapping deterministic.
  registry.setTimelineTime(scopeA, 'tx-a', 1);
  registry.stepMachine(scopeA, 'machine-a', 1);
  const beforeReorder = evaluateDocument(doc, {}, null, { artboardId: 'host', componentRuntime: registry }).nodes
    .filter((item) => item.sourceRef?.id === 'inner-node')
    .map((item) => [componentRuntimeScopeKey(item.componentRuntimeScope), item.worldMatrix[4], item.worldMatrix[5]])
    .sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
  doc = normalizeDocument({
    ...JSON.parse(serializeVeyra(doc)),
    componentInstances: JSON.parse(serializeVeyra(doc)).componentInstances
      .map((item) => item.id === 'outer-A' ? { ...item, name: 'banana' } : item.id === 'outer-B' ? { ...item, name: 'Layer' } : item)
      .reverse(),
  });
  const afterReorder = evaluateDocument(doc, {}, null, { artboardId: 'host', componentRuntime: registry }).nodes
    .filter((item) => item.sourceRef?.id === 'inner-node')
    .map((item) => [componentRuntimeScopeKey(item.componentRuntimeScope), item.worldMatrix[4], item.worldMatrix[5]])
    .sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
  assert.deepEqual(afterReorder, beforeReorder);

  const serialized = serializeVeyra(doc);
  assert.doesNotMatch(serialized, /componentRuntimeScope|componentEval:/, 'runtime scopes/buckets remain ephemeral');
  assert.deepEqual(parseVeyra(serialized), doc);

  assert.ok(registry.listRuntimeScopes().some((scope) => componentRuntimeScopeKey(scope) === componentRuntimeScopeKey(scopeA)));
  assert.ok(registry.listRuntimeScopes().some((scope) => componentRuntimeScopeKey(scope) === componentRuntimeScopeKey(scopeB)));
  assert.equal(registry.deleteInstance('outer-A'), true);
  assert.equal(registry.listRuntimeScopes().some((scope) => scope.path.some((ref) => ref.id === 'outer-A')), false);
  assert.equal(registry.listRuntimeScopes().some((scope) => componentRuntimeScopeKey(scope) === componentRuntimeScopeKey(scopeB)), true, 'deleting A runtime state preserves B');

  const caps = projectGraphCapabilities();
  assert.equal(caps.runtimeIsolation.evaluatedNested, 'per-component-runtime-scope');
  assert.deepEqual(caps.runtimeIsolation.scope, { kind: 'componentRuntimeScope', pathItemKind: 'componentInstance', persistent: false });
}

// Production source gates: browser panel mutations capture one camera anchor;
// nested browser runtime methods accept the canonical scope object rather than
// introducing a second address scheme.
{
  const browserSource = readFileSync(new URL('../veyra.js', import.meta.url), 'utf8');
  assert.match(browserSource, /function captureWorkspaceClientAnchor\(\)/);
  assert.match(browserSource, /compensateViewportForClientRect\(/);
  assert.match(browserSource, /const cameraAnchor = captureWorkspaceClientAnchor\(\);[\s\S]*?applyWorkspaceLayout\(false, cameraAnchor\)/);
  assert.match(browserSource, /createComponentRuntimeScope: \(path\)/);
  assert.match(browserSource, /getComponentRuntime: \(scope\)/);
  assert.match(browserSource, /setComponentTimelineTime: \(scope, timelineId, seconds\)/);
}

console.log('veyra M6 final workspace/stroke/runtime-scope correction tests passed');
'''
write('tests/veyra-m6-final-corrections.test.mjs', test)

print('M6 final corrections applied')
