#!/usr/bin/env node
// PRANAV SIGNAL — animated GIF of the day's LinkedIn visual.
// Takes the visual the Worker already chose (one per post), plays its SMIL animation frame by frame,
// renders each frame with resvg (real Manrope / Inter / IBM Plex Mono files), encodes a looping GIF with
// ffmpeg and uploads it to the Worker, which stores it and sends it to Telegram for approval.
//
// GitHub Actions:  node scripts/signal-gif.mjs            (OIDC auth, skips if today's GIF exists)
// Local test:      node scripts/signal-gif.mjs --svg in.svg --out out.gif
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleSvgAt, animationLength } from '../mcp/src/editorial_templates.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = readdirSync(join(HERE, 'fonts')).filter((f) => f.endsWith('.ttf')).map((f) => join(HERE, 'fonts', f));
const FPS = 12;          // smooth enough for bars and fades, keeps the file small
const HOLD = 3;          // seconds the finished frame stays before the loop restarts
const WIDTH = 1080;      // 1080 x 1350 (4:5), LinkedIn's portrait feed size
const MAX_BYTES = 18 * 1024 * 1024;

const CANDIDATES = ['https://agentverse.pravanigroup.workers.dev', 'https://agentverse.aistudio09.workers.dev'];
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const fail = (m) => { console.error(`❌ ${m}`); process.exit(1); };

async function discover() {
  let url = (process.env.SV_MCP_URL || process.env.WORKER_URL || '').replace(/\/+$/, '');
  let token = process.env.SV_MCP_TOKEN || process.env.MCP_TOKEN || '';
  if (!url) {
    for (const c of CANDIDATES) {
      try { const h = await (await fetch(`${c}/health`)).json(); if (h.app === 'agentverse') { url = c; break; } } catch { /* next */ }
    }
  }
  if (!token && process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    const r = await fetch(`${process.env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=agentverse`, { headers: { Authorization: `bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
    if (r.ok) token = (await r.json()).value;
  }
  return { url, token };
}

// Renders the SVG's animation to PNG frames. kenBurns=false freezes the slow picture zoom (keeps GIFs small).
async function renderFrames(svgText, { fps, kenBurns, hold }) {
  const { Resvg } = await import('@resvg/resvg-js');
  // resvg reads fonts from files; the embedded base64 @font-face is only for browsers.
  let svg = String(svgText).replace(/<style>[\s\S]*?<\/style>/, '<style></style>');
  if (!kenBurns) svg = svg.replace(/<animateTransform data-kb="1"[^>]*\/>/g, '');
  const length = animationLength(svg);
  const animFrames = Math.max(1, Math.ceil(length * fps));
  const dir = mkdtempSync(join(tmpdir(), 'signal-frames-'));
  const name = (i) => join(dir, `f${String(i).padStart(4, '0')}.png`);
  for (let i = 0; i <= animFrames; i++) {
    const r = new Resvg(sampleSvgAt(svg, i / fps), { fitTo: { mode: 'width', value: WIDTH }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } });
    writeFileSync(name(i), r.render().asPng());
  }
  const last = readFileSync(name(animFrames));
  for (let i = 1; i <= hold * fps; i++) writeFileSync(name(animFrames + i), last);
  return { dir, frames: animFrames + 1 + hold * fps, seconds: +(length + hold).toFixed(1) };
}

export async function renderGif(svgText, outFile) {
  const f = await renderFrames(svgText, { fps: FPS, kenBurns: false, hold: HOLD });
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(f.dir, 'f%04d.png'),
      '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
      '-loop', '0', outFile]);
    return { frames: f.frames, seconds: f.seconds, bytes: statSync(outFile).size };
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
}

// LinkedIn-ready clip: H.264, 30 fps, 1080x1350, with the slow picture zoom. Silent (no music licensing issues).
export async function renderMp4(svgText, outFile) {
  const f = await renderFrames(svgText, { fps: 30, kenBurns: true, hold: 4 });
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(f.dir, 'f%04d.png'),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile]);
    return { frames: f.frames, seconds: f.seconds, bytes: statSync(outFile).size };
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
}

async function main() {
  const local = arg('--svg');
  if (local) {
    const out = arg('--out') || 'signal.gif';
    const svg = readFileSync(local, 'utf8');
    console.log(JSON.stringify(out.endsWith('.mp4') ? await renderMp4(svg, out) : await renderGif(svg, out)));
    return;
  }
  const { url, token } = await discover();
  if (!url) fail('No AGENTVERSE Worker answered /health.');
  if (!token) fail('No credentials: run on GitHub Actions with id-token: write, or set SV_MCP_TOKEN.');

  // Make sure the post has its illustration first (generated once, by the Worker, on Workers AI).
  const ref = await fetch(`${url}/api/signal/visual-refresh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  console.log(`🖼️  illustration: ${(await ref.text()).slice(0, 200)}`);
  const res = await fetch(`${url}/api/signal/visual?t=${Date.now()}`);
  if (res.status === 404) { console.log('No post generated yet: nothing to animate.'); return; }
  if (!res.ok) fail(`Could not fetch the visual (HTTP ${res.status}).`);
  const postId = res.headers.get('x-post-id');
  if (!postId) fail('Worker did not say which post this visual belongs to (x-post-id).');
  const svgText = await res.text();
  if (!svgText.includes('data-design="bi-editorial-')) { console.log(`Post ${postId} uses a legacy visual without animation: skipping.`); return; }

  const force = process.argv.includes('--force');
  // Layout version + whether the illustration is in: either changing means the motion files are re-made.
  const design = `${(/data-design="([^"]+)"/.exec(svgText) || [])[1] || ''}${svgText.includes('href="data:image/jpeg') ? '+hero' : ''}`;
  const outDir = process.env.SIGNAL_OUT || join(tmpdir(), 'signal-out');
  mkdirSync(outDir, { recursive: true });
  for (const kind of ['mp4', 'gif']) {
    const head = await fetch(`${url}/api/signal/visual.${kind}?post_id=${encodeURIComponent(postId)}`, { method: 'HEAD' });
    if (head.ok && !force && head.headers.get('x-design') === design) { console.log(`${kind.toUpperCase()} for ${postId} (${design}) already exists.`); continue; }
    const out = join(outDir, `${postId}.${kind}`);
    const info = kind === 'mp4' ? await renderMp4(svgText, out) : await renderGif(svgText, out);
    console.log(`🎞️  ${postId}.${kind}: ${info.frames} frames, ${info.seconds}s, ${(info.bytes / 1024 / 1024).toFixed(2)} MB`);
    if (info.bytes > MAX_BYTES) fail(`${kind} is ${(info.bytes / 1024 / 1024).toFixed(1)} MB, over the ${MAX_BYTES / 1024 / 1024} MB limit.`);
    const up = await fetch(`${url}/api/signal/visual-${kind}?post_id=${encodeURIComponent(postId)}&design=${encodeURIComponent(design || '')}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': kind === 'mp4' ? 'video/mp4' : 'image/gif' }, body: readFileSync(out),
    });
    const text = await up.text();
    if (!up.ok) fail(`${kind} upload failed (HTTP ${up.status}): ${text.slice(0, 300)}`);
    console.log(`✅ ${kind} uploaded: ${text.slice(0, 300)}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => fail(e.stack || e.message));
