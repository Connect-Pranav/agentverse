// Code Doctor + Automation Control Center.
// Two sources of truth, never guessed:
//   1. Runtime checks the Worker can make itself (secrets present, cron alive, queues, blocked logins).
//   2. The code scan report uploaded by .github/workflows/doctor.yml (syntax, tests, secret scan, live UI check).
// Statuses: pass | warn | fail | info. Nothing is marked healthy without a check behind it.
import * as signal from './signal.mjs';
import { nextSlot, fmtIst } from './post_schedule.mjs';
import { DESIGN_ID } from './editorial_templates.mjs';

const REPO = 'Connect-Pranav/agentverse';
const HISTORY_MAX = 40;
const ago = (ms) => (ms < 90e3 ? `${Math.round(ms / 1e3)}s` : ms < 90 * 60e3 ? `${Math.round(ms / 60e3)} min` : ms < 48 * 3600e3 ? `${Math.round(ms / 3600e3)} h` : `${Math.round(ms / 86400e3)} days`);

// GitHub Actions runs (public repo): one request, cached 10 minutes.
export async function githubRuns(env, kv, { fresh = false, fetchImpl = fetch } = {}) {
  const cached = await kv.get('doctor/gh-runs', 'json');
  if (cached && !fresh && Date.now() - Date.parse(cached.at) < 10 * 60e3) return cached;
  try {
    const headers = { 'user-agent': 'agentverse-doctor', accept: 'application/vnd.github+json' };
    if (env.GH_DISPATCH_TOKEN) headers.authorization = `Bearer ${env.GH_DISPATCH_TOKEN}`;
    const r = await fetchImpl(`https://api.github.com/repos/${REPO}/actions/runs?per_page=80`, { headers });
    if (!r.ok) throw new Error(`GitHub API HTTP ${r.status}`);
    const d = await r.json();
    const latest = {};
    for (const run of d.workflow_runs || []) {
      const file = String(run.path || '').split('/').pop();
      if (!file) continue;
      latest[file] ??= { status: run.status, conclusion: run.conclusion, at: run.updated_at || run.created_at, url: run.html_url, event: run.event, lastSuccess: null, failuresInRow: 0 };
      const L = latest[file];
      if (run.conclusion === 'success' && !L.lastSuccess) L.lastSuccess = run.updated_at;
      if (!L.lastSuccess && run.conclusion === 'failure') L.failuresInRow++;
    }
    const out = { at: new Date().toISOString(), ok: true, latest };
    await kv.put('doctor/gh-runs', JSON.stringify(out), { expirationTtl: 86400 });
    return out;
  } catch (e) {
    return { at: cached?.at || null, ok: false, error: String(e?.message || e).slice(0, 160), latest: cached?.latest || {} };
  }
}

const ghState = (run, { paused = false, needs = '' } = {}) => {
  if (needs) return 'config_required';
  if (paused) return 'paused';
  if (!run) return 'idle';
  if (run.status === 'in_progress' || run.status === 'queued') return 'running';
  if (run.conclusion === 'success') return 'completed';
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out') return run.failuresInRow >= 3 ? 'needs_attention' : 'failed';
  if (run.conclusion === 'cancelled' || run.conclusion === 'skipped') return 'idle';
  return 'idle';
};

