const crypto = require('node:crypto');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN };
  }
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return {
      oidcToken: process.env.VERCEL_OIDC_TOKEN,
      storeId: process.env.BLOB_STORE_ID
    };
  }
  return null;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const fetchSite = clean(req.headers['sec-fetch-site'], 32);
  if (fetchSite && fetchSite !== 'same-origin') {
    return json(res, 403, { error: 'Forbidden' });
  }

  const auth = blobAuth();
  if (!auth) return json(res, 503, { error: 'Measurement storage unavailable' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const id = crypto.randomUUID();

  const event = {
    version: 1,
    event: 'landing_view',
    occurredAt: now.toISOString(),
    path: clean(body.path, 160) || '/',
    referrerHost: clean(body.referrerHost, 255),
    utmSource: clean(body.utmSource, 160),
    utmMedium: clean(body.utmMedium, 160),
    utmCampaign: clean(body.utmCampaign, 200),
    utmContent: clean(body.utmContent, 200),
    utmTerm: clean(body.utmTerm, 200),
    hasFbclid: body.hasFbclid === true,
    hasGclid: body.hasGclid === true,
    hasEpik: body.hasEpik === true
  };

  try {
    const { put } = await import('@vercel/blob');
    await put(
      'analytics/landing-views/' + day + '/' + Date.now() + '-' + id + '.json',
      JSON.stringify(event),
      {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'application/json',
        ...auth
      }
    );
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('Landing measurement failed', error && error.message);
    return json(res, 503, { error: 'Measurement failed' });
  }
}

module.exports = handler;
module.exports.default = handler;
