const crypto = require('node:crypto');
const Stripe = require('stripe');
const { generatePrintPdf } = require('../lib/order-pdf');
const { writeFunnelEvent } = require('../lib/first-party-analytics');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
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

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function readPrivateBlob(pathname, auth) {
  const { get } = await import('@vercel/blob');
  const result = await get(pathname, {
    access: 'private',
    useCache: false,
    ...auth
  });
  if (!result || result.statusCode !== 200) return null;
  return result;
}

async function readPrivateJson(pathname, auth) {
  const result = await readPrivateBlob(pathname, auth);
  if (!result) return null;
  return JSON.parse(await new Response(result.stream).text());
}

async function readPrivateBytes(pathname, auth) {
  const result = await readPrivateBlob(pathname, auth);
  if (!result) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

async function writePrivate(pathname, body, contentType, auth) {
  const { put } = await import('@vercel/blob');
  return put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    ...auth
  });
}

function fontName(number) {
  return ({
    1: 'Hubiland',
    2: 'Millerstone Demo',
    3: 'Boheme Floral',
    4: 'Francisco',
    5: 'Belista',
    6: 'Poppy Shower',
    7: 'Dancing Script',
    8: 'Savoye LET'
  })[Number(number)] || String(number || '');
}

function pdfFileName(design, designId) {
  const safeNames = String(design.names || 'order')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'order';
  return [safeNames, design.size || 'canvas', designId].join('_') + '.pdf';
}

async function sendGoogleFulfillment(order, pdfBytes) {
  const url = process.env.GOOGLE_FULFILLMENT_URL;
  const secret = process.env.GOOGLE_FULFILLMENT_SECRET;
  if (!url || !secret) {
    throw new Error('Google fulfillment is not configured');
  }

  const payload = {
    ...order,
    pdfBase64: Buffer.from(pdfBytes).toString('base64')
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('hex');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: payloadB64, signature })
  });

  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) {}

  if (!response.ok || !body || body.ok !== true) {
    throw new Error(
      'Google fulfillment failed' +
      (body && body.error ? ': ' + body.error : ' (HTTP ' + response.status + ')')
    );
  }

  return body;
}


function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function pinterestHashEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized ? sha256(normalized) : '';
}

function pinterestHashPhone(value) {
  const normalized = String(value || '').replace(/\D/g, '').replace(/^0+/, '');
  return normalized ? sha256(normalized) : '';
}

function pinterestHashCountry(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z]{2}$/.test(normalized) ? sha256(normalized) : '';
}

