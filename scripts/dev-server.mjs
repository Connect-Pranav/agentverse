// Local preview of the dashboard + Worker API, for layout work and screenshots.
// Usage: node scripts/dev-server.mjs [port]   (token for the dashboard: "dev")
// Everything runs in memory: KV is a Map, outbound network calls are refused, and the
// LinkedIn draft is created by the real /api/signal/run code path. Nothing here touches production.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../mcp/src/index.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2] || 8787);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function memKv() {
  const map = new Map(); const meta = new Map();
  return {
    async get(k, type) { const v = map.get(k); if (v == null) return null; if (type === 'json') return JSON.parse(v); if (type === 'arrayBuffer') return v; return v; },
    async put(k, v, o) { map.set(k, v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? v : typeof v === 'string' ? v : JSON.stringify(v)); if (o?.metadata) meta.set(k, o.metadata); },
    async getWithMetadata(k, type) { return { value: await this.get(k, type), metadata: meta.get(k) || null }; },
    async delete(k) { map.delete(k); meta.delete(k); },
    async list({ prefix = '' } = {}) { return { keys: [...map.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name, metadata: meta.get(name) })), list_complete: true }; },
  };
}

const ASSETS = { async fetch(req) {
  const u = new URL(req.url);
  const p = normalize(join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)));
  if (!p.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
  try { return new Response(await readFile(p), { headers: { 'content-type': TYPES[extname(p)] || 'application/octet-stream' } }); }
  catch { return new Response('not found', { status: 404 }); }
} };

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const s = String(url && url.url || url);
  if (s.startsWith('http://localhost') || s.startsWith('http://127.0.0.1')) return realFetch(url, init);
  return new Response(JSON.stringify({ ok: false, error: 'offline dev server' }), { status: 503 });
};

const env = { MEDIA: memKv(), MCP_TOKEN: 'dev', ASSETS };
const ctx = { waitUntil() {}, passThroughOnException() {} };

// Seed: one real LinkedIn run so the LinkedIn page has a draft and a visual.
await worker.fetch(new Request('http://localhost/api/signal/run', { method: 'POST', headers: { authorization: 'Bearer dev', 'content-type': 'application/json' }, body: '{}' }), env, ctx).catch((e) => console.warn('seed run:', e.message));

http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length && !['GET', 'HEAD'].includes(req.method) ? Buffer.concat(chunks) : undefined;
    const r = await worker.fetch(new Request('http://localhost:' + PORT + req.url, { method: req.method, headers: req.headers, body }), env, ctx);
    const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500, { 'content-type': 'text/plain' }); res.end(String(e && e.stack || e)); }
}).listen(PORT, () => console.log('dev server on http://localhost:' + PORT + '  (dashboard token: dev)'));
