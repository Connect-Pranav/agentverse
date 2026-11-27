// ============================================================
// PRANAV SIGNAL - Business Intelligence Editorial design system
// Canvas 1200 x 1500 (4:5), 72 px safe margins, 12-col grid, 24 px gutter, 8 px base unit.
// Every word and figure on a visual comes from the case's own sourced fields in case_bank.mjs.
// Nothing is invented: no charts or KPIs are drawn because the case bank has no numeric series.
// Fonts (Manrope / Inter / IBM Plex Mono) are injected at serve/export time from /fonts/signal-fonts.css,
// so stored SVGs stay small. Text is wrapped by real glyph widths (font_metrics.mjs).
// ============================================================
import { FONT_METRICS } from './font_metrics.mjs';

export const TOKENS = {
  navy: '#14243A', midnight: '#0D1726', ivory: '#F5F3EE', white: '#FFFFFF',
  blue: '#2870C8', teal: '#0C9285', slate: '#64748B', border: '#DCE2E9',
  green: '#23866B', coral: '#DC6656', amber: '#D49A35', lavender: '#8276B8',
  lightBlue: '#EAF1FA', lightTeal: '#E7F3F0', lightCoral: '#FAEBE8', lightGrey: '#EEF1F4',
};
export const CANVAS = { w: 1200, h: 1500, m: 72 };
const CW = CANVAS.w - 2 * CANVAS.m; // 1056 content width
const COL = (CW - 11 * 24) / 12;     // 66 px
const span = (n) => n * COL + (n - 1) * 24;

export const FONT_FAMILY = {
  head: "Manrope, Inter, 'Segoe UI', sans-serif",
  body: "Inter, 'Segoe UI', Roboto, sans-serif",
  mono: "'IBM Plex Mono', 'Roboto Mono', ui-monospace, monospace",
};
const FAM_KEY = { head: 'Manrope', body: 'Inter', mono: 'IBM Plex Mono' };

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── Measuring and wrapping ─────────────────────────────────
export function measure(text, fam, weight, size, tracking = 0) {
  const m = FONT_METRICS[`${FAM_KEY[fam]}|${weight}`] || FONT_METRICS['Inter|400'];
  let w = 0;
  for (const ch of String(text)) w += (m[ch] ?? 600);
  return (w * size) / 1000 + tracking * Math.max(0, [...String(text)].length - 1);
}

export function wrapPx(text, maxW, f) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && measure(t, f.fam, f.weight, f.size, f.tracking) > maxW) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function clampLines(lines, max, maxW, f) {
  if (lines.length <= max) return lines;
  const out = lines.slice(0, max);
  let last = out[max - 1];
  while (last && measure(`${last}…`, f.fam, f.weight, f.size) > maxW) last = last.replace(/\s*\S+$/, '');
  out[max - 1] = `${last.replace(/[,;:.\s]+$/, '')}…`;
  return out;
}

// Largest size in `sizes` whose wrapped text fits in maxLines; otherwise the smallest size, clamped.
function fit(text, maxW, { fam, weight, sizes, lh, maxLines, tracking = 0 }) {
  for (const size of sizes) {
    const f = { fam, weight, size, tracking };
    const lines = wrapPx(text, maxW, f);
    if (lines.length <= maxLines) return { lines, size, lh, fam, weight, tracking, height: lines.length * size * lh };
  }
  const size = sizes[sizes.length - 1];
  const f = { fam, weight, size, tracking };
  const lines = clampLines(wrapPx(text, maxW, f), maxLines, maxW, f);
  fit.clamped = true;
  return { lines, size, lh, fam, weight, tracking, height: lines.length * size * lh, clamped: true };
}

// Renders a fitted block with its first baseline placed so the cap height sits at `top`.
function block(b, x, top, fill, extra = '') {
  if (!b.lines.length) return '';
  const first = top + b.size * 0.8;
  const ls = b.tracking ? ` letter-spacing="${b.tracking}"` : '';
  return b.lines.map((l, i) =>
    `<text x="${x}" y="${(first + i * b.size * b.lh).toFixed(1)}" font-family="${FONT_FAMILY[b.fam]}" font-weight="${b.weight}" font-size="${b.size}" fill="${fill}"${ls}${extra}>${esc(l)}</text>`).join('\n  ');
}

function eyebrow(text, x, y, fill, anchor = 'start') {
  return `<text x="${x}" y="${y}" font-family="${FONT_FAMILY.mono}" font-weight="400" font-size="13" letter-spacing="1.4" fill="${fill}" text-anchor="${anchor}">${esc(String(text).toUpperCase())}</text>`;
}

