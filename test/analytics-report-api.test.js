'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/analytics-report');

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.json = JSON.parse(value); }
  };
}

test('refuses unauthenticated reads without consulting storage', async () => {
  const prior = process.env.ANALYTICS_REPORT_KEY;
  delete process.env.ANALYTICS_REPORT_KEY;
  try {
    const res = response();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
  } finally {
    if (prior === undefined) delete process.env.ANALYTICS_REPORT_KEY;
    else process.env.ANALYTICS_REPORT_KEY = prior;
  }
});

test('rejects invalid ranges even with a correct bearer token', async () => {
  const prior = process.env.ANALYTICS_REPORT_KEY;
  process.env.ANALYTICS_REPORT_KEY = '01234567890123456789012345678901';
  try {
    const res = response();
    await handler({ method: 'GET', headers: { authorization: 'Bearer 01234567890123456789012345678901' }, query: { start: 'yesterday' } }, res);
    assert.equal(res.statusCode, 400);
  } finally {
    if (prior === undefined) delete process.env.ANALYTICS_REPORT_KEY;
    else process.env.ANALYTICS_REPORT_KEY = prior;
  }
});
