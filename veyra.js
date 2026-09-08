import {
  cloneValue,
  boneById,
  constraintById,
  controlById,
  createDocument,
  createId,
  createGradientStop,
  createLinearGradient,
  createNode,
  createRadialGradient,
  createSolidFill,
  createStarterDocument,
  createTimeline,
  descendantIds,
  machineById,
  meshById,
  nodeById,
  semanticFor,
  timelineById,
  trackByAddress,
  VEYRA_LISTENER_ACTIONS,
  VEYRA_LISTENER_EVENTS,
} from './src/veyra/model.js';
import {
  IDENTITY_MATRIX,
  degreesToRadians,
  invertMatrix,
  matrixRotation,
  radiansToDegrees,
  transformMatrix,
  transformPoint,
} from './src/veyra/contracts.js';
import { evaluateDocument } from './src/veyra/evaluation.js';
import { AnimationPlayback, evaluateTimeline, normalizeFrame } from './src/veyra/animation.js';
import { parseVeyra, downloadSvg, downloadVeyra, serializeVeyra } from './src/veyra/io.js';
import { isAnimatableProperty, nodePropertyAddress, readProperty, rigPropertyAddress, writeProperty } from './src/veyra/properties.js';
import {
  createBoneRef,
  createControlRef,
  createMachineInputRef,
  createMachineStateRef,
  createMeshVertexRef,
  createNodeRef,
  createTimelineRef,
  referenceId,
} from './src/veyra/references.js';
import { VeyraRenderer } from './src/veyra/renderer.js';
import { mirrorMeshWeights, normalizeMeshWeights } from './src/veyra/rigging.js';
import { VeyraStore } from './src/veyra/store.js';
import { createArtboardResizeGesture } from './src/veyra/gestures.js';
import { createMachineRuntime } from './src/veyra/stateMachine.js';
import { createSceneSummary } from './src/veyra/summary.js';
import { buildSemanticIndex } from './src/veyra/resolver.js';
import { createVeyraControlPlane } from './src/veyra/controlPlane.js';
import { createShellInteractionBridge, createPreviewPointerHandlers } from './src/veyra/shellBridge.js';
import { createInteractionDispatcher } from './src/veyra/interactionTransport.js';
import { createMachineInteractionBridge } from './src/veyra/interactionHost.js';
import {
  VEYRA_WORKSPACE_LAYOUT_DEFAULTS,
  artboardResizeCursor,
  classifyArtboardResizeZone,
  evaluatedRefBounds,
  fitArtboardViewport,
  fitBoundsViewport,
  navigationPanKind,
  normalizeTheme,
  normalizeWheelDelta,
  normalizeWorkspaceLayout,
  panGestureMoved,
  setWorkspacePanelCollapsed,
  setWorkspacePanelSize,
  shouldSuppressCanvasContextMenu,
  wheelZoomFactor,
  workspaceCssVariables,
} from './src/veyra/workspace.js';

const $ = (id) => document.getElementById(id);
const AUTOSAVE_KEY = 'veyra.autosave.v1';
const UI_THEME_KEY = 'veyra.ui-theme.v1';
const UI_LAYOUT_KEY = 'veyra.workspace-layout.v1';

const documentName = $('documentName');
const saveState = $('saveState');
const hierarchy = $('hierarchy');
const inspector = $('inspector');
const inspectorTitle = $('inspectorTitle');
const selectedType = $('selectedType');
const nodeCount = $('nodeCount');
const deleteNodeButton = $('deleteNode');
const statusText = $('statusText');
const selectionStatus = $('selectionStatus');
const undoButton = $('undo');
const redoButton = $('redo');
const zoomValue = $('zoomValue');
const artboardFrame = $('artboardFrame');
const stagePanel = document.querySelector('.stagePanel');
const stageViewport = $('stageViewport');
const canvas = $('veyraCanvas');
const toolHint = $('toolHint');
const openFile = $('openFile');
const toast = $('toast');
const inspectorPanel = $('inspectorPanel');
const timelinePanel = $('timelinePanel');
const timelineToggle = $('timelineToggle');
const timelineSelect = $('timelineSelect');
const timelineAdd = $('timelineAdd');
const timelineDelete = $('timelineDelete');
const playToggle = $('playToggle');
const playStop = $('playStop');
const playToStart = $('playToStart');
const frameReadout = $('frameReadout');
const keyframeSelected = $('keyframeSelected');
const autoKeyToggle = $('autoKeyToggle');
const loopMode = $('loopMode');
const fpsInput = $('fpsInput');
const durationInput = $('durationInput');
const workStartInput = $('workStartInput');
const workEndInput = $('workEndInput');
const themeSelect = $('themeSelect');
const timelineTracks = $('timelineTracks');
const timelineGrid = $('timelineGrid');
const timelineGridWrap = $('timelineGridWrap');
const timelineRuler = $('timelineRuler');
const keyframeBar = $('keyframeBar');
const playhead = $('playhead');
const workspace = document.querySelector('.workspace');
const leftSplitter = $('leftSplitter');
const rightSplitter = $('rightSplitter');
const timelineSplitter = $('timelineSplitter');
const hierarchyCollapse = $('hierarchyCollapse');
const inspectorCollapse = $('inspectorCollapse');

function applyTheme(theme) {
  const nextTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  themeSelect.value = nextTheme;
  return nextTheme;
}

applyTheme(localStorage.getItem(UI_THEME_KEY));
themeSelect.onchange = () => {
  const before = serializeVeyra(store.document);
  const nextTheme = applyTheme(themeSelect.value);
  localStorage.setItem(UI_THEME_KEY, nextTheme);
  if (serializeVeyra(store.document) !== before) throw new Error('Theme change mutated authored document.');
};

function loadWorkspaceLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_LAYOUT_KEY) || 'null');
    return normalizeWorkspaceLayout(saved || {}, { width: window.innerWidth, height: window.innerHeight });
  } catch {
    return normalizeWorkspaceLayout({}, { width: window.innerWidth, height: window.innerHeight });
  }
}

let workspaceLayout = loadWorkspaceLayout();

let toastTimer = null;
let autosaveTimer = null;
let playbackRaf = null;
let playbackOffsetFrames = 0;
let playbackLoopMode = null;
let zoom = 1;
let currentTool = 'select';
let savedRevision = 0;
let evaluatedScene = null;
let animationPlayback = null;
let activeTimelineId = null;
let currentFrame = 0;
let interactionSceneRevision = 0;
let selectedTrackAddress = null;
let selectedKeyframe = null;
let suppressKeyframeClick = false;
let keyframeDragPointerId = null;
let timelinePxPerFrame = 20;
let lastEasing = 'linear';
let lastEasingParams = null;
let draftPathPoints = [];
const selectedMeshVertices = new Map();

function restoredDocument() {
  if (new URLSearchParams(location.search).has('fresh')) return null;
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    return text ? parseVeyra(text) : null;
  } catch (error) {
    console.warn('Veyra autosave could not be restored:', error);
    return null;
  }
}

const restored = restoredDocument();
const store = new VeyraStore(restored || createStarterDocument());
if (restored) savedRevision = -1;
const machineInteractionBridge = createMachineInteractionBridge({
  getDocument: () => store.document,
  onInvalidate: () => {
    if (evaluatedScene) evaluateCurrentFrame();
  },
});
const interactionDispatcher = createInteractionDispatcher({
  transport: {
    hasTimeline: (timelineId) => !!timelineById(store.document, timelineId),
    setActiveTimeline: (timelineId) => { activeTimelineId = timelineId; },
    play: (options) => playAnimation(options),
    stop: () => stopAnimation(),
    seek: (frame) => setCurrentFrame(frame),
  },
  runtime: machineInteractionBridge,
  onDiagnostic: (message) => showToast(message, true),
});
const interactionBridge = createShellInteractionBridge({
  document: store.document,
  onDiagnostic: (message) => showToast(message, true),
  onIntent: (intent) => dispatchInteractionIntent(intent),
});
const renderer = new VeyraRenderer($('veyraCanvas'), {
  select: (reference) => store.select(reference),
  drawPoint: (point) => {
    draftPathPoints.push({ x: point.x, y: point.y });
    renderer.setDraftPath(draftPathPoints);
    setStatus(`${draftPathPoints.length} path point${draftPathPoints.length === 1 ? '' : 's'} · Enter to commit`);
  },
  begin: (label) => store.begin(label),
  moveNode: (nodeId, next) => store.mutate((documentModel) => {
    writeProperty(documentModel, nodePropertyAddress(nodeId, 'transform.x'), next.x);
    writeProperty(documentModel, nodePropertyAddress(nodeId, 'transform.y'), next.y);
  }, 'drag'),
  resizeNode: (nodeId, next) => store.mutate((documentModel) => {
    for (const property of ['x', 'y', 'scaleX', 'scaleY']) {
      writeProperty(documentModel, nodePropertyAddress(nodeId, `transform.${property}`), next[property]);
    }
  }, 'drag'),
  moveGroup: (groupId, delta) => store.mutate((documentModel) => {
    const target = nodeById(documentModel, groupId);
    writeProperty(documentModel, nodePropertyAddress(groupId, 'transform.x'), target.transform.x + delta.x);
    writeProperty(documentModel, nodePropertyAddress(groupId, 'transform.y'), target.transform.y + delta.y);
  }, 'drag'),
  moveHandle: (nodeId, vertexIndex, prefix, next) => store.mutate((documentModel) => {
    const vertexId = nodeById(documentModel, nodeId).geometry.vertices[vertexIndex].id;
    writeProperty(documentModel, nodePropertyAddress(nodeId, ['geometry', 'vertices', vertexId, `${prefix}X`]), next.x);
    writeProperty(documentModel, nodePropertyAddress(nodeId, ['geometry', 'vertices', vertexId, `${prefix}Y`]), next.y);
  }, 'drag'),
  moveVertex: (nodeId, vertexIndex, next) => store.mutate((documentModel) => {
    const vertexId = nodeById(documentModel, nodeId).geometry.vertices[vertexIndex].id;
    writeProperty(documentModel, nodePropertyAddress(nodeId, ['geometry', 'vertices', vertexId, 'x']), next.x);
    writeProperty(documentModel, nodePropertyAddress(nodeId, ['geometry', 'vertices', vertexId, 'y']), next.y);
  }, 'drag'),
  moveControl: (controlId, next) => store.mutate((documentModel) => {
    writeProperty(documentModel, rigPropertyAddress('control', controlId, 'position.x'), next.x);
    writeProperty(documentModel, rigPropertyAddress('control', controlId, 'position.y'), next.y);
  }, 'drag'),
  moveBoneEnd: (boneId, point, modifiers) => store.mutate((documentModel) => {
    const bone = boneById(documentModel, boneId);
    const boneState = evaluatedScene?.bones.find((candidate) => candidate.id === boneId);
    if (!bone || !boneState) return;
    const ik = documentModel.constraints.find((constraint) => constraint.enabled
      && constraint.type === 'ik'
      && constraint.bones.some((reference) => referenceId(reference, 'bone') === boneId));
    const pivot = ik
      ? evaluatedScene.bones.find((candidate) => candidate.id === referenceId(ik.bones[0], 'bone'))?.start || boneState.start
      : boneState.start;
    let target = point;
    if (modifiers.shift) {
      const distance = Math.hypot(point.x - pivot.x, point.y - pivot.y);
      const angle = Math.round(Math.atan2(point.y - pivot.y, point.x - pivot.x) / (Math.PI / 12)) * (Math.PI / 12);
      target = { x: pivot.x + Math.cos(angle) * distance, y: pivot.y + Math.sin(angle) * distance };
    }
    if (ik) {
      const control = controlById(documentModel, referenceId(ik.target, 'control'));
      control.position.x = target.x;
      control.position.y = target.y;
      return;
    }
    const parentId = referenceId(bone.parent, 'bone');
    const parentState = parentId ? evaluatedScene.bones.find((candidate) => candidate.id === parentId) : null;
    const desiredWorldRotation = Math.atan2(target.y - boneState.start.y, target.x - boneState.start.x);
    bone.pose.rotation = desiredWorldRotation - matrixRotation(parentState?.worldMatrix || IDENTITY_MATRIX) - bone.rest.rotation;
  }, 'drag'),
  moveBoneStart: (boneId, point, modifiers) => store.mutate((documentModel) => {
    const bone = boneById(documentModel, boneId);
    const boneState = evaluatedScene?.bones.find((candidate) => candidate.id === boneId);
    if (!bone || !boneState) return;
    let target = point;
    if (modifiers.shift) {
      const dx = point.x - boneState.start.x;
      const dy = point.y - boneState.start.y;
      target = Math.abs(dx) >= Math.abs(dy)
        ? { x: point.x, y: boneState.start.y }
        : { x: boneState.start.x, y: point.y };
    }
    const parentId = referenceId(bone.parent, 'bone');
    const parentWorld = parentId
      ? evaluatedScene.bones.find((candidate) => candidate.id === parentId)?.worldMatrix || IDENTITY_MATRIX
      : IDENTITY_MATRIX;
    const pointInParent = transformPoint(invertMatrix(parentWorld), target);
    const pointInRest = transformPoint(invertMatrix(transformMatrix({
      ...bone.rest,
      skewX: 0,
      skewY: 0,
      pivotX: 0,
      pivotY: 0,
    })), pointInParent);
    bone.pose.x = pointInRest.x;
    bone.pose.y = pointInRest.y;
  }, 'drag'),
  commit: () => store.commit(),
  cancel: () => store.cancel(),
});

