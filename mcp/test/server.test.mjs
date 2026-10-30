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
  // progress + YouTube posting (only after the owner says post)
  assert.equal((await (await worker.fetch(new Request(B + '/api/songvideo/runner/claim', { method: 'POST', headers: R, body: '{}' }), e)).json()).job, null, 'nothing posted before owner approval');
  const pub = (await tool(e, 'publish_to_youtube', { job_id: id, privacy: 'unlisted' })).structuredContent;
  assert.equal(pub.publish.state, 'requested');
  assert.equal((await tool(e, 'publish_to_youtube', { job_id: id })).isError, true, 'no double post');
  const pc = await (await worker.fetch(new Request(B + '/api/songvideo/runner/claim', { method: 'POST', headers: R, body: '{}' }), e)).json();
  assert.equal(pc.stage, 'publish');
  assert.equal(pc.job.publish.privacy, 'unlisted');
  const rv = await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/video`, { headers: R }), e);
  assert.deepEqual([...new Uint8Array(await rv.arrayBuffer())], [1, 2, 3]);
  await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/progress`, { method: 'POST', headers: R, body: JSON.stringify({ stage: 'publish', step: 'Uploading to YouTube', done: 1, total: 3, eta_s: 40 }) }), e);
  assert.equal((await tool(e, 'get_song_job', { job_id: id })).structuredContent.progress.eta_s, 40);
  await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/fail`, { method: 'POST', headers: R, body: JSON.stringify({ error: 'quota' }) }), e);
  assert.equal((await tool(e, 'get_song_job', { job_id: id })).structuredContent.publish.state, 'requested', 'retry after a failure');
  await worker.fetch(new Request(B + '/api/songvideo/runner/claim', { method: 'POST', headers: R, body: '{}' }), e);
  await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/published`, { method: 'POST', headers: R, body: JSON.stringify({ video_id: 'abcDEF12345', privacy: 'unlisted' }) }), e);
  const done = (await tool(e, 'get_song_job', { job_id: id })).structuredContent;
  assert.equal(done.publish.state, 'published');
  assert.equal(done.publish.url, 'https://youtu.be/abcDEF12345');
  assert.equal(done.lyrics_preview[0], 'Shaam ki laali');
  const meta = (await tool(e, 'get_youtube_metadata', { job_id: id })).structuredContent;
  assert.equal(meta.title, 'Shaam Ki Laali | Sunverse');
  const list = (await tool(e, 'list_song_jobs', {})).structuredContent.jobs;
  assert.equal(list[0].status, 'ready');
  assert.equal((await tool(e, 'delete_song_job', { job_id: id })).structuredContent.deleted, id);
  assert.equal((await tool(e, 'get_song_job', { job_id: id })).isError, true);
});

test('owner REST publish needs token and a ready video; instant start dispatch', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => { calls.push([String(u), o]); return new Response(null, { status: 204 }); };
  try {
    const e = { ...env(), GH_DISPATCH_TOKEN: 'ghp_x' };
    const H = { authorization: 'Bearer tok', 'content-type': 'application/json' };
    const waits = [];
    const ctx = { waitUntil: (p) => waits.push(p) };
    const c = await (await worker.fetch(new Request(B + '/api/songvideo', { method: 'POST', headers: H, body: '{"title":"T"}' }), e, ctx)).json();
    const id = c.job.job_id;
    assert.equal(c.job.instant_start, true);
    assert.equal((await worker.fetch(new Request(B + `/api/songvideo/${id}/publish`, { method: 'POST', body: '{}' }), e, ctx)).status, 401);
    assert.equal((await worker.fetch(new Request(B + `/api/songvideo/${id}/publish`, { method: 'POST', headers: H, body: '{}' }), e, ctx)).status, 409);
    const up = await worker.fetch(new Request(B + `/api/songvideo/${id}/audio`, { method: 'PUT', headers: { authorization: 'Bearer tok', 'content-type': 'audio/mpeg', 'content-length': '10' }, body: new Uint8Array(10) }), e, ctx);
    assert.equal((await up.json()).job.status, 'queued');
    await Promise.all(waits);
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /actions\/workflows\/songvideo\.yml\/dispatches$/);
    assert.equal(calls[0][1].headers.authorization, 'Bearer ghp_x');
    const h = await (await worker.fetch(new Request(B + '/health'), e)).json();
    assert.equal(h.instantStart, true);
  } finally { globalThis.fetch = realFetch; }
});

