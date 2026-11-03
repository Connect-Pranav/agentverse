# SUNVERSE MCP — song → music video

An MCP server (Cloudflare Worker) + a GitHub Actions renderer. Separate from Ganesha.

**Tools:** `create_song_job` · `import_song_from_url` · `list_song_jobs` · `get_song_job` · `approve_song_job` · `reject_song_job` · `get_youtube_metadata` · `delete_song_job`

**Flow:** create job → upload MP3 (upload link or Drive link) → Gemini listens (free) and plans lyrics timing, scenes, YouTube title/description → you approve the image cost in chat → Gemini images (paid) → MP4 (Sunverse logo intro, credits *Lyrics: COCO · Singer: KoBhit*, English lyric captions, end card) → download + paste title/description on YouTube.

YouTube is **not** auto-published: API uploads from an unaudited Google project are locked private.

## Setup (one time)
1. **Cloudflare** → Workers & Pages → Create → Import a repository → `agentverse` → **Root directory: `mcp`**, deploy command `npx wrangler deploy` → Deploy. URL: `https://sunverse-mcp.<your-subdomain>.workers.dev`
2. Worker → Settings → Variables and Secrets → add **secret `MCP_TOKEN`** (any long random text). Optional var `INR_PER_USD` (e.g. 88) to show ₹ estimates.
3. **GitHub** repo `agentverse` → Settings → Secrets → Actions: `GEMINI_API_KEY` (billing on, for images), `SV_MCP_TOKEN` (= MCP_TOKEN). Variables: `SV_MCP_URL` = the Worker URL.
4. **Connect in Claude**: Settings → Connectors → Add custom connector → URL `https://sunverse-mcp.<subdomain>.workers.dev/mcp/<MCP_TOKEN>`.
   (Claude Desktop/Code: URL `/mcp` with header `Authorization: Bearer <MCP_TOKEN>`.)

Tests: `node --test mcp/test/server.test.mjs`

## MCP tile (dashboard) and YouTube posting

The AGENTVERSE overview has an **MCP · Song → Video** tile: upload → Gemini analysis (mood, theme, lyrics) →
your approval of the image cost → Gemini images → MP4 → **Post to YouTube** (tap twice to confirm). Every
stage shows a live step and an estimated time left (the renderer reports progress to `/api/songvideo/runner/<id>/progress`).

YouTube posting needs three GitHub repo secrets (free, YouTube Data API v3):

1. Google Cloud console → new project → enable **YouTube Data API v3**.
2. OAuth consent screen → External → add yourself as a user → **Publish app** (in "Testing" the refresh token expires after 7 days).
3. Credentials → OAuth client ID → *Web application* → redirect URI `https://developers.google.com/oauthplayground`.
4. <https://developers.google.com/oauthplayground> → ⚙ → *Use your own OAuth credentials* → scope
   `https://www.googleapis.com/auth/youtube.force-ssl` (posts videos, Shorts and comment replies, reads subscribers) → Authorize (choose the Sunverse channel) → Exchange → copy the refresh token.
5. Repo secrets: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.

Until Google audits the API project, YouTube keeps API uploads **private**; the tile then says so and links to
YouTube Studio, where one click makes it public.

Song videos need **no GitHub secrets**: the renderer signs in with GitHub OIDC; without `GEMINI_API_KEY` it uses free
faster-whisper + the cloud brain + Cloudflare FLUX images and skips the spend approval.

Optional instant start: add Cloudflare Worker secret `GH_DISPATCH_TOKEN` (GitHub fine-grained token for this repo with
**Actions: read and write**). Without it the renderer runs every 15 minutes and the time estimate includes that wait.

## Foliocraft lead generation + outreach

Leads page → **Foliocraft · Lead Generation & Outreach**. Every 6 h `scripts/leadgen.py` finds people who need a
portfolio site and published contact details (HN "Who wants to be hired?", HN "Seeking freelancer" portfolio
requests, Foliocraft posts from the lead radar), and the cloud brain scores them and writes a personal email
(A/B subjects + one follow-up). You approve; the agent sends from your Gmail (daily cap, Mon–Sat 9:30–19:30 IST,
unsubscribe line, one follow-up after 4 days, stops on reply/unsubscribe/bounce) and shows replies in the inbox.
Personal data is kept only in the Worker's private KV.