// ─── Content extraction (from sourced case fields only) ─────
export function sentences(t = '') {
  return String(t).split(/(?<=[.!?])\s+(?=[A-Z0-9"“])|;\s+/).map((x) => x.trim()).filter(Boolean);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const stripEnd = (s) => s.replace(/[.;:\s]+$/, '');
const asSentence = (s) => { const t = stripEnd(String(s || '').trim()); return /[?!]$/.test(t) ? t : `${t}.`; };

export function actionItems(fix = '') {
  let items = String(fix).split(/;\s*|\n+|\s*\d+\.\s+/).map((s) => stripEnd(s.trim())).filter((s) => s.length > 3);
  if (items.length === 1 && items[0].includes(':')) {
    const [lead, rest] = [items[0].slice(0, items[0].indexOf(':')), items[0].slice(items[0].indexOf(':') + 1)];
    const parts = rest.split(/,\s*(?:and\s+)?|\s+and\s+/).map((s) => stripEnd(s.trim())).filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => p.length <= 70)) items = [lead, ...parts];
  }
  // "Protect X, limit Y and run Z" -> three checklist items, but only when every part starts with an action verb.
  if (items.length === 1) {
    const isVerb = (x) => ACTION_VERBS.has(x.trim().split(/\s+/)[0].toLowerCase());
    const parts = [];
    for (const chunk of items[0].split(/,\s*(?:and\s+)?/)) {
      // "limit X and run Y": split on the " and " that starts a new action, not on "retention and network health".
      const m = chunk.split(/\s+and\s+/);
      let cur = m[0];
      for (const nxt of m.slice(1)) { if (isVerb(nxt)) { parts.push(cur); cur = nxt; } else cur += ` and ${nxt}`; }
      parts.push(cur);
    }
    parts.forEach((x, i) => { parts[i] = stripEnd(x.trim()); });
    if (parts.length >= 2 && parts.every(isVerb)) items = parts;
  }
  return items.slice(0, 5).map(cap);
}
const ACTION_VERBS = new Set(('add align assign audit avoid benchmark build cap check create cut define delay design document enforce escalate establish ' +
  'focus fund give hire introduce invest keep limit link maintain make map measure model monitor move own partner phase pilot plan price prioritise ' +
  'prioritize protect publish raise reduce reprice require review run segment separate set shift simplify standardise standardize start stop ' +
  'test tie track train treat use validate verify').split(' '));

export function sourceLabel(cd) {
  let host = '';
  try { if (cd.sourceUrl) host = new URL(cd.sourceUrl).hostname.replace(/^www\./, ''); } catch (_) { /* no url */ }
  return [cd.evidenceType, host].filter(Boolean).join(' · ') || 'Case bank';
}

const caseNo = (cd) => String(cd.caseNumber || '').padStart(2, '0');
const svgOpen = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" width="${CANVAS.w}" height="${CANVAS.h}" data-design="bi-editorial-v1">
  <style>/*@signal-fonts*/</style>
  <rect width="${CANVAS.w}" height="${CANVAS.h}" fill="${bg}"/>`;

function footer(left, right, colors) {
  const y = CANVAS.h - CANVAS.m;
  const room = CW - measure(left, 'body', 400, 13) - 40;
  const mono = { fam: 'mono', weight: 400, size: 12 };
  const short = right.replace(/Primary\s*[–-]\s*/i, '');
  const hostOnly = right.includes(' · ') ? `Source: ${right.split(' · ').pop()}` : short;
  const pick = [right, short, hostOnly].find((t) => measure(t, 'mono', 400, 12) <= room) || hostOnly;
  const rightFit = clampLines(wrapPx(pick, room, mono), 1, room, mono)[0] || '';
  return `<line x1="${CANVAS.m}" y1="${y - 28}" x2="${CANVAS.w - CANVAS.m}" y2="${y - 28}" stroke="${colors.rule}" stroke-width="1"/>
  <text x="${CANVAS.m}" y="${y}" font-family="${FONT_FAMILY.body}" font-weight="400" font-size="13" fill="${colors.text}">${esc(left)}</text>
  <text x="${CANVAS.w - CANVAS.m}" y="${y}" font-family="${FONT_FAMILY.mono}" font-weight="400" font-size="12" fill="${colors.text}" text-anchor="end">${esc(rightFit)}</text>`;
}

// Picks the densest layout that still fits the canvas: tries roomy settings first, then tighter ones.
// Sourced text is only shortened (whole layout at its tightest level) when nothing else fits.
function firstThatFits(levels, build) {
  let fallback = null;
  for (const lv of levels) {
    fit.clamped = false;
    const r = build(lv);
    const limit = CANVAS.h - CANVAS.m - 56;
    const fits = r.bottom <= limit;
    if (fits && !fit.clamped) {
      const gaps = lv.gaps || 0;
      const free = limit - r.bottom - 24;
      if (!gaps || free < 48) return r.svg;
      const spread = build({ ...lv, spread: Math.min(lv.maxSpread || 40, Math.floor(free / gaps)) });
      return spread.bottom <= limit ? spread.svg : r.svg;
    }
    if (fits && !fallback) fallback = r.svg;
  }
  return fallback || build(levels[levels.length - 1]).svg;
}

// ─── 07 Business Failure Autopsy (Ivory, Navy, Coral) ──────
export function generateFailureAutopsy({ caseData }) {
  const cd = caseData || {};
  const T = TOKENS, M = CANVAS.m;
  const levels = [
    { head: [72, 68], headLines: 3, body: [22, 21], bodyLines: 7, lesson: 21, gap: 48, gaps: 4 },
    { head: [68, 64, 60], headLines: 3, body: [21, 20], bodyLines: 7, lesson: 20, gap: 48, gaps: 4 },
    { head: [64, 60], headLines: 4, body: [20], bodyLines: 6, lesson: 20, gap: 40, gaps: 4 },
    { head: [60], headLines: 4, body: [18], bodyLines: 5, lesson: 18, gap: 32 },
    { head: [56, 52], headLines: 5, body: [18], bodyLines: 6, lesson: 18, gap: 32 },
  ];
  return firstThatFits(levels, (lv) => {
    const parts = [svgOpen(T.ivory)];
    let y = M;
    // Tag pill + eyebrow row
    const tag = 'BUSINESS FAILURE AUTOPSY';
    const tagW = measure(tag, 'mono', 400, 12, 1.4) + 32;
    parts.push(`<rect x="${M}" y="${y}" width="${tagW.toFixed(0)}" height="32" rx="16" fill="${T.lightCoral}"/>`,
      `<text x="${M + 16}" y="${y + 21}" font-family="${FONT_FAMILY.mono}" font-size="12" letter-spacing="1.4" fill="${T.coral}">${tag}</text>`,
      eyebrow(`Case ${caseNo(cd)} · ${cd.period || ''}`, CANVAS.w - M, y + 21, T.slate, 'end'));
    y += 32 + 40;
    // Headline: the case's own post angle, sentence case
    const h = fit(asSentence(cd.postAngle || cd.documentedProblem || cd.company), CW, { fam: 'head', weight: 800, sizes: lv.head, lh: 1.05, maxLines: lv.headLines });
    parts.push(block(h, M, y, T.navy));
    y += h.height + 24;
    // Company line
    const co = `${cd.company || ''}`;
    parts.push(`<text x="${M}" y="${y + 18}" font-family="${FONT_FAMILY.body}" font-weight="600" font-size="22" fill="${T.navy}">${esc(co)}<tspan fill="${T.slate}" font-weight="400">  ·  ${esc(cd.industry || '')}</tspan></text>`);
    y += 22 + 12;
    const prof = fit(cd.companyProfile || '', span(10), { fam: 'body', weight: 400, sizes: [18, 17], lh: 1.4, maxLines: 2 });
    parts.push(block(prof, M, y, T.slate));
    const sp = lv.spread || 0;
    y += prof.height + lv.gap - 8 + sp;
    // Period timeline replaces the plain divider when the case has dated years.
    const tl = timeline(cd, M, y - 8, CW, { label: T.slate, track: T.border, accent: T.coral });
    if (tl.h) { parts.push(tl.svg); y += tl.h; } else parts.push(`<line x1="${M}" y1="${y}" x2="${CANVAS.w - M}" y2="${y}" stroke="${T.border}" stroke-width="1"/>`);
    y += lv.gap - 8 + sp;

    // Two cards: what went wrong / why it happened
    const half = span(6), pad = 28, innerW = half - 2 * pad;
    const bodyOpts = { fam: 'body', weight: 400, sizes: lv.body, lh: 1.45, maxLines: lv.bodyLines };
    const wrong = fit(cd.documentedProblem || '', innerW, bodyOpts);
    const why = fit(cd.rootCauseAnalysis || '', innerW, bodyOpts);
    const cardH = pad + 28 + 20 + Math.max(wrong.height, why.height) + pad;
    const cards = [
      { x: M, title: 'What went wrong', b: wrong, bg: T.lightCoral, stroke: 'none', titleFill: T.coral },
      { x: M + half + 24, title: 'Why it happened', b: why, bg: T.white, stroke: T.border, titleFill: T.navy },
    ];
    for (const c of cards) {
      parts.push(`<rect x="${c.x}" y="${y}" width="${half}" height="${cardH.toFixed(0)}" rx="14" fill="${c.bg}"${c.stroke !== 'none' ? ` stroke="${c.stroke}" stroke-width="1"` : ''}/>`,
        `<text x="${c.x + pad}" y="${y + pad + 22}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="28" fill="${c.titleFill}">${esc(c.title)}</text>`,
        block(c.b, c.x + pad, y + pad + 28 + 20, T.navy));
    }
    y += cardH + 24 + sp;

    // What it cost (full width, coral rule)
    const cost = fit(cd.businessImpact || cd.documentedResponse || '', CW - 2 * pad - 8, { fam: 'body', weight: 400, sizes: lv.body, lh: 1.45, maxLines: 4 });
    const costH = pad + 28 + 20 + cost.height + pad;
    parts.push(`<rect x="${M}" y="${y}" width="${CW}" height="${costH.toFixed(0)}" rx="14" fill="${T.white}" stroke="${T.border}" stroke-width="1"/>`,
      `<rect x="${M}" y="${y + 20}" width="4" height="${(costH - 40).toFixed(0)}" rx="2" fill="${T.coral}"/>`,
      `<text x="${M + pad + 8}" y="${y + pad + 22}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="28" fill="${T.navy}">What it cost</text>`,
      block(cost, M + pad + 8, y + pad + 28 + 20, T.navy));
    y += costH + 24 + sp;

    // Operator lessons (light teal, numbered)
    const items = actionItems(cd.recommendedFix);
    const lessonW = CW - 2 * pad - 56;
    const fitted = items.map((t) => fit(t + '.', lessonW, { fam: 'body', weight: 400, sizes: [lv.lesson], lh: 1.4, maxLines: 2 }));
    const listH = fitted.reduce((a, b) => a + b.height, 0) + Math.max(0, fitted.length - 1) * 14;
    const lessonsH = pad + 28 + 24 + listH + pad;
    parts.push(`<rect x="${M}" y="${y}" width="${CW}" height="${lessonsH.toFixed(0)}" rx="14" fill="${T.lightTeal}"/>`,
      `<text x="${M + pad}" y="${y + pad + 22}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="28" fill="${T.navy}">Operator lessons</text>`);
    let ly = y + pad + 28 + 24;
    fitted.forEach((b, i) => {
      parts.push(`<text x="${M + pad}" y="${(ly + b.size * 0.8).toFixed(1)}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="${b.size}" fill="${T.teal}">${String(i + 1).padStart(2, '0')}</text>`,
        block(b, M + pad + 56, ly, T.navy));
      ly += b.height + 14;
    });
    y += lessonsH;

    parts.push(footer(`Business failure autopsy · ${cd.theme || ''}`, `Source: ${sourceLabel(cd)}`, { rule: T.border, text: T.slate }), '</svg>');
    return { svg: parts.join('\n  '), bottom: y };
  });
}

