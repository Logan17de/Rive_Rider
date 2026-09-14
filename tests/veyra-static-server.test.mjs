import assert from 'node:assert/strict';
import { startStaticServer } from '../scripts/static-server.mjs';

const server = await startStaticServer({ host: '127.0.0.1', port: 0 });
try {
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  const root = await fetch(`${origin}/?fresh=1`, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/veyra.html?fresh=1');
  assert.equal(root.headers.get('x-content-type-options'), 'nosniff');

  const page = await fetch(`${origin}/veyra.html`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') || '', /text\/html/);
  assert.match(await page.text(), /<title>Veyra<\/title>/);
  const etag = page.headers.get('etag');
  assert.ok(etag);

  const cached = await fetch(`${origin}/veyra.html`, { headers: { 'if-none-match': etag } });
  assert.equal(cached.status, 304);

  const head = await fetch(`${origin}/veyra.css`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.match(head.headers.get('content-type') || '', /text\/css/);
  assert.equal(await head.text(), '');

  // Keep the slash encoded so the client URL parser cannot canonicalize the
  // traversal before it reaches the server.
  const traversal = await fetch(`${origin}/..%2fpackage.json`);
  assert.ok([400, 404].includes(traversal.status), 'traversal must not expose files outside the root');
  const method = await fetch(`${origin}/veyra.html`, { method: 'POST' });
  assert.equal(method.status, 405);
  assert.match(method.headers.get('allow') || '', /GET/);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log('veyra static server tests passed');
