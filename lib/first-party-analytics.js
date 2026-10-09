const crypto = require('node:crypto');

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
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

function cleanAttribution(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return {
    path: clean(raw.path, 160) || '/',
    referrerHost: clean(raw.referrerHost, 255),
    utmSource: clean(raw.utmSource, 160),
    utmMedium: clean(raw.utmMedium, 160),
    utmCampaign: clean(raw.utmCampaign, 200),
    utmContent: clean(raw.utmContent, 200),
    utmTerm: clean(raw.utmTerm, 200),
    hasFbclid: raw.hasFbclid === true,
    hasGclid: raw.hasGclid === true,
    hasEpik: raw.hasEpik === true
  };
}

function cleanDetails(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (raw.variant != null) out.variant = clean(raw.variant, 80);
  if (raw.currency != null) out.currency = clean(raw.currency, 8).toUpperCase();
  if (raw.country != null) out.country = clean(raw.country, 8).toUpperCase();
  if (raw.reason != null) out.reason = clean(raw.reason, 80);
  if (raw.source != null) out.source = clean(raw.source, 80);
  if (raw.section != null) out.section = clean(raw.section, 80);
  if (raw.target != null) out.target = clean(raw.target, 80);
  const depthPercent = Number(raw.depthPercent);
  if (Number.isFinite(depthPercent) && depthPercent >= 0 && depthPercent <= 100) {
    out.depthPercent = Math.round(depthPercent);
  }
  const visibleSeconds = Number(raw.visibleSeconds);
  if (Number.isFinite(visibleSeconds) && visibleSeconds >= 0 && visibleSeconds <= 86400) {
    out.visibleSeconds = Math.round(visibleSeconds);
  }
  const value = Number(raw.value);
  if (Number.isFinite(value) && value >= 0 && value <= 100000) {
    out.value = Math.round(value * 100) / 100;
  }
  return out;
}

async function writeFunnelEvent(eventName, details, attribution) {
  const name = clean(eventName, 64);
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(name)) {
    throw new Error('Invalid funnel event name');
  }

  const auth = blobAuth();
  if (!auth) throw new Error('Measurement storage unavailable');

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const event = {
    version: 1,
    event: name,
    occurredAt: now.toISOString(),
    ...cleanAttribution(attribution),
    details: cleanDetails(details)
  };

  const { put } = await import('@vercel/blob');
  await put(
    'analytics/funnel/' + day + '/' + Date.now() + '-' + crypto.randomUUID() + '.json',
    JSON.stringify(event),
    {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
      ...auth
    }
  );

  return event;
}

module.exports = {
  cleanAttribution,
  writeFunnelEvent
};
