import RiveCanvas from 'https://unpkg.com/@rive-app/canvas-advanced@2.39.1';

const RIVE_VERSION = '2.39.1';
const INTERESTING = /path|shape|vertex|vertices|bezier|control|fill|stroke|paint|mesh|bone|transform|component|node|color|width|height|radius|opacity|point|gradient|weight/i;
const MAX_COLLECTION_ITEMS = 80;
const MAX_PROTOTYPE_DEPTH = 8;

const $ = (id) => document.getElementById(id);
const canvas = $('riveCanvas');
const canvasWrap = $('canvasWrap');
const statusEl = $('status');
const summaryOut = $('summaryOut');
const collectionsOut = $('collectionsOut');
const apiOut = $('apiOut');
const interestingOut = $('interestingOut');
const artboardSelect = $('artboardSelect');
const pauseButton = $('pauseButton');
const fileInput = $('fileInput');
const loadBundled = $('loadBundled');
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
let selectedNode = null;

function setStatus(message) { statusEl.textContent = message; }
function safeDelete(value) {
  if (!value || typeof value.delete !== 'function') return;
  try { value.delete(); } catch (_) {}
}

function cleanupScene({ keepRenderer = true } = {}) {
  if (rafId != null && rive) {
    try { rive.cancelAnimationFrame?.(rafId); } catch (_) {}
    rafId = null;
  }
  safeDelete(selectedNode); selectedNode = null;
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
      entries.set(name, { descriptor: Object.getOwnPropertyDescriptor(current, name), depth });
    }
    current = Object.getPrototypeOf(current);
    depth += 1;
  }
  return entries;
}

function primitiveValue(value) {
  if (value == null) return value;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') return value;
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
  const ownKeys = (() => { try { return Object.keys(obj); } catch (_) { return []; } })();
  if (ownKeys.length) lines.push(`  own enumerable keys: ${ownKeys.join(', ')}`);
  const methods = [];
  const props = [];
  for (const [name, meta] of entries) {
    const descriptor = meta.descriptor;
    if (typeof descriptor?.value === 'function') { methods.push(name); continue; }
    const access = [descriptor?.get ? 'get' : '', descriptor?.set ? 'set' : ''].filter(Boolean).join('/');
    const value = readSafePrimitive(obj, name);
    props.push(`${name}${access ? ` [${access}]` : ''}${value !== undefined ? ` = ${formatValue(value)}` : ''}`);
  }
  if (props.length) {
    lines.push('  properties:');
    props.sort().forEach((p) => lines.push(`    ${p}`));
  }
  if (methods.length) {
    lines.push('  methods:');
    methods.sort().forEach((m) => lines.push(`    ${m}()`));
  }
  return lines.join('\n');
}

function findMethodNames(obj) {
  if (!obj) return [];
  return [...allPrototypeEntries(obj).entries()]
    .filter(([, meta]) => typeof meta.descriptor?.value === 'function')
    .map(([name]) => name)
    .sort();
}

function getInterestingNames(obj) {
  if (!obj) return [];
  return [...allPrototypeEntries(obj).keys()].filter((name) => INTERESTING.test(name)).sort();
}

