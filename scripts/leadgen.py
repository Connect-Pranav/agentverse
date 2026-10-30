#!/usr/bin/env python3
"""Foliocraft lead generation + email outreach (agent: foliocraft_leadgen_agent). Runs hourly on GitHub Actions.

Find (every 6 h): people who need a portfolio website and published a way to reach them —
  * Hacker News "Ask HN: Who wants to be hired?" (job seekers list their email; no/weak personal site = need)
  * Hacker News "Seeking freelancer" posts asking for a portfolio / personal website
  * Foliocraft posts already in data/leads.json (Reddit, Google Alerts…) — no email, owner replies with 1 tap
Enrich: AGENTVERSE cloud brain → name, role/industry, company, location, persona, intent, 0-100 score,
  personal email (two subject lines for A/B) and one short follow-up.
Outreach (owner-approved leads only): Gmail API, plain text, daily cap, sending window, unsubscribe line,
  one follow-up in the same thread, stop on reply / unsubscribe / bounce.
Everything is stored in the Worker's private KV — nothing personal is written to the repository.

Env: SV_MCP_URL (optional) and GitHub OIDC (or SV_MCP_TOKEN) for the Worker; Gmail: YT_CLIENT_ID,
YT_CLIENT_SECRET and GMAIL_REFRESH_TOKEN (scopes gmail.send + gmail.readonly). FIND=1 forces a search.
"""
import base64, datetime, html, importlib.util, json, os, re, sys, time, urllib.parse
from email.message import EmailMessage
from email.utils import make_msgid

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("svr", os.path.join(HERE, "songvideo-runner.py"))
svr = importlib.util.module_from_spec(_s)
_s.loader.exec_module(svr)
http, worker, redact = svr.http, svr.ganesha, svr.redact

IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
MAX_NEW = 40
PER_RUN_SEND = 4
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def log(*a):
    print("[leadgen]", *a, flush=True)


# ---------------- find ----------------
def hn_json(url):
    return http("GET", url, None, None, 60)


def deobfuscate(t):
    t = html.unescape(t)
    t = re.sub(r"\s*(\[|\(|\{)\s*at\s*(\]|\)|\})\s*|\s+at\s+(?=[\w-]+\s*(\[|\(|\{)?\s*dot)", "@", t, flags=re.I)
    t = re.sub(r"\s*(\[|\(|\{)\s*dot\s*(\]|\)|\})\s*|\s+dot\s+", ".", t, flags=re.I)
    return t


def strip(t):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(t or ""))).strip()


def thread(title_re):
    s = hn_json("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=12")
    st = next((h for h in s.get("hits", []) if re.search(title_re, h.get("title") or "", re.I)), None)
    if not st:
        return None, []
    c = hn_json(f"https://hn.algolia.com/api/v1/search?tags=comment,story_{st['objectID']}&hitsPerPage=1000")
    return st, [h for h in c.get("hits", []) if not h.get("parent_id") or str(h.get("parent_id")) == str(st["objectID"])]


PORTFOLIO_WORDS = re.compile(r"portfolio|personal (web)?site|personal brand|landing page|resume (web)?site|showcase (my|your) work", re.I)


