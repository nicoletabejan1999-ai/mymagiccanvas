function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.end(JSON.stringify(body));
}

function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN };
  }
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return {
      oidcToken: process.env.VERCEL_OIDC_TOKEN,
      storeId: process.env.BLOB_STORE_ID
    };
  }
  return null;
}

const REPORT_TIME_ZONE = 'Europe/Paris';

const WINDOWS = Object.freeze({
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '72h': 72 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
});

const ALLOWED_WINDOWS = ['today', ...Object.keys(WINDOWS)];
const MAX_CALENDAR_DAYS = 7; // Bound private-Blob reads and execution time.
const DAY_MS = 24 * 60 * 60 * 1000;

const KNOWN_EVENTS = [
  'landing_view',
  'hero_cta_click',
  'configurator_view',
  'engaged_30s',
  'scroll_50',
  'pricing_view',
  'customize_start',
  'variant_select',
  'contact_click',
  'checkout_cancelled',
  'checkout_click',
  'checkout_attempt',
  'checkout_validation_error',
  'checkout_failed',
  'checkout_created',
  'purchase'
];

const EXCLUDED_SOURCES = new Set([
  'assistant-smoke-test',
  'assistant-funnel-test',
  'meta-smoke-test'
]);

const EXCLUDED_CAMPAIGNS = new Set([
  'tracking-check',
  'funnel-tracking-check',
  'controlled-funnel-20261008',
  'tracking-v3-check',
  'tracking-v4-check'
]);