Gmail: in the same Google Cloud project as YouTube enable the **Gmail API**, then in the OAuth Playground authorize
`https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/gmail.readonly` with your own
client, exchange, and save the refresh token as repo secret `GMAIL_REFRESH_TOKEN` (plus `YT_CLIENT_ID`, `YT_CLIENT_SECRET`).

## VANI voice — natural Indian female voice (Sarvam Bulbul)

VANI keeps her existing mic, transcript, settings and brain. Only her **voice** can now come from Sarvam AI's
Bulbul model (Hindi, Hinglish, Indian English) through this Worker:

```
mic (browser speech recognition, free) → VANI brain (existing chain: Claude/Groq/Gemini/OpenRouter/free/rule brain)
  → reply (screen, Roman Hinglish) + say (voice script: Hindi in Devanagari, English words kept)
  → POST /api/vani/tts (owner token) → Worker adds SARVAM_API_KEY → Sarvam → MP3 → plays sentence by sentence
```

**Setup (one time)**
1. Sign up at <https://dashboard.sarvam.ai> → API keys → create a key.
2. Cloudflare → Workers & Pages → `agentverse` → Settings → Variables and Secrets → **Secret** `SARVAM_API_KEY`.
3. Open AGENTVERSE → Settings → Voice → *Voice engine: Auto* → pick **Sarvam voice** (Simran / Ishita / Priya …) → **Preview voice** to compare.

**Settings (wrangler.jsonc vars, all optional):** `VANI_VOICE_PROVIDER` (`sarvam` | `device`), `VANI_LANGUAGE` (`hi-IN`),
`VANI_SPEECH_RATE` (`1.0`), `VANI_AUTO_PLAY`, `VANI_INTERRUPT_ENABLED`, `VANI_VOICE_PERSONALITY`,
`VANI_SARVAM_MODEL` (`bulbul:v3`), `VANI_SARVAM_SPEAKER` (`simran`), `VANI_SARVAM_SPEAKERS` (allowlist),
`VANI_TTS_DAILY_CHARS` (`5000`), `VANI_TTS_MAX_CHARS` (`900`). Model and speaker ids must match Sarvam's current list:
<https://docs.sarvam.ai/api-reference/text-to-speech/convert> (bulbul:v3 speakers include simran, ishita, priya, ritu, kavya, shreya).

**Free-tier limits (checked on docs.sarvam.ai, Nov 2026)**
- Sarvam has **no permanent free tier**: new verified accounts get **₹100 of credits** (they don't expire). After that TTS is
  pay-as-you-go: bulbul:v3 **₹3 per 1,000 characters**, bulbul:v4-flash ₹1 per 1,000. A typical VANI reply is ~100–200 characters.
- When the credits run out Sarvam answers 402: VANI shows *"Sarvam credits are used up"* and speaks with the **free device
  voice**. She never switches to another paid provider.
- `VANI_TTS_DAILY_CHARS` (default 5000 ≈ ₹15/day on v3) is a hard daily cap enforced in the Worker; resets 05:30 IST.
- Repeated phrases (greetings, the opening brief) are cached in KV for 14 days and cost nothing the second time.
- Sarvam allows 60 requests/minute; text up to 2500 characters per request (VANI sends one sentence group at a time).
- Mic input uses the browser's speech recognition (free; Chrome/Edge send audio to Google for recognition; not available in Firefox).
- Sarvam announced that **bulbul:v3 voice agents reach end of life on 10 Nov 2026** and recommends Bulbul v4. VANI calls the
  REST TTS endpoint, which still lists bulbul:v3. To move, set `VANI_SARVAM_MODEL=bulbul:v4-flash` and a matching v4 persona
  speaker list (e.g. `simran_enhi_companion,ishita_enhi_companion,sanchita_enhi_companion`), then Preview.

**Security:** the key exists only as a Cloudflare secret; `/api/vani/*` needs the owner token; speakers are allowlisted;
text is capped per request and per day. Only the reply text VANI is about to speak is sent to Sarvam.

**Tests:** `node --test mcp/test/server.test.mjs` (includes the VANI proxy test with Sarvam mocked).
