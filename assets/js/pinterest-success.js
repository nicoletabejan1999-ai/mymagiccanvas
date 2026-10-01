/* Pinterest browser checkout event. Uses the same event_id as CAPI for deduplication. */
(function () {
  'use strict';

  async function run() {
    const api = window.MMCPinterest;
    if (!api || !api.hasConsent || !api.hasConsent()) return;

    let sessionId = '';
    try { sessionId = new URLSearchParams(location.search).get('session_id') || ''; }
    catch (_) {}
    if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) return;

    try {
      const response = await fetch('/api/checkout-summary?session_id=' + encodeURIComponent(sessionId), {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok) return;

      const order = await response.json();
      if (!order || !(Number(order.value) > 0)) return;

      await api.track('checkout', {
        value: Number(order.value),
        order_quantity: Number(order.quantity || 1),
        currency: String(order.currency || 'EUR'),
        order_id: String(order.sessionId),
        event_id: String(order.sessionId),
        line_items: [{
          product_name: String(order.productName || 'Fingerprint Tree Guest Book Canvas'),
          product_id: String(order.productId || 'fingerprint-tree-canvas'),
          product_price: Number(order.value),
          product_quantity: Number(order.quantity || 1),
          product_category: 'Wedding guest book canvas',
          product_brand: 'MyMagiCanvas'
        }]
      });
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