def find_leads(known):
    out = []
    try:  # job seekers with a public email
        st, hits = thread(r"who wants to be hired")
        for h in hits:
            raw = h.get("comment_text") or ""
            text = strip(deobfuscate(raw))
            emails = [e for e in EMAIL_RE.findall(text) if not e.lower().endswith(("example.com", "domain.com"))]
            iid = "hnw_" + str(h["objectID"])
            if not emails or iid in known:
                continue
            urls = re.findall(r"https?://[^\s<>\"')]+", html.unescape(raw))
            own = [u for u in urls if not re.search(r"github\.com|linkedin\.com|news\.ycombinator|docs\.google|drive\.google|dropbox|x\.com|twitter\.com", u)]
            linkedin = next((u for u in urls if "linkedin.com/in" in u), "")
            out.append({"id": iid, "source": "HN · Who wants to be hired", "url": f"https://news.ycombinator.com/item?id={h['objectID']}",
                        "email": emails[0], "linkedin": linkedin, "website": own[0] if own else "", "posted": h.get("created_at", ""),
                        "text": text[:1500], "has_site": bool(own)})
        log(f"who-wants-to-be-hired: {len(out)} with email" + (f" ({st['title']})" if st else ""))
    except Exception as e:
        log("HN hired thread failed:", redact(e))
    try:  # people hiring someone to build a portfolio / personal site
        st, hits = thread(r"seeking freelancer")
        n0 = len(out)
        for h in hits:
            raw = h.get("comment_text") or ""
            text = strip(deobfuscate(raw))
            iid = "hnf_" + str(h["objectID"])
            if iid in known or not re.search(r"seeking freelancer", text, re.I) or not PORTFOLIO_WORDS.search(text):
                continue
            emails = EMAIL_RE.findall(text)
            out.append({"id": iid, "source": "HN · Seeking freelancer", "url": f"https://news.ycombinator.com/item?id={h['objectID']}",
                        "email": emails[0] if emails else "", "posted": h.get("created_at", ""), "text": text[:1500], "has_site": None})
        log(f"seeking-freelancer: {len(out) - n0} portfolio requests")
    except Exception as e:
        log("HN freelancer thread failed:", redact(e))
    try:  # posts already found by the lead radar (no email → 1-tap reply on the post)
        data = json.load(open(os.path.join(HERE, "..", "data", "leads.json")))
        n0 = len(out)
        for l in data.get("leads", []):
            if "Foliocraft" not in (l.get("products") or [l.get("product")]) or ("r_" + l["id"]) in known:
                continue
            out.append({"id": "r_" + l["id"], "source": l.get("source", "web"), "url": l.get("url", ""), "email": "", "posted": l.get("created", ""),
                        "text": (l.get("title", "") + " — " + l.get("text", ""))[:1500], "name_hint": l.get("author", ""), "has_site": None})
        log(f"lead radar posts: {len(out) - n0}")
    except Exception as e:
        log("lead radar file not read:", redact(e))
    # fresh first, then those that clearly lack a site
    out.sort(key=lambda x: (x.get("has_site") is True, x.get("posted") or ""), reverse=False)
    out.sort(key=lambda x: x.get("posted") or "", reverse=True)
    return out[:MAX_NEW]


# ---------------- enrich ----------------
SYS = """You are the growth agent for Foliocraft, a portfolio-website builder (people get a polished personal portfolio site fast; premium features are paid).
For each lead (a public post) return JSON {"leads":[...]} with one object per input id:
{"id","name":"first + last name if stated, else first name or handle","industry":"role / field, e.g. Frontend developer, UX designer, Data analyst","company":"current or last company if stated","location","persona":"one sentence: who they are and what they want",
 "intent":"high|medium|low|none","score":0-100,"why":"max 15 words: why they would want a portfolio site now",
 "subject":"email subject A, max 7 words, specific to them, no clickbait","subject_b":"subject B, a different angle, max 7 words",
 "body":"plain-text email, 70-110 words, in English: greet by first name, mention exactly where you saw them and one concrete detail from their post, one sentence on how a strong portfolio site helps THEIR goal, one sentence on what Foliocraft does, a soft question as the call to action. No hype, no fake claims, no discounts, no links, no signature.",
 "followup":"plain-text follow-up, 35-50 words, polite, adds one new useful point, no guilt"}
Scoring: job seekers without their own site/portfolio score higher; designers/developers/creatives higher; people explicitly asking for a portfolio or personal website = high intent; recruiters, agencies, people selling services, or posts unrelated to needing a site = score under 20 and intent none."""