// ─── 10 Big Idea / Editorial Cover (Midnight, White, Amber) ─
export function generateEditorialCover({ caseData }) {
  const cd = caseData || {};
  const T = TOKENS, M = CANVAS.m;
  const soft = '#AEB9C8', rule = '#24344B';
  const levels = [
    { head: [96, 92, 88], headLines: 5, body: [24, 22], bodyLines: 5 },
    { head: [84, 80], headLines: 6, body: [22, 21], bodyLines: 5 },
    { head: [72, 68], headLines: 6, body: [21, 20], bodyLines: 4 },
    { head: [64, 60], headLines: 7, body: [20], bodyLines: 5 },
  ];
  return firstThatFits(levels, (lv) => {
    const pad = 32, bottomLimit = CANVAS.h - M - 56;
    const h = fit(asSentence(cd.postAngle || cd.documentedProblem), CW, { fam: 'head', weight: 800, sizes: lv.head, lh: 1.05, maxLines: lv.headLines });
    const prob = fit(cd.documentedProblem || '', span(10), { fam: 'body', weight: 400, sizes: lv.body, lh: 1.45, maxLines: lv.bodyLines });
    const cost = fit(cd.businessImpact || '', CW - 2 * pad, { fam: 'body', weight: 600, sizes: lv.body, lh: 1.45, maxLines: 4 });
    const panelH = pad + 13 + 20 + cost.height + pad;
    const storyH = h.height + 48 + 4 + 40 + 28 + 24 + prob.height + 104;
    const top = M + 13 + 64;
    const panelY = bottomLimit - panelH;
    const free = panelY - 64 - top - storyH;
    if (free < 0) return { svg: '', bottom: Infinity };

    let y = top + Math.round(free * 0.45);
    const parts = [svgOpen(T.midnight)];
    parts.push(eyebrow(`Case ${caseNo(cd)} · ${cd.theme || ''}`, M, M + 13, T.amber), eyebrow(cd.period || '', CANVAS.w - M, M + 13, soft, 'end'));
    parts.push(block(h, M, y, T.white));
    y += h.height + 48;
    parts.push(`<rect x="${M}" y="${y}" width="96" height="4" rx="2" fill="${T.amber}"/>`);
    y += 4 + 40;
    parts.push(`<text x="${M}" y="${y + 20}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="28" fill="${T.white}">${esc(cd.company || '')}<tspan font-family="${FONT_FAMILY.body}" font-weight="400" font-size="20" fill="${soft}">  ·  ${esc(cd.industry || '')}</tspan></text>`);
    y += 28 + 24;
    parts.push(block(prob, M, y, soft));
    const tl = timeline(cd, M, y + prob.height + Math.max(48, Math.floor((panelY - (y + prob.height) - 56) / 2)), CW, { label: soft, track: '#24344B', accent: T.coral });
    if (y + prob.height + 48 + tl.h <= panelY - 24) parts.push(tl.svg);
    parts.push(`<rect x="${M}" y="${panelY}" width="${CW}" height="${panelH.toFixed(0)}" rx="14" fill="#132238" stroke="${rule}" stroke-width="1"/>`,
      eyebrow('What it cost', M + pad, panelY + pad + 13, T.amber),
      block(cost, M + pad, panelY + pad + 13 + 20, T.white));
    parts.push(footer(`Editorial · ${cd.theme || ''}`, `Source: ${sourceLabel(cd)}`, { rule, text: '#8A97A8' }), '</svg>');
    return { svg: parts.join('\n  '), bottom: panelY + panelH };
  });
}

