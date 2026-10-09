'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/mcp');
const metadata = require('../api/mcp-resource-meta');

function reply() {
  return {
    statusCode: 0,
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(body) { this.body = String(body || ''); },
  };
}

test('MCP endpoint refuses all access until OAuth env and owner are configured', async () => {
  const vars = ['MMC_MCP_AUTH_ISSUER', 'MMC_MCP_ALLOWED_SUB'];
  const previous = vars.map(k => process.env[k]);
  try {
    delete process.env.MMC_MCP_AUTH_ISSUER;
    delete process.env.MMC_MCP_ALLOWED_SUB;
    const res = reply();
    await handler({ method:'POST', headers:{}, body:{jsonrpc:'2.0'} }, res);
    assert.equal(res.statusCode, 503);
    const discovery = reply();
    metadata({method:'GET'}, discovery);
    assert.equal(discovery.statusCode, 503);
  } finally { vars.forEach((k, i) => previous[i] === undefined ? delete process.env[k] : process.env[k] = previous[i]); }
});

test('unconfigured endpoint cannot be authenticated with arbitrary bearer token', async () => {
  const oldIssuer=process.env.MMC_MCP_AUTH_ISSUER;
  const oldSub=process.env.MMC_MCP_ALLOWED_SUB;
  try {
    process.env.MMC_MCP_AUTH_ISSUER='https://test.authkit.app';
    process.env.MMC_MCP_ALLOWED_SUB='user_123';
    const res=reply();
    await handler({method:'POST',headers:{authorization:'Bearer 123'},body:{}},res);
    assert.equal(res.statusCode, 401);
    assert.match(res.headers['www-authenticate'],/resource_metadata/);
    const meta=reply();
    metadata({method:'GET'},meta);
    assert.equal(meta.statusCode,200);
    assert.equal(JSON.parse(meta.body).resource,'https://mymagiccanvas.vercel.app/api/mcp');
  } finally {
    if(oldIssuer===undefined) delete process.env.MMC_MCP_AUTH_ISSUER; else process.env.MMC_MCP_AUTH_ISSUER=oldIssuer;
    if(oldSub===undefined) delete process.env.MMC_MCP_ALLOWED_SUB; else process.env.MMC_MCP_ALLOWED_SUB=oldSub;
  }
});
