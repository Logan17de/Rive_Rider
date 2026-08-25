import { RiveBridge } from './src/bridge/rive-bridge.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const canvasWrap = $('canvasWrap');
const statusEl = $('status');
const fileInput = $('fileInput');
const artboardSelect = $('artboard');
const pauseBtn = $('pause');
const capability = $('capability');
const geometrySummaryEl = $('geometrySummary');
const pathsEl = $('paths');
const verticesEl = $('vertices');
const vertexTitle = $('vertexTitle');
const jsonEl = $('json');

let R = null;
let renderer = null;
let file = null;
let artboard = null;
let bridge = null;
let raf = null;
let paused = false;
let last = 0;
let selectedPath = null;
let runtimeKind = 'unknown';
let pathRecords = [];

const status = (s) => { statusEl.textContent = s; };
const del = (o) => { try { o?.delete?.(); } catch {} };
const fmt = (n) => Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—';
const fmtPoint = (point, xKey = 'x', yKey = 'y') =>
  `${fmt(point?.[xKey])}, ${fmt(point?.[yKey])}`;
const samePoint = (a, b, ax = 'x', ay = 'y', bx = ax, by = ay) => {
  const values = [a?.[ax], a?.[ay], b?.[bx], b?.[by]].map(Number);
  return values.every(Number.isFinite)
    && Math.abs(values[0] - values[2]) < 0.001
    && Math.abs(values[1] - values[3]) < 0.001;
};
const sameNumber = (a, b) => Number.isFinite(Number(a))
  && Number.isFinite(Number(b))
  && Math.abs(Number(a) - Number(b)) < 0.001;
const pathName = (info) => {
  if (info?.shapeName && info?.name && info.shapeName !== info.name) {
    return `${info.shapeName} / ${info.name}`;
  }
  const index = info?.index ?? info?.objectIndex ?? '?';
  return info?.shapeName || info?.name || `Path #${index}`;
};
const propertyLabel = (name) => ({
  x: 'X',
  y: 'Y',
  rotation: 'Rotation',
  width: 'Width',
  height: 'Height',
  originX: 'Origin X',
  originY: 'Origin Y',
  linkCornerRadius: 'Link corner radii',
  cornerRadiusTL: 'Corner radius TL',
  cornerRadiusTR: 'Corner radius TR',
  cornerRadiusBL: 'Corner radius BL',
  cornerRadiusBR: 'Corner radius BR',
  points: 'Points',
  cornerRadius: 'Corner radius',
  innerRadius: 'Inner radius',
}[name] || name);
const pathRenderBounds = (vertices) => {
  const points = (vertices || [])
    .map((vertex) => [Number(vertex.renderX), Number(vertex.renderY)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};
const fmtBounds = (bounds) => bounds
  ? `[${fmt(bounds.minX)}, ${fmt(bounds.minY)}] -> [${fmt(bounds.maxX)}, ${fmt(bounds.maxY)}]`
  : '--';
const sameBounds = (a, b) => Boolean(a && b)
  && ['minX', 'minY', 'maxX', 'maxY'].every((key) => sameNumber(a[key], b[key]));

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
  bridge = null;
  selectedPath = null;
  pathRecords = [];
  if (geometrySummaryEl) geometrySummaryEl.textContent = 'Select an artboard.';
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
    'debugParametricInfo',
    'debugSetParametricProperty',
    'flattenPath',
  ];
  const exposed = bridge?.capabilities?.() || {};
  return Object.fromEntries(names.map((name) => [name, Boolean(exposed[name])]));
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
      && caps.debugParametricInfo && caps.debugSetParametricProperty
      ? 'READY: this build can inspect and edit authored vertices and parametric source properties.'
      : 'NOT READY: custom geometry WASM has not been built/loaded yet.',
  ].join('\n');
  return caps;
}

function listPathObjects() {
  return bridge?.object.list().filter((info) => info.isPath) || [];
}

function readPath(objectIndex) {
  return bridge?.geometry.readPath(objectIndex) || null;
}

