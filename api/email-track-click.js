const { recordEvent } = require('../lib/lead-email-tracking');

// A fixed shop target avoids open-redirect abuse. Do not add a lead identifier.
const TARGET = 'https://mymagiccanvas.vercel.app/v2.html#v2Personalise';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end();
  }
  try {
    const token = req.query && req.query.t;
    await recordEvent(token, 'click');
  } catch (error) {
    console.error('Email click measurement unavailable');
  }
  res.statusCode = 302;
  res.setHeader('Location', TARGET);
  res.end();
};
module.exports.default = module.exports;
