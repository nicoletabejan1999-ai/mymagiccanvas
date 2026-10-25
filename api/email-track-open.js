const { recordEvent } = require('../lib/lead-email-tracking');

// A one-pixel transparent GIF. Loading it does not prove human reading.
const PIXEL = Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end();
  }
  try {
    const token = req.query && req.query.t;
    await recordEvent(token, 'open');
  } catch (error) {
    // Fail closed: don't log personal data or reveal consent state.
    console.error('Email open measurement unavailable');
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/gif');
  res.end(PIXEL);
};
module.exports.default = module.exports;