def enrich(batch):
    prompt = "LEADS:\n" + "\n".join(json.dumps({"id": l["id"], "source": l["source"], "has_own_site": l.get("has_site"), "handle": l.get("name_hint", ""), "post": l["text"][:900]}) for l in batch)
    r = worker("POST", "/api/brain", {"system": SYS + "\nReturn ONLY JSON.", "prompt": prompt}, timeout=180)
    t = re.sub(r"```(json)?", "", str(r.get("text") or ""))
    a, b = t.find("{"), t.rfind("}")
    data = json.loads(t[a:b + 1]) if a >= 0 else {}
    return {x.get("id"): x for x in data.get("leads", []) if isinstance(x, dict)}


# ---------------- Gmail ----------------
G = "https://gmail.googleapis.com/gmail/v1/users/me"


def gmail_token():
    cid, sec = os.environ.get("YT_CLIENT_ID", "").strip(), os.environ.get("YT_CLIENT_SECRET", "").strip()
    rt = (os.environ.get("GMAIL_REFRESH_TOKEN") or "").strip()
    if not (cid and sec and rt):
        return None
    body = urllib.parse.urlencode({"client_id": cid, "client_secret": sec, "refresh_token": rt, "grant_type": "refresh_token"}).encode()
    return http("POST", "https://oauth2.googleapis.com/token", body, {"content-type": "application/x-www-form-urlencoded"}, 60).get("access_token")


def g(token, method, path, body=None):
    return http(method, G + path, body, {"authorization": f"Bearer {token}"}, 60)


UNSUB = "\n\n—\nIf you'd rather not get emails about this, just reply \"unsubscribe\" and I won't write again."


def send(token, me, to, subject, body, thread_id=None, in_reply_to=None):
    m = EmailMessage()
    m["To"] = to
    m["From"] = me
    m["Subject"] = subject
    m["Message-ID"] = make_msgid(domain=me.split("@")[-1])
    m["List-Unsubscribe"] = f"<mailto:{me}?subject=unsubscribe>"
    if in_reply_to:
        m["In-Reply-To"] = in_reply_to
        m["References"] = in_reply_to
    m.set_content(body)
    raw = base64.urlsafe_b64encode(m.as_bytes()).decode()
    payload = {"raw": raw}
    if thread_id:
        payload["threadId"] = thread_id
    r = g(token, "POST", "/messages/send", payload)
    return r.get("id"), r.get("threadId"), m["Message-ID"]


def in_window():
    n = datetime.datetime.now(IST)
    return n.weekday() < 6 and (9, 30) <= (n.hour, n.minute) <= (19, 30)


