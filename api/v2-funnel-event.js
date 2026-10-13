/* V2-only anonymous funnel events; the legacy V1 event allowlist is untouched. */
const { writeFunnelEvent } = require('../lib/first-party-analytics');

const CLIENT_EVENTS = new Set([
  'customize_start',
  'variant_select',
  'checkout_click',
  'checkout_attempt',
  'checkout_validation_error',
  'checkout_failed',
  'checkout_cancelled',
  'contact_click'
]);

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed' });
  }
  const fetchSite = String(req.headers['sec-fetch-site'] || '').slice(0, 32);
  if (fetchSite && fetchSite !== 'same-origin') {
    return reply(res, 403, { error: 'Forbidden' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!CLIENT_EVENTS.has(body.event) ||
      !body.context || body.context.path !== '/v2.html') {
    return reply(res, 400, { error: 'Unsupported V2 event' });
  }

  try {
    // The shared writeFunnelEvent sanitizer keeps only approved anonymous
    // fields (e.g. source, section, variant, currency) and drops PII.
    await writeFunnelEvent(body.event, body.details, body.context);
    return reply(res, 200, { ok: true });
  } catch (error) {
    console.error('V2 funnel measurement failed', error && error.message);
    return reply(res, 503, { error: 'Measurement unavailable' });
  }
};