function renderGeometrySummary(paths) {
  if (!geometrySummaryEl) return;
  geometrySummaryEl.innerHTML = '';
  const knownTypes = ['PointsPath', 'Rectangle', 'Ellipse', 'Polygon', 'Star', 'Triangle', 'ListPath'];
  const counts = Object.fromEntries(knownTypes.map((type) => [type, 0]));
  let other = 0;
  for (const path of paths) {
    if (Object.hasOwn(counts, path.concreteType)) counts[path.concreteType] += 1;
    else other += 1;
  }
  const values = [...knownTypes.map((type) => [type, counts[type]]), ['Other', other]];
  for (const [type, count] of values) {
    const item = document.createElement('div');
    item.className = 'summaryItem';
    const value = document.createElement('strong');
    value.textContent = String(count);
    const label = document.createElement('span');
    label.textContent = type;
    item.append(value, label);
    geometrySummaryEl.appendChild(item);
  }
  const diagnostics = document.createElement('div');
  diagnostics.className = 'summaryDiagnostics';
  diagnostics.textContent = [
    `${paths.length} paths`,
    `${paths.filter((path) => path.generatedVertices).length} generated`,
    `${paths.filter((path) => path.hasWeightedVertices).length} weighted/skinned`,
    `${paths.filter((path) => path.hidden).length} hidden`,
    `${paths.filter((path) => path.collapsed).length} collapsed`,
  ].join(' | ');
  geometrySummaryEl.appendChild(diagnostics);
}

function pathGroupIdentity(info) {
  if (Number(info.shapeIndex) >= 0) return `shape:${info.shapeIndex}`;
  if (Number(info.parentIndex) >= 0) return `parent:${info.parentIndex}`;
  return `path:${info.index}`;
}

function groupPaths(paths) {
  const groups = new Map();
  for (const info of paths) {
    const key = pathGroupIdentity(info);
    if (!groups.has(key)) {
      const shapeIndex = Number(info.shapeIndex);
      const parentIndex = Number(info.parentIndex);
      groups.set(key, {
        key,
        label: info.shapeName
          || info.parentName
          || info.name
          || (shapeIndex >= 0
            ? `Shape #${shapeIndex}`
            : (parentIndex >= 0 ? `Parent #${parentIndex}` : `Path #${info.index}`)),
        shapeIndex,
        parentIndex,
        paths: [],
      });
    }
    groups.get(key).paths.push(info);
  }
  return [...groups.values()];
}

function updatePathButton(button, info, groupLabel = '') {
  button.innerHTML = '';
  const title = document.createElement('span');
  title.className = 'pathBtnMain';
  const ownName = info.name && info.name !== groupLabel ? ` | ${info.name}` : '';
  title.textContent = `#${info.index}${ownName}`;

  const meta = document.createElement('span');
  meta.className = 'pathBtnMeta';
  const source = info.generatedVertices
    ? 'generated vertices'
    : (info.isPointsPath ? 'authored vertices' : 'vertex source unknown');
  const flags = [
    info.hidden ? 'hidden' : '',
    info.collapsed ? 'collapsed' : '',
    info.hasWeightedVertices ? 'weighted/skinned' : '',
  ].filter(Boolean);
  meta.textContent = [
    info.concreteType || 'Path',
    info.pathType || 'other',
    `typeKey ${info.typeKey}`,
    `${info.vertexCount ?? '?'} vertices`,
    source,
    ...flags,
  ].join(' | ');

  const hierarchy = document.createElement('span');
  hierarchy.className = 'pathBtnHierarchy';
  hierarchy.textContent = info.parentName
    ? `Parent: ${info.parentName}`
    : `Parent: ${Number(info.parentIndex) >= 0 ? `#${info.parentIndex}` : '—'}`;
  button.append(title, meta, hierarchy);
  button.classList.toggle('inactive', Boolean(info.hidden || info.collapsed));
  button.classList.toggle('weighted', Boolean(info.hasWeightedVertices));
}

