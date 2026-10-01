// Vercel supplies the visitor country; no personal data is stored or forwarded.
module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('Allow', 'GET'); return res.end('{}'); }
  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  res.end(JSON.stringify({ country: /^[A-Z]{2}$/.test(country) ? country : '' }));
};