function applyWorkspaceLayout(persist = true) {
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

applyWorkspaceLayout(false);

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('isError', error);
  toast.classList.add('isVisible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('isVisible'), 2600);
}

function setStatus(message) {
  statusText.textContent = message;
}

function commit(label, mutation) {
  try {
    store.execute(label, mutation);
    return true;
  } catch (error) {
    console.error(error);
    showToast(error.message || String(error), true);
    renderAll('validation-error');
    return false;
  }
}

function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (className) svg.setAttribute('class', className);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

function nodeIcon(type) {
  return type === 'group' ? 'group' : type;
}

const TOOL_HINTS = Object.freeze({
  select: 'Select artwork. Select a Path to reveal and drag its vertices.',
  vertex: 'Select a Path, then drag its cyan vertices. Escape returns to Select.',
  pencil: 'Click to place path points. Enter commits; Escape cancels.',
  bone: 'Drag a bone end to pose it; drag its joint to translate. IK bones move their target.',
  mesh: 'Select a mesh, choose a vertex, and edit each bone influence in Properties.',
  control: 'Drag yellow controls to solve IK and other control-driven constraints.',
  constraint: 'Select a constraint to edit targets, strength, order, and solver settings.',
  pan: 'Drag anywhere to pan the canvas. Alt+drag works from every tool.',
});

function setTool(tool, selectComponent = true) {
  if (currentTool === 'pencil' && tool !== 'pencil') {
    draftPathPoints = [];
    renderer.setDraftPath([]);
  }
  currentTool = tool;
  renderer.setTool(tool);
  stagePanel.dataset.tool = tool;
  toolHint.textContent = TOOL_HINTS[tool];
  document.querySelectorAll('[data-tool]').forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle('isActive', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (!selectComponent) return;
  const candidate = {
    bone: store.document.bones[0],
    mesh: store.document.meshes[0],
    control: store.document.controls[0],
    constraint: store.document.constraints[0],
  }[tool];
  if (candidate) store.select({ kind: tool, id: candidate.id });
  // Tool choice affects renderer overlays (notably path vertex controls),
  // so repaint immediately instead of waiting for a later document change.
  if (evaluatedScene) renderer.render(evaluatedScene, store.selectedRef);
  setStatus(`${tool[0].toUpperCase()}${tool.slice(1)} tool`);
}

function renderHierarchy() {
  hierarchy.replaceChildren();
  const children = new Map();
  for (const node of store.document.nodes) {
    const key = referenceId(node.parent, 'node') || '__root__';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(node);
  }

  const appendNode = (node, depth) => {
    const row = document.createElement('div');
    row.className = 'treeRow';
    row.classList.toggle('isSelected', store.selectedKind === 'node' && node.id === store.selectedId);
    row.classList.toggle('isHidden', !node.visible);

    const select = document.createElement('button');
    select.className = 'treeSelect';
    select.style.paddingLeft = `${8 + depth * 15}px`;
    select.setAttribute('role', 'treeitem');
    select.setAttribute('aria-selected', String(store.selectedKind === 'node' && node.id === store.selectedId));
    select.title = `${node.name} · ${node.type}`;
    select.append(icon(nodeIcon(node.type), 'treeIcon'));
    const name = document.createElement('span');
    name.className = 'treeName';
    name.textContent = node.name;
    select.appendChild(name);
    select.onclick = () => store.select({ kind: 'node', id: node.id });

    const visible = document.createElement('button');
    visible.className = 'treeUtility';
    visible.title = node.visible ? 'Hide object' : 'Show object';
    visible.setAttribute('aria-label', visible.title);
    visible.append(icon(node.visible ? 'eye' : 'eye-off'));
    visible.onclick = () => nodePropertyMutation(
      node,
      'visible',
      `${node.visible ? 'Hide' : 'Show'} ${node.name}`,
      !node.visible,
    );

    const focus = document.createElement('button');
    focus.className = 'treeUtility treeFocus';
    focus.title = 'Focus object';
    focus.setAttribute('aria-label', `Focus ${node.name}`);
    focus.append(icon('fit'));
    focus.onclick = () => focusEditorReference({ kind: 'node', id: node.id });

    const locked = document.createElement('button');
    locked.className = 'treeUtility';
    locked.title = node.locked ? 'Unlock object' : 'Lock object';
    locked.setAttribute('aria-label', locked.title);
    locked.append(icon(node.locked ? 'lock' : 'unlock'));
    locked.onclick = () => nodePropertyMutation(
      node,
      'locked',
      `${node.locked ? 'Unlock' : 'Lock'} ${node.name}`,
      !node.locked,
    );

    row.append(select, focus, visible, locked);
    hierarchy.appendChild(row);
    for (const child of children.get(node.id) || []) appendNode(child, depth + 1);
  };

  const sectionLabel = (text) => {
    const label = document.createElement('div');
    label.className = 'treeSectionLabel';
    label.textContent = text;
    hierarchy.appendChild(label);
  };

  const rigCategoryLabel = (text, count) => {
    const label = document.createElement('div');
    label.className = 'rigCategoryLabel';
    const name = document.createElement('span');
    name.textContent = text;
    const badge = document.createElement('span');
    badge.textContent = String(count);
    label.append(name, badge);
    hierarchy.appendChild(label);
  };

  sectionLabel('Artwork');
  for (const root of children.get('__root__') || []) appendNode(root, 0);
  if (!store.document.nodes.length) {
    const empty = document.createElement('p');
    empty.className = 'geometryNote';
    empty.textContent = 'No objects yet. Add a shape above.';
    hierarchy.appendChild(empty);
  }

  sectionLabel('Rig components');
  const appendRigItem = (kind, object, depth = 0) => {
    const row = document.createElement('div');
    row.className = `treeRow rigTreeRow${kind === 'constraint' ? ' constraintRow' : ''}`;
    row.classList.toggle('isSelected', store.selectedKind === kind && store.selectedId === object.id);
    row.classList.toggle('isHidden', 'visible' in object && !object.visible);
    const select = document.createElement('button');
    select.className = 'treeSelect';
    select.style.paddingLeft = `${8 + depth * 15}px`;
    select.setAttribute('role', 'treeitem');
    select.setAttribute('aria-selected', String(store.selectedKind === kind && store.selectedId === object.id));
    select.title = `${object.name} · ${kind}${kind === 'constraint' ? `:${object.type}` : ''}`;
    select.append(icon(kind === 'control' ? 'control' : kind, 'treeIcon'));
    const name = document.createElement('span');
    name.className = 'treeName';
    name.textContent = object.name;
    select.appendChild(name);
    select.onclick = () => store.select({ kind, id: object.id });
    row.appendChild(select);
    if (['bone', 'mesh', 'control'].includes(kind)) {
      const focus = document.createElement('button');
      focus.className = 'treeUtility treeFocus';
      focus.title = `Focus ${kind}`;
      focus.setAttribute('aria-label', `Focus ${object.name}`);
      focus.append(icon('fit'));
      focus.onclick = () => focusEditorReference({ kind, id: object.id });
      row.appendChild(focus);
    }
    if ('visible' in object && ['bone', 'mesh', 'control'].includes(kind)) {
      const visible = document.createElement('button');
      visible.className = 'treeUtility';
      visible.title = object.visible ? `Hide ${kind}` : `Show ${kind}`;
      visible.setAttribute('aria-label', visible.title);
      visible.append(icon(object.visible ? 'eye' : 'eye-off'));
      visible.onclick = () => rigPropertyMutation(kind, object, 'visible', `${object.visible ? 'Hide' : 'Show'} ${object.name}`, !object.visible);
      row.appendChild(visible);
    }
    hierarchy.appendChild(row);
  };

  const boneChildren = new Map();
  for (const bone of store.document.bones) {
    const key = referenceId(bone.parent, 'bone') || '__root__';
    if (!boneChildren.has(key)) boneChildren.set(key, []);
    boneChildren.get(key).push(bone);
  }
  const appendBone = (bone, depth) => {
    appendRigItem('bone', bone, depth);
    for (const child of boneChildren.get(bone.id) || []) appendBone(child, depth + 1);
  };
  rigCategoryLabel('Bones', store.document.bones.length);
  for (const bone of boneChildren.get('__root__') || []) appendBone(bone, 0);
  rigCategoryLabel('Meshes & weights', store.document.meshes.length);
  for (const mesh of store.document.meshes) appendRigItem('mesh', mesh);
  rigCategoryLabel('Controls', store.document.controls.length);
  for (const control of store.document.controls) appendRigItem('control', control);
  rigCategoryLabel('Constraints', store.document.constraints.length);
  for (const constraint of store.document.constraints) appendRigItem('constraint', constraint);

  if (!store.document.bones.length && !store.document.meshes.length && !store.document.controls.length && !store.document.constraints.length) {
    const empty = document.createElement('p');
    empty.className = 'geometryNote';
    empty.textContent = 'No rig yet. Add a bone or control above.';
    hierarchy.appendChild(empty);
  }
}

function section(title) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'inspectorSection';
  const legend = document.createElement('legend');
  legend.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'fieldGrid';
  fieldset.append(legend, grid);
  return { fieldset, grid };
}

function shortAddressLabel(address) {
  return String(address || '').split('/').slice(1).join('.');
}

function hasKeyframeAt(address, frame) {
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  const track = timeline ? trackByAddress(timeline, address) : null;
  return Boolean(track?.keyframes.some((keyframe) => keyframe.frame === frame));
}

function createFieldKeyButton(address) {
  if (!activeTimelineId || !isAnimatableProperty(store.document, address)) return null;
  const frame = Math.round(currentFrame);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fieldKeyButton';
  button.classList.toggle('hasKey', hasKeyframeAt(address, frame));
  button.title = `Keyframe ${shortAddressLabel(address)} at frame ${frame}`;
  button.setAttribute('aria-label', button.title);
  button.append(icon('key'));
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    recordKeyframeFor(address);
  });
  return button;
}

function field(labelText, value, onCommit, options = {}) {
  const label = document.createElement('label');
  label.className = `field${options.full ? ' fullField' : ''}`;
  const text = document.createElement('span');
  text.textContent = labelText;
  let input;
  if (options.textarea) {
    input = document.createElement('textarea');
    input.value = value ?? '';
  } else if (options.select) {
    input = document.createElement('select');
    for (const optionValue of options.select) {
      const option = document.createElement('option');
      option.value = optionValue.value;
      option.textContent = optionValue.label;
      option.selected = optionValue.value === value;
      input.appendChild(option);
    }
  } else {
    input = document.createElement('input');
    input.type = options.type || 'text';
    input.value = value ?? '';
    if (options.step != null) input.step = String(options.step);
    if (options.min != null) input.min = String(options.min);
    if (options.max != null) input.max = String(options.max);
    if (options.placeholder) input.placeholder = options.placeholder;
  }
  let lastCommittedValue = input.value;
  const commitInput = () => {
    if (input.value === lastCommittedValue) return;
    lastCommittedValue = input.value;
    const next = options.number ? Number(input.value) : input.value;
    onCommit(next, input);
  };
  input.addEventListener('change', commitInput);
  input.addEventListener('blur', commitInput);
  if (!options.textarea) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') input.blur();
    });
  }
  const keyButton = options.address ? createFieldKeyButton(options.address) : null;
  if (keyButton) {
    const head = document.createElement('div');
    head.className = 'fieldHead';
    head.append(text, keyButton);
    label.append(head, input);
  } else {
    label.append(text, input);
  }
  return label;
}

function checkbox(labelText, value, onCommit) {
  const label = document.createElement('label');
  label.className = 'field checkboxField';
  const text = document.createElement('span');
  text.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(value);
  input.addEventListener('change', () => onCommit(input.checked));
  label.append(text, input);
  return label;
}

function appendNote(fieldset, text, className = 'geometryNote') {
  const note = document.createElement('p');
  note.className = className;
  note.textContent = text;
  fieldset.appendChild(note);
}

function maybeAutoKey(address) {
  if (!autoKeyToggle.checked || !activeTimelineId) return;
  if (!isAnimatableProperty(store.document, address)) return;
  try {
    store.setKeyframe({
      timelineId: activeTimelineId,
      address,
      frame: Math.round(currentFrame),
      easing: lastEasing,
      easingParams: lastEasingParams,
    }, `Auto-keyframe ${shortAddressLabel(address)}`);
  } catch (error) {
    console.warn('Auto-keyframe failed:', error);
  }
}

function nodePropertyMutation(node, path, label, value) {
  const address = nodePropertyAddress(node.id, path);
  const changed = commit(
    { source: 'user', label, propertyAddresses: [address] },
    (documentModel) => writeProperty(documentModel, address, value),
  );
  if (changed) maybeAutoKey(address);
}

function rigPropertyMutation(kind, object, path, label, value) {
  const address = rigPropertyAddress(kind, object.id, path);
  const changed = commit(
    { source: 'user', label, propertyAddresses: [address] },
    (documentModel) => writeProperty(documentModel, address, value),
  );
  if (changed) maybeAutoKey(address);
}

function inspectorAction(label, iconName, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.append(icon(iconName));
  const text = document.createElement('span');
  text.textContent = label;
  button.appendChild(text);
  button.onclick = onClick;
  return button;
}

function renderDocumentInspector() {
  inspectorTitle.textContent = 'Document';
  selectedType.textContent = 'ARTBOARD';
  const artboard = section('Artboard');
  artboard.grid.append(
    field('Width', store.document.artboard.width, (value) => commit('Resize artboard', (documentModel) => {
      documentModel.artboard.width = value;
    }), { type: 'number', number: true, min: 1, step: 1 }),
    field('Height', store.document.artboard.height, (value) => commit('Resize artboard', (documentModel) => {
      documentModel.artboard.height = value;
    }), { type: 'number', number: true, min: 1, step: 1 }),
    field('Background', store.document.artboard.background, (value) => commit('Change artboard background', (documentModel) => {
      documentModel.artboard.background = value;
    }), { placeholder: '#fff7fc' }),
  );
  appendNote(artboard.fieldset, 'The artboard and authored objects are saved in the .veyra file. Selection, solved poses, and deformation overlays are never serialized.');
  inspector.appendChild(artboard.fieldset);

  const rig = section('Rig overview');
  const counts = document.createElement('div');
  counts.className = 'vertexSummary';
  counts.innerHTML = `<span>${store.document.bones.length} bones · ${store.document.meshes.length} meshes</span><strong>${store.document.controls.length} controls · ${store.document.constraints.length} constraints</strong>`;
  rig.fieldset.appendChild(counts);
  const diagnostics = evaluatedScene?.diagnostics;
  appendNote(rig.fieldset, `${diagnostics?.unweightedVertices || 0} unweighted vertices · ${diagnostics?.nonNormalizedVertices || 0} non-normalized · ${diagnostics?.constraints.filter((item) => item.status === 'solved').length || 0}/${store.document.constraints.length} constraints solved.`);
  inspector.appendChild(rig.fieldset);
}

function appendFillInspector(targetSection, kind, object) {
  const fill = object.paint.fill;
  const addressFor = (path) => kind === 'node'
    ? nodePropertyAddress(object.id, path)
    : rigPropertyAddress(kind, object.id, path);
  const mutate = (path, label, value) => {
    if (kind === 'node') nodePropertyMutation(object, path, label, value);
    else rigPropertyMutation(kind, object, path, label, value);
  };
  const replaceFill = (next, label) => mutate('paint.fill', label, next);
  const typeOptions = [
    { value: 'solid', label: 'Solid' },
    { value: 'linearGradient', label: 'Linear gradient' },
    { value: 'radialGradient', label: 'Radial gradient' },
  ];

  targetSection.grid.append(field('Fill type', fill.type, (type) => {
    if (type === fill.type) return;
    const stops = fill.stops || [
      createGradientStop({ offset: 0, color: fill.color === 'none' ? '#ec4899' : fill.color }),
      createGradientStop({ offset: 1, color: '#22d3ee' }),
    ];
    const next = type === 'solid'
      ? createSolidFill(stops[0]?.color || '#ec4899')
      : type === 'linearGradient'
        ? createLinearGradient({ stops })
        : createRadialGradient({ stops });
    replaceFill(next, `Set ${object.name} fill type`);
  }, { select: typeOptions, address: addressFor('paint.fill') }));

  if (fill.type === 'solid') {
    targetSection.grid.append(field(
      'Fill color',
      fill.color,
      (value) => mutate('paint.fill.color', `Set ${object.name} fill color`, value),
      { placeholder: '#ec4899 or none', address: addressFor('paint.fill.color') },
    ));
    return;
  }

  const numberField = (label, property, min = -10, max = 10) => field(
    label,
    fill[property],
    (value) => mutate(`paint.fill.${property}`, `Set ${object.name} gradient ${property}`, value),
    { type: 'number', number: true, min, max, step: 0.01, address: addressFor(`paint.fill.${property}`) },
  );
  if (fill.type === 'linearGradient') {
    targetSection.grid.append(
      numberField('Start X', 'x1'),
      numberField('Start Y', 'y1'),
      numberField('End X', 'x2'),
      numberField('End Y', 'y2'),
    );
  } else {
    targetSection.grid.append(
      numberField('Center X', 'cx'),
      numberField('Center Y', 'cy'),
      numberField('Radius', 'r', 0.000001, 10),
      numberField('Focus X', 'fx'),
      numberField('Focus Y', 'fy'),
    );
  }

  fill.stops.forEach((stop, index) => {
    const stopPath = ['paint', 'fill', 'stops', stop.id];
    targetSection.grid.append(
      field(`Stop ${index + 1} color`, stop.color, (value) => mutate(
        [...stopPath, 'color'],
        `Set ${object.name} gradient stop color`,
        value,
      ), { address: addressFor([...stopPath, 'color']) }),
      field(`Stop ${index + 1} offset`, stop.offset, (value) => mutate(
        [...stopPath, 'offset'],
        `Set ${object.name} gradient stop offset`,
        value,
      ), { type: 'number', number: true, min: 0, max: 1, step: 0.01, address: addressFor([...stopPath, 'offset']) }),
      field(`Stop ${index + 1} opacity`, stop.opacity, (value) => mutate(
        [...stopPath, 'opacity'],
        `Set ${object.name} gradient stop opacity`,
        value,
      ), { type: 'number', number: true, min: 0, max: 1, step: 0.05, address: addressFor([...stopPath, 'opacity']) }),
    );
  });

  const actions = document.createElement('div');
  actions.className = 'inlineActions';
  actions.append(inspectorAction('Add stop', 'plus', () => {
    const stops = [...fill.stops].sort((a, b) => a.offset - b.offset);
    let gapIndex = 0;
    let gapSize = -1;
    for (let index = 0; index < stops.length - 1; index++) {
      const gap = stops[index + 1].offset - stops[index].offset;
      if (gap > gapSize) {
        gapSize = gap;
        gapIndex = index;
      }
    }
    const left = stops[gapIndex];
    const right = stops[Math.min(gapIndex + 1, stops.length - 1)];
    const next = cloneValue(fill);
    next.stops.push(createGradientStop({
      offset: (left.offset + right.offset) / 2,
      color: left.color,
      opacity: (left.opacity + right.opacity) / 2,
    }));
    replaceFill(next, `Add ${object.name} gradient stop`);
  }));
  const remove = inspectorAction('Remove last', 'minus', () => {
    if (fill.stops.length <= 2) {
      showToast('A gradient requires at least two stops', true);
      return;
    }
    const next = cloneValue(fill);
    next.stops.pop();
    replaceFill(next, `Remove ${object.name} gradient stop`);
  });
  remove.disabled = fill.stops.length <= 2;
  actions.append(remove);
  targetSection.fieldset.appendChild(actions);
  appendNote(targetSection.fieldset, 'Gradient coordinates use normalized object bounds. Stops retain stable IDs for property addresses and animation.');
}


