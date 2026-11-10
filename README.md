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
3. Deploy → live at `https://agentverse.pravanigroup.workers.dev`. Every new commit redeploys automatically.

## Telegram 1-Click Mobile Approvals (Optional)
Manage your agency and review agent drafts on your phone with one tap:
1. Create a bot via [@BotFather](https://t.me/BotFather) → copy `TELEGRAM_BOT_TOKEN`.
2. Get your numeric ID from [@userinfobot](https://t.me/userinfobot) → `TELEGRAM_CHAT_ID`.
3. Cloudflare Worker → Settings → Variables and Secrets → add **secret** `TELEGRAM_BOT_TOKEN` and var `TELEGRAM_CHAT_ID`.
4. Set the webhook in your browser:
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-worker>.workers.dev/api/telegram/webhook`
5. You'll now receive instant interactive cards with `[✅ Approve]` and `[❌ Reject]` buttons whenever an agent produces content or when a song video is ready for review!

## Optional secrets (Settings → Secrets → Actions)
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` — free "script" app at reddit.com/prefs/apps. Strongly recommended: Reddit often blocks GitHub servers without it.
- `GEMINI_API_KEY` — AI re-scores leads by buying intent.

## Rules
Agents never post or message anyone on their own. Everything public waits in the approval queue.
Reply to leads yourself from the "Open" link. No LinkedIn/Instagram scraping (against their terms).
