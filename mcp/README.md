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