function listenerCommand(action, args, label) {
  const result = controlPlane.dispatchCommand({ action, args, command: { label, source: 'user' } });
  if (!result.ok) {
    showToast(result.error, true);
    return null;
  }
  return result.result;
}

function listenerActionDefaults(action, current = {}) {
  if (['play', 'stop', 'seek'].includes(action)) {
    const timelineId = referenceId(current.timeline, 'timeline') || store.document.timelines[0]?.id;
    if (!timelineId) return null;
    return { action, timeline: createTimelineRef(timelineId), machine: null, input: null, ...(action === 'seek' ? { value: 0 } : {}) };
  }
  const machines = store.document.stateMachines || [];
  let machine = machines.find((candidate) => candidate.id === referenceId(current.machine, 'stateMachine')) || null;
  const compatible = (candidate) => action === 'fire' ? candidate.type === 'trigger' : candidate.type !== 'trigger';
  if (!machine || !machine.inputs.some(compatible)) machine = machines.find((candidate) => candidate.inputs.some(compatible));
  const input = machine?.inputs.find((candidate) => candidate.id === referenceId(current.input, 'machineInput') && compatible(candidate))
    || machine?.inputs.find(compatible);
  if (!machine || !input) return null;
  return {
    action,
    timeline: null,
    machine: { kind: 'stateMachine', id: machine.id },
    input: { kind: 'machineInput', id: input.id },
    ...(action === 'setInput' ? { value: input.type === 'bool' ? false : Number(input.value || 0) } : {}),
  };
}

function appendListenerInspector(node) {
  const interactions = section('Interactions');
  interactions.grid.classList.add('oneColumn');
  const attached = (store.document.listeners || []).filter((listener) => referenceId(listener.target, 'node') === node.id);
  for (const listener of attached) {
    const summary = document.createElement('div');
    summary.className = 'vertexSummary';
    summary.innerHTML = `<span>${listener.event} → ${listener.action}</span><strong>${listener.id}</strong>`;
    interactions.fieldset.appendChild(summary);
    interactions.grid.append(
      field('Event', listener.event, (event) => listenerCommand('updateListener', { listenerId: listener.id, changes: { event } }, `Set listener ${listener.id} event`), {
        select: VEYRA_LISTENER_EVENTS.map((value) => ({ value, label: value })),
      }),
      field('Action', listener.action, (action) => {
        const defaults = listenerActionDefaults(action, listener);
        if (!defaults) return showToast(`No compatible target exists for ${action}`, true);
        listenerCommand('updateListener', { listenerId: listener.id, changes: defaults }, `Set listener ${listener.id} action`);
      }, { select: VEYRA_LISTENER_ACTIONS.map((value) => ({ value, label: value })) }),
    );
    if (['play', 'stop', 'seek'].includes(listener.action)) {
      interactions.grid.append(field('Timeline', referenceId(listener.timeline, 'timeline'), (timelineId) => listenerCommand('updateListener', {
        listenerId: listener.id, changes: { timeline: createTimelineRef(timelineId) },
      }, `Retarget listener ${listener.id} timeline`), {
        select: store.document.timelines.map((timeline) => ({ value: timeline.id, label: timeline.name })),
      }));
      if (listener.action === 'seek') interactions.grid.append(field('Seek frame', listener.value, (value) => listenerCommand('updateListener', {
        listenerId: listener.id, changes: { value },
      }, `Set listener ${listener.id} seek frame`), { type: 'number', number: true, min: 0, step: 1 }));
    } else {
      const machineId = referenceId(listener.machine, 'stateMachine');
      const machine = machineById(store.document, machineId);
      interactions.grid.append(field('Machine', machineId, (nextMachineId) => {
        const defaults = listenerActionDefaults(listener.action, { ...listener, machine: { kind: 'stateMachine', id: nextMachineId }, input: null });
        if (!defaults) return showToast('Selected machine has no compatible input', true);
        listenerCommand('updateListener', { listenerId: listener.id, changes: defaults }, `Retarget listener ${listener.id} machine`);
      }, { select: (store.document.stateMachines || []).map((item) => ({ value: item.id, label: item.name })) }));
      const compatibleInputs = (machine?.inputs || []).filter((input) => listener.action === 'fire' ? input.type === 'trigger' : input.type !== 'trigger');
      interactions.grid.append(field('Input', referenceId(listener.input, 'machineInput'), (inputId) => listenerCommand('updateListener', {
        listenerId: listener.id, changes: { input: { kind: 'machineInput', id: inputId } },
      }, `Retarget listener ${listener.id} input`), { select: compatibleInputs.map((input) => ({ value: input.id, label: `${input.name} · ${input.type}` })) }));
      if (listener.action === 'setInput') interactions.grid.append(field('Value', listener.value, (value) => {
        const input = compatibleInputs.find((candidate) => candidate.id === referenceId(listener.input, 'machineInput'));
        const normalized = input?.type === 'bool' ? (String(value) === 'true' || value === true) : Number(value);
        listenerCommand('updateListener', { listenerId: listener.id, changes: { value: normalized } }, `Set listener ${listener.id} value`);
      }));
    }
    const remove = document.createElement('div');
    remove.className = 'inlineActions';
    remove.append(inspectorAction('Remove listener', 'delete', () => listenerCommand('removeListener', { listenerId: listener.id }, `Delete listener ${listener.id}`)));
    interactions.fieldset.appendChild(remove);
  }
  const actions = document.createElement('div');
  actions.className = 'inlineActions';
  actions.append(inspectorAction('Add listener', 'plus', () => {
    let defaults = listenerActionDefaults('play');
    let action = 'play';
    if (!defaults) {
      action = (store.document.stateMachines || []).some((machine) => machine.inputs.some((input) => input.type === 'trigger')) ? 'fire' : 'setInput';
      defaults = listenerActionDefaults(action);
    }
    if (!defaults) return showToast('Create a timeline or compatible machine input first', true);
    listenerCommand('addListener', { overrides: {
      kind: 'pointer', event: 'pointerdown', target: createNodeRef(node.id), ...defaults,
    } }, `Add listener to ${node.name}`);
  }));
  interactions.fieldset.appendChild(actions);
  appendNote(interactions.fieldset, 'Listeners use stable refs. Runtime setInput/fire changes preview state only; they never enter authored history.');
  inspector.appendChild(interactions.fieldset);
}

function renderNodeInspector(node) {
  inspectorTitle.textContent = node.name;
  selectedType.textContent = node.type.toUpperCase();

  const identity = section('Identity');
  identity.grid.classList.add('oneColumn');
  const descendants = new Set(descendantIds(store.document, node.id));
  const parentOptions = [
    { value: '', label: 'Artboard root' },
    ...store.document.nodes
      .filter((candidate) => candidate.type === 'group' && candidate.id !== node.id && !descendants.has(candidate.id))
      .map((candidate) => ({ value: candidate.id, label: candidate.name })),
  ];
  identity.grid.append(
    field('Name', node.name, (value) => nodePropertyMutation(node, 'name', `Rename ${node.name}`, value)),
    field('Parent', referenceId(node.parent, 'node') || '', (value) => nodePropertyMutation(
      node,
      'parent',
      `Reparent ${node.name}`,
      value ? createNodeRef(value) : null,
    ), { select: parentOptions }),
  );
  appendNote(identity.fieldset, `Stable ID: ${node.id}`);
  inspector.appendChild(identity.fieldset);

  const transform = section('Transform');
  const transformField = (label, key, step = 1, angle = false) => field(
    label,
    angle ? Number(radiansToDegrees(node.transform[key]).toFixed(3)) : node.transform[key],
    (value) => nodePropertyMutation(
      node,
      `transform.${key}`,
      `Set ${node.name} ${key}`,
      angle ? degreesToRadians(value) : value,
    ),
    { type: 'number', number: true, step, address: nodePropertyAddress(node.id, `transform.${key}`) },
  );
  transform.grid.append(
    transformField('X', 'x'),
    transformField('Y', 'y'),
    transformField('Rotation °', 'rotation', 0.5, true),
    transformField('Skew X °', 'skewX', 0.5, true),
    transformField('Skew Y °', 'skewY', 0.5, true),
    transformField('Scale X', 'scaleX', 0.05),
    transformField('Scale Y', 'scaleY', 0.05),
    transformField('Pivot X', 'pivotX'),
    transformField('Pivot Y', 'pivotY'),
  );
  appendNote(transform.fieldset, 'Angles display in degrees. Veyra stores radians and evaluates translate → rotate → skew X → skew Y → scale → pivot.');
  inspector.appendChild(transform.fieldset);

  const appearance = section('Appearance');
  if (node.type !== 'group') {
    appendFillInspector(appearance, 'node', node);
    appearance.grid.append(
      field('Stroke', node.paint.stroke, (value) => nodePropertyMutation(node, 'paint.stroke', `Set ${node.name} stroke`, value), { placeholder: '#2c1830 or none', address: nodePropertyAddress(node.id, 'paint.stroke') }),
      field('Stroke width', node.paint.strokeWidth, (value) => nodePropertyMutation(node, 'paint.strokeWidth', `Set ${node.name} stroke width`, value), { type: 'number', number: true, min: 0, step: 0.5, address: nodePropertyAddress(node.id, 'paint.strokeWidth') }),
    );
  }
  appearance.grid.append(
    field('Opacity', node.opacity, (value) => nodePropertyMutation(node, 'opacity', `Set ${node.name} opacity`, value), { type: 'number', number: true, min: 0, max: 1, step: 0.05, address: nodePropertyAddress(node.id, 'opacity') }),
    field('Pointer events', node.pointerEvents || 'auto', (value) => nodePropertyMutation(node, 'pointerEvents', `Set ${node.name} pointer events`, value), {
      select: [
        { value: 'auto', label: 'Auto' },
        { value: 'pass-through', label: 'Pass through' },
        { value: 'none', label: 'None (subtree)' },
      ],
      address: nodePropertyAddress(node.id, 'pointerEvents'),
    }),
    checkbox('Visible', node.visible, (value) => nodePropertyMutation(node, 'visible', `${value ? 'Show' : 'Hide'} ${node.name}`, value)),
    checkbox('Locked', node.locked, (value) => nodePropertyMutation(node, 'locked', `${value ? 'Lock' : 'Unlock'} ${node.name}`, value)),
  );
  inspector.appendChild(appearance.fieldset);
  appendListenerInspector(node);

  if (node.geometry) {
    const geometry = section('Geometry');
    const property = (label, key, options = {}) => field(
      label,
      node.geometry[key],
      (value) => nodePropertyMutation(node, `geometry.${key}`, `Set ${node.name} ${key}`, value),
      { type: 'number', number: true, step: options.step ?? 1, min: options.min, max: options.max, address: nodePropertyAddress(node.id, `geometry.${key}`) },
    );
    if (node.type === 'rectangle') {
      geometry.grid.append(property('Width', 'width', { min: 0.01 }), property('Height', 'height', { min: 0.01 }), property('Corner radius', 'cornerRadius', { min: 0 }));
    } else if (node.type === 'ellipse') {
      geometry.grid.append(property('Width', 'width', { min: 0.01 }), property('Height', 'height', { min: 0.01 }));
    } else if (node.type === 'polygon') {
      geometry.grid.append(property('Radius', 'radius', { min: 0.01 }), property('Sides', 'sides', { min: 3, max: 256 }));
    } else if (node.type === 'star') {
      geometry.grid.append(property('Outer radius', 'outerRadius', { min: 0.01 }), property('Inner radius', 'innerRadius', { min: 0 }), property('Points', 'points', { min: 2, max: 256 }));
    } else if (node.type === 'path') {
      geometry.grid.append(checkbox('Closed path', node.geometry.closed, (value) => nodePropertyMutation(node, 'geometry.closed', `Set ${node.name} closed`, value)));
      const summary = document.createElement('div');
      summary.className = 'vertexSummary';
      summary.innerHTML = `<span>Authored vertices</span><strong>${node.geometry.vertices.length}</strong>`;
      const actions = document.createElement('div');
      actions.className = 'pathVertexActions';
      const addVertex = document.createElement('button');
      addVertex.type = 'button';
      addVertex.className = 'textButton';
      addVertex.textContent = 'Add vertex';
      addVertex.title = 'Add a vertex, then position it with the Vertices tool';
      addVertex.onclick = () => addPathVertex(node);
      const removeVertex = document.createElement('button');
      removeVertex.type = 'button';
      removeVertex.className = 'textButton danger';
      removeVertex.textContent = 'Remove last';
      removeVertex.disabled = node.geometry.vertices.length <= 2;
      removeVertex.title = 'Remove the most recently added vertex';
      removeVertex.onclick = () => removePathVertex(node);
      actions.append(addVertex, removeVertex);
      geometry.fieldset.append(summary, actions);
      appendNote(geometry.fieldset, 'Use Vertices (E) to drag cyan points. Add/Remove is undoable; pale Bezier handles are display-only.');
    }
    inspector.appendChild(geometry.fieldset);
  }

  const semantic = semanticFor(store.document, node.id) || { role: '', description: '', tags: [] };
  const semantics = section('AI semantics');
  semantics.grid.classList.add('oneColumn');
  semantics.grid.append(
    field('Role', semantic.role, (value) => nodePropertyMutation(node, 'semantic.role', `Set ${node.name} semantic role`, value), { placeholder: 'eye, hand, character…' }),
    field('Tags', semantic.tags.join(', '), (value) => nodePropertyMutation(node, 'semantic.tags', `Set ${node.name} semantic tags`, value), { placeholder: 'face, eye, right_eye' }),
    field('Description', semantic.description, (value) => nodePropertyMutation(node, 'semantic.description', `Describe ${node.name}`, value), { textarea: true, placeholder: 'Explain this object’s purpose for future tools and agents.' }),
  );
  appendNote(semantics.fieldset, 'Semantics describe intent without changing geometry or relying on object names.', 'semanticNote');
  inspector.appendChild(semantics.fieldset);
}

