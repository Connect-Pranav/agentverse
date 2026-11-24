import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import * as signal from '../src/signal.mjs';

function memKv() {
  const map = new Map();
  return {
    async get(k, type) {
      const v = map.get(k);
      if (!v) return null;
      if (type === 'json') return JSON.parse(v);
      return v;
    },
    async put(k, v) {
      map.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    },
    async delete(k) {
      map.delete(k);
    },
  };
}

function mockEnv() {
  const kv = memKv();
  return {
    MEDIA: kv,
    MCP_TOKEN: 'test_mcp_token_secret',
    TELEGRAM_BOT_TOKEN: '123456:bot-token',
    TELEGRAM_CHAT_ID: '987654321',
  };
}

const BASE = 'https://agentverse.test';
const H_AUTH = {
  authorization: 'Bearer test_mcp_token_secret',
  'content-type': 'application/json',
};

test('PRANAV SIGNAL: MCP tools list includes all 13 Signal tools', async () => {
  const env = mockEnv();
  const res = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }), env);

  assert.equal(res.status, 200);
  const data = await res.json();
  const toolNames = data.result.tools.map((t) => t.name);

  const expectedTools = [
    'linkedin_profile_audit',
    'benchmark_profiles_refresh',
    'benchmark_patterns_analyse',
    'global_ai_market_scan',
    'daily_signal_rank',
    'pranav_pov_generate',
    'linkedin_post_draft',
    'linkedin_visual_create',
    'linkedin_post_quality_check',
    'linkedin_post_submit_approval',
    'linkedin_post_publish',
    'linkedin_post_performance',
    'linkedin_content_memory_update',
  ];

  for (const name of expectedTools) {
    assert.ok(toolNames.includes(name), `Missing tool: ${name}`);
  }
});

test('PRANAV SIGNAL: MCP resources/list and resources/read', async () => {
  const env = mockEnv();
  // List resources
  const listRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'resources/list' }),
  }), env);

  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.ok(listData.result.resources.length >= 7);
  assert.ok(listData.result.resources.some((r) => r.uri === 'pranav://voice-card'));
  assert.ok(listData.result.resources.some((r) => r.uri === 'pranav://positioning'));

  // Read resource
  const readRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'pranav://positioning' } }),
  }), env);

  assert.equal(readRes.status, 200);
  const readData = await readRes.json();
  assert.ok(readData.result.contents[0].text.includes('Pranav Kumar'));
  assert.ok(readData.result.contents[0].text.includes('IndiaMART'));
});

test('PRANAV SIGNAL: Full autonomous flow via MCP tools and idempotency', async () => {
  const env = mockEnv();

  // 1. Audit profile
  const auditRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'linkedin_profile_audit' } }),
  }), env);
  assert.equal(auditRes.status, 200);

  // 2. Scan market
  const scanRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'global_ai_market_scan' } }),
  }), env);
  assert.equal(scanRes.status, 200);

  // 3. Rank daily signal
  const rankRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'daily_signal_rank' } }),
  }), env);
  assert.equal(rankRes.status, 200);

  // 4. Draft LinkedIn post
  const draftRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'linkedin_post_draft' } }),
  }), env);
  assert.equal(draftRes.status, 200);
  const draftData = (await draftRes.json()).result.structuredContent;
  assert.ok(draftData.id.startsWith('post_'));
  assert.ok(draftData.body.includes('IndiaMART'));

  // 5. Generate 1200x627 visual
  const visRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'linkedin_visual_create', arguments: { draft_id: draftData.id } } }),
  }), env);
  assert.equal(visRes.status, 200);
  const visData = (await visRes.json()).result.structuredContent;
  assert.equal(visData.width, 1200);
  assert.equal(visData.height, 627);
  assert.equal(visData.aspectRatio, '1.91:1');
  assert.ok(visData.svg.includes('PRANAV KUMAR'));

  // 6. Quality check
  const checkRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'linkedin_post_quality_check', arguments: { draft_id: draftData.id } } }),
  }), env);
  assert.equal(checkRes.status, 200);
  const checkData = (await checkRes.json()).result.structuredContent;
  assert.equal(checkData.passed, true);
  assert.ok(checkData.overallScore >= 90);

  // 7. Submit to approval queue
  const subRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'linkedin_post_submit_approval', arguments: { draft_id: draftData.id } } }),
  }), env);
  assert.equal(subRes.status, 200);

  // Verify item is present in Work KV store (/api/work)
  const workRes = await worker.fetch(new Request(BASE + '/api/work', { method: 'GET' }), env);
  assert.equal(workRes.status, 200);
  const workState = await workRes.json();
  const workItem = workState.items.find((x) => x.id === `sig_${draftData.id}`);
  assert.ok(workItem, 'Work item should be queued in AgentVerse');
  assert.equal(workItem.brand, 'Pranav Signal');
  assert.equal(workItem.status, 'waiting');

  // 8. Publish via draft-only / manual mode
  const pubRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'linkedin_post_publish', arguments: { draft_id: draftData.id, mode: 'manual' } } }),
  }), env);
  assert.equal(pubRes.status, 200);
  const pubData = (await pubRes.json()).result.structuredContent;
  assert.equal(pubData.success, true);
  assert.equal(pubData.mode, 'manual');
  assert.ok(pubData.shareUrl.includes('linkedin.com'));

  // 9. Idempotency test: drafting again today returns the same draft
  const secondDraftRes = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'linkedin_post_draft' } }),
  }), env);
  const secondDraft = (await secondDraftRes.json()).result.structuredContent;
  assert.equal(secondDraft.id, draftData.id);
});

