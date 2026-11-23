import fs from 'fs';

const content = fs.readFileSync('data/100_case_bank.csv', 'utf8');

function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(cur.trim());
      cur = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(cur.trim());
      cur = '';
      if (row.length > 1 || row[0]) lines.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  if (cur || row.length) {
    row.push(cur.trim());
    lines.push(row);
  }
  return lines;
}

const rows = parseCSV(content);
console.log('Total parsed rows:', rows.length);
const header = rows[0];
console.log('Header:', header);

const cases = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r[0] || isNaN(Number(r[0]))) continue;
  cases.push({
    caseNumber: Number(r[0]),
    theme: r[1] || '',
    company: r[2] || '',
    companyProfile: r[3] || '',
    industry: r[4] || '',
    period: r[5] || '',
    documentedProblem: r[6] || '',
    rootCauseAnalysis: r[7] || '',
    businessImpact: r[8] || '',
    documentedResponse: r[9] || '',
    recommendedFix: r[10] || '',
    postAngle: r[11] || '',
    evidenceType: r[12] || '',
    sourceUrl: r[13] || ''
  });
}

console.log('Total valid cases:', cases.length);
console.log('Case 1:', cases[0]);
console.log('Case 100:', cases[cases.length - 1]);

// Write case_bank.mjs
const mjsContent = `// 100 Real Business Problems — Company Case Bank
// Authoritative source: linkedin_100_business_problems(1).xlsx
// Total cases: 100 real company cases across strategy, retail, technology, manufacturing, financial services, aviation, consumer brands, governance, and operations.

export const CASE_BANK = ${JSON.stringify(cases, null, 2)};

export function getCaseByNumber(caseNum) {
  const num = Number(caseNum);
  return CASE_BANK.find((c) => c.caseNumber === num) || null;
}

export function getNextUnusedCase(usedCaseNumbers = []) {
  const usedSet = new Set(usedCaseNumbers.map(Number));
  for (let i = 1; i <= 100; i++) {
    if (!usedSet.has(i)) {
      return { caseData: getCaseByNumber(i), isNewCycle: false };
    }
  }
  // All 100 cases used -> Start fresh cycle
  return { caseData: getCaseByNumber(1), isNewCycle: true };
}
`;

fs.writeFileSync('mcp/src/case_bank.mjs', mjsContent);
console.log('Successfully generated mcp/src/case_bank.mjs');
