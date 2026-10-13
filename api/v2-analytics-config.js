/* Public, non-secret GA4 configuration for the V2 landing only. */
function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  const raw = String(process.env.GA4_V2_MEASUREMENT_ID || '').trim();
  const measurementId = /^G-[A-Z0-9]{6,16}$/.test(raw) ? raw : null;
  return respond(res, 200, { measurementId, enabled: Boolean(measurementId) });
};
