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
// Bump when the editorial layouts change: unpublished drafts with an older id are re-rendered on load.
export const DESIGN_ID = 'bi-editorial-v5';
const CW = CANVAS.w - 2 * CANVAS.m; // 1056 content width
const COL = (CW - 11 * 24) / 12;     // 66 px
const span = (n) => n * COL + (n - 1) * 24;

export const FONT_FAMILY = {
  head: "Manrope, Inter, 'Segoe UI', sans-serif",
  body: "Inter, 'Segoe UI', Roboto, sans-serif",
  mono: "'IBM Plex Mono', 'Roboto Mono', ui-monospace, monospace",
  news: "'Playfair Display', Georgia, 'Times New Roman', serif",
  newsI: "'Playfair Display', Georgia, 'Times New Roman', serif",
  serif: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  serifI: "'Source Serif 4', Georgia, 'Times New Roman', serif",
  hand: "Caveat, 'Segoe Print', 'Comic Sans MS', cursive",
  poster: "'Bebas Neue', Impact, 'Arial Narrow', sans-serif",
  type: "'Special Elite', 'Courier New', monospace",
};
const FAM_KEY = { head: 'Manrope', body: 'Inter', mono: 'IBM Plex Mono', news: 'Playfair Display', newsI: 'Playfair Display', serif: 'Source Serif 4', serifI: 'Source Serif 4', hand: 'Caveat', poster: 'Bebas Neue', type: 'Special Elite' };
const isItalic = (fam) => fam.endsWith('I');

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── Measuring and wrapping ─────────────────────────────────
export function measure(text, fam, weight, size, tracking = 0) {
  const m = FONT_METRICS[`${FAM_KEY[fam]}|${weight}${isItalic(fam) ? 'i' : ''}`] || FONT_METRICS[`${FAM_KEY[fam]}|${weight}`] || FONT_METRICS['Inter|400'];
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
  const ls = (b.tracking ? ` letter-spacing="${b.tracking}"` : '') + (isItalic(b.fam) ? ' font-style="italic"' : '');
  return b.lines.map((l, i) =>
    `<text x="${x}" y="${(first + i * b.size * b.lh).toFixed(1)}" font-family="${FONT_FAMILY[b.fam]}" font-weight="${b.weight}" font-size="${b.size}" fill="${fill}"${ls}${extra}>${esc(l)}</text>`).join('\n  ');
}

function eyebrow(text, x, y, fill, anchor = 'start') {
  return `<text x="${x}" y="${y}" font-family="${FONT_FAMILY.mono}" font-weight="400" font-size="13" letter-spacing="1.4" fill="${fill}" text-anchor="${anchor}">${esc(String(text).toUpperCase())}</text>`;
}


// ─── Motion (SMIL) ───────────────────────────────────────────
// Every animation starts at t=0 and holds its start value through its delay (values + keyTimes),
// so nothing flashes before it begins. Base attributes are always the FINAL frame, so any viewer
// that ignores SMIL (and the JPEG / PDF / GIF last frame) shows the finished design.
const r2 = (n) => Math.round(n * 1000) / 1000;
export function anim(attr, from, to, delay = 0, dur = 0.7) {
  const total = delay + dur;
  const k = r2(delay / total);
  return `<animate attributeName="${attr}" values="${from};${from};${to}" keyTimes="0;${k};1" dur="${r2(total)}s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;0.16 1 0.3 1"/>`;
}
function rise(delay = 0, dy = 28, dur = 0.7) {
  return anim('opacity', 0, 1, delay, dur) +
    `<animateTransform attributeName="transform" type="translate" values="0 ${dy};0 ${dy};0 0" keyTimes="0;${r2(delay / (delay + dur))};1" dur="${r2(delay + dur)}s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;0.16 1 0.3 1"/>`;
}
// Wraps content in a group that fades and rises into place.
const R = (delay, ...items) => reveal(items.join('\n  '), delay);
const reveal = (content, delay, dy = 28, dur = 0.7) => `<g opacity="1" transform="translate(0 0)">${rise(delay, dy, dur)}${content}</g>`;

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
function valueAt(a, t) {
  const get = (n) => (new RegExp(`\\b${n}="([^"]*)"`).exec(a) || [])[1];
  const dur = parseFloat(get('dur')) || 0;
  const vals = (get('values') || `${get('from')};${get('to')}`).split(';').map((v) => v.trim());
  const keys = (get('keyTimes') || vals.map((_, i) => i / (vals.length - 1)).join(';')).split(';').map(Number);
  const splines = get('calcMode') === 'spline' ? (get('keySplines') || '').split(';') : [];
  const x = dur ? Math.min(1, Math.max(0, t / dur)) : 1;
  let i = 0;
  while (i < keys.length - 2 && x > keys[i + 1]) i++;
  const span = keys[i + 1] - keys[i] || 1;
  let f = Math.min(1, Math.max(0, (x - keys[i]) / span));
  if (splines[i] && splines[i].trim() !== '0 0 1 1') f = easeOut(f);
  const A = vals[i].split(/[\s,]+/).map(Number), B = vals[i + 1].split(/[\s,]+/).map(Number);
  return A.map((v, j) => r2(v + (B[j] - v) * f)).join(' ');
}
const setAttr = (tag, name, val) => (new RegExp(`\\s${name}="[^"]*"`).test(tag) ? tag.replace(new RegExp(`(\\s${name}=")[^"]*"`), `$1${val}"`) : tag.replace(/(\/?)>$/, ` ${name}="${val}"$1>`));

// Freezes every animation at time t (seconds) and removes the SMIL tags: used for GIF frames
// and, with t = Infinity, for the static JPEG / PDF.
export function sampleSvgAt(svg, t) {
  return String(svg).replace(/(<\w+\b[^>]*>)((?:<animate(?:Transform)?\b[^>]*\/>)+)/g, (_, open, anims) => {
    let tag = open;
    for (const a of anims.match(/<animate(?:Transform)?\b[^>]*\/>/g)) {
      const attr = (/attributeName="([^"]+)"/.exec(a) || [])[1];
      const v = valueAt(a, t);
      const type = (/\btype="(\w+)"/.exec(a) || [])[1] || 'translate';
      tag = a.startsWith('<animateTransform') ? setAttr(tag, 'transform', `${type}(${v})`) : setAttr(tag, attr, v);
    }
    return tag;
  });
}
// Seconds until the last animation finishes.
export function animationLength(svg) {
  return Math.max(0, ...[...String(svg).matchAll(/<animate(?:Transform)?\b[^>]*\bdur="([\d.]+)s"/g)].map((m) => +m[1]));
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
const svgOpen = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" width="${CANVAS.w}" height="${CANVAS.h}" data-design="${DESIGN_ID}">
  <style>/*@signal-fonts*/</style>
  <rect width="${CANVAS.w}" height="${CANVAS.h}" fill="${bg}"/>`;

function pickSource(right, room) {
  const short = right.replace(/Primary\s*[–-]\s*/i, '');
  const hostOnly = right.includes(' · ') ? `Source: ${right.split(' · ').pop()}` : short;
  return [right, short, hostOnly].find((t) => measure(t, 'mono', 400, 12) <= room) || hostOnly;
}
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

// Every headline names the company the post is about.
export function headlineFor(cd = {}) {
  const angle = asSentence(cd.postAngle || cd.documentedProblem || '');
  const co = String(cd.company || '').trim();
  if (!co || angle.toLowerCase().includes(co.toLowerCase())) return angle;
  const first = angle.split(/\s+/)[0].replace(/[^\w]/g, '');
  const ctx = ` ${cd.companyProfile || ''} ${cd.documentedProblem || ''} ${cd.rootCauseAnalysis || ''}`;
  const keepCaps = first === 'I' || (first.length > 1 && first === first.toUpperCase()) || new RegExp(`[a-z,]\\s${first}\\b`).test(ctx);
  const lower = keepCaps ? angle : angle.charAt(0).toLowerCase() + angle.slice(1);
  return `${co}: ${lower}`;
}

// Full-bleed editorial picture (original AI illustration made for this case; never a logo or a real photo).
// Slow push-out "Ken Burns" move for video; the GIF drops it (data-kb) to stay small.
export const HERO_LIGHT_H = 300;
function heroLayer(href, { h, bg, dark }) {
  if (!href) return '';
  return `<defs><linearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${bg}" stop-opacity="${dark ? 0.5 : 0}"/>
    <stop offset="${dark ? 0.55 : 0.55}" stop-color="${bg}" stop-opacity="${dark ? 0.72 : 0.15}"/>
    <stop offset="1" stop-color="${bg}" stop-opacity="1"/></linearGradient>
    <clipPath id="heroClip"><rect width="${CANVAS.w}" height="${h}"/></clipPath></defs>
  <g clip-path="url(#heroClip)" opacity="1">${anim('opacity', 0, 1, 0, 0.9)}
    <g transform="translate(${CANVAS.w / 2} ${h / 2})"><g transform="scale(1)"><animateTransform data-kb="1" attributeName="transform" type="scale" values="1.14;1" keyTimes="0;1" dur="7s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1"/>
      <image href="${esc(href)}" x="${-CANVAS.w / 2}" y="${-h / 2}" width="${CANVAS.w}" height="${h}" preserveAspectRatio="xMidYMid slice"/></g></g>
    <rect width="${CANVAS.w}" height="${h}" fill="url(#heroFade)"/>
  </g>`;
}

// ─── 07 Business Failure Autopsy (Ivory, Navy, Coral) ──────
export function generateFailureAutopsy({ caseData, heroHref = '' }) {
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
    const parts = [svgOpen(T.ivory), heroLayer(heroHref, { h: HERO_LIGHT_H, bg: T.ivory, dark: false })];
    let y = heroHref ? HERO_LIGHT_H - 8 : M;
    // Tag pill + eyebrow row
    const tag = 'BUSINESS FAILURE AUTOPSY';
    const tagW = measure(tag, 'mono', 400, 12, 1.4) + 32;
    parts.push(`<rect x="${M}" y="${y}" width="${tagW.toFixed(0)}" height="32" rx="16" fill="${T.lightCoral}"/>`,
      `<text x="${M + 16}" y="${y + 21}" font-family="${FONT_FAMILY.mono}" font-size="12" letter-spacing="1.4" fill="${T.coral}">${tag}</text>`,
      eyebrow(`Case ${caseNo(cd)} · ${cd.period || ''}`, CANVAS.w - M, y + 21, T.slate, 'end'));
    y += 32 + 40;
    // Headline: the case's own post angle, sentence case
    const h = fit(headlineFor(cd), CW, { fam: 'head', weight: 800, sizes: lv.head, lh: 1.05, maxLines: lv.headLines });
    parts.push(R(0.1, block(h, M, y, T.navy)));
    y += h.height + 24;
    // Company line
    const co = `${cd.company || ''}`;
    parts.push(R(0.45, `<text x="${M}" y="${y + 18}" font-family="${FONT_FAMILY.body}" font-weight="600" font-size="22" fill="${T.navy}">${esc(co)}<tspan fill="${T.slate}" font-weight="400">  ·  ${esc(cd.industry || '')}</tspan></text>`));
    y += 22 + 12;
    const prof = fit(cd.companyProfile || '', span(10), { fam: 'body', weight: 400, sizes: [18, 17], lh: 1.4, maxLines: 2 });
    parts.push(R(0.55, block(prof, M, y, T.slate)));
    const sp = lv.spread || 0;
    y += prof.height + lv.gap - 8 + sp;
    // Period timeline replaces the plain divider when the case has dated years.
    const tl = timeline(cd, M, y - 8, CW, { label: T.slate, track: T.border, accent: T.coral, delay: 0.8 });
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
    cards.forEach((c, ci) => {
      parts.push(R(1.0 + ci * 0.25, `<rect x="${c.x}" y="${y}" width="${half}" height="${cardH.toFixed(0)}" rx="14" fill="${c.bg}"${c.stroke !== 'none' ? ` stroke="${c.stroke}" stroke-width="1"` : ''}/>`,
        `<text x="${c.x + pad}" y="${y + pad + 22}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="28" fill="${c.titleFill}">${esc(c.title)}</text>`,
        block(c.b, c.x + pad, y + pad + 28 + 20, T.navy)));
    });
    y += cardH + 24 + sp;

    // What it cost (full width, coral rule)
    const cost = fit(cd.businessImpact || cd.documentedResponse || '', CW - 2 * pad - 8, { fam: 'body', weight: 400, sizes: lv.body, lh: 1.45, maxLines: 4 });
    const costH = pad + 28 + 20 + cost.height + pad;
    parts.push(R(1.6, `<rect x="${M}" y="${y}" width="${CW}" height="${costH.toFixed(0)}" rx="14" fill="${T.white}" stroke="${T.border}" stroke-width="1"/>`,
      `<rect x="${M}" y="${y + 20}" width="4" height="${(costH - 40).toFixed(0)}" rx="2" fill="${T.coral}"/>`,
      `<text x="${M + pad + 8}" y="${y + pad + 22}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="28" fill="${T.navy}">What it cost</text>`,
      block(cost, M + pad + 8, y + pad + 28 + 20, T.navy)));
    y += costH + 24 + sp;

    // Operator lessons (light teal, numbered)
    const items = actionItems(cd.recommendedFix);
    const lessonW = CW - 2 * pad - 56;
    const fitted = items.map((t) => fit(t + '.', lessonW, { fam: 'body', weight: 400, sizes: [lv.lesson], lh: 1.4, maxLines: 2 }));
    const listH = fitted.reduce((a, b) => a + b.height, 0) + Math.max(0, fitted.length - 1) * 14;
    const lessonsH = pad + 28 + 24 + listH + pad;
    parts.push(R(1.9, `<rect x="${M}" y="${y}" width="${CW}" height="${lessonsH.toFixed(0)}" rx="14" fill="${T.lightTeal}"/>`,
      `<text x="${M + pad}" y="${y + pad + 22}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="28" fill="${T.navy}">Operator lessons</text>`));
    let ly = y + pad + 28 + 24;
    fitted.forEach((b, i) => {
      parts.push(R(2.1 + i * 0.15, `<text x="${M + pad}" y="${(ly + b.size * 0.8).toFixed(1)}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="${b.size}" fill="${T.teal}">${String(i + 1).padStart(2, '0')}</text>`,
        block(b, M + pad + 56, ly, T.navy)));
      ly += b.height + 14;
    });
    y += lessonsH;

    parts.push(footer(`Business failure autopsy · ${cd.theme || ''}`, `Source: ${sourceLabel(cd)}`, { rule: T.border, text: T.slate }), '</svg>');
    return { svg: parts.join('\n  '), bottom: y };
  });
}