test('PRANAV SIGNAL: REST endpoints /api/signal and decision flow', async () => {
  const env = mockEnv();

  // GET /api/signal owner view
  const viewRes = await worker.fetch(new Request(BASE + '/api/signal', {
    method: 'GET',
    headers: H_AUTH,
  }), env);
  assert.equal(viewRes.status, 200);
  const viewData = await viewRes.json();
  assert.equal(viewData.module, 'PRANAV SIGNAL — LinkedIn Growth Studio');
  assert.ok(viewData.positioning.headline.includes('Revenue Operations'));

  // POST /api/signal/run (runner execution)
  const runRes = await worker.fetch(new Request(BASE + '/api/signal/run', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ trigger: 'test' }),
  }), env);
  assert.equal(runRes.status, 200);
  const runData = await runRes.json();
  assert.equal(runData.ok, true);
  // Adobe Express is not configured in this Worker, so the honest status is PARTIAL (never SUCCESS).
  assert.equal(runData.status, 'PARTIAL');
  assert.equal(runData.run.case_number, 1);
  assert.equal(runData.run.image_generation_status, 'ADOBE_EXPRESS_NOT_CONFIGURED');

  // POST /api/signal/decide approve
  const decRes = await worker.fetch(new Request(BASE + '/api/signal/decide', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ draft_id: runData.draftId, action: 'approve' }),
  }), env);
  assert.equal(decRes.status, 200);
  const decData = await decRes.json();
  assert.equal(decData.success, true);
});

test('PRANAV SIGNAL: Public endpoints for UI visual, draft state, and OAuth callback', async () => {
  const env = mockEnv();

  // Public GET /api/signal/draft without auth headers (for browser UI)
  const draftRes = await worker.fetch(new Request(BASE + '/api/signal/draft', { method: 'GET' }), env);
  assert.equal(draftRes.status, 200);
  const draftJson = await draftRes.json();
  assert.equal(draftJson.ok, true);
  assert.ok(draftJson.state);
  assert.equal(draftJson.state.status, 'NO_POST_GENERATED_YET');
  assert.equal(draftJson.state.draft.body, '');

  // With no run there is no visual: no generic mock image is served
  const visRes = await worker.fetch(new Request(BASE + '/api/signal/visual', { method: 'GET' }), env);
  assert.equal(visRes.status, 404);

  // Public GET /api/signal/visual.jpg returns binary JPEG
  const jpgRes = await worker.fetch(new Request(BASE + '/api/signal/visual.jpg', { method: 'GET' }), env);
  assert.equal(jpgRes.status, 200);
  assert.match(jpgRes.headers.get('content-type'), /image\/jpeg/);
  const jpgBytes = new Uint8Array(await jpgRes.arrayBuffer());
  assert.ok(jpgBytes.length > 50000);
  // JPEG magic bytes: FF D8 FF
  assert.equal(jpgBytes[0], 0xFF);
  assert.equal(jpgBytes[1], 0xD8);
  assert.equal(jpgBytes[2], 0xFF);

  // MCP resource: pranav://100-business-problems
  const r100Res = await worker.fetch(new Request(BASE + '/mcp', {
    method: 'POST',
    headers: H_AUTH,
    body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'resources/read', params: { uri: 'pranav://100-business-problems' } }),
  }), env);
  assert.equal(r100Res.status, 200);
  const r100Data = JSON.parse((await r100Res.json()).result.contents[0].text);
  assert.equal(r100Data.length, 100);

  // Public GET /api/signal/auth/callback returns instructional page
  const cbRes = await worker.fetch(new Request(BASE + '/api/signal/auth/callback?code=mock_code_123', { method: 'GET' }), env);
  assert.equal(cbRes.status, 200);
  const cbHtml = await cbRes.text();
  assert.ok(cbHtml.includes('LinkedIn Authorization Code Received'));
});


