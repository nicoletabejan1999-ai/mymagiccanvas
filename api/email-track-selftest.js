/* MyMagicCanvas email tracking storage smoke test.
 * The only production side effect is a short-lived, pseudonymous
 * synthetic blob which is removed in the same request.
 * Requires the separate CRM admin secret. Refuses to run with
 * live email-tracking collection enabled.
 */
const crypto = require('node:crypto');
const { isAdmin, isEnabled } = require('../lib/lead-email-tracking');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.end(JSON.stringify(body));
}

function storageAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return { oidcToken: process.env.VERCEL_OIDC_TOKEN, storeId: process.env.BLOB_STORE_ID };
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }
  if (!isAdmin(req)) return json(res, 403, { ok: false, error: 'Forbidden' });
  if (isEnabled()) return json(res, 409, { ok: false, error: 'Diagnostic requires disabled tracking' });

  const auth = storageAuth();
  if (!auth) return json(res, 503, { ok: false, error: 'Private storage unavailable' });

  const id = crypto.randomUUID();
  const pathname = 'email-tracking/v1/diagnostics/' + id + '.json';
  const payload = JSON.stringify({ diagnostic: true, nonce: id, type: 'synthetic', createdAt: new Date().toISOString() });
  let written = false;
  let verified = false;
  let removed = false;
  try {
    const { put, get, del } = await import('@vercel/blob');
    await put(pathname, payload, {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
      ...auth
    });
    written = true;

    const stored = await get(pathname, {
      access: 'private',
      useCache: false,
      ...auth
    });
    if (stored && stored.statusCode === 200 && stored.stream) {
      const data = JSON.parse(await new Response(stored.stream).text());
      verified = data.nonce === id && data.diagnostic === true;
    }
    // Remove the synthetic data, even if verification failed.
    await del(pathname, auth);
    removed = true;

    return json(res, verified ? 200 : 503, {
      ok: verified && removed,
      diagnostic: 'private-blob-read-write-delete',
      written, verified, removed,
      trackingEnabled: false,
      touchedCustomerRecords: false
    });
  } catch (error) {
    console.error('Tracking diagnostic private storage operation failed');
    return json(res, 503, {
      ok: false,
      error: 'Diagnostic storage operation failed',
      written, verified, removed
    });
  } finally {
    if (written && !removed) {
      try {
        const { del } = await import('@vercel/blob');
        await del(pathname, auth);
      } catch (_) {
        console.error('Tracking diagnostic cleanup retry needed');
      }
    }
  }
};
module.exports.default = module.exports;
