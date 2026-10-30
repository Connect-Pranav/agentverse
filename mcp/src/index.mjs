// AGENTVERSE Worker: dashboard (static assets) + SUNVERSE MCP server (song → music video). Not part of Ganesha.
//
//   POST /mcp  (or /mcp/<MCP_TOKEN> for clients that cannot send headers)   MCP Streamable HTTP, JSON-RPC 2.0
//   GET  /u/<upload-ticket>                     simple page to upload the MP3 from a phone/laptop
//   PUT  /u/<upload-ticket>                     raw audio upload (the ticket is the credential)
//   /api/songvideo/runner/...                   used by the GitHub Actions renderer (Bearer MCP_TOKEN)
//   GET  /sv/<ticket>.mp4 | .jpg                finished video / thumbnail (unguessable ticket)
//
// Flow: create_song_job → upload MP3 → runner (Gemini, free) plans lyrics timing + scenes + YouTube text →
// owner approves the paid image cost in chat (approve_song_job) → runner makes Gemini images and renders the
// MP4 (Sunverse logo intro, credits, lyric captions, end card) → get_song_job returns the MP4 link + metadata.
// YouTube: only after the owner presses "Post to YouTube" (publish_to_youtube); the runner uploads with the
// owner's OAuth refresh token. Uploads from an unaudited Google API project are locked private by YouTube.
//
// Bindings: KV namespace MEDIA. Secret: MCP_TOKEN. Optional secret GH_DISPATCH_TOKEN (GitHub fine-grained token,
// Actions read/write on the repo) starts the renderer instantly. Optional vars: SONGVIDEO_IMAGE_USD, INR_PER_USD,
// PUBLIC_BASE_URL, GH_REPO (default Connect-Pranav/agentverse).

import * as growth from './growth.mjs';
import * as push from './push.mjs';

