const Stripe = require('stripe');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return { oidcToken: process.env.VERCEL_OIDC_TOKEN, storeId: process.env.BLOB_STORE_ID };
  }
  return null;
}

async function readDesign(designId, auth) {
  const { get } = await import('@vercel/blob');
  const result = await get('orders/designs/' + designId + '.json', {
    access: 'private',
    useCache: false,
    ...auth
  });
  if (!result || result.statusCode !== 200) return null;
  return JSON.parse(await new Response(result.stream).text());
}

async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(res, 503, { error: 'Stripe secret is unavailable.' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const requestedSessionId = String(req.query && req.query.session_id || '');
  let session;
  if (requestedSessionId) {
    if (!/^cs_test_[A-Za-z0-9]+$/.test(requestedSessionId)) {
      return json(res, 400, { error: 'Invalid Stripe test session_id.' });
    }
    session = await stripe.checkout.sessions.retrieve(requestedSessionId);
  } else {
    const recent = await stripe.checkout.sessions.list({ limit: 10 });
    session = recent.data.find(item =>
      item && item.livemode === false && item.payment_status === 'paid'
    );
    if (!session) return json(res, 404, { error: 'No recent paid test session found.' });
  }

  // This temporary diagnostic route is deliberately test-mode only.
  if (session.livemode !== false) return json(res, 403, { error: 'Live sessions are not allowed.' });

  const designId = session.metadata && session.metadata.design_id || session.client_reference_id;
  const auth = blobAuth();
  const design = designId && auth ? await readDesign(designId, auth) : null;
  const meta = design && design.meta || null;

  const diagnostic = {
    payment_status: session.payment_status,
    livemode: session.livemode,
    design_found: Boolean(design),
    consent: Boolean(meta && meta.consent === true),
    fbp_present: Boolean(meta && meta.fbp),
    fbc_present: Boolean(meta && meta.fbc),
    client_ip_present: Boolean(meta && meta.clientIp),
    user_agent_present: Boolean(meta && meta.userAgent),
    meta_token_configured: Boolean(process.env.META_CAPI_ACCESS_TOKEN),
    meta_test_code_configured: Boolean(process.env.META_TEST_EVENT_CODE),
    pixel_id: process.env.META_PIXEL_ID || '4206777262800081'
  };

  if (!design || !meta || meta.consent !== true) {
    return json(res, 200, { diagnostic, send_result: { skipped: 'no_consent_or_design' } });
  }
  if (!process.env.META_CAPI_ACCESS_TOKEN) {
    return json(res, 200, { diagnostic, send_result: { skipped: 'no_token' } });
  }
  if (!process.env.META_TEST_EVENT_CODE) {
    return json(res, 200, { diagnostic, send_result: { skipped: 'test_code_missing' } });
  }

  const userData = {};
  if (meta.fbp) userData.fbp = meta.fbp;
  if (meta.fbc) userData.fbc = meta.fbc;
  if (meta.clientIp) userData.client_ip_address = meta.clientIp;
  if (meta.userAgent) userData.client_user_agent = meta.userAgent;

  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: session.id,
    action_source: 'website',
    event_source_url: meta.eventSourceUrl || 'https://mymagicanvas.com/',
    user_data: userData,
    custom_data: {
      currency: String(session.currency || 'eur').toUpperCase(),
      value: Number(session.amount_total || 0) / 100,
      content_ids: [session.metadata && session.metadata.variant || design.variant],
      content_type: 'product',
      num_items: 1
    }
  };

  const response = await fetch(
    'https://graph.facebook.com/v26.0/' + encodeURIComponent(diagnostic.pixel_id) +
      '/events?access_token=' + encodeURIComponent(process.env.META_CAPI_ACCESS_TOKEN),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [event],
        test_event_code: process.env.META_TEST_EVENT_CODE
      })
    }
  );

  const result = await response.json().catch(() => ({}));
  return json(res, 200, {
    diagnostic,
    send_result: response.ok
      ? { ok: true, events_received: result.events_received ?? null, fbtrace_id: result.fbtrace_id || null }
      : {
          ok: false,
          http_status: response.status,
          error_code: result && result.error && result.error.code || null,
          error_subcode: result && result.error && result.error.error_subcode || null,
          error_message: result && result.error && result.error.message || 'Meta request failed'
        }
  });
}

module.exports = handler;