function renderPathList() {
  const caps = renderCapabilities();
  pathsEl.innerHTML = '';
  if (geometrySummaryEl) geometrySummaryEl.textContent = 'Enumerating paths...';
  verticesEl.textContent = 'Select a path.';
  vertexTitle.textContent = 'Vertices';
  jsonEl.textContent = '—';

  if (!caps.debugObjectCount || !caps.debugObjectInfo) {
    pathsEl.textContent = 'The custom geometry bridge is not loaded. Run .\\tools\\rebuild-local-windows.ps1 on Windows (or bash tools/rebuild-local.sh on Linux), then refresh.';
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
    if (geometrySummaryEl) geometrySummaryEl.textContent = 'No Path objects found.';
    return;
  }

  const currentSchema = paths.every((info) =>
    typeof info.isPointsPath === 'boolean'
    && typeof info.isParametricPath === 'boolean'
    && typeof info.pathType === 'string'
    && typeof info.concreteType === 'string'
    && typeof info.generatedVertices === 'boolean'
    && typeof info.hasWeightedVertices === 'boolean');
  if (!currentSchema) {
    const warning = document.createElement('div');
    warning.className = 'pathNotice';
    warning.textContent = 'The loaded custom runtime predates path-type safety. Run .\\tools\\rebuild-local-windows.ps1 on Windows (or bash tools/rebuild-local.sh on Linux); editing remains disabled.';
    pathsEl.appendChild(warning);
    capability.textContent += '\n\nOUTDATED: rebuild the custom runtime to enable geometry classification and source-property editing.';
  }

  pathRecords = paths;
  renderGeometrySummary(paths);
  for (const group of groupPaths(paths)) {
    const section = document.createElement('section');
    section.className = 'pathGroup';
    const heading = document.createElement('div');
    heading.className = 'pathGroupHeading';
    const title = document.createElement('strong');
    title.textContent = group.label;
    const identity = document.createElement('span');
    identity.textContent = group.shapeIndex >= 0
      ? `Shape #${group.shapeIndex}`
      : (group.parentIndex >= 0 ? `Parent #${group.parentIndex}` : 'Path-owned');
    heading.append(title, identity);
    section.appendChild(heading);

    for (const info of group.paths) {
      const button = document.createElement('button');
      button.className = 'pathBtn';
      button.dataset.objectIndex = String(info.index);
      updatePathButton(button, info, group.label);
      button.onclick = () => selectPath(info.index, button);
      section.appendChild(button);
    }
    pathsEl.appendChild(section);
  }
}

function parametricPropertyMap(info) {
  return new Map(Array.from(info?.properties || []).map((property) => [property.name, property]));
}

