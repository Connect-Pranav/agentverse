// VANI voice: secure server-side proxy to Sarvam AI text-to-speech (Bulbul).
//
//   GET  /api/vani/config   owner only → what the dashboard needs to pick a voice (never the key)
//   POST /api/vani/tts      owner only → { text, lang?, speaker?, pace? } → audio/mpeg
//
// Secret:  SARVAM_API_KEY  (Cloudflare → Worker → Settings → Variables and Secrets). Never sent to the browser.
// Vars (all optional, see wrangler.jsonc):
//   VANI_VOICE_PROVIDER   sarvam | device            (device = browser voices only, Sarvam off)
//   VANI_SARVAM_MODEL     Sarvam model id            (default bulbul:v3 — verify on docs.sarvam.ai)
//   VANI_SARVAM_SPEAKER   default speaker id         (default simran)
//   VANI_SARVAM_SPEAKERS  comma list the owner may pick from (allowlist; must match the model)
//   VANI_LANGUAGE         default language code      (hi-IN)
//   VANI_SPEECH_RATE      default pace               (1.0; Sarvam allows 0.5–2.0)
//   VANI_AUTO_PLAY, VANI_INTERRUPT_ENABLED, VANI_VOICE_PERSONALITY  passed to the dashboard
//   VANI_TTS_DAILY_CHARS  daily character cap        (default 5000 ≈ ₹15/day on bulbul:v3 at ₹3 per 1,000)
//   VANI_TTS_MAX_CHARS    per-request cap            (default 900)
//
// Sarvam is paid per character after the sign-up credits. The cap is enforced here, and when Sarvam refuses
// (no credits / quota / bad key) the endpoint returns an error. The dashboard then uses the free device voice
// and says so. It never switches to another paid provider.

const SARVAM_URL = 'https://api.sarvam.ai/text-to-speech';
const LANGS = ['bn-IN', 'en-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN'];
const DEF_SPEAKERS = 'simran,ishita,priya,ritu,kavya,shreya,sanchita,simran_enhi_companion,ishita_enhi_companion,sanchita_enhi_companion';

export class VaniError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const num = (v, d) => (Number.isFinite(Number(v)) && String(v ?? '').trim() !== '' ? Number(v) : d);
const flag = (v, d) => (v === undefined || v === '' ? d : !/^(0|false|off|no)$/i.test(String(v)));