function safe(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function isExcluded(event) {
  return EXCLUDED_SOURCES.has(safe(event.utmSource, 160)) ||
    EXCLUDED_CAMPAIGNS.has(safe(event.utmCampaign, 200));
}

function classify(event) {
  const source = safe(event.utmSource, 160).toLowerCase();
  const ref = safe(event.referrerHost, 255).toLowerCase();

  if (
    event.hasGclid === true ||
    source === 'google' ||
    source === 'googleads' ||
    source === 'google_ads' ||
    ref.includes('googleads.g.doubleclick.net') ||
    ref.includes('googlesyndication.com')
  ) return 'google_ads';

  if (
    event.hasFbclid === true ||
    ['fb', 'facebook', 'ig', 'instagram', 'th', 'threads', 'meta'].includes(source) ||
    ref.includes('facebook.com') ||
    ref.includes('instagram.com') ||
    ref.includes('threads.com')
  ) return 'meta';

  if (
    event.hasEpik === true ||
    source === 'pinterest' ||
    ref.includes('pinterest.')
  ) return 'pinterest';

  if (!source && !ref) return 'direct_or_unknown';
  return 'other';
}

async function listAll(prefix, auth) {
  const { list } = await import('@vercel/blob');
  const out = [];
  let cursor;
  do {
    const page = await list({
      prefix,
      cursor,
      limit: 1000,
      ...auth
    });
    out.push(...(page.blobs || []));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function readJson(pathname, auth) {
  const { get } = await import('@vercel/blob');
  const result = await get(pathname, {
    access: 'private',
    useCache: false,
    ...auth
  });
  if (!result || result.statusCode !== 200) return null;
  try {
    return JSON.parse(await new Response(result.stream).text());
  } catch (_) {
    return null;
  }
}

function pathnameTimestamp(pathname) {
  const name = String(pathname || '').split('/').pop() || '';
  const match = /^(\d{13})-/.exec(name);
  return match ? Number(match[1]) : null;
}

function blobsWithinRange(blobs, sinceMs, untilMs) {
  return blobs.filter(blob => {
    const timestamp = pathnameTimestamp(blob.pathname);
    return timestamp == null || (timestamp >= sinceMs && timestamp < untilMs);
  });
}

async function readMany(blobs, auth) {
  const out = [];
  const batchSize = 40;
  for (let i = 0; i < blobs.length; i += batchSize) {
    const batch = await Promise.all(
      blobs.slice(i, i + batchSize).map(blob => readJson(blob.pathname, auth))
    );
    out.push(...batch.filter(Boolean));
  }
  return out;
}

function utcDaysBetween(since, until) {
  const days = [];
  let cursor = new Date(Date.UTC(
    since.getUTCFullYear(),
    since.getUTCMonth(),
    since.getUTCDate()
  ));
  const end = new Date(Date.UTC(
    until.getUTCFullYear(),
    until.getUTCMonth(),
    until.getUTCDate()
  ));

  while (cursor <= end && days.length <= 9) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

function inRange(event, sinceMs, untilMs) {
  const time = Date.parse(event && event.occurredAt);
  return Number.isFinite(time) && time >= sinceMs && time < untilMs;
}

function increment(object, key) {
  object[key] = (object[key] || 0) + 1;
}

function ratio(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

function timeZoneOffsetMs(date, timeZone) {
  const roundedMs = Math.floor(date.getTime() / 1000) * 1000;
  const parts = zonedParts(new Date(roundedMs), timeZone);
  const renderedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return renderedAsUtc - roundedMs;
}

function startOfTodayInTimeZone(now, timeZone) {
  const local = zonedParts(now, timeZone);
  const localMidnightAsUtc = Date.UTC(
    Number(local.year),
    Number(local.month) - 1,
    Number(local.day),
    0, 0, 0
  );

  let candidate = localMidnightAsUtc -
    timeZoneOffsetMs(new Date(localMidnightAsUtc), timeZone);

  candidate = localMidnightAsUtc -
    timeZoneOffsetMs(new Date(candidate), timeZone);

  return new Date(candidate);
}


// Parse YYYY-MM-DD without silently normalising invalid dates such as Feb 30.
function parseCalendarDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date : null;
}

// Convert a local Paris midnight into UTC; handles the October DST transition.
function startOfCalendarDay(date, timeZone) {
  const midnightUtc = date.getTime();
  let instant = midnightUtc - timeZoneOffsetMs(new Date(midnightUtc), timeZone);
  instant = midnightUtc - timeZoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

function parisDay(isoTime) {
  const parts = zonedParts(new Date(isoTime), REPORT_TIME_ZONE);
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function emptyCounts() {
  return Object.fromEntries(KNOWN_EVENTS.map(name => [name, 0]));
}

function emptyTraffic() {
  return {
    google_ads: { landing_view: 0, funnel_events: 0 },
    meta: { landing_view: 0, funnel_events: 0 },
    pinterest: { landing_view: 0, funnel_events: 0 },
    direct_or_unknown: { landing_view: 0, funnel_events: 0 },
    other: { landing_view: 0, funnel_events: 0 }
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const fetchSite = safe(req.headers['sec-fetch-site'], 32);
  if (fetchSite === 'cross-site') {
    return json(res, 403, { error: 'Forbidden' });
  }

  const query = req.query || {};
  const requestedFrom = safe(query.from, 16);
  const requestedTo = safe(query.to, 16);
  const hasCalendarRange = Boolean(requestedFrom || requestedTo);
  const windowName = safe(query.window, 8) || '1h';

  if (hasCalendarRange && (!requestedFrom || !requestedTo || query.window != null)) {
    return json(res, 400, { error: 'Use both from and to (YYYY-MM-DD), without window.' });
  }
  if (!hasCalendarRange && !ALLOWED_WINDOWS.includes(windowName)) {
    return json(res, 400, { error: 'Unsupported window', allowed: ALLOWED_WINDOWS });
  }

  const now = new Date();
  let since;
  let until = now;
  let calendarDays = 0;
  if (hasCalendarRange) {
    const first = parseCalendarDay(requestedFrom);
    const last = parseCalendarDay(requestedTo);
    calendarDays = first && last ? Math.round((last - first) / DAY_MS) + 1 : 0;
    if (!calendarDays || calendarDays > MAX_CALENDAR_DAYS) {
      return json(res, 400, {
        error: 'Invalid date range (YYYY-MM-DD). Use 1 to 7 consecutive calendar days.'
      });
    }
    since = startOfCalendarDay(first, REPORT_TIME_ZONE);
    const afterLast = new Date(last.getTime() + DAY_MS);
    until = new Date(Math.min(now.getTime(), startOfCalendarDay(afterLast, REPORT_TIME_ZONE).getTime()));
    if (since >= until) {
      return json(res, 400, { error: 'Date range must begin before the present.' });
    }
  } else {
    since = windowName === 'today'
      ? startOfTodayInTimeZone(now, REPORT_TIME_ZONE)
      : new Date(now.getTime() - WINDOWS[windowName]);
  }

  const auth = blobAuth();
  if (!auth) return json(res, 503, { error: 'Measurement storage unavailable' });
  const sinceMs = since.getTime();
  const untilMs = until.getTime();
  const days = utcDaysBetween(since, new Date(untilMs - 1));

  const eventCounts = emptyCounts();
  const traffic = emptyTraffic();
  const dailyMap = new Map();
  function dayRow(date) {
    if (!dailyMap.has(date)) dailyMap.set(date, { date, counts: emptyCounts() });
    return dailyMap.get(date);
  }
  if (hasCalendarRange) {
    const start = parseCalendarDay(requestedFrom).getTime();
    for (let i = 0; i < calendarDays; i++) {
      dayRow(new Date(start + i * DAY_MS).toISOString().slice(0, 10));
    }
  }
  const funnelBySource = {
    google_ads: {},
    meta: {},
    pinterest: {},
    direct_or_unknown: {},
    other: {}
  };

  let latestEventAt = null;
  let scanned = 0;

  try {
    for (const day of days) {
      const [landingBlobsAll, funnelBlobsAll] = await Promise.all([
        listAll('analytics/landing-views/' + day + '/', auth),
        listAll('analytics/funnel/' + day + '/', auth)
      ]);

      const landingBlobs = blobsWithinRange(landingBlobsAll, sinceMs, untilMs);
      const funnelBlobs = blobsWithinRange(funnelBlobsAll, sinceMs, untilMs);

      const [landingEvents, funnelEvents] = await Promise.all([
        readMany(landingBlobs, auth),
        readMany(funnelBlobs, auth)
      ]);

      for (const event of landingEvents) {
        if (!inRange(event, sinceMs, untilMs) || isExcluded(event)) continue;
        scanned += 1;
        eventCounts.landing_view += 1;
        dayRow(parisDay(event.occurredAt)).counts.landing_view += 1;
        const source = classify(event);
        traffic[source].landing_view += 1;
        if (!latestEventAt || event.occurredAt > latestEventAt) latestEventAt = event.occurredAt;
      }

      for (const event of funnelEvents) {
        if (!inRange(event, sinceMs, untilMs) || isExcluded(event)) continue;
        const name = safe(event.event, 64);
        if (!KNOWN_EVENTS.includes(name) || name === 'landing_view') continue;
        scanned += 1;
        eventCounts[name] += 1;
        dayRow(parisDay(event.occurredAt)).counts[name] += 1;
        const source = classify(event);
        traffic[source].funnel_events += 1;
        increment(funnelBySource[source], name);
        if (!latestEventAt || event.occurredAt > latestEventAt) latestEventAt = event.occurredAt;
      }
    }

    const counts = eventCounts;
    const rates = {
      landing_to_hero_cta_pct: ratio(counts.hero_cta_click, counts.landing_view),
      landing_to_configurator_view_pct: ratio(counts.configurator_view, counts.landing_view),
      landing_to_engaged_30s_pct: ratio(counts.engaged_30s, counts.landing_view),
      landing_to_scroll_50_pct: ratio(counts.scroll_50, counts.landing_view),
      configurator_to_customize_pct: ratio(counts.customize_start, counts.configurator_view),
      pricing_to_checkout_click_pct: ratio(counts.checkout_click, counts.pricing_view),
      checkout_click_to_created_pct: ratio(counts.checkout_created, counts.checkout_click),
      checkout_created_to_purchase_pct: ratio(counts.purchase, counts.checkout_created)
    };

    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const funnelActions = KNOWN_EVENTS.filter(name => name !== 'landing_view')
      .reduce((total, name) => total + counts[name], 0);
    const totals = {
      landingViews: counts.landing_view,
      funnelActions,
      trackedEvents: counts.landing_view + funnelActions
    };

    return json(res, 200, {
      version: 3,
      generatedAt: now.toISOString(),
      window: hasCalendarRange ? null : windowName,
      combinedVersions: true,
      period: {
        since: since.toISOString(),
        until: until.toISOString(),
        timeZone: hasCalendarRange || windowName === 'today' ? REPORT_TIME_ZONE : 'UTC',
        ...(hasCalendarRange ? { from: requestedFrom, to: requestedTo, untilExclusive: true } : {})
      },
      counts,
      daily,
      totals,
      rates,
      traffic,
      funnelBySource,
      latestEventAt,
      notes: [
        'V1 and V2 are combined; the same anonymous action may occur more than once.',
        'Counts are anonymous first-party event totals, not unique visitors.',
        'Rates are aggregate event ratios and can exceed 100% when page reloads or repeated actions occur.',
        'Known assistant smoke/test traffic is excluded.',
        'Contact clicks are counted in total; historic first-party events do not store the contact channel.',
        'Meta lead forms, external-site actions, and unrecorded or blocked requests are not included.',
        'No raw events, IP addresses, user-agent strings, cookies or persistent visitor IDs are returned.'
      ]
    });
  } catch (error) {
    console.error('Analytics summary failed', error && error.message);
    return json(res, 503, { error: 'Analytics summary unavailable' });
  }
};

module.exports.default = module.exports;
