#!/usr/bin/env python3
"""Make a new YouTube refresh token (run on your own computer, never in CI).

  YT_CLIENT_ID=... YT_CLIENT_SECRET=... python3 scripts/yt-refresh-token.py

Opens Google sign-in, then prints the refresh token. Put it in the GitHub repo secret YT_REFRESH_TOKEN.
The OAuth client must be a "Desktop app" client. Set the consent screen to "In production" so the token does not expire after 7 days.
"""
import http.server, json, os, secrets, sys, threading, urllib.parse, urllib.request, webbrowser

SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl"
cid, sec = os.environ.get("YT_CLIENT_ID", "").strip(), os.environ.get("YT_CLIENT_SECRET", "").strip()
if not (cid and sec):
    sys.exit("Set YT_CLIENT_ID and YT_CLIENT_SECRET first.")
state, box = secrets.token_urlsafe(16), {}


class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if q.get("state", [""])[0] == state and "code" in q:
            box["code"] = q["code"][0]
        self.send_response(200); self.send_header("content-type", "text/plain"); self.end_headers()
        self.wfile.write(b"Done. You can close this tab." if box.get("code") else b"No code received.")
        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def log_message(self, *a):
        pass


srv = http.server.HTTPServer(("127.0.0.1", 0), H)
redir = f"http://127.0.0.1:{srv.server_port}"
url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({"client_id": cid, "redirect_uri": redir, "response_type": "code", "scope": SCOPES,
                                                                                  "access_type": "offline", "prompt": "consent", "state": state})
print("Open this URL if the browser does not open:\n" + url)
webbrowser.open(url)
srv.serve_forever()
if not box.get("code"):
    sys.exit("No authorisation code received.")
data = urllib.parse.urlencode({"code": box["code"], "client_id": cid, "client_secret": sec, "redirect_uri": redir, "grant_type": "authorization_code"}).encode()
r = json.load(urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data)))
if not r.get("refresh_token"):
    sys.exit("Google returned no refresh token: " + json.dumps(r))
print("\nYT_REFRESH_TOKEN =", r["refresh_token"])