function renderBoneInspector(bone) {
  inspectorTitle.textContent = bone.name;
  selectedType.textContent = 'BONE';
  const identity = section('Bone');
  const descendants = new Set();
  const visit = (parentId) => {
    for (const candidate of store.document.bones.filter((item) => referenceId(item.parent, 'bone') === parentId)) {
      descendants.add(candidate.id);
      visit(candidate.id);
    }
  };
  visit(bone.id);
  const parents = [
    { value: '', label: 'Skeleton root' },
    ...store.document.bones
      .filter((candidate) => candidate.id !== bone.id && !descendants.has(candidate.id))
      .map((candidate) => ({ value: candidate.id, label: candidate.name })),
  ];
  identity.grid.append(
    field('Name', bone.name, (value) => rigPropertyMutation('bone', bone, 'name', `Rename ${bone.name}`, value)),
    field('Parent', referenceId(bone.parent, 'bone') || '', (value) => rigPropertyMutation('bone', bone, 'parent', `Reparent ${bone.name}`, value ? createBoneRef(value) : null), { select: parents }),
    field('Length', bone.length, (value) => rigPropertyMutation('bone', bone, 'length', `Set ${bone.name} length`, value), { type: 'number', number: true, min: 0.01, step: 1, address: rigPropertyAddress('bone', bone.id, 'length') }),
    field('Color', bone.color, (value) => rigPropertyMutation('bone', bone, 'color', `Set ${bone.name} color`, value)),
    checkbox('Visible', bone.visible, (value) => rigPropertyMutation('bone', bone, 'visible', `${value ? 'Show' : 'Hide'} ${bone.name}`, value)),
    checkbox('Locked', bone.locked, (value) => rigPropertyMutation('bone', bone, 'locked', `${value ? 'Lock' : 'Unlock'} ${bone.name}`, value)),
  );
  appendNote(identity.fieldset, `Typed ref: bone:${bone.id}`);
  const drivers = store.document.constraints.filter((constraint) => constraint.enabled && (
    referenceId(constraint.bone, 'bone') === bone.id
    || (constraint.bones || []).some((reference) => referenceId(reference, 'bone') === bone.id)
  ));
  if (drivers.length) {
    const ikDriver = drivers.find((constraint) => constraint.type === 'ik');
    appendNote(
      identity.fieldset,
      ikDriver
        ? `Driven by ${ikDriver.name}. Dragging this bone moves its IK target; disable the constraint to edit its pose rotation directly.`
        : `Driven by ${drivers.map((constraint) => constraint.name).join(', ')}. Constraint results override authored pose channels.`,
      'semanticNote',
    );
  }
  inspector.appendChild(identity.fieldset);

  const transformSection = (title, key, description) => {
    const transform = section(title);
    const property = (label, propertyKey, step = 1, angle = false) => field(
      label,
      angle ? Number(radiansToDegrees(bone[key][propertyKey]).toFixed(3)) : bone[key][propertyKey],
      (value) => rigPropertyMutation('bone', bone, `${key}.${propertyKey}`, `Set ${bone.name} ${key} ${propertyKey}`, angle ? degreesToRadians(value) : value),
      { type: 'number', number: true, step, address: key === 'pose' ? rigPropertyAddress('bone', bone.id, `${key}.${propertyKey}`) : null },
    );
    transform.grid.append(
      property('X', 'x'),
      property('Y', 'y'),
      property('Rotation °', 'rotation', 0.5, true),
      property('Scale X', 'scaleX', 0.05),
      property('Scale Y', 'scaleY', 0.05),
    );
    appendNote(transform.fieldset, description);
    inspector.appendChild(transform.fieldset);
  };
  transformSection('Rest transform', 'rest', 'Bind/rest values define the skeleton and skinning inverse matrices.');
  transformSection('Pose transform', 'pose', 'Pose values are animatable. Constraint-solved values remain evaluated-only.');

  const evaluated = evaluatedScene?.bones.find((candidate) => candidate.id === bone.id);
  if (evaluated) {
    const diagnostics = section('Evaluated pose');
    diagnostics.grid.append(
      field('Start X', Number(evaluated.start.x.toFixed(2)), () => {}, { type: 'number', number: true }),
      field('Start Y', Number(evaluated.start.y.toFixed(2)), () => {}, { type: 'number', number: true }),
      field('End X', Number(evaluated.end.x.toFixed(2)), () => {}, { type: 'number', number: true }),
      field('End Y', Number(evaluated.end.y.toFixed(2)), () => {}, { type: 'number', number: true }),
    );
    diagnostics.grid.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    appendNote(diagnostics.fieldset, 'Read-only solved coordinates; these are never serialized.');
    inspector.appendChild(diagnostics.fieldset);
  }
}

function renderMeshInspector(mesh) {
  inspectorTitle.textContent = mesh.name;
  selectedType.textContent = 'MESH';
  const identity = section('Mesh');
  identity.grid.append(
    field('Name', mesh.name, (value) => rigPropertyMutation('mesh', mesh, 'name', `Rename ${mesh.name}`, value)),
    field('Opacity', mesh.opacity, (value) => rigPropertyMutation('mesh', mesh, 'opacity', `Set ${mesh.name} opacity`, value), { type: 'number', number: true, min: 0, max: 1, step: 0.05, address: rigPropertyAddress('mesh', mesh.id, 'opacity') }),
  );
  appendFillInspector(identity, 'mesh', mesh);
  identity.grid.append(
    field('Stroke', mesh.paint.stroke, (value) => rigPropertyMutation('mesh', mesh, 'paint.stroke', `Set ${mesh.name} stroke`, value), { address: rigPropertyAddress('mesh', mesh.id, 'paint.stroke') }),
    field('Stroke width', mesh.paint.strokeWidth, (value) => rigPropertyMutation('mesh', mesh, 'paint.strokeWidth', `Set ${mesh.name} stroke width`, value), { type: 'number', number: true, min: 0, step: 0.5, address: rigPropertyAddress('mesh', mesh.id, 'paint.strokeWidth') }),
    checkbox('Visible', mesh.visible, (value) => rigPropertyMutation('mesh', mesh, 'visible', `${value ? 'Show' : 'Hide'} ${mesh.name}`, value)),
    checkbox('Locked', mesh.locked, (value) => rigPropertyMutation('mesh', mesh, 'locked', `${value ? 'Lock' : 'Unlock'} ${mesh.name}`, value)),
  );
  inspector.appendChild(identity.fieldset);

  const evaluated = evaluatedScene?.meshes.find((candidate) => candidate.id === mesh.id);
  const weights = section('Weights & diagnostics');
  const weightSums = mesh.vertices.map((vertex) => vertex.weights.reduce((sum, weight) => sum + weight.value, 0));
  const unweighted = weightSums.filter((sum) => sum <= 0).length;
  const nonNormalized = weightSums.filter((sum) => sum > 0 && Math.abs(sum - 1) > 1e-6).length;
  const stats = document.createElement('div');
  stats.className = 'vertexSummary';
  stats.innerHTML = `<span>${mesh.vertices.length} vertices · ${mesh.triangles.length} triangles</span><strong class="${unweighted || nonNormalized ? 'diagnosticWarn' : 'diagnosticGood'}">${unweighted} unweighted / ${nonNormalized} off-sum</strong>`;
  weights.fieldset.appendChild(stats);
  const actions = document.createElement('div');
  actions.className = 'inlineActions';
  actions.append(
    inspectorAction('Normalize', 'normalize', () => {
      let changed = 0;
      commit({ source: 'user', label: `Normalize ${mesh.name} weights` }, (documentModel) => {
        changed = normalizeMeshWeights(documentModel, mesh.id);
      });
      showToast(`${changed} vertex weight sets normalized`);
    }),
    inspectorAction('Mirror L → R', 'mirror', () => {
      const pairs = [];
      const rightNameFor = (name) => {
        if (/left/i.test(name)) return name.replace(/left/ig, 'Right');
        if (/\.l\b/i.test(name)) return name.replace(/\.l\b/i, '.R');
        if (/_l\b/i.test(name)) return name.replace(/_l\b/i, '_R');
        if (/-l\b/i.test(name)) return name.replace(/-l\b/i, '-R');
        return null;
      };
      for (const left of store.document.bones) {
        const rightName = rightNameFor(left.name);
        if (!rightName) continue;
        const right = store.document.bones.find((candidate) => candidate.name.toLowerCase() === rightName.toLowerCase());
        if (right) pairs.push([left.id, right.id]);
      }
      let mirrored = 0;
      commit({ source: 'user', label: `Mirror ${mesh.name} weights` }, (documentModel) => {
        mirrored = mirrorMeshWeights(documentModel, mesh.id, pairs, store.document.artboard.width / 2, 0.75);
      });
      showToast(`${mirrored} vertex weight sets mirrored`);
    }),
  );
  weights.fieldset.appendChild(actions);
  appendNote(weights.fieldset, `Maximum active influences: ${evaluated?.deformedVertices.reduce((max, vertex) => Math.max(max, vertex.influences), 0) || 0}. Red mesh points are unweighted.`);
  inspector.appendChild(weights.fieldset);

  const vertexWeights = section('Vertex weights');
  const rememberedVertexId = selectedMeshVertices.get(mesh.id);
  const vertex = mesh.vertices.find((candidate) => candidate.id === rememberedVertexId) || mesh.vertices[0];
  selectedMeshVertices.set(mesh.id, vertex.id);
  const vertexOptions = mesh.vertices.map((candidate, index) => ({
    value: candidate.id,
    label: `#${index} · ${candidate.id}`,
  }));
  vertexWeights.grid.append(field('Vertex', vertex.id, (value) => {
    selectedMeshVertices.set(mesh.id, value);
    renderInspector();
  }, { select: vertexOptions, full: true }));
  for (const bone of store.document.bones) {
    const influence = vertex.weights.find((weight) => referenceId(weight.bone, 'bone') === bone.id);
    vertexWeights.grid.append(field(bone.name, influence?.value || 0, (value) => {
      commit({ source: 'user', label: `Set ${mesh.name} vertex weight for ${bone.name}` }, (documentModel) => {
        const documentMesh = meshById(documentModel, mesh.id);
        const documentVertex = documentMesh.vertices.find((candidate) => candidate.id === vertex.id);
        documentVertex.weights = documentVertex.weights.filter((weight) => referenceId(weight.bone, 'bone') !== bone.id);
        if (value > 0) documentVertex.weights.push({ bone: createBoneRef(bone.id), value });
      });
    }, { type: 'number', number: true, min: 0, max: 1, step: 0.05 }));
  }
  appendNote(vertexWeights.fieldset, 'Weights are authored values from 0 to 1. Use Normalize after editing; up to eight positive bone influences are allowed per vertex.');
  inspector.appendChild(vertexWeights.fieldset);
}

function renderControlInspector(control) {
  inspectorTitle.textContent = control.name;
  selectedType.textContent = 'CONTROL';
  const identity = section('Pose control');
  identity.grid.append(
    field('Name', control.name, (value) => rigPropertyMutation('control', control, 'name', `Rename ${control.name}`, value)),
    field('X', control.position.x, (value) => rigPropertyMutation('control', control, 'position.x', `Set ${control.name} X`, value), { type: 'number', number: true, step: 1, address: rigPropertyAddress('control', control.id, 'position.x') }),
    field('Y', control.position.y, (value) => rigPropertyMutation('control', control, 'position.y', `Set ${control.name} Y`, value), { type: 'number', number: true, step: 1, address: rigPropertyAddress('control', control.id, 'position.y') }),
    field('Color', control.color, (value) => rigPropertyMutation('control', control, 'color', `Set ${control.name} color`, value)),
    checkbox('Visible', control.visible, (value) => rigPropertyMutation('control', control, 'visible', `${value ? 'Show' : 'Hide'} ${control.name}`, value)),
    checkbox('Locked', control.locked, (value) => rigPropertyMutation('control', control, 'locked', `${value ? 'Lock' : 'Unlock'} ${control.name}`, value)),
  );
  if (control.kind === 'scalar') identity.grid.append(
    field('Value', control.value, (value) => rigPropertyMutation('control', control, 'value', `Set ${control.name} value`, value), { type: 'number', number: true, min: control.min, max: control.max, step: 0.01, address: rigPropertyAddress('control', control.id, 'value') }),
    field('Minimum', control.min, (value) => rigPropertyMutation('control', control, 'min', `Set ${control.name} minimum`, value), { type: 'number', number: true, step: 0.01 }),
    field('Maximum', control.max, (value) => rigPropertyMutation('control', control, 'max', `Set ${control.name} maximum`, value), { type: 'number', number: true, step: 0.01 }),
  );
  appendNote(identity.fieldset, 'Drag the yellow diamond on the artboard. IK and other constraints solve in the evaluated scene.');
  inspector.appendChild(identity.fieldset);
}

function renderConstraintInspector(constraint) {
  inspectorTitle.textContent = constraint.name;
  selectedType.textContent = constraint.type.toUpperCase();
  const settings = section('Constraint');
  const boneOptions = store.document.bones.map((bone) => ({ value: bone.id, label: bone.name }));
  const controlOptions = store.document.controls.map((control) => ({ value: control.id, label: control.name }));
  const pathOptions = store.document.nodes.filter((node) => node.type === 'path').map((node) => ({ value: node.id, label: node.name }));
  settings.grid.append(
    field('Name', constraint.name, (value) => rigPropertyMutation('constraint', constraint, 'name', `Rename ${constraint.name}`, value)),
    field('Strength', constraint.strength, (value) => rigPropertyMutation('constraint', constraint, 'strength', `Set ${constraint.name} strength`, value), { type: 'number', number: true, min: 0, max: 1, step: 0.05, address: rigPropertyAddress('constraint', constraint.id, 'strength') }),
    field('Order', constraint.order, (value) => rigPropertyMutation('constraint', constraint, 'order', `Set ${constraint.name} order`, value), { type: 'number', number: true, step: 1 }),
    checkbox('Enabled', constraint.enabled, (value) => rigPropertyMutation('constraint', constraint, 'enabled', `${value ? 'Enable' : 'Disable'} ${constraint.name}`, value)),
  );
  if (constraint.type === 'ik') {
    const endBoneId = referenceId(constraint.bones.at(-1), 'bone');
    settings.grid.append(
      field('End bone', endBoneId, (value) => {
        const end = boneById(store.document, value);
        const parent = end?.parent ? boneById(store.document, referenceId(end.parent, 'bone')) : null;
        const chain = parent ? [parent, end] : [end];
        rigPropertyMutation('constraint', constraint, 'bones', `Retarget ${constraint.name} chain`, chain.map((bone) => createBoneRef(bone.id)));
      }, { select: boneOptions }),
      field('Target control', referenceId(constraint.target, 'control'), (value) => rigPropertyMutation('constraint', constraint, 'target', `Retarget ${constraint.name}`, createControlRef(value)), { select: controlOptions }),
    );
  } else {
    settings.grid.append(field('Driven bone', referenceId(constraint.bone, 'bone'), (value) => rigPropertyMutation('constraint', constraint, 'bone', `Set ${constraint.name} driven bone`, createBoneRef(value)), { select: boneOptions }));
    if (constraint.type === 'distance') {
      settings.grid.append(field('Target control', referenceId(constraint.target, 'control'), (value) => rigPropertyMutation('constraint', constraint, 'target', `Retarget ${constraint.name}`, createControlRef(value)), { select: controlOptions }));
    } else if (constraint.type === 'path') {
      settings.grid.append(field('Path', referenceId(constraint.path, 'node'), (value) => rigPropertyMutation('constraint', constraint, 'path', `Retarget ${constraint.name}`, createNodeRef(value)), { select: pathOptions }));
    } else {
      settings.grid.append(field('Target bone', referenceId(constraint.target, 'bone'), (value) => rigPropertyMutation('constraint', constraint, 'target', `Retarget ${constraint.name}`, createBoneRef(value)), { select: boneOptions.filter((option) => option.value !== referenceId(constraint.bone, 'bone')) }));
    }
  }
  if (constraint.type === 'ik') settings.grid.append(
    field('Bend', constraint.bendDirection, (value) => rigPropertyMutation('constraint', constraint, 'bendDirection', `Set ${constraint.name} bend direction`, value), {
      select: [{ value: 1, label: 'Clockwise' }, { value: -1, label: 'Counter-clockwise' }],
    }),
  );
  if (constraint.type === 'distance') settings.grid.append(
    field('Distance', constraint.distance, (value) => rigPropertyMutation('constraint', constraint, 'distance', `Set ${constraint.name} distance`, value), { type: 'number', number: true, min: 0, step: 1, address: rigPropertyAddress('constraint', constraint.id, 'distance') }),
  );
  if (constraint.type === 'path') settings.grid.append(
    field('Position', constraint.position, (value) => rigPropertyMutation('constraint', constraint, 'position', `Set ${constraint.name} position`, value), { type: 'number', number: true, min: 0, max: 1, step: 0.01, address: rigPropertyAddress('constraint', constraint.id, 'position') }),
    checkbox('Follow tangent', constraint.rotate, (value) => rigPropertyMutation('constraint', constraint, 'rotate', `Set ${constraint.name} tangent follow`, value)),
  );
  if (['rotation', 'transform'].includes(constraint.type)) settings.grid.append(
    field('Offset °', Number(radiansToDegrees(constraint.offset).toFixed(3)), (value) => rigPropertyMutation('constraint', constraint, 'offset', `Set ${constraint.name} offset`, degreesToRadians(value)), { type: 'number', number: true, step: 0.5, address: rigPropertyAddress('constraint', constraint.id, 'offset') }),
  );
  const diagnostic = evaluatedScene?.diagnostics.constraints.find((candidate) => candidate.id === constraint.id);
  appendNote(settings.fieldset, `Solver: ${diagnostic?.status || 'not evaluated'}${Number.isFinite(diagnostic?.error) ? ` · endpoint error ${diagnostic.error.toFixed(2)} px` : ''}. Solved values are not authored.`);
  inspector.appendChild(settings.fieldset);
}

