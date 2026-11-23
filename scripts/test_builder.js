import { getCaseByNumber, CASE_BANK } from '../mcp/src/case_bank.mjs';

export function formatFixPoints(recommendedFix) {
  if (!recommendedFix) return '1) Audit unit economics and customer retention.\n2) Introduce metric-driven stop/go gates.\n3) Assign single-owner accountability.';
  if (recommendedFix.includes(';')) {
    const parts = recommendedFix.split(';').map(s => s.trim()).filter(Boolean);
    return parts.map((p, idx) => `${idx + 1}) ${p.replace(/^\d+[\.\)]\s*/, '')}`).join('\n');
  }
  const parts = recommendedFix.split(/\.\s+/).map(s => s.trim().replace(/\.$/, '')).filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(0, 3).map((p, idx) => `${idx + 1}) ${p}`).join('\n');
  }
  return `1) ${recommendedFix}\n2) Establish metric-driven stop/go gates before scaling.\n3) Review unit economics weekly with single-point ownership.`;
}

export function buildLinkedInPostFromCase(c) {
  const cleanProfile = c.companyProfile ? c.companyProfile.replace(/\.$/, '') : '';
  const cleanAngle = c.postAngle ? c.postAngle.replace(/\?$/, '.') : '';

  const hook = `Most leaders assume ${c.company}’s challenge was an execution delay.\n\nThe documented case of ${c.company} reveals a much deeper operating lesson: ${cleanAngle}`;

  const context = `${c.company} (${c.industry}) — ${cleanProfile}. In ${c.period}, ${c.businessImpact}`;

  const problem = `The documented problem: ${c.documentedProblem}`;

  const analysis = `My analysis: ${c.rootCauseAnalysis}`;

  const whatChanged = `What actually changed: ${c.documentedResponse}`;

  const fixPoints = formatFixPoints(c.recommendedFix);
  const fixSection = `What I would fix next:\n${fixPoints}`;

  const lesson = `The management lesson: Scale is not proof of durability. When customer habits or unit economics shift, defending the legacy channel only accelerates the decline.`;

  const conversation = `What would you have prioritised first if you were leading ${c.company} during this transition?`;

  const tagTheme = c.theme.replace(/[^a-zA-Z0-9]/g, '');
  const hashtags = `#BusinessStrategy #Operations #Leadership #${tagTheme} #100BusinessProblems`;

  const body = `${hook}

${context}

${problem}

${analysis}

${whatChanged}

${fixSection}

${lesson}

${conversation}

${hashtags}`;

  const words = body.trim().split(/\s+/).length;
  return {
    hook,
    body,
    wordCount: words,
    caseNumber: c.caseNumber,
    company: c.company,
    theme: c.theme,
    sourceUrl: c.sourceUrl,
    evidenceType: c.evidenceType
  };
}

// Test on Case 1
const sample = buildLinkedInPostFromCase(getCaseByNumber(1));
console.log(`Word count: ${sample.wordCount}`);
console.log(sample.body);
