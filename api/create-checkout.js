const EU = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
  'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'
]);

const PRICES = Object.freeze({
  'S': 3190,
  'M': 4990,
  'L': 6490,
  'FRAMED-S': 7999,
  'FRAMED-M': 10999,
  'FRAMED-L': 14999,
  'S-EASEL': 8490,
  'M-EASEL': 9990,
  'L-EASEL': 11490,
  'FRAMED-S-EASEL': 11299
});

const SHIPPING = Object.freeze({
  EU:   { standard: 1890, express: 3490 },
  US:   { standard: 2990, express: 3990 },
  GB:   { standard: 1990, express: 2990 },
  CA:   { standard: 3590, express: 4590 },
  REST: { standard: 4990, express: 7990 }
});

function shippingZone(country) {
  if (EU.has(country)) return 'EU';
  if (country === 'US') return 'US';
  if (country === 'GB') return 'GB';
  if (country === 'CA') return 'CA';
  return 'REST';
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function productName(variant) {
  const framed = variant.startsWith('FRAMED-');
  const easel = variant.endsWith('-EASEL');
  const size = variant.replace('FRAMED-', '').replace('-EASEL', '');
  return (framed ? 'Framed fingerprint tree canvas ' : 'Fingerprint tree canvas ') +
    size + (easel ? ' + display easel' : '');
}

function addShipping(params, index, label, amount, minDays, maxDays) {
  const p = 'shipping_options[' + index + '][shipping_rate_data]';
  params.set(p + '[type]', 'fixed_amount');
  params.set(p + '[display_name]', label);
  params.set(p + '[fixed_amount][amount]', String(amount));
  params.set(p + '[fixed_amount][currency]', 'eur');
  params.set(p + '[delivery_estimate][minimum][unit]', 'business_day');
  params.set(p + '[delivery_estimate][minimum][value]', String(minDays));
  params.set(p + '[delivery_estimate][maximum][unit]', 'business_day');
  params.set(p + '[delivery_estimate][maximum][value]', String(maxDays));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(res, 503, { error: 'Stripe test checkout is not configured yet.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }

  const variant = String(body && body.variant || '').toUpperCase();
  const country = String(body && body.country || '').toUpperCase();
  const reference = String(body && body.reference || '').slice(0, 200);

  if (!Object.prototype.hasOwnProperty.call(PRICES, variant)) {
    return json(res, 400, { error: 'This product combination is not available for online checkout.' });
  }
  if (!/^[A-Z]{2}$/.test(country)) {
    return json(res, 400, { error: 'Please select a valid delivery country.' });
  }

  const shipping = SHIPPING[shippingZone(country)];
  const origin = (req.headers.origin && /^https?:\/\//.test(req.headers.origin))
    ? req.headers.origin
    : 'https://mymagicanvas.com';

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', origin + '/?checkout=success&session_id={CHECKOUT_SESSION_ID}');
  params.set('cancel_url', origin + '/?checkout=cancelled#configurator');
  params.set('client_reference_id', reference || variant);
  params.set('automatic_payment_methods[enabled]', 'true');
  params.set('billing_address_collection', 'auto');
  params.set('customer_creation', 'always');
  params.set('shipping_address_collection[allowed_countries][0]', country);

  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'eur');
  params.set('line_items[0][price_data][unit_amount]', String(PRICES[variant]));
  params.set('line_items[0][price_data][product_data][name]', productName(variant));

  addShipping(params, 0, 'Standard delivery · 3–7 days', shipping.standard, 3, 7);
  addShipping(params, 1, 'Express delivery · 1–3 days', shipping.express, 1, 3);

  try {
    const stripe = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await stripe.json();
    if (!stripe.ok || !data.url) {
      const stripeError = data && data.error || {};
      console.error('Stripe checkout session error', stripeError.type, stripeError.code, stripeError.param);
      const safePreviewMessage = process.env.VERCEL_ENV !== 'production' && stripeError.message
        ? 'Stripe: ' + stripeError.message
        : 'Stripe could not start checkout. Please try again.';
      return json(res, 502, { error: safePreviewMessage });
    }

    return json(res, 200, { url: data.url });
  } catch (error) {
    console.error('Checkout request failed', error && error.message);
    return json(res, 500, { error: 'Checkout is temporarily unavailable.' });
  }
};