function renderInspector() {
  inspector.replaceChildren();
  if (store.selectedNode) renderNodeInspector(store.selectedNode);
  else if (store.selectedBone) renderBoneInspector(store.selectedBone);
  else if (store.selectedMesh) renderMeshInspector(store.selectedMesh);
  else if (store.selectedControl) renderControlInspector(store.selectedControl);
  else if (store.selectedConstraint) renderConstraintInspector(store.selectedConstraint);
  else renderDocumentInspector();
}

function initializeTimeline() {
  if (store.document.timelines.length === 0) {
    const firstTimeline = createTimeline({ name: 'Main Timeline', duration: 60, fps: 30 });
    commit('Create default timeline', (doc) => doc.timelines.push(firstTimeline));
    activeTimelineId = firstTimeline.id;
  } else {
    activeTimelineId = store.document.timelines[0].id;
  }
  animationPlayback = new AnimationPlayback(store.document);
  renderTimeline();
}

function renderTimelineSelect() {
  if (!store.document.timelines.some((timeline) => timeline.id === activeTimelineId)) {
    activeTimelineId = store.document.timelines[0]?.id || null;
    selectedTrackAddress = null;
    selectedKeyframe = null;
  }
  timelineSelect.replaceChildren();
  for (const timeline of store.document.timelines) {
    const option = document.createElement('option');
    option.value = timeline.id;
    option.textContent = timeline.name;
    option.selected = timeline.id === activeTimelineId;
    timelineSelect.appendChild(option);
  }
  timelineDelete.disabled = store.document.timelines.length === 0;
}

function renderTimelineSettings() {
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  const disabled = !timeline;
  for (const control of [loopMode, fpsInput, durationInput, workStartInput, workEndInput]) {
    control.disabled = disabled;
  }
  if (!timeline) {
    frameReadout.textContent = '—';
    return;
  }

  loopMode.value = timeline.loop;
  fpsInput.value = timeline.fps;
  durationInput.value = timeline.duration;
  workStartInput.value = timeline.workStart ?? 0;
  workEndInput.value = timeline.workEnd ?? timeline.duration;
  workStartInput.min = '0';
  workStartInput.max = String((timeline.workEnd ?? timeline.duration) - 1);
  workEndInput.min = String((timeline.workStart ?? 0) + 1);
  workEndInput.max = String(timeline.duration);
  frameReadout.textContent = `${Math.round(currentFrame)} / ${timeline.duration}`;
  timelineRuler.setAttribute('aria-valuemax', String(timeline.duration));
  timelineRuler.setAttribute('aria-valuenow', String(Math.round(currentFrame)));
}

function renderTimelineTracks() {
  timelineTracks.replaceChildren();
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  if (!timeline || timeline.tracks.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.padding = '20px 12px';
    emptyMsg.style.color = 'var(--quiet)';
    emptyMsg.style.fontSize = '10px';
    emptyMsg.textContent = 'Create a timeline with +, then select an animatable property and use the diamond key button or Auto-key.';
    timelineTracks.appendChild(emptyMsg);
    return;
  }

  for (const track of timeline.tracks) {
    const trackEl = document.createElement('div');
    trackEl.className = 'timelineTrack';
    if (track.address === selectedTrackAddress) trackEl.classList.add('isSelected');
    trackEl.textContent = track.address.replace(/^(node|bone|control|mesh|constraint):([^/]+)\//, '$1/');
    trackEl.addEventListener('click', () => {
      selectedTrackAddress = track.address;
      renderTimeline();
    });
    timelineTracks.appendChild(trackEl);
  }
}

function timelineXFromClientX(clientX) {
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  if (!timeline) return 0;
  const rect = timelineGridWrap.getBoundingClientRect();
  const x = clientX - rect.left + timelineGridWrap.scrollLeft;
  return Math.max(0, Math.min(x, timeline.duration * timelinePxPerFrame));
}

function frameFromTimelineClientX(clientX) {
  return Math.round(timelineXFromClientX(clientX) / timelinePxPerFrame);
}

function renderTimelineKeyframes() {
  timelineGrid.replaceChildren();
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  if (!timeline) return;

  const trackHeight = 32;
  const rulerWidth = timeline.duration * timelinePxPerFrame;
  timelineGrid.style.height = `${Math.max(trackHeight * timeline.tracks.length, trackHeight)}px`;
  timelineGrid.style.backgroundSize = `${timelinePxPerFrame}px 100%, ${timelinePxPerFrame * 5}px 100%`;
  const workStart = timeline.workStart ?? 0;
  const workEnd = timeline.workEnd ?? timeline.duration;
  const workArea = document.createElement('div');
  workArea.className = 'workAreaBand';
  workArea.title = 'Drag to move the work area · drag the edges to resize it';
  workArea.style.left = `${workStart * timelinePxPerFrame}px`;
  workArea.style.width = `${Math.max(1, (workEnd - workStart) * timelinePxPerFrame)}px`;
  for (const edge of ['start', 'end']) {
    const handle = document.createElement('div');
    handle.className = 'workAreaEdge';
    handle.dataset.edge = edge;
    handle.title = edge === 'start' ? 'Drag to move the In point' : 'Drag to move the Out point';
    handle.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      beginWorkAreaDrag(event, edge, workStart, workEnd);
    });
    workArea.appendChild(handle);
  }
  workArea.addEventListener('pointerdown', (event) => beginWorkAreaDrag(event, 'move', workStart, workEnd));
  timelineGrid.appendChild(workArea);

  for (let i = 0; i < timeline.tracks.length; i++) {
    const track = timeline.tracks[i];
    for (const keyframe of track.keyframes) {
      const kfEl = document.createElement('div');
      kfEl.className = 'timelineKeyframe';
      const isSelected = selectedKeyframe?.address === track.address
        && selectedKeyframe.frame === keyframe.frame;
      kfEl.classList.toggle('isSelected', isSelected);
      const y = i * trackHeight + trackHeight / 2;
      kfEl.style.left = `${keyframe.frame * timelinePxPerFrame}px`;
      kfEl.style.top = `${y}px`;
      kfEl.title = `Frame ${keyframe.frame} · ${keyframe.easing}`;
      kfEl.addEventListener('click', (event) => {
        event.stopPropagation();
        if (suppressKeyframeClick) {
          suppressKeyframeClick = false;
          return;
        }
        selectedTrackAddress = track.address;
        selectedKeyframe = { address: track.address, frame: keyframe.frame };
        setCurrentFrame(keyframe.frame);
        renderTimeline();
      });
      kfEl.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || keyframeDragPointerId !== null) return;
        event.preventDefault();
        event.stopPropagation();
        keyframeDragPointerId = event.pointerId;
        kfEl.setPointerCapture?.(event.pointerId);
        const startClientX = event.clientX;
        let dragging = false;
        const cleanup = () => {
          kfEl.releasePointerCapture?.(event.pointerId);
          keyframeDragPointerId = null;
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', finish);
          window.removeEventListener('pointercancel', cancel);
        };
        const onMove = (moveEvent) => {
          if (moveEvent.pointerId !== event.pointerId) return;
          if (!dragging && Math.abs(moveEvent.clientX - startClientX) < 3) return;
          dragging = true;
          kfEl.style.left = `${timelineXFromClientX(moveEvent.clientX)}px`;
        };
        const finish = (finishEvent) => {
          if (finishEvent.pointerId !== event.pointerId) return;
          cleanup();
          if (!dragging) return;
          suppressKeyframeClick = true;
          setTimeout(() => { suppressKeyframeClick = false; }, 0);
          const nextFrame = frameFromTimelineClientX(finishEvent.clientX);
          if (nextFrame !== keyframe.frame) {
            try {
              store.moveKeyframe({
                timelineId: timeline.id,
                address: track.address,
                fromFrame: keyframe.frame,
                toFrame: nextFrame,
              }, `Move keyframe to frame ${nextFrame}`);
              selectedTrackAddress = track.address;
              selectedKeyframe = { address: track.address, frame: nextFrame };
            } catch (error) {
              showToast(error.message || String(error), true);
            }
          }
          renderTimeline();
        };
        const cancel = (cancelEvent) => {
          if (cancelEvent.pointerId !== event.pointerId) return;
          cleanup();
          renderTimeline();
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', cancel);
      });
      timelineGrid.appendChild(kfEl);
    }
  }

  timelineRuler.style.width = `${rulerWidth}px`;
  timelineGrid.style.width = `${rulerWidth}px`;
}

function updateSelectedKeyframeEasing(easing, easingParams) {
  if (!activeTimelineId || !selectedKeyframe) return;
  const timeline = timelineById(store.document, activeTimelineId);
  const track = timeline ? trackByAddress(timeline, selectedKeyframe.address) : null;
  const keyframe = track?.keyframes.find((candidate) => candidate.frame === selectedKeyframe.frame);
  if (!keyframe) return;
  const params = easing === 'cubic-bezier'
    ? easingParams || keyframe.easingParams || [0.42, 0, 0.58, 1]
    : undefined;
  try {
    store.setKeyframe({
      timelineId: activeTimelineId,
      address: selectedKeyframe.address,
      frame: selectedKeyframe.frame,
      value: keyframe.value,
      easing,
      easingParams: params,
    }, `Set ${shortAddressLabel(selectedKeyframe.address)} easing`);
    lastEasing = easing;
    lastEasingParams = params || null;
  } catch (error) {
    showToast(error.message || String(error), true);
  }
}

function deleteSelectedKeyframe() {
  if (!activeTimelineId || !selectedKeyframe) return;
  const selection = selectedKeyframe;
  selectedKeyframe = null;
  try {
    store.removeKeyframe({
      timelineId: activeTimelineId,
      address: selection.address,
      frame: selection.frame,
    }, `Delete ${shortAddressLabel(selection.address)} keyframe at frame ${selection.frame}`);
  } catch (error) {
    showToast(error.message || String(error), true);
  }
  renderTimeline();
}

function renderKeyframeBar() {
  keyframeBar.replaceChildren();
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  const track = timeline && selectedKeyframe ? trackByAddress(timeline, selectedKeyframe.address) : null;
  const keyframe = track?.keyframes.find((candidate) => candidate.frame === selectedKeyframe.frame);
  if (!keyframe) {
    keyframeBar.hidden = true;
    return;
  }

  keyframeBar.hidden = false;
  const label = document.createElement('span');
  label.className = 'keyframeBarLabel';
  label.textContent = `${shortAddressLabel(selectedKeyframe.address)} · frame ${keyframe.frame}`;

  const easingSelect = document.createElement('select');
  easingSelect.setAttribute('aria-label', 'Keyframe easing');
  for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'step', 'hold', 'cubic-bezier']) {
    const option = document.createElement('option');
    option.value = easing;
    option.textContent = easing;
    option.selected = easing === keyframe.easing;
    easingSelect.appendChild(option);
  }
  easingSelect.addEventListener('change', () => updateSelectedKeyframeEasing(easingSelect.value));

  keyframeBar.append(label, easingSelect);
  if (keyframe.easing === 'cubic-bezier') {
    const defaults = [0.42, 0, 0.58, 1];
    const parameters = keyframe.easingParams || defaults;
    const inputs = parameters.map((parameter, index) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '1';
      input.step = '0.01';
      input.value = String(Number(parameter).toFixed(2));
      input.setAttribute('aria-label', `Cubic bezier parameter ${index + 1}`);
      return input;
    });
    const updateParameters = () => {
      const values = inputs.map((input, index) => {
        const value = Number(input.value);
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : defaults[index];
      });
      updateSelectedKeyframeEasing('cubic-bezier', values);
    };
    inputs.forEach((input) => input.addEventListener('change', updateParameters));
    keyframeBar.append(...inputs);
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'iconButton';
  remove.title = 'Delete keyframe (Delete)';
  remove.setAttribute('aria-label', remove.title);
  remove.append(icon('delete'));
  remove.onclick = deleteSelectedKeyframe;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'iconButton';
  close.title = 'Close keyframe editor';
  close.setAttribute('aria-label', close.title);
  close.append(icon('close'));
  close.onclick = () => {
    selectedKeyframe = null;
    renderTimeline();
  };
  keyframeBar.append(remove, close);
}

function updatePlayhead() {
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  if (!timeline) return;
  playhead.style.transform = `translateX(${currentFrame * timelinePxPerFrame}px)`;
}

function renderTimeline() {
  renderTimelineSelect();
  renderTimelineSettings();
  renderTimelineTracks();
  renderTimelineKeyframes();
  renderKeyframeBar();
  updatePlayhead();
}

function evaluateCurrentFrame() {
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  // While playback is running, honor the per-play loop preview so the canvas
  // and the playhead agree (e.g. looping a loop:'none' authored timeline).
  const playing = !!animationPlayback?.isPlaying;
  const effectiveLoop = playing ? (playbackLoopMode || timeline?.loop) : timeline?.loop;
  const manualAnimation = timeline && effectiveLoop
    ? evaluateTimeline(timeline, currentFrame / timeline.fps, { loop: effectiveLoop })
    : {};
  const runtimeAnimation = machineInteractionBridge.evaluateAll().overrides;
  const animation = { ...manualAnimation, ...runtimeAnimation };
  const layers = Object.keys(animation).length ? { animation } : {};
  evaluatedScene = evaluateDocument(store.document, layers);
  interactionBridge.updateDocument(store.document);
  interactionSceneRevision += 1;
  renderer.render(evaluatedScene, store.selectedRef);
}

function setCurrentFrame(frame) {
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  if (!timeline) return;
  currentFrame = Math.max(0, Math.min(frame, timeline.duration));
  updatePlayhead();
  renderTimelineSettings();
  evaluateCurrentFrame();
}