// ─── 10 Big Idea / Editorial Cover (Midnight, White, Amber) ─
export function generateEditorialCover({ caseData, heroHref = '' }) {
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
    const h = fit(headlineFor(cd), CW, { fam: 'head', weight: 800, sizes: lv.head, lh: 1.05, maxLines: lv.headLines });
    const prob = fit(cd.documentedProblem || '', span(10), { fam: 'body', weight: 400, sizes: lv.body, lh: 1.45, maxLines: lv.bodyLines });
    const cost = fit(cd.businessImpact || '', CW - 2 * pad, { fam: 'body', weight: 600, sizes: lv.body, lh: 1.45, maxLines: 4 });
    const panelH = pad + 13 + 20 + cost.height + pad;
    const storyH = h.height + 48 + 4 + 40 + 28 + 24 + prob.height + 104;
    const top = M + 13 + 64;
    const panelY = bottomLimit - panelH;
    const free = panelY - 64 - top - storyH;
    if (free < 0) return { svg: '', bottom: Infinity };

    let y = top + Math.round(free * 0.45);
    const parts = [svgOpen(T.midnight), heroLayer(heroHref, { h: 820, bg: T.midnight, dark: true })];
    parts.push(eyebrow(`Case ${caseNo(cd)} · ${cd.theme || ''}`, M, M + 13, T.amber), eyebrow(cd.period || '', CANVAS.w - M, M + 13, soft, 'end'));
    parts.push(R(0.1, block(h, M, y, T.white)));
    y += h.height + 48;
    parts.push(`<rect x="${M}" y="${y}" width="96" height="4" rx="2" fill="${T.amber}">${anim('width', 0, 96, 0.7, 0.6)}</rect>`);
    y += 4 + 40;
    parts.push(R(1.0, `<text x="${M}" y="${y + 20}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="28" fill="${T.white}">${esc(cd.company || '')}<tspan font-family="${FONT_FAMILY.body}" font-weight="400" font-size="20" fill="${soft}">  ·  ${esc(cd.industry || '')}</tspan></text>`));
    y += 28 + 24;
    parts.push(R(1.1, block(prob, M, y, soft)));
    const tl = timeline(cd, M, y + prob.height + Math.max(48, Math.floor((panelY - (y + prob.height) - 56) / 2)), CW, { label: soft, track: '#24344B', accent: T.coral, delay: 1.3 });
    if (y + prob.height + 48 + tl.h <= panelY - 24) parts.push(tl.svg);
    parts.push(R(1.9, `<rect x="${M}" y="${panelY}" width="${CW}" height="${panelH.toFixed(0)}" rx="14" fill="#132238" stroke="${rule}" stroke-width="1"/>`,
      eyebrow('What it cost', M + pad, panelY + pad + 13, T.amber),
      block(cost, M + pad, panelY + pad + 13 + 20, T.white)));
    parts.push(footer(`Editorial · ${cd.theme || ''}`, `Source: ${sourceLabel(cd)}`, { rule, text: '#8A97A8' }), '</svg>');
    return { svg: parts.join('\n  '), bottom: panelY + panelH };
  });
}

// ─── 09 Executive Cheat Sheet (White, Navy, Blue + Teal) ────
export function generateExecCheatSheet({ caseData, heroHref = '' }) {
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
    const parts = [svgOpen(T.white), heroLayer(heroHref, { h: HERO_LIGHT_H, bg: T.white, dark: false })];
    let y = heroHref ? HERO_LIGHT_H - 8 : M;
    parts.push(eyebrow(`Executive cheat sheet · Case ${caseNo(cd)}`, M, y + 13, T.blue), eyebrow(cd.period || '', CANVAS.w - M, y + 13, T.slate, 'end'));
    y += 13 + 48;
    const h = fit(`What ${cd.company || 'this case'} teaches operators`, CW, { fam: 'head', weight: 800, sizes: lv.head, lh: 1.05, maxLines: lv.headLines });
    parts.push(R(0.1, block(h, M, y, T.navy)));
    y += h.height + 16;
    parts.push(R(0.35, `<text x="${M}" y="${y + 16}" font-family="${FONT_FAMILY.body}" font-weight="400" font-size="18" fill="${T.slate}">${esc([cd.theme, cd.industry].filter(Boolean).join('  ·  '))}</text>`));
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
      parts.push(R(0.6 + i * 0.2, `<rect x="${x}" y="${y}" width="${w}" height="${modH.toFixed(0)}" rx="14" fill="${T.white}" stroke="${T.border}" stroke-width="1"/>`,
        `<rect x="${x + pad}" y="${y + pad - 2}" width="24" height="3" rx="1.5" fill="${m.acc}"/>`,
        eyebrow(m.t, x + pad, y + pad + 20, T.navy),
        block(m.b, x + pad, y + pad + 13 + 28, T.navy)));
    });
    y += modH + lv.gap + sp;

    // Decision rule (light blue, blue rule)
    const rp = 32;
    const rl = fit(asSentence(cd.postAngle), CW - 2 * rp - 8, { fam: 'head', weight: 700, sizes: lv.rule, lh: 1.2, maxLines: 3 });
    const ruleH = rp + 13 + 20 + rl.height + rp;
    parts.push(R(1.3, `<rect x="${M}" y="${y}" width="${CW}" height="${ruleH.toFixed(0)}" rx="14" fill="${T.lightBlue}"/>`,
      `<rect x="${M}" y="${y + 20}" width="4" height="${(ruleH - 40).toFixed(0)}" rx="2" fill="${T.blue}"/>`,
      eyebrow('Decision rule', M + rp + 8, y + rp + 13, T.blue),
      block(rl, M + rp + 8, y + rp + 13 + 20, T.navy)));
    y += ruleH + lv.gap + sp;

    // Checklist
    parts.push(R(1.6, `<text x="${M}" y="${y + 22}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="30" fill="${T.navy}">Operator checklist</text>`));
    y += 30 + 32;
    actionItems(cd.recommendedFix).forEach((it, ix) => {
      const b = fit(it + '.', CW - 64, { fam: 'body', weight: 400, sizes: [lv.item], lh: 1.4, maxLines: 2 });
      const cy = y + b.size * 0.4 - 11;
      parts.push(R(1.75 + ix * 0.15, `<rect x="${M}" y="${cy.toFixed(1)}" width="22" height="22" rx="6" fill="none" stroke="${T.teal}" stroke-width="2"/>`,
        `<path d="M${M + 5} ${(cy + 11).toFixed(1)} l4.5 4.5 l8 -9" fill="none" stroke="${T.teal}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
        block(b, M + 40, y, T.navy)));
      y += b.height + lv.itemGap;
      parts.push(`<line x1="${M + 40}" y1="${(y - lv.itemGap / 2).toFixed(1)}" x2="${CANVAS.w - M}" y2="${(y - lv.itemGap / 2).toFixed(1)}" stroke="${T.border}" stroke-width="1"/>`);
    });
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
  return { h: 56, svg: `<g opacity="1">${anim('opacity', 0, 1, Math.max(0, (colors.delay || 0.6) - 0.3), 0.5)}
    <text x="${x}" y="${y + 13}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${colors.label}">${esc(String(p.from))}</text>
    <text x="${x + w}" y="${y + 13}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${colors.label}" text-anchor="end">${esc(String(p.to))}</text>
    <line x1="${x}" y1="${y + 36}" x2="${x + w}" y2="${y + 36}" stroke="${colors.track}" stroke-width="2"/>
    <line x1="${x}" y1="${y + 36}" x2="${x + w}" y2="${y + 36}" stroke="${colors.accent}" stroke-width="3" stroke-dasharray="${w}" stroke-dashoffset="0">${anim('stroke-dashoffset', w, 0, colors.delay || 0.6, 1.2)}</line>
    <circle cx="${x}" cy="${y + 36}" r="6" fill="${colors.accent}"/>
    <circle cx="${x + w}" cy="${y + 36}" r="6" fill="${colors.accent}"/>
    <text x="${x + w / 2}" y="${y + 28}" font-family="${FONT_FAMILY.mono}" font-size="13" fill="${colors.label}" text-anchor="middle">${esc(label)}</text>
  </g>` };
}

// ─── 05 Data Story (Midnight; sourced bars or one hero figure) ─
export function generateDataStory({ caseData, heroHref = '' }) {
  const cd = caseData || {};
  const T = TOKENS, M = CANVAS.m;
  const soft = '#AEB9C8', rule = '#24344B', track = '#1C2C44';
  const chart = chartData(cd);
  const single = chart ? null : extractFigures(cd);
  if (!chart && !single) return generateEditorialCover({ caseData: cd, heroHref }); // no sourced number: no data story
  const levels = [
    { head: [80, 76, 72], headLines: 4, body: [24, 22], bodyLines: 5, gaps: 4, gap: 56, bar: 64, maxSpread: 110 },
    { head: [72, 68], headLines: 4, body: [22, 21], bodyLines: 4, gaps: 4, gap: 48, bar: 56, maxSpread: 110 },
    { head: [64, 60], headLines: 5, body: [21, 20], bodyLines: 4, gaps: 4, gap: 40, bar: 48, maxSpread: 110 },
    { head: [56], headLines: 5, body: [20, 18], bodyLines: 4, gaps: 4, gap: 32, bar: 44, maxSpread: 110 },
  ];
  return firstThatFits(levels, (lv) => {
    const sp = lv.spread || 0;
    const parts = [svgOpen(T.midnight), heroLayer(heroHref, { h: 640, bg: T.midnight, dark: true })];
    let y = M;
    parts.push(eyebrow(`Data story · Case ${caseNo(cd)} · ${cd.company || ''}`, M, y + 13, T.amber), eyebrow(cd.period || '', CANVAS.w - M, y + 13, soft, 'end'));
    y += 13 + 48 + sp;
    const h = fit(headlineFor(cd), CW, { fam: 'head', weight: 800, sizes: lv.head, lh: 1.05, maxLines: lv.headLines });
    parts.push(R(0.1, block(h, M, y, T.white)));
    y += h.height + 28;
    // Company named up front so the visual reads as this case even before the headline is parsed.
    parts.push(R(0.35, `<text x="${M}" y="${y + 24}" font-family="${FONT_FAMILY.head}" font-weight="800" font-size="30" fill="${T.amber}">${esc(cd.company || '')}<tspan font-family="${FONT_FAMILY.body}" font-weight="400" font-size="20" fill="${soft}">  ·  ${esc([cd.industry, cd.period].filter(Boolean).join('  ·  '))}</tspan></text>`));
    y += 30 + lv.gap + sp;

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
    <rect x="${barX}" y="${iy}" width="${w.toFixed(1)}" height="${bh}" rx="8" fill="${color}">${anim('width', 0, w.toFixed(1), 0.9 + i * 0.3, 1.1)}</rect>
    <text x="${(barX + w + 16).toFixed(1)}" y="${(iy + bh / 2 + vs * 0.36).toFixed(1)}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="${vs}" fill="${T.white}" opacity="1">${anim('x', (barX + 16).toFixed(1), (barX + w + 16).toFixed(1), 0.9 + i * 0.3, 1.1)}${anim('opacity', 0, 1, 0.9 + i * 0.3, 0.5)}${esc(f.raw)}</text>`;
        iy += bh + 24;
      });
      iy += 8;
    } else if (single) {
      const f = single.figs[0];
      inner += eyebrow('The number', M + pad, iy + 13, T.amber);
      iy += 13 + 24;
      const ks = Math.min(200, Math.floor((CW - 2 * pad) / Math.max(1, measure(f.raw, 'mono', 700, 1))));
      inner += `<text x="${M + pad}" y="${(iy + ks * 0.78).toFixed(1)}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="${ks}" fill="${T.coral}" letter-spacing="-4" opacity="1">${anim('opacity', 0, 1, 0.9, 0.8)}${esc(f.raw)}</text>`;
      iy += ks * 0.8 + 24;
    }
    const cap2 = fit((chart || single).sentence, CW - 2 * pad, { fam: 'body', weight: 400, sizes: lv.body, lh: 1.45, maxLines: lv.bodyLines });
    inner += block(cap2, M + pad, iy, soft);
    iy += cap2.height + pad;
    parts.push(R(0.5, `<rect x="${M}" y="${panelTop}" width="${CW}" height="${(iy - panelTop).toFixed(0)}" rx="14" fill="#132238" stroke="${rule}" stroke-width="1"/>`, inner));
    y = iy + lv.gap + sp;

    // Root cause + the lesson
    const why = fit(cd.rootCauseAnalysis || '', CW, { fam: 'body', weight: 400, sizes: lv.body, lh: 1.45, maxLines: lv.bodyLines + 1 });
    parts.push(R(2.3, eyebrow('Why it happened', M, y + 13, T.amber), block(why, M, y + 13 + 20, T.white)));
    y += 13 + 20 + why.height + 40 + sp;
    const lesson = actionItems(cd.recommendedFix)[0] || '';
    const ls = fit(lesson + '.', CW - 40, { fam: 'head', weight: 700, sizes: [32, 30, 28, 26, 24], lh: 1.25, maxLines: 3 });
    parts.push(R(2.6, `<rect x="${M}" y="${y}" width="4" height="${(13 + 16 + ls.height).toFixed(0)}" rx="2" fill="${T.teal}"/>`,
      eyebrow('Operator lesson', M + 24, y + 13, '#42BFA9'), block(ls, M + 24, y + 13 + 16, T.white)));
    y += 13 + 16 + ls.height;
    parts.push(footer(`Data story · ${cd.theme || ''}`, `Source: ${sourceLabel(cd)}`, { rule, text: '#8A97A8' }), '</svg>');
    return { svg: parts.join('\n  '), bottom: y };
  });
}