async function sendPinterestCheckout(session, design) {
  const meta = design && design.meta;
  if (!meta || meta.consent !== true) return { skipped: 'no_consent' };

  const token = process.env.PINTEREST_CAPI_ACCESS_TOKEN;
  if (!token) return { skipped: 'no_token' };

  const adAccountId = process.env.PINTEREST_AD_ACCOUNT_ID || '549770849495';
  const customer = session.customer_details || {};
  const shipping = session.shipping_details ||
    (session.collected_information && session.collected_information.shipping_details) ||
    {};
  const address = shipping.address || customer.address || {};

  const userData = {};
  const em = pinterestHashEmail(customer.email);
  const ph = pinterestHashPhone(customer.phone || design.phone);
  const country = pinterestHashCountry(address.country || design.deliveryCountry);

  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (country) userData.country = [country];
  if (meta.pinterestClickId) userData.click_id = meta.pinterestClickId;
  if (meta.clientIp) userData.client_ip_address = meta.clientIp;
  if (meta.userAgent) userData.client_user_agent = meta.userAgent;

  // Pinterest requires user_data to contain an email, a mobile ad ID, or
  // the client IP + user agent pair. Checkout normally gives us both email
  // and the browser pair, but skip safely if neither is available.
  if (!userData.em &&
      !(userData.client_ip_address && userData.client_user_agent)) {
    return { skipped: 'no_match_data' };
  }

  const variant = session.metadata && session.metadata.variant || design.variant;
  const subtotal = Number(session.amount_subtotal || session.amount_total || 0) / 100;
  if (!(subtotal > 0)) return { skipped: 'invalid_value' };

  const item = {
    id: String(variant || 'fingerprint-tree-canvas'),
    item_name: 'Fingerprint Tree Guest Book Canvas',
    item_category: 'Wedding guest book canvas',
    item_brand: 'MyMagiCanvas',
    item_price: subtotal.toFixed(2),
    quantity: 1
  };

  const event = {
    event_name: 'checkout',
    action_source: 'web',
    event_time: Math.floor(Date.now() / 1000),
    event_id: session.id,
    event_source_url: meta.eventSourceUrl || 'https://mymagiccanvas.vercel.app/',
    opt_out: false,
    partner_name: 'direct',
    user_data: userData,
    custom_data: {
      currency: String(session.currency || 'eur').toUpperCase(),
      value: subtotal.toFixed(2),
      order_id: session.id,
      num_items: 1,
      content_ids: [item.id],
      contents: [item]
    }
  };

  const isTest =
    session.livemode === false ||
    String(process.env.PINTEREST_TEST_MODE || '').toLowerCase() === 'true';

  const url =
    'https://api.pinterest.com/v5/ad_accounts/' + encodeURIComponent(adAccountId) +
    '/events' + (isTest ? '?test=true' : '');

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: [event] })
      });
      const result = await response.json().catch(() => ({}));

      const processed = Number(result && result.num_events_processed || 0);
      const eventStatus = result && Array.isArray(result.events) && result.events[0];
      if (response.ok && processed >= 1 && (!eventStatus || eventStatus.status !== 'failed')) {
        console.log(
          'Pinterest CAPI checkout accepted',
          session.id,
          'processed=' + String(processed),
          isTest ? 'test=true' : 'test=false'
        );
        return result;
      }

      const message =
        eventStatus && eventStatus.error_message ||
        result && result.message ||
        'HTTP ' + response.status;
      lastError = new Error('Pinterest CAPI checkout failed: ' + message);

      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
    }

    await new Promise(resolve => setTimeout(resolve, attempt * 500));
  }

  throw lastError || new Error('Pinterest CAPI checkout failed');
}

async function sendMetaPurchase(session, design) {
  const meta = design && design.meta;
  if (!meta || meta.consent !== true) return { skipped: 'no_consent' };

  const pixelId = process.env.META_PIXEL_ID || '4206777262800081';
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return { skipped: 'no_token' };

  const isTest = session.livemode === false;
  const testCode = process.env.META_TEST_EVENT_CODE || '';
  if (isTest && !testCode) return { skipped: 'test_code_missing' };

  const customer = session.customer_details || {};
  const shipping = session.shipping_details ||
    (session.collected_information && session.collected_information.shipping_details) ||
    {};
  const address = shipping.address || customer.address || {};

  const userData = {};
  const em = pinterestHashEmail(customer.email);
  const ph = pinterestHashPhone(customer.phone || design.phone);
  const country = pinterestHashCountry(address.country || design.deliveryCountry);

  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (country) userData.country = [country];
  if (meta.fbp) userData.fbp = meta.fbp;
  if (meta.fbc) userData.fbc = meta.fbc;
  if (meta.clientIp) userData.client_ip_address = meta.clientIp;
  if (meta.userAgent) userData.client_user_agent = meta.userAgent;

  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: session.id,
    action_source: 'website',
    event_source_url: meta.eventSourceUrl || 'https://mymagiccanvas.vercel.app/',
    user_data: userData,
    custom_data: {
      currency: String(session.currency || 'eur').toUpperCase(),
      value: Number(session.amount_total || 0) / 100,
      content_ids: [session.metadata && session.metadata.variant || design.variant],
      content_type: 'product',
      num_items: 1
    }
  };

  const body = { data: [event] };
  if (isTest) body.test_event_code = testCode;

  const url =
    'https://graph.facebook.com/v26.0/' + encodeURIComponent(pixelId) +
    '/events?access_token=' + encodeURIComponent(token);

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok) {
        console.log(
          'Meta CAPI Purchase accepted',
          session.id,
          'events_received=' + String(result.events_received ?? '')
        );
        return result;
      }

      const message =
        result && result.error && result.error.message ||
        'HTTP ' + response.status;
      lastError = new Error('Meta CAPI Purchase failed: ' + message);

      // Retry throttling and server-side failures only. A normal 4xx is a
      // configuration/payload problem and retrying it would not help.
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
    }

    await new Promise(resolve => setTimeout(resolve, attempt * 500));
  }

  throw lastError || new Error('Meta CAPI Purchase failed');
}

