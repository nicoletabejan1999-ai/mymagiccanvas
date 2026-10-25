const { isEnabled, isAdmin, updateConsent } = require('../lib/lead-email-tracking');

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.end(JSON.stringify(body));
}

// Server-to-server only. Invoked by Apps Script AFTER documented opt-in or
// revocation. Never accept consent claims from public browser requests.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed' });
  }
  if (!isAdmin(req)) return reply(res, 403, { error: 'Forbidden' });
  if (!isEnabled()) return reply(res, 503, { error: 'Tracking disabled' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return reply(res, 400, { error: 'Invalid request' });
  }

  try {
    const state = await updateConsent(body);
    return reply(res, 200, { ok: true, ...state });
  } catch (error) {
    if (error instanceof TypeError) {
      return reply(res, 400, { error: 'Invalid or undocumented consent' });
    }
    console.error('Email consent update failed');
    return reply(res, 503, { error: 'Consent storage unavailable' });
  }
};
module.exports.default = module.exports;
