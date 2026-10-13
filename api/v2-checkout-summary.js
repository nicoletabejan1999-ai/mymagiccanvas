/* Verifies actual Stripe payment and V2 attribution; never trusts a URL-only success. */
const Stripe = require('stripe');
function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return reply(res, 405, { error: 'Method not allowed' });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return reply(res, 503, { error: 'Checkout verification unavailable.' });
  }
  const raw = req.query && req.query.session_id;
  const id = Array.isArray(raw) ? raw[0] : String(raw || '');
  if (!/^cs_(?:live|test)_[A-Za-z0-9]+$/.test(id)) {
    return reply(res, 400, { error: 'Invalid session ID.' });
  }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(id);
    if (!session || session.payment_status !== 'paid' ||
        !session.metadata || session.metadata.landing_version !== 'v2') {
      return reply(res, 409, { error: 'No confirmed V2 payment for this session.' });
    }
    const currency = String(session.currency || '').toUpperCase();
    const subtotal = Number(session.amount_subtotal);
    if (!/^(EUR|USD)$/.test(currency) || !Number.isFinite(subtotal) || subtotal <= 0) {
      return reply(res, 409, { error: 'Missing valid order information.' });
    }
    reply(res, 200, {
      sessionId: session.id,
      live: Boolean(session.livemode),
      currency,
      value: subtotal / 100,
      amountTotal: Number(session.amount_total || subtotal) / 100,
      shipping: Number(session.total_details && session.total_details.amount_shipping || 0) / 100,
      itemId: String(session.metadata.variant || ''),
      itemName: 'Fingerprint Tree Guest Book Canvas',
      quantity: 1,
      coupon: session.metadata.promotion === 'EVERGREEN_10_PERCENT' ? '10_PERCENT_OFF' : null
    });
  } catch (error) {
    console.error('V2 checkout summary failed', error && error.type || 'unexpected');
    reply(res, 404, { error: 'Checkout session not found.' });
  }
};
