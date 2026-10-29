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
