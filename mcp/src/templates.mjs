// ============================================================
// PRANAV SIGNAL — LinkedIn Visual Template Repository
// 7 premium editorial templates inspired by high-performing
// LinkedIn creator formats. Each maps to a content theme
// drawn from the 100 Business Problems Case Bank.
// ============================================================

// ─── Shared helpers ─────────────────────────────────────────
const esc = (s = '') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const wrap = (text = '', maxLen = 40) => {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxLen) { lines.push(cur.trim()); cur = w; }
    else { cur = (cur + ' ' + w).trim(); }
  }
  if (cur) lines.push(cur.trim());
  return lines;
};
const svgText = (text, x, y, attrs = '') =>
  `<text x="${x}" y="${y}" ${attrs}>${esc(text)}</text>`;

import { EDITORIAL_TEMPLATES, pickEditorialTemplate } from './editorial_templates.mjs';

// ─── Template registry ───────────────────────────────────────
// Each template is keyed by archetype name and returns an SVG string.
// Params: { caseData, hook, body, takeaways, theme }

export const TEMPLATE_REGISTRY = {
  // T1 — Dark Stat Headline (bold percentage / number-driven hook)
  dark_stat_headline: generateDarkStatHeadline,
  // T2 — Quote + Bullet System (quote at top, bulleted lessons)
  quote_bullet_system: generateQuoteBulletSystem,
  // T3 — Problem vs Reality Split (two-column contrast card)
  problem_reality_split: generateProblemRealitySplit,
  // T4 — Leadership Framework Cards (3-row framework list)
  leadership_framework_cards: generateLeadershipFrameworkCards,
  // T5 — Performers Principle (bold statement + 5 principle rows)
  performers_principle: generatePerformersPrinciple,
  // T6 — Insight Grid (2×3 tile infographic)
  insight_grid: generateInsightGrid,
  // T7 — Company Case Matrix (existing, improved — default for Case Bank)
  company_case_matrix: generateCompanyCaseMatrix,
  // Business Intelligence Editorial (1200x1500): the default for every new case post.
  ...EDITORIAL_TEMPLATES,
};
export const isEditorialTemplate = (k) => Object.prototype.hasOwnProperty.call(EDITORIAL_TEMPLATES, k);

// Theme → template mapping (rotates through 7 templates)
export const THEME_TEMPLATE_MAP = {
  'Digital strategy':          'company_case_matrix',
  'Platform strategy':         'company_case_matrix',
  'Business model':            'company_case_matrix',
  'Revenue model':             'quote_bullet_system',
  'Trust / digital platform':  'problem_reality_split',
  'Quality / ops':             'leadership_framework_cards',
  'Talent strategy':           'performers_principle',
  'Customer experience':       'quote_bullet_system',
  'Governance / compliance':   'leadership_framework_cards',
  'Financial strategy':        'dark_stat_headline',
  'Growth strategy':           'dark_stat_headline',
  'Sales strategy':            'dark_stat_headline',
  'Marketing strategy':        'quote_bullet_system',
  'Operations':                'leadership_framework_cards',
  'Supply chain':              'insight_grid',
  'HR / culture':              'performers_principle',
  'ESG / sustainability':      'insight_grid',
  'Innovation':                'problem_reality_split',
  'Pricing strategy':          'dark_stat_headline',
  'default':                   'company_case_matrix',
};

// Pick template for a given case
export function pickTemplate(caseData) {
  if (!caseData) return 'company_case_matrix';
  return pickEditorialTemplate(caseData);
}

// Legacy rotation across the old 1200x627 templates (kept for posts already published with them).
export function pickLegacyTemplate(caseData) {
  if (!caseData) return 'company_case_matrix';
  const theme = caseData.theme || '';
  // Rotate deterministically by case number so adjacent cases get different templates
  const keys = Object.keys(TEMPLATE_REGISTRY);
  const themeMatch = Object.keys(THEME_TEMPLATE_MAP).find(k =>
    theme.toLowerCase().includes(k.toLowerCase()) && k !== 'default'
  );
  if (themeMatch) return THEME_TEMPLATE_MAP[themeMatch];
  // Rotate by case number
  return keys[(caseData.caseNumber - 1) % keys.length];
}

// Generate SVG for any template
export function generateVisualSvg(archetype, params) {
  const fn = TEMPLATE_REGISTRY[archetype] || generateCompanyCaseMatrix;
  return fn(params);
}

// ─── Helper: build takeaway bullets from case ───────────────
export function buildTakeaways(caseData) {
  const fix = caseData.recommendedFix || '';
  const response = caseData.documentedResponse || '';
  // Split on numbered list patterns or semicolons
  const raw = fix || response;
  const parts = raw.split(/\d+\.\s+|;\s*|•\s*/).filter(p => p.trim().length > 10).slice(0, 3);
  if (parts.length >= 2) return parts.map(p => p.trim().slice(0, 90));
  // Fallback: 3-line split
  return [
    fix.slice(0, 90).trim() || 'Invest in systematic operational redesign.',
    response.slice(0, 90).trim() || 'Build internal processes before external scale.',
    caseData.businessImpact?.slice(0, 90).trim() || 'Measure outcomes, not activities.',
  ];
}

