// Web Push for the AGENTVERSE app (Android Chrome / installed PWA): notifications even when the app is closed.
// Pushes carry no payload (so no message encryption is needed): the service worker wakes up, fetches the
// newest messages from /api/push/inbox/<inbox-key> and shows them. VAPID keys are generated once and kept in KV.

const KEYS = 'push/vapid';
const SUBS = 'push/subs';
const INBOX = 'push/inbox';
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

async function vapid(kv) {
  let k = await kv.get(KEYS, 'json');
  if (k) return k;
  const p = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  k = { priv: await crypto.subtle.exportKey('jwk', p.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', p.publicKey)) };
  await kv.put(KEYS, JSON.stringify(k));
  return k;
}
export async function publicKey(kv) { return (await vapid(kv)).pub; }

export async function subscribe(kv, sub) {
  const ep = String(sub?.endpoint ?? '');
  if (!/^https:\/\/[^\s]+$/.test(ep) || ep.length > 1000) throw Object.assign(new Error('invalid subscription'), { status: 400 });
  const list = ((await kv.get(SUBS, 'json')) ?? []).filter((s) => s.endpoint !== ep);
  const inbox = crypto.randomUUID().replace(/-/g, '');
  list.push({ endpoint: ep, inbox, at: nowIso() });
  await kv.put(SUBS, JSON.stringify(list.slice(-10)));
  return { inbox };
}

export async function inbox(kv, key) {
  const subs = (await kv.get(SUBS, 'json')) ?? [];
  if (!subs.some((s) => s.inbox === key)) return null;
  return ((await kv.get(INBOX, 'json')) ?? []).slice(0, 5);
}

async function jwt(k, aud) {
  const key = await crypto.subtle.importKey('jwk', k.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const h = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const p = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:agentverse@users.noreply.github.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

/** Queue a notification and wake every subscribed device. Never throws (best effort). */
export async function notify(kv, msg) {
  try {
    const m = { id: crypto.randomUUID(), title: String(msg.title ?? 'AGENTVERSE').slice(0, 80), body: String(msg.body ?? '').slice(0, 240), url: String(msg.url ?? '/').slice(0, 300), tag: String(msg.tag ?? '').slice(0, 60), at: nowIso() };
    await kv.put(INBOX, JSON.stringify([m, ...((await kv.get(INBOX, 'json')) ?? [])].slice(0, 20)));
    const subs = (await kv.get(SUBS, 'json')) ?? [];
    if (!subs.length) return 0;
    const k = await vapid(kv);
    const gone = [];
    let sent = 0;
    for (const s of subs) {
      const u = new URL(s.endpoint);
      const r = await fetch(s.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'high', Authorization: `vapid t=${await jwt(k, u.origin)}, k=${k.pub}`, 'Content-Length': '0' } }).catch(() => null);
      if (r && (r.status === 404 || r.status === 410)) gone.push(s.endpoint);
      else if (r && r.ok) sent++;
    }
    if (gone.length) await kv.put(SUBS, JSON.stringify(subs.filter((s) => !gone.includes(s.endpoint))));
    return sent;
  } catch (e) {
    console.error('push', e?.message);
    return 0;
  }
}