// ─── Newspaper article with handwritten annotations ─────────
// A broadsheet page (masthead, headline, deck, two columns, drop cap) about ONE case, marked up in
// red and blue pen: a circle around the company, a wavy underline, a circled figure with the arithmetic
// written next to it, and a "start here" arrow. Handwritten notes only say things that are true:
// either generic reading cues or arithmetic on the case's own sourced figures.
const INK = '#1B2433', PAPER = '#F4F1EA', PEN = '#C8382B', PEN_BLUE = '#2058B5', RULE_C = '#C9C2B4';

// Deterministic jitter so every render of the same case draws the same "hand".
function rng(seed) { let x = seed % 2147483647; if (x <= 0) x += 2147483646; return () => (x = (x * 16807) % 2147483647) / 2147483647; }
const pathLen = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
const toPath = (pts) => `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}`;
function penStroke(pts, color, width, delay, dur) {
  const L = Math.ceil(pathLen(pts));
  return `<path d="${toPath(pts)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92" stroke-dasharray="${L}" stroke-dashoffset="0">${anim('stroke-dashoffset', L, 0, delay, dur)}</path>`;
}
function handCircle(cx, cy, rx, ry, color, delay, seed = 7) {
  const r = rng(seed), pts = [];
  const start = -2.6 + r() * 0.4, turn = Math.PI * 2 * 1.12;
  for (let a = 0; a <= turn; a += 0.12) {
    const k = 1 + (r() - 0.5) * 0.035 + (a / turn) * 0.06;
    pts.push([cx + Math.cos(start + a) * rx * k, cy + Math.sin(start + a) * ry * k]);
  }
  return penStroke(pts, color, 3.6, delay, 0.75);
}
function handUnderline(x1, x2, y, color, delay, seed = 3) {
  const r = rng(seed), pts = [];
  for (let x = x1; x <= x2; x += 14) pts.push([x, y + Math.sin((x - x1) / 38) * 2.2 + (r() - 0.5) * 1.6 + ((x - x1) / (x2 - x1)) * 3]);
  return penStroke(pts, color, 3.2, delay, 0.6);
}
function handArrow(x1, y1, x2, y2, color, delay, bend = 40) {
  const pts = [];
  const mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2 - bend * 0.4;
  for (let t = 0; t <= 1.0001; t += 0.05) pts.push([(1 - t) ** 2 * x1 + 2 * (1 - t) * t * mx + t * t * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * my + t * t * y2]);
  const [px, py] = pts[pts.length - 2];
  const ang = Math.atan2(y2 - py, x2 - px);
  const head = [[x2 - 18 * Math.cos(ang - 0.45), y2 - 18 * Math.sin(ang - 0.45)], [x2, y2], [x2 - 18 * Math.cos(ang + 0.45), y2 - 18 * Math.sin(ang + 0.45)]];
  return penStroke(pts, color, 3, delay, 0.45) + penStroke(head, color, 3, delay + 0.4, 0.2);
}
let clipSeq = 0;
function handNote(text, x, y, color, delay, { size = 34, rotate = -4, anchor = 'start' } = {}) {
  const w = measure(text, 'hand', 700, size) + 12;
  const id = `wr${++clipSeq}`;
  const x0 = anchor === 'end' ? x - w : x;
  // "Written" left to right: a clip rectangle grows across the note.
  return `<g transform="rotate(${rotate} ${x} ${y})"><clipPath id="${id}"><rect x="${x0 - 6}" y="${y - size}" width="${w.toFixed(0)}" height="${size * 1.6}">${anim('width', 0, w.toFixed(0), delay, Math.min(1.1, 0.25 + text.length * 0.035))}</rect></clipPath>
    <text x="${x}" y="${y}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="${size}" fill="${color}" text-anchor="${anchor}" clip-path="url(#${id})">${esc(text)}</text></g>`;
}

// Arithmetic on sourced figures only (e.g. "$4.83bn -> $4.48bn" => "-$350m").
function fmtMoney(v, unit) {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `${+(a / 1e9).toFixed(2)}bn` : a >= 1e6 ? `${Math.round(a / 1e6)}m` : `${Math.round(a)}`;
  return `${unit}${s}`;
}
export function figureNote(chart) {
  if (!chart || chart.figs.length < 2) return '';
  const f = chart.figs, a = f[0], b = f[f.length - 1];
  if (a.unit === '%' && f.every((x) => x.year)) {
    const d = Math.round((b.value - a.value) * 10) / 10;
    return `${d < 0 ? 'down' : 'up'} ${Math.abs(d)} pts!`;
  }
  if (f.length === 2 && a.label === 'Before') {
    const d = b.value - a.value;
    return `${d < 0 ? '-' : '+'}${fmtMoney(d, a.unit)} gone`.replace('+', '+').replace(/ gone$/, d < 0 ? ' gone' : '');
  }
  if (f.length === 2 && a.unit !== '%' && b.value > a.value && a.value > 0) return `${+(b.value / a.value).toFixed(1)}x bigger!`;
  return '';
}