// ─── 09 Executive Cheat Sheet (White, Navy, Blue + Teal) ────
export function generateExecCheatSheet({ caseData }) {
  const cd = caseData || {};
  const T = TOKENS, M = CANVAS.m;
  const levels = [
    { head: [72, 68], headLines: 2, mod: [21, 20], modLines: 11, rule: [36, 34], item: 22, gap: 56, itemGap: 28, gaps: 3 },
    { head: [68, 64], headLines: 2, mod: [20, 19], modLines: 10, rule: [32, 30], item: 21, gap: 48, itemGap: 24, gaps: 3 },
    { head: [64, 60], headLines: 2, mod: [18, 17], modLines: 9, rule: [30, 28], item: 20, gap: 40, itemGap: 20, gaps: 3 },
    { head: [60], headLines: 3, mod: [17, 16], modLines: 8, rule: [28], item: 19, gap: 32, itemGap: 16 },
    { head: [56], headLines: 3, mod: [16], modLines: 9, rule: [26], item: 18, gap: 32, itemGap: 16 },
  ];
  return firstThatFits(levels, (lv) => {
    const parts = [svgOpen(T.white)];
    let y = M;
    parts.push(eyebrow(`Executive cheat sheet · Case ${caseNo(cd)}`, M, y + 13, T.blue), eyebrow(cd.period || '', CANVAS.w - M, y + 13, T.slate, 'end'));
    y += 13 + 48;
    const h = fit(`What ${cd.company || 'this case'} teaches operators`, CW, { fam: 'head', weight: 800, sizes: lv.head, lh: 1.05, maxLines: lv.headLines });
    parts.push(block(h, M, y, T.navy));
    y += h.height + 16;
    parts.push(`<text x="${M}" y="${y + 16}" font-family="${FONT_FAMILY.body}" font-weight="400" font-size="18" fill="${T.slate}">${esc([cd.theme, cd.industry].filter(Boolean).join('  ·  '))}</text>`);
    const sp = lv.spread || 0;
    y += 18 + lv.gap + sp;

    // Three modules: problem / root cause / impact (4 columns each)
    const w = span(4), pad = 24, inner = w - 2 * pad;
    const mods = [
      { t: 'Problem', s: cd.documentedProblem, acc: T.coral },
      { t: 'Root cause', s: cd.rootCauseAnalysis, acc: T.blue },
      { t: 'Impact', s: cd.businessImpact, acc: T.navy },
    ].map((m) => ({ ...m, b: fit(m.s || '', inner, { fam: 'body', weight: 400, sizes: lv.mod, lh: 1.45, maxLines: lv.modLines }) }));
    const modH = pad + 13 + 20 + Math.max(...mods.map((m) => m.b.height)) + pad;
    mods.forEach((m, i) => {
      const x = M + i * (w + 24);
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${modH.toFixed(0)}" rx="14" fill="${T.white}" stroke="${T.border}" stroke-width="1"/>`,
        `<rect x="${x + pad}" y="${y + pad - 2}" width="24" height="3" rx="1.5" fill="${m.acc}"/>`,
        eyebrow(m.t, x + pad, y + pad + 20, T.navy),
        block(m.b, x + pad, y + pad + 13 + 28, T.navy));
    });
    y += modH + lv.gap + sp;

    // Decision rule (light blue, blue rule)
    const rp = 32;
    const rl = fit(asSentence(cd.postAngle), CW - 2 * rp - 8, { fam: 'head', weight: 700, sizes: lv.rule, lh: 1.2, maxLines: 3 });
    const ruleH = rp + 13 + 20 + rl.height + rp;
    parts.push(`<rect x="${M}" y="${y}" width="${CW}" height="${ruleH.toFixed(0)}" rx="14" fill="${T.lightBlue}"/>`,
      `<rect x="${M}" y="${y + 20}" width="4" height="${(ruleH - 40).toFixed(0)}" rx="2" fill="${T.blue}"/>`,
      eyebrow('Decision rule', M + rp + 8, y + rp + 13, T.blue),
      block(rl, M + rp + 8, y + rp + 13 + 20, T.navy));
    y += ruleH + lv.gap + sp;

    // Checklist
    parts.push(`<text x="${M}" y="${y + 22}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="30" fill="${T.navy}">Operator checklist</text>`);
    y += 30 + 32;
    for (const it of actionItems(cd.recommendedFix)) {
      const b = fit(it + '.', CW - 64, { fam: 'body', weight: 400, sizes: [lv.item], lh: 1.4, maxLines: 2 });
      const cy = y + b.size * 0.4 - 11;
      parts.push(`<rect x="${M}" y="${cy.toFixed(1)}" width="22" height="22" rx="6" fill="none" stroke="${T.teal}" stroke-width="2"/>`,
        `<path d="M${M + 5} ${(cy + 11).toFixed(1)} l4.5 4.5 l8 -9" fill="none" stroke="${T.teal}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
        block(b, M + 40, y, T.navy));
      y += b.height + lv.itemGap;
      parts.push(`<line x1="${M + 40}" y1="${(y - lv.itemGap / 2).toFixed(1)}" x2="${CANVAS.w - M}" y2="${(y - lv.itemGap / 2).toFixed(1)}" stroke="${T.border}" stroke-width="1"/>`);
    }
    parts.push(footer(`Executive cheat sheet · ${cd.theme || ''}`, `Source: ${sourceLabel(cd)}`, { rule: T.border, text: T.slate }), '</svg>');
    return { svg: parts.join('\n  '), bottom: y };
  });
}

// ─── Sourced figures (the only numbers a visual may show) ───
const FIG_RE = /([$£€₹])\s?(\d[\d,]*(?:\.\d+)?)\s?(trillion|tn|billion|bn|million|mn|m|k)?\b|(\d[\d,]*(?:\.\d+)?)\s?(%|per cent|percent)/gi;
const MULT = { trillion: 1e12, tn: 1e12, billion: 1e9, bn: 1e9, million: 1e6, mn: 1e6, m: 1e6, k: 1e3 };
const STOP = new Set(['of', 'about', 'roughly', 'approximately', 'around', 'up', 'to', 'a', 'an', 'the', 'nearly', 'over', 'some', 'and', 'with', 'reported', 'recorded', 'showed', 'its', 'by', 'from', 'was', 'were', 'is']);

function labelBefore(text) {
  const words = text.replace(/[,;:()]/g, ' ').trim().split(/\s+/);
  while (words.length && STOP.has(words[words.length - 1].toLowerCase())) words.pop();
  const out = words.slice(-3);
  while (out.length && STOP.has(out[0].toLowerCase())) out.shift();
  return out.join(' ');
}

// Finds money / percentage figures in the case's sourced text, with the sentence they came from.
export function extractFigures(cd = {}) {
  for (const field of ['businessImpact', 'documentedResponse', 'documentedProblem']) {
    for (const sentence of sentences(cd[field] || '')) {
      const figs = [];
      for (const m of sentence.matchAll(FIG_RE)) {
        const isPct = Boolean(m[5]);
        const num = parseFloat((isPct ? m[4] : m[2]).replace(/,/g, ''));
        if (!Number.isFinite(num) || (!isPct && !m[1])) continue;
        const before = sentence.slice(0, m.index);
        const after = sentence.slice(m.index + m[0].length);
        const yr = /^\s+in\s+((?:FY|Q[1-4]\s)?\d{4})/i.exec(after);
        figs.push({
          raw: m[0].replace(/\s+/g, ''), unit: isPct ? '%' : m[1],
          value: isPct ? num : num * (MULT[(m[3] || '').toLowerCase()] || 1),
          label: yr ? yr[1] : labelBefore(before), year: yr ? parseInt(yr[1].replace(/\D/g, ''), 10) : null,
          before, after,
        });
      }
      if (figs.length) return { field, sentence, figs };
    }
  }
  return null;
}

// A chart is only drawn for 2+ sourced figures of the same unit with usable labels.
export function chartData(cd) {
  const f = extractFigures(cd);
  if (!f || f.figs.length < 2) return null;
  const figs = f.figs.filter((x) => x.unit === f.figs[0].unit);
  if (figs.length < 2) return null;
  // "from $A to $B [after X]" -> Before / After
  if (figs.length === 2 && /\bfrom\b[^$£€₹\d]*$/i.test(figs[0].before) && /^\s*to\b/i.test(figs[0].after.slice(0, 12))) {
    const tail = /^\s+(after [^;,.]+)/i.exec(figs[1].after);
    figs[0].label = 'Before';
    figs[1].label = tail ? cap(tail[1]) : 'After';
    figs[1].trend = figs[1].value < figs[0].value ? 'down' : 'up';
  }
  if (figs.every((x) => x.year)) figs.sort((x, y) => x.year - y.year);
  if (figs.some((x) => !x.label)) return null;
  figs.forEach((x) => { x.label = cap(x.label); });
  return { ...f, figs };
}

const DRAMA = /\b(bankrupt\w*|collapse\w*|closed?|closures?|exit\w*|administration|insolven\w*|liquidat\w*|wiped|fell|lost|losses|failed|failure|crisis|penalt\w*|fines?|recall\w*|scandal|breach\w*|fraud\w*|impairment|write-?down)\b/i;

function periodYears(period = '') {
  const ys = (String(period).match(/\d{4}/g) || []).map(Number);
  return ys.length ? { from: ys[0], to: ys[ys.length - 1] } : null;
}

// Period timeline (sourced period only): a drawn line from start to end year.
function timeline(cd, x, y, w, colors) {
  const p = periodYears(cd.period);
  if (!p || p.to <= p.from) return { svg: '', h: 0 };
  const yrs = p.to - p.from;
  const label = yrs > 0 ? `${yrs} year${yrs > 1 ? 's' : ''}` : 'single year';
  return { h: 56, svg: `<g>
    <text x="${x}" y="${y + 13}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${colors.label}">${esc(String(p.from))}</text>
    <text x="${x + w}" y="${y + 13}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${colors.label}" text-anchor="end">${esc(String(p.to))}</text>
    <line x1="${x}" y1="${y + 36}" x2="${x + w}" y2="${y + 36}" stroke="${colors.track}" stroke-width="2"/>
    <line x1="${x}" y1="${y + 36}" x2="${x + w}" y2="${y + 36}" stroke="${colors.accent}" stroke-width="3" stroke-dasharray="${w}" stroke-dashoffset="0"><animate attributeName="stroke-dashoffset" from="${w}" to="0" dur="1.4s" fill="freeze"/></line>
    <circle cx="${x}" cy="${y + 36}" r="6" fill="${colors.accent}"/>
    <circle cx="${x + w}" cy="${y + 36}" r="6" fill="${colors.accent}"/>
    <text x="${x + w / 2}" y="${y + 28}" font-family="${FONT_FAMILY.mono}" font-size="13" fill="${colors.label}" text-anchor="middle">${esc(label)}</text>
  </g>` };
}

// ─── 05 Data Story (Midnight; sourced bars or one hero figure) ─
export function generateDataStory({ caseData }) {
  const cd = caseData || {};
  const T = TOKENS, M = CANVAS.m;
  const soft = '#AEB9C8', rule = '#24344B', track = '#1C2C44';
  const chart = chartData(cd);
  const single = chart ? null : extractFigures(cd);
  if (!chart && !single) return generateEditorialCover({ caseData: cd }); // no sourced number: no data story
  const levels = [
    { head: [80, 76, 72], headLines: 4, body: [24, 22], bodyLines: 5, gaps: 4, gap: 56, bar: 64, maxSpread: 110 },
    { head: [72, 68], headLines: 4, body: [22, 21], bodyLines: 4, gaps: 4, gap: 48, bar: 56, maxSpread: 110 },
    { head: [64, 60], headLines: 5, body: [21, 20], bodyLines: 4, gaps: 4, gap: 40, bar: 48, maxSpread: 110 },
    { head: [56], headLines: 5, body: [20, 18], bodyLines: 4, gaps: 4, gap: 32, bar: 44, maxSpread: 110 },
  ];
  return firstThatFits(levels, (lv) => {
    const sp = lv.spread || 0;
    const parts = [svgOpen(T.midnight)];
    let y = M;
    parts.push(eyebrow(`Data story · Case ${caseNo(cd)} · ${cd.company || ''}`, M, y + 13, T.amber), eyebrow(cd.period || '', CANVAS.w - M, y + 13, soft, 'end'));
    y += 13 + 48 + sp;
    const h = fit(asSentence(cd.postAngle || cd.documentedProblem), CW, { fam: 'head', weight: 800, sizes: lv.head, lh: 1.05, maxLines: lv.headLines });
    parts.push(block(h, M, y, T.white));
    y += h.height + lv.gap + sp;

    const pad = 32;
    const panelTop = y;
    let inner = '';
    let iy = panelTop + pad;
    if (chart) {
      const figs = chart.figs.slice(0, 5);
      const max = Math.max(...figs.map((f) => f.value));
      const bh = lv.bar, vs = Math.round(bh * 0.6);
      const labelW = Math.min(320, Math.max(...figs.map((f) => measure(f.label, 'body', 600, 20))) + 28);
      const valueW = Math.max(...figs.map((f) => measure(f.raw, 'mono', 700, vs))) + 24;
      const barX = M + pad + labelW, barMax = CW - 2 * pad - labelW - valueW;
      const neg = /loss|penalt|fine|charge|impairment|decline|reduc/i;
      inner += eyebrow(chart.figs[0].unit === '%' ? 'Share, as reported' : 'As reported', M + pad, iy + 13, T.amber);
      iy += 13 + 32;
      figs.forEach((f, i) => {
        const w = Math.max(6, (f.value / max) * barMax);
        const isLast = i === figs.length - 1;
        const color = f.trend === 'down' || neg.test(f.label) ? T.coral : (isLast ? T.blue : '#8CA9CB');
        inner += `<text x="${M + pad}" y="${(iy + bh / 2 + 7).toFixed(1)}" font-family="${FONT_FAMILY.body}" font-weight="600" font-size="20" fill="${T.white}">${esc(f.label)}</text>
    <rect x="${barX}" y="${iy}" width="${barMax}" height="${bh}" rx="8" fill="${track}"/>
    <rect x="${barX}" y="${iy}" width="${w.toFixed(1)}" height="${bh}" rx="8" fill="${color}"><animate attributeName="width" from="0" to="${w.toFixed(1)}" dur="1.1s" begin="${(0.2 + i * 0.25).toFixed(2)}s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1" keyTimes="0;1"/></rect>
    <text x="${(barX + w + 16).toFixed(1)}" y="${(iy + bh / 2 + vs * 0.36).toFixed(1)}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="${vs}" fill="${T.white}">${esc(f.raw)}</text>`;
        iy += bh + 24;
      });
      iy += 8;
    } else if (single) {
      const f = single.figs[0];
      inner += eyebrow('The number', M + pad, iy + 13, T.amber);
      iy += 13 + 24;
      const ks = Math.min(200, Math.floor((CW - 2 * pad) / Math.max(1, measure(f.raw, 'mono', 700, 1))));
      inner += `<text x="${M + pad}" y="${(iy + ks * 0.78).toFixed(1)}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="${ks}" fill="${T.coral}" letter-spacing="-4" opacity="1"><animate attributeName="opacity" from="0" to="1" dur="0.9s" fill="freeze"/>${esc(f.raw)}</text>`;
      iy += ks * 0.8 + 24;
    }
    const cap2 = fit((chart || single).sentence, CW - 2 * pad, { fam: 'body', weight: 400, sizes: lv.body, lh: 1.45, maxLines: lv.bodyLines });
    inner += block(cap2, M + pad, iy, soft);
    iy += cap2.height + pad;
    parts.push(`<rect x="${M}" y="${panelTop}" width="${CW}" height="${(iy - panelTop).toFixed(0)}" rx="14" fill="#132238" stroke="${rule}" stroke-width="1"/>`, inner);
    y = iy + lv.gap + sp;

    // Root cause + the lesson
    const why = fit(cd.rootCauseAnalysis || '', CW, { fam: 'body', weight: 400, sizes: lv.body, lh: 1.45, maxLines: lv.bodyLines + 1 });
    parts.push(eyebrow('Why it happened', M, y + 13, T.amber), block(why, M, y + 13 + 20, T.white));
    y += 13 + 20 + why.height + 40 + sp;
    const lesson = actionItems(cd.recommendedFix)[0] || '';
    const ls = fit(lesson + '.', CW - 40, { fam: 'head', weight: 700, sizes: [32, 30, 28, 26, 24], lh: 1.25, maxLines: 3 });
    parts.push(`<rect x="${M}" y="${y}" width="4" height="${(13 + 16 + ls.height).toFixed(0)}" rx="2" fill="${T.teal}"/>`,
      eyebrow('Operator lesson', M + 24, y + 13, '#42BFA9'), block(ls, M + 24, y + 13 + 16, T.white));
    y += 13 + 16 + ls.height;
    parts.push(footer(`Data story · ${cd.theme || ''}`, `Source: ${sourceLabel(cd)}`, { rule, text: '#8A97A8' }), '</svg>');
    return { svg: parts.join('\n  '), bottom: y };
  });
}

