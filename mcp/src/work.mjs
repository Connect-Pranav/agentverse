// AGENTVERSE 24/7 Work Store: Real-time Cloudflare KV persistence for agent outputs.
// Replaces git-commit churn with instantaneous, live database synchronization.
import * as telegram from './telegram.mjs';

const KEY = 'work/data';
const MAX_ITEMS = 200;
const MAX_TOPICS = 30;

export async function load(kv) {
  const d = await kv.get(KEY, 'json');
  return d || { items: [], cycles: 0, topics: [], updated: null, last: null };
}

export async function save(kv, data) {
  await kv.put(KEY, JSON.stringify(data));
  return data;
}

export async function upsert(kv, env, payload, fetchImpl = fetch) {
  const current = await load(kv);
  const now = new Date().toISOString();
  const brand = String(payload.brand || 'General');
  const topic = String(payload.topic || 'General Updates').slice(0, 100);
  const newItems = Array.isArray(payload.items) ? payload.items : [];

  const formatted = [];
  for (const it of newItems) {
    if (!it || !it.body) continue;
    const id = it.id || `sv_${Math.random().toString(36).slice(2, 8)}`;
    const item = {
      id,
      brand,
      dept: it.dept || 'Content Engine',
      title: String(it.title || it.dept).slice(0, 120),
      body: String(it.body).slice(0, 2000),
      status: it.status || (it.needs_approval ? 'waiting' : 'ready'),
      lead_id: it.lead_id || null,
      url: it.url || undefined,
      topic,
      ts: it.ts || Date.now(),
      server: true,
      brain: String(payload.brain || payload.model || 'Agentverse Cloud'),
    };
    formatted.push(item);

    // If item needs human review, dispatch instant Telegram notification
    if (item.status === 'waiting') {
      try {
        await telegram.notifyApproval(env, {
          id: item.id,
          type: 'work',
          title: item.title,
          brand,
          summary: `${item.dept}: ${item.body.slice(0, 140)}...`,
        }, fetchImpl);
      } catch (e) {
        console.error('[work] Telegram notify failed:', e?.message);
      }
    }
  }

  // Merge items (newest first, unique by id)
  const existingMap = new Map((current.items || []).map((x) => [x.id, x]));
  for (const it of formatted) {
    existingMap.set(it.id, it);
  }
  const mergedItems = Array.from(existingMap.values())
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, MAX_ITEMS);

  const topics = [topic, ...(current.topics || [])].filter((t, i, arr) => t && arr.indexOf(t) === i).slice(0, MAX_TOPICS);
  const cycles = (current.cycles || 0) + 1;

  const updatedData = {
    items: mergedItems,
    cycles,
    topics,
    updated: now,
    last: {
      brand,
      topic,
      why: payload.why || '',
      summary: payload.summary || '',
      model: payload.model || '',
      brain: payload.brain || '',
      count: formatted.length,
    },
  };

  await save(kv, updatedData);
  return updatedData;
}

export async function decide(kv, id, action) {
  const current = await load(kv);
  const item = (current.items || []).find((x) => x.id === id);
  if (!item) throw new Error(`Work item "${id}" not found`);

  item.status = action === 'approve' ? 'ready' : 'rejected';
  item.decidedAt = new Date().toISOString();

  await save(kv, current);
  return { success: true, item, message: action === 'approve' ? 'Approved & Ready to Post' : 'Draft Rejected' };
}
