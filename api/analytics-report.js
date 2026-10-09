'use strict';

const crypto = require('node:crypto');
const { parseInterval, collectReport } = require('../lib/analytics-report');

function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function authorized(header, secret) {
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32 || typeof header !== 'string') return false;
  if (!header.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7), 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return { oidcToken: process.env.VERCEL_OIDC_TOKEN, storeId: process.env.BLOB_STORE_ID };
  }
  return null;
}

module.exports = async function handler(req, res) {
  // The endpoint is private server-to-server; do not add permissive CORS.
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  if (!authorized(req.headers.authorization, process.env.ANALYTICS_REPORT_KEY)) {
    return respond(res, 401, { error: 'Unauthorized' });
  }
  let interval;
  try {
    interval = parseInterval(req.query || {});
  } catch (error) {
    return respond(res, 400, { error: error.message });
  }
  const auth = blobAuth();
  if (!auth) return respond(res, 503, { error: 'Reporting storage unavailable' });
  try {
    const sdk = await import('@vercel/blob');
    const report = await collectReport(interval, sdk, auth);
    return respond(res, 200, report);
  } catch (error) {
    if (error.code === 'TOO_MANY_RECORDS') return respond(res, 422, { error: error.message });
    console.error('Analytics report failed', error && error.message);
    return respond(res, 503, { error: 'Unable to produce a complete report' });
  }
};
