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

let R = null, renderer = null, file = null, artboard = null, raf = null;
let paused = false, last = 0, selectedPath = null;

const status = (s) => statusEl.textContent = s;
const del = (o) => { try { o?.delete?.(); } catch {} };

async function loadRuntime() {
  try {
    const mod = await import('./runtime/canvas_advanced.mjs');
    const factory = mod.default || mod.Rive || mod;
    R = await factory({ locateFile: (name) => `./runtime/${name}` });
    renderer = R.makeRenderer(canvas);
    capability.textContent = [
      'Custom runtime loaded.',
      `queryPathIndices: ${typeof R.Artboard?.prototype?.queryPathIndices === 'function' ? 'prototype-visible' : 'checked after artboard load'}`,
      'Expected custom methods: queryPathIndices, queryPathVertexCount, queryPathVertex, setPathVertexXY.'
    ].join('\n');
    status('Custom Rive runtime ready · open a .riv file');
  } catch (e) {
    console.error(e);
    capability.textContent = `Custom runtime not found or failed to load.\n\n${e?.stack || e}\n\nBuild it first with:\n  bash scripts/build-custom-rive.sh`;
    status('Custom runtime missing — build runtime/ first');
  }
}

function cleanupArtboard() {
  if (raf != null && R) { try { R.cancelAnimationFrame(raf); } catch {} raf = null; }
  del(artboard); artboard = null;
  selectedPath = null;
  last = 0;
}

function cleanupFile() {
  cleanupArtboard();
  try { file?.unref?.(); } catch {}
  del(file); file = null;
}

function resize() {
  const r = canvasWrap.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

function frame(t) {
  raf = null;
  if (!R || !renderer || !artboard) return;
  if (!last) last = t;
  const dt = Math.min((t - last) / 1000, 0.1); last = t;
  resize();
  try {
    renderer.clear();
    artboard.advance(paused ? 0 : dt);
    renderer.save();
    renderer.align(R.Fit.contain, R.Alignment.center, { minX:0, minY:0, maxX:canvas.width, maxY:canvas.height }, artboard.bounds);
    artboard.draw(renderer);
    renderer.restore();
  } catch (e) { console.error(e); status(`Render error: ${e?.message || e}`); }
  raf = R.requestAnimationFrame(frame);
}

function startLoop() { if (raf == null && artboard) raf = R.requestAnimationFrame(frame); }

function artboardName(i) {
  let a = null;
  try { a = file.artboardByIndex(i); return a?.name || `Artboard ${i}`; }
  catch { return `Artboard ${i}`; }
  finally { del(a); }
}

function populateArtboards() {
  artboardSelect.innerHTML = '';
  const n = file.artboardCount();
  for (let i=0;i<n;i++) {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = `${i}: ${artboardName(i)}`; artboardSelect.appendChild(o);
  }
  artboardSelect.disabled = n === 0; pauseBtn.disabled = n === 0;
}

function getPathIndices() {
  if (!artboard || typeof artboard.queryPathIndices !== 'function') return [];
  try { return Array.from(artboard.queryPathIndices()); } catch (e) { console.error(e); return []; }
}

function readPath(index) {
  const count = artboard.queryPathVertexCount(index);
  const vertices = [];
  for (let i=0;i<count;i++) {
    const v = artboard.queryPathVertex(index, i);
    vertices.push({ index:i, ...v });
  }
  return { objectIndex:index, vertexCount:count, vertices };
}

function renderPathList() {
  const methods = ['queryPathIndices','queryPathVertexCount','queryPathVertex','setPathVertexXY'];
  const availability = Object.fromEntries(methods.map(m => [m, typeof artboard?.[m] === 'function']));
  capability.textContent = `Artboard: ${artboard?.name}\n` + methods.map(m => `${m}: ${availability[m] ? 'YES' : 'NO'}`).join('\n');
  if (!availability.queryPathIndices) {
    pathsEl.textContent = 'This runtime is the stock/public build. The deep geometry bridge is not present.';
    return;
  }
  const indices = getPathIndices();
  pathsEl.innerHTML = '';
  if (!indices.length) { pathsEl.textContent = 'No Path objects returned for this artboard.'; return; }
  indices.forEach((idx) => {
    const b = document.createElement('button'); b.className = 'pathBtn';
    let count = '?'; try { count = artboard.queryPathVertexCount(idx); } catch {}
    b.textContent = `Object #${idx} · Path · ${count} vertices`;
    b.onclick = () => selectPath(idx, b);
    pathsEl.appendChild(b);
  });
}

function selectPath(index, button) {
  selectedPath = index;
  document.querySelectorAll('.pathBtn').forEach(b => b.classList.toggle('active', b === button));
  const data = readPath(index);
  jsonEl.textContent = JSON.stringify(data, null, 2);
  vertexTitle.textContent = `Vertices · Path object #${index}`;
  verticesEl.innerHTML = '';
  data.vertices.forEach(v => {
    const row = document.createElement('div'); row.className = 'vertex';
    const label = document.createElement('span'); label.textContent = `#${v.index}`;
    const x = document.createElement('input'); x.type='number'; x.step='any'; x.value=String(v.x);
    const y = document.createElement('input'); y.type='number'; y.step='any'; y.value=String(v.y);
    const apply = document.createElement('button'); apply.textContent='Apply';
    const commit = () => {
      try {
        const ok = artboard.setPathVertexXY(index, v.index, Number(x.value), Number(y.value));
        artboard.advance(0);
        status(ok ? `Changed path #${index} vertex #${v.index}` : 'Vertex change rejected');
        const fresh = readPath(index); jsonEl.textContent = JSON.stringify(fresh, null, 2);
      } catch (e) { status(`Edit failed: ${e?.message || e}`); console.error(e); }
    };
    apply.onclick = commit;
    row.append(label,x,y,apply);
    verticesEl.appendChild(row);
    if (v.isCubic) {
      const meta = document.createElement('div'); meta.className='muted'; meta.style.margin='-4px 0 8px 65px';
      meta.textContent = `Bezier in(${fmt(v.inX)}, ${fmt(v.inY)}) out(${fmt(v.outX)}, ${fmt(v.outY)})`;
      verticesEl.appendChild(meta);
    }
  });
}

const fmt = (n) => typeof n === 'number' ? n.toFixed(2) : '—';

function selectArtboard(i) {
  cleanupArtboard();
  artboard = file.artboardByIndex(i);
  selectedPath = null;
  verticesEl.textContent='Select a path.'; jsonEl.textContent='—';
  renderPathList();
  status(`Loaded ${artboard.name}`);
  startLoop();
}

async function loadFile(bytes, name) {
  if (!R) { status('Build/load the custom runtime first'); return; }
  cleanupFile();
  status(`Parsing ${name}…`);
  try {
    file = await R.load(new Uint8Array(bytes));
    populateArtboards();
    if (!file.artboardCount()) throw new Error('No artboards');
    artboardSelect.value='0'; selectArtboard(0);
  } catch (e) { console.error(e); status(`Load failed: ${e?.message || e}`); }
}

fileInput.onchange = async () => { const f=fileInput.files?.[0]; if (f) await loadFile(await f.arrayBuffer(), f.name); };
artboardSelect.onchange = () => selectArtboard(Number(artboardSelect.value));
pauseBtn.onclick = () => { paused=!paused; pauseBtn.textContent=paused?'Resume':'Pause'; };
new ResizeObserver(resize).observe(canvasWrap);
window.addEventListener('beforeunload', () => { cleanupFile(); del(renderer); try { R?.cleanup?.(); } catch {} });

await loadRuntime();
