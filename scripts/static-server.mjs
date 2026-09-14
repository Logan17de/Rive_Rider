#!/usr/bin/env node
/**
 * Small dependency-free production server for the Veyra static editor.
 *
 * The editor is intentionally a static application.  This server exists so a
 * deploy or smoke test does not need to rely on Python being installed, while
 * still keeping the app's attack surface narrow: only files below the chosen
 * root are addressable, methods are explicit, and common browser hardening
 * headers are present on every response.
 */
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_PORT = 8000;
const DEFAULT_HOST = '127.0.0.1';
const MAX_PATH_CHARS = 4096;

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // Veyra's local editor has one tiny inline redirect in index.html and uses
  // data/blob URLs for authored media, hence the deliberately narrow origins.
  // External image/media assets are a supported Veyra document source. Keep
  // executable origins locked down while allowing the renderer to display
  // ordinary HTTP(S) media referenced by an authored asset record.
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' http: https: data: blob:; media-src 'self' http: https: data: blob:; font-src 'self' data:; connect-src 'self'",
});

function cachePolicy(type) {
  // The editor is shipped as a small static application without hashed asset
  // filenames. Mutable source/config files must revalidate so desktop shells
  // and rolling deployments cannot execute a stale bundle after an update.
  if (type.startsWith('text/') || type === 'application/json') return 'no-cache';
  return 'public, max-age=3600';
}

function headers(extra = {}) {
  return { ...SECURITY_HEADERS, ...extra };
}

function sendText(response, statusCode, body, extra = {}) {
  const payload = Buffer.from(String(body));
  response.writeHead(statusCode, headers({
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': payload.byteLength,
    'Cache-Control': 'no-store',
    ...extra,
  }));
  response.end(payload);
}

function safePath(root, pathname) {
  if (pathname.length > MAX_PATH_CHARS || pathname.includes('\0')) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/')) return null;
  const candidate = resolve(root, `.${decoded}`);
  const rel = relative(root, candidate);
  if (rel === '..' || rel.startsWith(`..${sep}`) || rel.includes('\0')) return null;
  return candidate;
}

function etagFor(stat) {
  return `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
}

function requestPath(requestUrl) {
  try {
    return new URL(requestUrl || '/', 'http://veyra.invalid');
  } catch {
    return null;
  }
}

/**
 * Create a static Veyra server.  The returned server is not listening until
 * the caller invokes `.listen`, which keeps this function straightforward to
 * embed in tests, desktop shells and deployment adapters.
 */
export function createStaticServer({ root = fileURLToPath(new URL('..', import.meta.url)) } = {}) {
  const rootPath = resolve(root);
  const rootRealPath = fs.realpath(rootPath).catch(() => rootPath);
  return createServer(async (request, response) => {
    const method = String(request.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      sendText(response, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      return;
    }
    const parsed = requestPath(request.url);
    if (!parsed) {
      sendText(response, 400, 'Bad Request');
      return;
    }
    if (parsed.pathname === '/') {
      const location = `/veyra.html${parsed.search || ''}`;
      response.writeHead(302, headers({ Location: location, 'Cache-Control': 'no-store' }));
      response.end();
      return;
    }
    const filePath = safePath(rootPath, parsed.pathname);
    if (!filePath) {
      sendText(response, 400, 'Bad Request');
      return;
    }
    let stat;
    try {
      stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error('not a file');
      // Resolve symlinks before serving so a link inside the document root
      // cannot expose an unrelated host file.
      const realRoot = await rootRealPath;
      const realFile = await fs.realpath(filePath);
      const realRelative = relative(realRoot, realFile);
      if (realRelative === '..' || realRelative.startsWith(`..${sep}`)) throw new Error('outside root');
    } catch {
      sendText(response, 404, 'Not Found');
      return;
    }
    const etag = etagFor(stat);
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers({ ETag: etag, 'Cache-Control': 'no-cache' }));
      response.end();
      return;
    }
    const type = CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, headers({
      ETag: etag,
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': cachePolicy(type),
    }));
    if (method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!response.headersSent) sendText(response, 500, 'Internal Server Error');
      else response.destroy();
    });
    stream.pipe(response);
  });
}

export async function startStaticServer({
  root = fileURLToPath(new URL('..', import.meta.url)),
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
} = {}) {
  const server = createStaticServer({ root });
  await new Promise((resolveListen, reject) => {
    const onError = (error) => { server.off('listening', resolveListen); reject(error); };
    server.once('error', onError);
    server.listen({ host, port }, () => {
      server.off('error', onError);
      resolveListen();
    });
  });
  return server;
}

const entry = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (entry) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const host = String(process.env.VEYRA_HOST || DEFAULT_HOST);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('PORT must be an integer from 0 to 65535.');
  const server = await startStaticServer({ host, port });
  const address = server.address();
  const shownPort = typeof address === 'object' && address ? address.port : port;
  console.log(`Veyra listening at http://${host}:${shownPort}/`);
  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
