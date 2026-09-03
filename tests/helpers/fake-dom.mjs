/**
 * Dependency-free fake DOM for Veyra's Node test suites.
 *
 * Why this exists: `src/veyra/renderer.js` is ~27KB with 13 `addEventListener`
 * sites and drives every human canvas interaction, yet `package.json`'s `test`
 * script runs only `.mjs` suites and never loads it. Until this seam existed,
 * all human interaction in Veyra had zero automated coverage and was checked by
 * a person opening a browser page and reading a div.
 *
 * Deliberately NOT jsdom: `package-lock.json` is 125 bytes and this project is
 * zero-dependency by design. This file implements only the surface Veyra
 * actually touches, verified by inventory against `renderer.js`:
 *   appendChild(22) addEventListener(13) querySelector(6) setAttribute(5)
 *   createElementNS(1) replaceChildren(1) remove(1)
 *   setPointerCapture(1) releasePointerCapture(1)
 *
 * Design constraint from the 3B contract: assertions must target
 * `store.document`, never DOM markup strings. This module therefore aims to
 * make an `event -> intent -> command` path executable in Node; it is not a
 * browser emulator and must not be described as one.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------ *
 * Selector matching
 * Supports: `tag`, `.class`, `#id`, `[attr]`, `[attr="value"]`,
 * compound (`rect.sceneShape[data-node-id]`) and comma-separated lists.
 * Descendant/child combinators are intentionally unsupported — Veyra's
 * queries do not use them, and a half-working combinator is worse than a
 * loud failure.
 * ------------------------------------------------------------------ */