// ---- Linkedin_Post_Generator: case-bank engine, persistence, Telegram, Adobe Express (mocked fetch) ----
function tgStub() {
  const sent = [];
  const f = async (url, init) => {
    if (String(url).includes('api.telegram.org')) {
      sent.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: false, text: async () => 'unexpected network call', json: async () => ({}) };
  };
  return { sent, f };
}
const envFor = () => ({ TELEGRAM_BOT_TOKEN: '1:x', TELEGRAM_CHAT_ID: '42', MCP_TOKEN: 't' });

test('case selection: consecutive new runs pick Case #1, #2, #3 and persist usedCaseNumbers', async () => {
  const kv = memKv();
  const { f } = tgStub();
  const got = [];
  for (let i = 0; i < 3; i++) {
    const r = await signal.runLinkedinPostGenerator(kv, envFor(), { new_case: true }, f);
    got.push(r.case_number);
  }
  assert.deepEqual(got, [1, 2, 3]);
  const s = await signal.load(kv);
  assert.deepEqual(s.usedCaseNumbers, [1, 2, 3]);
});

test('retry on the same day resumes the SAME run/case and does not re-send Telegram', async () => {
  const kv = memKv();
  const { sent, f } = tgStub();
  const a = await signal.runLinkedinPostGenerator(kv, envFor(), {}, f);
  const afterFirst = sent.length;
  const b = await signal.runLinkedinPostGenerator(kv, envFor(), {}, f);
  assert.equal(b.run_id, a.run_id);
  assert.equal(b.post_id, a.post_id);
  assert.equal(b.case_number, a.case_number);
  assert.equal(sent.length, afterFirst, 'a resumed run must not send Telegram again');
  assert.equal(sent.filter((m) => m.reply_markup).length, 1, 'exactly one approval message (with buttons) per run');
  assert.equal((await signal.load(kv)).usedCaseNumbers.length, 1);
});

test('Telegram receives the exact persisted post; no Canva anywhere; Adobe Express status is honest', async () => {
  const kv = memKv();
  const { sent, f } = tgStub();
  const r = await signal.runLinkedinPostGenerator(kv, envFor(), {}, f);
  const s = await signal.load(kv);
  const d = s.drafts[r.post_id];

  assert.equal(r.persistence_status, 'PERSISTED_IN_KV');
  assert.equal(r.telegram_status, 'SENT');
  assert.equal(r.case_number, d.case_number);
  assert.equal(r.company, 'Eastman Kodak');
  assert.ok(d.body.includes('Eastman Kodak'));

  const decode = (h) => h.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const tg = decode(sent.map((m) => m.text).join('\n'));
  assert.ok(tg.includes(d.body), 'Telegram text must contain the exact saved draft body');
  assert.ok(tg.includes(r.post_id) && tg.includes(r.run_id) && tg.includes(r.source_url));
  assert.ok(sent[sent.length - 1].reply_markup.inline_keyboard[0][0].callback_data.startsWith('app:work:sig_'));

  // Adobe Express: nothing invented
  assert.equal(r.adobe_express_project_id, null);
  assert.equal(r.adobe_express_url, null);
  assert.equal(r.image_generation_status, 'ADOBE_EXPRESS_NOT_CONFIGURED');
  assert.equal(r.generation_status, 'PARTIAL');
  assert.ok(!/canva/i.test(JSON.stringify(s.drafts[r.post_id].visual)));
  assert.ok(!/canva/i.test(d.visual.svg));
});

test('Telegram failure keeps the saved post and is reported; retry sends only the Telegram stage', async () => {
  const kv = memKv();
  const bad = async () => ({ ok: false, json: async () => ({}), text: async () => 'down' });
  const r1 = await signal.runLinkedinPostGenerator(kv, envFor(), {}, bad);
  assert.equal(r1.telegram_status, 'FAILED');
  assert.equal(r1.persistence_status, 'PERSISTED_IN_KV');
  assert.ok((await signal.load(kv)).drafts[r1.post_id].body.length > 100);

  const { sent, f } = tgStub();
  const r2 = await signal.runLinkedinPostGenerator(kv, envFor(), {}, f);
  assert.equal(r2.run_id, r1.run_id);
  assert.equal(r2.telegram_status, 'SENT');
  assert.ok(sent.length >= 1);
});

