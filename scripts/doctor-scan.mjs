#!/usr/bin/env node
// Code Doctor scan: runs on GitHub Actions (doctor.yml) against the real repository and the deployed site,
// then uploads the results to the Worker (OIDC auth). Every check reports what it actually ran.
//   node scripts/doctor-scan.mjs              full scan + upload
//   node scripts/doctor-scan.mjs --no-upload  print only
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = ['https://agentverse.aistudio09.workers.dev', 'https://agentverse.pravanigroup.workers.dev'];
const checks = [];
const add = (id, area, title, status, detail = '', fix = null) => { checks.push({ id, area, title, status, detail: String(detail).slice(0, 1500), fix }); console.log(`${{ pass: '✅', warn: '⚠️ ', fail: '❌', info: 'ℹ️ ' }[status]} [${area}] ${title}${detail ? ' — ' + String(detail).split('\n')[0].slice(0, 160) : ''}`); };
const files = (dir, re) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((f) => re.test(f)).map((f) => join(dir, f)) : []);
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

// 1. JavaScript syntax
{
  const js = [...files('mcp/src', /\.m?js$/), ...files('scripts', /\.m?js$/), ...files('mcp/test', /\.m?js$/), 'sw.js'].filter((f) => existsSync(join(ROOT, f)));
  const bad = [];
  for (const f of js) { const r = sh('node', ['--check', f]); if (r.status !== 0) bad.push(`${f}: ${(r.stderr || '').split('\n').slice(0, 4).join(' ')}`); }
  add('js_syntax', 'Code', bad.length ? `${bad.length} JavaScript file(s) do not parse` : `All ${js.length} JavaScript files parse`, bad.length ? 'fail' : 'pass', bad.join('\n'));
}
// 2. Dashboard inline scripts
{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const bad = [];
  let i = 0;
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) { i++; try { new Function(m[1]); } catch (e) { bad.push(`script #${i}: ${e.message}`); } }
  add('html_scripts', 'Code', bad.length ? 'Dashboard script has a syntax error' : `Dashboard: ${i} inline scripts parse`, bad.length ? 'fail' : 'pass', bad.join('\n'));
  const kb = Math.round(statSync(join(ROOT, 'index.html')).size / 1024);
  add('html_size', 'Performance', `Dashboard page is ${kb} KB`, kb > 1500 ? 'warn' : 'info', kb > 1500 ? 'large single file: slower first load on mobile' : '', kb > 1500 ? 'Split rarely used panels into lazily loaded files' : null);
}
// 3. Worker module graph links (catches missing exports / broken imports that --check cannot)
{
  const r = sh('node', ['-e', `import(${JSON.stringify(pathToFileURL(join(ROOT, 'mcp/src/index.mjs')).href)}).then(m=>{if(!m.default||!m.default.fetch)throw new Error('no default fetch handler');console.log('ok')})`]);
  add('imports', 'Code', r.status === 0 ? 'Worker modules link (all imports resolve)' : 'Worker module graph is broken', r.status === 0 ? 'pass' : 'fail', r.status === 0 ? '' : (r.stderr || '').split('\n').slice(0, 6).join('\n'));
}
// 4. Python + workflow YAML
{
  const py = files('scripts', /\.py$/);
  const bad = py.filter((f) => sh('python3', ['-m', 'py_compile', f]).status !== 0);
  add('python', 'Code', bad.length ? `${bad.length} Python script(s) do not compile` : `All ${py.length} Python scripts compile`, bad.length ? 'fail' : 'pass', bad.join(', '));
  const yml = files('.github/workflows', /\.ya?ml$/);
  const r = sh('python3', ['-c', `import sys,yaml\nbad=[]\nfor f in sys.argv[1:]:\n  try: yaml.safe_load(open(f))\n  except Exception as e: bad.append(f+': '+str(e)[:120])\nprint('\\n'.join(bad))`, ...yml]);
  const out = (r.stdout || '').trim();
  add('workflows', 'Automation', out ? 'A GitHub workflow file is invalid' : `All ${yml.length} workflow files are valid YAML`, out ? 'fail' : 'pass', out);
}
// 5. Tests
let tests = null;
{
  const t = files('mcp/test', /\.test\.mjs$/);
  const r = sh('node', ['--test', ...t], { timeout: 10 * 60e3 });
  const out = (r.stdout || '') + (r.stderr || '');
  const n = (k) => Number((new RegExp(`^# ${k} (\\d+)`, 'm').exec(out) || [])[1] || 0);
  tests = { pass: n('pass'), fail: n('fail'), total: n('tests') };
  const failed = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]).slice(0, 10);
  add('tests', 'Tests', tests.fail ? `${tests.fail} of ${tests.total} tests fail` : `${tests.pass}/${tests.total} tests pass`, tests.fail || !tests.total ? 'fail' : 'pass', failed.join('\n'));
}
// 6. Secrets committed to the repository (values are masked in the report)
{
  const patterns = [
    ['Telegram bot token', /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/], ['GitHub token', /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,})\b/],
    ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/], ['OpenAI-style key', /\bsk-[A-Za-z0-9]{32,}\b/], ['Groq key', /\bgsk_[A-Za-z0-9]{40,}\b/],
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/], ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ];
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f && !/\.(png|jpe?g|webp|gif|mp4|ttf|woff2?|ico|xlsx|pdf)$/i.test(f) && !f.startsWith('fonts/'));
  const hits = [];
  for (const f of tracked) {
    let text; try { text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, i) => { for (const [name, re] of patterns) if (re.test(line)) hits.push(`${f}:${i + 1} ${name} (${line.match(re)[0].slice(0, 6)}…)`); });
  }
  add('secrets', 'Security', hits.length ? `${hits.length} secret(s) committed to the public repository` : 'No secrets found in tracked files', hits.length ? 'fail' : 'pass', hits.join('\n'), hits.length ? 'Revoke each one, move it to a Worker/GitHub secret, remove it from the code' : null);
}
// 7. Dependencies
{
  const pkgs = ['package.json', 'mcp/package.json'].filter((f) => existsSync(join(ROOT, f)));
  if (!pkgs.length) add('deps', 'Security', 'No npm dependencies to audit', 'info', 'the Worker and dashboard use no third-party npm packages at runtime');
  else for (const p of pkgs) {
    const r = sh('npm', ['audit', '--json', '--omit=dev'], { cwd: join(ROOT, dirname(p)) });
    try { const v = JSON.parse(r.stdout).metadata?.vulnerabilities || {}; const bad = (v.high || 0) + (v.critical || 0); add(`deps_${p}`, 'Security', `${p}: ${bad} high/critical vulnerabilities`, bad ? 'fail' : 'pass', JSON.stringify(v)); }
    catch { add(`deps_${p}`, 'Security', `${p}: npm audit could not run`, 'warn', (r.stderr || '').slice(0, 300)); }
  }
}
// 8. Live site: API health + browser check at real viewport sizes
let base = process.env.SV_MCP_URL || '';
for (const c of CANDIDATES) { if (base) break; try { const h = await (await fetch(`${c}/health`)).json(); if (h.app === 'agentverse') base = c; } catch { /* next */ } }
if (!base) add('live', 'Integrations', 'Deployed Worker did not answer /health', 'fail', CANDIDATES.join(', '));
else {
  for (const [path, want] of [['/health', 200], ['/api/schedule', 200], ['/api/signal/draft', 200]]) {
    try { const r = await fetch(base + path); add(`api${path.replace(/\W+/g, '_')}`, 'API', `GET ${path} → ${r.status}`, r.status === want ? 'pass' : 'fail', ''); }
    catch (e) { add(`api${path.replace(/\W+/g, '_')}`, 'API', `GET ${path} failed`, 'fail', e.message); }
  }
  let chromium = null;
  try { ({ chromium } = await import('playwright')); } catch { add('browser', 'UI', 'Browser check skipped: Playwright not installed', 'info'); }
  if (chromium) {
    const browser = await chromium.launch();
    for (const [w, h, label] of [[1920, 1080, 'desktop-1920'], [1440, 900, 'laptop-1440'], [390, 844, 'phone-390']]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errors = [], failed = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
      page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
      page.on('response', (r) => { if (r.status() >= 500 || (r.status() >= 400 && ![401, 403, 404].includes(r.status()))) failed.push(`${r.status()} ${r.url().replace(base, '')}`); });
      try {
        await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 60e3 });
        await page.evaluate(() => { const s = document.getElementById('immSkip'); if (s) s.click(); });
        await page.waitForTimeout(2500);
        const m = await page.evaluate(() => {
          const wrap = document.getElementById('wrap');
          const vw = document.documentElement.clientWidth;
          const res = { overflowX: document.documentElement.scrollWidth - vw, emptyPct: null };
          if (wrap && wrap.offsetParent !== null) {
            const W = wrap.getBoundingClientRect();
            const kids = [...wrap.children].filter((k) => k.id !== 'wires' && k.offsetParent !== null).map((k) => k.getBoundingClientRect());
            const used = kids.reduce((a, r) => a + r.width * r.height, 0);
            res.emptyPct = Math.round(100 * (1 - used / Math.max(1, W.width * W.height)));
          }
          return res;
        });
        add(`ui_${label}`, 'UI', `${label}: ${errors.length} console error(s), ${failed.length} failed request(s), overview ${m.emptyPct ?? '?'}% empty`,
          errors.length || failed.length ? 'fail' : (m.overflowX > 2 || (m.emptyPct ?? 0) > 35) ? 'warn' : 'pass',
          [...errors.slice(0, 5), ...failed.slice(0, 5), m.overflowX > 2 ? `page is ${m.overflowX}px wider than the screen` : ''].filter(Boolean).join('\n'));
        const shot = await page.screenshot({ type: 'jpeg', quality: 45, fullPage: label !== 'phone-390' });
        writeFileSync(join(ROOT, `doctor-${label}.jpg`), shot);
        if (process.env.DOCTOR_PRINT_SHOTS) console.log(`::group::shot ${label}\nSHOT_BEGIN ${label}\n${shot.toString('base64')}\nSHOT_END ${label}\n::endgroup::`);
      } catch (e) { add(`ui_${label}`, 'UI', `${label}: page did not load`, 'fail', e.message); }
      await page.close();
    }
    await browser.close();
  }
}

const summary = { pass: checks.filter((c) => c.status === 'pass').length, warn: checks.filter((c) => c.status === 'warn').length, fail: checks.filter((c) => c.status === 'fail').length };
console.log(`\nCode Doctor: ${summary.pass} passed · ${summary.warn} warnings · ${summary.fail} critical`);
const report = { commit: process.env.GITHUB_SHA || '', run_url: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '', tests, checks };
writeFileSync(join(ROOT, 'doctor-report.json'), JSON.stringify(report, null, 2));

if (!process.argv.includes('--no-upload') && base) {
  let token = process.env.SV_MCP_TOKEN || '';
  if (!token && process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    const r = await fetch(`${process.env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=agentverse`, { headers: { Authorization: `bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
    if (r.ok) token = (await r.json()).value;
  }
  if (!token) console.log('No upload credentials: report kept in doctor-report.json');
  else {
    const up = await fetch(`${base}/api/doctor/report`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(report) });
    console.log(`Upload: HTTP ${up.status} ${(await up.text()).slice(0, 200)}`);
  }
}
// The scan itself succeeds even when it finds problems; the findings are the output.
