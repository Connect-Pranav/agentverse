// AGENTVERSE 24/7 agent — runs on GitHub Actions (free). One cycle = 1 brain call.
// Reads data/brands.json + data/leads.json, writes data/work.json (the dashboard shows it in the Work Board).
import fs from "node:fs";
const R = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
const CFG = R("data/brands.json", null);
if (!CFG) { console.log("no data/brands.json"); process.exit(0); }
const LEADS = R("data/leads.json", { leads: [] }).leads || [];
const WORK = R("data/work.json", { items: [], cycles: 0, topics: [] });
const K = { groq: process.env.GROQ_API_KEY, gemini: process.env.GEMINI_API_KEY, openrouter: process.env.OPENROUTER_API_KEY, cloud: process.env.SV_MCP_TOKEN };
// no secret? sign in to the AGENTVERSE cloud brain with GitHub's OIDC token (needs permissions id-token: write)
if (!K.cloud && process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
  try {
    const r = await fetch(process.env.ACTIONS_ID_TOKEN_REQUEST_URL + "&audience=agentverse", { headers: { Authorization: "bearer " + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN } });
    if (r.ok) K.cloud = (await r.json()).value;
  } catch (e) { console.log("[agent] OIDC token failed:", e.message); }
}
let CLOUD_URL = (process.env.SV_MCP_URL || "").replace(/\/+$/, "");
if (!CLOUD_URL) for (const u of ["https://agentverse.pravanigroup.workers.dev", "https://agentverse.aistudio09.workers.dev"]) {
  try { const r = await fetch(u + "/health", { headers: { "User-Agent": "Mozilla/5.0 AGENTVERSE-agent" } }); if (r.ok && (await r.json()).app === "agentverse") { CLOUD_URL = u; break; } } catch {}
}
const DEPTS = ["Market Radar","Search Visibility","Content Engine","Creative Studio","Reviews & Reputation","Publishing & Social","Leads & Conversations","Results & Reporting"];
const log = (...a) => console.log("[agent]", ...a);
const uid = () => Math.random().toString(36).slice(2, 8);
if (!K.groq && !K.gemini && !K.openrouter && !K.cloud) { log("no brain: add repo secret SV_MCP_TOKEN (free AGENTVERSE cloud brain) or GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY — skipping"); process.exit(0); }

// rotate brands: one brand per run
const names = Object.keys(CFG.brands);
const brand = process.env.BRAND || names[(WORK.cycles || 0) % names.length];
const b = CFG.brands[brand];
const myLeads = LEADS.filter(l => (l.products || [l.product]).includes(brand)).filter(l => !(WORK.items || []).some(w => w.lead_id === l.id)).slice(0, 2);
const recent = (WORK.items || []).filter(w => w.brand === brand).slice(0, 8).map(w => w.title);

const SYS = `You are AGENTVERSE, an autonomous AI social media and growth team working for ${CFG.owner}. In ONE response: pick one high-value content opportunity for the brand, then produce the finished deliverables.
Departments: ${DEPTS.join(", ")}.
Produce 3-5 items: e.g. a post caption with hashtags, a 30-second reel script in 3 scenes, a YouTube title + description + tags, SEO keywords, and (if FRESH LEADS exist) one short helpful reply per lead.
Follow OWNER RULES strictly. Never invent facts, prices, numbers or testimonials; use [placeholders]. Lead replies must answer the person's need first, be short and human, mention the product only if it truly helps.
Return ONLY JSON: {"topic":"max 8 words","why":"max 20 words","items":[{"dept":"exact department","title":"max 10 words","body":"max 150 words","needs_approval":true|false,"lead_id":"id or null"}],"summary":"max 20 words"}. needs_approval=true for anything published or sent to a person.
Never write bulk or unsolicited DMs, follow-for-follow, giveaway bait or messages with placeholders like [Follower Name] (Instagram/YouTube ban accounts for mass messaging); for outreach only write a reply to a specific named lead or a public comment/post. `;
let USER = `BRAND: ${brand}\nWhat: ${b.what}\nAudience: ${b.aud}\nVoice: ${b.voice}\nGoal: ${b.goal}\nChannels: ${b.ch}\nTopic ideas: ${String(b.top).split("|").join(", ")}\n\nOWNER RULES:\n- ${(CFG.rules || []).join("\n- ")}`;
if (recent.length) USER += `\n\nRECENT OUTPUTS (don't repeat):\n- ${recent.join("\n- ")}`;
if ((WORK.topics || []).length) USER += `\nRECENT TOPICS: ${WORK.topics.slice(0, 8).join(", ")}`;
if (myLeads.length) USER += `\n\nFRESH LEADS (id | source | title | text):\n` + myLeads.map(l => `- ${l.id} | ${l.source} | ${l.title} | ${String(l.text || "").slice(0, 300)}`).join("\n");