function wrapDropCap(text, widths, f) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const max = widths[Math.min(lines.length, widths.length - 1)];
    const t = cur ? `${cur} ${w}` : w;
    if (cur && measure(t, f.fam, f.weight, f.size) > max) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function longDate(d = new Date()) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function generateNewspaper({ caseData, heroHref = '', date = null }) {
  const cd = caseData || {};
  const M = CANVAS.m, W = CANVAS.w;
  const chart = chartData(cd);
  const single = chart ? null : extractFigures(cd);
  const items = actionItems(cd.recommendedFix);
  // Body size first (readability), then the biggest picture that still fits.
  // With a picture: keep body text at 20 px or more and shrink the picture first; without one, as large as fits.
  const lv0 = (body, photo) => ({ body, photo, deck: Math.round(body * 1.2), gap: Math.round(body * 1.3), gaps: 4, maxSpread: 60 });
  const levels = [];
  if (heroHref) for (const body of [26, 25, 24, 23, 22, 21, 20, 19]) for (const photo of [480, 440, 400, 360, 320, 280, 240, 200, 170]) levels.push(lv0(body, photo));
  for (const body of [27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17]) levels.push(lv0(body, 0));
  return firstThatFits(levels, (lv) => {
    clipSeq = 0;
    const parts = [svgOpen(PAPER)];
    // Newsprint: a faint vignette so the page reads as paper, not a flat screen.
    parts.push(`<defs><radialGradient id="paperWash" cx="50%" cy="45%" r="75%"><stop offset="0.6" stop-color="${PAPER}" stop-opacity="0"/><stop offset="1" stop-color="#D9D1BF" stop-opacity="0.55"/></radialGradient></defs><rect width="${W}" height="${CANVAS.h}" fill="url(#paperWash)"/>`);
    let y = 52;
    // Masthead
    parts.push(R(0, `<line x1="${M}" y1="${y}" x2="${W - M}" y2="${y}" stroke="${INK}" stroke-width="3"/>`,
      `<text x="${M}" y="${y + 26}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${INK}">CASE NO. ${esc(caseNo(cd))}</text>`,
      `<text x="${W - M}" y="${y + 26}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${INK}" text-anchor="end">${esc(longDate(date ? new Date(date) : new Date()).toUpperCase())}</text>`,
      `<text x="${W / 2}" y="${y + 98}" font-family="${FONT_FAMILY.news}" font-weight="900" font-size="76" fill="${INK}" text-anchor="middle" letter-spacing="-1">The Case File</text>`,
      `<line x1="${M}" y1="${y + 122}" x2="${W - M}" y2="${y + 122}" stroke="${INK}" stroke-width="2"/>`,
      `<line x1="${M}" y1="${y + 128}" x2="${W - M}" y2="${y + 128}" stroke="${INK}" stroke-width="1"/>`,
      `<text x="${M}" y="${y + 154}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${PEN}">${esc(String(cd.theme || '').toUpperCase())}</text>`,
      `<text x="${W - M}" y="${y + 154}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${INK}" text-anchor="end">${esc(`ANALYSIS · ${cd.period || ''}`.toUpperCase())}</text>`));
    y += 154 + 30;

    // Headline (names the company) + circle around the company name
    const head = headlineFor(cd);
    const h = fit(head, CW, { fam: 'news', weight: 900, sizes: lv.photo ? [72, 68, 64, 60, 56, 52, 48] : [80, 76, 72, 68, 64, 60, 56, 52, 48], lh: 1.06, maxLines: lv.photo ? 3 : 4 });
    const sp = lv.spread || 0;
    parts.push(R(0.25, block(h, M, y, INK)));
    const co = String(cd.company || '');
    if (co && h.lines[0].startsWith(co)) {
      const cw = measure(co, 'news', 900, h.size);
      parts.push(handCircle(M + cw / 2, y + h.size * 0.45, cw / 2 + 22, h.size * 0.62, PEN, 1.3, cd.caseNumber || 7));
    }
    y += h.height + 14 + sp;

    // Deck (italic) with a wavy underline under its first line
    const deck = fit(cd.documentedProblem || '', CW, { fam: 'serifI', weight: 400, sizes: [lv.deck, lv.deck - 2, lv.deck - 4], lh: 1.4, maxLines: 5 });
    parts.push(R(0.55, block(deck, M, y, '#3A4456')));
    if (deck.lines.length) {
      const dw = Math.min(CW, measure(deck.lines[0], 'serifI', 400, deck.size));
      parts.push(handUnderline(M, M + dw, y + deck.size + 6, PEN, 1.9, (cd.caseNumber || 3) + 11));
    }
    y += deck.height + lv.gap + sp;
    if (heroHref && lv.photo) {
      const ph = lv.photo;
      parts.push(R(0.7, `<defs><filter id="press"><feColorMatrix type="saturate" values="0.1"/><feComponentTransfer><feFuncR type="linear" slope="1.15" intercept="-0.06"/><feFuncG type="linear" slope="1.15" intercept="-0.06"/><feFuncB type="linear" slope="1.15" intercept="-0.06"/></feComponentTransfer></filter><clipPath id="photoClip"><rect x="${M}" y="${y}" width="${CW}" height="${ph}"/></clipPath></defs>
    <g clip-path="url(#photoClip)"><g transform="translate(${M + CW / 2} ${y + ph / 2})"><g transform="scale(1)"><animateTransform data-kb="1" attributeName="transform" type="scale" values="1.12;1" keyTimes="0;1" dur="6s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1"/><image href="${esc(heroHref)}" x="${-CW / 2}" y="${-ph / 2}" width="${CW}" height="${ph}" preserveAspectRatio="xMidYMid slice" filter="url(#press)"/></g></g></g>
    <rect x="${M}" y="${y}" width="${CW}" height="${ph}" fill="none" stroke="${INK}" stroke-width="1"/>`,
        `<text x="${M}" y="${y + ph + 22}" font-family="${FONT_FAMILY.serif}" font-style="italic" font-size="15" fill="#5B6270">Illustration generated for this analysis. Not a photograph.</text>`));
      y += ph + 22 + lv.gap + sp;
    }
    parts.push(`<line x1="${M}" y1="${y - lv.gap / 2}" x2="${W - M}" y2="${y - lv.gap / 2}" stroke="${RULE_C}" stroke-width="1"/>`);

    // Two columns
    const gut = 44, colW = (CW - gut) / 2, xL = M, xR = M + colW + gut;
    parts.push(`<line x1="${M + colW + gut / 2}" y1="${y}" x2="${M + colW + gut / 2}" y2="${CANVAS.h - M - 70}" stroke="${RULE_C}" stroke-width="1"/>`);
    const bodyF = { fam: 'serif', weight: 400, size: lv.body };
    const lh = lv.body * 1.5;
    // Left: root cause with drop cap, then the documented response
    let ly = y;
    const root = String(cd.rootCauseAnalysis || cd.documentedProblem || '');
    const capCh = root.charAt(0), rest = root.slice(1);
    const capSize = Math.round(lh * 3 * 0.92), capW = measure(capCh, 'news', 900, capSize) + 6;
    const rootLines = wrapDropCap(rest, [colW - capW, colW - capW, colW - capW, colW], bodyF);
    let left = `<text x="${xL}" y="${(ly + capSize * 0.74).toFixed(1)}" font-family="${FONT_FAMILY.news}" font-weight="900" font-size="${capSize}" fill="${PEN}">${esc(capCh)}</text>`;
    rootLines.forEach((l, i) => { left += `<text x="${i < 3 ? xL + capW : xL}" y="${(ly + lv.body * 0.8 + i * lh).toFixed(1)}" font-family="${FONT_FAMILY.serif}" font-size="${lv.body}" fill="${INK}">${esc(l)}</text>`; });
    ly += Math.max(rootLines.length, 3) * lh + 18 + sp;
    left += `<text x="${xL}" y="${ly + 18}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${PEN}">WHAT THE RECORD SHOWS</text>`;
    ly += 18 + 14;
    const resp = fit(cd.documentedResponse || '', colW, { fam: 'serif', weight: 400, sizes: [lv.body], lh: 1.5, maxLines: 16 });
    left += block(resp, xL, ly, INK);
    ly += resp.height;
    parts.push(R(0.9, left));

    // Right: picture or the numbers, then the cost, then the takeaway
    let ry = y, right = '', extra = '';
    if (chart) {
      const figs = chart.figs.slice(0, 4), max = Math.max(...figs.map((f) => f.value));
      right += `<text x="${xR}" y="${ry + 16}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${INK}">BY THE NUMBERS</text>`;
      ry += 16 + 18;
        const valW = Math.max(...figs.map((f) => measure(f.raw, 'mono', 700, 24))) + 20;
      const barMax = colW - valW;
      let noteAt = null;
      figs.forEach((f, i) => {
        const w = Math.max(4, (f.value / max) * barMax);
        const last = i === figs.length - 1;
        right += `<text x="${xR}" y="${ry + 16}" font-family="${FONT_FAMILY.serif}" font-weight="700" font-size="17" fill="${INK}">${esc(f.label)}</text>
    <rect x="${xR}" y="${ry + 26}" width="${w.toFixed(1)}" height="30" fill="${last ? INK : '#8C8679'}">${anim('width', 0, w.toFixed(1), 1.3 + i * 0.3, 0.9)}</rect>
    <text x="${(xR + w + 10).toFixed(1)}" y="${ry + 50}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="24" fill="${INK}" opacity="1">${anim('x', (xR + 10).toFixed(1), (xR + w + 10).toFixed(1), 1.3 + i * 0.3, 0.9)}${esc(f.raw)}</text>`;
        if (last) {
          const vw = measure(f.raw, 'mono', 700, 24);
          extra += handCircle(xR + w + 10 + vw / 2, ry + 42, vw / 2 + 16, 26, PEN, 2.6, (cd.caseNumber || 1) + 29);
          noteAt = [xR + w + 10 + vw, ry + 42 + 66];
        }
        ry += 70;
      });
      const note = figureNote(chart);
      if (note && noteAt) { extra += handNote(note, Math.min(W - M, noteAt[0] + 10), noteAt[1], PEN, 3.0, { size: 34, rotate: -5, anchor: 'end' }); ry += 34; }
      ry += 34;
    } else if (single) {
      const f = single.figs[0];
      right += `<text x="${xR}" y="${ry + 16}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${INK}">THE NUMBER</text>`;
      ry += 16 + 10;
      const ks = Math.min(110, Math.floor(colW / Math.max(1, measure(f.raw, 'news', 900, 1))));
      right += `<text x="${xR}" y="${(ry + ks * 0.8).toFixed(1)}" font-family="${FONT_FAMILY.news}" font-weight="900" font-size="${ks}" fill="${INK}">${esc(f.raw)}</text>`;
      const nw = measure(f.raw, 'news', 900, ks);
      extra += handCircle(xR + nw / 2, ry + ks * 0.48, nw / 2 + 22, ks * 0.62, PEN, 2.2, (cd.caseNumber || 1) + 5);
      ry += ks + 14;
    }
    // The cost (sourced impact), unless it is already the chart's own sentence
    const costText = chart && chart.field === 'businessImpact' ? '' : (cd.businessImpact || '');
    if (costText) {
      right += `<text x="${xR}" y="${ry + 16}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="1.4" fill="${PEN}">THE COST</text>`;
      ry += 16 + 12;
      const cost = fit(costText, colW, { fam: 'newsI', weight: 700, sizes: [lv.body + 6, lv.body + 4, lv.body + 2], lh: 1.32, maxLines: 10 });
      right += block(cost, xR, ry, INK);
      ry += cost.height + 26;
    } else if (chart) {
      const capt = fit(chart.sentence, colW, { fam: 'serifI', weight: 400, sizes: [16], lh: 1.4, maxLines: 6 });
      right += block(capt, xR, ry - 18, '#5B6270');
      ry += capt.height + 12;
    }
    // Operator's takeaway
    ry += sp;
    right += `<rect x="${xR}" y="${ry}" width="${colW}" height="3" fill="${INK}"/>`;
    ry += 3 + 14;
    right += `<text x="${xR}" y="${ry + 24}" font-family="${FONT_FAMILY.news}" font-style="italic" font-weight="700" font-size="28" fill="${INK}">The operator's takeaway</text>`;
    ry += 28 + 16;
    const takeTop = ry;
    items.slice(0, 4).forEach((it, i) => {
      const b = fit(it + '.', colW - 34, { fam: 'serif', weight: 400, sizes: [lv.body], lh: 1.4, maxLines: 8 });
      right += `<text x="${xR}" y="${(ry + lv.body * 0.8).toFixed(1)}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="${lv.body}" fill="${PEN}">${i + 1}.</text>` + block(b, xR + 34, ry, INK);
      ry += b.height + 10;
    });
    parts.push(R(1.1, right), extra);
    // "Start here" note pointing at the first takeaway, written in the gutter/left column end
    if (items.length) {
      const nx = xR - gut - 18, ny = Math.max(ly + 70, takeTop + 6);
      if (ny < CANVAS.h - M - 110) {
        parts.push(handNote('start here', nx, ny, PEN_BLUE, 3.4, { size: 34, rotate: -6, anchor: 'end' }),
          handArrow(nx - 30, ny + 10, xR - 6, takeTop + lv.body * 0.5, PEN_BLUE, 3.8, 26));
      }
    }
    const bottom = Math.max(ly, ry);
    // Footer
    const fy = CANVAS.h - M;
    parts.push(`<line x1="${M}" y1="${fy - 30}" x2="${W - M}" y2="${fy - 30}" stroke="${INK}" stroke-width="1"/>`,
      `<text x="${M}" y="${fy}" font-family="${FONT_FAMILY.serif}" font-style="italic" font-size="14" fill="#5B6270">The Case File · ${esc(cd.company || '')}</text>`,
      `<text x="${W / 2}" y="${fy}" font-family="${FONT_FAMILY.mono}" font-size="12" fill="#5B6270" text-anchor="middle">A1</text>`,
      `<text x="${W - M}" y="${fy}" font-family="${FONT_FAMILY.mono}" font-size="12" fill="#5B6270" text-anchor="end">${esc(pickSource(`Source: ${sourceLabel(cd)}`, CW / 2 - 60))}</text>`, '</svg>');
    return { svg: parts.join('\n  '), bottom: bottom + 24 };
  });
}

// ═══ PRINT STYLES: 11 more looks for the same sourced case (12 with the newspaper) ═══
// Every style uses only the case's own fields and figures; every one animates (GIF / MP4).
const caseParts = (cd) => {
  const chart = chartData(cd);
  return { head: headlineFor(cd), co: String(cd.company || ''), problem: cd.documentedProblem || '', cause: cd.rootCauseAnalysis || '',
    cost: cd.businessImpact || '', record: cd.documentedResponse || '', fixes: actionItems(cd.recommendedFix), chart,
    single: chart ? null : extractFigures(cd), src: `Source: ${sourceLabel(cd)}`, period: cd.period || '', theme: cd.theme || '',
    no: caseNo(cd), angle: asSentence(cd.postAngle || cd.documentedProblem || '') };
};
// Largest size whose wrapped lines fit the box height; sourced text is only shortened if even the smallest size cannot fit.
function fitIn(text, w, h, fam, weight, sizes, lh = 1.3, tracking = 0) {
  for (const size of sizes) {
    const lines = wrapPx(text, w, { fam, weight, size, tracking });
    if (lines.length * size * lh <= h + 0.5) return { lines, size, lh, fam, weight, tracking, height: lines.length * size * lh };
  }
  const size = sizes[sizes.length - 1], f = { fam, weight, size, tracking };
  const lines = clampLines(wrapPx(text, w, f), Math.max(1, Math.floor(h / (size * lh))), w, f);
  fit.clamped = true;
  return { lines, size, lh, fam, weight, tracking, height: lines.length * size * lh, clamped: true };
}
// A list (bullets / numbers / checkboxes) fitted as a whole into a box.
function listIn(items, x, y, w, h, { fam = 'body', weight = 400, sizes = [24, 22, 20, 18, 16], lh = 1.3, color = '#1B2433', mark = (i) => `${i + 1}.`, markColor = color, markFam = fam, gap = 0.45, delay = 0 } = {}) {
  for (const size of sizes) {
    const mw = measure('00.', markFam, weight, size) + 8;
    const blocks = items.map((t) => wrapPx(t + (/[.!?]$/.test(t) ? '' : '.'), w - mw, { fam, weight, size }));
    const total = blocks.reduce((a, b) => a + b.length * size * lh, 0) + Math.max(0, blocks.length - 1) * size * gap;
    if (total <= h || size === sizes[sizes.length - 1]) {
      if (total > h) fit.clamped = true;
      let yy = y, svg = '';
      const it = isItalic(fam) ? ' font-style="italic"' : '';
      blocks.forEach((ls, i) => {
        let one = `<text x="${x}" y="${(yy + size * 0.8).toFixed(1)}" font-family="${FONT_FAMILY[markFam]}" font-weight="${weight}" font-size="${size}" fill="${markColor}">${esc(mark(i))}</text>`;
        ls.forEach((l, j) => { one += `<text x="${x + mw}" y="${(yy + size * 0.8 + j * size * lh).toFixed(1)}" font-family="${FONT_FAMILY[fam]}" font-weight="${weight}" font-size="${size}" fill="${color}"${it}>${esc(l)}</text>`; });
        svg += R(delay + i * 0.18, one);
        yy += ls.length * size * lh + size * gap;
      });
      return { svg, h: yy - y, size };
    }
  }
  return { svg: '', h: 0, size: 0 };
}
function pic(href, x, y, w, h, { filter = '', kb = true } = {}) {
  if (!href) return '';
  const cid = `pc${++clipSeq}`;
  return `<clipPath id="${cid}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#${cid})"><g transform="translate(${x + w / 2} ${y + h / 2})"><g transform="scale(1)">${kb ? '<animateTransform data-kb="1" attributeName="transform" type="scale" values="1.14;1" keyTimes="0;1" dur="6s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1"/>' : ''}<image href="${esc(href)}" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${filter ? ` filter="url(#${filter})"` : ''}/></g></g></g>`;
}
const GRAY = '<filter id="gray"><feColorMatrix type="saturate" values="0.05"/><feComponentTransfer><feFuncR type="linear" slope="1.15" intercept="-0.05"/><feFuncG type="linear" slope="1.15" intercept="-0.05"/><feFuncB type="linear" slope="1.15" intercept="-0.05"/></feComponentTransfer></filter>';
// Sourced bar chart in any style. Bars start at zero; values are the case's own figures.
function barsIn(chart, x, y, w, st) {
  const figs = chart.figs.slice(0, 4), max = Math.max(...figs.map((f) => f.value));
  const vf = st.valueFam || 'mono', vw = st.valueWeight || 700, vs = st.value || 26, lf = st.labelFam || 'body', lw = st.labelWeight || 600;
  const valW = Math.max(...figs.map((f) => measure(f.raw, vf, vw, vs))) + 18, barMax = w - valW;
  let svg = '', yy = y, last = null;
  figs.forEach((f, i) => {
    const bw = Math.max(4, (f.value / max) * barMax), d = (st.delay || 1) + i * 0.3, hot = i === figs.length - 1;
    svg += `<text x="${x}" y="${(yy + st.label * 0.85).toFixed(1)}" font-family="${FONT_FAMILY[lf]}" font-weight="${lw}" font-size="${st.label}" fill="${st.labelColor}">${esc(f.label)}</text>`;
    const by = yy + st.label + 8;
    svg += `<rect x="${x}" y="${by}" width="${bw.toFixed(1)}" height="${st.bar}" rx="${st.rx || 0}" fill="${hot ? st.hot : st.cold}"${st.stroke ? ` stroke="${st.stroke}" stroke-width="2"` : ''}>${anim('width', 0, bw.toFixed(1), d, 0.9)}</rect>`;
    svg += `<text x="${(x + bw + 12).toFixed(1)}" y="${(by + st.bar / 2 + vs * 0.36).toFixed(1)}" font-family="${FONT_FAMILY[vf]}" font-weight="${vw}" font-size="${vs}" fill="${st.valueColor}">${anim('x', (x + 12).toFixed(1), (x + bw + 12).toFixed(1), d, 0.9)}${esc(f.raw)}</text>`;
    if (hot) last = { cx: x + bw + 12 + measure(f.raw, vf, vw, vs) / 2, cy: by + st.bar / 2, rx: measure(f.raw, vf, vw, vs) / 2 + 16, ry: Math.max(st.bar, vs) * 0.8 };
    yy = by + st.bar + (st.gap || 16);
  });
  return { svg, h: yy - y, last };
}
// The figure in one line: chart sentence, single figure, or nothing.
const figureLine = (p) => (p.chart ? p.chart.sentence : p.single ? p.single.sentence : '');
function wrapRot(content, rot, cx, cy) { return `<g transform="rotate(${rot} ${cx} ${cy})">${content}</g>`; }
// Pops in: starts scaled up and transparent, lands at full size (a stamp / sticker slam).
function slam(content, cx, cy, delay, from = 1.6) {
  return `<g opacity="1">${anim('opacity', 0, 1, delay, 0.25)}<g transform="translate(${cx} ${cy})"><g transform="scale(1)"><animateTransform attributeName="transform" type="scale" values="${from};${from};1" keyTimes="0;${r2(delay / (delay + 0.35))};1" dur="${r2(delay + 0.35)}s" fill="freeze" calcMode="spline" keySplines="0 0 1 1;0.3 0 0.2 1"/><g transform="translate(${-cx} ${-cy})">${content}</g></g></g></g>`;
}
// Text appears left to right (typing / writing) inside its own clip.
function writeOn(content, x, y, w, h, delay, dur = 0.8) {
  const id = `wo${++clipSeq}`;
  return `<clipPath id="${id}"><rect x="${x - 4}" y="${y - 4}" width="${(w + 8).toFixed(0)}" height="${(h + 8).toFixed(0)}">${anim('width', 0, (w + 8).toFixed(0), delay, dur)}</rect></clipPath><g clip-path="url(#${id})">${content}</g>`;
}
function jitterRect(x, y, w, h, color, delay, seed = 5, width = 3.4) {
  const r = rng(seed), j = () => (r() - 0.5) * 6, pts = [];
  const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x + 8, y - 2]];
  for (let i = 0; i < corners.length - 1; i++) {
    const [ax, ay] = corners[i], [bx, by] = corners[i + 1];
    for (let t = 0; t <= 1; t += 0.25) pts.push([ax + (bx - ax) * t + j(), ay + (by - ay) * t + j()]);
  }
  return penStroke(pts, color, width, delay, 0.9);
}
const tinyFooter = (p, y, color, x1 = CANVAS.m, x2 = CANVAS.w - CANVAS.m, fam = 'mono') =>
  `<text x="${x1}" y="${y}" font-family="${FONT_FAMILY[fam]}" font-size="12" fill="${color}">${esc(`Case ${p.no} · ${p.theme}`)}</text>
  <text x="${x2}" y="${y}" font-family="${FONT_FAMILY[fam]}" font-size="12" fill="${color}" text-anchor="end">${esc(pickSource(p.src, (x2 - x1) * 0.62))}</text>`;