function setPlayButtonState(playing) {
  playToggle.innerHTML = '';
  playToggle.appendChild(icon(playing ? 'pause' : 'play'));
  playToggle.title = playing ? 'Pause (Space)' : 'Play (Space)';
  playToggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

function finishPlayback() {
  if (playbackRaf !== null) cancelAnimationFrame(playbackRaf);
  playbackRaf = null;
  playbackLoopMode = null;
  if (animationPlayback) animationPlayback.stop();
  setPlayButtonState(false);
}

function tickPlayback() {
  playbackRaf = null;
  if (!animationPlayback?.isPlaying) {
    finishPlayback();
    return;
  }
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  const state = animationPlayback.getActiveStates()
    .find((candidate) => candidate.timelineId === activeTimelineId);
  if (!timeline || !state) {
    const shouldShowEnd = timeline && (playbackLoopMode || timeline.loop) === 'none';
    finishPlayback();
    if (shouldShowEnd) setCurrentFrame(timeline.workEnd ?? timeline.duration);
    return;
  }
  const rawFrame = playbackOffsetFrames + state.time * timeline.fps;
  const loop = playbackLoopMode || timeline.loop;
  if (loop === 'none' && rawFrame >= (timeline.workEnd ?? timeline.duration)) {
    finishPlayback();
    setCurrentFrame(timeline.workEnd ?? timeline.duration);
    return;
  }
  // Keep the playhead inside the same work area the engine evaluates.
  setCurrentFrame(normalizeFrame(rawFrame, timeline.duration, loop, timeline.workStart ?? 0, timeline.workEnd ?? timeline.duration));
  playbackRaf = requestAnimationFrame(tickPlayback);
}

function playAnimation(options = {}) {
  if (!activeTimelineId || !animationPlayback) return;
  const timeline = timelineById(store.document, activeTimelineId);
  if (!timeline) return;

  if (animationPlayback.isPlaying) {
    animationPlayback.pause();
    if (playbackRaf !== null) cancelAnimationFrame(playbackRaf);
    playbackRaf = null;
    setPlayButtonState(false);
    return;
  }

  if (animationPlayback.isPaused) animationPlayback.resume();
  let state = animationPlayback.getActiveStates()
    .find((candidate) => candidate.timelineId === activeTimelineId);
  if (!state) {
    playbackLoopMode = options.loop ?? timeline.loop;
    if (currentFrame >= (timeline.workEnd ?? timeline.duration) && playbackLoopMode === 'none') {
      currentFrame = timeline.workStart ?? 0;
    }
    animationPlayback.stop();
    animationPlayback.play(activeTimelineId, options);
    state = animationPlayback.getActiveStates()
      .find((candidate) => candidate.timelineId === activeTimelineId);
  }


  playbackOffsetFrames = currentFrame - (state?.time ?? 0) * timeline.fps;
  setPlayButtonState(true);
  playbackRaf = requestAnimationFrame(tickPlayback);
}

function stopAnimation() {
  finishPlayback();
  currentFrame = 0;
  setCurrentFrame(0);
}

function dispatchInteractionIntent(intent) {
  const result = interactionDispatcher.dispatch(intent);
  if (result.transportApplied) renderTimeline();
  if (result.runtimeApplied) evaluateCurrentFrame();
  return result;
}

function recordKeyframeFor(address) {
  if (!activeTimelineId) {
    showToast('Create a timeline before keyframing', true);
    return;
  }
  const frame = Math.round(currentFrame);
  try {
    store.setKeyframe({
      timelineId: activeTimelineId,
      address,
      frame,
      easing: lastEasing,
      easingParams: lastEasingParams,
    }, `Keyframe ${shortAddressLabel(address)} at frame ${frame}`);
    selectedTrackAddress = address;
    selectedKeyframe = { address, frame };
    renderTimeline();
    showToast(`Keyframed ${shortAddressLabel(address)} at frame ${frame}`);
  } catch (error) {
    showToast(error.message || String(error), true);
  }
}

function recordKeyframe() {
  if (selectedTrackAddress && isAnimatableProperty(store.document, selectedTrackAddress)) {
    recordKeyframeFor(selectedTrackAddress);
    return;
  }
  const selected = store.selectedRef;
  if (!selected) {
    showToast('Select an object or inspector property first', true);
    return;
  }

  let address = null;
  if (selected.kind === 'node') {
    const node = nodeById(store.document, selected.id);
    if (['rectangle', 'ellipse'].includes(node.type)) address = nodePropertyAddress(selected.id, 'geometry.width');
    else address = nodePropertyAddress(selected.id, 'transform.x');
  } else if (selected.kind === 'bone') {
    address = rigPropertyAddress('bone', selected.id, 'pose.rotation');
  } else if (selected.kind === 'control') {
    address = rigPropertyAddress('control', selected.id, 'position.x');
  } else if (selected.kind === 'mesh') {
    address = rigPropertyAddress('mesh', selected.id, 'opacity');
  } else if (selected.kind === 'constraint') {
    address = rigPropertyAddress('constraint', selected.id, 'strength');
  }

  if (!address) {
    showToast('Cannot keyframe this selection', true);
    return;
  }
  recordKeyframeFor(address);
}

function renderAll(reason = 'change') {
  documentName.value = store.document.name;
  const itemCount = store.document.nodes.length
    + store.document.bones.length
    + store.document.meshes.length
    + store.document.controls.length
    + store.document.constraints.length;
  nodeCount.textContent = String(itemCount);
  deleteNodeButton.disabled = !store.selectedObject;
  undoButton.disabled = !store.canUndo;
  redoButton.disabled = !store.canRedo;
  saveState.textContent = store.revision === savedRevision ? 'Saved' : 'Modified';

  if (!animationPlayback) animationPlayback = new AnimationPlayback(store.document);
  else if (animationPlayback.document !== store.document) animationPlayback.setDocument(store.document);

  evaluateCurrentFrame();
  syncArtboardFrame();
  renderHierarchy();
  renderInspector();
  renderTimeline();

  const selected = store.selectedObject;
  const selectedLabel = store.selectedKind === 'constraint' ? selected?.type : store.selectedKind;
  selectionStatus.textContent = selected ? `${selected.name} · ${selectedLabel}` : 'Artboard selected';
  if (!['selection', 'drag', 'validation-error'].includes(reason)) setStatus(reason.replace(/^./, (letter) => letter.toUpperCase()));
}

function scheduleAutosave(reason) {
  if (['selection', 'drag', 'validation-error'].includes(reason)) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, serializeVeyra(store.document));
      saveState.textContent = store.revision === savedRevision ? 'Saved' : 'Autosaved';
    } catch (error) {
      console.warn('Veyra autosave failed:', error);
    }
  }, 350);
}

store.subscribe((_current, reason) => {
  renderAll(reason);
  scheduleAutosave(reason);
});

function addPathVertex(node) {
  const vertices = node.geometry.vertices;
  const last = vertices.at(-1);
  const previous = vertices.at(-2) || last;
  const next = {
    id: createId('vertex'),
    x: (last.x + previous.x) / 2 + 24,
    y: (last.y + previous.y) / 2 + 24,
    inX: 0, inY: 0, outX: 0, outY: 0,
  };
  store.execute(`Add ${node.name} vertex`, (documentModel) => {
    nodeById(documentModel, node.id).geometry.vertices.push(next);
  });
  setTool('vertex', false);
}

function removePathVertex(node) {
  if (node.geometry.vertices.length <= 2) {
    showToast('A path needs at least two vertices', true);
    return;
  }
  store.execute(`Remove ${node.name} vertex`, (documentModel) => {
    nodeById(documentModel, node.id).geometry.vertices.pop();
  });
  setTool('vertex', false);
}

function commitDraftPath() {
  if (draftPathPoints.length < 2) {
    showToast('Place at least two points before committing a path', true);
    return;
  }
  const node = createNode('path', {
    name: 'Drawn Path',
    transform: { x: 0, y: 0 },
    paint: { fill: 'none', stroke: '#ec4899', strokeWidth: 4 },
    geometry: {
      closed: false,
      vertices: draftPathPoints.map((point) => ({ x: point.x, y: point.y, inX: 0, inY: 0, outX: 0, outY: 0 })),
    },
  });
  store.execute('Draw path', (documentModel) => documentModel.nodes.push(node));
  store.select(createNodeRef(node.id));
  draftPathPoints = [];
  renderer.setDraftPath([]);
  setTool('vertex', false);
  showToast('Path created — drag cyan vertices to edit');
}

function cancelDraftPath() {
  if (!draftPathPoints.length) return false;
  draftPathPoints = [];
  renderer.setDraftPath([]);
  showToast('Path drawing cancelled');
  return true;
}

function addNode(type) {
  const selected = store.selectedNode;
  const parent = selected?.type === 'group' ? selected : null;
  const center = parent
    ? { x: 0, y: 0 }
    : {
      x: Number(store.document.artboard.x || 0) + store.document.artboard.width / 2,
      y: Number(store.document.artboard.y || 0) + store.document.artboard.height / 2,
    };
  const palette = {
    rectangle: { fill: '#f472b6', stroke: '#831843', strokeWidth: 3 },
    ellipse: { fill: '#22d3ee', stroke: '#155e75', strokeWidth: 3 },
    path: { fill: '#fce7f3', stroke: '#ec4899', strokeWidth: 4 },
    polygon: { fill: '#c4b5fd', stroke: '#5b21b6', strokeWidth: 3 },
    star: { fill: '#facc15', stroke: '#854d0e', strokeWidth: 3 },
    group: { fill: 'none', stroke: 'none', strokeWidth: 0 },
  };
  const node = createNode(type, {
    name: `New ${type[0].toUpperCase()}${type.slice(1)}`,
    parent: parent ? createNodeRef(parent.id) : null,
    transform: center,
    paint: palette[type],
  });
  store.execute(`Add ${type}`, (documentModel) => documentModel.nodes.push(node));
  store.select(createNodeRef(node.id));
  showToast(`${node.name} added`);
}

document.querySelectorAll('[data-add]').forEach((button) => {
  button.addEventListener('click', () => addNode(button.dataset.add));
});

function addRig(kind) {
  const center = {
    x: Number(store.document.artboard.x || 0) + store.document.artboard.width / 2,
    y: Number(store.document.artboard.y || 0) + store.document.artboard.height / 2,
  };
  if (kind === 'bone') {
    const parent = store.selectedBone;
    const boneId = store.addBone({
      name: parent ? `${parent.name} Child` : 'New Bone',
      parent: parent ? createBoneRef(parent.id) : null,
      rest: parent ? { x: parent.length, y: 0 } : center,
      length: parent ? Math.max(40, parent.length * 0.72) : 120,
    }, 'Add bone');
    setTool('bone', false);
    showToast(`${boneById(store.document, boneId).name} added`);
    return;
  }

  if (kind === 'control') {
    const selectedBoneState = evaluatedScene?.bones.find((bone) => bone.id === store.selectedBone?.id);
    const controlId = store.addControl({
      name: 'New Position Control',
      position: selectedBoneState?.end || center,
    }, 'Add control');
    setTool('control', false);
    showToast(`${controlById(store.document, controlId).name} added`);
    return;
  }

  if (kind === 'mesh') {
    const sourceBone = store.selectedBone || store.document.bones[0] || null;
    const weights = sourceBone ? [{ bone: createBoneRef(sourceBone.id), value: 1 }] : [];
    const vertices = [
      { id: `meshVertex_${crypto.randomUUID()}`, x: center.x - 80, y: center.y - 45, weights: cloneValue(weights) },
      { id: `meshVertex_${crypto.randomUUID()}`, x: center.x + 80, y: center.y - 45, weights: cloneValue(weights) },
      { id: `meshVertex_${crypto.randomUUID()}`, x: center.x + 80, y: center.y + 45, weights: cloneValue(weights) },
      { id: `meshVertex_${crypto.randomUUID()}`, x: center.x - 80, y: center.y + 45, weights: cloneValue(weights) },
    ];
    const meshId = store.addMesh({
      name: 'New Weighted Mesh',
      vertices,
      triangles: [
        [vertices[0], vertices[1], vertices[2]].map((vertex) => createMeshVertexRef(vertex.id)),
        [vertices[0], vertices[2], vertices[3]].map((vertex) => createMeshVertexRef(vertex.id)),
      ],
    }, 'Add mesh');
    setTool('mesh', false);
    showToast(sourceBone ? `${meshById(store.document, meshId).name} added and weighted to ${sourceBone.name}` : `${meshById(store.document, meshId).name} added without weights`);
    return;
  }

  if (kind === 'constraint') {
    const type = $('constraintType').value;
    const bone = store.selectedBone || store.document.bones.at(-1);
    const control = store.document.controls[0];
    const targetBone = store.document.bones.find((candidate) => candidate.id !== bone?.id);
    const path = store.document.nodes.find((node) => node.type === 'path');
    if (!bone) {
      showToast('Add and select a bone before creating a constraint.', true);
      return;
    }
    let overrides;
    if (type === 'ik') {
      if (!control) {
        showToast('IK requires a position control.', true);
        return;
      }
      const parent = bone.parent ? boneById(store.document, referenceId(bone.parent, 'bone')) : null;
      const chain = parent ? [parent, bone] : [bone];
      overrides = {
        bones: chain.map((item) => createBoneRef(item.id)),
        target: createControlRef(control.id),
      };
    } else if (type === 'distance') {
      if (!control) {
        showToast('A distance constraint requires a position control.', true);
        return;
      }
      overrides = { bone: createBoneRef(bone.id), target: createControlRef(control.id), distance: bone.length };
    } else if (type === 'path') {
      if (!path) {
        showToast('A path constraint requires an authored path object.', true);
        return;
      }
      overrides = { bone: createBoneRef(bone.id), path: createNodeRef(path.id), position: 0.5 };
    } else {
      if (!targetBone) {
        showToast(`${type[0].toUpperCase()}${type.slice(1)} requires a second bone as its target.`, true);
        return;
      }
      overrides = { bone: createBoneRef(bone.id), target: createBoneRef(targetBone.id) };
    }
    const constraintName = `${bone.name} ${type[0].toUpperCase()}${type.slice(1)}`;
    store.addConstraint(type, {
      name: constraintName,
      ...overrides,
      order: store.document.constraints.length,
    }, `Add ${type} constraint`);
    setTool('constraint', false);
    showToast(`${constraintName} added`);
  }
}

document.querySelectorAll('[data-add-rig]').forEach((button) => {
  button.addEventListener('click', () => addRig(button.dataset.addRig));
});

document.querySelectorAll('[data-tool]').forEach((button) => {
  button.addEventListener('click', () => setTool(button.dataset.tool));
});

documentName.addEventListener('change', () => {
  const next = documentName.value.trim() || 'Untitled Veyra';
  commit('Rename document', (documentModel) => { documentModel.name = next; });
});

$('newDocument').onclick = () => {
  if (store.revision !== savedRevision && !confirm('Create a new Veyra document? Your current work is autosaved but not downloaded.')) return;
  store.replaceDocument(createDocument({ name: 'Untitled Veyra' }), 'new document');
  savedRevision = store.revision;
  fitCanvas();
  localStorage.removeItem(AUTOSAVE_KEY);
  showToast('New Veyra document created');
};

$('openDocument').onclick = () => openFile.click();
openFile.onchange = async () => {
  const picked = openFile.files?.[0];
  if (!picked) return;
  try {
    const documentModel = parseVeyra(await picked.text());
    store.replaceDocument(documentModel, `opened ${picked.name}`);
    savedRevision = store.revision;
    fitCanvas();
    showToast(`${picked.name} opened`);
  } catch (error) {
    console.error(error);
    showToast(error.message || String(error), true);
  } finally {
    openFile.value = '';
  }
};

function save() {
  try {
    downloadVeyra(store.document);
    savedRevision = store.revision;
    renderAll('saved .veyra');
    showToast(`${store.document.name}.veyra downloaded`);
  } catch (error) {
    showToast(error.message || String(error), true);
  }
}

$('saveDocument').onclick = save;
$('exportSvg').onclick = () => {
  try {
    downloadSvg(store.document);
    showToast('SVG render exported');
  } catch (error) {
    showToast(error.message || String(error), true);
  }
};

undoButton.onclick = () => store.undo();
redoButton.onclick = () => store.redo();
deleteNodeButton.onclick = () => store.removeSelection();

// Timeline event handlers
timelineToggle.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'bottom', !workspaceLayout.bottomCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};

timelineSelect.onchange = () => {
  activeTimelineId = timelineSelect.value;
  if (animationPlayback?.isPlaying || animationPlayback?.isPaused) stopAnimation();
  renderTimeline();
};

timelineAdd.onclick = () => {
  const name = prompt('Timeline name:', `Timeline ${store.document.timelines.length + 1}`);
  if (!name) return;
  try {
    const id = store.addTimeline({ name, duration: 60, fps: 30 }, `Create timeline ${name}`);
    activeTimelineId = id;
    renderTimeline();
    showToast(`Timeline "${name}" created`);
  } catch (error) {
    showToast(error.message || String(error), true);
  }
};

timelineDelete.onclick = () => {
  if (!activeTimelineId) return;
  const timeline = timelineById(store.document, activeTimelineId);
  if (!confirm(`Delete timeline "${timeline.name}"?`)) return;
  try {
    store.removeTimeline(activeTimelineId, `Delete timeline ${timeline.name}`);
    activeTimelineId = store.document.timelines[0]?.id || null;
    if (animationPlayback?.isPlaying || animationPlayback?.isPaused) stopAnimation();
    renderTimeline();
    showToast('Timeline deleted');
  } catch (error) {
    showToast(error.message || String(error), true);
  }
};

