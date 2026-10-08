/* Google Ads purchase conversion: only after Stripe verifies a paid live Checkout.
   Use the actual product subtotal and Checkout currency, with a stable
   transaction ID. Google Ads deduplicates repeated conversions by ID. */
(function () {
  'use strict';

  const SEND_TO = 'AW-18502103911/0sJkCKr_6pUdEOfmvvZE';
  const SENT_PREFIX = 'mmc-google-ads-purchase-v1:';

  async function run() {
    let sessionId = '';
    try { sessionId = new URLSearchParams(window.location.search).get('session_id') || ''; }
    catch (_) {}

    // Never report demo/test transactions or an unverified thank-you visit.
    if (!/^cs_live_[A-Za-z0-9]+$/.test(sessionId)) return;

    const storageKey = SENT_PREFIX + sessionId;
    try {
      if (sessionStorage.getItem(storageKey) === 'sent') return;
    } catch (_) { /* Google transaction_id also protects against duplicates. */ }

    try {
      const response = await fetch(
        '/api/checkout-summary?session_id=' + encodeURIComponent(sessionId),
        { credentials: 'same-origin', cache: 'no-store' }
      );
      if (!response.ok) return; // Stripe must confirm payment_status === 'paid'.

      const order = await response.json();
      if (!order || order.sessionId !== sessionId) return;

      const value = Number(order.value);
      const currency = String(order.currency || '').toUpperCase();
      if (!Number.isFinite(value) || value <= 0 || !/^(EUR|USD)$/.test(currency)) return;

      // Loaded by Google Consent Mode v2 in the document head.
      if (typeof window.gtag !== 'function') return;

      window.gtag('event', 'conversion', {
        send_to: SEND_TO,
        value: Number(value.toFixed(2)),
        currency: currency,
        transaction_id: sessionId
      });

      try { sessionStorage.setItem(storageKey, 'sent'); }
      catch (_) {}
    } catch (_) {
      // If Stripe or the network is unavailable, never invent a conversion.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