const once = (build) => { clipSeq = 0; fit.clamped = false; return build(); };

// 1 ─ Magazine cover
export function generateMagazine({ caseData, heroHref = '' }) {
  return once(() => {
    const p = caseParts(caseData || {}), M = CANVAS.m, W = CANVAS.w, H = CANVAS.h, out = [svgOpen('#101826')];
    out.push(`<defs><linearGradient id="magShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080F" stop-opacity="0.75"/><stop offset="0.35" stop-color="#05080F" stop-opacity="0.15"/><stop offset="0.6" stop-color="#05080F" stop-opacity="0.55"/><stop offset="1" stop-color="#05080F" stop-opacity="0.96"/></linearGradient>
      <radialGradient id="magGlow" cx="70%" cy="35%" r="70%"><stop offset="0" stop-color="#DC6656" stop-opacity="0.55"/><stop offset="1" stop-color="#101826" stop-opacity="0"/></radialGradient></defs>`);
    out.push(heroHref ? pic(heroHref, 0, 0, W, H) : `<rect width="${W}" height="${H}" fill="url(#magGlow)"/>`, `<rect width="${W}" height="${H}" fill="url(#magShade)"/>`);
    out.push(R(0, `<text x="${M - 6}" y="250" font-family="${FONT_FAMILY.poster}" font-size="262" letter-spacing="6" fill="#FFFFFF">OPERATOR</text>`,
      `<text x="${M}" y="292" font-family="${FONT_FAMILY.mono}" font-size="15" letter-spacing="2.4" fill="#FFFFFF">${esc(`THE CASE ISSUE · NO. ${p.no} · ${p.period}`.toUpperCase())}</text>`));
    // Cover lines
    let y = 360;
    const lines = [['THE PROBLEM', p.problem], ['THE COST', p.cost], ['THE FIX', p.fixes[0] ? p.fixes[0] + '.' : '']].filter((l) => l[1]);
    lines.forEach(([label, text], i) => {
      const b = fitIn(text, 470, 150, 'head', 700, [26, 24, 22, 20, 18], 1.25);
      out.push(R(0.6 + i * 0.25, `<rect x="${M}" y="${y}" width="40" height="4" fill="#DC6656"/>`, `<text x="${M}" y="${y + 30}" font-family="${FONT_FAMILY.mono}" font-size="14" letter-spacing="2" fill="#F2B49E">${label}</text>`, block(b, M, y + 46, '#FFFFFF')));
      y += 46 + b.height + 34;
    });
    // Sticker with the sourced number
    const fig = p.chart ? p.chart.figs[p.chart.figs.length - 1] : p.single ? p.single.figs[0] : null;
    if (fig) {
      const cx = 930, cy = 560, fs = Math.min(84, Math.floor(300 / Math.max(1, measure(fig.raw, 'poster', 400, 1))));
      out.push(slam(`<circle cx="${cx}" cy="${cy}" r="150" fill="#DC6656"/><circle cx="${cx}" cy="${cy}" r="136" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="6 8"/>
        <text x="${cx}" y="${cy - 48}" font-family="${FONT_FAMILY.mono}" font-size="15" letter-spacing="2" fill="#FFFFFF" text-anchor="middle">${esc((fig.label || 'THE NUMBER').toUpperCase().slice(0, 22))}</text>
        <text x="${cx}" y="${cy + fs * 0.36}" font-family="${FONT_FAMILY.poster}" font-size="${fs}" fill="#FFFFFF" text-anchor="middle">${esc(fig.raw)}</text>`, cx, cy, 1.6));
    }
    // Cover story
    const coSize = Math.min(220, Math.floor(1050 / Math.max(1, measure(p.co.toUpperCase(), 'poster', 400, 1))));
    const deck = fitIn(p.angle, CW, 260, 'newsI', 700, [46, 42, 38, 34, 30, 26], 1.18);
    const deckY = H - 120 - deck.height;
    out.push(R(0.2, `<text x="${M - 4}" y="${deckY - 30}" font-family="${FONT_FAMILY.poster}" font-size="${coSize}" fill="#FFFFFF">${esc(p.co.toUpperCase())}</text>`), R(0.45, block(deck, M, deckY, '#FFFFFF')));
    out.push(tinyFooter(p, H - 56, '#C9D1DC'), '</svg>');
    return out.join('\n  ');
  });
}

// 2 ─ Billboard / hoarding
export function generateBillboard({ caseData, heroHref = '' }) {
  return once(() => {
    const p = caseParts(caseData || {}), W = CANVAS.w, H = CANVAS.h, out = [svgOpen('#1E232B')];
    out.push(`<defs><linearGradient id="bbSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E1522"/><stop offset="1" stop-color="#3A2E3A"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bbSky)"/>`);
    // Structure: legs, catwalk, lamps
    out.push(`<rect x="300" y="1060" width="34" height="440" fill="#0B0E13"/><rect x="866" y="1060" width="34" height="440" fill="#0B0E13"/><rect x="40" y="1048" width="1120" height="14" fill="#0B0E13"/>`);
    const bx = 40, by = 210, bw = 1120, bh = 830;
    out.push(`<rect x="${bx - 12}" y="${by - 12}" width="${bw + 24}" height="${bh + 24}" fill="#0B0E13"/>`);
    for (const lx of [200, 600, 1000]) out.push(`<rect x="${lx - 4}" y="${by - 70}" width="8" height="58" fill="#0B0E13"/><rect x="${lx - 34}" y="${by - 84}" width="68" height="18" rx="4" fill="#0B0E13"/><polygon points="${lx - 30},${by - 66} ${lx + 30},${by - 66} ${lx + 150},${by + 260} ${lx - 150},${by + 260}" fill="#FFF3C4" opacity="0.10">${anim('opacity', 0, 0.1, 0.2, 0.4)}</polygon>`);
    // Poster on the board
    const leftW = heroHref ? 640 : bw;
    out.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#F2B705"/>`);
    if (heroHref) out.push(pic(heroHref, bx + leftW, by, bw - leftW, bh));
    const pad = 44, tw = leftW - 2 * pad;
    const coSize = Math.min(210, Math.floor(tw / Math.max(1, measure(p.co.toUpperCase(), 'poster', 400, 1))));
    out.push(R(0.3, `<text x="${bx + pad}" y="${by + 40 + coSize * 0.82}" font-family="${FONT_FAMILY.poster}" font-size="${coSize}" fill="#14243A">${esc(p.co.toUpperCase())}</text>`));
    let y = by + 40 + coSize * 0.9 + 18;
    const fig = p.chart ? p.chart.figs[p.chart.figs.length - 1] : p.single ? p.single.figs[0] : null;
    const figH = fig ? 150 : 0;
    const ang = fitIn(p.angle, tw, by + bh - 50 - figH - y, 'head', 800, [52, 48, 44, 40, 36, 32, 28, 26], 1.1);
    out.push(R(0.6, block(ang, bx + pad, y, '#14243A')));
    if (fig) {
      const fs = Math.min(140, Math.floor(tw / Math.max(1, measure(fig.raw, 'poster', 400, 1))));
      out.push(slam(`<text x="${bx + pad}" y="${by + bh - 46}" font-family="${FONT_FAMILY.poster}" font-size="${fs}" fill="#C8382B">${esc(fig.raw)}</text>`, bx + pad + 120, by + bh - 90, 1.4, 1.5));
    }
    // Street level: the lesson + source
    const lesson = fitIn(p.fixes[0] ? `The lesson: ${p.fixes[0]}.` : p.cause, W - 2 * CANVAS.m, 150, 'head', 700, [34, 30, 28, 26, 24, 22], 1.25);
    out.push(R(1.8, `<rect x="${CANVAS.m - 20}" y="1150" width="${W - 2 * CANVAS.m + 40}" height="${lesson.height + 52}" rx="12" fill="#0B0E13" opacity="0.85"/>`, block(lesson, CANVAS.m, 1176, '#FFFFFF')));
    out.push(tinyFooter(p, H - 40, '#9AA5B5'), '</svg>');
    return out.join('\n  ');
  });
}

// 3 ─ Swiss typographic poster
export function generateSwiss({ caseData }) {
  return once(() => {
    const p = caseParts(caseData || {}), M = CANVAS.m, W = CANVAS.w, H = CANVAS.h, RED = '#E0301E', INKS = '#111111', out = [svgOpen('#F1EFEA')];
    for (let i = 0; i <= 12; i++) out.push(`<line x1="${M + i * 88}" y1="${M}" x2="${M + i * 88}" y2="${H - M}" stroke="#D8D4CB" stroke-width="1"/>`);
    out.push(`<text x="${W - M + 30}" y="560" font-family="${FONT_FAMILY.poster}" font-size="640" fill="${RED}" text-anchor="end" opacity="1">${anim('opacity', 0, 1, 0, 0.6)}${esc(p.no)}</text>`);
    out.push(R(0.2, `<text x="${M}" y="${M + 14}" font-family="${FONT_FAMILY.mono}" font-size="14" letter-spacing="1.6" fill="${INKS}">${esc(`${p.theme} — ${p.period}`.toUpperCase())}</text>`));
    const h = fitIn(p.head, 560, 560, 'head', 800, [64, 58, 54, 50, 46, 42, 38, 34], 1.04);
    out.push(R(0.35, block(h, M, M + 60, INKS)));
    // 2 x 2 grid
    const top = 700, cw = (CW - 24) / 2, ch = (H - M - 70 - top - 24) / 2;
    const cells = [['01', 'Problem', p.problem], ['02', 'Root cause', p.cause], ['03', 'Cost', p.chart ? '' : (p.cost || p.record)], ['04', 'Fix', '']];
    cells.forEach(([n, label, text], i) => {
      const x = M + (i % 2) * (cw + 24), y = top + Math.floor(i / 2) * (ch + 24);
      let c = `<rect x="${x}" y="${y}" width="${cw}" height="4" fill="${i === 2 ? RED : INKS}"/><text x="${x}" y="${y + 52}" font-family="${FONT_FAMILY.poster}" font-size="44" fill="${i === 2 ? RED : INKS}">${n}</text><text x="${x + 60}" y="${y + 48}" font-family="${FONT_FAMILY.head}" font-weight="700" font-size="24" fill="${INKS}">${label}</text>`;
      if (i === 2 && p.chart) c += barsIn(p.chart, x, y + 74, cw, { label: 16, labelColor: INKS, bar: 22, hot: RED, cold: INKS, value: 22, valueColor: INKS, delay: 1.4, gap: 10 }).svg;
      else if (i === 3) c += listIn(p.fixes, x, y + 74, cw, ch - 80, { sizes: [21, 19, 18, 17, 16, 15], color: INKS, markColor: RED, mark: () => '—', delay: 1.6 }).svg;
      else c += block(fitIn(text, cw, ch - 80, 'body', 400, [21, 20, 19, 18, 17, 16, 15], 1.38), x, y + 74, INKS);
      out.push(R(0.8 + i * 0.2, c));
    });
    out.push(tinyFooter(p, H - M + 20, '#5A5A5A'), '</svg>');
    return out.join('\n  ');
  });
}