# ---------------- main ----------------
def main():
    st = worker("GET", "/api/crm/runner")
    rep = {"upserts": [], "sent": [], "replies": [], "bounced": [], "failed": []}
    known = set(st.get("known") or [])
    sup = set(st.get("suppress") or [])

    hour = datetime.datetime.utcnow().hour
    if os.environ.get("FIND") == "1" or hour % 6 == 0 or not known:
        leads = [l for l in find_leads(known) if (l.get("email") or "").lower() not in sup]
        for i in range(0, len(leads), 8):
            batch = leads[i:i + 8]
            try:
                info = enrich(batch)
            except Exception as e:
                log("enrich failed:", redact(e))
                continue
            for l in batch:
                x = info.get(l["id"])
                if not x or (x.get("intent") == "none") or int(x.get("score") or 0) < 25:
                    continue
                sig = st["settings"].get("signature") or "— Team Foliocraft"
                url = st["settings"].get("productUrl") or ""
                body = (x.get("body") or "").strip()
                if body:
                    body += ("\n\nYou can see it here: " + url if url else "") + "\n\n" + sig
                rep["upserts"].append({**{k: x.get(k, "") for k in ("name", "industry", "company", "location", "persona", "intent", "why", "subject", "subject_b", "followup")},
                                       "id": l["id"], "product": "Foliocraft", "source": l["source"], "url": l["url"], "posted": l.get("posted", ""),
                                       "email": l.get("email", ""), "website": l.get("website", ""), "linkedin": l.get("linkedin", ""),
                                       "score": x.get("score", 0), "body": body, "excerpt": l["text"][:600]})
        log(f"{len(rep['upserts'])} qualified leads")

    token = None
    try:
        token = gmail_token()
    except Exception as e:
        rep["error"] = "Gmail sign-in failed: " + redact(e)
    if token:
        me = g(token, "GET", "/profile").get("emailAddress", "")
        # replies / unsubscribes / bounces
        for w in st.get("watch") or []:
            try:
                t = g(token, "GET", f"/threads/{w['threadId']}?format=metadata&metadataHeaders=From&metadataHeaders=Subject")
                for msg in t.get("messages", [])[1:]:
                    frm = next((h["value"] for h in msg.get("payload", {}).get("headers", []) if h["name"].lower() == "from"), "")
                    if me.lower() in frm.lower():
                        continue
                    snip = html.unescape(msg.get("snippet", ""))
                    if re.search(r"mailer-daemon|mail delivery subsystem|postmaster", frm, re.I):
                        rep["bounced"].append({"id": w["id"]})
                    else:
                        rep["replies"].append({"id": w["id"], "snippet": snip[:400], "unsubscribe": bool(re.search(r"\bunsubscribe\b|stop emailing|remove me", snip, re.I)),
                                               "at": datetime.datetime.utcfromtimestamp(int(msg.get("internalDate", "0")) / 1000).isoformat() + "Z"})
                    break
            except Exception as e:
                log("thread check failed:", redact(e))
        replied = {r["id"] for r in rep["replies"]} | {b["id"] for b in rep["bounced"]}
        if in_window():
            n = 0
            for l in st.get("to_send") or []:
                if n >= PER_RUN_SEND:
                    break
                d = l.get("draft") or {}
                subj = (d.get("subject_b") if l.get("variant") == "B" and d.get("subject_b") else d.get("subject")) or "Your portfolio"
                try:
                    mid, tid, msgid = send(token, me, l["email"], subj, d["body"] + UNSUB)
                    rep["sent"].append({"id": l["id"], "threadId": tid, "messageId": msgid})
                    n += 1
                    time.sleep(20)
                except Exception as e:
                    rep["failed"].append({"id": l["id"], "error": redact(e)})
            for l in st.get("followups") or []:
                if n >= PER_RUN_SEND or l["id"] in replied:
                    continue
                d = l.get("draft") or {}
                if not d.get("followup"):
                    continue
                try:
                    subj = "Re: " + ((d.get("subject") or "Your portfolio"))
                    body = d["followup"] + "\n\n" + (st["settings"].get("signature") or "— Team Foliocraft") + UNSUB
                    mid, tid, msgid = send(token, me, l["email"], subj, body, l.get("threadId"), l.get("messageId"))
                    rep["sent"].append({"id": l["id"], "threadId": tid, "messageId": l.get("messageId"), "followup": True})
                    n += 1
                    time.sleep(20)
                except Exception as e:
                    log("follow-up failed:", redact(e))
            log(f"emails sent: {n}")
        else:
            log("outside the sending window (Mon–Sat 9:30–19:30 IST) — not sending now")
    elif st.get("to_send"):
        rep["error"] = rep.get("error") or "Gmail not connected: add GMAIL_REFRESH_TOKEN (scopes gmail.send + gmail.readonly) and YT_CLIENT_ID / YT_CLIENT_SECRET"
    worker("POST", "/api/crm/runner/report", rep)
    log("reported:", {k: len(v) for k, v in rep.items() if isinstance(v, list)})


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log("failed:", redact(e))
        try:
            worker("POST", "/api/crm/runner/report", {"error": redact(e)})
        except Exception:
            pass
        sys.exit(1)
