// AGENTVERSE lead scraper — free, runs on GitHub Actions (Node 20+, no dependencies).
// Sources: Reddit search (optional free OAuth app), Hacker News (Algolia API), RSS feeds you add.
// Output: data/leads.json  (read by the AGENTVERSE dashboard)
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "leads.config.json"), "utf8"));
const OUT = path.join(ROOT, "data", "leads.json");
const UA = "agentverse-lead-radar/1.0 (personal lead finder; contact via GitHub)";
const NOW = Date.now();
const MAX_AGE = (CFG.maxAgeDays || 10) * 864e5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[leads]", ...a);

async function getJSON(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 90)}`);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 90)}`);
  return r.text();
}
const clean = (s = "") => String(s).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

// ---------- scoring ----------
function score(lead, product) {
  const t = (lead.title + " " + lead.text).toLowerCase();
  const title = lead.title.toLowerCase();
  let s = 0; const matched = [];
  for (const k of product.keywords) if (t.includes(k.toLowerCase())) { s += 3; matched.push(k); }
  if (!matched.length) return null;
  for (const w of CFG.intentWords || []) if (t.includes(w)) { s += 1; }
  for (const h of CFG.hiringTags || []) if (title.includes(h)) { s += 3; }
  for (const x of CFG.sellerTags || []) if (title.includes(x)) { s -= 6; }
  if (/[$₹€£]\s?\d|budget|\bpaid\b/.test(t)) s += 2;
  if (t.includes("?")) s += 1;
  if (NOW - Date.parse(lead.created) < 2 * 864e5) s += 1;
  return { score: Math.min(s, 20), matched };
}

// ---------- Reddit ----------
let redditToken = null;
async function redditAuth() {
  const id = process.env.REDDIT_CLIENT_ID, secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const r = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { "User-Agent": UA, Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const j = await r.json();
    return j.access_token || null;
  } catch (e) { log("reddit auth failed:", e.message); return null; }
}
async function reddit(product) {
  const out = [];
  const q = product.keywords.slice(0, 8).map((k) => `"${k}"`).join(" OR ");
  for (const sub of product.subreddits || []) {
    const base = redditToken ? "https://oauth.reddit.com" : "https://www.reddit.com";
    const url = `${base}/r/${sub}/search${redditToken ? "" : ".json"}?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&t=week&limit=25&raw_json=1`;
    try {
      const j = await getJSON(url, redditToken ? { headers: { Authorization: "Bearer " + redditToken } } : {});
      for (const c of j?.data?.children || []) {
        const d = c.data; if (!d || d.over_18) continue;
        out.push({ id: "rd_" + d.id, source: "reddit r/" + d.subreddit, title: clean(d.title), text: clean(d.selftext).slice(0, 1200), url: "https://www.reddit.com" + d.permalink, author: d.author, created: new Date(d.created_utc * 1000).toISOString() });
      }
    } catch (e) { log("reddit", sub, "→", e.message); }
    await sleep(1200);
  }
  return out;
}