// 4 ─ Retro screen-print poster (sunburst)
export function generateRetro({ caseData, heroHref = '' }) {
  return once(() => {
    const p = caseParts(caseData || {}), W = CANVAS.w, H = CANVAS.h, CREAM = '#F3E7CF', NAVY = '#1D2B4A', CORAL = '#E0604A', TEAL = '#1F8A84', out = [svgOpen(CREAM)];
    const cx = 600, cy = 560;
    let rays = '';
    for (let i = 0; i < 24; i += 2) { const a1 = (i / 24) * Math.PI * 2, a2 = ((i + 1) / 24) * Math.PI * 2; rays += `<polygon points="${cx},${cy} ${cx + Math.cos(a1) * 1400},${cy + Math.sin(a1) * 1400} ${cx + Math.cos(a2) * 1400},${cy + Math.sin(a2) * 1400}" fill="${CORAL}" opacity="0.85"/>`; }
    out.push(`<g transform="rotate(0 ${cx} ${cy})"><animateTransform attributeName="transform" type="rotate" values="-12 ${cx} ${cy};0 ${cx} ${cy}" keyTimes="0;1" dur="5s" fill="freeze" calcMode="spline" keySplines="0.16 1 0.3 1"/>${rays}</g>`);
    out.push(`<defs><pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="${NAVY}" opacity="0.25"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#dots)"/>`);
    out.push(slam(`<circle cx="${cx}" cy="${cy}" r="300" fill="${NAVY}"/><circle cx="${cx}" cy="${cy}" r="280" fill="none" stroke="${CREAM}" stroke-width="3"/>${heroHref ? `<clipPath id="disc"><circle cx="${cx}" cy="${cy}" r="270"/></clipPath><g clip-path="url(#disc)" opacity="0.55">${pic(heroHref, cx - 270, cy - 270, 540, 540, { filter: 'gray' })}</g><defs>${GRAY}</defs>` : ''}`, cx, cy, 0.2, 0.6));
    const coSize = Math.min(150, Math.floor(480 / Math.max(1, measure(p.co.toUpperCase(), 'poster', 400, 1))));
    out.push(R(0.7, `<text x="${cx + 5}" y="${cy + coSize * 0.35 + 5}" font-family="${FONT_FAMILY.poster}" font-size="${coSize}" fill="${CORAL}" text-anchor="middle">${esc(p.co.toUpperCase())}</text><text x="${cx}" y="${cy + coSize * 0.35}" font-family="${FONT_FAMILY.poster}" font-size="${coSize}" fill="${CREAM}" text-anchor="middle">${esc(p.co.toUpperCase())}</text>`,
      `<text x="${cx}" y="${cy + coSize * 0.35 + 52}" font-family="${FONT_FAMILY.mono}" font-size="18" letter-spacing="3" fill="${CREAM}" text-anchor="middle">${esc(p.period)}</text>`));
    // Banner
    out.push(R(0.4, `<rect x="0" y="40" width="${W}" height="96" fill="${NAVY}"/><text x="${cx}" y="112" font-family="${FONT_FAMILY.poster}" font-size="78" letter-spacing="8" fill="${CREAM}" text-anchor="middle">${esc(`CASE ${p.no} · ${p.theme}`.toUpperCase().slice(0, 34))}</text>`));
    // Lower block
    out.push(`<rect x="0" y="900" width="${W}" height="${H - 900}" fill="${CREAM}"/><rect x="0" y="900" width="${W}" height="10" fill="${NAVY}"/>`);
    const ang = fitIn(p.angle.toUpperCase(), CW, 300, 'poster', 400, [84, 76, 68, 62, 56, 50, 46, 42], 1.0, 1);
    out.push(R(1.0, block({ ...ang }, CANVAS.m + 4, 944 + 4, CORAL), block(ang, CANVAS.m, 944, NAVY)));
    const lessonTop = 944 + ang.height + 28;
    const les = fitIn(p.fixes[0] ? `Lesson: ${p.fixes[0]}.` : p.cause, CW, H - 110 - lessonTop, 'head', 700, [28, 26, 24, 22, 20, 18], 1.3);
    out.push(R(1.5, `<rect x="${CANVAS.m}" y="${lessonTop}" width="10" height="${les.height}" fill="${TEAL}"/>`, block(les, CANVAS.m + 28, lessonTop, NAVY)));
    out.push(tinyFooter(p, H - 52, NAVY), '</svg>');
    return out.join('\n  ');
  });
}

// 5 ─ Detective corkboard (index card, polaroid, sticky notes, red string)
export function generateCorkboard({ caseData, heroHref = '' }) {
  return once(() => {
    const p = caseParts(caseData || {}), W = CANVAS.w, H = CANVAS.h, out = [svgOpen('#B7864F')];
    out.push(`<defs><pattern id="cork" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="2" fill="#8E6236" opacity="0.5"/><circle cx="15" cy="13" r="1.6" fill="#D6A86E" opacity="0.6"/><circle cx="9" cy="18" r="1.2" fill="#7A522C" opacity="0.5"/></pattern>${GRAY}</defs><rect width="${W}" height="${H}" fill="url(#cork)"/><rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#5C3B1E" stroke-width="28"/>`);
    const pins = [];
    const note = (x, y, w, h, color, rot, title, inner, d) => {
      pins.push([x + w / 2, y + 16]);
      out.push(R(d, wrapRot(`<rect x="${x + 5}" y="${y + 8}" width="${w}" height="${h}" fill="#000" opacity="0.22"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>${title ? `<text x="${x + 22}" y="${y + 54}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="34" fill="#C8382B">${esc(title)}</text>` : ''}${inner}`, rot, x + w / 2, y + h / 2)));
    };
    // Index card with the headline
    const card = fitIn(p.head, 590, 250, 'type', 400, [34, 31, 28, 26, 24, 22], 1.25);
    note(64, 70, 640, 340, '#FBFAF6', -2, '', `<line x1="64" y1="128" x2="704" y2="128" stroke="#E0726A" stroke-width="2"/>${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="64" y1="${170 + i * 38}" x2="704" y2="${170 + i * 38}" stroke="#A9C7E8" stroke-width="1"/>`).join('')}<text x="86" y="112" font-family="${FONT_FAMILY.type}" font-size="24" fill="#1B2433">${esc(`CASE ${p.no} — ${p.period}`)}</text>${block(card, 86, 146, '#1B2433')}`, 0.1);
    // Polaroid
    note(770, 96, 360, 420, '#FFFFFF', 4, '', `${heroHref ? pic(heroHref, 790, 116, 320, 300, { filter: 'gray' }) : `<rect x="790" y="116" width="320" height="300" fill="#2A3140"/>`}<text x="950" y="478" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="40" fill="#1B2433" text-anchor="middle">${esc(p.co)}</text>`, 0.4);
    const stickies = [
      [70, 500, 340, 360, '#FFE97A', 2, 'The problem', p.problem],
      [440, 540, 340, 360, '#FFB3C7', -3, 'Why', p.cause],
      [810, 590, 330, 360, '#A8DDF5', 3, 'The cost', p.chart || p.single ? '' : (p.cost || p.record)],
    ];
    stickies.forEach(([x, y, w, h, c, rot, t, text], i) => {
      let inner = '';
      if (i === 2 && (p.chart || p.single)) {
        const fig = p.chart ? p.chart.figs[p.chart.figs.length - 1] : p.single.figs[0];
        const fs = Math.min(96, Math.floor((w - 50) / Math.max(1, measure(fig.raw, 'hand', 700, 1))));
        inner = `<text x="${x + 24}" y="${y + 80 + fs * 0.8}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="${fs}" fill="#1B2433">${esc(fig.raw)}</text>` + block(fitIn(figureLine(p), w - 44, h - 110 - fs, 'hand', 700, [26, 24, 22, 20, 18], 1.12), x + 22, y + 104 + fs, '#1B2433');
      } else inner = block(fitIn(text, w - 44, h - 90, 'hand', 700, [32, 30, 28, 26, 24, 22, 20], 1.12), x + 22, y + 74, '#1B2433');
      note(x, y, w, h, c, rot, t, inner, 0.8 + i * 0.3);
    });
    // Fix card
    const fx = 150, fy = 960, fw = 900, fh = 430;
    note(fx, fy, fw, fh, '#CFF2C6', -1, 'What to do', listIn(p.fixes, fx + 24, fy + 80, fw - 48, fh - 100, { fam: 'hand', weight: 700, sizes: [32, 30, 28, 26, 24, 22], lh: 1.12, markColor: '#C8382B', delay: 1.9 }).svg, 1.7);
    // Red string between pins, then the pins themselves
    const order = [pins[0], pins[2], pins[3], pins[4], pins[1], pins[5]];
    for (let i = 0; i < order.length - 1; i++) {
      const [ax, ay] = order[i], [bx, by] = order[i + 1];
      out.push(penStroke([[ax, ay], [(ax + bx) / 2, (ay + by) / 2 + 26], [bx, by]], '#C8202A', 2.6, 2.4 + i * 0.22, 0.35));
    }
    pins.forEach(([x, y], i) => out.push(R(0.2 + i * 0.12, `<circle cx="${x}" cy="${y}" r="11" fill="#C8202A"/><circle cx="${x - 3}" cy="${y - 3}" r="3.5" fill="#FFFFFF" opacity="0.7"/>`)));
    out.push(`<rect x="40" y="${H - 64}" width="${W - 80}" height="30" fill="#5C3B1E" opacity="0.9"/>`, tinyFooter(p, H - 44, '#F3E3C8', 60, W - 60), '</svg>');
    return out.join('\n  ');
  });
}

// 6 ─ Whiteboard (marker sketch)
export function generateWhiteboard({ caseData }) {
  return once(() => {
    const p = caseParts(caseData || {}), M = CANVAS.m, W = CANVAS.w, H = CANVAS.h, BLUE = '#1F4FB8', RED = '#D22F2F', GREEN = '#1E8A4C', BLK = '#1B1F24', out = [svgOpen('#FAFAF7')];
    out.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="#B9C0C8" stroke-width="20" rx="8"/><rect x="200" y="${H - 34}" width="800" height="18" rx="6" fill="#B9C0C8"/>`);
    const t = fitIn(p.head, CW, 250, 'hand', 700, [72, 66, 60, 56, 52, 48, 44], 1.02);
    out.push(writeOn(block(t, M, 60, BLUE), M, 60, CW, t.height, 0.1, 1.1));
    out.push(handUnderline(M, M + Math.min(CW, measure(t.lines[t.lines.length - 1], 'hand', 700, t.size)), 60 + t.height + 4, BLUE, 1.1, 9));
    const top = 60 + t.height + 50, bw = (CW - 70) / 2, bh = (H - 120 - top - 60) / 2;
    const boxes = [['PROBLEM', p.problem, RED], ['ROOT CAUSE', p.cause, BLUE], ['COST', p.chart ? '' : (p.cost || p.record), RED], ['FIX', '', GREEN]];
    boxes.forEach(([label, text, col], i) => {
      const x = M + (i % 2) * (bw + 70), y = top + Math.floor(i / 2) * (bh + 60), d = 1.3 + i * 0.6;
      out.push(jitterRect(x, y, bw, bh, col, d, 11 + i));
      let inner = `<text x="${x + 22}" y="${y + 46}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="38" fill="${col}">${label}</text>`;
      if (i === 2 && p.chart) {
        const b = barsIn(p.chart, x + 22, y + 66, bw - 44, { label: 30, labelFam: 'hand', labelWeight: 700, labelColor: BLK, bar: 34, hot: RED, cold: '#8A9099', value: 30, valueFam: 'hand', valueWeight: 700, valueColor: BLK, delay: d + 0.5, gap: 10 });
        inner += b.svg;
        if (b.last) out.push(handCircle(b.last.cx, b.last.cy, b.last.rx, b.last.ry, RED, d + 1.6, 31));
      } else if (i === 3) inner += listIn(p.fixes, x + 22, y + 66, bw - 44, bh - 80, { fam: 'hand', weight: 700, sizes: [40, 36, 34, 32, 30, 28, 26, 24, 22, 20], lh: 1.1, color: BLK, mark: () => '•', markColor: GREEN, delay: d + 0.3 }).svg;
      else inner += block(fitIn(text, bw - 44, bh - 80, 'hand', 700, [44, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20], 1.1), x + 22, y + 66, BLK);
      out.push(writeOn(inner, x, y, bw, bh, d + 0.2, 0.9));
    });
    // Arrows between boxes
    const ay1 = top + bh / 2, ay2 = top + bh + 60 + bh / 2;
    out.push(handArrow(M + bw + 8, ay1, M + bw + 62, ay1, BLK, 1.8, 0), handArrow(M + bw + 40, top + bh + 6, M + bw - 30, top + bh + 54, BLK, 2.4, 0), handArrow(M + bw + 8, ay2, M + bw + 62, ay2, BLK, 3.0, 0));
    out.push(tinyFooter(p, H - 52, '#6B7280'), '</svg>');
    return out.join('\n  ');
  });
}

