// Private lead CRM + outreach state (Foliocraft first). Lives only in the Worker's KV — never in the public repo.
// The GitHub runner (scripts/leadgen.py) finds and enriches leads, sends owner-approved emails via Gmail, and
// reports replies; the owner approves, edits or skips leads from AGENTVERSE or through the MCP tools.

const KEY = 'crm/state';
const MAX_LEADS = 500;
const STAGES = ['new', 'approved', 'sent', 'followed_up', 'replied', 'won', 'lost', 'skipped', 'unsubscribed', 'bounced', 'failed'];
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const clean = (s, max) => String(s ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const emailOk = (e) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(String(e || ''));

export class CrmError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function load(kv) {
  const s = (await kv.get(KEY, 'json')) ?? {};
  s.settings = { autoSend: true, dailyCap: 15, followupDays: 4, signature: '— Team Foliocraft', productUrl: '', ...(s.settings ?? {}) };
  s.leads = s.leads ?? {};
  s.suppress = s.suppress ?? [];
  s.sentLog = s.sentLog ?? [];
  return s;
}
async function save(kv, s) {
  const all = Object.values(s.leads);
  if (all.length > MAX_LEADS) { // drop the oldest closed/skipped leads first
    const order = (l) => (['skipped', 'lost', 'bounced', 'unsubscribed', 'failed'].includes(l.stage) ? 0 : l.stage === 'new' ? 1 : 2);
    all.sort((a, b) => order(a) - order(b) || String(a.updated).localeCompare(String(b.updated)));
    for (const l of all.slice(0, all.length - MAX_LEADS)) delete s.leads[l.id];
  }
  s.sentLog = s.sentLog.slice(-400);
  s.suppress = [...new Set(s.suppress)].slice(-2000);
  s.updatedAt = nowIso();
  await kv.put(KEY, JSON.stringify(s));
  return s;
}

const today = () => new Date().toISOString().slice(0, 10);
export function ownerView(s, limit = 120) {
  const leads = Object.values(s.leads).sort((a, b) => (STAGES.indexOf(a.stage) === 0 ? -1 : 0) - (STAGES.indexOf(b.stage) === 0 ? -1 : 0) || (b.score ?? 0) - (a.score ?? 0));
  const by = (st) => leads.filter((l) => l.stage === st).length;
  const sent = leads.filter((l) => l.sentAt);
  const variants = {};
  for (const l of sent) { const v = l.variant || 'A'; variants[v] = variants[v] || { sent: 0, replied: 0 }; variants[v].sent++; if (l.stage === 'replied' || l.reply) variants[v].replied++; }
  return {
    settings: s.settings,
    counts: { new: by('new'), approved: by('approved'), sent: by('sent') + by('followed_up'), replied: by('replied'), won: by('won'), total: leads.length },
    sent_today: s.sentLog.filter((x) => String(x.at).startsWith(today())).length,
    ab: variants,
    inbox: leads.filter((l) => l.reply).sort((a, b) => String(b.reply.at).localeCompare(String(a.reply.at))).slice(0, 20).map((l) => ({ id: l.id, name: l.name, email: l.email, snippet: l.reply.snippet, at: l.reply.at, thread: l.threadId ?? null })),
    leads: leads.slice(0, limit),
    last_run: s.lastRun ?? null, last_error: s.lastError ?? null, updated_at: s.updatedAt ?? null,
  };
}

export async function decide(kv, id, a) {
  const s = await load(kv);
  const l = s.leads[clean(id, 80)];
  if (!l) throw new CrmError(404, 'Unknown lead');
  const act = a.action;
  if (a.subject !== undefined) l.draft = { ...(l.draft ?? {}), subject: clean(a.subject, 140) };
  if (a.body !== undefined) l.draft = { ...(l.draft ?? {}), body: clean(a.body, 3000) };
  if (act === 'approve') {
    if (!emailOk(l.email)) throw new CrmError(400, 'This lead has no email — use the 1-tap buttons instead');
    if (s.suppress.includes(l.email.toLowerCase())) throw new CrmError(409, 'This address unsubscribed or bounced earlier');
    if (!clean(l.draft?.body, 3000)) throw new CrmError(400, 'Email text is empty');
    if (!['new', 'skipped', 'failed'].includes(l.stage)) throw new CrmError(409, `Lead is already ${l.stage}`);
    l.stage = 'approved';
  } else if (act === 'skip') l.stage = 'skipped';
  else if (act === 'won' || act === 'lost') l.stage = act;
  else if (act === 'unsubscribe') { l.stage = 'unsubscribed'; if (l.email) s.suppress.push(l.email.toLowerCase()); }
  else if (act !== 'edit') throw new CrmError(400, 'action must be approve, skip, edit, won, lost or unsubscribe');
  l.updated = nowIso();
  return save(kv, s);
}

export async function setSettings(kv, a) {
  const s = await load(kv);
  if (typeof a.autoSend === 'boolean') s.settings.autoSend = a.autoSend;
  if (Number(a.dailyCap) > 0) s.settings.dailyCap = Math.min(40, Math.round(Number(a.dailyCap)));
  if (Number(a.followupDays) > 0) s.settings.followupDays = Math.min(14, Math.round(Number(a.followupDays)));
  if (a.signature !== undefined) s.settings.signature = clean(a.signature, 120);
  if (a.productUrl !== undefined) s.settings.productUrl = /^https:\/\/\S+$/.test(String(a.productUrl)) || a.productUrl === '' ? clean(a.productUrl, 200) : s.settings.productUrl;
  return save(kv, s);
}

/** What the runner should do now. */
export async function runnerState(kv) {
  const s = await load(kv);
  const leads = Object.values(s.leads);
  const sentToday = s.sentLog.filter((x) => String(x.at).startsWith(today())).length;
  const room = s.settings.autoSend ? Math.max(0, s.settings.dailyCap - sentToday) : 0;
  const due = (l) => l.stage === 'sent' && !l.reply && l.sentAt && Date.now() - Date.parse(l.sentAt) > s.settings.followupDays * 864e5;
  return {
    settings: s.settings, known: leads.map((l) => l.id), suppress: s.suppress,
    to_send: leads.filter((l) => l.stage === 'approved' && emailOk(l.email)).slice(0, room).map((l) => ({ id: l.id, email: l.email, name: l.name, draft: l.draft, variant: l.variant })),
    followups: leads.filter(due).slice(0, Math.max(0, room)).map((l) => ({ id: l.id, email: l.email, name: l.name, draft: l.draft, threadId: l.threadId, messageId: l.messageId })),
    watch: leads.filter((l) => ['sent', 'followed_up'].includes(l.stage) && l.threadId).map((l) => ({ id: l.id, threadId: l.threadId, email: l.email })),
  };
}

export async function runnerReport(kv, r) {
  const s = await load(kv);
  const t = nowIso();
  if (r.error) s.lastError = { at: t, message: clean(r.error, 400) };
  for (const u of (Array.isArray(r.upserts) ? r.upserts : []).slice(0, 200)) {
    const id = clean(u.id, 80);
    if (!id) continue;
    const old = s.leads[id];
    if (old && old.stage !== 'new') continue; // never overwrite a lead the owner acted on
    const email = emailOk(u.email) ? String(u.email).toLowerCase() : '';
    if (email && s.suppress.includes(email)) continue;
    s.leads[id] = {
      id, product: clean(u.product, 40) || 'Foliocraft', source: clean(u.source, 60), url: clean(u.url, 400), posted: clean(u.posted, 40),
      name: clean(u.name, 80), email, phone: clean(u.phone, 30), company: clean(u.company, 100), industry: clean(u.industry, 80),
      location: clean(u.location, 80), website: clean(u.website, 200), linkedin: clean(u.linkedin, 200),
      score: Math.max(0, Math.min(100, Math.round(Number(u.score) || 0))), intent: clean(u.intent, 20), persona: clean(u.persona, 300), why: clean(u.why, 300),
      excerpt: clean(u.excerpt, 600),
      draft: { subject: clean(u.subject, 140), subject_b: clean(u.subject_b, 140), body: clean(u.body, 3000), followup: clean(u.followup, 1200) },
      variant: old?.variant || (Object.keys(s.leads).length % 2 ? 'B' : 'A'),
      stage: 'new', created: old?.created || t, updated: t,
    };
  }
  for (const x of Array.isArray(r.sent) ? r.sent : []) {
    const l = s.leads[clean(x.id, 80)]; if (!l) continue;
    const follow = Boolean(x.followup);
    Object.assign(l, { stage: follow ? 'followed_up' : 'sent', threadId: clean(x.threadId, 40) || l.threadId, messageId: clean(x.messageId, 200) || l.messageId, updated: t });
    if (follow) l.followedAt = t; else l.sentAt = t;
    s.sentLog.push({ id: l.id, at: t, followup: follow });
  }
  for (const x of Array.isArray(r.replies) ? r.replies : []) {
    const l = s.leads[clean(x.id, 80)]; if (!l) continue;
    l.reply = { snippet: clean(x.snippet, 400), at: clean(x.at, 40) || t };
    l.stage = x.unsubscribe ? 'unsubscribed' : 'replied';
    if (x.unsubscribe && l.email) s.suppress.push(l.email);
    l.updated = t;
  }
  for (const x of Array.isArray(r.bounced) ? r.bounced : []) {
    const l = s.leads[clean(x.id, 80)]; if (!l) continue;
    l.stage = 'bounced'; if (l.email) s.suppress.push(l.email); l.updated = t;
  }
  for (const x of Array.isArray(r.failed) ? r.failed : []) {
    const l = s.leads[clean(x.id, 80)]; if (!l) continue;
    l.stage = 'failed'; l.error = clean(x.error, 300); l.updated = t;
  }
  s.lastRun = t;
  if (!r.error) s.lastError = null;
  return save(kv, s);
}
