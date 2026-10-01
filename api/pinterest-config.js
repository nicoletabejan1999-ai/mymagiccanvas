function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.end(JSON.stringify(body));
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const tagId = String(process.env.PINTEREST_TAG_ID || '').trim();
  if (!/^\d{13}$/.test(tagId)) {
    return json(res, 200, { enabled: false });
  }

  return json(res, 200, { enabled: true, tagId });
};
