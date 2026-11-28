// Connect YouTube from inside AGENTVERSE (no script, no GitHub secret editing).
// The owner saves a Google OAuth "Web application" client once, taps Connect, signs in with the Sunverse
// account, and Google sends the code back to /api/youtube/callback. The refresh token stays server-side in KV:
// it is never sent to the browser. GitHub runners fetch it through the runner-authenticated endpoint.
const APP = 'yt/oauth-app';
const TOK = 'yt/oauth-token';
const STATE = 'yt/oauth-state/';
export const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl';

export class YtAuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const redirectUri = (origin) => `${String(origin).replace(/\/$/, '')}/api/youtube/callback`;

export async function status(kv, origin) {
  const app = await kv.get(APP, 'json');
  const tok = await kv.get(TOK, 'json');
  return {
    redirect_uri: redirectUri(origin),
    app_set: Boolean(app?.client_id && app?.client_secret),
    client_id: app?.client_id || null, // a client id is not secret; the secret is never returned
    app_saved_at: app?.at || null,
    connected: Boolean(tok?.refresh_token),
    channel: tok?.channel || null,
    connected_at: tok?.at || null,
    last_error: tok?.error || null,
  };
}

export async function saveApp(kv, body) {
  const client_id = String(body?.client_id || '').trim();
  let client_secret = String(body?.client_secret || '').trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(client_id)) throw new YtAuthError(400, 'Client ID should end with .apps.googleusercontent.com');
  const old = await kv.get(APP, 'json');
  // "keep the saved secret" only makes sense for the same client: a new client always needs its own secret
  if (!client_secret && body?.keep_secret && old?.client_secret) {
    if (old.client_id !== client_id) throw new YtAuthError(400, 'A new Client ID needs its own Client secret');
    client_secret = old.client_secret;
  }
  if (client_secret.length < 10 || /\s/.test(client_secret)) throw new YtAuthError(400, 'Client secret looks wrong');
  await kv.put(APP, JSON.stringify({ client_id, client_secret, at: new Date().toISOString() }));
  // a token belongs to the client that made it: a new client needs a new sign-in
  if (old?.client_id && old.client_id !== client_id) await kv.delete(TOK);
  return { ok: true };
}

export async function start(kv, origin) {
  const app = await kv.get(APP, 'json');
  if (!app?.client_id) throw new YtAuthError(409, 'Save the Google OAuth client first');
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const state = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  await kv.put(STATE + state, '1', { expirationTtl: 900 });
  const q = new URLSearchParams({ client_id: app.client_id, redirect_uri: redirectUri(origin), response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` };
}

export async function callback(kv, origin, params, fetchImpl = fetch) {
  const state = params.get('state') || '';
  if (!/^[0-9a-f]{48}$/.test(state) || !(await kv.get(STATE + state))) throw new YtAuthError(400, 'This sign-in link expired. Tap Connect YouTube again.');
  await kv.delete(STATE + state);
  if (params.get('error')) throw new YtAuthError(400, `Google said: ${params.get('error')}`);
  const code = params.get('code');
  if (!code) throw new YtAuthError(400, 'Google did not send a code');
  const app = await kv.get(APP, 'json');
  if (!app?.client_id) throw new YtAuthError(409, 'Save the Google OAuth client first');
  const r = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: app.client_id, client_secret: app.client_secret, redirect_uri: redirectUri(origin), grant_type: 'authorization_code' }).toString(),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) throw new YtAuthError(400, `Google sign-in failed: ${t.error_description || t.error || 'HTTP ' + r.status}`);
  if (!t.refresh_token) throw new YtAuthError(400, 'Google did not return a long-lived token. Remove AGENTVERSE at myaccount.google.com/permissions, then connect again.');
  // prove it works and record which channel it posts to
  let channel = null;
  const c = await fetchImpl('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { authorization: `Bearer ${t.access_token}` } });
  const cj = await c.json().catch(() => ({}));
  const it = cj.items && cj.items[0];
  if (!it) throw new YtAuthError(400, 'That Google account has no YouTube channel. Sign in with the Sunverse account.');
  channel = { id: it.id, title: it.snippet?.title || '' };
  await kv.put(TOK, JSON.stringify({ refresh_token: t.refresh_token, scope: t.scope || SCOPES, channel, at: new Date().toISOString() }));
  return { ok: true, channel };
}

// Forget the Google client (and the login made with it) so a new client can be added.
export async function removeApp(kv) { await kv.delete(APP); await kv.delete(TOK); return { ok: true }; }

export async function disconnect(kv) { await kv.delete(TOK); return { ok: true }; }

// For GitHub runners only (runner auth): the credentials the YouTube steps use.
export async function runnerCredentials(kv) {
  const app = await kv.get(APP, 'json');
  const tok = await kv.get(TOK, 'json');
  if (!app?.client_id || !tok?.refresh_token) return { connected: false };
  return { connected: true, client_id: app.client_id, client_secret: app.client_secret, refresh_token: tok.refresh_token, channel: tok.channel };
}
