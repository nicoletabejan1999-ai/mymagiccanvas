const crypto = require('node:crypto');
const Stripe = require('stripe');
const { generatePrintPdf } = require('../lib/order-pdf');

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

  const treePngBytes = await readPrivateBytes('tree-base.png', auth);
  if (!treePngBytes) throw new Error('Print tree PNG not found in Blob: tree-base.png');

  const pdfBytes = await generatePrintPdf(design, designId, session.id, treePngBytes);

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

  const google = await sendGoogleFulfillment(order, pdfBytes);

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
