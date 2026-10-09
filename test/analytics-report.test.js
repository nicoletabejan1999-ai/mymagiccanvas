'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInterval, daysForInterval, sourceOf, aggregate, collectReport } = require('../lib/analytics-report');

test('strict, bounded and offset-aware timestamps', () => {
  assert.throws(() => parseInterval({start:'2026-10-09',end:'2026-10-10'}));
  assert.throws(() => parseInterval({start:'2026-10-09T00:00:00Z',end:'2026-10-15T00:00:00Z'}));
  assert.deepEqual(daysForInterval(Date.parse('2026-10-08T22:00:00Z'),Date.parse('2026-10-09T12:00:00Z')), ['2026-10-08','2026-10-09']);
});

test('paid attribution does not mistake organic Google for Google Ads', () => {
  assert.equal(sourceOf({referrerHost:'www.google.com'}), 'referral_or_organic');
  assert.equal(sourceOf({utmSource:'google',utmMedium:'organic'}), 'other_tagged');
  assert.equal(sourceOf({hasGclid:true}), 'google_ads');
  assert.equal(sourceOf({utmSource:'google',utmMedium:'cpc'}), 'google_ads');
  assert.equal(sourceOf({hasFbclid:true}), 'meta_ads');
});

test('aggregates without individual session IDs', () => {
  const i = parseInterval({start:'2026-10-09T05:00:00Z', end:'2026-10-09T10:00:00Z'});
  const report = aggregate([
    {event:'landing_view',occurredAt:'2026-10-09T06:00:00Z',hasGclid:true},
    {event:'customize_start',occurredAt:'2026-10-09T07:00:00Z',hasFbclid:true},
    {event:'landing_view',occurredAt:'2026-10-09T11:00:00Z',hasGclid:true}
  ],i,0);
  assert.equal(report.bySource.google_ads.landing_view,1);
  assert.equal(report.bySource.meta_ads.customize_start,1);
  assert.equal(report.byEvent.landing_view,1);
  assert.equal(report.complete,true);
});

test('reads private blobs with cursor and excludes out-of-window events', async () => {
  const interval = parseInterval({start:'2026-10-09T00:00:00Z',end:'2026-10-09T12:00:00Z'});
  const store = {
    async list({prefix,cursor}) {
      if (prefix.includes('landing-views') && !cursor) return {blobs:[{pathname:'l1',size:200}],hasMore:true,cursor:'next'};
      if (prefix.includes('landing-views') && cursor) return {blobs:[{pathname:'l2',size:200}],hasMore:false};
      return {blobs:[],hasMore:false};
    },
    async get(name,opts) {
      assert.equal(opts.access,'private');
      const item = name==='l1' ? {event:'landing_view',occurredAt:'2026-10-09T05:00:00Z',hasGclid:true} : {event:'landing_view',occurredAt:'2026-10-09T23:00:00Z'};
      return {statusCode:200,stream:new Response(JSON.stringify(item)).body};
    }
  };
  const result = await collectReport(interval,store,{});
  assert.equal(result.byEvent.landing_view,1);
});
