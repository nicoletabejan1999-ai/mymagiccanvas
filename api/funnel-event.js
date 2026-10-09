const { writeFunnelEvent } = require('../lib/first-party-analytics');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

const CLIENT_EVENTS = new Set([
  'hero_cta_click',
  'configurator_view',
  'engaged_30s',
  'scroll_50',
  'pricing_view',
  'customize_start',
  'checkout_click',
  'checkout_attempt',
  'checkout_validation_error',
  'checkout_failed'
]);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const fetchSite = clean(req.headers['sec-fetch-site'], 32);
  if (fetchSite && fetchSite !== 'same-origin') {
    return json(res, 403, { error: 'Forbidden' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const eventName = clean(body.event, 64);
  if (!CLIENT_EVENTS.has(eventName)) {
    return json(res, 400, { error: 'Unsupported event' });
  }

  try {
    await writeFunnelEvent(eventName, body.details, body.context);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('Funnel measurement failed', error && error.message);
    return json(res, 503, { error: 'Measurement failed' });
  }
};
module.exports.default = module.exports;