test('cloud brain: owner only, Workers AI with fallback, daily cap', async () => {
  const seen = [];
  const e = { ...env(), BRAIN_DAILY_CALLS: '2', AI: { run: async (m, i) => { seen.push(m); if (m.includes('70b')) throw new Error('busy'); return { response: '{"ok":true}' }; } } };
  const call = (auth) => worker.fetch(new Request(B + '/api/brain', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer tok' } : {}) }, body: JSON.stringify({ system: 's', prompt: 'p' }) }), e);
  assert.equal((await call(false)).status, 401);
  const r = await (await call(true)).json();
  assert.equal(r.text, '{"ok":true}');
  assert.match(r.model, /8b/);
  assert.equal(seen[0], '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal((await call(true)).status, 200);
  assert.equal((await call(true)).status, 429, 'daily cap protects the free allowance');
  assert.equal((await (await worker.fetch(new Request(B + '/health'), e)).json()).brain, true);
});

test('growth: runner reports, simple auto vs approval, owner decisions, MCP tools', async () => {
  const e = env();
  const H = { authorization: 'Bearer tok', 'content-type': 'application/json' };
  const f = (path, method = 'GET', body) => worker.fetch(new Request(B + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined }), e);
  assert.equal((await worker.fetch(new Request(B + '/api/growth'), e)).status, 401);
  assert.equal((await (await f('/api/growth')).json()).connected, false);
  const st = await (await f('/api/growth/runner')).json();
  assert.equal(st.settings.autoSimple, true);
  const rep = await (await f('/api/growth/runner/report', 'POST', {
    channel: { id: 'UCx', title: 'SUNVERSE', subs: 120, views: 5000, videos: 12 },
    new_subs: [{ id: 'UCa', name: 'Riya' }],
    drafts: [
      { cid: 'c1', thread_id: 'c1', author: 'Amit', text: 'Beautiful song!', reply: 'Thank you Amit! 🙏', kind: 'simple', posted: true },
      { cid: 'c2', thread_id: 'c2', author: 'Neha', text: 'Can we collab?', reply: 'Hi Neha, thanks for reaching out!', kind: 'needs_ok' },
      { cid: 'c3', thread_id: 'c3', author: 'bot', text: 'free subs here', reply: '', kind: 'skip' },
    ],
    seen: ['c1', 'c2', 'c3'],
  })).json();
  assert.equal(rep.connected, true);
  assert.equal(rep.waiting, 1);
  assert.equal(rep.posted_today, 1);
  assert.equal(rep.new_subscribers[0].name, 'Riya');
  assert.equal((await f('/api/growth/reply/c2', 'POST', { action: 'approve', draft: 'see https://x.y' })).status, 400, 'no link replies');
  await f('/api/growth/reply/c2', 'POST', { action: 'approve', draft: 'Hi Neha, DM us on Instagram @sunverse 🙌' });
  const st2 = await (await f('/api/growth/runner')).json();
  assert.deepEqual(st2.approved.map((x) => x.cid), ['c2']);
  assert.ok(st2.seen.includes('c3'));
  await f('/api/growth/runner/report', 'POST', { posted: [{ cid: 'c2' }] });
  const g = (await tool(e, 'get_growth_report', {})).structuredContent;
  assert.equal(g.waiting, 0);
  assert.equal(g.posted_today, 2);
  assert.equal((await tool(e, 'set_auto_replies', { on: false })).structuredContent.settings.autoSimple, false);
});

test('YouTube Short: owner request → runner → published, retry on failure', async () => {
  const e = env();
  const R = { authorization: 'Bearer tok', 'content-type': 'application/json' };
  const c = (await tool(e, 'create_song_job', { title: 'S' })).structuredContent;
  const id = c.job_id;
  assert.equal((await tool(e, 'make_youtube_short', { job_id: id })).isError, true, 'needs a ready video');
  await worker.fetch(new Request(new URL(c.upload_url).href, { method: 'PUT', headers: { 'content-type': 'audio/mpeg', 'content-length': '5' }, body: new Uint8Array(5) }), e);
  const claim = async () => (await worker.fetch(new Request(B + '/api/songvideo/runner/claim', { method: 'POST', headers: R, body: '{}' }), e)).json();
  await claim();
  await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/analysis`, { method: 'PUT', headers: R, body: JSON.stringify({ durationS: 10, scenes: [{ start: 0, end: 10, image_prompt: 'x' }] }) }), e);
  await tool(e, 'approve_song_job', { job_id: id });
  await claim();
  await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/video?part=1&parts=1`, { method: 'PUT', headers: { authorization: 'Bearer tok', 'content-length': '1' }, body: new Uint8Array([1]) }), e);
  assert.equal((await tool(e, 'make_youtube_short', { job_id: id, privacy: 'unlisted' })).structuredContent.short.state, 'requested');
  let cl = await claim();
  assert.equal(cl.stage, 'short');
  await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/fail`, { method: 'POST', headers: R, body: JSON.stringify({ error: 'x', stage: 'short' }) }), e);
  cl = await claim();
  assert.equal(cl.stage, 'short', 'retried');
  await worker.fetch(new Request(B + `/api/songvideo/runner/${id}/short-done`, { method: 'POST', headers: R, body: JSON.stringify({ video_id: 'shortID123' }) }), e);
  const j = (await tool(e, 'get_song_job', { job_id: id })).structuredContent;
  assert.equal(j.short.url, 'https://youtube.com/shorts/shortID123');
  assert.equal(j.status, 'ready');
});

test('runner auth via GitHub OIDC; free Cloudflare images skip the approval; pending count; image endpoint', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sign = async (claims) => { const h = enc({ alg: 'RS256', kid: 'k1' }), p = enc(claims); const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${h}.${p}`))).toString('base64url'); return `${h}.${p}.${sig}`; };
  const now = Math.floor(Date.now() / 1000);
  const good = await sign({ iss: 'https://token.actions.githubusercontent.com', aud: 'agentverse', repository: 'Connect-Pranav/agentverse', ref: 'refs/heads/main', exp: now + 300, nbf: now - 5 });
  const other = await sign({ iss: 'https://token.actions.githubusercontent.com', aud: 'agentverse', repository: 'evil/fork', ref: 'refs/heads/main', exp: now + 300 });
  const branch = await sign({ iss: 'https://token.actions.githubusercontent.com', aud: 'agentverse', repository: 'Connect-Pranav/agentverse', ref: 'refs/heads/x', exp: now + 300 });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => String(u).includes('jwks') ? new Response(JSON.stringify({ keys: [jwk] })) : realFetch(u);
  try {
    const e = { ...env(), AI: { run: async (m) => ({ image: Buffer.from([0xff, 0xd8, 0xff, 1, 2]).toString('base64') }) } };
    const R = (t) => ({ authorization: 'Bearer ' + t, 'content-type': 'application/json' });
    const f = (path, t, method = 'GET', body) => worker.fetch(new Request(B + path, { method, headers: R(t), body: body ? JSON.stringify(body) : undefined }), e);
    assert.equal((await f('/api/songvideo/runner/pending', other)).status, 401, 'other repo rejected');
    assert.equal((await f('/api/songvideo/runner/pending', branch)).status, 401, 'other branch rejected');
    assert.equal((await f('/api/songvideo/', good)).status, 401, 'OIDC is not owner access');
    assert.equal((await (await f('/api/songvideo/runner/pending', good)).json()).pending, 0);
    const c = (await tool(e, 'create_song_job', { title: 'Free' })).structuredContent;
    await worker.fetch(new Request(c.upload_url, { method: 'PUT', headers: { 'content-type': 'audio/mpeg', 'content-length': '4' }, body: new Uint8Array(4) }), e);
    assert.equal((await (await f('/api/songvideo/runner/pending', good)).json()).pending, 1);
    const cl = await (await f('/api/songvideo/runner/claim', good, 'POST', {})).json();
    assert.equal(cl.stage, 'analyze');
    await f(`/api/songvideo/runner/${c.job_id}/analysis`, good, 'PUT', { durationS: 20, image_engine: 'cloudflare', scenes: [{ start: 0, end: 20, image_prompt: 'x' }] });
    const j = (await tool(e, 'get_song_job', { job_id: c.job_id })).structuredContent;
    assert.equal(j.status, 'approved', 'free plan goes straight to rendering');
    assert.equal(j.est_cost_usd, 0);
    assert.equal(j.auto_approved, true);
    const img = await f(`/api/songvideo/runner/${c.job_id}/image`, good, 'POST', { prompt: 'sunset' });
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual([...new Uint8Array(await img.arrayBuffer())], [0xff, 0xd8, 0xff, 1, 2]);
    assert.equal((await f('/api/brain', other, 'POST', { prompt: 'x' })).status, 401);
  } finally { globalThis.fetch = realFetch; }
});

test('Start now: owner-only, needs GH_DISPATCH_TOKEN, dispatches the renderer', async () => {
  const H = { authorization: 'Bearer tok', 'content-type': 'application/json' };
  const go = (e, auth = true) => worker.fetch(new Request(B + '/api/songvideo/start', { method: 'POST', headers: auth ? H : {}, body: '{}' }), e);
  assert.equal((await go(env(), false)).status, 401);
  const r = await go(env());
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /GH_DISPATCH_TOKEN/);
  const realFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (u, o) => { calls.push(String(u)); return new Response(null, { status: 204 }); };
  try { const ok = await go({ ...env(), GH_DISPATCH_TOKEN: 'g' }); assert.equal((await ok.json()).started, true); assert.match(calls[0], /songvideo\.yml\/dispatches/); }
  finally { globalThis.fetch = realFetch; }
});
