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
  assert.equal(runData.status, 'waiting_approval');

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
