// Pre-post engagement checker: before a new LinkedIn post is made, look at the previous post's comments,
// understand each one and answer it. Runs inside the Worker (no browser, no scraping): official LinkedIn API only.
// Reading comments needs LinkedIn's r_member_social permission. If the token does not have it, the report says so
// plainly (READ_NOT_ALLOWED) instead of pretending.
const KEY = 'signal/engagement';
const VERSION = '202610';
const BANNED = ['indiamart', 'justdial', 'magicbricks', 'magicpin'];
const MAX_REPLIES = 5;

export const sanitize = (t) => BANNED.reduce((x, w) => x.replace(new RegExp(`\\b${w}\\b`, 'gi'), 'a marketplace scaleup'), String(t || '')).trim();

/** urn:li:share:<id> / urn:li:activity:<id> from a LinkedIn post URL or urn. */
export function postUrnOf(post) {
  const v = String(post?.urn || post?.publishedUrn || '');
  const url = String(post?.url || post?.publishedUrl || '');
  const m = /urn:li:(share|activity|ugcPost):\d+/.exec(url) || /-(share|activity|ugcPost)-(\d{15,})/.exec(url);
  if (m) return m.length === 3 ? `urn:li:${m[1]}:${m[2]}` : m[0];
  return /^urn:li:(share|activity|ugcPost):\d+$/.test(v) ? v : null;
}

async function lastPublished(kv, env, state) {
  const mine = Object.values(state.drafts || {}).filter((d) => d.status === 'published' && (d.publishedUrn || d.publishedUrl))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
  if (mine) return { case_number: mine.case_number ?? mine.caseNumber, company: mine.company, urn: mine.publishedUrn, url: mine.publishedUrl };
  try { // posts made by hand before the pipeline took over are in the ledger file served with the site
    const r = env.ASSETS && await env.ASSETS.fetch(new Request('https://assets.local/data/backups/latest_published.json'));
    if (r?.ok) return await r.json();
  } catch { /* none */ }
  return null;
}

export async function loadReport(kv) { return (await kv.get(KEY, 'json')) ?? null; }

/**
 * @param ai  async (system, prompt) => text   (the Worker's cloud brain)
 */
export async function checkEngagement(kv, env, state, { ai, fetchImpl = fetch } = {}) {
  const report = { checked_at: new Date().toISOString(), status: 'NO_PREVIOUS_POST', post: null, comments_seen: 0, replies: [] };
  const done = new Set((await loadReport(kv))?.replied_ids ?? []);
  report.replied_ids = [...done];
  const post = await lastPublished(kv, env, state);
  const urn = post && postUrnOf(post);
  if (!urn) { await kv.put(KEY, JSON.stringify(report)); return report; }
  report.post = { case_number: post.case_number, company: post.company, urn, url: post.url || post.publishedUrl || null };

  const token = env.LINKEDIN_ACCESS_TOKEN || (await kv.get('signal/linkedin_token'));
  const actor = env.LINKEDIN_PERSON_URN || (await kv.get('signal/linkedin_person_urn'));
  if (!token || !actor) { report.status = 'LINKEDIN_NOT_CONNECTED'; await kv.put(KEY, JSON.stringify(report)); return report; }
  const headers = { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0', 'LinkedIn-Version': VERSION, 'Content-Type': 'application/json' };
  const base = `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(urn)}`;

  let list;
  try {
    const r = await fetchImpl(`${base}/comments?count=50`, { headers });
    if (r.status === 401 || r.status === 403) { report.status = 'READ_NOT_ALLOWED'; report.note = `LinkedIn refused reading comments (HTTP ${r.status}). The token needs the r_member_social permission.`; await kv.put(KEY, JSON.stringify(report)); return report; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    list = (await r.json()).elements ?? [];
  } catch (e) { report.status = 'READ_FAILED'; report.note = String(e?.message ?? e).slice(0, 160); await kv.put(KEY, JSON.stringify(report)); return report; }

  const comments = list.filter((c) => c.actor !== actor && !c.parentComment && c.message?.text);
  report.comments_seen = comments.length;
  report.status = 'CHECKED';
  for (const c of comments) {
    const id = c['$URN'] || c.id || c.commentUrn;
    if (!id || done.has(id) || report.replies.length >= MAX_REPLIES) continue;
    const entry = { comment_id: id, comment: String(c.message.text).slice(0, 400), kind: null, reply: null, posted: false };
    try {
      const out = await ai?.('You reply to comments on a senior business-operations leader\'s LinkedIn case-study post. Return ONLY JSON: {"kind":"question|agreement|challenge|praise|spam","reply":"..."}. Reply: max 2 sentences, specific to the comment, no hashtags, no emojis, never name any past employer. Use "" as reply for spam.',
        `Post: Case #${post.case_number} ${post.company}.\nComment: ${entry.comment}`);
      const j = JSON.parse(String(out).slice(String(out).indexOf('{'), String(out).lastIndexOf('}') + 1));
      entry.kind = j.kind; entry.reply = sanitize(j.reply);
    } catch (e) { entry.error = `analysis failed: ${String(e?.message ?? e).slice(0, 100)}`; report.replies.push(entry); continue; }
    if (entry.reply && entry.kind !== 'spam') {
      try {
        const r = await fetchImpl(`${base}/comments`, { method: 'POST', headers, body: JSON.stringify({ actor, message: { text: entry.reply }, parentComment: id, object: urn }) });
        entry.posted = r.ok; if (!r.ok) entry.error = `LinkedIn refused the reply (HTTP ${r.status})`;
        if (r.ok) done.add(id);
      } catch (e) { entry.error = String(e?.message ?? e).slice(0, 100); }
    }
    report.replies.push(entry);
  }
  report.replied_ids = [...done].slice(-200);
  await kv.put(KEY, JSON.stringify(report));
  return report;
}