test('dashboard endpoint serves the exact persisted record (and the case visual, not a generic one)', async () => {
  const env = mockEnv();
  const realFetch = globalThis.fetch;
  const { f } = tgStub();
  globalThis.fetch = f;
  try {
    const run = await worker.fetch(new Request(BASE + '/api/signal/run', { method: 'POST', headers: H_AUTH, body: '{}' }), env);
    const runJson = await run.json();
    const dash = await (await worker.fetch(new Request(BASE + '/api/signal/draft'), env)).json();
    const s = await signal.load(env.MEDIA);
    const saved = s.drafts[runJson.run.post_id];
    assert.equal(dash.state.draft.body, saved.body);
    assert.equal(dash.state.case_number, 1);
    assert.equal(dash.state.run.run_id, runJson.run.run_id);
    assert.equal(dash.state.visual.adobe_express_url, null);
    assert.ok(dash.state.visual.svg.includes('EASTMAN KODAK') || dash.state.visual.svg.includes('Eastman Kodak'));
    // load() must not overwrite the case visual with the generic matrix on later reads
    const again = await signal.load(env.MEDIA);
    assert.equal(again.drafts[runJson.run.post_id].visual.svg, saved.visual.svg);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('clean reset backs up state, clears used cases and shows NO_POST_GENERATED_YET', async () => {
  const kv = memKv();
  const { f } = tgStub();
  await signal.runLinkedinPostGenerator(kv, envFor(), {}, f);
  const clean = await signal.resetSignalState(kv);
  assert.equal(clean.status, 'NO_POST_GENERATED_YET');
  assert.deepEqual(clean.usedCaseNumbers, []);
  assert.deepEqual(clean.drafts, {});
  assert.equal(clean.latestRunId, null);
  assert.equal(clean.settings.publishMode, 'draft_only');
});

test('case bank: 100 cases, numbered 1..100, each with a source URL', async () => {
  const { CASE_BANK } = await import('../src/case_bank.mjs');
  assert.equal(CASE_BANK.length, 100);
  assert.deepEqual(CASE_BANK.map((c) => c.caseNumber), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.ok(CASE_BANK.every((c) => /^https?:\/\//.test(c.sourceUrl) && c.company && c.documentedProblem));
});

test('Adobe Express: configured run creates a real variation via the API (stubbed) and stores URN + URL', async () => {
  const kv = memKv();
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url); calls.push(u);
    const ok = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
    if (u.includes('api.telegram.org')) return ok({ ok: true });
    if (u.includes('adobelogin.com')) return ok({ access_token: 'tok', expires_in: 3600 });
    if (u.includes('/beta/tagged-documents/')) return ok({ id: 'T', documentPages: [{ taggedElements: [{ name: 'company', type: 'text' }, { name: 'problem', type: 'text' }, { name: 'photo', type: 'image' }] }] });
    if (u.endsWith('/beta/generate-variation')) {
      const b = JSON.parse(init.body);
      assert.deepEqual(Object.keys(b.variationDetails.tagMappings).sort(), ['company', 'problem']);
      assert.equal(b.variationDetails.tagMappings.company, 'Eastman Kodak');
      return ok({ jobId: 'J1', statusUrl: 'https://express-api.adobe.io/status/J1' });
    }
    if (u.includes('/status/J1')) return ok({ jobId: 'J1', status: 'succeeded', document: { id: 'urn:aaid:sc:EU:abc', name: 'x', thumbnailUrl: 'https://t/x.png' } });
    return { ok: false, status: 500, text: async () => 'unexpected', json: async () => ({}) };
  };
  const env = { ...envFor(), ADOBE_CLIENT_ID: 'id', ADOBE_CLIENT_SECRET: 's', ADOBE_EXPRESS_TEMPLATE_ID: 'urn:aaid:sc:EU:tmpl' };
  const r = await signal.runLinkedinPostGenerator(kv, env, {}, f);
  assert.equal(r.image_generation_status, 'ADOBE_EXPRESS_CREATED');
  assert.equal(r.adobe_express_project_id, 'urn:aaid:sc:EU:abc');
  assert.equal(r.adobe_express_url, 'https://express.adobe.com/id/urn:aaid:sc:EU:abc');
  assert.equal(r.generation_status, 'SUCCESS');
  assert.ok(calls.every((c) => !/canva/i.test(c)));
});

test('Adobe Express: API error is recorded, post kept, run is not SUCCESS', async () => {
  const kv = memKv();
  const f = async (url) => {
    const u = String(url);
    if (u.includes('api.telegram.org')) return { ok: true, json: async () => ({}) };
    return { ok: false, status: 401, text: async () => 'unauthorized', json: async () => ({}) };
  };
  const env = { ...envFor(), ADOBE_CLIENT_ID: 'id', ADOBE_CLIENT_SECRET: 's', ADOBE_EXPRESS_TEMPLATE_ID: 'T' };
  const r = await signal.runLinkedinPostGenerator(kv, env, {}, f);
  assert.equal(r.image_generation_status, 'ADOBE_EXPRESS_FAILED');
  assert.equal(r.adobe_express_url, null);
  assert.notEqual(r.generation_status, 'SUCCESS');
  assert.ok(r.error_details.includes('401'));
  assert.equal(r.persistence_status, 'PERSISTED_IN_KV');
});
