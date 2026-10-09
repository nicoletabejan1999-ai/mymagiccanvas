'use strict';

// A private MCP resource-server endpoint. OAuth identity is handled by
// WorkOS AuthKit; this server only accepts JWTs issued for this exact resource
// and for the one explicitly allowed owner subject.
//
// The endpoint fails closed until MMC_MCP_AUTH_ISSUER and MMC_MCP_ALLOWED_SUB
// have been configured in the *production* Vercel environment.

const RESOURCE = 'https://mymagiccanvas.vercel.app/api/mcp';
const RESOURCE_METADATA = 'https://mymagiccanvas.vercel.app/.well-known/oauth-protected-resource';
const { parseInterval, collectReport } = require('../lib/analytics-report');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function issuerFromEnvironment() {
  const issuer = (process.env.MMC_MCP_AUTH_ISSUER || '').replace(/\/$/, '');
  // Limit token verification to WorkOS AuthKit issuer hosts. Don't allow an
  // attacker-controlled issuer URL to cause server-side arbitrary HTTP fetches.
  if (!/^https:\/\/[a-z0-9-]+\.authkit\.app$/i.test(issuer)) return null;
  return issuer;
}

function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return { oidcToken: process.env.VERCEL_OIDC_TOKEN, storeId: process.env.BLOB_STORE_ID };
  }
  return null;
}

let verificationCache;
async function verifyIdentity(bearer, issuer, allowedSubject) {
  const { jwtVerify, createRemoteJWKSet } = await import('jose');
  if (!verificationCache || verificationCache.issuer !== issuer) {
    verificationCache = {
      issuer,
      keys: createRemoteJWKSet(new URL(issuer + '/oauth2/jwks'))
    };
  }
  const { payload } = await jwtVerify(bearer, verificationCache.keys, {
    issuer,
    audience: RESOURCE,
    algorithms: ['RS256']
  });
  // This is a SINGLE-OWNER private plugin, not a multi-tenant analytics API.
  if (typeof payload.sub !== 'string' || payload.sub !== allowedSubject) {
    return null;
  }
  return payload;
}

async function serveProtocol(req, res) {
  // The v2 handler responds with web-standard Response. Vercel parses JSON
  // before this function runs, so reconstruct the Request from req.body.
  const { createMcpHandler, McpServer } = await import('@modelcontextprotocol/server');
  const z = await import('zod/v4');
  const factory = () => {
    const server = new McpServer({ name: 'mymagiccanvas-first-party', version: '1.0.0' });
    server.registerTool('first_party_analytics_report', {
      title: 'MyMagiCanvas first-party site interactions',
      description: 'Read aggregate MyMagiCanvas page views, personalization, checkout and purchase events by ad source and UTC hour. Does not expose visitors, ad-platform click data or individual records. Max range 72 hours.',
      inputSchema: z.object({
        start: z.string().describe('Start ISO 8601 timestamp with explicit timezone, e.g. 2026-10-09T05:00:00Z'),
        end: z.string().describe('Exclusive end ISO 8601 timestamp with explicit timezone')
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    }, async ({ start, end }) => {
      try {
        const interval = parseInterval({ start, end });
        const auth = blobAuth();
        if (!auth) throw new Error('Reporting storage unavailable');
        const sdk = await import('@vercel/blob');
        const report = await collectReport(interval, sdk, auth);
        return {
          content: [{ type: 'text', text: JSON.stringify(report) }],
          structuredContent: report
        };
      } catch (error) {
        console.error('MCP reporting error', error && error.code || 'unknown');
        return { isError: true, content: [{ type: 'text', text: error instanceof RangeError ? error.message : 'Unable to generate a complete report' }] };
      }
    });
    return server;
  };
  const handler = createMcpHandler(factory);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers || {})) {
    if (typeof value === 'string') headers.set(name, value);
  }
  headers.delete('host');
  headers.delete('content-length');
  const request = new Request(RESOURCE, {
    method: req.method,
    headers,
    ...(req.method === 'POST' ? { body: JSON.stringify(req.body || {}) } : {})
  });
  const result = await handler.fetch(request);
  res.statusCode = result.status;
  for (const [key, value] of result.headers.entries()) {
    // Only forward protocol response headers, not any Set-Cookie.
    if (!['set-cookie', 'content-length'].includes(key.toLowerCase())) res.setHeader(key, value);
  }
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.end(Buffer.from(await result.arrayBuffer()));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const issuer = issuerFromEnvironment();
  const allowedSubject = String(process.env.MMC_MCP_ALLOWED_SUB || '');
  if (!issuer || !allowedSubject) {
    return json(res, 503, { error: 'Private MCP connection is not configured' });
  }

  const origin = String(req.headers.origin || '');
  // The MCP plugin calls this endpoint server-to-server. Browser scripts do not.
  if (origin) return json(res, 403, { error: 'Origin not allowed' });

  const authorization = String(req.headers.authorization || '');
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization);
  if (!match) {
    res.setHeader('WWW-Authenticate', 'Bearer resource_metadata="' + RESOURCE_METADATA + '"');
    return json(res, 401, { error: 'Authentication required' });
  }

  let verified;
  try {
    verified = await verifyIdentity(match[1], issuer, allowedSubject);
  } catch (_) { verified = null; }

  if (!verified) {
    res.setHeader('WWW-Authenticate', 'Bearer resource_metadata="' + RESOURCE_METADATA + '"');
    return json(res, 401, { error: 'Authentication required' });
  }

  try {
    await serveProtocol(req, res);
  } catch (error) {
    console.error('MCP protocol failure', error && error.message);
    if (!res.headersSent) json(res, 503, { error: 'MCP temporarily unavailable' });
  }
};

module.exports._test = { issuerFromEnvironment, verifyIdentity };
