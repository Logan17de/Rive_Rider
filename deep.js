const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const canvasWrap = $('canvasWrap');
const statusEl = $('status');
const fileInput = $('fileInput');
const artboardSelect = $('artboard');
const pauseBtn = $('pause');
const capability = $('capability');
const pathsEl = $('paths');
const verticesEl = $('vertices');
const vertexTitle = $('vertexTitle');
const jsonEl = $('json');

let R = null;
let renderer = null;
let file = null;
let artboard = null;
let raf = null;
let paused = false;
let last = 0;
let selectedPath = null;
let runtimeKind = 'unknown';

const status = (s) => { statusEl.textContent = s; };
const del = (o) => { try { o?.delete?.(); } catch {} };
const fmt = (n) => typeof n === 'number' ? Number(n).toFixed(2) : '—';

async function loadRuntime() {
  let factory;
  try {
    const mod = await import('./vendor/rive-tools/canvas_advanced.mjs');
    factory = mod.default || mod.Rive || mod;
    runtimeKind = 'CUSTOM geometry tools';
    R = await factory({ locateFile: () => './vendor/rive-tools/rive.wasm' });
  } catch (customError) {
    console.warn('Custom runtime unavailable, falling back to public runtime:', customError);
    const mod = await import('https://unpkg.com/@rive-app/canvas-advanced@2.39.1');
    factory = mod.default || mod.Rive || mod;
    runtimeKind = 'PUBLIC fallback (read-only/high-level)';
    R = await factory({
      locateFile: () => 'https://unpkg.com/@rive-app/canvas-advanced@2.39.1/rive.wasm',
    });
  }

  renderer = R.makeRenderer(canvas);
  capability.textContent = `${runtimeKind}\nOpen a .riv file to test geometry access.`;
  status(`${runtimeKind} ready · open a .riv file`);
}

function cleanupArtboard() {
  if (raf != null && R) {
    try { R.cancelAnimationFrame(raf); } catch {}
    raf = null;
  }
  del(artboard);
  artboard = null;
  selectedPath = null;
  last = 0;
}

function cleanupFile() {
  cleanupArtboard();
  try { file?.unref?.(); } catch {}
  del(file);
  file = null;
}

