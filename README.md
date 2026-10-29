# AGENTVERSE

Autonomous social media & growth agent team + VANI voice agent + free lead scraper.

## Files
- `index.html` — the dashboard (GitHub Pages)
- `leads.config.json` — your products, keywords, subreddits (edit this)
- `scraper/scrape.mjs` — lead scraper (Reddit, Hacker News, RSS)
- `.github/workflows/leads.yml` — runs the scraper every 6 hours, free
- `data/leads.json` — scraped leads (the dashboard reads this)

## Setup (one time)
1. New public repo `AGENTVERSE` → upload all files keeping folders (drag the whole unzipped folder).
2. Settings → Pages → Deploy from branch → `main` / root.
3. Settings → Actions → General → Workflow permissions → **Read and write**.
4. Actions tab → "AGENTVERSE lead scraper" → **Run workflow** (first scrape).
5. Open the Pages link → ⚙ settings → paste a free Gemini key (aistudio.google.com) → Save → turn on Autopilot.

## Cloudflare (free, auto-updates on every commit)
1. Cloudflare dashboard → Workers & Pages → Create → **Import a repository** → GitHub → `agentverse`.
2. Project name `agentverse`, build command: (leave empty), deploy command: `npx wrangler deploy`.
3. Deploy → live at `https://agentverse.pravanigroup.workers.dev`. Every new commit (including the 6-hourly leads update) redeploys automatically.

## Optional secrets (Settings → Secrets → Actions)
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` — free "script" app at reddit.com/prefs/apps. Strongly recommended: Reddit often blocks GitHub servers without it.
- `GEMINI_API_KEY` — AI re-scores leads by buying intent.

## Rules
Agents never post or message anyone on their own. Everything public waits in the approval queue.
Reply to leads yourself from the "Open" link. No LinkedIn/Instagram scraping (against their terms).