// 7 ─ Blueprint
export function generateBlueprint({ caseData }) {
  return once(() => {
    const p = caseParts(caseData || {}), M = CANVAS.m, W = CANVAS.w, H = CANVAS.h, WH = '#EAF2FF', LN = '#9CC0EE', out = [svgOpen('#123E73')];
    out.push(`<defs><pattern id="bpMinor" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#2A5A94" stroke-width="1"/></pattern><pattern id="bpMajor" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" fill="url(#bpMinor)"/><path d="M120 0H0V120" fill="none" stroke="#3B6FAD" stroke-width="1.5"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#bpMajor)"/><rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="${WH}" stroke-width="3"/>`);
    out.push(R(0.1, `<text x="${M}" y="${M + 30}" font-family="${FONT_FAMILY.mono}" font-size="16" letter-spacing="3" fill="${LN}">${esc(`FAILURE ANALYSIS · SHEET ${p.no}`)}</text>`));
    const t = fitIn(p.head, CW, 230, 'head', 800, [56, 52, 48, 44, 40, 36], 1.08);
    out.push(R(0.3, block(t, M, M + 54, WH)));
    const top = M + 54 + t.height + 44, colW = (CW - 60) / 2;
    const comp = [['A', 'PROBLEM', p.problem], ['B', 'ROOT CAUSE', p.cause], ['C', 'IMPACT', p.chart ? '' : (p.cost || p.record)], ['D', 'FIX', '']];
    const bh = (H - 300 - top) / 2;
    comp.forEach(([k, label, text], i) => {
      const x = M + (i % 2) * (colW + 60), y = top + Math.floor(i / 2) * (bh + 50), d = 0.8 + i * 0.45;
      out.push(penStroke([[x, y], [x + colW, y], [x + colW, y + bh], [x, y + bh], [x, y]], WH, 2, d, 0.8));
      let inner = `<circle cx="${x + 26}" cy="${y + 30}" r="16" fill="none" stroke="${WH}" stroke-width="2"/><text x="${x + 26}" y="${y + 36}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="17" fill="${WH}" text-anchor="middle">${k}</text><text x="${x + 54}" y="${y + 36}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="18" letter-spacing="2" fill="${LN}">${label}</text>`;
      if (i === 2 && p.chart) inner += barsIn(p.chart, x + 20, y + 64, colW - 40, { label: 15, labelFam: 'mono', labelWeight: 400, labelColor: LN, bar: 22, hot: 'none', cold: 'none', stroke: WH, value: 20, valueColor: WH, delay: d + 0.4, gap: 10 }).svg;
      else if (i === 3) inner += listIn(p.fixes, x + 20, y + 64, colW - 40, bh - 80, { fam: 'mono', weight: 400, sizes: [18, 17, 16, 15, 14], lh: 1.35, color: WH, markColor: LN, mark: (j) => `D${j + 1}`, delay: d + 0.3 }).svg;
      else inner += block(fitIn(text, colW - 40, bh - 80, 'mono', 400, [19, 18, 17, 16, 15, 14], 1.4), x + 20, y + 64, WH);
      out.push(R(d + 0.2, inner));
    });
    // Connectors + dimension line
    out.push(`<line x1="${M + colW}" y1="${top + bh / 2}" x2="${M + colW + 60}" y2="${top + bh / 2}" stroke="${WH}" stroke-width="2" stroke-dasharray="8 6"/><line x1="${M + colW}" y1="${top + bh * 1.5 + 50}" x2="${M + colW + 60}" y2="${top + bh * 1.5 + 50}" stroke="${WH}" stroke-width="2" stroke-dasharray="8 6"/>`);
    // Title block
    const ty = H - 220;
    out.push(R(2.4, `<rect x="${W - 36 - 560}" y="${ty}" width="560" height="184" fill="#123E73" stroke="${WH}" stroke-width="2"/>`,
      ...[['PROJECT', p.co], ['THEME', p.theme], ['PERIOD', p.period], ['SOURCE', pickSource(p.src, 380).replace(/^Source: /, '')]].map(([k, v], i) =>
        `<line x1="${W - 596}" y1="${ty + i * 46}" x2="${W - 36}" y2="${ty + i * 46}" stroke="${WH}" stroke-width="1"/><text x="${W - 580}" y="${ty + 30 + i * 46}" font-family="${FONT_FAMILY.mono}" font-size="13" letter-spacing="2" fill="${LN}">${k}</text><text x="${W - 460}" y="${ty + 30 + i * 46}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="16" fill="${WH}">${esc(String(v).slice(0, 40))}</text>`)));
    out.push('</svg>');
    return out.join('\n  ');
  });
}

// 8 ─ Classified dossier
export function generateDossier({ caseData, heroHref = '' }) {
  return once(() => {
    const p = caseParts(caseData || {}), W = CANVAS.w, H = CANVAS.h, TYPE = '#22201C', out = [svgOpen('#3A2A1F')];
    out.push(`<defs>${GRAY}<linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A3426"/><stop offset="1" stop-color="#2C1F17"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#wood)"/>`);
    out.push(`<path d="M60 150 H360 L390 110 H640 L670 150 H1140 V1450 H60 Z" fill="#D9B979"/><text x="420" y="140" font-family="${FONT_FAMILY.type}" font-size="22" fill="${TYPE}">${esc(`CASE FILE No. ${p.no}`)}</text>`);
    const sx = 100, sy = 200, sw = 940, sh = 1210;
    const sheet = [];
    sheet.push(`<rect x="${sx + 8}" y="${sy + 10}" width="${sw}" height="${sh}" fill="#000" opacity="0.18"/><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="#F6F1E4"/>`);
    let y = sy + 70;
    const field = (k, v, d) => { sheet.push(writeOn(`<text x="${sx + 50}" y="${y}" font-family="${FONT_FAMILY.type}" font-size="22" fill="${TYPE}">${esc(k)}</text><text x="${sx + 290}" y="${y}" font-family="${FONT_FAMILY.type}" font-size="22" fill="${TYPE}">${esc(v)}</text>`, sx + 50, y - 24, sw - 100, 32, d, 0.5)); y += 36; };
    field('SUBJECT:', p.co.toUpperCase(), 0.3); field('PERIOD:', p.period, 0.5); field('FILE TYPE:', `BUSINESS FAILURE — ${p.theme}`.toUpperCase().slice(0, heroHref ? 30 : 46), 0.7);
    y += 14;
    sheet.push(`<line x1="${sx + 50}" y1="${y}" x2="${sx + sw - 50}" y2="${y}" stroke="${TYPE}" stroke-width="2"/>`);
    y += 26;
    const hdW = heroHref ? 600 : sw - 100;
    const hd = fitIn(p.head, hdW, heroHref ? 230 : 170, 'type', 400, [34, 31, 28, 26, 24, 22], 1.22);
    sheet.push(writeOn(block(hd, sx + 50, y, TYPE), sx + 50, y, hdW, hd.height, 0.9, 0.9));
    if (heroHref) y = Math.max(y, 470 - hd.height - 30);
    y += hd.height + 30;
    const secs = [['FINDINGS:', p.cause], ['DAMAGE:', p.chart || p.single ? figureLine(p) : (p.cost || p.record)]];
    const avail = sy + sh - 60 - y;
    const recH = Math.max(170, avail * 0.34), secH = (avail - recH - 3 * 22) / 2;
    secs.forEach(([k, v], i) => {
      sheet.push(`<text x="${sx + 50}" y="${y + 18}" font-family="${FONT_FAMILY.type}" font-size="20" fill="#9A2B20">${k}</text>`);
      const b = fitIn(v, sw - 100, secH - 30, 'type', 400, [22, 21, 20, 19, 18, 17, 16], 1.32);
      sheet.push(writeOn(block(b, sx + 50, y + 32, TYPE), sx + 50, y + 32, sw - 100, b.height, 1.6 + i * 0.7, 0.7));
      y += 32 + b.height + 22;
    });
    sheet.push(`<text x="${sx + 50}" y="${y + 18}" font-family="${FONT_FAMILY.type}" font-size="20" fill="#9A2B20">RECOMMENDATION:</text>`);
    sheet.push(listIn(p.fixes, sx + 50, y + 34, sw - 100, sy + sh - 50 - (y + 34), { fam: 'type', weight: 400, sizes: [22, 20, 19, 18, 17, 16], lh: 1.3, color: TYPE, markColor: '#9A2B20', delay: 3.0 }).svg);
    out.push(wrapRot(sheet.join(''), -1.2, sx + sw / 2, sy + sh / 2));
    // Paper-clipped photo
    if (heroHref) out.push(R(0.5, wrapRot(`<rect x="796" y="236" width="300" height="250" fill="#FFFFFF"/>${pic(heroHref, 810, 250, 272, 222, { filter: 'gray', kb: false })}<path d="M930 214 v70 a14 14 0 0 0 28 0 v-60 a8 8 0 0 0 -16 0 v54" fill="none" stroke="#9AA3AD" stroke-width="5" stroke-linecap="round"/>`, 5, 946, 361)));
    // Stamp
    out.push(slam(wrapRot(`<rect x="660" y="1230" width="380" height="110" rx="10" fill="none" stroke="#C0322A" stroke-width="7"/><text x="850" y="1306" font-family="${FONT_FAMILY.poster}" font-size="78" letter-spacing="6" fill="#C0322A" text-anchor="middle">REVIEWED</text>`, -12, 850, 1285), 850, 1285, 3.8, 1.8));
    out.push(handNote('read the fix first', 640, 1400, '#1F4FB8', 4.3, { size: 34, rotate: -6, anchor: 'end' }));
    out.push(tinyFooter(p, H - 22, '#D9C7A6', 60, W - 60), '</svg>');
    return out.join('\n  ');
  });
}

// 9 ─ Trading terminal
export function generateTerminal({ caseData }) {
  return once(() => {
    const p = caseParts(caseData || {}), M = CANVAS.m, W = CANVAS.w, H = CANVAS.h, G = '#39D98A', AMB = '#F5B544', DIM = '#7A8A80', WHT = '#E8F2EC', out = [svgOpen('#07090B')];
    out.push(`<rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="18" fill="#0D1210" stroke="#1F2A24" stroke-width="2"/><rect x="40" y="40" width="${W - 80}" height="56" rx="18" fill="#141B17"/><rect x="40" y="78" width="${W - 80}" height="18" fill="#141B17"/>`,
      ...['#FF5F57', '#FEBC2E', '#28C840'].map((c, i) => `<circle cx="${78 + i * 28}" cy="68" r="8" fill="${c}"/>`),
      `<text x="${W / 2}" y="74" font-family="${FONT_FAMILY.mono}" font-size="15" fill="${DIM}" text-anchor="middle">casefile — ${esc(p.co.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}</text>`);
    let y = 140, d = 0.1;
    const x = M + 8, w = W - 2 * M - 16;
    const cmd = (c) => { out.push(writeOn(`<text x="${x}" y="${y}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="21" fill="${G}">$ <tspan fill="${WHT}">${esc(c)}</tspan></text>`, x, y - 22, w, 30, d, 0.5)); y += 38; d += 0.45; };
    const outBlock = (b, color) => { out.push(R(d, block(b, x, y, color))); y += b.height + 22; d += 0.35; };
    cmd(`casefile open --id ${p.no}`);
    [['COMPANY', p.co], ['PERIOD', p.period], ['THEME', p.theme]].forEach(([k, v]) => { out.push(R(d, `<text x="${x}" y="${y}" font-family="${FONT_FAMILY.mono}" font-size="19" fill="${DIM}">${k.padEnd(9, ' ')}</text><text x="${x + 130}" y="${y}" font-family="${FONT_FAMILY.mono}" font-size="19" fill="${AMB}">${esc(v)}</text>`)); y += 30; d += 0.1; });
    y += 14;
    cmd('casefile headline');
    outBlock(fitIn(p.head, w, 200, 'head', 800, [46, 42, 38, 34, 30], 1.1), WHT);
    const rest = H - 130 - y;
    if (p.chart) {
      cmd('casefile figures --as-reported');
      const b = barsIn(p.chart, x, y, w * 0.8, { label: 16, labelFam: 'mono', labelWeight: 400, labelColor: DIM, bar: 24, hot: G, cold: '#1E6B47', value: 24, valueColor: G, delay: d, gap: 12 });
      out.push(b.svg); y += b.h + 12; d += 1.2;
    } else if (p.single) {
      cmd('casefile figures --as-reported');
      out.push(R(d, `<text x="${x}" y="${y + 66}" font-family="${FONT_FAMILY.mono}" font-weight="700" font-size="84" fill="${AMB}">${esc(p.single.figs[0].raw)}</text>`)); y += 96; d += 0.4;
      outBlock(fitIn(p.single.sentence, w, 90, 'mono', 400, [17, 16, 15], 1.4), DIM);
    }
    const left = H - 130 - y;
    cmd('casefile why');
    outBlock(fitIn(p.cause, w, Math.max(60, left * 0.42 - 60), 'mono', 400, [20, 19, 18, 17, 16, 15, 14], 1.42), WHT);
    cmd('casefile fix');
    out.push(listIn(p.fixes, x, y, w, H - 120 - y, { fam: 'mono', weight: 400, sizes: [20, 19, 18, 17, 16, 15, 14], lh: 1.4, color: WHT, mark: () => '[ ]', markColor: G, delay: d }).svg);
    out.push(`<rect x="${x}" y="${H - 104}" width="14" height="24" fill="${G}" opacity="1"><animate attributeName="opacity" values="1;1;0;1" keyTimes="0;0.5;0.75;1" dur="${r2(d + 1.2)}s" fill="freeze"/></rect>`);
    out.push(tinyFooter(p, H - 60, DIM, M + 8, W - M - 8), '</svg>');
    void rest;
    return out.join('\n  ');
  });
}

