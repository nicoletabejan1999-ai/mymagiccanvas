const { isEnabled, isAdmin, isValidToken, summarizeToken } = require('../lib/lead-email-tracking');

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.end(JSON.stringify(body));
}

// Private CRM polling endpoint; no customer identity data is stored here.
// Apps Script maps opaque tokens to Lead IDs inside the private Google Sheet.
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
  const tokens = body && body.tokens;
  if (!Array.isArray(tokens) || tokens.length > 25 ||
      !tokens.every(isValidToken) || new Set(tokens).size !== tokens.length) {
    return reply(res, 400, { error: 'Expected up to 25 unique opaque tokens' });
  }

  try {
    const results = [];
    for (const token of tokens) results.push(await summarizeToken(token));
    return reply(res, 200, { ok: true, results, opensAreEstimates: true });
  } catch (error) {
    console.error('Email tracking summary unavailable');
    return reply(res, 503, { error: 'Event storage unavailable' });
  }
};
module.exports.default = module.exports;
