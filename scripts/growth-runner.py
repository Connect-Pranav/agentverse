#!/usr/bin/env python3
"""SUNVERSE growth agent (agent: sunverse_growth_agent). Runs hourly on GitHub Actions.

1. Reads channel stats and the newest PUBLIC subscribers (YouTube Data API, owner OAuth).
2. Finds new viewer comments on the channel, drafts a short reply in the commenter's language with the
   AGENTVERSE cloud brain (or Gemini), and sorts each one:
     simple   = thanks / praise / greeting → posted automatically when "auto-send simple replies" is on
     needs_ok = questions, collabs, criticism, anything with money/links → waits for the owner
     skip     = spam / self-promo / abuse → no reply
3. Posts replies the owner approved in AGENTVERSE, then reports everything to the Worker.

Env: SV_MCP_URL, SV_MCP_TOKEN, YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (scope youtube.force-ssl);
optional GEMINI_API_KEY (fallback brain).
"""
import importlib.util, json, os, re, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("svr", os.path.join(HERE, "songvideo-runner.py"))
svr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(svr)
http, worker, yt_token, redact = svr.http, svr.ganesha, svr.yt_token, svr.redact

MAX_NEW = 20       # comments drafted per run
MAX_POSTS = 15     # replies posted per run (50 quota units each)
API = "https://www.googleapis.com/youtube/v3/"


def log(*a):
    print("[growth]", *a, flush=True)


def yt(token, path, params=None, body=None, method="GET"):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    return http(method, url, body, {"authorization": f"Bearer {token}"}, 60)


SYS = ("You are the community manager of SUNVERSE, an independent Hindi/Hinglish music channel (lyrics by COCO, singer KoBhit). "
       "For each viewer comment write a warm, human reply in the SAME language and script the viewer used (Hinglish in Roman letters if they used Hinglish), "
       "1-2 short sentences, at most one emoji, use their first name when it looks like a real name, no links, no hashtags, no promises of money, collabs or dates, "
       "never ask for subscribers in a pushy way (a light 'stay tuned' is fine only when it fits). "
       "Classify each: simple = thanks, praise, greetings, emojis, 'nice song' type; needs_ok = questions, requests, collab/business, criticism, personal or sensitive topics, "
       "anything you are not sure about; skip = spam, self-promotion, scams, links, abuse. For skip use an empty reply. "
       'Return JSON only: {"items":[{"cid":"...","kind":"simple|needs_ok|skip","reply":"..."}]}')


