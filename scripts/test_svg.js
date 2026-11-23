import fs from 'fs';
import { getCaseByNumber } from '../mcp/src/case_bank.mjs';

function getCompanyCaseSvg(caseData) {
  const authorBadge = 'PRANAV KUMAR · BUSINESS CASE STUDY';
  const cleanCompany = (caseData.company || 'COMPANY CASE').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cleanTheme = (caseData.theme || 'Business Strategy').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cleanProblem = (caseData.documentedProblem || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cleanAnalysis = (caseData.rootCauseAnalysis || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cleanResponse = (caseData.documentedResponse || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cleanSource = (caseData.sourceUrl || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 627" width="1200" height="627" style="background:#070B19;font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <defs>
    <linearGradient id="bgGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B132B"/>
      <stop offset="50%" stop-color="#080C1E"/>
      <stop offset="100%" stop-color="#050814"/>
    </linearGradient>
    <radialGradient id="topCyanGlow" cx="25%" cy="10%" r="50%">
      <stop offset="0%" stop-color="#00F0FF" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#070B19" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bottomGoldGlow" cx="80%" cy="90%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#070B19" stop-opacity="0"/>
    </radialGradient>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>

  <rect width="1200" height="627" fill="url(#bgGlow)"/>
  <rect width="1200" height="627" fill="url(#topCyanGlow)"/>
  <rect width="1200" height="627" fill="url(#bottomGoldGlow)"/>

  <!-- Top Badges & Breadcrumb -->
  <g transform="translate(60, 24)">
    <rect x="0" y="0" width="375" height="30" rx="15" fill="rgba(0,240,255,0.08)" stroke="#00F0FF" stroke-width="1.2"/>
    <circle cx="16" cy="15" r="5" fill="#00F0FF"/>
    <text x="30" y="19" fill="#00F0FF" font-size="11.5" font-weight="700" letter-spacing="1.2">${authorBadge}</text>

    <rect x="715" y="0" width="365" height="30" rx="15" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <text x="897" y="19" fill="#94A3B8" font-size="11" font-weight="600" text-anchor="middle">CASE #${caseData.caseNumber} OF 100 · ${caseData.period}</text>
  </g>

  <!-- Header -->
  <g transform="translate(60, 68)">
    <text x="0" y="28" fill="#FFFFFF" font-size="28" font-weight="900" letter-spacing="-0.5">${cleanCompany}</text>
    <rect x="585" y="4" width="220" height="32" rx="6" fill="#FACC15"/>
    <text x="695" y="25" fill="#0F172A" font-size="13" font-weight="900" text-anchor="middle" letter-spacing="0.5">${cleanTheme.toUpperCase()}</text>
    <text x="0" y="52" fill="#94A3B8" font-size="14" font-weight="500">${caseData.industry} · Evidence: ${caseData.evidenceType}</text>
  </g>

  <!-- 3 High Contrast Editorial Cards -->
  <!-- CARD 1: THE DOCUMENTED PROBLEM -->
  <g transform="translate(60, 138)" filter="url(#cardShadow)">
    <rect x="0" y="0" width="345" height="345" rx="16" fill="#FFFFFF"/>
    <path d="M 0 16 Q 0 0 16 0 L 329 0 Q 345 0 345 16 L 345 52 L 0 52 Z" fill="#DC2626"/>
    <text x="18" y="27" fill="#FFFFFF" font-size="13" font-weight="800">❌ THE DOCUMENTED PROBLEM</text>
    <text x="18" y="43" fill="#FECACA" font-size="10.5" font-weight="600">Reported Operational Issue</text>
    <foreignObject x="18" y="65" width="309" height="210">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:12.5px;line-height:1.5;color:#0F172A;font-weight:600;font-family:sans-serif;">
        ${cleanProblem}
      </div>
    </foreignObject>
    <g transform="translate(18, 288)">
      <rect x="0" y="0" width="309" height="40" rx="10" fill="#FEF2F2" stroke="#F87171" stroke-width="1.2"/>
      <text x="154" y="24" fill="#B91C1C" font-size="11" font-weight="800" text-anchor="middle">🚨 DOCUMENTED IMPACT</text>
    </g>
  </g>

  <!-- CARD 2: ROOT CAUSE (ANALYSIS) -->
  <g transform="translate(427, 138)" filter="url(#cardShadow)">
    <rect x="0" y="0" width="345" height="345" rx="16" fill="#FFFFFF"/>
    <path d="M 0 16 Q 0 0 16 0 L 329 0 Q 345 0 345 16 L 345 52 L 0 52 Z" fill="#D97706"/>
    <text x="18" y="27" fill="#FFFFFF" font-size="13" font-weight="800">⚠️ ROOT-CAUSE DIAGNOSIS</text>
    <text x="18" y="43" fill="#FEF3C7" font-size="10.5" font-weight="600">Operator Analysis &amp; Interpretation</text>
    <foreignObject x="18" y="65" width="309" height="210">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:12px;line-height:1.45;color:#0F172A;font-weight:600;font-family:sans-serif;">
        ${cleanAnalysis}
      </div>
    </foreignObject>
    <g transform="translate(18, 288)">
      <rect x="0" y="0" width="309" height="40" rx="10" fill="#FFFBEB" stroke="#FBBF24" stroke-width="1.2"/>
      <text x="154" y="24" fill="#B45309" font-size="11" font-weight="800" text-anchor="middle">⚡ SYSTEMIC ROOT CAUSE</text>
    </g>
  </g>

  <!-- CARD 3: RESPONSE & RECOMMENDED FIX -->
  <g transform="translate(795, 138)" filter="url(#cardShadow)">
    <rect x="0" y="0" width="345" height="345" rx="16" fill="#FFFFFF"/>
    <path d="M 0 16 Q 0 0 16 0 L 329 0 Q 345 0 345 16 L 345 52 L 0 52 Z" fill="#059669"/>
    <text x="18" y="27" fill="#FFFFFF" font-size="13" font-weight="800">✓ WHAT CHANGED &amp; FIX</text>
    <text x="18" y="43" fill="#D1FAE5" font-size="10.5" font-weight="600">Documented Response &amp; Lessons</text>
    <foreignObject x="18" y="65" width="309" height="210">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:12px;line-height:1.45;color:#0F172A;font-weight:600;font-family:sans-serif;">
        <b>Actual:</b> ${cleanResponse}<br/><br/>
        <b>Fix:</b> ${caseData.recommendedFix ? caseData.recommendedFix.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}
      </div>
    </foreignObject>
    <g transform="translate(18, 288)">
      <rect x="0" y="0" width="309" height="40" rx="10" fill="#ECFDF5" stroke="#34D399" stroke-width="1.2"/>
      <text x="154" y="24" fill="#047857" font-size="11" font-weight="800" text-anchor="middle">🏆 OPERATOR RECOMMENDATIONS</text>
    </g>
  </g>

  <!-- Bottom Impact Strip -->
  <g transform="translate(60, 502)">
    <rect x="0" y="0" width="1080" height="52" rx="12" fill="#0D1527" stroke="rgba(0,240,255,0.25)" stroke-width="1"/>
    <g transform="translate(24, 16)">
      <text x="0" y="16" fill="#00F0FF" font-size="12" font-weight="800">SOURCE URL:</text>
      <text x="100" y="16" fill="#94A3B8" font-size="11" font-weight="500">${cleanSource.length > 80 ? cleanSource.slice(0, 80) + '...' : cleanSource}</text>
    </g>
  </g>

  <!-- Footer Branding -->
  <g transform="translate(60, 580)">
    <text x="0" y="18" fill="#64748B" font-size="11" font-weight="600">PRANAV SIGNAL · 100 BUSINESS PROBLEMS CASE BANK · 1200 × 627 (1.91:1) ASSET</text>
    <text x="1080" y="18" fill="#00F0FF" font-size="11" font-weight="700" text-anchor="end">AGENTVERSE GROWTH STUDIO · POWERED BY MCP</text>
  </g>
</svg>`;
}

const c1 = getCaseByNumber(1);
const svg = getCompanyCaseSvg(c1);
fs.writeFileSync('data/test_case1.svg', svg);
console.log('Generated data/test_case1.svg, length:', svg.length);