// Every automation with its real state.
export async function automations(env, kv, { gh = null, now = Date.now() } = {}) {
  gh = gh || await githubRuns(env, kv);
  const L = gh.latest || {};
  const hb = await kv.get('system/heartbeat', 'json');
  const sig = await signal.load(kv);
  const drafts = Object.values(sig.drafts || {});
  const scheduled = drafts.filter((d) => d.status === 'scheduled').sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor));
  const waiting = drafts.find((d) => d.status === 'waiting_approval' || d.status === 'draft');
  const latestRun = sig.latestRunId ? sig.runs?.[sig.latestRunId] : null;
  const ytBlocked = await kv.get('sv/youtube-auth-blocked', 'json');
  const eng = await kv.get('signal/engagement', 'json');
  const hbAge = hb ? now - Date.parse(hb.at) : Infinity;
  const nextGh = (cron) => cron; // shown as text; GitHub owns the timing
  const A = [
    { id: 'heartbeat', name: 'Worker heartbeat', dept: 'Orchestrator', trigger: 'Cloudflare cron', schedule: 'every 10 min',
      state: hbAge < 25 * 60e3 ? 'completed' : 'needs_attention', last: hb?.at || null, error: hbAge < 25 * 60e3 ? null : 'No heartbeat in the last 25 minutes', output: 'KV system/heartbeat' },
    { id: 'linkedin_draft', name: 'Linkedin_Post_Generator (draft)', dept: 'Content', trigger: 'Worker cron + signal.yml', schedule: 'Wed & Fri 09:30 IST',
      state: waiting ? 'needs_attention' : latestRun?.generation_status === 'FAILED' ? 'failed' : 'scheduled',
      last: latestRun?.started_at || latestRun?.created_at || null, next: fmtIst(nextSlot('linkedin', new Date(now - 6.5 * 3600e3))).replace(/\d+:\d+ (AM|PM)/, '9:30 AM'),
      error: waiting ? `Draft ${waiting.id} is waiting for your approval` : (L['signal.yml']?.conclusion === 'failure' ? 'Last signal.yml run failed' : null), output: 'LinkedIn tab, Telegram' },
    { id: 'linkedin_publish', name: 'LinkedIn publish at slot', dept: 'Publishing', trigger: 'Worker cron', schedule: 'Wed 4:00 PM, Fri 3:30 PM IST',
      state: scheduled.some((d) => Date.parse(d.scheduledFor) < now - 30 * 60e3) ? 'failed' : scheduled.length ? 'scheduled' : 'idle',
      next: scheduled[0] ? fmtIst(Date.parse(scheduled[0].scheduledFor)) : null, last: drafts.filter((d) => d.status === 'published').map((d) => d.publishedAt).sort().pop() || null,
      error: scheduled.some((d) => Date.parse(d.scheduledFor) < now - 30 * 60e3) ? 'A scheduled post is more than 30 min overdue' : null, output: 'LinkedIn profile' },
    { id: 'engagement', name: 'LinkedIn comment checker', dept: 'Community', trigger: 'Before each new draft', schedule: 'with the draft',
      state: !eng ? 'idle' : eng.status === 'READ_NOT_ALLOWED' ? 'config_required' : eng.status === 'READ_FAILED' ? 'failed' : 'completed',
      last: eng?.checked_at || eng?.at || null, error: eng?.status === 'READ_NOT_ALLOWED' ? 'LinkedIn token lacks r_member_social (read comments)' : null, output: 'KV signal/engagement' },
    { id: 'motion', name: 'Animated GIF + video clip', dept: 'Creative', trigger: 'signal-gif.yml', schedule: 'hourly at :25',
      state: ghState(L['signal-gif.yml']), last: L['signal-gif.yml']?.at || null, url: L['signal-gif.yml']?.url, output: 'Dashboard downloads, Telegram' },
    { id: 'song_render', name: 'Sunverse song → video', dept: 'Music', trigger: 'songvideo.yml (+ Worker wake-up)', schedule: 'every 15 min',
      state: ghState(L['songvideo.yml']), last: L['songvideo.yml']?.at || null, url: L['songvideo.yml']?.url,
      error: env.GH_DISPATCH_TOKEN ? null : 'GH_DISPATCH_TOKEN not set: the Worker cannot wake the renderer, it waits for GitHub cron', output: 'Song Studio' },
    { id: 'youtube_post', name: 'YouTube auto-post', dept: 'Publishing', trigger: 'Song schedule', schedule: 'Sunday 10:00 AM IST',
      state: ytBlocked ? 'needs_attention' : 'scheduled', next: fmtIst(nextSlot('youtube_long', new Date(now))),
      error: ytBlocked ? `YouTube login expired (${ytBlocked.error || 'invalid_grant'}): renew YT_REFRESH_TOKEN` : null, last: ytBlocked?.at || null, output: 'YouTube channel' },
    { id: 'youtube_shorts', name: 'YouTube Shorts', dept: 'Publishing', trigger: 'After a song is posted', schedule: 'Thu 7 PM, Fri 6:30 PM, Sat 7:30 PM IST',
      state: ytBlocked ? 'needs_attention' : 'scheduled', next: fmtIst(nextSlot('youtube_short', new Date(now))), error: ytBlocked ? 'Blocked by the expired YouTube login' : null, output: 'YouTube Shorts' },
    { id: 'growth', name: 'Sunverse YouTube growth', dept: 'Growth', trigger: 'growth.yml', schedule: 'hourly at :27',
      state: ghState(L['growth.yml']), last: L['growth.yml']?.at || null, url: L['growth.yml']?.url, output: 'Growth tile' },
    { id: 'leadgen', name: 'Foliocraft lead generation', dept: 'Sales', trigger: 'leadgen.yml', schedule: 'hourly at :07',
      state: ghState(L['leadgen.yml']), last: L['leadgen.yml']?.at || null, url: L['leadgen.yml']?.url, output: 'Leads / CRM' },
    { id: 'agents', name: 'Agent team cycle', dept: 'Orchestrator', trigger: 'agents.yml', schedule: 'every 2 h at :41',
      state: ghState(L['agents.yml']), last: L['agents.yml']?.at || null, url: L['agents.yml']?.url, output: 'Work board' },
    { id: 'reddit_leads', name: 'Reddit lead scraper', dept: 'Sales', trigger: 'leads.yml (manual only)', schedule: 'stopped 28 Nov 2026',
      state: 'paused', last: L['leads.yml']?.at || null, output: 'Leads' },
    { id: 'doctor', name: 'Code Doctor scan', dept: 'Engineering', trigger: 'doctor.yml', schedule: 'on every push + daily 06:00 IST',
      state: ghState(L['doctor.yml']), last: L['doctor.yml']?.at || null, url: L['doctor.yml']?.url, output: 'Code Doctor' },
  ];
  for (const a of A) a.next ??= a.schedule;
  void nextGh;
  return { github: { ok: gh.ok, at: gh.at, error: gh.error || null }, heartbeat: hb || null, automations: A };
}

