import RiveCanvas from 'https://unpkg.com/@rive-app/canvas-advanced@2.39.1';

const RIVE_VERSION = '2.39.1';
const INTERESTING = /path|shape|vertex|vertices|bezier|control|fill|stroke|paint|mesh|bone|transform|component|node|color|width|height|radius|opacity|point|gradient|weight|scale|rotation|world/i;
const MAX_PROTOTYPE_DEPTH = 8;
const MAX_COLLECTION_ITEMS = 80;

const $ = (id) => document.getElementById(id);
const canvas = $('riveCanvas');
const canvasWrap = $('canvasWrap');
const statusEl = $('status');
const fileInput = $('fileInput');
const artboardSelect = $('artboardSelect');
const pauseButton = $('pauseButton');
const summaryOut = $('summaryOut');
const collectionsOut = $('collectionsOut');
const interestingOut = $('interestingOut');
const apiOut = $('apiOut');
const nodeName = $('nodeName');
const probeNodeButton = $('probeNode');
const nodeOut = $('nodeOut');
const nodeEditors = $('nodeEditors');

let rive = null;
let renderer = null;
let file = null;
let artboard = null;
let stateMachine = null;
let sourceName = null;
let rafId = null;
let lastTime = 0;
let paused = false;
let selectedHandles = [];

function setStatus(message) { statusEl.textContent = message; }

function safeDelete(value) {
  if (!value || typeof value.delete !== 'function') return;
  try { value.delete(); } catch (_) {}
}

function clearSelectedHandles() {
  for (const handle of selectedHandles) safeDelete(handle);
  selectedHandles = [];
}

function cleanupScene({ keepRenderer = true } = {}) {
  if (rafId != null && rive) {
    try { rive.cancelAnimationFrame?.(rafId); } catch (_) {}
    rafId = null;
  }
  clearSelectedHandles();
  safeDelete(stateMachine); stateMachine = null;
  safeDelete(artboard); artboard = null;
  safeDelete(file); file = null;
  lastTime = 0;
  if (!keepRenderer) { safeDelete(renderer); renderer = null; }
}

function allPrototypeEntries(obj) {
  const entries = new Map();
  let current = obj;
  let depth = 0;
  while (current && current !== Object.prototype && depth < MAX_PROTOTYPE_DEPTH) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor' || entries.has(name)) continue;
      entries.set(name, {
        descriptor: Object.getOwnPropertyDescriptor(current, name),
        depth,
      });
    }
    current = Object.getPrototypeOf(current);
    depth += 1;
  }
  return entries;
}