export const EDITORIAL_TEMPLATES = {
  bi_failure_autopsy: generateFailureAutopsy,
  bi_editorial_cover: generateEditorialCover,
  bi_exec_cheatsheet: generateExecCheatSheet,
  bi_data_story: generateDataStory,
};

// Chooses the ONE best template for this case's content:
// sourced figures -> data story (bars, or one hero number); dramatic outcome -> dark cover with timeline;
// a multi-step fix -> cheat sheet; otherwise the failure autopsy.
export function pickEditorialTemplate(caseData) {
  const cd = caseData || {};
  if (chartData(cd) || extractFigures(cd)) return 'bi_data_story';
  if (DRAMA.test(`${cd.documentedProblem} ${cd.businessImpact}`)) return 'bi_editorial_cover';
  if (actionItems(cd.recommendedFix).length >= 3) return 'bi_exec_cheatsheet';
  return 'bi_failure_autopsy';
}

// Animations are for the live preview / SVG file; JPEG, PDF and LinkedIn need the finished frame.
export function stripAnimations(svg) {
  return String(svg).replace(/<animate\b[^>]*\/>/g, '');
}

// Injects the embedded @font-face CSS so the SVG renders with the right fonts as a file / <img> / JPEG export.
export function withFonts(svg, css) {
  return css ? String(svg).replace('/*@signal-fonts*/', css) : svg;
}