const VERSION = '1.3.0';
const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const PRIVACY = ['public', 'unlisted', 'private'];
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_AUDIO = 24 * 1024 * 1024;
const MAX_PART = 24 * 1024 * 1024;
const MAX_PARTS = 12;
const LEASE_MS = 40 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_IMAGES = 16;
const INDEX = 'sv/index';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const isoIn = (ms) => new Date(Date.now() + ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const clean = (s, max) => String(s ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const kv = (env) => {
  if (!env.MEDIA) throw new HttpError(503, 'KV binding MEDIA is not configured');
  return env.MEDIA;
};
const base = (env, request) => String(env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, '');

/* ---------------- job store ---------------- */
const jobKey = (id) => `sv/job/${id}`;
async function index(env) { return (await kv(env).get(INDEX, 'json')) ?? []; }
async function saveJob(env, job) {
  job.updatedAt = nowIso();
  await kv(env).put(jobKey(job.id), JSON.stringify(job));
  const ids = await index(env);
  if (!ids.includes(job.id)) await kv(env).put(INDEX, JSON.stringify([job.id, ...ids].slice(0, 200)));
  return job;
}
async function jobOf(env, id) {
  if (!/^sv_[0-9a-f]{12}$/.test(String(id))) throw new HttpError(404, `Unknown song job "${id}"`);
  const j = await kv(env).get(jobKey(id), 'json');
  if (!j) throw new HttpError(404, `Unknown song job "${id}"`);
  return j;
}
async function jobByTicket(env, field, ticket) {
  for (const id of await index(env)) {
    const j = await kv(env).get(jobKey(id), 'json');
    if (j && j[field] && safeEqual(j[field], ticket)) return j;
  }
  return null;
}
const STATUS_TEXT = {
  uploading: 'waiting for the MP3 upload', queued: 'queued — the renderer will listen within ~15 min', analyzing: 'Gemini is listening and planning',
  needs_approval: 'plan ready — needs your approval for the image cost', approved: 'approved — making images', rendering: 'rendering the video',
  ready: 'video ready', failed: 'failed', rejected: 'rejected by owner',
};
function view(env, request, j) {
  const b = base(env, request);
  return {
    job_id: j.id, title: j.title, status: j.status, status_text: STATUS_TEXT[j.status] ?? j.status, credits: j.credits, style: j.style,
    upload_url: j.status === 'uploading' || j.status === 'failed' ? `${b}/u/${j.uploadTicket}` : undefined,
    duration_s: j.analysis?.durationS ?? null,
    image_engine: j.analysis?.imageEngine ?? null, theme_hint: j.hint || '', auto_approved: Boolean(j.autoApproved),
    plan: j.analysis ? { mood: j.analysis.mood, theme: j.analysis.theme, language: j.analysis.language, scenes: (j.analysis.scenes ?? []).map((s) => ({ start: s.start, end: s.end, summary: s.summary })) } : null,
    image_count: j.imageCount ?? null, est_cost_usd: j.estCostUsd ?? null, est_cost_inr: j.estCostInr ?? null, cost_usd: j.costUsd ?? null,
    youtube: j.youtube ?? null,
    lyrics_preview: (j.analysis?.lyrics_lines ?? []).slice(0, 8).map((l) => l.text),
    lyrics_lines_count: (j.analysis?.lyrics_lines ?? []).length,
    progress: j.progress ?? null,
    publish: j.publish ? { state: j.publish.state, privacy: j.publish.privacy, url: j.publish.url ?? null, video_id: j.publish.videoId ?? null, privacy_effective: j.publish.privacyEffective ?? null, error: j.publish.error ?? null, requested_at: j.publish.requestedAt ?? null, at: j.publish.at ?? null } : null,
    images: j.imgTicket ? (j.images ?? []).slice().sort((x, y) => x.n - y.n).map((i) => ({ n: i.n, summary: i.summary, url: `${b}/sv/${j.imgTicket}/${i.n}.jpg?v=${encodeURIComponent(i.at || '')}` })) : [],
    image_total: j.analysis?.scenes?.length ?? null,
    short: j.short ? { state: j.short.state, privacy: j.short.privacy, url: j.short.url ?? null, error: j.short.error ?? null, requested_at: j.short.requestedAt ?? null } : null,
    instant_start: Boolean(env.GH_DISPATCH_TOKEN), queued_at: j.queuedAt ?? null, decided_at: j.decidedAt ?? null,
    video_url: j.status === 'ready' && j.ticket ? `${b}/sv/${j.ticket}.mp4` : null,
    thumbnail_url: j.status === 'ready' && j.ticket && j.thumb ? `${b}/sv/${j.ticket}.jpg` : null,
    video_mb: j.videoBytes ? Math.round(j.videoBytes / 1e5) / 10 : null, error: j.error ?? null, created_at: j.createdAt, updated_at: j.updatedAt,
  };
}

/* ---------------- owner actions (MCP tools) ---------------- */
async function createJob(env, a) {
  const id = `sv_${hex(6)}`;
  const job = {
    id, title: clean(a.title, 120), lyrics: clean(a.lyrics, 20_000), hint: clean(a.theme, 600),
    style: clean(a.style, 300) || 'soft watercolor anime scenes, cinematic light, emotional, no text',
    credits: { lyrics: clean(a.lyricist, 60) || 'COCO', singer: clean(a.singer, 60) || 'KoBhit' },
    status: 'uploading', uploadTicket: hex(16), attempts: 0, createdAt: nowIso(),
  };
  return saveJob(env, job);
}
function checkAudio(length, mime) {
  if (!(length > 0)) throw new HttpError(411, 'content-length is required');
  if (length > MAX_AUDIO) throw new HttpError(413, 'Song file is larger than 24 MB — export a 192 kbps MP3');
  const m = String(mime ?? '').toLowerCase().split(';')[0];
  if (m && m !== 'application/octet-stream' && !/^audio\/(mpeg|mp3|mpeg3|x-mpeg-3|x-mp3|mp4|x-m4a|m4a|aac|wav|x-wav)$/.test(m)) throw new HttpError(415, 'Upload an audio file (MP3, M4A or WAV)');
  return m && m !== 'application/octet-stream' ? m : 'audio/mpeg';
}
async function storeAudio(env, j, body, length, mime) {
  if (!['uploading', 'failed'].includes(j.status)) throw new HttpError(409, `Job is ${j.status}; create a new job for another song`);
  const m = checkAudio(length, mime);
  await kv(env).put(`sv/audio/${j.id}`, body, { metadata: { mime: m, bytes: length } });
  Object.assign(j, { status: 'queued', audioBytes: length, audioMime: m, attempts: 0, error: null, leaseUntil: null, queuedAt: nowIso(), progress: null });
  return saveJob(env, j);
}
async function importFromUrl(env, j, url) {
  let u;
  try { u = new URL(String(url)); } catch { throw new HttpError(400, 'url must be a full https link'); }
  if (u.protocol !== 'https:') throw new HttpError(400, 'url must be https');
  // Google Drive share links → direct download
  const drive = /drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/.exec(u.href);
  if (drive) u = new URL(`https://drive.google.com/uc?export=download&id=${drive[1]}`);
  if (/dropbox\.com$/.test(u.hostname)) u.searchParams.set('dl', '1');
  const r = await fetch(u.href, { redirect: 'follow' });
  if (!r.ok) throw new HttpError(502, `Could not download the song (${r.status}). Use a public link or the upload page.`);
  const len = Number(r.headers.get('content-length') ?? 0);
  const type = r.headers.get('content-type');
  if (/text\/html/.test(type ?? '')) throw new HttpError(415, 'That link opens a web page, not an audio file (for Drive: share "Anyone with the link")');
  if (len > 0) return storeAudio(env, j, r.body, len, type);
  const buf = await r.arrayBuffer();
  return storeAudio(env, j, buf, buf.byteLength, type);
}
async function decide(env, j, decision) {
  if (j.status !== 'needs_approval') throw new HttpError(409, `Job is ${j.status}, not waiting for approval`);
  j.status = decision === 'approve' ? 'approved' : 'rejected';
  j.decidedAt = nowIso();
  j.attempts = 0;
  j.progress = null;
  return saveJob(env, j);
}
async function requestPublish(env, j, a = {}) {
  if (j.status !== 'ready') throw new HttpError(409, `Video is ${j.status}; it must be ready before posting`);
  if (j.publish && ['requested', 'publishing', 'published'].includes(j.publish.state)) throw new HttpError(409, `Already ${j.publish.state}${j.publish.url ? ': ' + j.publish.url : ''}`);
  const privacy = PRIVACY.includes(a.privacy) ? a.privacy : 'public';
  const yt = j.youtube ?? {};
  if (a.title) yt.title = clean(a.title, 100);
  if (a.description) yt.description = clean(a.description, 4800);
  if (Array.isArray(a.tags)) yt.tags = a.tags.map((t) => clean(t, 40)).filter(Boolean).slice(0, 25);
  if (!clean(yt.title, 100)) throw new HttpError(400, 'A YouTube title is required');
  j.youtube = yt;
  j.publish = { state: 'requested', privacy, requestedAt: nowIso(), attempts: 0 };
  j.progress = null;
  return saveJob(env, j);
}
async function requestShort(env, j, a = {}) {
  if (j.status !== 'ready') throw new HttpError(409, `Video is ${j.status}; it must be ready first`);
  if (j.short && ['requested', 'making', 'published'].includes(j.short.state)) throw new HttpError(409, `Short already ${j.short.state}${j.short.url ? ': ' + j.short.url : ''}`);
  j.short = { state: 'requested', privacy: PRIVACY.includes(a.privacy) ? a.privacy : (j.publish?.privacy || 'public'), requestedAt: nowIso(), attempts: 0 };
  j.progress = null;
  return saveJob(env, j);
}
async function redoJob(env, j, a = {}) {
  if (['uploading', 'analyzing', 'rendering'].includes(j.status)) throw new HttpError(409, `Job is ${j.status}; wait until it finishes`);
  if (!j.audioBytes) throw new HttpError(409, 'No song uploaded for this job');
  const k = kv(env);
  for (let n = 1; n <= MAX_IMAGES; n++) await k.delete(`sv/img/${j.id}/${n}`);
  if (a.theme !== undefined) j.hint = clean(a.theme, 600);
  if (a.style) j.style = clean(a.style, 300);
  if (a.lyrics) j.lyrics = clean(a.lyrics, 20_000);
  Object.assign(j, { status: 'queued', analysis: null, images: [], youtube: null, ticket: null, thumb: false, videoParts: null, videoPartsDone: [], videoPartBytes: {}, videoBytes: null,
    publish: null, short: null, attempts: 0, error: null, leaseUntil: null, progress: null, autoApproved: false, queuedAt: nowIso(), imageCount: null, estCostUsd: null, estCostInr: null });
  return saveJob(env, j);
}
async function removeJob(env, j) {
  const k = kv(env);
  await k.delete(`sv/audio/${j.id}`);
  for (let n = 1; n <= MAX_PARTS; n++) await k.delete(`sv/video/${j.id}/${n}`);
  await k.delete(`sv/thumb/${j.id}`);
  for (let n = 1; n <= MAX_IMAGES; n++) await k.delete(`sv/img/${j.id}/${n}`);
  await k.delete(jobKey(j.id));
  await k.put(INDEX, JSON.stringify((await index(env)).filter((x) => x !== j.id)));
}

/* ---------------- instant start (optional) ---------------- */
const CTX = new WeakMap();
const ctxOf = (request) => CTX.get(request);
function kick(env, ctx) {
  if (!env.GH_DISPATCH_TOKEN) return false;
  const repo = env.GH_REPO || 'Connect-Pranav/agentverse';
  const p = fetch(`https://api.github.com/repos/${repo}/actions/workflows/songvideo.yml/dispatches`, {
    method: 'POST', body: JSON.stringify({ ref: 'main' }),
    headers: { authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'agentverse-worker', 'content-type': 'application/json' },
  }).then((r) => { if (!r.ok) console.error('dispatch failed', r.status); }).catch((e) => console.error('dispatch error', e));
  if (ctx?.waitUntil) ctx.waitUntil(p);
  return true;
}

/* ---------------- AGENTVERSE cloud brain (Cloudflare Workers AI, free tier) ---------------- */
const BRAIN_MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct-fast', '@cf/meta/llama-3.1-8b-instruct'];
async function cloudBrain(env, a) {
  if (!env.AI) throw new HttpError(503, 'Cloud brain is not enabled on this Worker (AI binding missing)');
  const system = clean(a.system, 12_000), prompt = clean(a.prompt, 24_000);
  if (!prompt) throw new HttpError(400, 'prompt is required');
  // daily cap keeps it inside the free Workers AI allowance (no surprise spend)
  const cap = Number(env.BRAIN_DAILY_CALLS) > 0 ? Number(env.BRAIN_DAILY_CALLS) : 150;
  const key = `brain/usage/${new Date().toISOString().slice(0, 10)}`;
  const used = Number(await kv(env).get(key)) || 0;
  if (used >= cap) throw new HttpError(429, `Cloud brain daily limit reached (${cap} calls) — it resets at 05:30 IST`);
  await kv(env).put(key, String(used + 1), { expirationTtl: 3 * 86400 });
  // big model for the first calls of the day, then the small one (~6× fewer neurons) — stays under 10k neurons/day
  const big = Number(env.BRAIN_BIG_CALLS) >= 0 && env.BRAIN_BIG_CALLS !== undefined ? Number(env.BRAIN_BIG_CALLS) : 40;
  const models = a.quick || used >= big ? BRAIN_MODELS.slice(1) : BRAIN_MODELS;
  let last;
  for (const model of models) {
    try {
      const r = await env.AI.run(model, { messages: [{ role: 'system', content: system || 'You are a helpful assistant. Reply with JSON only.' }, { role: 'user', content: prompt }], max_tokens: a.quick ? 600 : 2200, temperature: 0.8 });
      const text = typeof r?.response === 'string' ? r.response : JSON.stringify(r?.response ?? r ?? '');
      if (text && text !== '""') return { text, model: model.replace('@cf/', ''), used: used + 1, cap };
    } catch (e) { last = e; console.error('brain', model, e?.message); }
  }
  throw new HttpError(502, `Cloud brain failed: ${String(last?.message ?? 'no answer').slice(0, 160)}`);
}

/* ---------------- runner API ---------------- */
const runnerView = (j) => ({ id: j.id, title: j.title, hint: j.hint ?? '', style: j.style, lyrics: j.lyrics, credits: j.credits, audioMime: j.audioMime, analysis: j.analysis ?? null, youtube: j.youtube ?? null, attempts: j.attempts, publish: j.publish ?? null, videoBytes: j.videoBytes ?? null, thumb: Boolean(j.thumb), short: j.short ?? null });
async function claim(env) {
  const now = Date.now();
  for (const id of await index(env)) {
    const j = await kv(env).get(jobKey(id), 'json');
    if (!j) continue;
    const stale = ['analyzing', 'rendering'].includes(j.status) && !(j.leaseUntil && Date.parse(j.leaseUntil) > now);
    if (j.status === 'queued' || (stale && j.status === 'analyzing')) {
      Object.assign(j, { status: 'analyzing', leaseUntil: isoIn(LEASE_MS), attempts: (j.attempts ?? 0) + 1 });
      await saveJob(env, j);
      return { job: runnerView(j), stage: 'analyze' };
    }
    if (j.status === 'approved' || (stale && j.status === 'rendering')) {
      Object.assign(j, { status: 'rendering', leaseUntil: isoIn(LEASE_MS), attempts: (j.attempts ?? 0) + 1 });
      await saveJob(env, j);
      return { job: runnerView(j), stage: 'render' };
    }
    const p = j.publish;
    if (j.status === 'ready' && p && (p.state === 'requested' || (p.state === 'publishing' && !(p.leaseUntil && Date.parse(p.leaseUntil) > now)))) {
      Object.assign(p, { state: 'publishing', leaseUntil: isoIn(LEASE_MS), attempts: (p.attempts ?? 0) + 1 });
      await saveJob(env, j);
      return { job: runnerView(j), stage: 'publish' };
    }
    const sh = j.short;
    if (j.status === 'ready' && sh && (sh.state === 'requested' || (sh.state === 'making' && !(sh.leaseUntil && Date.parse(sh.leaseUntil) > now)))) {
      Object.assign(sh, { state: 'making', leaseUntil: isoIn(LEASE_MS), attempts: (sh.attempts ?? 0) + 1 });
      await saveJob(env, j);
      return { job: runnerView(j), stage: 'short' };
    }
  }
  return { job: null };
}
async function saveAnalysis(env, j, a) {
  if (j.status !== 'analyzing') throw new HttpError(409, `Job is ${j.status}, not analyzing`);
  const scenes = Array.isArray(a?.scenes) ? a.scenes.slice(0, MAX_IMAGES) : [];
  if (!scenes.length) throw new HttpError(400, 'analysis.scenes must list at least one scene');
  for (const s of scenes) if (!(Number(s.end) > Number(s.start)) || !clean(s.image_prompt, 1500)) throw new HttpError(400, 'every scene needs start < end and an image_prompt');
  j.analysis = {
    styleLock: clean(a.style_lock, 700), characters: clean(a.characters, 700),
    durationS: Number(a.durationS) || null, mood: clean(a.mood, 200), theme: clean(a.theme, 500), language: clean(a.language, 40),
    scenes: scenes.map((s) => ({ start: Number(s.start), end: Number(s.end), summary: clean(s.summary, 300), image_prompt: clean(s.image_prompt, 1500) })),
    lyrics_lines: (Array.isArray(a.lyrics_lines) ? a.lyrics_lines.slice(0, 400) : []).map((l) => ({ start: Number(l.start) || 0, end: Number(l.end) || 0, text: clean(l.text, 200) })).filter((l) => l.text && l.end > l.start),
  };
  const yt = a.youtube ?? {};
  j.youtube = { title: clean(yt.title, 100) || j.title, description: clean(yt.description, 4800), tags: (Array.isArray(yt.tags) ? yt.tags : []).map((t) => clean(t, 40)).filter(Boolean).slice(0, 25) };
  if (!j.title) j.title = j.youtube.title;
  j.analysis.imageEngine = ['cloudflare', 'gemini', 'openai'].includes(a.image_engine) ? a.image_engine : 'gemini';
  j.analysis.source = clean(a.source, 60) || null;
  const per = j.analysis.imageEngine === 'cloudflare' ? 0 : (Number(env.SONGVIDEO_IMAGE_USD) > 0 ? Number(env.SONGVIDEO_IMAGE_USD) : 0.067);
  j.imageCount = scenes.length;
  j.estCostUsd = Math.round(scenes.length * per * 1000) / 1000;
  j.estCostInr = Number(env.INR_PER_USD) > 0 ? Math.round(j.estCostUsd * Number(env.INR_PER_USD)) : null;
  // free images (Cloudflare) need no spend approval → straight to the video; paid images wait for the owner
  if (j.estCostUsd === 0) Object.assign(j, { status: 'approved', decidedAt: nowIso(), autoApproved: true, attempts: 0, leaseUntil: null, error: null, progress: null });
  else Object.assign(j, { status: 'needs_approval', leaseUntil: null, error: null, progress: null });
  return saveJob(env, j);
}
async function putVideoPart(env, j, { body, length, part, parts, meta }) {
  if (j.status !== 'rendering') throw new HttpError(409, `Job is ${j.status}, not rendering`);
  const n = Number(part), total = Number(parts);
  if (!(Number.isInteger(n) && Number.isInteger(total) && n >= 1 && n <= total && total <= MAX_PARTS)) throw new HttpError(400, `part/parts must be integers, 1 ≤ part ≤ parts ≤ ${MAX_PARTS}`);
  if (!(length > 0)) throw new HttpError(411, 'content-length is required');
  if (length > MAX_PART) throw new HttpError(413, 'Each part must be ≤ 24 MB');
  await kv(env).put(`sv/video/${j.id}/${n}`, body);
  j.videoPartsDone = [...new Set([...(j.videoPartsDone ?? []), n])];
  j.videoPartBytes = { ...(j.videoPartBytes ?? {}), [n]: length };
  if (j.videoPartsDone.length === total) {
    j.videoParts = total;
    j.videoBytes = Object.values(j.videoPartBytes).reduce((x, y) => x + y, 0);
    j.videoMeta = meta ?? null;
    j.costUsd = Number(meta?.imageCostUsd) || null;
    j.ticket = hex(16);
    Object.assign(j, { status: 'ready', leaseUntil: null, error: null, progress: null });
  }
  return saveJob(env, j);
}
async function saveProgress(env, j, a) {
  j.progress = { stage: clean(a.stage, 20), step: clean(a.step, 120), done: Number(a.done) || 0, total: Number(a.total) || 0, eta_s: Math.max(0, Math.round(Number(a.eta_s) || 0)), at: nowIso() };
  return saveJob(env, j);
}
async function markPublished(env, j, a) {
  if (!j.publish || j.publish.state !== 'publishing') throw new HttpError(409, 'Not publishing');
  const id = clean(a.video_id, 20);
  if (!/^[\w-]{6,20}$/.test(id)) throw new HttpError(400, 'video_id is required');
  Object.assign(j.publish, { state: 'published', videoId: id, url: `https://youtu.be/${id}`, privacyEffective: clean(a.privacy, 20) || j.publish.privacy, leaseUntil: null, error: null, at: nowIso() });
  j.progress = null;
  return saveJob(env, j);
}
async function markShort(env, j, a) {
  if (!j.short || j.short.state !== 'making') throw new HttpError(409, 'No Short being made');
  const id = clean(a.video_id, 20);
  if (!/^[\w-]{6,20}$/.test(id)) throw new HttpError(400, 'video_id is required');
  Object.assign(j.short, { state: 'published', videoId: id, url: `https://youtube.com/shorts/${id}`, leaseUntil: null, error: null, at: nowIso() });
  j.progress = null;
  return saveJob(env, j);
}
async function failJob(env, j, error, stage) {
  if (j.status === 'ready' && j.short?.state === 'making' && (stage === 'short' || j.publish?.state !== 'publishing')) {
    j.short.state = (j.short.attempts ?? 0) >= MAX_ATTEMPTS ? 'failed' : 'requested';
    j.short.error = clean(error, 1000) || 'unknown error';
    j.short.leaseUntil = null;
    j.progress = null;
    return saveJob(env, j);
  }
  if (j.status === 'ready' && j.publish?.state === 'publishing') {
    j.publish.state = (j.publish.attempts ?? 0) >= MAX_ATTEMPTS ? 'failed' : 'requested';
    j.publish.error = clean(error, 1000) || 'unknown error';
    j.publish.leaseUntil = null;
    j.progress = null;
    return saveJob(env, j);
  }
  if (!['analyzing', 'rendering'].includes(j.status)) return j;
  const back = j.status === 'analyzing' ? 'queued' : 'approved';
  j.status = (j.attempts ?? 0) >= MAX_ATTEMPTS ? 'failed' : back;
  j.error = clean(error, 1000) || 'unknown error';
  j.leaseUntil = null;
  j.progress = null;
  if (j.status === 'failed') j.uploadTicket = j.uploadTicket || hex(16);
  return saveJob(env, j);
}

/* ---------------- MCP ---------------- */
const TOOLS = [
  { name: 'create_song_job', title: 'Create song job', description: 'Start a Sunverse music video from a song. Returns job_id and an upload_url: open it to upload the MP3 (or call import_song_from_url). Credits default to Lyrics: COCO, Singer: KoBhit.',
    inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'Song title' }, theme: { type: 'string', description: 'Optional story/theme hint, e.g. "Ramayana — Angad challenges Ravana"' }, lyrics: { type: 'string', description: 'Optional lyrics in English/Roman letters — improves caption timing' }, style: { type: 'string', description: 'Visual style for the images' }, lyricist: { type: 'string' }, singer: { type: 'string' } }, additionalProperties: false } },
  { name: 'import_song_from_url', title: 'Import song from link', description: 'Download the song for a job from a public https link (Google Drive "anyone with the link", Dropbox, direct MP3).',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' }, url: { type: 'string' } }, required: ['job_id', 'url'], additionalProperties: false } },
  { name: 'list_song_jobs', title: 'List song jobs', description: 'List recent song jobs with their status.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_song_job', title: 'Get song job', description: 'Status, plan (mood/theme/scenes), estimated image cost, and — when ready — the MP4 link, thumbnail and YouTube title/description/tags.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'], additionalProperties: false } },
  { name: 'approve_song_job', title: 'Approve image cost', description: 'Owner approval: spend the estimated cost on Gemini images and render the video. Only call after the owner explicitly says yes.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'], additionalProperties: false }, annotations: { destructiveHint: false, idempotentHint: true } },
  { name: 'reject_song_job', title: 'Reject plan', description: 'Owner says no to the plan; nothing is spent.', inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'], additionalProperties: false } },
  { name: 'get_youtube_metadata', title: 'YouTube title & description', description: 'Ready-to-paste YouTube title, description and tags for a job.', inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'], additionalProperties: false } },
  { name: 'publish_to_youtube', title: 'Post video to YouTube', description: 'Owner approval to post the finished video on the Sunverse YouTube channel with its title, description, tags and thumbnail. Only call after the owner explicitly says to post. privacy: public (default), unlisted or private. Optional title/description/tags override the generated ones.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' }, privacy: { type: 'string', enum: PRIVACY }, title: { type: 'string' }, description: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['job_id'], additionalProperties: false }, annotations: { destructiveHint: false, openWorldHint: true } },
  { name: 'make_youtube_short', title: 'Make & post a YouTube Short', description: 'Owner approval to cut a ~40 s vertical Short (chorus) from a finished song video and post it on the Sunverse channel, linking to the full song. Only call after the owner says yes.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' }, privacy: { type: 'string', enum: PRIVACY } }, required: ['job_id'], additionalProperties: false }, annotations: { destructiveHint: false, openWorldHint: true } },
  { name: 'redo_song_job', title: 'Redo a song video', description: 'Make the video again from the same MP3 with a new theme / story hint, style or lyrics (e.g. theme: "Ramayana — Angad challenges Ravana in his court"). Clears the old plan, images and video.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string' }, theme: { type: 'string' }, style: { type: 'string' }, lyrics: { type: 'string' } }, required: ['job_id'], additionalProperties: false } },
  { name: 'get_growth_report', title: 'Sunverse growth report', description: 'YouTube channel stats, subscriber change, newest public subscribers, and AI comment replies (posted and waiting for approval).', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'decide_comment_reply', title: 'Approve or skip a comment reply', description: 'Owner decision on an AI reply waiting for approval. action approve (optionally with edited reply text) or reject. Only call after the owner decides.',
    inputSchema: { type: 'object', properties: { comment_id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'reject'] }, reply: { type: 'string' } }, required: ['comment_id', 'action'], additionalProperties: false } },
  { name: 'set_auto_replies', title: 'Auto-send simple replies', description: 'Turn automatic sending of simple comment replies (thanks, greetings, praise) on or off. Other replies always wait for approval.', inputSchema: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'], additionalProperties: false } },
  { name: 'delete_song_job', title: 'Delete song job', description: 'Delete a job and its files.', inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'], additionalProperties: false }, annotations: { destructiveHint: true } },
];
async function callTool(env, request, name, a = {}) {
  const v = (j) => view(env, request, j);
  switch (name) {
    case 'create_song_job': { const j = await createJob(env, a); return { ...v(j), next: 'Open upload_url and upload the MP3 (max 24 MB), or call import_song_from_url.' }; }
    case 'import_song_from_url': { const j = await importFromUrl(env, await jobOf(env, a.job_id), a.url); kick(env, ctxOf(request)); return v(j); }
    case 'list_song_jobs': {
      const out = [];
      for (const id of (await index(env)).slice(0, 30)) { const j = await kv(env).get(jobKey(id), 'json'); if (j) out.push({ job_id: j.id, title: j.title, status: j.status, status_text: STATUS_TEXT[j.status], updated_at: j.updatedAt }); }
      return { jobs: out };
    }
    case 'get_song_job': return v(await jobOf(env, a.job_id));
    case 'approve_song_job': return { ...v(await decide(env, await jobOf(env, a.job_id), 'approve')), started: kick(env, ctxOf(request)), next: 'Images and video are being made; check get_song_job in ~15–30 minutes.' };
    case 'reject_song_job': return v(await decide(env, await jobOf(env, a.job_id), 'reject'));
    case 'get_youtube_metadata': { const j = await jobOf(env, a.job_id); if (!j.youtube) throw new HttpError(409, 'No metadata yet — the song has not been analysed'); return { ...j.youtube, upload_page: 'https://www.youtube.com/upload' }; }
    case 'publish_to_youtube': { const j = await requestPublish(env, await jobOf(env, a.job_id), a); kick(env, ctxOf(request)); return { ...v(j), next: 'The renderer uploads it to YouTube (a few minutes). Check get_song_job for the link.' }; }
    case 'make_youtube_short': { const j = await requestShort(env, await jobOf(env, a.job_id), a); kick(env, ctxOf(request)); return { ...v(j), next: 'The renderer cuts and posts the Short (a few minutes after it starts).' }; }
    case 'redo_song_job': { const j = await redoJob(env, await jobOf(env, a.job_id), a); kick(env, ctxOf(request)); return { ...v(j), next: 'Queued again with the new theme.' }; }
    case 'get_growth_report': return growth.ownerView(await growth.load(kv(env)));
    case 'decide_comment_reply': return growth.ownerView(await growth.decideReply(kv(env), a.comment_id, { action: a.action, draft: a.reply }));
    case 'set_auto_replies': return growth.ownerView(await growth.setSettings(kv(env), { autoSimple: Boolean(a.on) }));
    case 'delete_song_job': { const j = await jobOf(env, a.job_id); await removeJob(env, j); return { deleted: j.id }; }
    default: throw Object.assign(new Error(`Unknown tool: ${name}`), { rpc: -32602 });
  }
}
async function mcp(request, env) {
  if (request.method === 'GET') return new Response('SSE stream not offered; use POST', { status: 405, headers: { allow: 'POST' } });
  if (request.method === 'DELETE') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  let msg;
  try { msg = await request.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  const batch = Array.isArray(msg) ? msg : [msg];
  const out = [];
  for (const m of batch) {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') { out.push({ jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid Request' } }); continue; }
    if (m.id === undefined || m.id === null) continue; // notification (e.g. notifications/initialized)
    const ok = (result) => out.push({ jsonrpc: '2.0', id: m.id, result });
    const err = (code, message) => out.push({ jsonrpc: '2.0', id: m.id, error: { code, message } });
    try {
      if (m.method === 'initialize') {
        const want = m.params?.protocolVersion;
        ok({ protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'agentverse-sunverse', title: 'AGENTVERSE · SUNVERSE Song → Video', version: VERSION },
          instructions: 'Turns a Sunverse song into a finished music video. Always ask the owner before calling approve_song_job (it spends money on images) and before publish_to_youtube (it posts publicly on the channel). Show the owner the title/description first.' });
      } else if (m.method === 'ping') ok({});
      else if (m.method === 'tools/list') ok({ tools: TOOLS });
      else if (m.method === 'tools/call') {
        const name = m.params?.name;
        if (!TOOLS.some((t) => t.name === name)) { err(-32602, `Unknown tool: ${name}`); continue; }
        try {
          const r = await callTool(env, request, name, m.params?.arguments ?? {});
          ok({ content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], structuredContent: r, isError: false });
        } catch (e) {
          ok({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
        }
      } else if (m.method === 'resources/list') ok({ resources: [] });
      else if (m.method === 'prompts/list') ok({ prompts: [] });
      else err(-32601, `Method not found: ${m.method}`);
    } catch (e) {
      err(-32603, `Internal error: ${String(e?.message ?? e).slice(0, 200)}`);
    }
  }
  if (!out.length) return new Response(null, { status: 202 });
  return json(Array.isArray(msg) ? out : out[0]);
}