function discoverCollections(obj, label, depth = 0, seen = new Set()) {
  if (!obj || depth > 2) return [];
  const key = `${label}:${obj?.constructor?.name || typeof obj}`;
  if (seen.has(key)) return [];
  seen.add(key);
  const methodNames = findMethodNames(obj);
  const methodSet = new Set(methodNames);
  const results = [];

  for (const countName of methodNames.filter((name) => name.endsWith('Count'))) {
    const prefix = countName.slice(0, -'Count'.length);
    const indexName = `${prefix}ByIndex`;
    if (!methodSet.has(indexName)) continue;
    let count;
    try { count = obj[countName](); } catch (_) { continue; }
    if (!Number.isInteger(count) || count < 0 || count > 10000) continue;
    const collection = { owner: label, ownerType: obj?.constructor?.name || typeof obj, countMethod: countName, indexMethod: indexName, count, items: [] };
    const limit = Math.min(count, MAX_COLLECTION_ITEMS);
    for (let i = 0; i < limit; i += 1) {
      let child = null;
      try { child = obj[indexName](i); }
      catch (error) { collection.items.push({ index: i, error: String(error) }); continue; }
      if (!child) { collection.items.push({ index: i, value: null }); continue; }
      const item = { index: i, type: child?.constructor?.name || typeof child, name: readSafePrimitive(child, 'name'), interestingAPI: getInterestingNames(child) };
      collection.items.push(item);
      if (depth < 2) item.collections = discoverCollections(child, `${label}.${prefix}[${i}]`, depth + 1, seen);
    }
    if (count > limit) collection.truncated = count - limit;
    results.push(collection);
  }
  return results;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function renderInteresting(objects) {
  const groups = [];
  for (const [label, object] of objects) {
    if (!object) continue;
    const names = getInterestingNames(object);
    if (names.length) groups.push({ label, type: object?.constructor?.name || typeof object, names });
  }
  if (!groups.length) {
    interestingOut.textContent = 'No path/shape/vertex/fill/stroke/etc. API names were reflected on the objects currently reachable.';
    return;
  }
  interestingOut.innerHTML = groups.map((group) => `
    <div style="margin-bottom:10px">
      <div class="muted"><strong>${escapeHtml(group.label)}</strong> · ${escapeHtml(group.type)}</div>
      <div>${group.names.map((name) => `<span class="tag interesting">${escapeHtml(name)}</span>`).join('')}</div>
    </div>`).join('');
}

function getArtboardCount() {
  try { return file?.artboardCount?.() ?? 0; } catch (_) { return 0; }
}

function getArtboardName(index) {
  let candidate = null;
  try {
    candidate = file.artboardByIndex(index);
    return readSafePrimitive(candidate, 'name') ?? `Artboard ${index}`;
  } catch (_) { return `Artboard ${index}`; }
  finally { safeDelete(candidate); }
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
  probeNodeButton.disabled = count === 0;
  pauseButton.disabled = count === 0;
}

function buildSummary() {
  const lines = [`Source: ${sourceName}`, `Rive canvas-advanced: ${RIVE_VERSION}`, `Artboards: ${getArtboardCount()}`];
  if (artboard) {
    lines.push(`Selected artboard: ${readSafePrimitive(artboard, 'name') ?? artboardSelect.value}`);
    const bounds = (() => { try { return artboard.bounds; } catch (_) { return null; } })();
    if (bounds) lines.push(`Bounds: ${formatValue(bounds)}`);
    for (const [label, method] of [['Animations', 'animationCount'], ['State machines', 'stateMachineCount']]) {
      try { if (typeof artboard[method] === 'function') lines.push(`${label}: ${artboard[method]()}`); } catch (_) {}
    }
  }
  summaryOut.textContent = lines.join('\n');
}

function inspectCurrentObjects() {
  if (!file || !artboard) return;
  collectionsOut.textContent = JSON.stringify([...discoverCollections(file, 'File'), ...discoverCollections(artboard, 'Artboard')], null, 2);
  const objects = [['Rive runtime module', rive], ['File', file], ['Artboard', artboard]];
  renderInteresting(objects);
  apiOut.textContent = objects.map(([label, object]) => describeObject(object, label)).join('\n\n' + '-'.repeat(72) + '\n\n');
}

function configureFirstStateMachine() {
  safeDelete(stateMachine); stateMachine = null;
  if (!artboard || typeof artboard.stateMachineCount !== 'function' || typeof artboard.stateMachineByIndex !== 'function') return;
  let count = 0;
  try { count = artboard.stateMachineCount(); } catch (_) { return; }
  if (!count) return;
  try {
    const definition = artboard.stateMachineByIndex(0);
    stateMachine = new rive.StateMachineInstance(definition, artboard);
    safeDelete(definition);
  } catch (error) { console.warn('Could not create state machine instance:', error); }
}

function selectArtboard(index) {
  safeDelete(selectedNode); selectedNode = null;
  safeDelete(stateMachine); stateMachine = null;
  safeDelete(artboard); artboard = null;
  nodeOut.textContent = 'Enter a node name and click “Find node”.';
  nodeEditors.textContent = 'No node selected.';
  try { artboard = file.artboardByIndex(index); }
  catch (error) { setStatus(`Failed to load artboard ${index}`); console.error(error); return; }
  configureFirstStateMachine();
  buildSummary();
  inspectCurrentObjects();
  setStatus(`Loaded ${sourceName} · ${readSafePrimitive(artboard, 'name') ?? `artboard ${index}`}`);
}

function resizeCanvas() {
  const rect = canvasWrap.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
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
    if (!paused) { stateMachine?.advance?.(elapsedSec); artboard.advance?.(elapsedSec); }
    else artboard.advance?.(0);
    renderer.save();
    renderer.align(rive.Fit.contain, rive.Alignment.center, { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height }, artboard.bounds);
    artboard.draw(renderer);
    renderer.restore();
  } catch (error) { console.error('Render error:', error); setStatus(`Render error: ${error?.message || error}`); }
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

async function loadUrl(url, name) {
  setStatus(`Fetching ${name}…`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} while loading ${url}`);
  await loadBytes(await response.arrayBuffer(), name);
}

function editablePrimitiveProperties(obj) {
  const rows = [];
  for (const [name, meta] of allPrototypeEntries(obj)) {
    const descriptor = meta.descriptor;
    if (!descriptor?.set || !descriptor?.get) continue;
    let value;
    try { value = obj[name]; } catch (_) { continue; }
    if (!['number', 'string', 'boolean'].includes(typeof value)) continue;
    rows.push({ name, value, type: typeof value });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function renderNodeEditors(node) {
  const props = editablePrimitiveProperties(node);
  if (!props.length) {
    nodeEditors.textContent = 'The reflected node exposes no primitive getter/setter pairs. Check the API surface for methods or non-primitive accessors.';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'editable-grid';
  for (const prop of props) {
    const label = document.createElement('label'); label.textContent = prop.name;
    const input = document.createElement('input');
    input.type = prop.type === 'number' ? 'number' : 'text'; input.step = 'any'; input.value = String(prop.value);
    if (prop.type === 'boolean') { input.type = 'checkbox'; input.checked = prop.value; }
    const apply = () => {
      try {
        const value = prop.type === 'number' ? Number(input.value) : prop.type === 'boolean' ? input.checked : input.value;
        node[prop.name] = value;
        artboard?.advance?.(0);
        setStatus(`Set ${prop.name} = ${String(value)}`);
      } catch (error) { setStatus(`Could not set ${prop.name}: ${error?.message || error}`); }
    };
    input.addEventListener('change', apply);
    input.addEventListener('input', () => { if (prop.type === 'number') apply(); });
    grid.append(label, input);
  }
  nodeEditors.innerHTML = '';
  nodeEditors.appendChild(grid);
}

function probeNode() {
  if (!artboard) return;
  const name = nodeName.value.trim();
  if (!name) { nodeOut.textContent = 'Enter a node name first.'; return; }
  safeDelete(selectedNode); selectedNode = null;
  const finders = ['nodeByName', 'componentByName', 'boneByName'];
  let usedFinder = null, result = null, lastError = null;
  for (const finder of finders) {
    if (typeof artboard[finder] !== 'function') continue;
    try { result = artboard[finder](name); if (result) { usedFinder = finder; break; } }
    catch (error) { lastError = error; }
  }
  if (!result) {
    nodeOut.textContent = [`No object named ${JSON.stringify(name)} was returned.`, '', `Available finder methods: ${finders.filter((f) => typeof artboard[f] === 'function').join(', ') || '<none>'}`, lastError ? `Last error: ${String(lastError)}` : ''].filter(Boolean).join('\n');
    nodeEditors.textContent = 'No node selected.';
    return;
  }
  selectedNode = result;
  nodeOut.textContent = `Found with artboard.${usedFinder}(${JSON.stringify(name)})\n\n${describeObject(result, name)}`;
  renderNodeEditors(result);
  const objects = [['Rive runtime module', rive], ['File', file], ['Artboard', artboard], [`Node: ${name}`, result]];
  renderInteresting(objects);
  apiOut.textContent = objects.map(([label, object]) => describeObject(object, label)).join('\n\n' + '-'.repeat(72) + '\n\n');
}

async function boot() {
  try {
    setStatus('Loading Rive WASM…');
    rive = await RiveCanvas({ locateFile: () => `https://unpkg.com/@rive-app/canvas-advanced@${RIVE_VERSION}/rive.wasm` });
    renderer = rive.makeRenderer(canvas);
    setStatus('Rive WASM ready · load a .riv file');
    await loadUrl('./test.riv', 'test.riv');
  } catch (error) {
    console.error(error);
    setStatus(`Startup failed: ${error?.message || error}`);
    summaryOut.textContent = String(error?.stack || error);
  }
}

loadBundled.addEventListener('click', async () => {
  try { await loadUrl('./test.riv', 'test.riv'); }
  catch (error) { setStatus(`Load failed: ${error?.message || error}`); }
});
fileInput.addEventListener('change', async () => {
  const picked = fileInput.files?.[0];
  if (picked) await loadBytes(await picked.arrayBuffer(), picked.name);
});
artboardSelect.addEventListener('change', () => { selectArtboard(Number(artboardSelect.value)); startRenderLoop(); });
pauseButton.addEventListener('click', () => { paused = !paused; pauseButton.textContent = paused ? 'Resume' : 'Pause'; });
probeNodeButton.addEventListener('click', probeNode);
nodeName.addEventListener('keydown', (event) => { if (event.key === 'Enter') probeNode(); });
document.querySelectorAll('.tabs button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === button));
    document.querySelectorAll('section.panel').forEach((panel) => panel.classList.toggle('active', panel.id === button.dataset.tab));
  });
});
new ResizeObserver(resizeCanvas).observe(canvasWrap);
window.addEventListener('beforeunload', () => cleanupScene({ keepRenderer: false }));
boot();
