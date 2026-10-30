// SUNVERSE growth agent state (YouTube): channel stats, new public subscribers, AI comment replies.
// The GitHub runner (scripts/growth-runner.py) does the YouTube API work and reports here; the owner
// approves non-simple replies from the AGENTVERSE dashboard or through the MCP tools.

const KEY = 'growth/state';
const MAX_REPLIES = 200;
const MAX_SEEN = 3000;
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const clean = (s, max) => String(s ?? '').replace(/\u0000/g, '').trim().slice(0, max);

export class GrowthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function load(kv) {
  const s = (await kv.get(KEY, 'json')) ?? {};
  s.settings = { autoSimple: true, ...(s.settings ?? {}) };
  s.replies = s.replies ?? {};
  s.seen = s.seen ?? [];
  s.newSubs = s.newSubs ?? [];
  s.subsHistory = s.subsHistory ?? [];
  return s;
}
async function save(kv, s) {
  const list = Object.values(s.replies).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  // keep every reply still waiting for the owner, then the newest of the rest
  const keep = list.filter((r) => r.state === 'waiting' || r.state === 'approved').concat(list.filter((r) => r.state !== 'waiting' && r.state !== 'approved')).slice(0, MAX_REPLIES);
  s.replies = Object.fromEntries(keep.map((r) => [r.cid, r]));
  s.seen = s.seen.slice(-MAX_SEEN);
  s.newSubs = s.newSubs.slice(0, 60);
  s.subsHistory = s.subsHistory.slice(-120);
  s.updatedAt = nowIso();
  await kv.put(KEY, JSON.stringify(s));
  return s;
}

export function ownerView(s) {
  const replies = Object.values(s.replies).sort((a, b) => (a.state === 'waiting' ? -1 : 0) - (b.state === 'waiting' ? -1 : 0) || String(b.at).localeCompare(String(a.at)));
  const today = new Date().toISOString().slice(0, 10);
  const week = s.subsHistory.filter((h) => Date.parse(h.d) >= Date.now() - 7 * 864e5);
  return {
    connected: Boolean(s.channel), channel: s.channel ?? null, settings: s.settings,
    subs_7d: week.length >= 2 ? week[week.length - 1].subs - week[0].subs : null,
    new_subscribers: s.newSubs.slice(0, 30),
    waiting: replies.filter((r) => r.state === 'waiting').length,
    posted_today: replies.filter((r) => r.state === 'posted' && String(r.posted_at ?? '').startsWith(today)).length,
    replies: replies.slice(0, 40),
    last_run: s.lastRun ?? null, last_error: s.lastError ?? null, updated_at: s.updatedAt ?? null,
  };
}

export async function setSettings(kv, a) {
  const s = await load(kv);
  if (typeof a.autoSimple === 'boolean') s.settings.autoSimple = a.autoSimple;
  return save(kv, s);
}

export async function decideReply(kv, cid, a) {
  const s = await load(kv);
  const r = s.replies[clean(cid, 80)];
  if (!r) throw new GrowthError(404, 'Unknown comment');
  if (!['waiting', 'failed'].includes(r.state)) throw new GrowthError(409, `Reply is ${r.state}`);
  if (a.action === 'reject') r.state = 'rejected';
  else if (a.action === 'approve') {
    const d = clean(a.draft ?? r.draft, 800);
    if (!d) throw new GrowthError(400, 'Reply text is empty');
    if (/https?:\/\//i.test(d) && !a.allowLink) throw new GrowthError(400, 'Remove the link (YouTube treats link replies as spam)');
    Object.assign(r, { draft: d, state: 'approved', error: null });
  } else throw new GrowthError(400, 'action must be approve or reject');
  r.decided_at = nowIso();
  return save(kv, s);
}

export async function runnerState(kv) {
  const s = await load(kv);
  return {
    settings: s.settings, seen: s.seen, known_subs: s.newSubs.map((x) => x.id),
    approved: Object.values(s.replies).filter((r) => r.state === 'approved').map((r) => ({ cid: r.cid, thread_id: r.thread_id, draft: r.draft })),
  };
}

export async function runnerReport(kv, a) {
  const s = await load(kv);
  const t = nowIso();
  if (a.error) s.lastError = { at: t, message: clean(a.error, 400) };
  if (a.channel) {
    s.channel = { id: clean(a.channel.id, 40), title: clean(a.channel.title, 120), subs: Number(a.channel.subs) || 0, views: Number(a.channel.views) || 0, videos: Number(a.channel.videos) || 0, hidden_subs: Boolean(a.channel.hidden_subs), at: t };
    const d = t.slice(0, 13);
    const last = s.subsHistory[s.subsHistory.length - 1];
    if (!last || last.d.slice(0, 13) !== d) s.subsHistory.push({ d: t, subs: s.channel.subs });
    else last.subs = s.channel.subs;
    s.lastError = a.error ? s.lastError : null;
  }
  for (const n of (Array.isArray(a.new_subs) ? a.new_subs : []).slice(0, 50)) {
    const id = clean(n.id, 40);
    if (!id || s.newSubs.some((x) => x.id === id)) continue;
    s.newSubs.unshift({ id, name: clean(n.name, 80), url: `https://www.youtube.com/channel/${id}`, at: t });
  }
  for (const d of (Array.isArray(a.drafts) ? a.drafts : []).slice(0, 50)) {
    const cid = clean(d.cid, 80);
    if (!cid || s.replies[cid]) continue;
    const kind = ['simple', 'needs_ok', 'skip'].includes(d.kind) ? d.kind : 'needs_ok';
    s.replies[cid] = {
      cid, thread_id: clean(d.thread_id || cid, 80), author: clean(d.author, 80), text: clean(d.text, 1000), video_id: clean(d.video_id, 20), video_title: clean(d.video_title, 120),
      draft: clean(d.reply, 800), kind, state: kind === 'skip' ? 'skipped' : (d.posted ? 'posted' : 'waiting'), posted_at: d.posted ? t : null, at: t,
    };
  }
  for (const id of (Array.isArray(a.seen) ? a.seen : [])) { const c = clean(id, 80); if (c && !s.seen.includes(c)) s.seen.push(c); }
  for (const p of (Array.isArray(a.posted) ? a.posted : [])) { const r = s.replies[clean(p.cid, 80)]; if (r) Object.assign(r, { state: 'posted', posted_at: t, error: null }); }
  for (const f of (Array.isArray(a.failed) ? a.failed : [])) { const r = s.replies[clean(f.cid, 80)]; if (r) Object.assign(r, { state: 'failed', error: clean(f.error, 300) }); }
  s.lastRun = t;
  return save(kv, s);
}