playToggle.onclick = () => playAnimation();
playStop.onclick = () => stopAnimation();
playToStart.onclick = () => {
  currentFrame = 0;
  setCurrentFrame(0);
};

keyframeSelected.onclick = () => recordKeyframe();

loopMode.onchange = () => {
  if (!activeTimelineId) return;
  try {
    store.updateTimeline(activeTimelineId, { loop: loopMode.value }, 'Change loop mode');
  } catch (error) {
    showToast(error.message || String(error), true);
  }
};

fpsInput.onchange = () => {
  if (!activeTimelineId) return;
  const fps = parseInt(fpsInput.value, 10);
  if (!fps || fps < 1 || fps > 240) {
    showToast('FPS must be between 1 and 240', true);
    return;
  }
  try {
    store.updateTimeline(activeTimelineId, { fps }, 'Change FPS');
    renderTimeline();
  } catch (error) {
    showToast(error.message || String(error), true);
  }
};

durationInput.onchange = () => {
  if (!activeTimelineId) return;
  const duration = parseInt(durationInput.value, 10);
  if (!duration || duration < 1 || duration > 100000) {
    showToast('Duration must be between 1 and 100000 frames', true);
    renderTimeline();
    return;
  }
  try {
    store.updateTimeline(activeTimelineId, { duration }, 'Change duration');
  } catch (error) {
    showToast(error.message || String(error), true);
  }
  renderTimeline();
};

function beginWorkAreaDrag(event, mode, initialStart, initialEnd) {
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  if (!timeline) return;
  event.preventDefault();
  const element = event.currentTarget;
  const startX = event.clientX;
  const span = initialEnd - initialStart;
  const clampFrame = (value) => Math.max(0, Math.min(Math.round(value), timeline.duration));
  const apply = (nextStart, nextEnd) => {
    workStartInput.value = String(nextStart);
    workEndInput.value = String(nextEnd);
    const band = timelineGrid.querySelector('.workAreaBand');
    if (band) {
      band.style.left = `${nextStart * timelinePxPerFrame}px`;
      band.style.width = `${Math.max(1, (nextEnd - nextStart) * timelinePxPerFrame)}px`;
    }
  };
  element.setPointerCapture?.(event.pointerId);
  element.classList.add('isDragging');
  const onMove = (nextEvent) => {
    const delta = Math.round((nextEvent.clientX - startX) / timelinePxPerFrame);
    let nextStart = initialStart;
    let nextEnd = initialEnd;
    if (mode === 'move') {
      nextStart = clampFrame(initialStart + delta);
      nextEnd = nextStart + span;
      if (nextEnd > timeline.duration) {
        nextEnd = timeline.duration;
        nextStart = clampFrame(nextEnd - span);
      }
    } else if (mode === 'start') {
      nextStart = clampFrame(initialStart + delta);
      nextStart = Math.min(nextStart, initialEnd - 1);
    } else {
      nextEnd = clampFrame(initialEnd + delta);
      nextEnd = Math.max(nextEnd, initialStart + 1);
    }
    apply(nextStart, nextEnd);
  };
  const onEnd = (nextEvent) => {
    element.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerup', onEnd);
    element.removeEventListener('pointercancel', onEnd);
    element.classList.remove('isDragging');
    const nextStart = Number(workStartInput.value);
    const nextEnd = Number(workEndInput.value);
    if (nextStart === initialStart && nextEnd === initialEnd) return;
    if (!Number.isInteger(nextStart) || !Number.isInteger(nextEnd)) {
      renderTimeline();
      return;
    }
    try {
      store.updateTimeline(activeTimelineId, { workStart: nextStart, workEnd: nextEnd }, 'Adjust work area');
      setStatus(`Work area ${nextStart}–${nextEnd}`);
    } catch (error) {
      showToast(error.message || String(error), true);
    }
    renderTimeline();
  };
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onEnd);
  element.addEventListener('pointercancel', onEnd);
}

function updateWorkArea(field, input, label) {
  if (!activeTimelineId) return;
  const value = Number(input.value);
  if (!Number.isInteger(value)) {
    showToast(`${label} must be a whole frame`, true);
    renderTimeline();
    return;
  }
  try {
    store.updateTimeline(activeTimelineId, { [field]: value }, `Set timeline ${label.toLowerCase()} point`);
  } catch (error) {
    showToast(error.message || String(error), true);
  }
  renderTimeline();
}

workStartInput.onchange = () => updateWorkArea('workStart', workStartInput, 'In');
workEndInput.onchange = () => updateWorkArea('workEnd', workEndInput, 'Out');

timelineRuler.addEventListener('click', (event) => {
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  if (!timeline) return;
  const rect = timelineGridWrap.getBoundingClientRect();
  const x = event.clientX - rect.left + timelineGridWrap.scrollLeft;
  setCurrentFrame(x / timelinePxPerFrame);
});

timelineRuler.addEventListener('dblclick', () => {
  timelinePxPerFrame = 20;
  renderTimeline();
});

timelineGridWrap.addEventListener('wheel', (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const timeline = activeTimelineId ? timelineById(store.document, activeTimelineId) : null;
  if (!timeline) return;
  const rect = timelineGridWrap.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const frameAtPointer = (pointerX + timelineGridWrap.scrollLeft) / timelinePxPerFrame;
  const factor = Math.exp(-event.deltaY * 0.002);
  timelinePxPerFrame = Math.max(2, Math.min(120, timelinePxPerFrame * factor));
  renderTimeline();
  timelineGridWrap.scrollLeft = frameAtPointer * timelinePxPerFrame - pointerX;
}, { passive: false });

function updateZoomLabel() {
  zoomValue.value = `${Math.round(zoom * 100)}%`;
  zoomValue.textContent = zoomValue.value;
}

function syncArtboardFrame() {
  const artboard = store.document.artboard;
  const artboardX = Number(artboard.x || 0);
  const artboardY = Number(artboard.y || 0);
  const topLeft = renderer.worldToClient(artboardX, artboardY);
  const bottomRight = renderer.worldToClient(artboardX + artboard.width, artboardY + artboard.height);
  if (!topLeft || !bottomRight) return;
  const viewportRect = stageViewport.getBoundingClientRect();
  artboardFrame.style.left = `${topLeft.x - viewportRect.left}px`;
  artboardFrame.style.top = `${topLeft.y - viewportRect.top}px`;
  artboardFrame.style.width = `${Math.max(1, bottomRight.x - topLeft.x)}px`;
  artboardFrame.style.height = `${Math.max(1, bottomRight.y - topLeft.y)}px`;
}

function setZoom(next, anchor = null) {
  zoom = renderer.setZoom(next, anchor);
  evaluateCurrentFrame();
  syncArtboardFrame();
  updateZoomLabel();
}

function applyViewportState(next, status = null) {
  const applied = renderer.setViewport(next);
  zoom = applied.zoom;
  evaluateCurrentFrame();
  syncArtboardFrame();
  updateZoomLabel();
  if (status) setStatus(status);
  return applied;
}

function editorScreenSize() {
  const rect = stageViewport.getBoundingClientRect();
  return {
    width: Math.max(1, stageViewport.clientWidth || rect.width || 1),
    height: Math.max(1, stageViewport.clientHeight || rect.height || 1),
  };
}

function fitCanvas() {
  return applyViewportState(fitArtboardViewport(store.document.artboard, editorScreenSize(), { padding: 32 }), 'Artboard fitted');
}

function focusEditorReference(ref, { select = true, padding = 54 } = {}) {
  if (!ref?.kind || !ref?.id) return false;
  if (!evaluatedScene) evaluateCurrentFrame();
  const bounds = evaluatedRefBounds(evaluatedScene, ref);
  if (!bounds) {
    showToast(`Cannot locate ${ref.kind}:${ref.id}`, true);
    return false;
  }
  if (select) store.select(ref);
  const next = fitBoundsViewport(bounds, store.document.artboard, editorScreenSize(), { padding });
  applyViewportState(next, `Focused ${ref.kind}`);
  return true;
}

function fitSelection() {
  if (!store.selectedRef) {
    showToast('Select an object to fit', true);
    return false;
  }
  return focusEditorReference(store.selectedRef, { select: false, padding: 44 });
}

$('zoomOut').onclick = () => setZoom(zoom / 1.2);
$('zoomIn').onclick = () => setZoom(zoom * 1.2);
$('zoomFit').onclick = fitCanvas;
$('zoom100').onclick = () => applyViewportState({ ...renderer.getViewport(), zoom: 1 }, 'Canvas 100% · 1 CSS px per world unit');
$('fitSelection').onclick = fitSelection;
$('focusSelection').onclick = () => store.selectedRef ? focusEditorReference(store.selectedRef) : showToast('Select an object to focus', true);

stageViewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey || event.altKey) {
    const anchor = renderer.clientPoint(event.clientX, event.clientY);
    setZoom(zoom * wheelZoomFactor(event.deltaY, event.deltaMode), anchor);
    setStatus(`Canvas zoom ${Math.round(zoom * 100)}%`);
    return;
  }
  const horizontal = normalizeWheelDelta(event.shiftKey ? event.deltaY + event.deltaX : event.deltaX, event.deltaMode) * 0.8;
  const vertical = event.shiftKey ? 0 : normalizeWheelDelta(event.deltaY, event.deltaMode) * 0.8;
  const matrix = canvas.getScreenCTM();
  const worldPerPixel = matrix ? 1 / Math.max(1e-9, Math.abs(matrix.a)) : store.document.artboard.width / Math.max(1, zoom * canvas.clientWidth);
  renderer.panBy(horizontal * worldPerPixel, vertical * worldPerPixel);
  syncArtboardFrame();
  setStatus(event.shiftKey ? 'Canvas panned horizontally' : 'Canvas panned');
}, { passive: false });

let panGesture = null;
let activeArtboardResize = null;
let spacePanHeld = false;
let spacePanUsed = false;
let suppressNextCanvasContextMenu = false;

function artboardResizeDirectionAt(clientX, clientY) {
  const rect = artboardFrame.getBoundingClientRect();
  return classifyArtboardResizeZone({ x: clientX, y: clientY }, rect);
}

function beginArtboardResize(event, direction) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const startViewport = renderer.getViewport();
  const startArtboard = {
    x: Number(store.document.artboard.x || 0),
    y: Number(store.document.artboard.y || 0),
    width: store.document.artboard.width,
    height: store.document.artboard.height,
  };
  const matrix = canvas.getScreenCTM();
  const screenScaleX = matrix ? Math.hypot(matrix.a, matrix.b) : renderer.zoom;
  const screenScaleY = matrix ? Math.hypot(matrix.c, matrix.d) : renderer.zoom;
  const gesture = createArtboardResizeGesture({
    store,
    direction,
    start: { x: event.clientX, y: event.clientY },
    startArtboard,
    scaleX: 1 / Math.max(1e-9, screenScaleX),
    scaleY: 1 / Math.max(1e-9, screenScaleY),
    onMove: (state) => {
      // Resizing authors the frame origin/dimensions only. The camera is
      // deliberately untouched, so artwork remains stationary on screen.
      syncArtboardFrame();
      setStatus(`Artboard ${state.width} × ${state.height} @ ${state.x}, ${state.y}`);
    },
  });
  stageViewport.setPointerCapture?.(event.pointerId);
  stageViewport.classList.add('isArtboardResizing');
  stageViewport.style.cursor = artboardResizeCursor(direction);

  const cleanup = () => {
    stageViewport.removeEventListener('pointermove', onMove);
    stageViewport.removeEventListener('pointerup', onCommit);
    stageViewport.removeEventListener('pointercancel', onCancel);
    stageViewport.removeEventListener('lostpointercapture', onCancel);
    stageViewport.classList.remove('isArtboardResizing');
    stageViewport.style.cursor = '';
    activeArtboardResize = null;
  };
  const finish = (commitGesture, nextEvent) => {
    cleanup();
    try { stageViewport.releasePointerCapture?.(event.pointerId); } catch {}
    const result = commitGesture ? gesture.end() : gesture.cancel();
    if (!commitGesture) {
      evaluateCurrentFrame();
      syncArtboardFrame();
      setStatus('Artboard resize cancelled');
    } else if (result.error) {
      renderAll('validation-error');
    } else if (result.committed) {
      syncArtboardFrame();
      setStatus(`Artboard ${result.width} × ${result.height}`);
    }
    return result;
  };
  const onMove = (nextEvent) => {
    if (nextEvent.pointerId !== event.pointerId) return;
    gesture.move(nextEvent);
  };
  const onCommit = (nextEvent) => {
    if (nextEvent.pointerId !== event.pointerId) return;
    finish(true, nextEvent);
  };
  const onCancel = (nextEvent) => {
    if (nextEvent.pointerId != null && nextEvent.pointerId !== event.pointerId) return;
    finish(false, nextEvent);
  };
  activeArtboardResize = { pointerId: event.pointerId, direction, cancel: () => finish(false, event), gesture };
  stageViewport.addEventListener('pointermove', onMove);
  stageViewport.addEventListener('pointerup', onCommit);
  stageViewport.addEventListener('pointercancel', onCancel);
  stageViewport.addEventListener('lostpointercapture', onCancel);
}

stageViewport.addEventListener('pointerdown', (event) => {
  const resizeDirection = event.button === 0 ? artboardResizeDirectionAt(event.clientX, event.clientY) : null;
  if (resizeDirection) {
    beginArtboardResize(event, resizeDirection);
    return;
  }
  const kind = navigationPanKind(event, { tool: currentTool, spaceHeld: spacePanHeld });
  if (!kind) return;
  if (kind === 'right') suppressNextCanvasContextMenu = false;
  if (kind !== 'right') event.preventDefault();
  event.stopImmediatePropagation();
  panGesture = {
    kind,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    clientX: event.clientX,
    clientY: event.clientY,
    moved: false,
  };
  stageViewport.setPointerCapture?.(event.pointerId);
  stageViewport.classList.add('isPanning');
}, true);

stageViewport.addEventListener('pointermove', (event) => {
  if (!panGesture || event.pointerId !== panGesture.pointerId) {
    if (!activeArtboardResize) stageViewport.style.cursor = artboardResizeCursor(artboardResizeDirectionAt(event.clientX, event.clientY));
    return;
  }
  if (!panGesture.moved) {
    panGesture.moved = panGestureMoved(
      { x: panGesture.startX, y: panGesture.startY },
      { x: event.clientX, y: event.clientY },
    );
  }
  if (!panGesture.moved) return;
  if (panGesture.kind === 'space') spacePanUsed = true;
  if (panGesture.kind === 'right') event.preventDefault();
  const before = renderer.clientPoint(panGesture.clientX, panGesture.clientY);
  const after = renderer.clientPoint(event.clientX, event.clientY);
  renderer.panBy(before.x - after.x, before.y - after.y);
  syncArtboardFrame();
  panGesture.clientX = event.clientX;
  panGesture.clientY = event.clientY;
});

const finishPan = (event) => {
  if (!panGesture || event.pointerId !== panGesture.pointerId) return;
  const finished = panGesture;
  panGesture = null;
  try { stageViewport.releasePointerCapture?.(event.pointerId); } catch {}
  stageViewport.classList.remove('isPanning');
  if (shouldSuppressCanvasContextMenu(finished)) suppressNextCanvasContextMenu = true;
  syncArtboardFrame();
  if (finished.moved) setStatus('Canvas panned');
};
stageViewport.addEventListener('pointerup', finishPan);
stageViewport.addEventListener('pointercancel', finishPan);
stageViewport.addEventListener('lostpointercapture', finishPan);
stageViewport.addEventListener('contextmenu', (event) => {
  if (!suppressNextCanvasContextMenu) return;
  event.preventDefault();
  event.stopPropagation();
  suppressNextCanvasContextMenu = false;
});

new ResizeObserver(() => { renderer.syncViewport(); syncArtboardFrame(); }).observe(stageViewport);