function renderParametricEditor(data, button) {
  const info = data.parametric;
  if (!info || !bridge?.capabilities().debugSetParametricProperty) {
    const unavailable = document.createElement('div');
    unavailable.className = 'pathNotice';
    unavailable.textContent = 'Parametric source properties are unavailable in the loaded runtime. Rebuild the custom WASM.';
    verticesEl.appendChild(unavailable);
    return;
  }

  const editor = document.createElement('section');
  editor.className = 'parametricEditor';
  const heading = document.createElement('div');
  heading.className = 'parametricHeading';
  const title = document.createElement('strong');
  title.textContent = `${pathName(data)} - ${info.concreteType}`;
  const detail = document.createElement('span');
  detail.textContent = `Geometry: parametric - typeKey ${info.typeKey}`;
  heading.append(title, detail);
  editor.appendChild(heading);

  const inputByName = new Map();
  const properties = Array.from(info.properties || []);
  const groupNames = [...new Set(properties.map((property) => property.group || 'shape'))];
  for (const groupName of groupNames) {
    const group = document.createElement('fieldset');
    group.className = 'propertyGroup';
    const legend = document.createElement('legend');
    legend.textContent = groupName;
    group.appendChild(legend);
    const grid = document.createElement('div');
    grid.className = 'propertyGrid';
    for (const property of properties.filter((item) => (item.group || 'shape') === groupName)) {
      const label = document.createElement('label');
      label.className = 'propertyField';
      const text = document.createElement('span');
      text.textContent = propertyLabel(property.name);
      const input = document.createElement('input');
      input.dataset.propertyName = property.name;
      input.dataset.propertyKind = property.kind;
      if (property.kind === 'boolean') {
        input.type = 'checkbox';
        input.checked = Boolean(Number(property.value));
        label.classList.add('booleanField');
      } else {
        input.type = 'number';
        input.step = property.kind === 'integer' ? '1' : 'any';
        input.value = String(property.value);
      }
      inputByName.set(property.name, input);
      label.append(text, input);
      grid.appendChild(label);
    }
    group.appendChild(grid);
    editor.appendChild(group);
  }

  const apply = document.createElement('button');
  apply.className = 'primary propertyApply';
  apply.textContent = 'Apply source properties & verify';
  const result = document.createElement('div');
  result.className = 'verification propertyVerification';
  result.textContent = 'Not tested yet';

  apply.onclick = () => {
    try {
      const before = readPath(data.objectIndex);
      const beforeProperties = parametricPropertyMap(before.parametric);
      const requested = new Map();
      for (const property of Array.from(before.parametric?.properties || [])) {
        const input = inputByName.get(property.name);
        const value = property.kind === 'boolean' ? (input.checked ? 1 : 0) : Number(input.value);
        if (!Number.isFinite(value) || (property.kind === 'integer' && !Number.isInteger(value))) {
          result.textContent = `Invalid value for ${property.name}.`;
          status(`Invalid parametric property: ${property.name}`);
          return;
        }
        requested.set(property.name, value);
      }

      const changed = [...requested.entries()].filter(([name, value]) =>
        !sameNumber(beforeProperties.get(name)?.value, value));
      if (!changed.length) {
        result.textContent = 'No source properties changed.';
        status(`No changes requested for path #${data.objectIndex}`);
        return;
      }

      const rejected = [];
      for (const [name, value] of changed) {
        const mutation = bridge.geometry.setParametricProperty(data.objectIndex, name, value);
        if (!mutation.accepted) rejected.push(name);
      }
      const after = readPath(data.objectIndex);
      const afterProperties = parametricPropertyMap(after.parametric);
      const beforeBounds = pathRenderBounds(before.vertices);
      const afterBounds = pathRenderBounds(after.vertices);
      const readBackLines = changed.map(([name, value]) => {
        const stored = afterProperties.get(name)?.value;
        return `${name}: ${fmt(beforeProperties.get(name)?.value)} -> requested ${fmt(value)} -> read-back ${fmt(stored)}`;
      });
      const stored = changed.every(([name, value]) => sameNumber(afterProperties.get(name)?.value, value));
      const renderChanged = !sameBounds(beforeBounds, afterBounds);
      const details = [
        `Before render bounds: ${fmtBounds(beforeBounds)}`,
        ...readBackLines,
        `After render bounds: ${fmtBounds(afterBounds)}`,
        `render changed: ${renderChanged ? 'yes' : 'no'}`,
      ];
      if (rejected.length) {
        details.push(`Rejected unsupported properties: ${rejected.join(', ')}`);
      } else if (!stored) {
        details.push('Diagnosis: at least one requested source value did not survive the update pass.');
      } else if (!renderChanged) {
        details.push('Diagnosis: source values were stored; the rendered vertex bounds did not change.');
      } else {
        details.push('Diagnosis: source properties and rendered geometry both changed on the existing Artboard.');
      }
      result.textContent = details.join('\n');
      status(rejected.length
        ? `Rive rejected ${rejected.length} source properties on path #${data.objectIndex}`
        : `Verified ${after.concreteType} source properties on path #${data.objectIndex}`);

      for (const property of Array.from(after.parametric?.properties || [])) {
        const input = inputByName.get(property.name);
        if (!input) continue;
        if (property.kind === 'boolean') input.checked = Boolean(Number(property.value));
        else input.value = String(property.value);
      }
      jsonEl.textContent = JSON.stringify(after, null, 2);
      pathRecords = pathRecords.map((path) => path.index === data.objectIndex ? { ...path, ...after } : path);
      updatePathButton(button, after, after.shapeName || after.parentName || '');
      button.classList.add('active');
      renderGeometrySummary(pathRecords);
    } catch (error) {
      console.error(error);
      result.textContent = `Edit failed: ${error?.message || error}`;
      status(`Parametric edit failed: ${error?.message || error}`);
    }
  };

  editor.append(apply, result);
  verticesEl.appendChild(editor);
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
  vertexTitle.textContent = `Geometry · #${objectIndex} · ${pathName(data)}`;
  verticesEl.innerHTML = '';

  const editable = data.isPointsPath === true;
  if (data.isParametricPath) {
    const notice = document.createElement('div');
    notice.className = 'pathNotice';
    notice.textContent = 'Procedural path: edit the authoritative source properties below. Generated vertices remain read-only.';
    verticesEl.appendChild(notice);
    renderParametricEditor(data, button);
  } else if (!editable) {
    const notice = document.createElement('div');
    notice.className = 'pathNotice';
    notice.textContent = 'Direct vertex editing is available only for authored PointsPath geometry.';
    verticesEl.appendChild(notice);
  }

  const vertexHeading = document.createElement('h3');
  vertexHeading.className = 'geometrySubheading';
  vertexHeading.textContent = editable
    ? `Authored vertices${data.hasWeightedVertices ? ' · weighted/skinned' : ''}`
    : `${data.generatedVertices ? 'Generated' : 'Read-only'} vertices`;
  verticesEl.appendChild(vertexHeading);

  for (const vertex of data.vertices) {
    const row = document.createElement('div');
    row.className = 'vertex';

    const label = document.createElement('span');
    label.textContent = `#${vertex.index}${vertex.hasWeight ? ' · weighted' : ''}`;

    const x = document.createElement('input');
    x.type = 'number';
    x.step = 'any';
    x.value = String(vertex.x);
    x.disabled = !editable;

    const y = document.createElement('input');
    y.type = 'number';
    y.step = 'any';
    y.value = String(vertex.y);
    y.disabled = !editable;

    const apply = document.createElement('button');
    apply.textContent = 'Apply & verify';
    apply.className = 'primary';
    apply.disabled = !editable;

    const result = document.createElement('div');
    result.className = 'verification';
    result.textContent = editable
      ? 'Not tested yet'
      : (data.generatedVertices ? 'Generated vertex - direct editing disabled.' : 'Read-only path vertex.');

    apply.onclick = () => {
      try {
        const before = readPath(objectIndex)?.vertices
          .find((item) => item.index === vertex.index) || null;
        const requestedX = Number(x.value);
        const requestedY = Number(y.value);

        if (!Number.isFinite(requestedX) || !Number.isFinite(requestedY)) {
          result.textContent = '✗ Invalid X/Y';
          status('Invalid vertex coordinates');
          return;
        }

        const mutation = bridge.geometry.setPointsVertex(
          objectIndex,
          vertex.index,
          requestedX,
          requestedY,
        );
        const ok = mutation.accepted;

        const after = mutation.after;
        const requested = { x: requestedX, y: requestedY };
        const stored = Boolean(after) && samePoint(after, requested);
        const sourceChanged = Boolean(before && after) && !samePoint(before, after);
        const renderChanged = Boolean(before && after)
          && !samePoint(before, after, 'renderX', 'renderY');
        const hasWeight = Boolean(after?.hasWeight ?? before?.hasWeight);
        const details = [
          `Before source: ${fmtPoint(before)}`,
          `Requested: ${fmtPoint(requested)}`,
          `Read-back source: ${fmtPoint(after)}`,
          `Rendered: ${fmtPoint(before, 'renderX', 'renderY')} → ${fmtPoint(after, 'renderX', 'renderY')}`,
          `hasWeight: ${hasWeight ? 'true' : 'false'}`,
          `stored: ${stored ? 'yes' : 'no'}`,
        ];

        if (!ok) {
          details.push('Diagnosis: Rive rejected the edit because this is not an editable PointsPath vertex.');
          status(`Rive rejected path #${objectIndex}, vertex #${vertex.index}`);
        } else if (!stored) {
          details.push('Diagnosis: mutation was valid, but the requested source value did not survive the update pass.');
          status(`Setter did not stick for path #${objectIndex}, vertex #${vertex.index}`);
        } else if (sourceChanged && !renderChanged && hasWeight) {
          details.push('Diagnosis: source changed but render did not; inspect skin deformation/weights.');
          status(`Source changed but weighted render stayed fixed for path #${objectIndex}, vertex #${vertex.index}`);
        } else if (sourceChanged && !renderChanged) {
          details.push('Diagnosis: source changed but render did not; inspect update propagation.');
          status(`Source changed but render stayed fixed for path #${objectIndex}, vertex #${vertex.index}`);
        } else if (!sourceChanged) {
          details.push('Diagnosis: stored; the requested source coordinate was already current.');
          status(`Path #${objectIndex}, vertex #${vertex.index} was already at the requested coordinate`);
        } else {
          details.push('Diagnosis: source and rendered geometry both changed.');
          status(`Verified path #${objectIndex}, vertex #${vertex.index}: (${fmt(before?.x)}, ${fmt(before?.y)}) → (${fmt(after.x)}, ${fmt(after.y)})`);
          x.value = String(after.x);
          y.value = String(after.y);
        }

        result.textContent = details.join('\n');

        const refreshed = readPath(objectIndex);
        jsonEl.textContent = JSON.stringify(refreshed, null, 2);
        pathRecords = pathRecords.map((path) => path.index === objectIndex ? { ...path, ...refreshed } : path);
        updatePathButton(button, refreshed, refreshed.shapeName || refreshed.parentName || '');
        button.classList.add('active');
        renderGeometrySummary(pathRecords);
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
      meta.className = 'muted handleInfo';
      meta.textContent = [
        `Source handles: in(${fmt(vertex.inX)}, ${fmt(vertex.inY)}) · out(${fmt(vertex.outX)}, ${fmt(vertex.outY)})`,
        `Rendered handles: in(${fmt(vertex.renderInX)}, ${fmt(vertex.renderInY)}) · out(${fmt(vertex.renderOutX)}, ${fmt(vertex.renderOutY)})`,
      ].join('\n');
      verticesEl.appendChild(meta);
    }
  }
}

function selectArtboard(index) {
  cleanupArtboard();
  try {
    artboard = file.artboardByIndex(index);
    bridge = new RiveBridge(artboard);
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
