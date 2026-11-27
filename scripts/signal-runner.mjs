#!/usr/bin/env node
// Linkedin_Post_Generator — daily 09:30 IST runner (GitHub Actions cron).
// Calls the DEPLOYED Worker so the run is written to the same KV the dashboard reads.
// It never falls back to an in-memory store: a run that is not persisted must fail loudly.

const CANDIDATES = ['https://agentverse.pravanigroup.workers.dev', 'https://agentverse.aistudio09.workers.dev'];
let mcpUrl = (process.env.SV_MCP_URL || process.env.WORKER_URL || '').replace(/\/+$/, '');
let mcpToken = process.env.SV_MCP_TOKEN || process.env.MCP_TOKEN || '';

// No repo variable or secret needed: find the Worker by /health and use the GitHub Actions OIDC token.
async function discover() {
  if (!mcpUrl) {
    for (const c of CANDIDATES) {
      try { const h = await (await fetch(`${c}/health`)).json(); if (h.app === 'agentverse') { mcpUrl = c; break; } } catch { /* try next */ }
    }
  }
  if (!mcpToken && process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    const u = `${process.env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=agentverse`;
    const r = await fetch(u, { headers: { Authorization: `bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
    if (r.ok) mcpToken = (await r.json()).value;
  }
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function main() {
  console.log(`⚡ Linkedin_Post_Generator — ${new Date().toISOString()}`);
  await discover();
  if (!mcpUrl) fail('No AGENTVERSE Worker answered /health. Refusing to run without the deployed Worker: a local run would not persist anything the dashboard can show.');
  if (!mcpToken) fail('No credentials: run on GitHub Actions with id-token: write, or set SV_MCP_TOKEN.');

  const res = await fetch(`${mcpUrl}/api/signal/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mcpToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'scheduled_runner', time: new Date().toISOString() }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { fail(`Worker returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`); }
  if (!res.ok) fail(`Worker returned HTTP ${res.status}: ${text.slice(0, 300)}`);

  const r = data.run || {};
  console.log(JSON.stringify({
    run_id: r.run_id, post_id: r.post_id, case_number: r.case_number, company: r.company,
    generation_status: r.generation_status, persistence_status: r.persistence_status,
    telegram_status: r.telegram_status, image_generation_status: r.image_generation_status,
    error_details: r.error_details,
  }, null, 2));

  // Persisted + draft present is the minimum; visual/Telegram problems are reported but keep the saved post.
  if (r.persistence_status !== 'PERSISTED_IN_KV') fail('Run was not persisted.');
  if (r.generation_status !== 'SUCCESS') console.warn(`⚠️ Run finished as ${r.generation_status}: ${r.error_details}`);
}

main().catch((e) => fail(`Pipeline run failed: ${e.message}`));