function check(id, area, title, status, detail, fix = null, repair = null) { return { id, area, title, status, detail, fix, repair }; }

// Live runtime checks (no secrets are ever returned, only whether they are set).
export async function runtimeChecks(env, kv, { now = Date.now() } = {}) {
  const C = [];
  const hb = await kv.get('system/heartbeat', 'json');
  const age = hb ? now - Date.parse(hb.at) : Infinity;
  C.push(age < 25 * 60e3 ? check('cron', 'Automation', 'Worker cron is running', 'pass', `last tick ${ago(age)} ago`)
    : check('cron', 'Automation', 'Worker cron is not running', 'fail', hb ? `last tick ${ago(age)} ago` : 'never ran', 'Check the "triggers.crons" entry in wrangler.jsonc and the Cloudflare dashboard'));
  C.push(env.MCP_TOKEN ? check('owner_token', 'Security', 'Owner/runner token is set', 'pass', 'MCP_TOKEN present')
    : check('owner_token', 'Security', 'MCP_TOKEN is not set', 'fail', 'owner routes are locked', 'Set the MCP_TOKEN secret on the Worker'));
  C.push(env.TELEGRAM_BOT_TOKEN ? check('telegram', 'Security', 'Telegram bot token comes from a secret', 'pass', 'TELEGRAM_BOT_TOKEN set')
    : check('telegram', 'Security', 'Telegram bot token is hard-coded in public code', 'fail', 'mcp/src/telegram.mjs falls back to a token in the repository', 'Revoke it in BotFather, set TELEGRAM_BOT_TOKEN on the Worker, then remove the fallback'));
  C.push(env.GH_DISPATCH_TOKEN ? check('gh_dispatch', 'Automation', 'Worker can start GitHub runners', 'pass', 'GH_DISPATCH_TOKEN set')
    : check('gh_dispatch', 'Automation', 'Worker cannot start GitHub runners', 'warn', 'renders, scans and posts wait for GitHub cron (up to an hour, often throttled)', 'Create a fine-grained token with Actions: write on Connect-Pranav/agentverse and set GH_DISPATCH_TOKEN'));
  const yt = await kv.get('sv/youtube-auth-blocked', 'json');
  C.push(yt ? check('youtube_auth', 'Integrations', 'YouTube login expired', 'fail', `${String(yt.error || '').slice(0, 120)} (since ${ago(now - Date.parse(yt.at))} ago)`, 'Run scripts/yt-refresh-token.py, update YT_REFRESH_TOKEN, then tap Retry YouTube now')
    : check('youtube_auth', 'Integrations', 'No YouTube login error recorded', 'pass', 'posting is not blocked'));
  const li = env.LINKEDIN_ACCESS_TOKEN || await kv.get('signal/linkedin_token');
  C.push(li ? check('linkedin', 'Integrations', 'LinkedIn is connected', 'pass', 'posting token present')
    : check('linkedin', 'Integrations', 'LinkedIn is not connected', 'warn', 'posts stay draft / copy only', 'Connect LinkedIn from the Signal tab'));
  const providers = [['Groq', env.GROQ_API_KEY], ['Gemini', env.GEMINI_API_KEY], ['OpenRouter', env.OPENROUTER_API_KEY], ['Workers AI', env.AI]].filter((p) => p[1]).map((p) => p[0]);
  C.push(providers.length ? check('ai', 'Brain', `${providers.length} AI provider(s) configured`, providers.length > 1 ? 'pass' : 'warn', providers.join(', ') + ' (+ Pollinations free fallback)', providers.length > 1 ? null : 'Add a second key so the Brain can fall back')
    : check('ai', 'Brain', 'No server-side AI provider', 'fail', 'agents fall back to the free Pollinations text model only', 'Set GROQ_API_KEY or GEMINI_API_KEY'));
  const sig = await signal.load(kv);
  const drafts = Object.values(sig.drafts || {});
  const overdue = drafts.filter((d) => d.status === 'scheduled' && Date.parse(d.scheduledFor) < now - 30 * 60e3);
  C.push(overdue.length ? check('li_overdue', 'Automation', `${overdue.length} LinkedIn post(s) missed their slot`, 'fail', overdue.map((d) => d.id).join(', '), 'Try publishing them now', 'publish_overdue_linkedin')
    : check('li_overdue', 'Automation', 'No LinkedIn post is overdue', 'pass', 'scheduler on time'));
  const waiting = drafts.filter((d) => ['waiting_approval', 'draft'].includes(d.status));
  if (waiting.length) C.push(check('li_waiting', 'Workflow', `${waiting.length} LinkedIn draft(s) waiting for approval`, 'info', waiting.map((d) => d.id).join(', '), 'Approve or reject it in the Signal tab or Telegram; new drafts pause until then'));
  const stale = drafts.filter((d) => d.status !== 'published' && d.visual?.svg && /data-design="bi-editorial-/.test(d.visual.svg) && !d.visual.svg.includes(`data-design="${DESIGN_ID}"`));
  C.push(stale.length ? check('visual_stale', 'Content', `${stale.length} draft visual(s) use an old layout`, 'warn', stale.map((d) => d.id).join(', '), 'Re-render them', 'refresh_visuals')
    : check('visual_stale', 'Content', 'Draft visuals use the current layout', 'pass', 'design id current'));
  const rep = await kv.get('doctor/report', 'json');
  C.push(!rep ? check('scan', 'Code', 'No code scan uploaded yet', 'warn', 'doctor.yml has not reported', 'It runs on every push and daily; or start it from GitHub Actions')
    : now - Date.parse(rep.at) > 3 * 86400e3 ? check('scan', 'Code', 'Code scan is out of date', 'warn', `last scan ${ago(now - Date.parse(rep.at))} ago (${rep.commit?.slice(0, 7)})`)
      : check('scan', 'Code', 'Code scan is recent', rep.summary?.fail ? 'fail' : rep.summary?.warn ? 'warn' : 'pass', `${ago(now - Date.parse(rep.at))} ago · ${rep.summary?.pass || 0} passed · ${rep.summary?.warn || 0} warnings · ${rep.summary?.fail || 0} critical`));
  return C;
}

export async function summary(env, kv) {
  const checks = await runtimeChecks(env, kv);
  const report = await kv.get('doctor/report', 'json');
  const all = [...checks.map((c) => ({ ...c, source: 'runtime' })), ...((report?.checks || []).map((c) => ({ ...c, source: 'code scan' })))];
  const count = (s) => all.filter((c) => c.status === s).length;
  const fail = count('fail'), warn = count('warn'), pass = count('pass');
  const score = all.length ? Math.max(0, Math.round(100 * (pass + warn * 0.5) / Math.max(1, pass + warn + fail))) : null;
  return {
    at: new Date().toISOString(), health: score, status: fail ? 'critical' : warn ? 'warnings' : 'healthy',
    counts: { fail, warn, pass, info: count('info') },
    last_scan: report ? { at: report.at, commit: report.commit, run_url: report.run_url, summary: report.summary, tests: report.tests || null } : null,
    checks: all, history: (await kv.get('doctor/history', 'json')) || [],
  };
}

async function addHistory(kv, item) {
  const h = (await kv.get('doctor/history', 'json')) || [];
  h.unshift({ at: new Date().toISOString(), ...item });
  await kv.put('doctor/history', JSON.stringify(h.slice(0, HISTORY_MAX)));
}

// Code scan from GitHub (runner-authenticated). Shape is validated, not trusted blindly.
export async function storeReport(kv, body) {
  const checks = Array.isArray(body?.checks) ? body.checks.slice(0, 200).map((c) => ({
    id: String(c.id || '').slice(0, 60), area: String(c.area || 'Code').slice(0, 40), title: String(c.title || '').slice(0, 200),
    status: ['pass', 'warn', 'fail', 'info'].includes(c.status) ? c.status : 'info', detail: String(c.detail || '').slice(0, 1500), fix: c.fix ? String(c.fix).slice(0, 400) : null,
  })) : [];
  const summary = { pass: checks.filter((c) => c.status === 'pass').length, warn: checks.filter((c) => c.status === 'warn').length, fail: checks.filter((c) => c.status === 'fail').length };
  const report = { at: new Date().toISOString(), commit: String(body?.commit || '').slice(0, 40), run_url: String(body?.run_url || '').slice(0, 300), tests: body?.tests || null, summary, checks };
  await kv.put('doctor/report', JSON.stringify(report));
  await addHistory(kv, { action: 'scan', by: 'doctor.yml', result: `${summary.pass} passed, ${summary.warn} warnings, ${summary.fail} critical`, commit: report.commit });
  return { ok: true, summary };
}

// Safe, deterministic, reversible runtime repairs only. Code changes are never made from here.
export const SAFE_REPAIRS = {
  publish_overdue_linkedin: { title: 'Publish LinkedIn posts that missed their slot', risk: 'low: publishes posts you already approved' },
  refresh_visuals: { title: 'Re-render draft visuals with the current layout', risk: 'none: unpublished drafts only' },
  refresh_github_status: { title: 'Refresh automation status from GitHub', risk: 'none: read only' },
};
export async function repair(env, kv, action, { fetchImpl = fetch } = {}) {
  if (!SAFE_REPAIRS[action]) throw Object.assign(new Error(`Unknown or unsafe repair "${action}"`), { status: 400 });
  let result;
  if (action === 'publish_overdue_linkedin') {
    const out = await signal.publishDueLinkedIn(kv, env, Date.now(), fetchImpl);
    result = out.length ? out.map((o) => `${o.id}: ${o.ok === false ? 'failed: ' + o.error : o.status || o.mode || 'done'}`).join('; ') : 'nothing was due';
  } else if (action === 'refresh_visuals') {
    const s = await signal.load(kv); // load() re-renders unpublished drafts whose layout id is old
    await signal.save(kv, s);
    result = 'unpublished drafts checked and re-rendered where needed';
  } else {
    const gh = await githubRuns(env, kv, { fresh: true, fetchImpl });
    result = gh.ok ? `GitHub status refreshed (${Object.keys(gh.latest).length} workflows)` : `GitHub not reachable: ${gh.error}`;
  }
  // Re-test after the repair and record what actually changed.
  const after = await runtimeChecks(env, kv);
  const still = after.filter((c) => c.repair === action && c.status !== 'pass');
  await addHistory(kv, { action, by: 'owner', result, verified: still.length ? 'still failing' : 'check passes now' });
  return { ok: true, action, result, verified: still.length === 0, checks: after };
}