// ─── T1: Dark Stat Headline ───────────────────────────────────
// Big bold stat or percentage, dark cinematic background, photo-ready
function generateDarkStatHeadline({ caseData, hook }) {
  const company = esc(caseData?.company || 'BUSINESS CASE');
  const theme = esc(caseData?.theme || 'Business Strategy');
  const period = esc(caseData?.period || '2010–2020');
  const industry = esc(caseData?.industry || 'Industry');

  // Extract a numeric stat from businessImpact or documentedProblem
  const impactText = caseData?.businessImpact || caseData?.documentedProblem || '';
  const statMatch = impactText.match(/(\d[\d%,\.]+\s*(?:%|billion|million|Cr|crore|x\b)?)/i);
  const stat = statMatch ? statMatch[1].toUpperCase() : '0%';
  const statLabel = statMatch
    ? impactText.replace(statMatch[1], '').slice(0, 60).trim()
    : impactText.slice(0, 60);

  const hookLines = wrap(hook?.split('\n')[0] || `${company}: The lesson every operator must learn.`, 48);
  const takeaways = buildTakeaways(caseData);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 627" width="1200" height="627" style="font-family:'Space Grotesk','Segoe UI',sans-serif;">
  <defs>
    <linearGradient id="bg1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0A0A0A"/>
      <stop offset="60%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#0A0A0A"/>
    </linearGradient>
    <linearGradient id="accent1" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#EF4444"/>
    </linearGradient>
    <radialGradient id="glow1" cx="30%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#0A0A0A" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow1"><feDropShadow dx="0" dy="4" stdDeviation="12" flood-color="#000" flood-opacity="0.6"/></filter>
  </defs>

  <!-- BG -->
  <rect width="1200" height="627" fill="url(#bg1)"/>
  <rect width="1200" height="627" fill="url(#glow1)"/>

  <!-- Left vertical accent bar -->
  <rect x="0" y="0" width="6" height="627" fill="url(#accent1)"/>

  <!-- Grid lines -->
  <g stroke="rgba(255,255,255,0.03)" stroke-width="1">
    <line x1="0" y1="150" x2="1200" y2="150"/>
    <line x1="0" y1="450" x2="1200" y2="450"/>
    <line x1="600" y1="0" x2="600" y2="627"/>
  </g>

  <!-- TOP BADGE ROW -->
  <rect x="40" y="30" width="220" height="28" rx="14" fill="rgba(245,158,11,0.15)" stroke="#F59E0B" stroke-width="1.2"/>
  <text x="150" y="49" fill="#F59E0B" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="1.5">${company.toUpperCase()}</text>

  <rect x="276" y="30" width="180" height="28" rx="14" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
  <text x="366" y="49" fill="#94A3B8" font-size="11" font-weight="600" text-anchor="middle" letter-spacing="1">${period}</text>

  <rect x="472" y="30" width="200" height="28" rx="14" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  <text x="572" y="49" fill="#94A3B8" font-size="11" font-weight="600" text-anchor="middle" letter-spacing="1">${esc(industry.slice(0,22))}</text>

  <!-- STAT — massive left anchor -->
  <text x="40" y="220" fill="url(#accent1)" font-size="140" font-weight="900" letter-spacing="-4" filter="url(#shadow1)">${esc(stat)}</text>

  <!-- Stat label -->
  <text x="40" y="260" fill="#E2E8F0" font-size="22" font-weight="600" letter-spacing="0.5">${esc(statLabel.slice(0,70))}</text>

  <!-- Hook lines -->
  ${hookLines.slice(0,3).map((l, i) =>
    `<text x="40" y="${310 + i*34}" fill="${i===0?'#F8FAFC':'#CBD5E1'}" font-size="${i===0?26:22}" font-weight="${i===0?'700':'400'}">${esc(l)}</text>`
  ).join('\n  ')}

  <!-- Divider -->
  <rect x="40" y="420" width="700" height="2" rx="1" fill="url(#accent1)" opacity="0.4"/>

  <!-- TAKEAWAYS -->
  <text x="40" y="455" fill="#F59E0B" font-size="12" font-weight="700" letter-spacing="2">OPERATOR TAKEAWAYS</text>
  ${takeaways.slice(0,3).map((t, i) => `
  <circle cx="52" cy="${484 + i*38}" r="6" fill="#F59E0B" opacity="0.9"/>
  <text x="68" y="${489 + i*38}" fill="#E2E8F0" font-size="16" font-weight="500">${esc(t.slice(0,80))}</text>`).join('')}

  <!-- RIGHT — Theme card -->
  <rect x="860" y="120" width="300" height="200" rx="16" fill="rgba(245,158,11,0.08)" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="1010" y="175" fill="#F59E0B" font-size="13" font-weight="700" text-anchor="middle" letter-spacing="1.5">THEME</text>
  ${wrap(theme, 22).slice(0,3).map((l,i) =>
    `<text x="1010" y="${200+i*30}" fill="#F8FAFC" font-size="20" font-weight="700" text-anchor="middle">${esc(l)}</text>`
  ).join('\n  ')}

  <!-- Author footer -->
  <rect x="0" y="589" width="1200" height="38" fill="rgba(0,0,0,0.5)"/>
  <circle cx="58" cy="608" r="10" fill="#F59E0B"/>
  <text x="58" y="613" fill="#0A0A0A" font-size="10" font-weight="900" text-anchor="middle">PK</text>
  <text x="80" y="613" fill="#F8FAFC" font-size="13" font-weight="700">PRANAV KUMAR</text>
  <text x="225" y="613" fill="#94A3B8" font-size="12">RevOps &amp; GTM Strategy · Commercial Scaleups &amp; Marketplaces</text>
</svg>`;
}

// ─── T2: Quote + Bullet System ────────────────────────────────
function generateQuoteBulletSystem({ caseData, hook }) {
  const company = esc(caseData?.company || 'CASE STUDY');
  const theme = esc(caseData?.theme || 'Business Strategy');
  const period = esc(caseData?.period || '');
  const quoteText = hook?.split('\n')[0] || `Growth is not just driven by sales, but by systems that scale.`;
  const quoteLines = wrap(quoteText, 44);
  const takeaways = buildTakeaways(caseData);
  const bullets = [
    { label: 'The Reality:', text: (caseData?.documentedProblem || '').slice(0, 80) },
    { label: 'Root Cause:', text: (caseData?.rootCauseAnalysis || '').slice(0, 80) },
    { label: 'The Fix:', text: (caseData?.recommendedFix || '').slice(0, 80) },
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 627" width="1200" height="627" style="font-family:'Space Grotesk','Segoe UI',sans-serif;">
  <defs>
    <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
    <linearGradient id="accent2" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#818CF8"/>
    </linearGradient>
    <radialGradient id="topGlow2" cx="20%" cy="10%" r="50%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="627" fill="url(#bg2)"/>
  <rect width="1200" height="627" fill="url(#topGlow2)"/>
  <rect x="0" y="0" width="6" height="627" fill="url(#accent2)"/>

  <!-- Header strip -->
  <rect x="0" y="0" width="1200" height="90" fill="rgba(56,189,248,0.07)"/>
  <rect x="40" y="30" width="260" height="30" rx="15" fill="rgba(56,189,248,0.15)" stroke="#38BDF8" stroke-width="1.2"/>
  <text x="170" y="51" fill="#38BDF8" font-size="12" font-weight="700" text-anchor="middle" letter-spacing="1.5">PRANAV KUMAR · CASE ANALYSIS</text>
  <text x="800" y="51" fill="#94A3B8" font-size="13" font-weight="600">${company} · ${period}</text>

  <!-- Quote block -->
  <text x="60" y="130" fill="url(#accent2)" font-size="90" font-weight="900" opacity="0.3">"</text>
  ${quoteLines.slice(0, 4).map((l, i) =>
    `<text x="60" y="${155 + i * 44}" fill="#F8FAFC" font-size="${i === 0 ? 36 : 32}" font-weight="${i === 0 ? '700' : '500'}" font-style="italic">${esc(l)}</text>`
  ).join('\n  ')}
  <text x="60" y="${155 + Math.min(quoteLines.length, 4) * 44 + 10}" fill="#38BDF8" font-size="16" font-weight="600">— Operator Insight: ${theme}</text>

  <!-- Divider -->
  <rect x="40" y="380" width="1120" height="2" rx="1" fill="url(#accent2)" opacity="0.3"/>

  <!-- Bullet system — 3 items -->
  <text x="40" y="415" fill="#38BDF8" font-size="12" font-weight="700" letter-spacing="2">WHAT ACTUALLY WORKS:</text>
  ${bullets.map((b, i) => `
  <rect x="40" y="${438 + i*52}" width="1120" height="44" rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(56,189,248,0.15)" stroke-width="1"/>
  <rect x="40" y="${438 + i*52}" width="4" height="44" rx="2" fill="#38BDF8"/>
  <text x="58" y="${464 + i*52}" fill="#38BDF8" font-size="13" font-weight="700">${esc(b.label)}</text>
  <text x="175" y="${464 + i*52}" fill="#CBD5E1" font-size="15" font-weight="400">${esc(b.text.slice(0,90))}</text>`).join('')}

  <!-- Author -->
  <rect x="0" y="589" width="1200" height="38" fill="rgba(0,0,0,0.5)"/>
  <circle cx="58" cy="608" r="10" fill="#38BDF8"/>
  <text x="58" y="613" fill="#0F172A" font-size="10" font-weight="900" text-anchor="middle">PK</text>
  <text x="80" y="613" fill="#F8FAFC" font-size="13" font-weight="700">PRANAV KUMAR</text>
  <text x="230" y="613" fill="#94A3B8" font-size="12">RevOps &amp; GTM Strategy · Commercial Scaleups &amp; Marketplaces</text>
</svg>`;
}

