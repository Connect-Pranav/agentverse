#!/usr/bin/env node
// Linkedin_Post_Generator — Daily 09:30 IST Content Generation & Publishing Runner
// Integrated into PRANAV SIGNAL / Agentverse Architecture

import * as signal from '../mcp/src/signal.mjs';

async function main() {
  console.log('====================================================');
  console.log('⚡ Linkedin_Post_Generator — Execution Runner');
  console.log(`📅 Execution Date: ${new Date().toISOString()}`);
  console.log('====================================================');

  const mcpUrl = process.env.SV_MCP_URL || process.env.WORKER_URL;
  const mcpToken = process.env.SV_MCP_TOKEN || process.env.MCP_TOKEN;

  if (mcpUrl && mcpToken) {
    console.log(`🌐 Connecting to remote AgentVerse Worker: ${mcpUrl}`);
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
      console.log('✅ Remote Linkedin_Post_Generator Pipeline Completed:', JSON.stringify(data, null, 2));
      return;
    } catch (e) {
      console.warn('⚠️ Remote call failed, running in standalone memory mode:', e.message);
    }
  }

  // Standalone in-memory execution fallback
  console.log('🚀 Running Linkedin_Post_Generator pipeline locally...');
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

  const pipelineResult = await signal.runLinkedinPostGenerator(kv, env, { force: true });
  console.log('✅ Pipeline Execution Finished:');
  console.log(`   Topic: ${pipelineResult.item1_topicSelected.title}`);
  console.log(`   Framework: ${pipelineResult.item4_frameworkAnalysis.type}`);
  console.log(`   Word Count: ${pipelineResult.item6_finalLinkedInPost.wordCount} words`);
  console.log(`   Canva Link: ${pipelineResult.item9_canvaEditableLink.canvaEditUrl}`);
  console.log(`   Visual Asset: ${pipelineResult.item8_exportedAsset.endpoint}`);
  console.log(`   Approval Status: ${pipelineResult.item10_publishingResult.status}`);
  console.log('====================================================');
}

main().catch((err) => {
  console.error('❌ Pipeline run failed:', err);
  process.exit(1);
});

main().catch((err) => {
  console.error('❌ Pipeline run failed:', err);
  process.exit(1);
});
