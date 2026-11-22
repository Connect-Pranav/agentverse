#!/usr/bin/env node
// PRANAV SIGNAL — Daily 08:00 IST LinkedIn Growth Studio Runner
// Orchestrates 9 specialist agents:
// 1. LinkedIn Profile Analyst
// 2. Domain Leader Intelligence
// 3. Global AI & Market Scout
// 4. Signal & Topic Strategist
// 5. Pranav Voice & POV Agent
// 6. LinkedIn Copywriter
// 7. Visual Creative Agent
// 8. Fact-check & Brand Guardian
// 9. Publisher & Performance Analyst

import * as signal from '../mcp/src/signal.mjs';

async function main() {
  console.log('====================================================');
  console.log('⚡ PRANAV SIGNAL — LinkedIn Growth Studio Runner');
  console.log(`📅 Execution Date: ${new Date().toISOString()}`);
  console.log('====================================================');

  const mcpUrl = process.env.SV_MCP_URL || process.env.WORKER_URL;
  const mcpToken = process.env.SV_MCP_TOKEN || process.env.MCP_TOKEN;

  if (mcpUrl && mcpToken) {
    console.log(`🌐 Connecting to remote AgentVerse Worker: ${mcpUrl}`);
    // Remote execution via API
    try {
      const res = await fetch(`${mcpUrl.replace(/\/+$/, '')}/api/signal/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mcpToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trigger: 'scheduled_runner', time: new Date().toISOString() }),
      });
      const data = await res.json();
      console.log('✅ Remote Signal Pipeline Completed:', JSON.stringify(data, null, 2));
      return;
    } catch (e) {
      console.warn('⚠️ Remote call failed, running in standalone memory mode:', e.message);
    }
  }

  // Standalone in-memory execution fallback
  console.log('🚀 Running Signal Orchestrator pipeline locally...');
  const memKvStore = new Map();
  const kv = {
    get: async (k, type) => {
      const v = memKvStore.get(k);
      if (!v) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    put: async (k, v) => memKvStore.set(k, typeof v === 'string' ? v : JSON.stringify(v)),
  };

  const env = {
    MCP_TOKEN: mcpToken || 'local_token',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    LINKEDIN_ACCESS_TOKEN: process.env.LINKEDIN_ACCESS_TOKEN,
    LINKEDIN_PERSON_URN: process.env.LINKEDIN_PERSON_URN,
  };

  // Step 1: Profile audit
  console.log('[1/8] Running LinkedIn Profile Analyst...');
  const audit = await signal.auditProfile(kv);
  console.log(`      ✓ Profile analyzed: ${audit.profile.name} (${audit.profile.coreDomains.length} domains)`);

  // Step 2 & 3: Market scan & benchmarks
  console.log('[2/8] Scanning Global AI & Market developments...');
  const news = await signal.scanGlobalAiMarket(kv);
  console.log(`      ✓ Scanned ${news.count} market developments.`);

  console.log('[3/8] Benchmarking Domain Leaders & Hook Patterns...');
  const patterns = await signal.analyseBenchmarkPatterns(kv);
  console.log(`      ✓ Analyzed ${patterns.profilesCount} benchmark operators.`);

  // Step 4: Rank signals
  console.log('[4/8] Ranking Daily Signals...');
  const ranking = await signal.rankDailySignal(kv);
  console.log(`      ✓ Top Signal: "${ranking.topSignal.title}" (Score: ${ranking.topSignal.score})`);

  // Step 5 & 6: Operator POV & Copywriting
  console.log('[5/8] Synthesizing Pranav Operator POV & Drafting Post...');
  const draft = await signal.draftLinkedInPost(kv, ranking.topSignal.id);
  console.log(`      ✓ Draft post generated (${draft.characterCount} characters).`);

  // Step 7: Visual generation
  console.log('[6/8] Generating 1200x627 Landscape LinkedIn Graphic...');
  const visual = await signal.createLinkedInVisual(kv, draft.id);
  console.log(`      ✓ Branded graphic generated: ${visual.width}x${visual.height} (${visual.aspectRatio}).`);

  // Step 8: Fact-check & Quality check
  console.log('[7/8] Running Fact-check & Brand Voice Guardian...');
  const check = await signal.checkPostQuality(kv, draft.id);
  console.log(`      ✓ Quality Score: ${check.overallScore}/100 (Passed: ${check.passed})`);

  // Step 9: Submit to AgentVerse Approval Queue
  console.log('[8/8] Submitting to AgentVerse Work Board & Telegram Queue...');
  const sub = await signal.submitForApproval(kv, env, draft.id);
  console.log(`      ✓ Submitted successfully. Status: ${sub.status}`);

  console.log('====================================================');
  console.log('🎉 PRANAV SIGNAL run complete! Post is waiting for human approval.');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('❌ Pipeline run failed:', err);
  process.exit(1);
});
