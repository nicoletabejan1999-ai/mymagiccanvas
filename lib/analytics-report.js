'use strict';

const MAX_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_RECORDS = 2500;
const PAID_MEDIA = /^(cpc|ppc|paid|paid[-_ ]?(search|social)|display|ads)$/i;

function parseInterval(query) {
  const start = String(query.start || '');
  const end = String(query.end || '');
  const strictIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!strictIso.test(start) || !strictIso.test(end)) throw new RangeError('Use start and end as ISO-8601 timestamps with a timezone');
  const from = Date.parse(start);
  const until = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || until - from > MAX_INTERVAL_MS) {
    throw new RangeError('Invalid time range; maximum 72 hours');
  }
  return { from, until, start: new Date(from).toISOString(), end: new Date(until).toISOString() };
}

function daysForInterval(from, until) {
  const days = [];
  let current = Math.floor(from / 86400000) * 86400000;
  while (current < until) {
    days.push(new Date(current).toISOString().slice(0, 10));
    current += 86400000;
  }
  return days;
}

function sourceOf(record) {
  const source = String(record.utmSource || '').trim().toLowerCase();
  const medium = String(record.utmMedium || '').trim().toLowerCase();
  const referrer = String(record.referrerHost || '').trim().toLowerCase();
  if (record.hasGclid === true || (/^google(?:[-_ ]ads)?$/.test(source) && PAID_MEDIA.test(medium))) return 'google_ads';
  if (record.hasFbclid === true || (/^(meta|facebook|fb|instagram|ig)(?:[-_ ]ads)?$/.test(source) && PAID_MEDIA.test(medium))) return 'meta_ads';
  if (record.hasEpik === true || (/^pinterest(?:[-_ ]ads)?$/.test(source) && PAID_MEDIA.test(medium))) return 'pinterest_ads';
  if (PAID_MEDIA.test(medium)) return 'other_paid';
  if (source) return 'other_tagged';
  if (referrer) return 'referral_or_organic';
  return 'unattributed';
}

function emptyCounters() {
  return {
    landing_view: 0, customize_start: 0, checkout_click: 0,
    checkout_attempt: 0, checkout_validation_error: 0,
    checkout_failed: 0, checkout_created: 0, purchase: 0
  };
}

function aggregate(records, interval, skipped) {
  const byEvent = emptyCounters();
  const bySource = {};
  const byHour = {};
  let counted = 0;
  for (const item of records) {
    const when = Date.parse(item && item.occurredAt);
    if (!Number.isFinite(when) || when < interval.from || when >= interval.until) continue;
    const event = String(item.event || '');
    if (!Object.prototype.hasOwnProperty.call(byEvent, event)) continue;
    const source = sourceOf(item);
    byEvent[event] += 1;
    (bySource[source] ||= emptyCounters())[event] += 1;
    const hour = new Date(when).toISOString().slice(0, 13) + ':00:00Z';
    (byHour[hour] ||= emptyCounters())[event] += 1;
    counted += 1;
  }
  return {
    interval: { start: interval.start, end: interval.end, timezone: 'UTC', endExclusive: true },
    definitions: {
      landingViews: 'Recorded page-load events, not unique visitors',
      paidAttribution: 'Google: gclid or paid Google UTM; Meta: fbclid or paid Meta UTM',
      funnelCounts: 'Counts independent events; events cannot be joined into visitor sessions',
      note: 'Click counts from ad platforms are not available in this report'
    },
    byEvent, bySource, byHour, counted,
    invalidRecordsSkipped: skipped,
    complete: skipped === 0
  };
}

async function collectReport(interval, blobSdk, auth) {
  const records = [];
  let skipped = 0;
  let inspected = 0;
  for (const day of daysForInterval(interval.from, interval.until)) {
    for (const prefix of [`analytics/landing-views/${day}/`, `analytics/funnel/${day}/`]) {
      let cursor;
      do {
        const page = await blobSdk.list({ ...auth, prefix, limit: 500, ...(cursor ? { cursor } : {}) });
        if (!page || !Array.isArray(page.blobs)) throw new Error('Blob listing failed');
        // Never silently treat a partial sample as a complete count.
        if (inspected + page.blobs.length > MAX_RECORDS) {
          const error = new Error('Reporting range contains too many records; narrow the interval');
          error.code = 'TOO_MANY_RECORDS';
          throw error;
        }
        inspected += page.blobs.length;
        // Read at most twelve private objects concurrently.
        for (let index = 0; index < page.blobs.length; index += 12) {
          const batch = page.blobs.slice(index, index + 12);
          const read = await Promise.all(batch.map(async (entry) => {
            if (entry.size > 16000) return null;
            try {
              const result = await blobSdk.get(entry.pathname, { ...auth, access: 'private' });
              if (!result || result.statusCode !== 200 || !result.stream) return null;
              const body = await new Response(result.stream).text();
              if (body.length > 16000) return null;
              return JSON.parse(body);
            } catch (_) { return null; }
          }));
          for (const entry of read) {
            if (entry && typeof entry === 'object') records.push(entry);
            else skipped += 1;
          }
        }
        if (page.hasMore && !page.cursor) throw new Error('Blob pagination cursor missing');
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
    }
  }
  return aggregate(records, interval, skipped);
}

module.exports = { parseInterval, daysForInterval, sourceOf, aggregate, collectReport };