function wireWorkspaceSplitter(element, panel) {
  if (!element) return;
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const property = panel === 'left' ? 'leftWidth' : panel === 'right' ? 'rightWidth' : 'bottomHeight';
    const startSize = workspaceLayout[property];
    element.setPointerCapture?.(event.pointerId);
    element.classList.add('isDragging');
    const onMove = (nextEvent) => {
      const delta = panel === 'left'
        ? nextEvent.clientX - startX
        : panel === 'right'
          ? startX - nextEvent.clientX
          : startY - nextEvent.clientY;
      workspaceLayout = setWorkspacePanelSize(workspaceLayout, panel, startSize + delta, { width: window.innerWidth, height: window.innerHeight });
      applyWorkspaceLayout(false);
    };
    const onEnd = (nextEvent) => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onEnd);
      element.removeEventListener('pointercancel', onEnd);
      element.classList.remove('isDragging');
      try { element.releasePointerCapture?.(nextEvent.pointerId); } catch {}
      applyWorkspaceLayout(true);
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onEnd);
    element.addEventListener('pointercancel', onEnd);
  });
  element.addEventListener('dblclick', () => {
    const property = panel === 'left' ? 'leftWidth' : panel === 'right' ? 'rightWidth' : 'bottomHeight';
    workspaceLayout = setWorkspacePanelSize(workspaceLayout, panel, VEYRA_WORKSPACE_LAYOUT_DEFAULTS[property], { width: window.innerWidth, height: window.innerHeight });
    applyWorkspaceLayout();
  });
}
wireWorkspaceSplitter(leftSplitter, 'left');
wireWorkspaceSplitter(rightSplitter, 'right');
wireWorkspaceSplitter(timelineSplitter, 'bottom');
hierarchyCollapse.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'left', !workspaceLayout.leftCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};
inspectorCollapse.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'right', !workspaceLayout.rightCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};
window.addEventListener('resize', () => applyWorkspaceLayout(false));

// The three handlers below are built by createPreviewPointerHandlers so an
// integration test can call the EXACT SAME functions directly (including
// their stopPropagation/preventDefault calls) instead of a reimplementation
// that could drift from what's actually wired to the canvas.
const previewPointerHandlers = createPreviewPointerHandlers({
  canvas,
  interactionBridge,
  getEvaluatedScene: () => evaluatedScene,
  getInteractionSceneRevision: () => interactionSceneRevision,
  getTool: () => currentTool,
  getPanGesture: () => panGesture,
  getPreviewMode: () => stagePanel.dataset.mode === 'preview' || document.body.dataset.mode === 'preview',
  getViewCenter: () => renderer.viewCenter,
  getZoom: () => renderer.zoom,
  getArtboardSize: () => ({
    x: Number(store.document.artboard.x || 0),
    y: Number(store.document.artboard.y || 0),
    width: store.document.artboard.width,
    height: store.document.artboard.height,
  }),
  isAuthoringEvent: (event) => event.target instanceof Element && Boolean(event.target.closest('.resizeHandle')),
  onNoHit: () => showToast('No interaction target under pointer', true),
});

canvas.addEventListener('pointermove', previewPointerHandlers.onPointerMove, true);
canvas.addEventListener('pointerup', previewPointerHandlers.onPointerUp, true);
canvas.addEventListener('pointerdown', previewPointerHandlers.onPointerDown, true);

// Artboard resizing is classified in final CSS pixels by the stage capture
// path above. There are no permanent DOM edge/corner handles: every edge and
// corner gets the same screen-space tolerance at every zoom.

const toggleInspectorButton = $('toggleInspector');
const toggleHierarchyButton = $('toggleHierarchyPanel');
toggleInspectorButton.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'right', !workspaceLayout.rightCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};
toggleHierarchyButton.onclick = () => {
  workspaceLayout = setWorkspacePanelCollapsed(workspaceLayout, 'left', !workspaceLayout.leftCollapsed, { width: window.innerWidth, height: window.innerHeight });
  applyWorkspaceLayout();
};

window.addEventListener('keydown', (event) => {
  const target = event.target;
  const editing = target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target?.isContentEditable;
  const commandKey = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (commandKey && (['+', '='].includes(event.key) || event.code === 'NumpadAdd')) {
    event.preventDefault();
    setZoom(zoom * 1.2);
    setStatus(`Canvas zoom ${Math.round(zoom * 100)}%`);
  } else if (commandKey && (event.key === '-' || event.code === 'NumpadSubtract')) {
    event.preventDefault();
    setZoom(zoom / 1.2);
    setStatus(`Canvas zoom ${Math.round(zoom * 100)}%`);
  } else if (commandKey && (event.key === '0' || event.code === 'Numpad0')) {
    event.preventDefault();
    fitCanvas();
  } else if (commandKey && key === 's') {
    event.preventDefault();
    save();
  } else if (!editing && commandKey && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) store.redo();
    else store.undo();
  } else if (!editing && commandKey && key === 'y') {
    event.preventDefault();
    store.redo();
  } else if (!editing && !commandKey && !event.altKey && key === 'f') {
    event.preventDefault();
    if (event.shiftKey) {
      if (store.selectedRef) focusEditorReference(store.selectedRef);
      else showToast('Select an object to focus', true);
    } else fitSelection();
  } else if (!editing && !commandKey && !event.altKey && ['v', 'e', 'p', 'b', 'm', 'c', 'k', 'h'].includes(key)) {
    event.preventDefault();
    setTool({ v: 'select', e: 'vertex', p: 'pencil', b: 'bone', m: 'mesh', c: 'control', k: 'constraint', h: 'pan' }[key]);
  } else if (!editing && currentTool === 'pencil' && event.key === 'Enter') {
    event.preventDefault();
    commitDraftPath();
  } else if (!editing && event.key === ' ') {
    event.preventDefault();
    if (!event.repeat) {
      spacePanHeld = true;
      spacePanUsed = false;
    }
  } else if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) {
    if (selectedKeyframe) {
      event.preventDefault();
      deleteSelectedKeyframe();
    } else if (store.selectedId) {
      event.preventDefault();
      store.removeSelection();
    }
  } else if (!editing && event.key === 'Escape') {
    if (activeArtboardResize) {
      activeArtboardResize.cancel();
      return;
    }
    if (renderer.cancelActiveGesture()) {
      setStatus('Authoring gesture cancelled');
      return;
    }
    if (currentTool === 'pencil') {
      cancelDraftPath();
      setTool('select', false);
      return;
    }
    if (currentTool === 'vertex') setTool('select', false);
    if (selectedKeyframe) {
      selectedKeyframe = null;
      renderTimeline();
    } else {
      store.select(null);
    }
  }
});

window.addEventListener('keyup', (event) => {
  if (event.key !== ' ') return;
  const wasHeld = spacePanHeld;
  spacePanHeld = false;
  if (wasHeld && !spacePanUsed && !panGesture) playAnimation();
  spacePanUsed = false;
});

window.addEventListener('beforeunload', () => {
  try { localStorage.setItem(AUTOSAVE_KEY, serializeVeyra(store.document)); } catch {}
});

function machineRuntime(machineId) {
  const runtime = machineInteractionBridge.runtimeFor(machineId);
  if (!runtime) throw new TypeError(`State machine ${machineId} does not exist.`);
  return runtime;
}

const controlPlane = createVeyraControlPlane(store);

function compactJson(value) {
  if (Array.isArray(value)) return value.map(compactJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, compactJson(item)]));
  }
  return value;
}

function dispatchCompatibilityCommand(action, args, command) {
  const result = controlPlane.dispatchCommand(compactJson({ action, args, command }));
  if (!result.ok) throw new TypeError(result.error);
  return result.result;
}

globalThis.veyra = Object.freeze({
  getViewportState: () => ({ ...renderer.getViewport(), layout: { ...workspaceLayout }, theme: document.documentElement.dataset.theme }),
  setViewport: (viewport) => applyViewportState(viewport, 'Viewport updated'),
  fitArtboard: () => fitCanvas(),
  fitSelection: () => fitSelection(),
  focusReference: (ref) => focusEditorReference(ref),
  getManifest: (options = {}) => controlPlane.getManifest(options),
  queryEntities: (query = {}, options = {}) => controlPlane.queryEntities(query, options),
  resolveSemantic: (intent, options = {}) => controlPlane.resolveSemantic(intent, options),
  read: (refOrAddress, options = {}) => controlPlane.read(refOrAddress, options),
  previewCommand: (command, options = {}) => controlPlane.previewCommand(command, options),
  dispatchCommand: (command) => controlPlane.dispatchCommand(command),
  dispatchPlan: (commands, policy = {}) => controlPlane.dispatchPlan(commands, policy),
  validateDocument: () => controlPlane.validateDocument(),
  verifyChange: (expected, options = {}) => controlPlane.verifyChange(expected, options),
  getDependencyGraph: (refOrAddress = null, options = {}) => controlPlane.getDependencyGraph(refOrAddress, options),
  getOwnership: (refOrAddress, options = {}) => controlPlane.getOwnership(refOrAddress, options),
  getSceneSummary: (options = {}) => createSceneSummary(store.document, options),
  getSemanticIndex: (options = {}) => buildSemanticIndex(store.document, options),
  getDocument: () => cloneValue(store.document),
  getEvaluatedScene: () => cloneValue(evaluateDocument(store.document)),
  readProperty: (address) => controlPlane.read(address).authoredValue,
  addListener: (overrides) => dispatchCompatibilityCommand('addListener', { overrides }, { label: 'Add listener', source: 'script' }),
  updateListener: (listenerId, changes) => dispatchCompatibilityCommand('updateListener', { listenerId, changes }, { label: `Update listener ${listenerId}`, source: 'script' }),
  removeListener: (listenerId) => Boolean(dispatchCompatibilityCommand('removeListener', { listenerId }, { label: `Delete listener ${listenerId}`, source: 'script' })),
  applyCommand: ({ label, address, value, source = 'script' }) => {
    dispatchCompatibilityCommand('setProperty', { address, value }, {
      label, source, propertyAddresses: [address],
    });
    return controlPlane.read(address).authoredValue;
  },
  setMeshVertexWeights: ({ meshId, vertexId, weights, label = 'Set mesh vertex weights', source = 'script' }) => {
    store.execute({ label, source }, (documentModel) => {
      const mesh = meshById(documentModel, meshId);
      const vertex = mesh?.vertices.find((candidate) => candidate.id === vertexId);
      if (!vertex) throw new TypeError(`Mesh vertex ${vertexId} does not exist on ${meshId}.`);
      vertex.weights = weights.map((weight) => ({
        bone: createBoneRef(referenceId(weight.bone ?? weight.boneId, 'bone')),
        value: Number(weight.value),
      }));
    });
    return cloneValue(meshById(store.document, meshId).vertices.find((vertex) => vertex.id === vertexId).weights);
  },
  createTimeline: ({ name = 'Timeline', duration = 60, fps = 30, loop = 'none' } = {}) => {
    return dispatchCompatibilityCommand('addTimeline', { overrides: { name, duration, fps, loop } }, {
      label: `Create timeline ${name}`,
      source: 'script',
    });
  },
  setKeyframe: ({ timelineId, address, frame, value, easing = 'ease-in-out', easingParams }) => {
    return Boolean(dispatchCompatibilityCommand('setKeyframe', {
      timelineId, address, frame, value, easing, easingParams,
    }, { label: 'Set keyframe', source: 'script' }));
  },
  removeKeyframe: ({ timelineId, address, frame }) => {
    return Boolean(dispatchCompatibilityCommand('removeKeyframe', {
      timelineId, address, frame,
    }, { label: 'Remove keyframe', source: 'script' }));
  },
  moveKeyframe: ({ timelineId, address, fromFrame, toFrame }) => {
    return Boolean(dispatchCompatibilityCommand('moveKeyframe', {
      timelineId, address, fromFrame, toFrame,
    }, { label: 'Move keyframe', source: 'script' }));
  },
  getTimelines: () => cloneValue(store.document.timelines),
  playTimeline: (timelineId, { loop, speed } = {}) => {
    if (!animationPlayback || !timelineById(store.document, timelineId)) return false;
    finishPlayback();
    currentFrame = 0;
    activeTimelineId = timelineId;
    renderTimeline();
    playAnimation({ loop, speed });
    return true;
  },
  stopPlayback: () => {
    stopAnimation();
    return true;
  },
  getCommandHistory: () => store.commandHistory,
  getMachines: () => cloneValue(store.document.stateMachines || []),
  getMachine: (machineId) => cloneValue(machineById(store.document, machineId)),
  createMachine: ({ name = 'State Machine', inputs = [], states = [], transitions = [], initial } = {}) => {
    return dispatchCompatibilityCommand('addStateMachine', { overrides: { name, inputs, states, transitions, initial } }, {
      label: `Create state machine ${name}`,
      source: 'script',
    });
  },
  deleteMachine: (machineId) => {
    const machine = machineById(store.document, machineId);
    if (!machine) return false;
    const removed = Boolean(dispatchCompatibilityCommand('removeStateMachine', { machineId }, {
      label: `Delete state machine ${machine.name}`,
      source: 'script',
    }));
    if (removed) machineInteractionBridge.prune();
    return removed;
  },
  addMachineInput: (machineId, { name = 'Value', type = 'number', value }) => {
    return dispatchCompatibilityCommand('addMachineInput', { machineId, overrides: { name, type, value } }, {
      label: `Add machine input ${name}`,
      source: 'script',
    });
  },
  addMachineState: (machineId, { name = 'State', timelineId, type = 'animation' }) => {
    return dispatchCompatibilityCommand('addMachineState', { machineId, overrides: { name, type, timelineId } }, {
      label: `Add state ${name}`,
      source: 'script',
    });
  },
  removeMachineState: (machineId, stateId) => {
    return Boolean(dispatchCompatibilityCommand('removeMachineState', { machineId, stateId }, {
      label: 'Delete machine state', source: 'script',
    }));
  },
  addMachineTransition: (machineId, { from, to, duration = 0, after, conditions = [] }) => {
    return dispatchCompatibilityCommand('addMachineTransition', {
      machineId,
      overrides: {
        from, to, duration, after,
        conditions: conditions.map((condition) => ({ input: condition.input, op: condition.op, value: condition.value })),
      },
    }, { label: 'Add machine transition', source: 'script' });
  },
  removeMachineTransition: (machineId, transitionId) => {
    return Boolean(dispatchCompatibilityCommand('removeMachineTransition', { machineId, transitionId }, {
      label: 'Delete machine transition', source: 'script',
    }));
  },
  updateMachineState: (machineId, stateId, changes) => {
    return Boolean(dispatchCompatibilityCommand('updateMachineState', { machineId, stateId, changes }, {
      label: `Update machine state ${stateId}`, source: 'script',
    }));
  },
  updateMachineInput: (machineId, inputId, changes) => {
    return Boolean(dispatchCompatibilityCommand('updateMachineInput', { machineId, inputId, changes }, {
      label: `Update machine input ${inputId}`, source: 'script',
    }));
  },
  removeMachineInput: (machineId, inputId) => {
    return Boolean(dispatchCompatibilityCommand('removeMachineInput', { machineId, inputId }, {
      label: `Delete machine input ${inputId}`, source: 'script',
    }));
  },
  updateMachineTransition: (machineId, transitionId, changes) => {
    return Boolean(dispatchCompatibilityCommand('updateMachineTransition', { machineId, transitionId, changes }, {
      label: `Update machine transition ${transitionId}`, source: 'script',
    }));
  },
  setMachineInput: (machineId, nameOrId, value) => machineRuntime(machineId).setInput(nameOrId, value),
  fireMachineInput: (machineId, nameOrId) => machineRuntime(machineId).fire(nameOrId),
  stepMachine: (machineId, deltaSeconds = 1 / 30) => machineRuntime(machineId).step(deltaSeconds),
  getMachineState: (machineId) => cloneValue(machineRuntime(machineId).evaluate()),
  resetMachine: (machineId) => machineRuntime(machineId).reset(),
  scrubMachine: (machineId, seconds) => machineRuntime(machineId).scrub(seconds),
});

setTool('select', false);
setZoom(1);
initializeTimeline();
renderAll(restored ? 'autosave restored' : 'Veyra document ready');
if (restored) showToast('Autosaved Veyra document restored');