/* ---------------- upload page ---------------- */
function uploadPage(j) {
  const t = (j.title || 'your song').replace(/[<>&"]/g, '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upload · ${t}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 30%,#2b1d63,#07071a);color:#fff;font:16px system-ui,sans-serif}
.c{width:min(440px,92vw);padding:28px;border-radius:24px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(14px)}
h1{font-size:22px;margin:0 0 4px}p{opacity:.75;margin:0 0 18px}label{display:block;padding:22px;border:2px dashed rgba(255,255,255,.35);border-radius:16px;text-align:center;cursor:pointer}
input{display:none}button{margin-top:16px;width:100%;padding:14px;border:0;border-radius:99px;background:#fff;color:#1b1240;font-weight:700;font-size:16px}
.bar{height:6px;background:rgba(255,255,255,.15);border-radius:4px;margin-top:14px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:#b9a6ff}#m{margin-top:12px;min-height:22px}</style></head>
<body><div class="c"><h1>SUNVERSE · Upload song</h1><p>${t} — MP3/M4A/WAV, max 24 MB</p>
<label id="l">Tap to choose the song<input id="f" type="file" accept="audio/*,.mp3,.m4a,.wav"></label><button id="b">Upload</button><div class="bar"><i id="p"></i></div><div id="m"></div></div>
<script>var f=document.getElementById('f'),m=document.getElementById('m');f.onchange=function(){document.getElementById('l').textContent=f.files[0]?f.files[0].name:'Tap to choose the song'};
document.getElementById('b').onclick=function(){var x=f.files[0];if(!x){m.textContent='Choose a file first';return}var r=new XMLHttpRequest();r.open('PUT',location.pathname);r.setRequestHeader('content-type',x.type||'audio/mpeg');
r.upload.onprogress=function(e){if(e.lengthComputable)document.getElementById('p').style.width=Math.round(e.loaded/e.total*100)+'%'};
r.onload=function(){var j={};try{j=JSON.parse(r.responseText)}catch(e){}m.textContent=r.status<300?'Uploaded ✓ — go back to the chat. The video plan will be ready in ~15 minutes.':(j.error||'Upload failed')};r.onerror=function(){m.textContent='Network error'};r.send(x)};</script></body></html>`;
}

/* ---------------- media by ticket ---------------- */
async function serveMedia(env, name, request) {
  const m = /^([0-9a-f]{32})\.(mp4|jpg)$/.exec(name);
  if (!m) return new Response('Not found', { status: 404 });
  const j = await jobByTicket(env, 'ticket', m[1]);
  if (!j || j.status !== 'ready') return new Response('Not found', { status: 404 });
  const safe = (j.youtube?.title || j.title || 'sunverse').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'sunverse';
  if (m[2] === 'jpg') {
    const t = await kv(env).get(`sv/thumb/${j.id}`, 'stream');
    return t ? new Response(t, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600', 'x-robots-tag': 'noindex', 'content-disposition': `inline; filename="${safe}.jpg"` } }) : new Response('Not found', { status: 404 });
  }
  return streamVideo(env, j, `${safe}.mp4`, request);
}
function partTable(j) {
  const out = [];
  let off = 0;
  for (let n = 1; n <= j.videoParts; n++) { const len = Number(j.videoPartBytes?.[n] ?? 0); out.push({ n, start: off, end: off + len - 1, len }); off += len; }
  return out;
}
/** MP4 with HTTP Range support: phones play, seek and keep playing across the stored parts. */
async function streamVideo(env, j, filename, request) {
  const total = Number(j.videoBytes);
  const dl = request && new URL(request.url).searchParams.has('dl');
  const base = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600', 'x-robots-tag': 'noindex', 'content-disposition': `${dl ? 'attachment' : 'inline'}; filename="${filename}"` };
  const range = request?.headers.get('range');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m && total > 0) {
    let start = m[1] === '' ? Math.max(0, total - Number(m[2])) : Number(m[1]);
    let end = m[1] === '' || m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
    if (!(start <= end && start < total)) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${total}` } });
    const part = partTable(j).find((p) => start >= p.start && start <= p.end);
    end = Math.min(end, part.end); // one stored part per response; the player asks for the next range
    const buf = await kv(env).get(`sv/video/${j.id}/${part.n}`, 'arrayBuffer');
    if (!buf) return new Response('part missing', { status: 500 });
    const body = buf.slice(start - part.start, end - part.start + 1);
    return new Response(body, { status: 206, headers: { ...base, 'content-range': `bytes ${start}-${end}/${total}`, 'content-length': String(body.byteLength) } });
  }
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  (async () => {
    try {
      for (let n = 1; n <= j.videoParts; n++) {
        const st = await kv(env).get(`sv/video/${j.id}/${n}`, 'stream');
        if (!st) throw new Error(`part ${n} missing`);
        const rd = st.getReader();
        for (;;) { const { done, value } = await rd.read(); if (done) break; await w.write(value); }
      }
      await w.close();
    } catch (e) { await w.abort(e).catch(() => {}); }
  })();
  return new Response(readable, { headers: { ...base, 'content-length': String(total) } });
}