// 10 ─ Scrapbook (kraft paper, polaroid, tape, torn note)
export function generateScrapbook({ caseData, heroHref = '' }) {
  return once(() => {
    const p = caseParts(caseData || {}), W = CANVAS.w, H = CANVAS.h, INKS = '#23262C', out = [svgOpen('#CDAE80')];
    out.push(`<defs>${GRAY}<pattern id="kraft" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 8 Q4 6 8 8 T16 8" stroke="#B9965F" stroke-width="1" fill="none" opacity="0.5"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#kraft)"/>`);
    const tape = (x, y, rot) => `<rect x="${x}" y="${y}" width="150" height="40" fill="#F3EBD3" opacity="0.8" transform="rotate(${rot} ${x + 75} ${y + 20})"/>`;
    // Torn paper with headline
    const r = rng(17);
    let edge = 'M60 100 ';
    for (let x = 60; x <= 1140; x += 30) edge += `L${x} ${100 + (r() - 0.5) * 12} `;
    const hd = fitIn(p.head, 1000, 330, 'news', 900, [66, 60, 56, 52, 48, 44, 40], 1.08);
    const ph = 110 + hd.height;
    edge += `L1140 ${ph + 100} `;
    for (let x = 1140; x >= 60; x -= 30) edge += `L${x} ${ph + 100 + (r() - 0.5) * 14} `;
    out.push(R(0.1, `<path d="${edge}Z" fill="#000" opacity="0.15" transform="translate(6 8)"/><path d="${edge}Z" fill="#FBF8F0"/>`, `<text x="100" y="160" font-family="${FONT_FAMILY.mono}" font-size="15" letter-spacing="2" fill="#9A2B20">${esc(`CASE ${p.no} · ${p.theme} · ${p.period}`.toUpperCase())}</text>`, block(hd, 100, 186, INKS), tape(90, 78, -8), tape(960, 76, 6)));
    let y = ph + 150;
    // Polaroid
    const polH = heroHref ? 470 : 0;
    if (heroHref) out.push(R(0.6, wrapRot(`<rect x="80" y="${y + 8}" width="460" height="${polH}" fill="#000" opacity="0.2"/><rect x="72" y="${y}" width="460" height="${polH}" fill="#FFFFFF"/>${pic(heroHref, 94, y + 22, 416, 360)}<text x="302" y="${y + polH - 36}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="40" fill="${INKS}" text-anchor="middle">${esc(p.co)}</text>${tape(230, y - 22, 3)}`, -4, 302, y + polH / 2)));
    // Lined note
    const nx = heroHref ? 580 : 80, nw = heroHref ? 540 : 1040, nh = heroHref ? 520 : 420;
    const nb = fitIn(p.problem + ' ' + p.cause, nw - 60, nh - 90, 'hand', 700, [32, 30, 28, 26, 24, 22, 20], 1.15);
    out.push(R(1.0, wrapRot(`<rect x="${nx}" y="${y}" width="${nw}" height="${nh}" fill="#FFFDF5"/>${Array.from({ length: Math.floor((nh - 70) / (nb.size * 1.15)) }, (_, i) => `<line x1="${nx}" y1="${y + 66 + (i + 1) * nb.size * 1.15 + 6}" x2="${nx + nw}" y2="${y + 66 + (i + 1) * nb.size * 1.15 + 6}" stroke="#BFD4EA" stroke-width="1"/>`).join('')}<text x="${nx + 30}" y="${y + 50}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="36" fill="#C8382B">What happened</text>${block(nb, nx + 30, y + 70, INKS)}${tape(nx + nw / 2 - 75, y - 20, -3)}`, 2, nx + nw / 2, y + nh / 2)));
    y += Math.max(polH, nh) + 60;
    // Bottom: cost (figure) + fix
    const fig = p.chart ? p.chart.figs[p.chart.figs.length - 1] : p.single ? p.single.figs[0] : null;
    const bw = fig ? 620 : 1040;
    out.push(R(1.6, `<rect x="80" y="${y}" width="${bw}" height="${H - 110 - y}" fill="#E9F4E4"/>`, `<text x="110" y="${y + 50}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="36" fill="#1E8A4C">Do this</text>`, tape(80 + bw / 2 - 75, y - 20, 4)));
    out.push(listIn(p.fixes, 110, y + 70, bw - 60, H - 130 - (y + 70), { fam: 'hand', weight: 700, sizes: [30, 28, 26, 24, 22, 20], lh: 1.12, color: INKS, markColor: '#1E8A4C', mark: () => '•', delay: 1.9 }).svg);
    if (fig) {
      const cx = 940, cy = y + 150, fs = Math.min(90, Math.floor(320 / Math.max(1, measure(fig.raw, 'hand', 700, 1))));
      out.push(R(2.3, `<text x="${cx}" y="${cy}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="${fs}" fill="${INKS}" text-anchor="middle">${esc(fig.raw)}</text>`, block(fitIn(figureLine(p), 360, H - 160 - (cy + 40), 'hand', 700, [24, 22, 20, 18], 1.15), 760, cy + 40, INKS)));
      out.push(handCircle(cx, cy - fs * 0.3, measure(fig.raw, 'hand', 700, fs) / 2 + 26, fs * 0.6, '#C8382B', 2.8, 41));
    }
    out.push(tinyFooter(p, H - 56, '#5C4630'), '</svg>');
    return out.join('\n  ');
  });
}

// 11 ─ Chalkboard lesson
export function generateChalkboard({ caseData }) {
  return once(() => {
    const p = caseParts(caseData || {}), M = CANVAS.m, W = CANVAS.w, H = CANVAS.h, CH = '#F1F1E8', YEL = '#F2E27D', PNK = '#F4A3B5', out = [svgOpen('#25392D')];
    out.push(`<defs><radialGradient id="smudge" cx="30%" cy="40%" r="60%"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.08"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#smudge)"/><rect x="12" y="12" width="${W - 24}" height="${H - 24}" fill="none" stroke="#6B4A2B" stroke-width="24"/><rect x="180" y="${H - 40}" width="840" height="16" fill="#8A6A4A"/><rect x="260" y="${H - 52}" width="60" height="14" rx="4" fill="${CH}"/>`);
    out.push(writeOn(`<text x="${M}" y="${M + 50}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="40" fill="${YEL}">${esc(`Today's lesson · Case ${p.no}`)}</text>`, M, M + 10, CW, 50, 0.1, 0.6));
    const t = fitIn(p.head, CW, 260, 'hand', 700, [70, 64, 60, 56, 52, 48, 44], 1.04);
    out.push(writeOn(block(t, M, M + 80, CH), M, M + 80, CW, t.height, 0.6, 1.2));
    out.push(handUnderline(M, M + 520, M + 80 + t.height + 10, YEL, 1.8, 21));
    let y = M + 80 + t.height + 54;
    const rows = [['What went wrong', p.problem], ['Why', p.cause]];
    const remain = H - 90 - y;
    const fixH = remain * 0.34, costH = p.chart || p.single ? remain * 0.22 : 0, rowH = (remain - fixH - costH) / 2;
    rows.forEach(([k, v], i) => {
      const b = fitIn(v, CW - 40, rowH - 54, 'hand', 700, [40, 38, 36, 34, 32, 30, 28, 26, 24, 22], 1.1);
      out.push(writeOn(`<text x="${M}" y="${y + 34}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="36" fill="${YEL}">${k}:</text>${block(b, M + 30, y + 48, CH)}`, M, y, CW, rowH, 2.0 + i * 0.8, 0.9));
      y += rowH;
    });
    if (costH) {
      const fig = p.chart ? p.chart.figs[p.chart.figs.length - 1] : p.single.figs[0];
      const fs = 72, fx = M + 30;
      out.push(writeOn(`<text x="${M}" y="${y + 34}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="36" fill="${YEL}">The cost:</text><text x="${fx}" y="${y + 40 + fs * 0.85}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="${fs}" fill="${CH}">${esc(fig.raw)}</text>`, M, y, CW, costH, 3.6, 0.6));
      out.push(handCircle(fx + measure(fig.raw, 'hand', 700, fs) / 2, y + 40 + fs * 0.5, measure(fig.raw, 'hand', 700, fs) / 2 + 26, fs * 0.6, PNK, 4.2, 51));
      const note = figureNote(p.chart);
      if (note) out.push(handNote(note, fx + measure(fig.raw, 'hand', 700, fs) + 70, y + 40 + fs * 0.7, PNK, 4.6, { size: 40, rotate: -6 }));
      y += costH;
    }
    out.push(`<text x="${M}" y="${y + 34}" font-family="${FONT_FAMILY.hand}" font-weight="700" font-size="36" fill="${YEL}">Homework:</text>`);
    out.push(listIn(p.fixes, M + 30, y + 52, CW - 40, fixH - 60, { fam: 'hand', weight: 700, sizes: [38, 36, 34, 32, 30, 28, 26, 24, 22, 20], lh: 1.1, color: CH, markColor: PNK, delay: 4.8 }).svg);
    out.push(tinyFooter(p, H - 66, '#AFC2B5'), '</svg>');
    return out.join('\n  ');
  });
}

export const PRINT_ROTATION = ['bi_magazine', 'bi_billboard', 'bi_swiss', 'bi_dossier', 'bi_newspaper', 'bi_whiteboard',
  'bi_terminal', 'bi_retro', 'bi_corkboard', 'bi_blueprint', 'bi_scrapbook', 'bi_chalkboard'];

// The picture is dropped rather than shortening any sourced sentence to make room for it.
const heroOrText = (fn) => (params = {}) => {
  const svg = fn(params);
  return params.heroHref && svg.includes('…') ? fn({ ...params, heroHref: '' }) : svg;
};
export const EDITORIAL_TEMPLATES = {
  bi_failure_autopsy: heroOrText(generateFailureAutopsy),
  bi_editorial_cover: heroOrText(generateEditorialCover),
  bi_exec_cheatsheet: heroOrText(generateExecCheatSheet),
  bi_data_story: heroOrText(generateDataStory),
  bi_newspaper: heroOrText(generateNewspaper),
  bi_magazine: generateMagazine,
  bi_billboard: generateBillboard,
  bi_swiss: generateSwiss,
  bi_retro: generateRetro,
  bi_corkboard: generateCorkboard,
  bi_whiteboard: generateWhiteboard,
  bi_blueprint: generateBlueprint,
  bi_dossier: generateDossier,
  bi_terminal: generateTerminal,
  bi_scrapbook: heroOrText(generateScrapbook),
  bi_chalkboard: generateChalkboard,
};

// Chooses the ONE best template for this case's content:
// sourced figures -> data story (bars, or one hero number); dramatic outcome -> dark cover with timeline;
// a multi-step fix -> cheat sheet; otherwise the failure autopsy.
export function pickEditorialTemplate(caseData) {
  // Owner's choice (28 Nov 2026): 12 print styles, a different one every day. One case is posted per day, so
  // rotating by case number gives 12 different looks in a row (Case #5 Yahoo = the newspaper).
  if (caseData) return PRINT_ROTATION[((Number(caseData.caseNumber) || 1) - 1) % PRINT_ROTATION.length];
  const cd = caseData || {};
  if (chartData(cd) || extractFigures(cd)) return 'bi_data_story';
  if (DRAMA.test(`${cd.documentedProblem} ${cd.businessImpact}`)) return 'bi_editorial_cover';
  if (actionItems(cd.recommendedFix).length >= 3) return 'bi_exec_cheatsheet';
  return 'bi_failure_autopsy';
}

// Animations are for the live preview / SVG file; JPEG, PDF and LinkedIn need the finished frame.
export function stripAnimations(svg) {
  return sampleSvgAt(svg, Infinity);
}

// Injects the embedded @font-face CSS so the SVG renders with the right fonts as a file / <img> / JPEG export.
export function withFonts(svg, css) {
  return css ? String(svg).replace('/*@signal-fonts*/', css) : svg;
}
