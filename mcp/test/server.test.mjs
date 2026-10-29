import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';

function memKV() {
  const m = new Map();
  const buf = async (v) => (v instanceof ReadableStream ? new Uint8Array(await new Response(v).arrayBuffer()) : typeof v === 'string' ? v : new Uint8Array(v instanceof ArrayBuffer ? v : v.buffer ?? v));
  return {
    async put(k, v, o) { m.set(k, { v: await buf(v), meta: o?.metadata ?? null }); },
    async get(k, t) { const e = m.get(k); if (!e) return null; if (t === 'json') return JSON.parse(e.v); if (t === 'stream') return new Response(e.v).body; return e.v; },
    async getWithMetadata(k, t) { const e = m.get(k); return e ? { value: t === 'stream' ? new Response(e.v).body : e.v, metadata: e.meta } : { value: null, metadata: null }; },
    async delete(k) { m.delete(k); },
  };
}
const env = () => ({ MEDIA: memKV(), MCP_TOKEN: 'tok', INR_PER_USD: '88' });
const B = 'https://sv.test';
const rpc = async (e, method, params, id = 1, path = '/mcp', auth = 'Bearer tok') =>
  worker.fetch(new Request(B + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }), e);
const tool = async (e, name, args) => (await (await rpc(e, 'tools/call', { name, arguments: args })).json()).result;

test('MCP handshake, auth and tool list', async () => {
  const e = env();
  assert.equal((await rpc(e, 'initialize', {}, 1, '/mcp', null)).status, 401);
  const init = await (await rpc(e, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })).json();
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'agentverse-sunverse');
  const viaPath = await (await rpc(e, 'tools/list', {}, 2, '/mcp/tok', null)).json();
  assert.ok(viaPath.result.tools.some((t) => t.name === 'approve_song_job'));
  const note = await worker.fetch(new Request(B + '/mcp', { method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }), e);
  assert.equal(note.status, 202);
  const bad = await (await rpc(e, 'tools/call', { name: 'nope', arguments: {} })).json();
  assert.equal(bad.error.code, -32602);
});

test('full flow: create → upload page → analysis → approval in chat → video → metadata', async () => {
  const e = env();
  const c = await tool(e, 'create_song_job', { title: 'Shaam Ki Laali' });
  assert.equal(c.structuredContent.status, 'uploading');
  assert.deepEqual(c.structuredContent.credits, { lyrics: 'COCO', singer: 'KoBhit' });
  const up = new URL(c.structuredContent.upload_url).pathname;
  const page = await worker.fetch(new Request(B + up), e);
  assert.match(await page.text(), /Upload song/);
  assert.equal((await worker.fetch(new Request(B + up, { method: 'PUT', headers: { 'content-type': 'image/png', 'content-length': '3' }, body: new Uint8Array(3) }), e)).status, 415);
  const put = await worker.fetch(new Request(B + up, { method: 'PUT', headers: { 'content-type': 'audio/mpeg', 'content-length': '500' }, body: new Uint8Array(500) }), e);
  assert.equal((await put.json()).status, 'queued');
  const id = c.structuredContent.job_id;
  const R = { authorization: 'Bearer tok', 'content-type': 'application/json' };
  assert.equal((await worker.fetch(new Request(B + '/api/songvideo/runner/claim', { method: 'POST', body: '{}' }), e)).status, 401);
  const cl = await (await worker.fetch(new Request(B + '/api/songvideo/runner/claim', { method: 'POST', headers: R, body: '{}' }), e)).json();
  assert.equal(cl.stage, 'analyze');
  const au = await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/audio`, { headers: R }), e);
  assert.equal((await au.arrayBuffer()).byteLength, 500);
  await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/analysis`, { method: 'PUT', headers: R, body: JSON.stringify({ durationS: 30, mood: 'warm', theme: 'evening', scenes: [{ start: 0, end: 15, image_prompt: 'sunset' }, { start: 15, end: 30, image_prompt: 'moon' }], lyrics_lines: [{ start: 1, end: 3, text: 'Shaam ki laali' }], youtube: { title: 'Shaam Ki Laali | Sunverse', description: 'Lyrics: COCO · Singer: KoBhit', tags: ['hindi song'] } }) }), e);
  const g = (await tool(e, 'get_song_job', { job_id: id })).structuredContent;
  assert.equal(g.status, 'needs_approval');
  assert.equal(g.image_count, 2);
  assert.equal(g.est_cost_inr, 12);
  assert.equal((await (await worker.fetch(new Request(B + '/api/songvideo/runner/claim', { method: 'POST', headers: R, body: '{}' }), e)).json()).job, null, 'nothing paid before approval');
  assert.equal((await tool(e, 'approve_song_job', { job_id: id })).structuredContent.status, 'approved');
  assert.equal((await (await worker.fetch(new Request(B + '/api/songvideo/runner/claim', { method: 'POST', headers: R, body: '{}' }), e)).json()).stage, 'render');
  const vp = (n, parts, body) => worker.fetch(new Request(B + `/api/songvideo/runner/${id}/video?part=${n}&parts=${parts}&meta=${encodeURIComponent('{"imageCostUsd":0.134}')}`, { method: 'PUT', headers: { authorization: 'Bearer tok', 'content-length': String(body.length) }, body }), e);
  await vp(1, 2, new Uint8Array([1, 2]));
  await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/thumb`, { method: 'PUT', headers: { authorization: 'Bearer tok', 'content-length': '1' }, body: new Uint8Array([7]) }), e);
  assert.equal((await (await vp(2, 2, new Uint8Array([3]))).json()).job.status, 'ready');
  const ready = (await tool(e, 'get_song_job', { job_id: id })).structuredContent;
  assert.ok(ready.video_url && ready.thumbnail_url);
  const v = await worker.fetch(new Request(ready.video_url), e);
  assert.deepEqual([...new Uint8Array(await v.arrayBuffer())], [1, 2, 3]);
  const meta = (await tool(e, 'get_youtube_metadata', { job_id: id })).structuredContent;
  assert.equal(meta.title, 'Shaam Ki Laali | Sunverse');
  const list = (await tool(e, 'list_song_jobs', {})).structuredContent.jobs;
  assert.equal(list[0].status, 'ready');
  assert.equal((await tool(e, 'delete_song_job', { job_id: id })).structuredContent.deleted, id);
  assert.equal((await tool(e, 'get_song_job', { job_id: id })).isError, true);
});
