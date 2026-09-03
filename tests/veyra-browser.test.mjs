/**
 * Headless runner for the browser render suite (3B-2 gate (i), R2).
 *
 * This does NOT rewrite the browser assertions — it installs the
 * dependency-free fake DOM and executes `tests/veyra-browser.js` verbatim, so
 * the two can never drift. Scope is deliberately bounded to that file's
 * CURRENT assertion level; growing it into a full renderer port is a separate
 * task by explicit decision.
 *
 * Honest limits, stated rather than implied:
 *  - This proves the renderer builds the expected SVG tree and that zoom/pan
 *    arithmetic is correct. It does NOT prove real browser layout, hit
 *    testing against painted pixels, or CSS.
 *  - A passing run here is not a claim that Veyra "works in a browser". The
 *    browser page remains the integration check.
 */

import assert from 'node:assert/strict';
import { installFakeDom, pointerEvent, FakeElement } from './helpers/fake-dom.mjs';

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (error) {
    checks.push({ name, ok: false, error });
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message}`);
  }
}

console.log('Veyra headless browser suite (fake DOM seam)\n');

/* ------------------------------------------------------------------ *
 * 1. The seam itself must be trustworthy before it certifies anything.
 * ------------------------------------------------------------------ */

{
  const dom = installFakeDom();
  const { document } = dom;

  check('[SEAM] attribute-backed class selectors match', () => {
    const el = document.createElement('div');
    el.setAttribute('class', 'sceneShape selected');
    document.body.appendChild(el);
    assert.equal(document.querySelectorAll('.sceneShape').length, 1);
    assert.equal(document.querySelectorAll('.missing').length, 0);
  });

  check('[SEAM] attribute-presence selectors match', () => {
    const el = document.createElement('g');
    el.setAttribute('data-node-id', 'n1');
    document.body.appendChild(el);
    assert.equal(document.querySelectorAll('[data-node-id]').length, 1);
    assert.equal(document.querySelector('[data-node-id]').getAttribute('data-node-id'), 'n1');
  });

  check('[SEAM] compound selectors require every token', () => {
    const el = document.createElement('rect');
    el.setAttribute('class', 'sceneShape');
    el.setAttribute('data-node-id', 'n2');
    document.body.appendChild(el);
    assert.equal(document.querySelectorAll('rect.sceneShape[data-node-id]').length, 1);
    assert.equal(document.querySelectorAll('circle.sceneShape').length, 0);
  });

  check('[SEAM] unsupported combinators fail loudly instead of silently', () => {
    assert.throws(() => document.querySelectorAll('div .child'), /not supported/);
  });

  // NEGATIVE CONTROLS. A selector engine that can only ever return what the
  // caller expects is not evidence. These prove the seam can report absence
  // and can distinguish scopes — i.e. that it is capable of failing.
  check('[SEAM] negative control — absent selectors return empty, not a match', () => {
    assert.equal(document.querySelectorAll('.definitelyNotPresent').length, 0);
    assert.equal(document.querySelector('.definitelyNotPresent'), null);
    assert.equal(document.querySelectorAll('[data-not-a-real-attribute]').length, 0);
  });

  check('[SEAM] :scope > is CHILD-only and differs from the descendant form', () => {
    const root = document.createElement('g');
    const directChild = document.createElement('g');
    directChild.setAttribute('class', 'target');
    const nested = document.createElement('g');
    const deepChild = document.createElement('g');
    deepChild.setAttribute('class', 'target');
    nested.appendChild(deepChild);
    root.appendChild(directChild);
    root.appendChild(nested);
    document.body.appendChild(root);

    // Descendant form finds both; child-only form finds exactly the direct one.
    assert.equal(root.querySelectorAll('.target').length, 2, 'descendant form');
    assert.equal(root.querySelectorAll(':scope > .target').length, 1, 'child-only form');
    assert.equal(root.querySelector(':scope > .target'), directChild);
    // If :scope > were implemented as descendant-match, these would be equal.
    assert.notEqual(
      root.querySelectorAll('.target').length,
      root.querySelectorAll(':scope > .target').length,
      ':scope > must not degrade into a descendant match',
    );
  });

  check('[SEAM] CSS.escape is a real implementation, not a passthrough', () => {
    assert.equal(typeof globalThis.CSS.escape, 'function');
    // A passthrough would return these unchanged.
    assert.notEqual(globalThis.CSS.escape('a.b'), 'a.b');
    assert.equal(globalThis.CSS.escape('a.b'), 'a\\.b');
    // Veyra ids are alphanumeric/underscore, so escaping is identity there —
    // stated rather than hidden.
    assert.equal(globalThis.CSS.escape('node_123'), 'node_123');
  });

  check('[SEAM] escaped attribute selectors still match the raw value', () => {
    const el = document.createElement('g');
    el.setAttribute('data-node-id', 'node_1');
    document.body.appendChild(el);
    const found = document.querySelector(`[data-node-id="${globalThis.CSS.escape('node_1')}"]`);
    assert.equal(found, el);
  });

  check('[SEAM] replaceWith swaps a node in place, preserving sibling order', () => {
    const parent = document.createElement('g');
    const a = document.createElement('g');
    a.setAttribute('class', 'a');
    const b = document.createElement('g');
    b.setAttribute('class', 'b');
    const c = document.createElement('g');
    c.setAttribute('class', 'c');
    parent.append(a, b, c);
    const replacement = document.createElement('g');
    replacement.setAttribute('class', 'replaced');
    b.replaceWith(replacement);
    assert.deepEqual(
      parent.children.map((el) => el.getAttribute('class')),
      ['a', 'replaced', 'c'],
    );
    assert.equal(b.parentNode, null);
  });

  check('[SEAM] dataset round-trips through data-* attributes', () => {
    const el = document.createElement('div');
    el.dataset.statusCode = 'passed';
    assert.equal(el.getAttribute('data-status-code'), 'passed');
    assert.equal(el.dataset.statusCode, 'passed');
  });

  check('[SEAM] replaceChildren detaches previous children', () => {
    const parent = document.createElement('g');
    const a = document.createElement('rect');
    parent.appendChild(a);
    parent.replaceChildren();
    assert.equal(parent.children.length, 0);
    assert.equal(a.parentNode, null);
  });

  check('[SEAM] synthesized pointer events bubble and can be stopped', () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);
    const seen = [];
    parent.addEventListener('pointerdown', () => seen.push('parent'));
    child.addEventListener('pointerdown', (e) => { seen.push('child'); e.stopPropagation(); });
    child.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 7 }));
    assert.deepEqual(seen, ['child']);
  });

  check('[SEAM] rAF is banned so tests cannot depend on wall-clock timing', () => {
    assert.throws(() => globalThis.window.requestAnimationFrame(() => {}), /banned/);
  });

  dom.restore();
}

/* ------------------------------------------------------------------ *
 * 2. The real browser suite, executed verbatim.
 * ------------------------------------------------------------------ */

{
  const dom = installFakeDom();
  const { document } = dom;

  const surface = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  surface.setAttribute('id', 'surface');
  document.body.appendChild(surface);

  const result = document.createElement('pre');
  result.setAttribute('id', 'result');
  document.body.appendChild(result);

  let importError = null;
  try {
    await import('./veyra-browser.js');
  } catch (error) {
    importError = error;
  }

  check('[BROWSER] veyra-browser.js executes under the fake DOM', () => {
    if (importError) throw importError;
    assert.ok(true);
  });

  check('[BROWSER] the suite reports passed', () => {
    if (importError) throw new Error(`did not execute: ${importError.message}`);
    assert.equal(
      document.body.dataset.status,
      'passed',
      `suite reported: ${result.textContent}`,
    );
  });

  dom.restore();
}

/* ------------------------------------------------------------------ */

const failed = checks.filter((c) => !c.ok);
console.log(`\nVeyra headless browser suite — ${checks.length - failed.length}/${checks.length} checks green`);
if (failed.length) {
  console.log('\nThis seam is 3B-2 gate (i). It must be green before the state graph panel is dispatched.');
  process.exitCode = 1;
}
