const Stripe = require('stripe');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(res, 503, { error: 'Checkout verification is not configured.' });
  }

  const raw = req.query && req.query.session_id;
  const sessionId = Array.isArray(raw) ? raw[0] : String(raw || '');
  if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return json(res, 400, { error: 'Invalid checkout session.' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || session.payment_status !== 'paid') {
      return json(res, 409, { error: 'Payment is not confirmed.' });
    }

    const variant = session.metadata && session.metadata.variant || '';
    return json(res, 200, {
      sessionId: session.id,
      currency: String(session.currency || 'eur').toUpperCase(),
      value: Number(session.amount_subtotal || session.amount_total || 0) / 100,
      quantity: 1,
      productId: variant,
      productName: 'Fingerprint Tree Guest Book Canvas'
    });
  } catch (error) {
    console.error('Checkout summary failed', error && error.message);
    return json(res, 404, { error: 'Checkout session not found.' });
  }
};
