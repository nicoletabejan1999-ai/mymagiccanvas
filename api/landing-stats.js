const crypto = require('node:crypto');

const AUTH_HASH = '1c86ca774d6f4db2cefe14c898742bb7d4f59a472588e5ef9de46161b3720cc8';

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
  const text = await new Response(result.stream).text();
  try { return JSON.parse(text); } catch (_) { return null; }
}

function dayKeys(since, until) {
  const out = [];
  const d = new Date(Date.UTC(
    new Date(since).getUTCFullYear(),
    new Date(since).getUTCMonth(),
    new Date(since).getUTCDate()
  ));
  const end = new Date(Date.UTC(
    new Date(until).getUTCFullYear(),
    new Date(until).getUTCMonth(),
    new Date(until).getUTCDate()
  ));
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function inc(obj, key) {
  key = key || '(none)';
  obj[key] = (obj[key] || 0) + 1;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }
  if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' });

  const auth = blobAuth();
  if (!auth) return json(res, 503, { error: 'Storage unavailable' });

  const now = new Date();
  const since = new Date(String(req.query && req.query.since || '2026-10-07T19:30:00Z'));
  const until = new Date(String(req.query && req.query.until || now.toISOString()));
  if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime())) {
    return json(res, 400, { error: 'Invalid date range' });
  }

  const blobs = [];
  for (const day of dayKeys(since, until)) {
    blobs.push(...await listAll('analytics/landing-views/' + day + '/', auth));
  }

  const events = [];
  for (const blob of blobs) {
    const event = await readJson(blob.pathname, auth);
    if (!event || !event.occurredAt) continue;
    const t = new Date(event.occurredAt);
    if (t >= since && t <= until) events.push(event);
  }

  const utmSource = {};
  const utmCampaign = {};
  const referrerHost = {};
  const hourly = {};
  let hasFbclid = 0;

  for (const e of events) {
    inc(utmSource, e.utmSource);
    inc(utmCampaign, e.utmCampaign);
    inc(referrerHost, e.referrerHost);
    if (e.hasFbclid === true) hasFbclid += 1;
    const h = String(e.occurredAt).slice(0, 13) + ':00Z';
    inc(hourly, h);
  }

  return json(res, 200, {
    since: since.toISOString(),
    until: until.toISOString(),
    totalLandingViews: events.length,
    hasFbclid,
    noFbclid: events.length - hasFbclid,
    utmSource,
    utmCampaign,
    referrerHost,
    hourly
  });
}

module.exports = handler;
module.exports.default = handler;
