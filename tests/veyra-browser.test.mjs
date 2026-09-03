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

  check('[SEAM] combinator selectors fail loudly instead of silently', () => {
    assert.throws(() => document.querySelectorAll('div .child'), /not supported/);
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
