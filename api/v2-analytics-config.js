/* V2-only public GA4 ID and privacy-minimal anonymous funnel ingestion.
   Reuses one serverless route to stay within the Vercel Hobby function limit. */
const { writeFunnelEvent } = require('../lib/first-party-analytics');

const V2_EVENTS = new Set([
  'customize_start', 'variant_select', 'checkout_click', 'checkout_attempt',
  'checkout_validation_error', 'checkout_failed', 'checkout_cancelled',
  'contact_click'
]);

function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const raw = String(process.env.GA4_V2_MEASUREMENT_ID || '').trim();
    const measurementId = /^G-[A-Z0-9]{6,16}$/.test(raw) ? raw : null;
    return respond(res, 200, { measurementId, enabled: Boolean(measurementId) });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return respond(res, 405, { error: 'Method not allowed' });
  }

  const fetchSite = String(req.headers['sec-fetch-site'] || '').slice(0, 32);
  if (fetchSite && fetchSite !== 'same-origin') {
    return respond(res, 403, { error: 'Forbidden' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!V2_EVENTS.has(body.event) ||
      !body.context || body.context.path !== '/v2.html') {
    return respond(res, 400, { error: 'Unsupported V2 event' });
  }
  try {
    // Reuse the existing anonymous sanitizer and private Blob storage.
    await writeFunnelEvent(body.event, body.details, body.context);
    return respond(res, 200, { ok: true });
  } catch (error) {
    console.error('V2 funnel measurement failed', error && error.message);
    return respond(res, 503, { error: 'Measurement unavailable' });
  }
};
