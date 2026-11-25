import { runLinkedinPostGenerator, load } from '../mcp/src/signal.mjs';

const mem = new Map();
const kv = {
  get: async (k) => mem.get(k) || null,
  put: async (k, v) => mem.set(k, v)
};

async function run() {
  const result = await runLinkedinPostGenerator(kv, {}, { new_case: true, case_number: 2 });
  console.log('=== RUN RESULT ===');
  console.log(JSON.stringify(result, null, 2));
  const st = await load(kv);
  const draft = Object.values(st.drafts)[0];
  console.log('=== GENERATED DRAFT FOR CASE #2 ===');
  console.log(draft.content);
}

run().catch(console.error);
