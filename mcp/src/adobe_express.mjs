// Adobe Express API (beta) — Server-to-Server "generate variation" from ONE tagged template.
// Docs: https://developer.adobe.com/firefly-services/docs/express-api/
// One-time manual setup (cannot be automated): build a template in Adobe Express, tag its elements
// with the "Tag Elements" add-on (default tags: company, case_number, theme, problem, lesson),
// then add ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_EXPRESS_TEMPLATE_ID (+ optional
// ADOBE_EXPRESS_PROJECT_ID, ADOBE_TAG_MAP) as Worker secrets/vars. Nothing is invented: any missing
// piece or API error is returned as a status + error, never a fake URL.

const IMS = 'https://ims-na1.adobelogin.com/ims/token/v3';
const API = 'https://express-api.adobe.io';
let tokenCache = { token: null, exp: 0 };

export function adobeConfigured(env) {
  return Boolean(env.ADOBE_CLIENT_ID && env.ADOBE_CLIENT_SECRET && env.ADOBE_EXPRESS_TEMPLATE_ID);
}

async function getToken(env, fetchImpl) {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const r = await fetchImpl(IMS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.ADOBE_CLIENT_ID,
      client_secret: env.ADOBE_CLIENT_SECRET,
      scope: 'openid,AdobeID,ee.express_api',
    }).toString(),
  });
  if (!r.ok) throw new Error(`Adobe IMS token HTTP ${r.status}: ${String(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in || 3600) - 60) * 1000 };
  return tokenCache.token;
}

const hdr = (env, token) => ({ Authorization: `Bearer ${token}`, 'X-API-KEY': env.ADOBE_CLIENT_ID, 'Content-Type': 'application/json' });

// Default mapping: tag name -> value. Only tags that really exist on the template are sent.
function defaultValues(c) {
  return {
    company: c.company,
    case_number: `CASE #${c.caseNumber}`,
    theme: c.theme,
    period: c.period,
    industry: c.industry,
    problem: c.documentedProblem,
    lesson: c.postAngle,
  };
}

// Returns { status, project_id, url, thumbnail, job_id, error }.
// status: ADOBE_EXPRESS_NOT_CONFIGURED | CREATED | FAILED
export async function generateCaseDesign(env, caseData, fetchImpl = fetch, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), polls = 10 } = {}) {
  if (!adobeConfigured(env)) {
    return { status: 'ADOBE_EXPRESS_NOT_CONFIGURED', error: 'Set ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET and ADOBE_EXPRESS_TEMPLATE_ID (Adobe Developer Console S2S credential + a tagged Express template).' };
  }
  try {
    const token = await getToken(env, fetchImpl);
    const tmplId = env.ADOBE_EXPRESS_TEMPLATE_ID;

    // 1. read the template's real tags so we never send an unknown tag
    const tr = await fetchImpl(`${API}/beta/tagged-documents/${encodeURIComponent(tmplId)}`, { headers: hdr(env, token) });
    if (!tr.ok) throw new Error(`template lookup HTTP ${tr.status}: ${String(await tr.text()).slice(0, 200)}`);
    const tj = await tr.json();
    const tags = new Map();
    for (const p of tj.documentPages || []) for (const e of p.taggedElements || []) tags.set(e.name, e.type);

    let map = defaultValues(caseData);
    if (env.ADOBE_TAG_MAP) { try { map = { ...map, ...JSON.parse(env.ADOBE_TAG_MAP) }; } catch { /* ignore bad JSON */ } }
    const tagMappings = {};
    for (const [k, v] of Object.entries(map)) if (tags.get(k) === 'text' && v) tagMappings[k] = String(v);
    if (!Object.keys(tagMappings).length) throw new Error(`template has no matching text tags (found: ${[...tags.keys()].join(', ') || 'none'})`);

    // 2. generate the variation
    const variationDetails = { preferredDocumentName: `Case ${caseData.caseNumber} - ${caseData.company}`.slice(0, 100), tagMappings };
    if (env.ADOBE_EXPRESS_PROJECT_ID) variationDetails.projectId = env.ADOBE_EXPRESS_PROJECT_ID;
    const gr = await fetchImpl(`${API}/beta/generate-variation`, { method: 'POST', headers: hdr(env, token), body: JSON.stringify({ id: tmplId, variationDetails }) });
    if (!gr.ok) throw new Error(`generate-variation HTTP ${gr.status}: ${String(await gr.text()).slice(0, 200)}`);
    const gj = await gr.json();
    const jobId = gj.jobId;
    if (!jobId) throw new Error('generate-variation returned no jobId');

    // 3. poll
    for (let i = 0; i < polls; i++) {
      const sr = await fetchImpl(gj.statusUrl || `${API}/status/${jobId}`, { headers: hdr(env, token) });
      if (!sr.ok) throw new Error(`status HTTP ${sr.status}`);
      const sj = await sr.json();
      if (sj.status === 'succeeded' && sj.document?.id) {
        return { status: 'CREATED', job_id: jobId, project_id: sj.document.id, url: `https://express.adobe.com/id/${sj.document.id}`, thumbnail: sj.document.thumbnailUrl || null, error: null };
      }
      if (sj.status === 'failed' || sj.status === 'partially_succeeded') throw new Error(`job ${jobId} ${sj.status}`);
      await sleep(2000);
    }
    throw new Error(`job ${jobId} still running after polling; retry resumes with a fresh job`);
  } catch (e) {
    return { status: 'FAILED', error: String(e.message || e) };
  }
}