// ─── T3: Problem vs Reality Split ─────────────────────────────
function generateProblemRealitySplit({ caseData, hook }) {
  const company = esc(caseData?.company || 'CASE STUDY');
  const theme = esc(caseData?.theme || 'Strategy');
  const problem = caseData?.documentedProblem || '';
  const reality = caseData?.rootCauseAnalysis || '';
  const fix = caseData?.recommendedFix || '';

  const leftLines = wrap(`The stated problem: ${problem}`, 36).slice(0, 5);
  const rightLines = wrap(`The real cause: ${reality}`, 36).slice(0, 5);
  const hookLine = esc(hook?.split('\n')[0]?.slice(0, 90) || `Most leaders misread this.`);
  const fixLines = wrap(`Fix: ${fix}`, 60).slice(0, 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 627" width="1200" height="627" style="font-family:'Space Grotesk','Segoe UI',sans-serif;">
  <defs>
    <linearGradient id="bg3" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#060B18"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="627" fill="url(#bg3)"/>

  <!-- Header -->
  <rect x="0" y="0" width="1200" height="80" fill="rgba(255,255,255,0.03)"/>
  <text x="600" y="52" fill="#F8FAFC" font-size="22" font-weight="700" text-anchor="middle" letter-spacing="1">${company} · ${theme}</text>

  <!-- Hook -->
  <rect x="40" y="90" width="1120" height="60" rx="12" fill="rgba(239,68,68,0.1)" stroke="rgba(239,68,68,0.3)" stroke-width="1.5"/>
  <text x="600" y="130" fill="#FCA5A5" font-size="22" font-weight="700" text-anchor="middle">${hookLine}</text>

  <!-- LEFT column — Problem -->
  <rect x="40" y="168" width="540" height="360" rx="16" fill="rgba(239,68,68,0.07)" stroke="rgba(239,68,68,0.3)" stroke-width="1.5"/>
  <rect x="40" y="168" width="540" height="52" rx="16" fill="rgba(239,68,68,0.2)"/>
  <text x="310" y="202" fill="#FCA5A5" font-size="16" font-weight="700" text-anchor="middle" letter-spacing="1">❌ WHAT THEY THOUGHT</text>
  ${leftLines.map((l, i) =>
    `<text x="60" y="${240 + i*44}" fill="#E2E8F0" font-size="17" font-weight="400">${esc(l)}</text>`
  ).join('\n  ')}

  <!-- RIGHT column — Reality -->
  <rect x="620" y="168" width="540" height="360" rx="16" fill="rgba(16,185,129,0.07)" stroke="rgba(16,185,129,0.3)" stroke-width="1.5"/>
  <rect x="620" y="168" width="540" height="52" rx="16" fill="rgba(16,185,129,0.2)"/>
  <text x="890" y="202" fill="#6EE7B7" font-size="16" font-weight="700" text-anchor="middle" letter-spacing="1">✓ THE ACTUAL CAUSE</text>
  ${rightLines.map((l, i) =>
    `<text x="640" y="${240 + i*44}" fill="#E2E8F0" font-size="17" font-weight="400">${esc(l)}</text>`
  ).join('\n  ')}

  <!-- VS badge in center -->
  <circle cx="600" cy="348" r="36" fill="#1E293B" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
  <text x="600" y="356" fill="#F8FAFC" font-size="20" font-weight="900" text-anchor="middle">VS</text>

  <!-- Fix bar -->
  <rect x="40" y="542" width="1120" height="52" rx="12" fill="rgba(56,189,248,0.12)" stroke="#38BDF8" stroke-width="1.5"/>
  <text x="60" y="572" fill="#38BDF8" font-size="13" font-weight="700">OPERATOR FIX:</text>
  ${fixLines.map((l, i) =>
    `<text x="${i === 0 ? 195 : 60}" y="${572 + i * 20}" fill="#CBD5E1" font-size="15" font-weight="400">${esc(l)}</text>`
  ).join('\n  ')}

  <!-- Author -->
  <text x="600" y="616" fill="#94A3B8" font-size="12" text-anchor="middle">PRANAV KUMAR · RevOps &amp; GTM Strategy · Commercial Scaleups &amp; Marketplaces</text>
</svg>`;
}

// ─── T4: Leadership Framework Cards ────────────────────────────
function generateLeadershipFrameworkCards({ caseData, hook }) {
  const company = esc(caseData?.company || 'CASE');
  const theme = esc(caseData?.theme || 'Leadership');
  const period = esc(caseData?.period || '');
  const headline = `${company}: ${theme}`;
  const hookLine = hook?.split('\n')[0] || 'Leaders who build systems outlast those who rely on heroics.';
  const takeaways = buildTakeaways(caseData);
  const rows = [
    { icon: '01', label: 'THE SITUATION', text: (caseData?.documentedProblem || '').slice(0, 90) },
    { icon: '02', label: 'THE ROOT CAUSE', text: (caseData?.rootCauseAnalysis || '').slice(0, 90) },
    { icon: '03', label: 'THE RESPONSE', text: (caseData?.documentedResponse || '').slice(0, 90) },
    { icon: '04', label: 'OPERATOR FIX', text: (caseData?.recommendedFix || '').slice(0, 90) },
    { icon: '05', label: 'LEADERSHIP LESSON', text: (caseData?.businessImpact || takeaways[0] || '').slice(0, 90) },
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 627" width="1200" height="627" style="font-family:'Space Grotesk','Segoe UI',sans-serif;">
  <defs>
    <linearGradient id="bg4" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0A0E1A"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <linearGradient id="gold4" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#FBBF24"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="627" fill="url(#bg4)"/>
  <rect x="0" y="0" width="8" height="627" fill="url(#gold4)"/>

  <!-- Header -->
  <rect x="20" y="20" width="1160" height="85" rx="12" fill="rgba(245,158,11,0.07)" stroke="rgba(245,158,11,0.2)" stroke-width="1"/>
  <text x="600" y="58" fill="#FBBF24" font-size="13" font-weight="700" text-anchor="middle" letter-spacing="2">SALES LEADERSHIP ANALYSIS · PRANAV KUMAR</text>
  <text x="600" y="88" fill="#F8FAFC" font-size="20" font-weight="700" text-anchor="middle">${esc(headline.slice(0, 70))}</text>

  <!-- Hook -->
  <text x="600" y="130" fill="#CBD5E1" font-size="17" font-weight="400" text-anchor="middle" font-style="italic">"${esc(hookLine.slice(0, 90))}"</text>

  <!-- Framework rows -->
  ${rows.map((r, i) => `
  <rect x="20" y="${155 + i * 82}" width="1160" height="72" rx="10" fill="${i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)'}" stroke="rgba(245,158,11,0.12)" stroke-width="1"/>
  <rect x="20" y="${155 + i * 82}" width="8" height="72" rx="4" fill="url(#gold4)" opacity="${0.9 - i * 0.12}"/>
  <text x="50" y="${200 + i * 82}" fill="#F59E0B" font-size="22" font-weight="900">${esc(r.icon)}</text>
  <text x="90" y="${191 + i * 82}" fill="#38BDF8" font-size="11" font-weight="700" letter-spacing="1.5">${esc(r.label)}</text>
  <text x="90" y="${211 + i * 82}" fill="#E2E8F0" font-size="15" font-weight="400">${esc(r.text.slice(0, 100))}</text>`).join('')}

  <!-- Author -->
  <rect x="0" y="589" width="1200" height="38" fill="rgba(0,0,0,0.6)"/>
  <circle cx="58" cy="608" r="10" fill="#F59E0B"/>
  <text x="58" y="613" fill="#0A0E1A" font-size="10" font-weight="900" text-anchor="middle">PK</text>
  <text x="80" y="613" fill="#F8FAFC" font-size="13" font-weight="700">PRANAV KUMAR</text>
  <text x="230" y="613" fill="#94A3B8" font-size="12">RevOps &amp; GTM Strategy · Commercial Scaleups &amp; Marketplaces</text>
</svg>`;
}

// ─── T5: Performers Principle ──────────────────────────────────
function generatePerformersPrinciple({ caseData, hook }) {
  const company = esc(caseData?.company || 'CASE');
  const theme = esc(caseData?.theme || 'Performance');
  const period = esc(caseData?.period || '');
  const headline = hook?.split('\n')[0] || 'Performers are not born. Great systems create them.';
  const subHeadline = hook?.split('\n')[1] || caseData?.documentedProblem?.slice(0, 80) || '';

  const principles = [
    { num: '1.', text: (caseData?.documentedProblem || '').slice(0, 90) },
    { num: '2.', text: (caseData?.rootCauseAnalysis || '').slice(0, 90) },
    { num: '3.', text: (caseData?.documentedResponse || '').slice(0, 90) },
    { num: '4.', text: (caseData?.recommendedFix || '').slice(0, 90) },
    { num: '5.', text: (caseData?.businessImpact || '').slice(0, 90) },
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 627" width="1200" height="627" style="font-family:'Space Grotesk','Segoe UI',sans-serif;">
  <defs>
    <linearGradient id="bg5" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B0F1E"/>
      <stop offset="100%" stop-color="#161B2E"/>
    </linearGradient>
    <linearGradient id="blue5" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#38BDF8"/>
    </linearGradient>
    <radialGradient id="purpGlow" cx="85%" cy="20%" r="50%">
      <stop offset="0%" stop-color="#6366F1" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#0B0F1E" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="627" fill="url(#bg5)"/>
  <rect width="1200" height="627" fill="url(#purpGlow)"/>
  <rect x="0" y="0" width="6" height="627" fill="url(#blue5)"/>

  <!-- TOP badge -->
  <rect x="40" y="22" width="320" height="28" rx="14" fill="rgba(99,102,241,0.15)" stroke="#6366F1" stroke-width="1.2"/>
  <text x="200" y="41" fill="#A5B4FC" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="1.5">LEADERSHIP INTELLIGENCE · ${company}</text>
  <text x="800" y="41" fill="#64748B" font-size="12">${period} · ${theme}</text>

  <!-- BIG headline -->
  ${wrap(headline, 50).slice(0, 2).map((l, i) =>
    `<text x="40" y="${100 + i * 56}" fill="${i === 0 ? '#F8FAFC' : '#CBD5E1'}" font-size="${i === 0 ? 42 : 36}" font-weight="900">${esc(l)}</text>`
  ).join('\n  ')}

  <text x="40" y="220" fill="#94A3B8" font-size="18" font-weight="400" font-style="italic">"${esc(subHeadline.slice(0, 80))}"</text>

  <!-- Divider -->
  <rect x="40" y="244" width="400" height="3" rx="1.5" fill="url(#blue5)" opacity="0.6"/>

  <!-- Principles list — right panel -->
  <rect x="740" y="62" width="420" height="510" rx="20" fill="rgba(99,102,241,0.07)" stroke="rgba(99,102,241,0.25)" stroke-width="1.5"/>
  <text x="950" y="100" fill="#A5B4FC" font-size="12" font-weight="700" text-anchor="middle" letter-spacing="2">THE FRAMEWORK</text>
  ${principles.map((p, i) => `
  <rect x="760" y="${118 + i * 86}" width="380" height="76" rx="10" fill="${i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)'}"/>
  <text x="780" y="${163 + i * 86}" fill="url(#blue5)" font-size="26" font-weight="900">${esc(p.num)}</text>
  <text x="820" y="${148 + i * 86}" fill="#94A3B8" font-size="10" font-weight="600" letter-spacing="1">POINT ${i+1}</text>
  <text x="820" y="${168 + i * 86}" fill="#E2E8F0" font-size="13" font-weight="400">${esc(p.text.slice(0, 55))}</text>
  <text x="820" y="${183 + i * 86}" fill="#94A3B8" font-size="12" font-weight="400">${esc(p.text.slice(55, 100))}</text>`).join('')}

  <!-- Left body text -->
  <text x="40" y="275" fill="#94A3B8" font-size="14" font-weight="600">BUSINESS IMPACT:</text>
  ${wrap(caseData?.businessImpact || '', 55).slice(0, 5).map((l, i) =>
    `<text x="40" y="${298 + i * 30}" fill="#CBD5E1" font-size="17" font-weight="400">${esc(l)}</text>`
  ).join('\n  ')}

  <!-- Author -->
  <rect x="0" y="589" width="1200" height="38" fill="rgba(0,0,0,0.6)"/>
  <circle cx="58" cy="608" r="10" fill="#6366F1"/>
  <text x="58" y="613" fill="#F8FAFC" font-size="10" font-weight="900" text-anchor="middle">PK</text>
  <text x="80" y="613" fill="#F8FAFC" font-size="13" font-weight="700">PRANAV KUMAR</text>
  <text x="230" y="613" fill="#94A3B8" font-size="12">RevOps &amp; GTM Strategy · Commercial Scaleups &amp; Marketplaces</text>
</svg>`;
}

// ─── T6: Insight Grid (2×3 tile infographic) ──────────────────
function generateInsightGrid({ caseData, hook }) {
  const company = esc(caseData?.company || 'CASE');
  const theme = esc(caseData?.theme || 'Business Intelligence');
  const period = esc(caseData?.period || '');
  const headline = hook?.split('\n')[0] || `${caseData?.company}: Key Insights`;
  const takeaways = buildTakeaways(caseData);

  const tiles = [
    { label: 'COMPANY', value: (caseData?.company || '').slice(0, 24), sub: (caseData?.industry || '').slice(0, 30), color: '#38BDF8', bg: 'rgba(56,189,248,0.1)' },
    { label: 'PERIOD', value: period.slice(0, 20), sub: (caseData?.theme || '').slice(0, 30), color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
    { label: 'THE PROBLEM', value: '', sub: (caseData?.documentedProblem || '').slice(0, 60), color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
    { label: 'ROOT CAUSE', value: '', sub: (caseData?.rootCauseAnalysis || '').slice(0, 60), color: '#A78BFA', bg: 'rgba(167,139,250,0.08)' },
    { label: 'RESPONSE', value: '', sub: (caseData?.documentedResponse || '').slice(0, 60), color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
    { label: 'OPERATOR FIX', value: '', sub: (caseData?.recommendedFix || takeaways[0] || '').slice(0, 60), color: '#FBBF24', bg: 'rgba(251,191,36,0.08)' },
  ];

  const cols = [40, 430, 820];
  const rows = [130, 380];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 627" width="1200" height="627" style="font-family:'Space Grotesk','Segoe UI',sans-serif;">
  <defs>
    <linearGradient id="bg6" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#07090F"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="627" fill="url(#bg6)"/>

  <!-- Header -->
  <rect x="0" y="0" width="1200" height="118" fill="rgba(255,255,255,0.025)"/>
  <rect x="0" y="0" width="8" height="118" fill="#38BDF8"/>
  <text x="40" y="45" fill="#38BDF8" font-size="12" font-weight="700" letter-spacing="2">BUSINESS CASE INTELLIGENCE · PRANAV KUMAR</text>
  <text x="40" y="88" fill="#F8FAFC" font-size="30" font-weight="800">${esc(headline.slice(0, 60))}</text>

  <!-- 6 tiles: 3 cols × 2 rows -->
  ${tiles.map((t, i) => {
    const col = cols[i % 3];
    const row = rows[Math.floor(i / 3)];
    const subLines = wrap(t.sub, 32);
    return `
  <rect x="${col}" y="${row}" width="340" height="225" rx="16" fill="${t.bg}" stroke="${t.color}" stroke-width="1.5" stroke-opacity="0.5"/>
  <rect x="${col}" y="${row}" width="340" height="40" rx="16" fill="${t.color}" fill-opacity="0.15"/>
  <text x="${col + 16}" y="${row + 26}" fill="${t.color}" font-size="11" font-weight="700" letter-spacing="1.5">${esc(t.label)}</text>
  ${t.value ? `<text x="${col + 16}" y="${row + 80}" fill="#F8FAFC" font-size="28" font-weight="900">${esc(t.value)}</text>` : ''}
  ${subLines.slice(0, 4).map((l, j) =>
    `<text x="${col + 16}" y="${row + (t.value ? 110 : 80) + j * 28}" fill="#CBD5E1" font-size="14" font-weight="400">${esc(l)}</text>`
  ).join('\n  ')}`;
  }).join('')}

  <!-- Author -->
  <rect x="0" y="589" width="1200" height="38" fill="rgba(0,0,0,0.6)"/>
  <circle cx="58" cy="608" r="10" fill="#38BDF8"/>
  <text x="58" y="613" fill="#07090F" font-size="10" font-weight="900" text-anchor="middle">PK</text>
  <text x="80" y="613" fill="#F8FAFC" font-size="13" font-weight="700">PRANAV KUMAR</text>
  <text x="230" y="613" fill="#94A3B8" font-size="12">RevOps &amp; GTM Strategy · Commercial Scaleups &amp; Marketplaces</text>
</svg>`;
}

// ─── T7: Company Case Matrix (upgraded) ───────────────────────
export function generateCompanyCaseMatrix({ caseData, hook }) {
  const company = esc(caseData?.company || 'EASTMAN KODAK');
  const theme = esc(caseData?.theme || 'Digital Strategy');
  const period = esc(caseData?.period || '1990s–2012');
  const industry = esc(caseData?.industry || 'Imaging / Technology');

  // Dramatic hook headlines
  let dramaticH1 = 'THEY INVENTED DIGITAL IN 1975.';
  let dramaticH2 = 'BY 2012, THEY WERE BANKRUPT.';
  let dramaticBadge = 'FATAL OPERATING BLIND SPOT';

  if (!(/Kodak/i.test(company))) {
    dramaticH1 = `${company.toUpperCase()}: THE OPERATING FAILURE`;
    dramaticH2 = `A ${theme.toUpperCase().slice(0, 34)} FAILURE.`;
    dramaticBadge = 'EXECUTIVE CASE STUDY';
  }

  // 3-Part Strategic Breakdown: built ONLY from this case's own sourced fields (never another company's facts).
  const sentences = (t = '') => String(t).split(/(?<=[.;])\s+|;\s*/).map((x) => x.trim()).filter(Boolean);
  const bulletLines = (items, max = 9) => {
    const out = [];
    for (const it of items) {
      wrap(it.charAt(0).toUpperCase() + it.slice(1).replace(/[.;]$/, '') + '.', 44).forEach((l, j) => out.push((j ? '   ' : '• ') + l));
    }
    if (out.length > max) { out.length = max; out[max - 1] = out[max - 1].replace(/\s*\S*$/, '…'); }
    return out;
  };
  const cd = caseData || {};
  const col1Title = 'THE PROBLEM';
  const col1Lines = cd.documentedProblem ? bulletLines([...sentences(cd.documentedProblem), ...sentences(cd.rootCauseAnalysis || '')]) : bulletLines(['Case data missing']);
  const col2Title = 'THE BUSINESS OUTCOME';
  const col2Lines = bulletLines(sentences(cd.businessImpact || cd.documentedResponse || 'Case data missing'));
  const col3Title = 'OPERATOR FIX';
  const col3Lines = bulletLines(sentences(cd.recommendedFix || 'Case data missing'));
  const subLine = esc(String(cd.postAngle || hook || '').slice(0, 78));
  let sourceLabel = esc(cd.evidenceType || 'Case bank');
  try { if (cd.sourceUrl) sourceLabel += ' · ' + esc(new URL(cd.sourceUrl).hostname.replace(/^www\./, '')); } catch (_) {}

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 627" width="1200" height="627" style="font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <defs>
    <linearGradient id="bgCM" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#070B19"/>
      <stop offset="50%" stop-color="#080C1E"/>
      <stop offset="100%" stop-color="#050814"/>
    </linearGradient>
    <linearGradient id="cyanRed" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#EF4444"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
    <radialGradient id="topRed" cx="20%" cy="10%" r="50%">
      <stop offset="0%" stop-color="#EF4444" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#070B19" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="btmGold" cx="80%" cy="90%" r="45%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#070B19" stop-opacity="0"/>
    </radialGradient>
    <filter id="cmShadow"><feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.6"/></filter>
  </defs>

  <rect width="1200" height="627" fill="url(#bgCM)"/>
  <rect width="1200" height="627" fill="url(#topRed)"/>
  <rect width="1200" height="627" fill="url(#btmGold)"/>

  <!-- Subtle Blueprint Grid Lines -->
  <g stroke="rgba(255,255,255,0.03)" stroke-width="1">
    <line x1="60" y1="0" x2="60" y2="627"/>
    <line x1="1140" y1="0" x2="1140" y2="627"/>
    <line x1="0" y1="210" x2="1200" y2="210"/>
    <line x1="0" y1="565" x2="1200" y2="565"/>
  </g>

  <!-- Top Badges Row -->
  <!-- Author Pill -->
  <rect x="60" y="24" width="375" height="30" rx="15" fill="rgba(0,240,255,0.08)" stroke="#00F0FF" stroke-width="1.2"/>
  <circle cx="76" cy="39" r="5" fill="#00F0FF"/>
  <text x="90" y="43" fill="#00F0FF" font-size="11.5" font-weight="700" letter-spacing="1.2">PRANAV KUMAR · REVOPS &amp; GTM STRATEGY</text>

  <!-- Dramatic Hook Badge (NO CASE NUMBER) -->
  <rect x="700" y="24" width="270" height="30" rx="15" fill="rgba(239,68,68,0.18)" stroke="#EF4444" stroke-width="1.3"/>
  <text x="835" y="43" fill="#FCA5A5" font-size="11.5" font-weight="800" text-anchor="middle" letter-spacing="1.5">⚡ ${dramaticBadge}</text>

  <!-- Period & Domain Pill -->
  <rect x="982" y="24" width="158" height="30" rx="15" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <text x="1061" y="43" fill="#94A3B8" font-size="11" font-weight="600" text-anchor="middle">${period}</text>

  <!-- Dramatic Hook Headline (Massive impact) -->
  <text x="60" y="106" fill="#EF4444" font-size="44" font-weight="900" letter-spacing="-0.5" filter="url(#cmShadow)">${dramaticH1}</text>
  <text x="60" y="152" fill="#F8FAFC" font-size="44" font-weight="900" letter-spacing="-0.5" filter="url(#cmShadow)">${dramaticH2}</text>

  <!-- Case Study Context Subhead -->
  <text x="60" y="190" fill="#38BDF8" font-size="15" font-weight="700" letter-spacing="1">EXECUTIVE CASE STUDY: ${company.toUpperCase()}</text>
  <text x="360" y="190" fill="#94A3B8" font-size="14" font-weight="500">${subLine}</text>

  <!-- 3 Strategic Comparison Columns -->

  <!-- Column 1: The Strategy Failure -->
  <rect x="60" y="230" width="345" height="315" rx="14" fill="rgba(239,68,68,0.06)" stroke="rgba(239,68,68,0.3)" stroke-width="1.2"/>
  <rect x="60" y="230" width="345" height="44" rx="14" fill="rgba(239,68,68,0.18)"/>
  <text x="232" y="258" fill="#FCA5A5" font-size="13" font-weight="800" text-anchor="middle" letter-spacing="1.2">❌ ${col1Title}</text>
  ${col1Lines.map((l, i) =>
    `<text x="76" y="${300 + i * 26}" fill="#E2E8F0" font-size="13.5" font-weight="500" xml:space="preserve">${esc(l)}</text>`
  ).join('\n  ')}

  <!-- Column 2: Business Outcome -->
  <rect x="428" y="230" width="345" height="315" rx="14" fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.3)" stroke-width="1.2"/>
  <rect x="428" y="230" width="345" height="44" rx="14" fill="rgba(245,158,11,0.18)"/>
  <text x="600" y="258" fill="#FCD34D" font-size="13" font-weight="800" text-anchor="middle" letter-spacing="1.2">⚠️ ${col2Title}</text>
  ${col2Lines.map((l, i) =>
    `<text x="444" y="${300 + i * 26}" fill="#E2E8F0" font-size="13.5" font-weight="500" xml:space="preserve">${esc(l)}</text>`
  ).join('\n  ')}

  <!-- Column 3: Operator Strategy & Fix -->
  <rect x="795" y="230" width="345" height="315" rx="14" fill="rgba(16,185,129,0.06)" stroke="rgba(16,185,129,0.3)" stroke-width="1.2"/>
  <rect x="795" y="230" width="345" height="44" rx="14" fill="rgba(16,185,129,0.18)"/>
  <text x="967" y="258" fill="#6EE7B7" font-size="13" font-weight="800" text-anchor="middle" letter-spacing="1.2">✓ ${col3Title}</text>
  ${col3Lines.map((l, i) =>
    `<text x="811" y="${300 + i * 26}" fill="#E2E8F0" font-size="13.5" font-weight="500" xml:space="preserve">${esc(l)}</text>`
  ).join('\n  ')}

  <!-- Footer Branding -->
  <rect x="0" y="585" width="1200" height="42" fill="rgba(0,0,0,0.5)"/>
  <circle cx="76" cy="606" r="9" fill="#00F0FF"/>
  <text x="76" y="610" fill="#070B19" font-size="9" font-weight="900" text-anchor="middle">PK</text>
  <text x="96" y="610" fill="#F8FAFC" font-size="12.5" font-weight="700">PRANAV KUMAR</text>
  <text x="240" y="610" fill="#94A3B8" font-size="11.5">Commercial Scaleups &amp; Marketplaces · Operations &amp; Strategy Insight</text>
  <text x="1140" y="610" fill="#64748B" font-size="11" text-anchor="end">Source: ${sourceLabel}</text>
</svg>`;
}

// ─── Canva template IDs per archetype ────────────────────────
// These are populated as Canva designs are created.
// When a design ID is null, the Worker uses the SVG-only path.
export const CANVA_TEMPLATE_IDS = {
  dark_stat_headline:         { designId: 'DAHb1eZQRYQ', editUrl: 'https://canva.link/ept9d8tku9ss9oj' },
  quote_bullet_system:        { designId: 'DAHb1aqRxmA', editUrl: 'https://canva.link/tkwmtqabe51avdz' },
  problem_reality_split:      { designId: null, editUrl: null },
  leadership_framework_cards: { designId: null, editUrl: null },
  performers_principle:       { designId: null, editUrl: null },
  insight_grid:               { designId: null, editUrl: null },
  company_case_matrix:        { designId: 'DAHbvV-AXys', editUrl: 'https://canva.link/zpiisdcunqtdccu' },
  revenue_leakage_matrix:     { designId: 'DAHbvV-AXys', editUrl: 'https://canva.link/zpiisdcunqtdccu' },
  big_ipos_watchlist:         { designId: 'DAHbuJrihFk', editUrl: 'https://canva.link/tjdg95eyudrlyid' },
  indian_startups_tier_list:  { designId: 'DAHbuHPscYY', editUrl: 'https://canva.link/2j879erylbq4ctg' },
};