/* ---------------- GitHub Actions OIDC (runner auth without repo secrets) ---------------- */
let JWKS = null, JWKS_AT = 0;
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function githubOidc(env, tok) {
  const parts = tok.split('.');
  if (parts.length !== 3) return false;
  let h, p;
  try { h = JSON.parse(new TextDecoder().decode(b64u(parts[0]))); p = JSON.parse(new TextDecoder().decode(b64u(parts[1]))); } catch { return false; }
  const repo = env.GH_REPO || 'Connect-Pranav/agentverse';
  const now = Date.now() / 1000;
  if (h.alg !== 'RS256' || p.iss !== 'https://token.actions.githubusercontent.com' || p.aud !== 'agentverse' || p.repository !== repo || p.ref !== 'refs/heads/main' || !(p.exp > now - 30) || !(p.nbf === undefined || p.nbf < now + 60)) return false;
  if (!JWKS || Date.now() - JWKS_AT > 3600e3 || !JWKS.keys?.some((k) => k.kid === h.kid)) {
    const r = await fetch('https://token.actions.githubusercontent.com/.well-known/jwks');
    if (!r.ok) return false;
    JWKS = await r.json(); JWKS_AT = Date.now();
  }
  const jwk = JWKS.keys?.find((k) => k.kid === h.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
}
async function runner(request, env) {
  const h = request.headers.get('authorization') ?? '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (env.MCP_TOKEN && tok && safeEqual(tok, env.MCP_TOKEN)) return;
  if (tok.split('.').length === 3 && await githubOidc(env, tok)) return;
  if (!env.MCP_TOKEN) throw new HttpError(503, 'Server locked: secret MCP_TOKEN is not set on the Worker');
  throw new HttpError(401, 'Missing or invalid runner token');
}
async function pending(env) {
  const now = Date.now();
  let n = 0;
  for (const id of await index(env)) {
    const j = await kv(env).get(jobKey(id), 'json');
    if (!j) continue;
    const stale = (x) => !(x?.leaseUntil && Date.parse(x.leaseUntil) > now);
    if (['queued', 'approved'].includes(j.status) || (['analyzing', 'rendering'].includes(j.status) && stale(j))
      || (j.status === 'ready' && ((j.publish && (j.publish.state === 'requested' || (j.publish.state === 'publishing' && stale(j.publish)))) || (j.short && (j.short.state === 'requested' || (j.short.state === 'making' && stale(j.short))))))) n++;
  }
  return n;
}
async function cloudImage(env, prompt) {
  if (!env.AI) throw new HttpError(503, 'AI binding missing');
  const cap = Number(env.IMAGE_DAILY) > 0 ? Number(env.IMAGE_DAILY) : 60;
  const key = `image/usage/${new Date().toISOString().slice(0, 10)}`;
  const used = Number(await kv(env).get(key)) || 0;
  if (used >= cap) throw new HttpError(429, `Free image limit for today reached (${cap})`);
  await kv(env).put(key, String(used + 1), { expirationTtl: 3 * 86400 });
  const r = await env.AI.run(IMAGE_MODEL, { prompt: clean(prompt, 2000), steps: 8 });
  if (!r?.image) throw new HttpError(502, 'Image model returned nothing');
  return new Response(b64u(r.image.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
}

function ping(env, request, msg) {
  const p = push.notify(kv(env), { url: '/#studio', ...msg });
  const c = ctxOf(request);
  if (c?.waitUntil) c.waitUntil(p);
}
const songName = (j) => j.youtube?.title || j.title || 'Your song';

/* ---------------- router ---------------- */
function owner(request, env, pathToken) {
  if (!env.MCP_TOKEN) throw new HttpError(503, 'Server locked: secret MCP_TOKEN is not set on the Worker');
  const h = request.headers.get('authorization') ?? '';
  const tok = pathToken || (h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!tok || !safeEqual(tok, env.MCP_TOKEN)) throw new HttpError(401, 'Missing or invalid token');
}
async function readJson(request, max = 512 * 1024) {
  const t = await request.text();
  if (t.length > max) throw new HttpError(413, 'Body too large');
  try { return t ? JSON.parse(t) : {}; } catch { throw new HttpError(400, 'Body must be JSON'); }
}
async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const seg = path.split('/').filter(Boolean);
  const method = request.method;
  const len = Number(request.headers.get('content-length') ?? 0);

  if (path === '/health') return json({ ok: true, runnerAuth: 'mcp-token or github-oidc', app: 'agentverse', songStudio: true, version: VERSION, kv: Boolean(env.MEDIA), tokenSet: Boolean(env.MCP_TOKEN), instantStart: Boolean(env.GH_DISPATCH_TOKEN), brain: Boolean(env.AI) }, 200, { 'access-control-allow-origin': '*' });
  if (seg[0] === 'mcp') { owner(request, env, seg[1]); return mcp(request, env); }
  if (seg[0] === 'sv' && seg[1] && seg[2] && method === 'GET') {
    const m = /^(\d{1,2})\.jpg$/.exec(seg[2]);
    const j = m && /^[0-9a-f]{32}$/.test(seg[1]) ? await jobByTicket(env, 'imgTicket', seg[1]) : null;
    const img = j ? await kv(env).get(`sv/img/${j.id}/${Number(m[1])}`, 'stream') : null;
    return img ? new Response(img, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', 'x-robots-tag': 'noindex' } }) : new Response('Not found', { status: 404 });
  }
  if (seg[0] === 'sv' && seg[1] && method === 'GET') return serveMedia(env, seg[1], request);
  if (seg[0] === 'u' && seg[1]) {
    const j = /^[0-9a-f]{32}$/.test(seg[1]) ? await jobByTicket(env, 'uploadTicket', seg[1]) : null;
    if (!j) return new Response('This upload link is not valid.', { status: 404 });
    if (method === 'GET') return new Response(uploadPage(j), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
    if (method === 'PUT') { const r = await storeAudio(env, j, request.body, len, request.headers.get('content-type')); kick(env, ctxOf(request)); return json(view(env, request, r)); }
    throw new HttpError(405, 'Use GET or PUT');
  }
  if (path === '/api/brain' && method === 'POST') { if ((request.headers.get('authorization') ?? '').split('.').length === 3) await runner(request, env); else owner(request, env); return json(await cloudBrain(env, await readJson(request, 64 * 1024))); }
  if (seg[0] === 'api' && seg[1] === 'push') {
    if (seg[2] === 'inbox' && seg[3] && method === 'GET') { const m = await push.inbox(kv(env), seg[3]); if (!m) throw new HttpError(404, 'Unknown inbox'); return json({ messages: m }, 200, { 'cache-control': 'no-store' }); }
    owner(request, env);
    if (seg[2] === 'key' && method === 'GET') return json({ key: await push.publicKey(kv(env)) });
    if (seg[2] === 'subscribe' && method === 'POST') { try { return json(await push.subscribe(kv(env), (await readJson(request)).subscription)); } catch (e) { throw new HttpError(e.status || 500, e.message); } }
    if (seg[2] === 'test' && method === 'POST') return json({ sent: await push.notify(kv(env), { title: 'AGENTVERSE', body: 'Notifications are on ✓', url: '/', tag: 'test' }) });
    throw new HttpError(404, 'Not found');
  }
  if (seg[0] === 'api' && seg[1] === 'growth') {
    if (seg[2] === 'runner') await runner(request, env); else owner(request, env);
    const k = kv(env);
    if (seg[2] === 'runner' && !seg[3] && method === 'GET') return json(await growth.runnerState(k));
    if (seg[2] === 'runner' && seg[3] === 'report' && method === 'POST') {
      const before = growth.ownerView(await growth.load(k));
      const v = growth.ownerView(await growth.runnerReport(k, await readJson(request)));
      const ns = v.new_subscribers.filter((x) => !before.new_subscribers.some((y) => y.id === x.id)).length;
      if (v.waiting > before.waiting) ping(env, request, { title: 'Comment replies need your OK', body: `${v.waiting - before.waiting} new repl${v.waiting - before.waiting > 1 ? 'ies' : 'y'} waiting in Growth.`, url: '/', tag: 'growth' });
      else if (ns) ping(env, request, { title: 'New subscribers', body: `${ns} new public subscriber${ns > 1 ? 's' : ''} on Sunverse.`, url: '/', tag: 'subs' });
      return json(v);
    }
    if (!seg[2] && method === 'GET') return json(growth.ownerView(await growth.load(k)));
    if (seg[2] === 'settings' && method === 'POST') return json(growth.ownerView(await growth.setSettings(k, await readJson(request))));
    if (seg[2] === 'reply' && seg[3] && method === 'POST') return json(growth.ownerView(await growth.decideReply(k, decodeURIComponent(seg[3]), await readJson(request))));
    throw new HttpError(404, 'Not found');
  }
  // Owner REST (AGENTVERSE dashboard → Song Studio), same token as MCP
  if (seg[0] === 'api' && seg[1] === 'songvideo' && seg[2] !== 'runner') {
    owner(request, env);
    const v = (j) => view(env, request, j);
    if (seg[2] === 'start' && method === 'POST') {
      // owner pressed "Start now": run the GitHub renderer immediately instead of waiting for its schedule
      if (!env.GH_DISPATCH_TOKEN) throw new HttpError(409, 'Start now needs the Cloudflare secret GH_DISPATCH_TOKEN (GitHub token with Actions: read and write on Connect-Pranav/agentverse)');
      const repo = env.GH_REPO || 'Connect-Pranav/agentverse';
      const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/songvideo.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }),
        headers: { authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'agentverse-worker', 'content-type': 'application/json' } });
      if (!r.ok) throw new HttpError(502, `GitHub did not start the renderer (${r.status}${r.status === 401 || r.status === 403 || r.status === 404 ? ': check GH_DISPATCH_TOKEN access to the repo' : ''})`);
      return json({ started: true, at: nowIso() });
    }
    if (!seg[2] && method === 'GET') return json(await callTool(env, request, 'list_song_jobs'));
    if (!seg[2] && method === 'POST') return json({ job: v(await createJob(env, await readJson(request))) }, 201);
    const j = await jobOf(env, seg[2]);
    if (!seg[3] && method === 'GET') return json({ job: v(j) });
    if (!seg[3] && method === 'DELETE') { await removeJob(env, j); return json({ deleted: j.id }); }
    const ctx = ctxOf(request);
    if (seg[3] === 'audio' && method === 'PUT') { const r = await storeAudio(env, j, request.body, len, request.headers.get('content-type')); kick(env, ctx); return json({ job: v(r) }); }
    if (seg[3] === 'import' && method === 'POST') { const r = await importFromUrl(env, j, (await readJson(request)).url); kick(env, ctx); return json({ job: v(r) }); }
    if ((seg[3] === 'approve' || seg[3] === 'reject') && method === 'POST') { const r = await decide(env, j, seg[3]); if (seg[3] === 'approve') kick(env, ctx); return json({ job: v(r) }); }
    if (seg[3] === 'redo' && method === 'POST') { const r = await redoJob(env, j, await readJson(request)); kick(env, ctx); return json({ job: v(r) }); }
    if (seg[3] === 'short' && method === 'POST') { const r = await requestShort(env, j, await readJson(request)); kick(env, ctx); return json({ job: v(r) }); }
    if (seg[3] === 'publish' && method === 'POST') { const r = await requestPublish(env, j, await readJson(request)); kick(env, ctx); return json({ job: v(r) }); }
    throw new HttpError(404, 'Not found');
  }
  if (seg[0] === 'api' && seg[1] === 'songvideo' && seg[2] === 'runner') {
    await runner(request, env);
    if (seg[3] === 'claim' && method === 'POST') return json(await claim(env));
    if (seg[3] === 'pending' && method === 'GET') return json({ pending: await pending(env) });
    const j = await jobOf(env, seg[3]);
    if (seg[4] === 'audio' && method === 'GET') {
      const o = await kv(env).getWithMetadata(`sv/audio/${j.id}`, 'stream');
      if (!o?.value) throw new HttpError(404, 'Song audio not found');
      return new Response(o.value, { headers: { 'content-type': o.metadata?.mime ?? 'audio/mpeg', 'cache-control': 'no-store' } });
    }
    if (seg[4] === 'analysis' && method === 'PUT') {
      const r = await saveAnalysis(env, j, await readJson(request));
      ping(env, request, r.status === 'needs_approval'
        ? { title: 'Approve the images', body: `${songName(r)}: ${r.imageCount} images, est. ${r.estCostInr ? '₹' + r.estCostInr : '$' + r.estCostUsd}. Tap to approve.`, tag: r.id }
        : { title: 'Song analysed', body: `${songName(r)}: ${r.analysis?.mood || ''} — making ${r.imageCount} images and the video now.`, tag: r.id });
      return json({ job: runnerView(r) });
    }
    if (seg[4] === 'video' && method === 'PUT') {
      let meta = null;
      try { meta = JSON.parse(url.searchParams.get('meta') ?? 'null'); } catch { throw new HttpError(400, 'meta must be JSON'); }
      const r = await putVideoPart(env, j, { body: request.body, length: len, part: url.searchParams.get('part'), parts: url.searchParams.get('parts'), meta });
      if (r.status === 'ready') ping(env, request, { title: 'Video ready 🎬', body: `${songName(r)} is ready. Tap to watch, download or post to YouTube.`, tag: r.id });
      return json({ job: { id: r.id, status: r.status } });
    }
    if (seg[4] === 'thumb' && method === 'PUT') {
      if (!(len > 0) || len > 2 * 1024 * 1024) throw new HttpError(413, 'Thumbnail must be ≤ 2 MB');
      await kv(env).put(`sv/thumb/${j.id}`, request.body);
      j.thumb = true;
      await saveJob(env, j);
      return json({ ok: true });
    }
    if (seg[4] === 'img' && seg[5] && method === 'PUT') {
      const n = Number(seg[5]);
      if (!(Number.isInteger(n) && n >= 1 && n <= MAX_IMAGES)) throw new HttpError(400, `image number must be 1–${MAX_IMAGES}`);
      if (!(len > 0) || len > 1024 * 1024) throw new HttpError(413, 'Preview image must be ≤ 1 MB');
      await kv(env).put(`sv/img/${j.id}/${n}`, request.body);
      j.imgTicket = j.imgTicket || hex(16);
      const at = nowIso();
      j.images = (j.images ?? []).filter((x) => x.n !== n).concat([{ n, summary: clean(url.searchParams.get('summary'), 300), at }]);
      await saveJob(env, j);
      return json({ ok: true, n });
    }
    if (seg[4] === 'image' && method === 'POST') return cloudImage(env, (await readJson(request)).prompt);
    if (seg[4] === 'short-done' && method === 'POST') { const r = await markShort(env, j, await readJson(request)); ping(env, request, { title: 'Short is live', body: `${songName(r)} Short is on YouTube.`, url: r.short.url, tag: r.id + 's' }); return json({ job: { id: r.id, short: r.short } }); }
    if (seg[4] === 'progress' && method === 'POST') { const r = await saveProgress(env, j, await readJson(request)); return json({ ok: true, status: r.status }); }
    if (seg[4] === 'published' && method === 'POST') { const r = await markPublished(env, j, await readJson(request)); ping(env, request, { title: 'Live on YouTube', body: `${songName(r)} (${r.publish.privacyEffective}).`, url: r.publish.url, tag: r.id + 'p' }); return json({ job: { id: r.id, publish: r.publish } }); }
    if (seg[4] === 'video' && method === 'GET') { if (j.status !== 'ready') throw new HttpError(409, 'Video not ready'); return streamVideo(env, j, 'video.mp4', request); }
    if (seg[4] === 'thumb' && method === 'GET') { const t = await kv(env).get(`sv/thumb/${j.id}`, 'stream'); if (!t) throw new HttpError(404, 'No thumbnail'); return new Response(t, { headers: { 'content-type': 'image/jpeg' } }); }
    if (seg[4] === 'fail' && method === 'POST') { const fb = await readJson(request); const r = await failJob(env, j, fb.error, fb.stage); if (r.status === 'failed' || r.publish?.state === 'failed' || r.short?.state === 'failed') ping(env, request, { title: 'Song job failed', body: `${songName(r)}: ${String(fb.error || '').slice(0, 140)}`, tag: r.id + 'f' }); return json({ job: { id: r.id, status: r.status } }); }
  }
  // everything else: the AGENTVERSE dashboard (static assets)
  if (env.ASSETS && (method === 'GET' || method === 'HEAD')) return env.ASSETS.fetch(request);
  if (path === '/') return json({ name: 'agentverse', version: VERSION, mcp: '/mcp', ok: true });
  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env, ctx) {
    if (ctx) CTX.set(request, ctx);
    try {
      return await route(request, env);
    } catch (e) {
      if (e instanceof HttpError || e instanceof growth.GrowthError) return json({ error: e.message }, e.status);
      console.error('error', e?.stack ?? e);
      return json({ error: `Internal error: ${String(e?.message ?? e).slice(0, 300)}` }, 500);
    }
  },
};
