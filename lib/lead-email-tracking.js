/* Consent-gated, pseudonymous email event infrastructure.
 * Off unless MMC_EMAIL_TRACKING_ENABLED=true. This module NEVER infers
 * consent from a lead form, an email address, or a tracking token.
 * Blob records contain a token hash; the original token and lead PII
 * stay in the private CRM, not in this application's storage.
 */
const crypto = require('node:crypto');

const ROOT = 'email-tracking/v1';
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const EVENT_PATTERN = /^(\d{13})-(open|click)-[a-f0-9-]+\.json$/;

function isEnabled() {
  return process.env.MMC_EMAIL_TRACKING_ENABLED === 'true';
}

function isValidToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN };
  }
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return { oidcToken: process.env.VERCEL_OIDC_TOKEN, storeId: process.env.BLOB_STORE_ID };
  }
  return null;
}

function requireStorage() {
  const auth = blobAuth();
  if (!auth) throw new Error('Email tracking private storage not configured');
  return auth;
}

function isAdmin(req) {
  const expected = process.env.MMC_EMAIL_TRACKING_ADMIN_SECRET || '';
  const supplied = req.headers['x-mmc-tracking-secret'];
  if (expected.length < 32 || typeof supplied !== 'string') return false;
  const a = crypto.createHash('sha256').update(expected).digest();
  const b = crypto.createHash('sha256').update(supplied).digest();
  return crypto.timingSafeEqual(a, b);
}

function consentPath(hash) {
  return ROOT + '/consent/' + hash + '.json';
}

function eventPrefix(hash) {
  return ROOT + '/events/' + hash + '/';
}

async function readPrivateJson(path, auth) {
  const { get } = await import('@vercel/blob');
  const response = await get(path, { access: 'private', useCache: false, ...auth });
  if (!response || response.statusCode !== 200) return null;
  return JSON.parse(await new Response(response.stream).text());
}

async function readConsent(token) {
  if (!isEnabled() || !isValidToken(token)) return null;
  const hash = hashToken(token);
  const record = await readPrivateJson(consentPath(hash), requireStorage());
  if (!record || record.version !== 1 || record.tokenHash !== hash) return null;
  return record;
}

async function updateConsent(body) {
  if (!isEnabled()) throw new Error('Email tracking disabled');
  const token = body && body.token;
  if (!isValidToken(token) || typeof body.consent !== 'boolean') {
    throw new TypeError('Invalid token or consent');
  }

  const status = body.consent;
  const noticeVersion = String(body.noticeVersion || '').slice(0, 100);
  const source = String(body.source || '').slice(0, 100);
  const consentAt = String(body.consentAt || '');
  const parsedAt = Date.parse(consentAt);
  if (status && (!noticeVersion || !source || !Number.isFinite(parsedAt) ||
      parsedAt > Date.now() + 60000 || parsedAt < Date.now() - 366 * 86400000)) {
    throw new TypeError('Documented consent evidence required');
  }

  const hash = hashToken(token);
  const now = new Date().toISOString();
  const record = {
    version: 1,
    tokenHash: hash,
    granted: status,
    noticeVersion: status ? noticeVersion : null,
    source: status ? source : null,
    consentAt: status ? new Date(parsedAt).toISOString() : null,
    updatedAt: now,
    revokedAt: status ? null : now
  };
  const { put } = await import('@vercel/blob');
  await put(consentPath(hash), JSON.stringify(record), {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    ...requireStorage()
  });
  return { granted: status, updatedAt: now };
}

async function recordEvent(token, event) {
  if (!isEnabled() || !isValidToken(token) || !['open', 'click'].includes(event)) {
    return false;
  }
  // Check current consent for EVERY request; revocations are fail-closed.
  const consent = await readConsent(token);
  if (!consent || consent.granted !== true || consent.revokedAt) return false;
  const hash = hashToken(token);
  const now = Date.now();
  const { put } = await import('@vercel/blob');
  await put(
    eventPrefix(hash) + now + '-' + event + '-' + crypto.randomUUID() + '.json',
    JSON.stringify({ version: 1, event, occurredAt: new Date(now).toISOString() }),
    {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
      ...requireStorage()
    }
  );
  return true;
}

async function summarizeToken(token) {
  if (!isValidToken(token)) throw new TypeError('Invalid token');
  const record = await readConsent(token);
  const result = {
    token,
    consentGranted: Boolean(record && record.granted && !record.revokedAt),
    openLoads: 0,
    clickEvents: 0,
    firstOpenAt: null,
    lastOpenAt: null,
    lastClickAt: null
  };
  if (!isEnabled()) return result;
  const hash = hashToken(token);
  const { list } = await import('@vercel/blob');
  const auth = requireStorage();
  let cursor;
  let pages = 0;
  do {
    const page = await list({ prefix: eventPrefix(hash), cursor, limit: 1000, ...auth });
    for (const blob of (page.blobs || [])) {
      const filename = String(blob.pathname || '').split('/').pop() || '';
      const match = EVENT_PATTERN.exec(filename);
      if (!match) continue;
      const time = new Date(Number(match[1])).toISOString();
      if (match[2] === 'open') {
        result.openLoads += 1;
        if (!result.firstOpenAt || time < result.firstOpenAt) result.firstOpenAt = time;
        if (!result.lastOpenAt || time > result.lastOpenAt) result.lastOpenAt = time;
      } else {
        result.clickEvents += 1;
        if (!result.lastClickAt || time > result.lastClickAt) result.lastClickAt = time;
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
    pages += 1;
    if (cursor && pages >= 20) throw new Error('Event report exceeds supported page cap');
  } while (cursor);
  return result;
}

module.exports = {
  isEnabled,
  isAdmin,
  isValidToken,
  updateConsent,
  readConsent,
  recordEvent,
  summarizeToken
};