const parse = t => { t = String(t || "").replace(/```json|```/g, ""); const a = t.indexOf("{"), z = t.lastIndexOf("}"); if (a < 0) throw new Error("no JSON"); return JSON.parse(t.slice(a, z + 1)); };
const ver = id => parseFloat((String(id).match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
async function j(url, opt = {}) { const r = await fetch(url, opt); const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 150)}`); return JSON.parse(t); }

async function groq() {
  const m = await j("https://api.groq.com/openai/v1/models", { headers: { Authorization: "Bearer " + K.groq } });
  const ids = (m.data || []).filter(x => x.active !== false && !/whisper|tts|guard|playai|distil|vision|embed|compound|orpheus|prompt/i.test(x.id)).map(x => x.id);
  const pref = [/gpt-oss-120b/, /llama-3\.3-70b/, /llama-4.*maverick/, /kimi/, /qwen.*32b/, /llama.*70b/, /gpt-oss/, /llama/];
  const model = pref.map(p => ids.find(i => p.test(i))).find(Boolean) || ids[0];
  const r = await j("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + K.groq, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: SYS }, { role: "user", content: USER }], temperature: 0.85, max_tokens: 2200, response_format: { type: "json_object" } }) });
  return { model, out: parse(r.choices[0].message.content) };
}
async function gemini() {
  const m = await j(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${K.gemini}`);
  const ms = (m.models || []).filter(x => (x.supportedGenerationMethods || []).includes("generateContent") && /gemini/.test(x.name) && /flash/.test(x.name) && !/image|tts|audio|live|embed|vision|thinking-exp/.test(x.name))
    .sort((a, b) => (/preview|exp/.test(a.name) - /preview|exp/.test(b.name)) || (/lite/.test(a.name) - /lite/.test(b.name)) || ver(b.name.replace("models/gemini-", "")) - ver(a.name.replace("models/gemini-", "")));
  let last;
  for (const x of ms.slice(0, 3)) {
    const model = x.name.replace("models/", "");
    try {
      const r = await j(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${K.gemini}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYS }] }, contents: [{ role: "user", parts: [{ text: USER }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.85 } }) });
      return { model, out: parse(r.candidates[0].content.parts.map(p => p.text).join("")) };
    } catch (e) { last = e; log("gemini", model, "→", e.message.slice(0, 80)); }
  }
  throw last || new Error("no gemini model");
}
async function openrouter() {
  const m = await j("https://openrouter.ai/api/v1/models");
  const fr = (m.data || []).filter(x => /:free$/.test(x.id));
  const pref = [/llama-3\.3-70b/, /deepseek.*(chat|v3)/, /qwen.*(72b|235b|32b)/, /gpt-oss/, /gemma-3-27b/, /llama/];
  const model = (pref.map(p => fr.find(x => p.test(x.id))).find(Boolean) || fr[0]).id;
  const r = await j("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + K.openrouter, "Content-Type": "application/json", "HTTP-Referer": "https://connect-pranav.github.io/agentverse/", "X-Title": "AGENTVERSE" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: SYS + "\nReturn ONLY JSON." }, { role: "user", content: USER }], temperature: 0.85 }) });
  return { model, out: parse(r.choices[0].message.content) };
}

async function cloud() {
  const r = await j(CLOUD_URL + "/api/brain", { method: "POST", headers: { Authorization: "Bearer " + K.cloud, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 AGENTVERSE-agent" },
    body: JSON.stringify({ system: SYS + "\nReturn ONLY JSON.", prompt: USER }) });
  return { model: "cloudflare/" + r.model, out: parse(r.text) };
}

let res, used;
for (const [name, fn] of [["groq", groq], ["gemini", gemini], ["openrouter", openrouter], ["cloud", cloud]]) {
  if (!K[name]) continue;
  try { res = await fn(); used = name; break; } catch (e) { log(name, "failed:", e.message.slice(0, 120)); }
}
if (!res) { log("all brains failed — nothing written"); process.exit(0); }

const now = new Date().toISOString(), out = res.out, items = [];
for (const it of (out.items || []).slice(0, 8)) {
  if (!it || !it.body) continue;
  const L = it.lead_id ? LEADS.find(l => l.id === it.lead_id) : null;
  items.push({ id: "sv_" + uid(), brand, dept: DEPTS.includes(it.dept) ? it.dept : "Content Engine", title: String(it.title || it.dept).slice(0, 90), body: String(it.body).slice(0, 1400),
    status: it.needs_approval ? "waiting" : "ready", lead_id: L ? L.id : null, url: L ? L.url : undefined, topic: out.topic, ts: Date.parse(now), server: true, brain: used + " · " + res.model });
}
WORK.items = [...items, ...(WORK.items || [])].slice(0, 120);
WORK.topics = [out.topic, ...(WORK.topics || [])].filter(Boolean).slice(0, 20);
WORK.cycles = (WORK.cycles || 0) + 1;
WORK.updated = now;
WORK.last = { brand, topic: out.topic, why: out.why, summary: out.summary, brain: used, model: res.model, count: items.length };
fs.writeFileSync("data/work.json", JSON.stringify(WORK, null, 1));
log(`cycle ${WORK.cycles}: ${brand} · "${out.topic}" · ${items.length} items via ${used}/${res.model}`);
