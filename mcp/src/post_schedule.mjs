// Posting calendar (IST), from the owner's 2026 research brief (Buffer, Vista Social, Iconosquare 2026 datasets).
// These are starting hypotheses to test for 6 weeks, not proven winners for these accounts.
// Day numbers: 0 = Sunday ... 6 = Saturday. Times are India Standard Time (UTC+05:30, no daylight saving).
export const POSTING_SCHEDULE = {
  linkedin: { label: 'LinkedIn', slots: [[3, '16:00'], [5, '15:30']], automated: true, note: 'Business problems / case studies, data-backed carousels' },
  youtube_long: { label: 'YouTube long-form', slots: [[0, '10:00']], automated: true, note: 'Sunverse songs and deep dives, weekly' },
  youtube_short: { label: 'YouTube Shorts', slots: [[4, '19:00'], [5, '18:30'], [6, '19:30']], automated: true, note: 'One idea, high retention' },
  instagram_feed: { label: 'Instagram feed', slots: [[2, '19:30'], [3, '19:30']], automated: false, note: 'Not connected to AGENTVERSE yet' },
  instagram_reel: { label: 'Instagram Reels', slots: [[4, '20:00'], [6, '20:30']], automated: false, note: 'Not connected to AGENTVERSE yet' },
  x: { label: 'X', slots: [[2, '09:00'], [3, '09:30'], [6, '21:30']], automated: false, note: 'Not connected to AGENTVERSE yet' },
};

const IST_MS = 5.5 * 3600e3;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The first slot of this platform strictly after `after` (a Date or ms).
export function nextSlot(platform, after = new Date()) {
  const p = POSTING_SCHEDULE[platform];
  if (!p) throw new Error(`Unknown platform ${platform}`);
  const t0 = +after;
  const ist = new Date(t0 + IST_MS); // wall-clock fields of IST read through the UTC getters
  for (let d = 0; d <= 14; d++) {
    const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + d));
    const hits = p.slots.filter(([wd]) => wd === day.getUTCDay()).map(([, hm]) => {
      const [h, m] = hm.split(':').map(Number);
      return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m) - IST_MS;
    }).filter((t) => t > t0).sort((a, b) => a - b);
    if (hits.length) return new Date(hits[0]);
  }
  throw new Error(`No slot found for ${platform}`);
}

// True on days that have a slot for this platform (IST calendar day).
export function isSlotDay(platform, when = new Date()) {
  const wd = new Date(+when + IST_MS).getUTCDay();
  return POSTING_SCHEDULE[platform].slots.some(([d]) => d === wd);
}

export function fmtIst(when) {
  const d = new Date(+when + IST_MS);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}, ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} IST`;
}

// Calendar for the dashboard: every platform with its slots and the next one.
export function calendar(now = new Date()) {
  return Object.entries(POSTING_SCHEDULE).map(([id, p]) => {
    const next = nextSlot(id, now);
    return { id, label: p.label, automated: p.automated, note: p.note, slots: p.slots.map(([d, t]) => `${DAYS[d]} ${t}`), next: next.toISOString(), next_label: fmtIst(next) };
  });
}