function primitiveValue(value) {
  if (value == null) return value;
  if (['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return value;
  if (Array.isArray(value) && value.length <= 12 && value.every((v) => ['string', 'number', 'boolean'].includes(typeof v))) return value;
  return undefined;
}

function readSafePrimitive(obj, name) {
  try { return primitiveValue(obj[name]); } catch (_) { return undefined; }
}

function formatValue(value) {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'string') return JSON.stringify(value);
  try { return JSON.stringify(value); } catch (_) { return String(value); }
}

function describeObject(obj, label = 'Object') {
  if (!obj) return `${label}: <null>`;
  const entries = allPrototypeEntries(obj);
  const lines = [`${label}: ${obj?.constructor?.name || typeof obj}`];
  const props = [];
  const methods = [];

  for (const [name, meta] of entries) {
    const descriptor = meta.descriptor;
    if (typeof descriptor?.value === 'function') {
      methods.push(name);
      continue;
    }
    const access = [descriptor?.get ? 'get' : '', descriptor?.set ? 'set' : ''].filter(Boolean).join('/');
    const value = readSafePrimitive(obj, name);
    props.push(`${name}${access ? ` [${access}]` : ''}${value !== undefined ? ` = ${formatValue(value)}` : ''}`);
  }

  if (props.length) {
    lines.push('  properties:');
    props.sort().forEach((value) => lines.push(`    ${value}`));
  }
  if (methods.length) {
    lines.push('  methods:');
    methods.sort().forEach((value) => lines.push(`    ${value}()`));
  }
  return lines.join('\n');
}

function methodNames(obj) {
  if (!obj) return [];
  return [...allPrototypeEntries(obj)]
    .filter(([, meta]) => typeof meta.descriptor?.value === 'function')
    .map(([name]) => name)
    .sort();
}

function interestingNames(obj) {
  if (!obj) return [];
  return [...allPrototypeEntries(obj).keys()].filter((name) => INTERESTING.test(name)).sort();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderInteresting(objects) {
  const groups = [];
  for (const [label, object] of objects) {
    if (!object) continue;
    const names = interestingNames(object);
    if (names.length) groups.push({ label, type: object?.constructor?.name || typeof object, names });
  }

  if (!groups.length) {
    interestingOut.textContent = 'No interesting geometry/transform names were reflected on the currently reachable objects.';
    return;
  }

  interestingOut.innerHTML = groups.map((group) => `
    <div style="margin-bottom:10px">
      <div class="muted"><strong>${escapeHtml(group.label)}</strong> · ${escapeHtml(group.type)}</div>
      <div>${group.names.map((name) => `<span class="tag">${escapeHtml(name)}</span>`).join('')}</div>
    </div>
  `).join('');
}

function discoverCollections(obj, label) {
  if (!obj) return [];
  const methods = methodNames(obj);
  const methodSet = new Set(methods);
  const output = [];

  for (const countMethod of methods.filter((name) => name.endsWith('Count'))) {
    const prefix = countMethod.slice(0, -5);
    const indexMethod = `${prefix}ByIndex`;
    if (!methodSet.has(indexMethod)) continue;

    let count;
    try { count = obj[countMethod](); } catch (_) { continue; }
    if (!Number.isInteger(count) || count < 0 || count > 10000) continue;

    const entry = { owner: label, countMethod, indexMethod, count, items: [] };
    for (let i = 0; i < Math.min(count, MAX_COLLECTION_ITEMS); i += 1) {
      let child = null;
      try { child = obj[indexMethod](i); } catch (error) {
        entry.items.push({ index: i, error: String(error) });
        continue;
      }
      if (!child) {
        entry.items.push({ index: i, value: null });
        continue;
      }
      entry.items.push({
        index: i,
        type: child?.constructor?.name || typeof child,
        name: readSafePrimitive(child, 'name'),
        interestingAPI: interestingNames(child),
      });
      safeDelete(child);
    }
    if (count > MAX_COLLECTION_ITEMS) entry.truncated = count - MAX_COLLECTION_ITEMS;
    output.push(entry);
  }
  return output;
}

function getArtboardCount() {
  try { return file?.artboardCount?.() ?? 0; } catch (_) { return 0; }
}

function getArtboardName(index) {
  let candidate = null;
  try {
    candidate = file.artboardByIndex(index);
    return readSafePrimitive(candidate, 'name') ?? `Artboard ${index}`;
  } catch (_) {
    return `Artboard ${index}`;
  } finally {
    safeDelete(candidate);
  }
}

function populateArtboards() {
  artboardSelect.innerHTML = '';
  const count = getArtboardCount();
  for (let i = 0; i < count; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `${i}: ${getArtboardName(i)}`;
    artboardSelect.appendChild(option);
  }
  artboardSelect.disabled = count === 0;
  pauseButton.disabled = count === 0;
  probeNodeButton.disabled = count === 0;
}

function buildSummary() {
  const lines = [
    `Source: ${sourceName}`,
    `Rive canvas-advanced: ${RIVE_VERSION}`,
    `Artboards: ${getArtboardCount()}`,
  ];
  if (artboard) {
    lines.push(`Selected artboard: ${readSafePrimitive(artboard, 'name') ?? artboardSelect.value}`);
    try { lines.push(`Bounds: ${formatValue(artboard.bounds)}`); } catch (_) {}
    try { lines.push(`Animations: ${artboard.animationCount()}`); } catch (_) {}
    try { lines.push(`State machines: ${artboard.stateMachineCount()}`); } catch (_) {}
    lines.push('', 'Named accessors available on this artboard:');
    for (const method of ['node', 'transformComponent', 'bone', 'rootBone', 'inputByPath', 'textByPath']) {
      if (typeof artboard[method] === 'function') lines.push(`  ✓ ${method}()`);
    }
  }
  summaryOut.textContent = lines.join('\n');
}

function refreshInspector() {
  if (!file || !artboard) return;
  collectionsOut.textContent = JSON.stringify([
    ...discoverCollections(file, 'File'),
    ...discoverCollections(artboard, 'Artboard'),
  ], null, 2);

  const objects = [['Rive runtime module', rive], ['File', file], ['Artboard', artboard]];
  renderInteresting(objects);
  apiOut.textContent = objects.map(([label, object]) => describeObject(object, label)).join(`\n\n${'-'.repeat(72)}\n\n`);
}

function configureFirstStateMachine() {
  safeDelete(stateMachine);
  stateMachine = null;
  if (!artboard || typeof artboard.stateMachineCount !== 'function' || typeof artboard.stateMachineByIndex !== 'function') return;
  try {
    if (!artboard.stateMachineCount()) return;
    const definition = artboard.stateMachineByIndex(0);
    stateMachine = new rive.StateMachineInstance(definition, artboard);
    safeDelete(definition);
  } catch (error) {
    console.warn('Could not construct state machine instance:', error);
  }
}

function selectArtboard(index) {
  clearSelectedHandles();
  safeDelete(stateMachine); stateMachine = null;
  safeDelete(artboard); artboard = null;
  nodeOut.textContent = 'Type a hierarchy name above and click “Find node”.';
  nodeEditors.textContent = 'No object selected.';

  try {
    artboard = file.artboardByIndex(index);
  } catch (error) {
    setStatus(`Failed to load artboard ${index}: ${error?.message || error}`);
    return;
  }

  configureFirstStateMachine();
  buildSummary();
  refreshInspector();
  setStatus(`Loaded ${sourceName} · ${readSafePrimitive(artboard, 'name') ?? `artboard ${index}`}`);
}

function resizeCanvas() {
  const rect = canvasWrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawFrame(time) {
  rafId = null;
  if (!rive || !renderer || !artboard) return;
  if (!lastTime) lastTime = time;
  const elapsedSec = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  resizeCanvas();
  try {
    renderer.clear();
    if (!paused) {
      stateMachine?.advance?.(elapsedSec);
      artboard.advance?.(elapsedSec);
    } else {
      artboard.advance?.(0);
    }
    renderer.save();
    renderer.align(
      rive.Fit.contain,
      rive.Alignment.center,
      { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height },
      artboard.bounds,
    );
    artboard.draw(renderer);
    renderer.restore();
  } catch (error) {
    console.error(error);
    setStatus(`Render error: ${error?.message || error}`);
  }

  rafId = rive.requestAnimationFrame(drawFrame);
}

function startRenderLoop() {
  if (rafId != null || !rive || !artboard) return;
  lastTime = 0;
  rafId = rive.requestAnimationFrame(drawFrame);
}

async function loadBytes(bytes, name) {
  cleanupScene({ keepRenderer: true });
  sourceName = name;
  setStatus(`Parsing ${name}…`);

  try {
    file = await rive.load(new Uint8Array(bytes));
    populateArtboards();
    if (!getArtboardCount()) throw new Error('The runtime reported zero artboards.');
    artboardSelect.value = '0';
    selectArtboard(0);
    startRenderLoop();
  } catch (error) {
    console.error(error);
    setStatus(`Load failed: ${error?.message || error}`);
    summaryOut.textContent = String(error?.stack || error);
  }
}

function editablePrimitiveProperties(obj) {
  const properties = new Map();
  const entries = allPrototypeEntries(obj);

  for (const [name, meta] of entries) {
    const descriptor = meta.descriptor;
    if (!descriptor?.get || !descriptor?.set) continue;
    let value;
    try { value = obj[name]; } catch (_) { continue; }
    if (!['number', 'string', 'boolean'].includes(typeof value)) continue;
    properties.set(name, { name, value, type: typeof value });
  }

  // Emscripten bindings sometimes expose useful properties in ways that are
  // awkward to discover from descriptors, so explicitly probe common transform fields.
  for (const name of ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'width', 'height', 'length']) {
    if (properties.has(name) || !(name in obj)) continue;
    let value;
    try { value = obj[name]; } catch (_) { continue; }
    if (!['number', 'string', 'boolean'].includes(typeof value)) continue;
    properties.set(name, { name, value, type: typeof value });
  }

  return [...properties.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function renderNodeEditors(target, targetLabel) {
  const props = editablePrimitiveProperties(target);
  if (!props.length) {
    nodeEditors.textContent = `${targetLabel} exposes no primitive writable-looking properties through the reflected JS binding.`;
    return;
  }

  const wrapper = document.createElement('div');
  const note = document.createElement('div');
  note.className = 'hint';
  note.style.marginBottom = '10px';
  note.textContent = `Editing ${targetLabel}. Pause the animation first if an animation/state machine keeps overwriting a transform.`;
  wrapper.appendChild(note);

  const grid = document.createElement('div');
  grid.className = 'editable-grid';

  for (const prop of props) {
    const label = document.createElement('label');
    label.textContent = prop.name;

    const input = document.createElement('input');
    input.type = prop.type === 'number' ? 'number' : prop.type === 'boolean' ? 'checkbox' : 'text';
    if (prop.type === 'number') {
      input.step = 'any';
      input.value = String(prop.value);
    } else if (prop.type === 'boolean') {
      input.checked = prop.value;
    } else {
      input.value = String(prop.value);
    }

    const apply = () => {
      try {
        const value = prop.type === 'number'
          ? Number(input.value)
          : prop.type === 'boolean'
            ? input.checked
            : input.value;
        target[prop.name] = value;
        artboard?.advance?.(0);
        setStatus(`Set ${targetLabel}.${prop.name} = ${String(value)}`);
      } catch (error) {
        setStatus(`Could not set ${targetLabel}.${prop.name}: ${error?.message || error}`);
      }
    };

    input.addEventListener('change', apply);
    if (prop.type === 'number') input.addEventListener('input', apply);
    grid.append(label, input);
  }

  wrapper.appendChild(grid);
  nodeEditors.innerHTML = '';
  nodeEditors.appendChild(wrapper);
}

function probeNode() {
  if (!artboard) return;
  const name = nodeName.value.trim();
  if (!name) {
    nodeOut.textContent = 'Enter a hierarchy name first.';
    return;
  }

  clearSelectedHandles();
  nodeEditors.textContent = 'No writable object selected.';

  // These are the exact lookup methods reflected by canvas-advanced 2.39.1.
  const finders = ['node', 'transformComponent', 'bone'];
  const results = [];
  const errors = [];

  for (const finder of finders) {
    if (typeof artboard[finder] !== 'function') continue;
    try {
      const result = artboard[finder](name);
      if (result) {
        results.push({ finder, result });
        selectedHandles.push(result);
      }
    } catch (error) {
      errors.push(`${finder}(${JSON.stringify(name)}): ${error?.message || error}`);
    }
  }

  if (!results.length) {
    nodeOut.textContent = [
      `Nothing named ${JSON.stringify(name)} was returned from the selected artboard.`,
      '',
      `Selected artboard: ${readSafePrimitive(artboard, 'name') ?? artboardSelect.value}`,
      `Tried: ${finders.filter((finder) => typeof artboard[finder] === 'function').join(', ') || '<none>'}`,
      errors.length ? `Errors:\n${errors.map((value) => `  ${value}`).join('\n')}` : '',
      '',
      'If the object is visible in a different Rive artboard, select that artboard on the left and try again.',
    ].filter(Boolean).join('\n');
    return;
  }

  nodeOut.textContent = results.map(({ finder, result }) => [
    `FOUND: artboard.${finder}(${JSON.stringify(name)})`,
    describeObject(result, `${name} via ${finder}`),
  ].join('\n\n')).join(`\n\n${'='.repeat(72)}\n\n`);

  // A TransformComponent is the most useful target for live transform editing.
  const editorTarget = results.find(({ finder }) => finder === 'transformComponent')
    ?? results.find(({ finder }) => finder === 'node')
    ?? results[0];
  renderNodeEditors(editorTarget.result, `${name} via ${editorTarget.finder}`);

  const objects = [
    ['Rive runtime module', rive],
    ['File', file],
    ['Artboard', artboard],
    ...results.map(({ finder, result }) => [`${name} via ${finder}`, result]),
  ];
  renderInteresting(objects);
  apiOut.textContent = objects.map(([label, object]) => describeObject(object, label)).join(`\n\n${'-'.repeat(72)}\n\n`);

  setStatus(`Found ${name} using ${results.map(({ finder }) => finder).join(', ')}`);
}

async function boot() {
  try {
    setStatus('Loading Rive WASM…');
    rive = await RiveCanvas({
      locateFile: () => `https://unpkg.com/@rive-app/canvas-advanced@${RIVE_VERSION}/rive.wasm`,
    });
    renderer = rive.makeRenderer(canvas);
    setStatus('Rive WASM ready · click “Open .riv”');
  } catch (error) {
    console.error(error);
    setStatus(`Startup failed: ${error?.message || error}`);
    summaryOut.textContent = String(error?.stack || error);
  }
}

fileInput.addEventListener('change', async () => {
  const picked = fileInput.files?.[0];
  if (picked) await loadBytes(await picked.arrayBuffer(), picked.name);
});

artboardSelect.addEventListener('change', () => {
  selectArtboard(Number(artboardSelect.value));
  startRenderLoop();
});

pauseButton.addEventListener('click', () => {
  paused = !paused;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  setStatus(paused ? 'Animation paused — edits will be easier to observe' : 'Animation resumed');
});

probeNodeButton.addEventListener('click', probeNode);
nodeName.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') probeNode();
});

document.querySelectorAll('.tabs button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === button.dataset.tab));
    if (button.dataset.tab === 'node') setTimeout(() => nodeName.focus(), 0);
  });
});

new ResizeObserver(resizeCanvas).observe(canvasWrap);
window.addEventListener('beforeunload', () => cleanupScene({ keepRenderer: false }));
boot();