def brain(prompt):
    try:
        r = worker("POST", "/api/brain", {"system": SYS, "prompt": prompt}, timeout=120)
        return svr_parse(r.get("text"))
    except Exception as e:
        log("cloud brain failed:", redact(e))
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("no brain available (cloud brain failed and GEMINI_API_KEY is not set)")
    models = svr.pick_text_model(svr.gemini_models())
    last = None
    for m in models[:3]:
        try:
            r = http("POST", f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={key}",
                     {"systemInstruction": {"parts": [{"text": SYS}]}, "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                      "generationConfig": {"responseMimeType": "application/json", "temperature": 0.7}}, None, 120)
            return svr_parse("".join(p.get("text", "") for p in r["candidates"][0]["content"]["parts"]))
        except Exception as e:
            last = e
    raise last


def svr_parse(t):
    t = re.sub(r"```(json)?", "", str(t or ""))
    a, b = t.find("{"), t.rfind("}")
    if a < 0 or b < a:
        raise RuntimeError("brain did not return JSON")
    return json.loads(t[a:b + 1])


RISKY = re.compile(r"https?://|www\.|\.com\b|collab|paisa|money|price|rs\.?\s?\d|₹|\$\d|whatsapp|number|contact|email|sponsor|promote|copyright|stolen|chori", re.I)


def main():
    report = {"drafts": [], "posted": [], "failed": [], "seen": [], "new_subs": []}
    try:
        token = yt_token()
    except Exception as e:
        log(redact(e))
        worker("POST", "/api/growth/runner/report", {"error": redact(e)})
        return
    st = worker("GET", "/api/growth/runner")
    seen, known = set(st.get("seen") or []), set(st.get("known_subs") or [])
    auto = (st.get("settings") or {}).get("autoSimple", True)

    ch = yt(token, "channels", {"part": "snippet,statistics", "mine": "true"})
    if not ch.get("items"):
        raise RuntimeError("this Google account has no YouTube channel — authorize with the Sunverse channel")
    c = ch["items"][0]
    sts = c.get("statistics") or {}
    report["channel"] = {"id": c["id"], "title": c["snippet"]["title"], "subs": int(sts.get("subscriberCount") or 0),
                         "views": int(sts.get("viewCount") or 0), "videos": int(sts.get("videoCount") or 0), "hidden_subs": bool(sts.get("hiddenSubscriberCount"))}
    log(f"channel {c['snippet']['title']}: {report['channel']['subs']} subs")

    try:  # only subscribers who keep their subscriptions public are listed by YouTube
        subs = yt(token, "subscriptions", {"part": "subscriberSnippet", "myRecentSubscribers": "true", "maxResults": 50})
        for it in subs.get("items", []):
            sn = it.get("subscriberSnippet") or {}
            sid = sn.get("channelId")
            if sid and sid not in known:
                report["new_subs"].append({"id": sid, "name": sn.get("title", "")})
        log(f"{len(report['new_subs'])} new public subscribers")
    except Exception as e:
        log("subscribers not read:", redact(e))

    # 1) post replies the owner approved
    posts = 0
    for a in st.get("approved") or []:
        if posts >= MAX_POSTS:
            break
        try:
            yt(token, "comments", {"part": "snippet"}, {"snippet": {"parentId": a["thread_id"], "textOriginal": a["draft"]}}, "POST")
            report["posted"].append({"cid": a["cid"]})
            posts += 1
        except Exception as e:
            report["failed"].append({"cid": a["cid"], "error": redact(e)})

    # 2) new comments → drafts
    threads = yt(token, "commentThreads", {"part": "snippet", "allThreadsRelatedToChannelId": c["id"], "maxResults": 50, "order": "time", "textFormat": "plainText"})
    fresh = []
    for t in threads.get("items", []):
        top = t["snippet"]["topLevelComment"]
        sn = top["snippet"]
        if top["id"] in seen or (sn.get("authorChannelId") or {}).get("value") == c["id"]:
            continue
        fresh.append({"cid": top["id"], "thread_id": t["id"], "author": sn.get("authorDisplayName", "").lstrip("@"), "text": sn.get("textDisplay", "")[:600], "video_id": sn.get("videoId", "")})
        if len(fresh) >= MAX_NEW:
            break
    report["seen"] = [f["cid"] for f in fresh]
    if fresh:
        titles = {}
        ids = sorted({f["video_id"] for f in fresh if f["video_id"]})
        if ids:
            for v in yt(token, "videos", {"part": "snippet", "id": ",".join(ids[:50])}).get("items", []):
                titles[v["id"]] = v["snippet"]["title"]
        prompt = "COMMENTS:\n" + "\n".join(f'- cid={f["cid"]} | video="{titles.get(f["video_id"], "")}" | by {f["author"]}: {f["text"]}' for f in fresh)
        out = {i.get("cid"): i for i in (brain(prompt).get("items") or [])}
        for f in fresh:
            d = out.get(f["cid"]) or {"kind": "needs_ok", "reply": ""}
            kind = d.get("kind") if d.get("kind") in ("simple", "needs_ok", "skip") else "needs_ok"
            reply = re.sub(r"https?://\S+", "", str(d.get("reply") or "")).strip()[:500]
            if kind == "simple" and (RISKY.search(f["text"]) or len(reply) > 220 or not reply):
                kind = "needs_ok"  # safety net: anything risky waits for the owner
            item = {**f, "video_title": titles.get(f["video_id"], ""), "reply": reply, "kind": kind, "posted": False}
            if kind == "simple" and auto and posts < MAX_POSTS:
                try:
                    yt(token, "comments", {"part": "snippet"}, {"snippet": {"parentId": f["thread_id"], "textOriginal": reply}}, "POST")
                    item["posted"] = True
                    posts += 1
                except Exception as e:
                    log("auto reply failed:", redact(e))
                    item["kind"] = "needs_ok"
            report["drafts"].append(item)
    log(f"{len(fresh)} new comments, {posts} replies posted, {sum(1 for d in report['drafts'] if d['kind'] == 'needs_ok')} waiting for approval")
    worker("POST", "/api/growth/runner/report", report)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log("failed:", redact(e))
        try:
            worker("POST", "/api/growth/runner/report", {"error": redact(e)})
        except Exception:
            pass
        sys.exit(1)
