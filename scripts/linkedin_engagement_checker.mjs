import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const LATEST_POST_FILE = path.join(BACKUP_DIR, 'latest_published.json');
const ENGAGEMENT_FILE = path.join(BACKUP_DIR, 'latest_engagement.json');

const FORBIDDEN_WORDS = ['indiamart', 'justdial', 'magicbricks', 'magicpin'];

export function sanitizeReply(text) {
  let cleaned = String(text || '').trim();
  for (const word of FORBIDDEN_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(re, 'a high-velocity marketplace scaleup');
  }
  return cleaned;
}

export function generateExecutiveReply(commenterName, commentText, caseContext) {
  const text = String(commentText || '').toLowerCase();
  let response = '';

  if (/agree|spot on|great point|well said|true/i.test(text)) {
    response = `Spot on, ${commenterName}. In commercial operations, protecting existing margin pools is the most common trap leadership falls into. If you don't build the migration path yourself, competitors with zero legacy overhead will do it for you.`;
  } else if (/how|what|question|would you|milestone/i.test(text)) {
    response = `Great question, ${commenterName}. In practice, the key milestone is setting explicit stop/go criteria tied to customer retention and new channel unit economics—measured weekly—rather than shielding the legacy profit center until it's too late.`;
  } else if (/culture|leadership|people|team/i.test(text)) {
    response = `Completely agree on the human element, ${commenterName}. Strategy is only as good as organizational alignment. When compensation and incentives reward defending the legacy revenue stream, proactive transformation rarely happens without single-point P&L ownership.`;
  } else {
    response = `Appreciate the perspective, ${commenterName}. Across high-growth marketplaces and scaling operators, the common denominator is always customer behavior over internal inertia. The market always moves faster than traditional quarterly planning cycles.`;
  }

  return sanitizeReply(response);
}

export function loadLastPublishedPost() {
  if (!fs.existsSync(LATEST_POST_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(LATEST_POST_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function saveEngagementReport(report) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(ENGAGEMENT_FILE, JSON.stringify(report, null, 2), 'utf8');
  return report;
}
