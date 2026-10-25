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


/*
 * Run a sealed synthetic scenario in the diagnostics-only namespace.
 * It deliberately DOES NOT call customer-facing pixel/click endpoints,
 * touch actual tokens, or change the global collection switch.
 */
async function simulatePrivateEvents(auth) {
  const root = 'email-tracking/v1/diagnostics/' + crypto.randomUUID() + '/';
  const consentPath = root + 'consent.json';
  const eventPrefix = root + 'events/';
  const created = [];
  const { put, get, del, list } = await import('@vercel/blob');

  const write = async (pathname, body) => {
    await put(pathname, JSON.stringify(body), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      ...auth
    });
    if (!created.includes(pathname)) created.push(pathname);
  };

  const read = async (pathname) => {
    const result = await get(pathname, { access: 'private', useCache: false, ...auth });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return JSON.parse(await new Response(result.stream).text());
  };

  const recordSynthetic = async (type) => {
    // Read the consent record from PRIVATE storage before every event.
    const consent = await read(consentPath);
    if (!consent || consent.synthetic !== true || consent.granted !== true) return false;
    const time = Date.now();
    await write(eventPrefix + time + '-' + type + '-' + crypto.randomUUID() + '.json', {
      version: 1,
      synthetic: true,
      event: type,
      occurredAt: new Date(time).toISOString()
    });
    return true;
  };

  let countBeforeWithdrawal = { openLoads: 0, clickEvents: 0 };
  let countAfterWithdrawal = { openLoads: 0, clickEvents: 0 };
  let suppressedAfterWithdrawal = false;
  let deleted = false;
  try {
    await write(consentPath, { synthetic: true, granted: true });
    if (!await recordSynthetic('open') || !await recordSynthetic('open') ||
        !await recordSynthetic('click')) {
      throw new Error('Synthetic event creation failed');
    }
    const before = await list({ prefix: eventPrefix, limit: 100, ...auth });
    if (before.hasMore) throw new Error('Unexpected pagination of synthetic records');
    for (const blob of before.blobs || []) {
      if (/-open-[a-f0-9-]+\.json$/.test(blob.pathname)) countBeforeWithdrawal.openLoads++;
      if (/-click-[a-f0-9-]+\.json$/.test(blob.pathname)) countBeforeWithdrawal.clickEvents++;
    }

    // Revoke in storage; a fourth event must be rejected without being stored.
    await write(consentPath, { synthetic: true, granted: false });
    suppressedAfterWithdrawal = !(await recordSynthetic('open'));
    const after = await list({ prefix: eventPrefix, limit: 100, ...auth });
    if (after.hasMore) throw new Error('Unexpected pagination after synthetic revocation');
    for (const blob of after.blobs || []) {
      if (/-open-[a-f0-9-]+\.json$/.test(blob.pathname)) countAfterWithdrawal.openLoads++;
      if (/-click-[a-f0-9-]+\.json$/.test(blob.pathname)) countAfterWithdrawal.clickEvents++;
    }
    const good = countBeforeWithdrawal.openLoads === 2 &&
      countBeforeWithdrawal.clickEvents === 1 &&
      countAfterWithdrawal.openLoads === 2 &&
      countAfterWithdrawal.clickEvents === 1 &&
      suppressedAfterWithdrawal;
    if (!good) throw new Error('Unexpected synthetic event counts');
    return {
      ok: true,
      diagnostic: 'synthetic-email-open-click-consent-revocation',
      syntheticOpenLoads: 2,
      syntheticClickEvents: 1,
      suppressedAfterWithdrawal: true,
      syntheticRecordsRemoved: true,
      trackingEnabled: false,
      touchedCustomerRecords: false
    };
  } finally {
    // Remove everything created for this self-test before acknowledging success.
    if (created.length) {
      await del(created, auth);
      deleted = true;
    }
    if (!deleted) console.error('Synthetic email event test cleanup incomplete');
  }
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

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch (_) { return null; } })()
    : req.body;
  if (body && body.scenario === 'events') {
    try {
      const result = await simulatePrivateEvents(auth);
      return json(res, 200, result);
    } catch (error) {
      console.error('Synthetic email events diagnostic failed');
      return json(res, 503, {
        ok: false,
        error: 'Synthetic event test failed; inspect private storage health'
      });
    }
  }

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
