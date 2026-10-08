const crypto = require('node:crypto');

const AUTH_HASH = '863c780e5669677f35fc97d1c16b2f48a6a01566c91ef58ecbd32de6fdfa5bb3';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const key = String(req.headers['x-analytics-key'] || '');
  const got = crypto.createHash('sha256').update(key).digest();
  const want = Buffer.from(AUTH_HASH, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return { oidcToken: process.env.VERCEL_OIDC_TOKEN, storeId: process.env.BLOB_STORE_ID };
  }
  return null;
}

async function listAll(prefix, auth) {
  const { list } = await import('@vercel/blob');
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000, ...auth });
    out.push(...(page.blobs || []));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function readJson(pathname, auth) {
  const { get } = await import('@vercel/blob');
  const result = await get(pathname, { access: 'private', useCache: false, ...auth });
  if (!result || result.statusCode !== 200) return null;
  try { return JSON.parse(await new Response(result.stream).text()); } catch (_) { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }
  if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' });

  const auth = blobAuth();
  if (!auth) return json(res, 503, { error: 'Storage unavailable' });

  const source = String(req.query && req.query.source || '').slice(0, 160);
  const day = String(req.query && req.query.day || new Date().toISOString().slice(0,10)).slice(0,10);
  const blobs = await listAll('analytics/funnel/' + day + '/', auth);
  const events = [];
  for (const blob of blobs) {
    const e = await readJson(blob.pathname, auth);
    if (!e) continue;
    if (source && e.utmSource !== source) continue;
    events.push({
      event: e.event,
      occurredAt: e.occurredAt,
      utmSource: e.utmSource || '',
      utmCampaign: e.utmCampaign || '',
      details: e.details || {}
    });
  }
  return json(res, 200, { count: events.length, events });
};