async function fulfillPaidSession(session) {
  const designId = session.metadata && session.metadata.design_id || session.client_reference_id;
  if (!designId || !/^mc_[a-f0-9]{32}$/i.test(designId)) {
    throw new Error('Missing or invalid design_id on Checkout Session');
  }

  const auth = blobAuth();
  if (!auth) throw new Error('Blob storage authentication is unavailable');

  const designPath = 'orders/designs/' + designId + '.json';
  const design = await readPrivateJson(designPath, auth);
  if (!design) throw new Error('Saved design not found: ' + designId);

  try {
    await writeFunnelEvent('purchase', {
      variant: session.metadata && session.metadata.variant || design.variant,
      currency: String(session.currency || design.currency || '').toUpperCase(),
      country: design.deliveryCountry || '',
      value: Number(session.amount_total || 0) / 100,
      source: 'stripe_webhook'
    }, design.analytics);
  } catch (measurementError) {
    console.error('Purchase funnel measurement failed', session.id, measurementError && measurementError.message);
  }

  console.log(
    'Stripe fulfillment start',
    session.id,
    'design=' + designId,
    'font=' + String(design.font || ''),
    'variant=' + String(design.variant || '')
  );

  // Payment is already confirmed. Advertising measurement must not depend on
  // PDF generation or the downstream Google fulfillment step.
  try {
    const metaResult = await sendMetaPurchase(session, design);
    if (metaResult && metaResult.skipped) {
      console.log('Meta Purchase skipped:', metaResult.skipped, session.id);
    } else {
      console.log('Meta Purchase accepted', session.id);
    }
  } catch (error) {
    console.error('Meta Purchase tracking failed', session.id, error && error.message);
  }

  try {
    const pinterestResult = await sendPinterestCheckout(session, design);
    if (pinterestResult && pinterestResult.skipped) {
      console.log('Pinterest checkout skipped:', pinterestResult.skipped, session.id);
    } else {
      console.log('Pinterest checkout accepted', session.id);
    }
  } catch (error) {
    console.error('Pinterest checkout tracking failed', session.id, error && error.message);
  }

  console.log('PDF generation start', session.id, 'font=' + String(design.font || ''));
  const pdfBytes = await generatePrintPdf(
    design,
    designId,
    session.id,
    session.livemode === false
  );
  console.log('PDF generation complete', session.id, 'bytes=' + pdfBytes.length);

  const shipping = session.shipping_details ||
    (session.collected_information && session.collected_information.shipping_details) ||
    null;

  const order = {
    version: 2,
    paidAt: new Date().toISOString(),
    stripeSessionId: session.id,
    paymentStatus: session.payment_status,
    paymentIntent: session.payment_intent || null,
    amountTotal: session.amount_total,
    currency: session.currency,
    designId,
    variant: session.metadata && session.metadata.variant || design.variant,
    customer: session.customer_details || null,
    shipping,
    phone: design.phone || (session.customer_details && session.customer_details.phone) || '',
    shippingCost: session.total_details && session.total_details.amount_shipping || null,
    size: design.size,
    framed: Boolean(design.framed),
    easel: Boolean(design.easel),
    names: design.names,
    canvasDate: design.date,
    font: design.font,
    fontName: fontName(design.font),
    inks: design.inks,
    guests: design.guests,
    pdfFileName: pdfFileName(design, designId)
  };

  console.log('Google fulfillment start', session.id);
  const google = await sendGoogleFulfillment(order, pdfBytes);
  console.log('Google fulfillment complete', session.id, google.driveUrl || '');

  return { designId, driveUrl: google.driveUrl || null };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return json(res, 503, { error: 'Stripe webhook is not configured.' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) return json(res, 400, { error: 'Missing Stripe signature.' });

  let event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const body = await rawBody(req);
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error('Stripe webhook signature failed', error && error.message);
    return json(res, 400, { error: 'Invalid webhook signature.' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.payment_status === 'paid') {
        await fulfillPaidSession(session);
      }
    } else if (event.type === 'checkout.session.async_payment_succeeded') {
      await fulfillPaidSession(event.data.object);
    }

    return json(res, 200, { received: true });
  } catch (error) {
    console.error('Stripe fulfillment failed', event && event.id, error && error.message);
    return json(res, 500, { error: 'Fulfillment failed.' });
  }
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