export function config(env) {
  const speakers = String(env.VANI_SARVAM_SPEAKERS || DEF_SPEAKERS).split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z][a-z0-9_]{1,48}$/.test(s));
  let speaker = String(env.VANI_SARVAM_SPEAKER || 'simran').trim().toLowerCase();
  if (!speakers.includes(speaker)) speakers.unshift(speaker);
  const provider = String(env.VANI_VOICE_PROVIDER || 'sarvam').toLowerCase();
  const lang = LANGS.includes(env.VANI_LANGUAGE) ? env.VANI_LANGUAGE : 'hi-IN';
  return {
    provider,
    enabled: provider === 'sarvam' && Boolean(env.SARVAM_API_KEY),
    keySet: Boolean(env.SARVAM_API_KEY),
    model: String(env.VANI_SARVAM_MODEL || 'bulbul:v3'),
    speaker,
    speakers,
    lang,
    rate: Math.min(2, Math.max(0.5, num(env.VANI_SPEECH_RATE, 1))),
    autoPlay: flag(env.VANI_AUTO_PLAY, true),
    interrupt: flag(env.VANI_INTERRUPT_ENABLED, true),
    personality: String(env.VANI_VOICE_PERSONALITY || 'natural').slice(0, 40),
    dailyChars: Math.max(0, Math.floor(num(env.VANI_TTS_DAILY_CHARS, 5000))),
    maxChars: Math.min(2500, Math.max(50, Math.floor(num(env.VANI_TTS_MAX_CHARS, 900)))),
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const usageKey = () => `vani/tts/usage/${today()}`;

export async function view(env, store) {
  const c = config(env);
  const used = Number(await store.get(usageKey())) || 0;
  return { ...c, usedToday: used, leftToday: Math.max(0, c.dailyChars - used) };
}

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function b64bytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function tts(env, store, body, fetchImpl = fetch) {
  const c = config(env);
  if (c.provider !== 'sarvam') throw new VaniError(409, 'Sarvam voice is switched off (VANI_VOICE_PROVIDER is not "sarvam") — using the device voice');
  if (!env.SARVAM_API_KEY) throw new VaniError(503, 'Sarvam voice is not set up: add the Cloudflare secret SARVAM_API_KEY');
  const text = String(body?.text ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
  if (!text) throw new VaniError(400, 'text is required');
  if (text.length > c.maxChars) throw new VaniError(413, `text is longer than ${c.maxChars} characters — send it in parts`);
  const lang = LANGS.includes(body?.lang) ? body.lang : (/[ऀ-ॿ]/.test(text) ? 'hi-IN' : c.lang);
  const speaker = String(body?.speaker || c.speaker).toLowerCase();
  if (!c.speakers.includes(speaker)) throw new VaniError(400, `speaker must be one of: ${c.speakers.join(', ')}`);
  const pace = Math.round(Math.min(2, Math.max(0.5, num(body?.pace, c.rate))) * 100) / 100;

  // same sentence, same voice → served from cache, costs nothing
  const ck = `vani/tts/cache/${await sha([c.model, speaker, lang, pace, text].join('|'))}`;
  const hit = await store.get(ck, 'arrayBuffer');
  if (hit) return { audio: hit, cached: true, chars: 0, ...(await usage(store, c)) };

  const used = Number(await store.get(usageKey())) || 0;
  if (used + text.length > c.dailyChars) throw new VaniError(429, `VANI voice daily limit reached (${c.dailyChars} characters, VANI_TTS_DAILY_CHARS) — device voice until it resets at 05:30 IST`);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  let r;
  try {
    r = await fetchImpl(SARVAM_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'api-subscription-key': env.SARVAM_API_KEY },
      body: JSON.stringify({ text, language_code: lang, speaker, pace, model: c.model, output_audio_codec: 'mp3', speech_sample_rate: 24000 }),
    });
  } catch (e) {
    throw new VaniError(504, `Sarvam did not answer (${e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e).slice(0, 80)})`);
  } finally { clearTimeout(timer); }
  let j = null;
  try { j = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok) {
    const m = String(j?.error?.message || j?.message || `HTTP ${r.status}`).slice(0, 200);
    const why = r.status === 402 || j?.error?.code === 'insufficient_quota_error' ? 'Sarvam credits are used up — add credits on dashboard.sarvam.ai or keep the free device voice'
      : r.status === 403 || /api_key|authentication/.test(String(j?.error?.code)) ? 'Sarvam rejected the API key (check SARVAM_API_KEY)'
      : r.status === 429 ? 'Sarvam rate limit — try again in a minute'
      : `Sarvam error: ${m}`;
    throw new VaniError(r.status === 400 || r.status === 422 ? 400 : 502, why);
  }
  const b64 = Array.isArray(j?.audios) ? j.audios[0] : null;
  if (!b64) throw new VaniError(502, 'Sarvam returned no audio');
  const audio = b64bytes(b64);
  await store.put(usageKey(), String(used + text.length), { expirationTtl: 3 * 86400 });
  if (audio.byteLength < 2_000_000) await store.put(ck, audio, { expirationTtl: 14 * 86400 });
  return { audio, cached: false, chars: text.length, ...(await usage(store, c)) };
}

async function usage(store, c) {
  const used = Number(await store.get(usageKey())) || 0;
  return { usedToday: used, leftToday: Math.max(0, c.dailyChars - used) };
}
