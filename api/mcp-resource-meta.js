'use strict';

const RESOURCE = 'https://mymagiccanvas.vercel.app/api/mcp';

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end();
  }
  const issuer = String(process.env.MMC_MCP_AUTH_ISSUER || '').replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.authkit\.app$/i.test(issuer)) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'OAuth discovery not configured' }));
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=120');
  return res.end(JSON.stringify({
    resource: RESOURCE,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header']
  }));
};
