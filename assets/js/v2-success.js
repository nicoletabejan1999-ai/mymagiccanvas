/* Only a verified paid Stripe session may render V2 order success or Purchase tags. */
(function () {
  'use strict';
  const $ = sel => document.querySelector(sel);
  const ADS_DESTINATION = 'AW-18502103911/0sJkCKr_6pUdEOfmvvZE';
  const ADS_SENT_PREFIX = 'mmc-google-ads-purchase-v1:'; // shared ID dedup with V1
  let confirmedOrder = null;

  function update(title, text, verified) {
    $('#v2SuccessTitle').textContent = title;
    $('#v2SuccessText').textContent = text;
    $('#v2SuccessEyebrow').textContent = verified ? 'Payment successful' : 'Secure checkout';
    $('#v2SuccessDetails').hidden = !verified;
    $('#v2SuccessCheck').hidden = !verified;
  }

  function googleAdsConversion(order) {
    // Same Google Ads conversion as V1, with a Stripe session transaction ID.
    // Never report test payments as live sales.
    if (!order.live || !/^cs_live_[A-Za-z0-9]+$/.test(order.sessionId) ||
        !Number.isFinite(Number(order.value)) || !(Number(order.value) > 0) ||
        !/^(EUR|USD)$/.test(order.currency) || typeof window.gtag !== 'function') return;
    const key = ADS_SENT_PREFIX + order.sessionId;
    try { if (sessionStorage.getItem(key) === 'sent') return; }
    catch (_) {}

    window.gtag('event', 'conversion', {
      send_to: ADS_DESTINATION,
      currency: order.currency,
      value: Number(order.value),
      transaction_id: order.sessionId
    });
    try { sessionStorage.setItem(key, 'sent'); } catch (_) {}
  }

  async function pinterestCheckout() {
    const order = confirmedOrder;
    if (!order || !order.live || !window.MMCPinterest?.hasConsent?.()) return;
    const key = 'mmc-v2-pinterest-purchase:' + order.sessionId;
    try { if (sessionStorage.getItem(key) === 'sent') return; }
    catch (_) {}
    try {
      const ok = await window.MMCPinterest.track('checkout', {
        value: Number(order.value),
        currency: order.currency,
        order_quantity: 1,
        order_id: order.sessionId,
        event_id: order.sessionId, // same as server CAPI for deduplication
        line_items: [{
          product_name: order.itemName,
          product_id: order.itemId,
          product_price: Number(order.value),
          product_quantity: 1,
          product_category: 'Wedding guest book canvas',
          product_brand: 'MyMagiCanvas'
        }]
      });
      if (ok) {
        try { sessionStorage.setItem(key, 'sent'); } catch (_) {}
      }
    } catch (_) {}
  }
  window.addEventListener('mmc:ads-consent', e => {
    if (e.detail === 'accepted') pinterestCheckout();
  });

  async function verify() {
    const sessionId = new URLSearchParams(location.search).get('session_id') || '';
    if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      update('Unable to verify the order', 'No valid payment session was supplied. If you have paid, please contact us.', false);
      return;
    }
    try {
      const response = await fetch(
        '/api/v2-checkout-summary?session_id=' + encodeURIComponent(sessionId),
        { credentials: 'same-origin', cache: 'no-store' }
      );
      if (!response.ok) throw new Error('not verified');
      const order = await response.json();
      if (order.sessionId !== sessionId || !(Number(order.value) > 0)) {
        throw new Error('invalid order');
      }

      update('Thank you for your order.', 'Stripe has confirmed your payment and we have received your personalised order.', true);
      confirmedOrder = order;
      googleAdsConversion(order);
      window.MMCV2Funnel?.recordPurchase?.(order);
      pinterestCheckout();
    } catch (_) {
      update(
        'We could not verify your payment',
        'If your bank shows a charge, please do not pay again. Contact us so we can check your order.',
        false
      );
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', verify);
  else verify();
})();
