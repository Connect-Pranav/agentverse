#!/usr/bin/env node
// PRANAV SIGNAL — animated GIF of the day's LinkedIn visual.
// Takes the visual the Worker already chose (one per post), plays its SMIL animation frame by frame,
// renders each frame with resvg (real Manrope / Inter / IBM Plex Mono files), encodes a looping GIF with
// ffmpeg and uploads it to the Worker, which stores it and sends it to Telegram for approval.
//
// GitHub Actions:  node scripts/signal-gif.mjs            (OIDC auth, skips if today's GIF exists)
// Local test:      node scripts/signal-gif.mjs --svg in.svg --out out.gif
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleSvgAt, animationLength } from '../mcp/src/editorial_templates.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = ['Manrope-700', 'Manrope-800', 'Inter-400', 'Inter-600', 'IBMPlexMono-400', 'IBMPlexMono-700'].map((f) => join(HERE, 'fonts', `${f}.ttf`));
const FPS = 12;          // smooth enough for bars and fades, keeps the file small
const HOLD = 3;          // seconds the finished frame stays before the loop restarts
const WIDTH = 1080;      // 1080 x 1350 (4:5), LinkedIn's portrait feed size
const MAX_BYTES = 8 * 1024 * 1024;

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

export async function renderGif(svgText, outFile) {
  const { Resvg } = await import('@resvg/resvg-js');
  // resvg reads fonts from files; the embedded base64 @font-face is only for browsers.
  const svg = String(svgText).replace(/<style>[\s\S]*?<\/style>/, '<style></style>');
  const length = animationLength(svg);
  const animFrames = Math.max(1, Math.ceil(length * FPS));
  const dir = mkdtempSync(join(tmpdir(), 'signal-gif-'));
  try {
    const render = (t, i) => {
      const r = new Resvg(sampleSvgAt(svg, t), {
        fitTo: { mode: 'width', value: WIDTH },
        font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' },
      });
      writeFileSync(join(dir, `f${String(i).padStart(4, '0')}.png`), r.render().asPng());
    };
    for (let i = 0; i <= animFrames; i++) render(i / FPS, i);
    // Final frame held: the encoder stores repeated frames as tiny "no change" frames.
    const last = readFileSync(join(dir, `f${String(animFrames).padStart(4, '0')}.png`));
    for (let i = 1; i <= HOLD * FPS; i++) writeFileSync(join(dir, `f${String(animFrames + i).padStart(4, '0')}.png`), last);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'),
      '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
      '-loop', '0', outFile]);
    return { frames: animFrames + 1 + HOLD * FPS, seconds: +(length + HOLD).toFixed(1), bytes: statSync(outFile).size };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const local = arg('--svg');
  if (local) {
    const info = await renderGif(readFileSync(local, 'utf8'), arg('--out') || 'signal.gif');
    console.log(JSON.stringify(info));
    return;
  }
  const { url, token } = await discover();
  if (!url) fail('No AGENTVERSE Worker answered /health.');
  if (!token) fail('No credentials: run on GitHub Actions with id-token: write, or set SV_MCP_TOKEN.');

  const res = await fetch(`${url}/api/signal/visual?t=${Date.now()}`);
  if (res.status === 404) { console.log('No post generated yet: nothing to animate.'); return; }
  if (!res.ok) fail(`Could not fetch the visual (HTTP ${res.status}).`);
  const postId = res.headers.get('x-post-id');
  if (!postId) fail('Worker did not say which post this visual belongs to (x-post-id).');
  const svgText = await res.text();
  if (!svgText.includes('data-design="bi-editorial-v1"')) { console.log(`Post ${postId} uses a legacy visual without animation: skipping.`); return; }

  const force = process.argv.includes('--force');
  const head = await fetch(`${url}/api/signal/visual.gif?post_id=${encodeURIComponent(postId)}`, { method: 'HEAD' });
  if (head.ok && !force) { console.log(`GIF for ${postId} already exists.`); return; }

  const out = join(tmpdir(), `${postId}.gif`);
  const info = await renderGif(svgText, out);
  console.log(`🎞️  ${postId}: ${info.frames} frames, ${info.seconds}s, ${(info.bytes / 1024 / 1024).toFixed(2)} MB`);
  if (info.bytes > MAX_BYTES) fail(`GIF is ${(info.bytes / 1024 / 1024).toFixed(1)} MB, over the ${MAX_BYTES / 1024 / 1024} MB limit.`);

  const up = await fetch(`${url}/api/signal/visual-gif?post_id=${encodeURIComponent(postId)}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/gif' }, body: readFileSync(out),
  });
  const text = await up.text();
  if (!up.ok) fail(`Upload failed (HTTP ${up.status}): ${text.slice(0, 300)}`);
  console.log(`✅ Uploaded: ${text.slice(0, 300)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => fail(e.stack || e.message));