const SIMPLE_TOKEN = /([.#]?[A-Za-z0-9_\\-]+|\[[^\]]+\])/g;

function parseCompound(selector) {
  const raw = selector.trim();
  if (!raw) return null;
  if (/[\s>+~]/.test(raw)) {
    throw new Error(
      `fake-dom: combinator selectors are not supported ("${raw}"). `
      + 'Only ":scope > X" is implemented. Extend this helper deliberately.',
    );
  }
  const tests = [];
  const tokens = raw.match(SIMPLE_TOKEN) || [];
  for (const token of tokens) {
    if (token.startsWith('.')) {
      const wanted = token.slice(1);
      tests.push((el) => el.classList.contains(wanted));
    } else if (token.startsWith('#')) {
      const wanted = token.slice(1);
      tests.push((el) => el.getAttribute('id') === wanted);
    } else if (token.startsWith('[')) {
      const body = token.slice(1, -1);
      const eq = body.indexOf('=');
      if (eq === -1) {
        const name = body.trim();
        tests.push((el) => el.hasAttribute(name));
      } else {
        const name = body.slice(0, eq).trim();
        // Undo CSS.escape's backslashes so an escaped id still matches the
        // raw attribute value the renderer wrote.
        const value = body.slice(eq + 1).trim()
          .replace(/^["']|["']$/g, '')
          .replace(/\\(.)/g, '$1');
        tests.push((el) => el.getAttribute(name) === value);
      }
    } else {
      const wanted = token.toLowerCase();
      tests.push((el) => el.tagName.toLowerCase() === wanted);
    }
  }
  if (!tests.length) return null;
  return (el) => tests.every((test) => test(el));
}

const SCOPE_CHILD = /^:scope\s*>\s*/;

/**
 * Compile a selector list into { directChild, match } parts.
 *
 * `:scope > X` is CHILD-ONLY and must stay that way. `renderer.js` uses it at
 * :147, :148, :734 and :738 to find a direct child group; implementing it as a
 * descendant match would make the seam *lie* — it would find matches nested
 * anywhere and pass for the wrong reason. That failure mode is silent, which is
 * exactly the kind this seam exists to prevent.
 */
function compileSelector(selector) {
  return String(selector)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (SCOPE_CHILD.test(part)
      ? { directChild: true, match: parseCompound(part.replace(SCOPE_CHILD, '')) }
      : { directChild: false, match: parseCompound(part) }))
    .filter((part) => part.match);
}

function parseSelector(selector) {
  const parts = compileSelector(selector);
  if (!parts.length) return () => false;
  return (el) => parts.some((part) => part.match(el));
}

/**
 * Real `CSS.escape`, not a passthrough. A passthrough would make every
 * `[data-node-id="..."]` query pass while escaping was never exercised —
 * green for a reason unrelated to correctness.
 */
export function cssEscape(value) {
  const str = String(value);
  let out = '';
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    if (code === 0) { out += '\uFFFD'; continue; }
    if ((code >= 0x01 && code <= 0x1f) || code === 0x7f
      || (i === 0 && code >= 0x30 && code <= 0x39)
      || (i === 1 && code >= 0x30 && code <= 0x39 && str.charCodeAt(0) === 0x2d)) {
      out += `\\${code.toString(16)} `;
      continue;
    }
    if (i === 0 && code === 0x2d && str.length === 1) { out += `\\${ch}`; continue; }
    if (code >= 0x80 || code === 0x2d || code === 0x5f
      || (code >= 0x30 && code <= 0x39)
      || (code >= 0x41 && code <= 0x5a)
      || (code >= 0x61 && code <= 0x7a)) {
      out += ch;
      continue;
    }
    out += `\\${ch}`;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export class FakeEvent {
  constructor(type, init = {}) {
    this.type = String(type);
    this.bubbles = init.bubbles !== false;
    this.cancelable = init.cancelable !== false;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    this.target = null;
    this.currentTarget = null;
    Object.assign(this, init);
  }

  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
}

/**
 * Synthesize a pointer event. Coordinates default to 0 so a test that cares
 * about position must say so explicitly rather than inheriting a silent value.
 */
export function pointerEvent(type, init = {}) {
  return new FakeEvent(type, {
    pointerId: 1,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: 0,
    clientY: 0,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...init,
  });
}

/* ------------------------------------------------------------------ *
 * Element
 * ------------------------------------------------------------------ */

function datasetKeyToAttr(key) {
  return `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

function attrToDatasetKey(name) {
  return name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export class FakeElement {
  constructor(tagName, namespaceURI = null) {
    this.tagName = String(tagName);
    this.namespaceURI = namespaceURI;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this._textContent = '';
    // Pointer capture is a no-op here, but record it so a test can assert a
    // drag actually captured — a real source of lost-pointerup bugs.
    this.capturedPointers = new Set();

    this.dataset = new Proxy({}, {
      get: (_t, key) => this.getAttribute(datasetKeyToAttr(String(key))) ?? undefined,
      set: (_t, key, value) => {
        this.setAttribute(datasetKeyToAttr(String(key)), String(value));
        return true;
      },
      has: (_t, key) => this.hasAttribute(datasetKeyToAttr(String(key))),
      deleteProperty: (_t, key) => {
        this.removeAttribute(datasetKeyToAttr(String(key)));
        return true;
      },
      ownKeys: () => [...this.attributes.keys()]
        .filter((n) => n.startsWith('data-'))
        .map(attrToDatasetKey),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    });

    const classes = () => (this.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    const write = (list) => this.setAttribute('class', list.join(' '));
    this.classList = {
      add: (...names) => { const s = new Set(classes()); names.forEach((n) => s.add(n)); write([...s]); },
      remove: (...names) => { const s = new Set(classes()); names.forEach((n) => s.delete(n)); write([...s]); },
      contains: (name) => classes().includes(name),
      toggle: (name, force) => {
        const has = classes().includes(name);
        const on = force === undefined ? !has : Boolean(force);
        if (on) this.classList.add(name); else this.classList.remove(name);
        return on;
      },
      get length() { return classes().length; },
    };
  }

  /* --- attributes --- */
  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }
  getAttribute(name) { return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null; }
  hasAttribute(name) { return this.attributes.has(String(name)); }
  removeAttribute(name) { this.attributes.delete(String(name)); }

  /* --- tree --- */
  get children() { return this.childNodes.filter((n) => n instanceof FakeElement); }
  get firstChild() { return this.childNodes[0] || null; }
  get parentElement() { return this.parentNode; }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  /**
   * Variadic `append`, which the renderer uses 59 times (far more than
   * `appendChild`). Strings become text nodes, as in the real DOM.
   */
  append(...nodes) {
    for (const node of nodes) {
      this.appendChild(typeof node === 'string' ? new FakeText(node) : node);
    }
  }

  prepend(...nodes) {
    const existing = [...this.childNodes];
    this.childNodes = [];
    for (const node of nodes) {
      this.appendChild(typeof node === 'string' ? new FakeText(node) : node);
    }
    for (const node of existing) this.childNodes.push(node);
  }

  replaceChildren(...nodes) {
    for (const c of [...this.childNodes]) c.parentNode = null;
    this.childNodes = [];
    for (const n of nodes) {
      this.appendChild(typeof n === 'string' ? new FakeText(n) : n);
    }
  }

  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  /** `renderer.js:147-148` uses this for partial re-render of rig overlays. */
  replaceWith(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const index = parent.childNodes.indexOf(this);
    const built = nodes.map((n) => (typeof n === 'string' ? new FakeText(n) : n));
    for (const node of built) {
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = parent;
    }
    parent.childNodes.splice(index, 1, ...built);
    this.parentNode = null;
  }

  /** Walk ancestors (self first), as the real `closest` does. */
  closest(selector) {
    const match = parseSelector(selector);
    let node = this;
    while (node instanceof FakeElement) {
      if (match(node)) return node;
      node = node.parentNode;
    }
    return null;
  }

  matches(selector) { return parseSelector(selector)(this); }

  /* Focus is not modelled; recorded so a test can assert it was called. */
  focus() { this.focused = true; }
  blur() { this.focused = false; }

  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = String(value); this.replaceChildren(); }

  /* --- queries --- */
  _walk(visit) {
    for (const child of this.childNodes) {
      if (!(child instanceof FakeElement)) continue;
      visit(child);
      child._walk(visit);
    }
  }

  querySelectorAll(selector) {
    const parts = compileSelector(selector);
    if (!parts.length) return [];
    const direct = parts.filter((p) => p.directChild);
    const descendant = parts.filter((p) => !p.directChild);
    const out = [];
    if (direct.length) {
      for (const child of this.children) {
        if (direct.some((p) => p.match(child))) out.push(child);
      }
    }
    if (descendant.length) {
      this._walk((el) => { if (descendant.some((p) => p.match(el))) out.push(el); });
    }
    return out;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  /* --- pointer capture (recorded, not emulated) --- */
  setPointerCapture(id) { this.capturedPointers.add(id); }
  releasePointerCapture(id) { this.capturedPointers.delete(id); }
  hasPointerCapture(id) { return this.capturedPointers.has(id); }

  getBoundingClientRect() {
    return this._rect || { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  setBoundingClientRect(rect) { this._rect = rect; }

  /* --- events --- */
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    let node = this;
    while (node) {
      event.currentTarget = node;
      for (const handler of [...(node.listeners.get(event.type) || [])]) {
        handler.call(node, event);
      }
      if (event.propagationStopped || !event.bubbles) break;
      node = node.parentNode;
    }
    return !event.defaultPrevented;
  }
}

/** Minimal text node, so `append('text')` behaves as it does in the DOM. */
export class FakeText {
  constructor(data) {
    this.nodeType = 3;
    this.data = String(data);
    this.parentNode = null;
  }

  get textContent() { return this.data; }
  set textContent(value) { this.data = String(value); }
}

/**
 * Namespace-aware subclass, mirroring real browsers: `createElementNS` with the
 * SVG namespace produces an `SVGElement`. `renderer.js:45` guards its
 * constructor with `svg instanceof SVGElement`, so this distinction is load
 * bearing, not decorative.
 */
export class FakeSVGElement extends FakeElement {}

/* ------------------------------------------------------------------ *
 * Document
 * ------------------------------------------------------------------ */

export class FakeDocument extends FakeElement {
  constructor() {
    super('#document');
    this.documentElement = new FakeElement('html');
    this.appendChild(this.documentElement);
    this.body = new FakeElement('body');
    this.documentElement.appendChild(this.body);
  }

  createElement(tag) { return new FakeElement(tag); }

  createElementNS(ns, tag) {
    return ns === SVG_NS ? new FakeSVGElement(tag, ns) : new FakeElement(tag, ns);
  }

  getElementById(id) {
    let found = null;
    this._walk((el) => { if (!found && el.getAttribute('id') === id) found = el; });
    return found;
  }
}

/* ------------------------------------------------------------------ *
 * Installation
 * ------------------------------------------------------------------ */

/**
 * Install a fresh fake document (and the SVG namespace constant) on
 * globalThis. Returns { document, restore } — always call restore() so suites
 * cannot leak state into each other.
 */
export function installFakeDom() {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousElement = globalThis.Element;
  const previousSVGElement = globalThis.SVGElement;
  const previousCSS = globalThis.CSS;
  const previousLocalStorage = globalThis.localStorage;
  const previousKeyboardEvent = globalThis.KeyboardEvent;
  const previousMatchMedia = globalThis.matchMedia;
  const doc = new FakeDocument();

  // `renderer.js:45` does `svg instanceof SVGElement`. These globals are part
  // of the seam's contract, not conveniences. The class installed here MUST be
  // the same object `createElementNS` builds from, or the guard throws.
  globalThis.Element = FakeElement;
  globalThis.SVGElement = FakeSVGElement;
  // `renderer.js:556` and `:733` call CSS.escape when building attribute
  // selectors. Without this they throw; with a passthrough they would pass
  // while escaping was never exercised.
  globalThis.CSS = globalThis.CSS || { escape: cssEscape };
  globalThis.document = doc;
  globalThis.window = globalThis.window || {
    devicePixelRatio: 1,
    requestAnimationFrame: () => { throw new Error('fake-dom: rAF is banned in tests — step with explicit deltas.'); },
  };

  // Globals the browser SHELL (`veyra.js`) touches at import time. The shell is
  // not a module, so importing it executes top-level code immediately; it dies
  // on the first missing global. Measurement showed it gets past `document` and
  // `window` and fails only on autosave's `localStorage` — so the shell is
  // importable in Node by a very small margin, which makes a real multi-move
  // drag test possible against the ACTUAL handler rather than a re-implementation.
  //
  // Caveats, stated rather than implied: import succeeding is necessary, not
  // sufficient; further globals may sit behind this one; and any shell-importing
  // suite needs its own process, because the shell mutates globals at import.
  globalThis.localStorage = globalThis.localStorage || (() => {
    const store = new Map();
    return {
      getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
      setItem: (key, value) => { store.set(String(key), String(value)); },
      removeItem: (key) => { store.delete(String(key)); },
      clear: () => store.clear(),
      key: (i) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    };
  })();

  globalThis.KeyboardEvent = globalThis.KeyboardEvent || class KeyboardEvent extends FakeEvent {};
  globalThis.matchMedia = globalThis.matchMedia || ((query) => ({
    matches: false,
    media: String(query),
    addEventListener() {},
    removeEventListener() {},
  }));

  return {
    document: doc,
    SVG_NS,
    restore() {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
      globalThis.Element = previousElement;
      globalThis.SVGElement = previousSVGElement;
      globalThis.CSS = previousCSS;
      globalThis.localStorage = previousLocalStorage;
      globalThis.KeyboardEvent = previousKeyboardEvent;
      globalThis.matchMedia = previousMatchMedia;
    },
  };
}

export { SVG_NS };