function resize() {
  const rect = canvasWrap.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function frame(time) {
  raf = null;
  if (!R || !renderer || !artboard) return;
  if (!last) last = time;
  const dt = Math.min((time - last) / 1000, 0.1);
  last = time;
  resize();

  try {
    renderer.clear();
    artboard.advance(paused ? 0 : dt);
    renderer.save();
    renderer.align(
      R.Fit.contain,
      R.Alignment.center,
      { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height },
      artboard.bounds,
    );
    artboard.draw(renderer);
    renderer.restore();
  } catch (error) {
    console.error(error);
    status(`Render error: ${error?.message || error}`);
  }

  raf = R.requestAnimationFrame(frame);
}

function startLoop() {
  if (raf == null && artboard) raf = R.requestAnimationFrame(frame);
}

function artboardName(index) {
  let candidate = null;
  try {
    candidate = file.artboardByIndex(index);
    return candidate?.name || `Artboard ${index}`;
  } catch {
    return `Artboard ${index}`;
  } finally {
    del(candidate);
  }
}

function populateArtboards() {
  artboardSelect.innerHTML = '';
  const count = file.artboardCount();
  for (let i = 0; i < count; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `${i}: ${artboardName(i)}`;
    artboardSelect.appendChild(option);
  }
  artboardSelect.disabled = count === 0;
  pauseBtn.disabled = count === 0;
}

function capabilities() {
  const names = [
    'debugObjectCount',
    'debugObjectInfo',
    'debugPathVertexCount',
    'debugPathVertexInfo',
    'debugSetPathVertexXY',
    'flattenPath',
  ];
  return Object.fromEntries(names.map((name) => [name, typeof artboard?.[name] === 'function']));
}

function renderCapabilities() {
  const caps = capabilities();
  capability.textContent = [
    `Runtime: ${runtimeKind}`,
    `Artboard: ${artboard?.name ?? '—'}`,
    '',
    ...Object.entries(caps).map(([name, ok]) => `${ok ? '✓' : '✗'} ${name}`),
    '',
    caps.debugObjectCount && caps.debugSetPathVertexXY
      ? 'READY: this build can enumerate internal objects and mutate original path vertices.'
      : 'NOT READY: custom geometry WASM has not been built/loaded yet.',
  ].join('\n');
  return caps;
}

function listPathObjects() {
  if (!artboard || typeof artboard.debugObjectCount !== 'function' || typeof artboard.debugObjectInfo !== 'function') return [];
  const result = [];
  const count = artboard.debugObjectCount();
  for (let index = 0; index < count; index += 1) {
    const info = artboard.debugObjectInfo(index);
    if (info?.isPath) result.push(info);
  }
  return result;
}

function readPath(objectIndex) {
  const count = artboard.debugPathVertexCount(objectIndex);
  const vertices = [];
  for (let i = 0; i < count; i += 1) {
    const vertex = artboard.debugPathVertexInfo(objectIndex, i);
    if (vertex) vertices.push(vertex);
  }
  const info = artboard.debugObjectInfo(objectIndex);
  return {
    objectIndex,
    name: info?.name || '',
    typeKey: info?.typeKey,
    vertexCount: count,
    vertices,
  };
}

function renderPathList() {
  const caps = renderCapabilities();
  pathsEl.innerHTML = '';
  verticesEl.textContent = 'Select a path.';
  jsonEl.textContent = '—';

  if (!caps.debugObjectCount || !caps.debugObjectInfo) {
    pathsEl.textContent = 'The custom geometry bridge is not loaded. Wait for the GitHub Actions build, pull again, then refresh.';
    return;
  }

  let paths;
  try {
    paths = listPathObjects();
  } catch (error) {
    console.error(error);
    pathsEl.textContent = `Object enumeration failed: ${error?.message || error}`;
    return;
  }

  if (!paths.length) {
    pathsEl.textContent = 'No Path objects were found in this artboard.';
    return;
  }

  for (const info of paths) {
    const button = document.createElement('button');
    button.className = 'pathBtn';
    let vertexCount = '?';
    try { vertexCount = artboard.debugPathVertexCount(info.index); } catch {}
    const displayName = info.name ? ` · ${info.name}` : '';
    button.textContent = `#${info.index}${displayName} · ${vertexCount} vertices`;
    button.onclick = () => selectPath(info.index, button);
    pathsEl.appendChild(button);
  }
}

function selectPath(objectIndex, button) {
  selectedPath = objectIndex;
  document.querySelectorAll('.pathBtn').forEach((item) => item.classList.toggle('active', item === button));

  let data;
  try {
    data = readPath(objectIndex);
  } catch (error) {
    status(`Could not read path: ${error?.message || error}`);
    return;
  }

  jsonEl.textContent = JSON.stringify(data, null, 2);
  vertexTitle.textContent = `Vertices · #${objectIndex}${data.name ? ` · ${data.name}` : ''}`;
  verticesEl.innerHTML = '';

  for (const vertex of data.vertices) {
    const row = document.createElement('div');
    row.className = 'vertex';

    const label = document.createElement('span');
    label.textContent = `#${vertex.index}`;

    const x = document.createElement('input');
    x.type = 'number';
    x.step = 'any';
    x.value = String(vertex.x);

    const y = document.createElement('input');
    y.type = 'number';
    y.step = 'any';
    y.value = String(vertex.y);

    const apply = document.createElement('button');
    apply.textContent = 'Apply & verify';
    apply.className = 'primary';

    const result = document.createElement('div');
    result.style.margin = '-2px 0 10px 65px';
    result.style.font = '12px ui-monospace, monospace';
    result.style.color = '#b9c5d3';
    result.textContent = 'Not tested yet';

    apply.onclick = () => {
      try {
        const before = artboard.debugPathVertexInfo(objectIndex, vertex.index);
        const requestedX = Number(x.value);
        const requestedY = Number(y.value);

        if (!Number.isFinite(requestedX) || !Number.isFinite(requestedY)) {
          result.textContent = '✗ Invalid X/Y';
          status('Invalid vertex coordinates');
          return;
        }

        const ok = artboard.debugSetPathVertexXY(
          objectIndex,
          vertex.index,
          requestedX,
          requestedY,
        );

        artboard.advance(0);
        const after = artboard.debugPathVertexInfo(objectIndex, vertex.index);
        const stored = Boolean(after)
          && Math.abs(Number(after.x) - requestedX) < 0.001
          && Math.abs(Number(after.y) - requestedY) < 0.001;

        if (!ok) {
          result.textContent = '✗ Rive rejected edit';
          status(`Rive rejected path #${objectIndex}, vertex #${vertex.index}`);
        } else if (!stored) {
          result.textContent = `✗ setter returned true; read-back (${fmt(after?.x)}, ${fmt(after?.y)})`;
          status(`Setter did not stick for path #${objectIndex}, vertex #${vertex.index}`);
        } else {
          result.textContent = `✓ stored ${fmt(before?.x)},${fmt(before?.y)} → ${fmt(after.x)},${fmt(after.y)}`;
          status(`Verified path #${objectIndex}, vertex #${vertex.index}: (${fmt(before?.x)}, ${fmt(before?.y)}) → (${fmt(after.x)}, ${fmt(after.y)})`);
          x.value = String(after.x);
          y.value = String(after.y);
        }

        jsonEl.textContent = JSON.stringify(readPath(objectIndex), null, 2);
      } catch (error) {
        console.error(error);
        result.textContent = `✗ ${error?.message || error}`;
        status(`Edit failed: ${error?.message || error}`);
      }
    };

    row.append(label, x, y, apply);
    verticesEl.appendChild(row);
    verticesEl.appendChild(result);

    if (vertex.isCubic) {
      const meta = document.createElement('div');
      meta.className = 'muted';
      meta.style.margin = '-4px 0 8px 65px';
      meta.textContent = `Bezier handles: in(${fmt(vertex.inX)}, ${fmt(vertex.inY)}) · out(${fmt(vertex.outX)}, ${fmt(vertex.outY)})`;
      verticesEl.appendChild(meta);
    }
  }
}

function selectArtboard(index) {
  cleanupArtboard();
  try {
    artboard = file.artboardByIndex(index);
    selectedPath = null;
    renderPathList();
    status(`Loaded ${artboard.name} · ${runtimeKind}`);
    startLoop();
  } catch (error) {
    console.error(error);
    status(`Could not load artboard ${index}: ${error?.message || error}`);
  }
}

async function loadFile(bytes, name) {
  if (!R) {
    status('Runtime is not ready yet');
    return;
  }
  cleanupFile();
  status(`Parsing ${name}…`);

  try {
    file = await R.load(new Uint8Array(bytes));
    populateArtboards();
    if (!file.artboardCount()) throw new Error('No artboards found');
    artboardSelect.value = '0';
    selectArtboard(0);
  } catch (error) {
    console.error(error);
    status(`Load failed: ${error?.message || error}`);
  }
}

fileInput.onchange = async () => {
  const picked = fileInput.files?.[0];
  if (picked) await loadFile(await picked.arrayBuffer(), picked.name);
};
artboardSelect.onchange = () => selectArtboard(Number(artboardSelect.value));
pauseBtn.onclick = () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
};
new ResizeObserver(resize).observe(canvasWrap);
window.addEventListener('beforeunload', () => {
  cleanupFile();
  del(renderer);
  try { R?.cleanup?.(); } catch {}
});

await loadRuntime();