// ---------- Hacker News ----------
async function hn(product) {
  const out = []; const since = Math.floor((NOW - MAX_AGE) / 1000);
  for (const k of product.keywords.slice(0, 4)) {
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent('"' + k + '"')}&tags=(story,comment)&numericFilters=created_at_i>${since}&hitsPerPage=20`;
    try {
      const j = await getJSON(url);
      for (const h of j.hits || []) {
        const title = clean(h.title || h.story_title || "HN comment");
        out.push({ id: "hn_" + h.objectID, source: "hacker news", title, text: clean(h.comment_text || h.story_text || "").slice(0, 1200), url: "https://news.ycombinator.com/item?id=" + h.objectID, author: h.author, created: h.created_at });
      }
    } catch (e) { log("hn", k, "→", e.message); }
    await sleep(400);
  }
  return out;
}

// ---------- RSS / Atom ----------
async function rss(feed) {
  const out = [];
  try {
    const x = await getText(feed);
    const items = x.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/g) || [];
    for (const it of items.slice(0, 50)) {
      const g = (tag) => (it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || "";
      const link = g("link") || (it.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "";
      const title = clean(g("title").replace(/<!\[CDATA\[|\]\]>/g, ""));
      const date = g("pubDate") || g("updated") || g("published");
      out.push({ id: "rs_" + Buffer.from(link || title).toString("base64").replace(/[^a-z0-9]/gi, "").slice(-16), source: "rss " + new URL(feed).hostname, title, text: clean((g("description") || g("summary") || g("content")).replace(/<!\[CDATA\[|\]\]>/g, "")).slice(0, 1200), url: clean(link), created: date ? new Date(date).toISOString() : new Date().toISOString() });
    }
  } catch (e) { log("rss", feed, "→", e.message); }
  return out;
}

// ---------- optional free AI rescoring (Gemini) ----------
async function aiScore(leads) {
  const key = process.env.GEMINI_API_KEY; if (!key || !leads.length) return;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const prods = CFG.products.map((p) => p.name).join(", ");
  const batch = leads.slice(0, 40).map((l) => ({ id: l.id, product: l.product, title: l.title, text: l.text.slice(0, 300) }));
  const prompt = `Rate each post 0-10 for how likely the author is a real potential CUSTOMER for the named product (needs it, asks for it, could pay). Sellers advertising their own services = 0. Products: ${prods}. Return JSON {"scores":[{"id":"...","ai":0-10,"why":"max 10 words"}]}.\n\n${JSON.stringify(batch)}`;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }),
    });
    const j = await r.json();
    const t = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "{}";
    const map = new Map((JSON.parse(t).scores || []).map((s) => [s.id, s]));
    for (const l of leads) { const s = map.get(l.id); if (s) { l.ai = s.ai; l.why = s.why; l.score = Math.round(l.score * 0.5 + s.ai * 1.2); } }
    log("ai rescored", map.size);
  } catch (e) { log("ai scoring skipped:", e.message); }
}

// ---------- main ----------
async function main() {
  redditToken = await redditAuth();
  log("reddit mode:", redditToken ? "oauth" : "public");
  const found = new Map();
  for (const p of CFG.products) {
    const raw = [...(await reddit(p)), ...(CFG.hackerNews ? await hn(p) : [])];
    for (const l of raw) {
      if (!l.title || NOW - Date.parse(l.created) > MAX_AGE) continue;
      const sc = score(l, p); if (!sc || sc.score < (CFG.minScore || 4)) continue;
      const prev = found.get(l.id);
      if (prev) { if (!prev.products.includes(p.name)) prev.products.push(p.name); prev.score = Math.max(prev.score, sc.score); continue; }
      found.set(l.id, { ...l, product: p.name, products: [p.name], score: sc.score, matched: sc.matched });
    }
    log(p.name, "→", raw.length, "scanned");
  }
  for (const f of CFG.rss || []) {
    for (const l of await rss(f)) {
      for (const p of CFG.products) {
        const sc = score(l, p); if (!sc || sc.score < (CFG.minScore || 4)) continue;
        if (!found.has(l.id)) found.set(l.id, { ...l, product: p.name, products: [p.name], score: sc.score, matched: sc.matched });
      }
    }
  }
  const fresh = [...found.values()];
  await aiScore(fresh.filter((l) => l.ai === undefined));

  let old = [];
  try { old = JSON.parse(fs.readFileSync(OUT, "utf8")).leads || []; } catch {}
  const all = new Map(old.filter((l) => NOW - Date.parse(l.created) <= MAX_AGE).map((l) => [l.id, l]));
  for (const l of fresh) all.set(l.id, { ...(all.get(l.id) || {}), ...l, firstSeen: all.get(l.id)?.firstSeen || new Date().toISOString() });
  const leads = [...all.values()].sort((a, b) => b.score - a.score || Date.parse(b.created) - Date.parse(a.created)).slice(0, CFG.maxLeads || 300);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), count: leads.length, leads }, null, 1));
  log(`saved ${leads.length} leads (${fresh.length} found this run)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
