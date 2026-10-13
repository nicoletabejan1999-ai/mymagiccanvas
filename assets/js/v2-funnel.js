/* V2-only GA4 ecommerce funnel. Public Measurement ID is configured locally
   so analytics does not depend on a serverless config fetch.
   Meta and Pinterest remain separately consent-gated. V1 is unchanged. */
(function () {
  'use strict';

  const CONSENT_KEY = 'mmc-ads-consent-v2';
  const GA4_ID = 'G-XZ1QWMF1DJ'; // Public measurement ID, not a secret.
  let measurementId = '';
  let configured = false;
  let pageSent = false;
  let viewSent = false;
  let metaViewSent = false;
  let product = null;
  let purchase = null;
  let pendingPurchaseId = '';
  const queue = [];

  function allowed() {
    // V2 production QA temporarily allows Analytics before the banner choice.
    // Meta and Pinterest use their own independent advertising-consent checks.
    if (window.MMCV2GTM?.analyticsAllowed?.()) return true;
    try { return localStorage.getItem(CONSENT_KEY) === 'accepted'; }
    catch (_) { return false; }
  }
  const item = p => ({
    item_id: String(p.sku),
    item_name: 'Fingerprint Tree Guest Book Canvas',
    item_brand: 'MyMagiCanvas',
    item_category: 'Wedding guest book',
    price: Number(p.price),
    quantity: 1
  });
  const commerce = p => ({
    currency: p.currency,
    value: Number(p.price),
    items: [item(p)]
  });
  const sentKey = id => 'mmc-v2-ga4-purchase:' + id;

  // V2 GA4 is emitted through the existing Google tag (AW) after the real
  // GA4 stream is configured. GTM receives a separate namespaced dataLayer
  // event for Tag Assistant/debugging and future consent-checked use.
  // Do NOT configure duplicate GA4 tags for mmc_v2_* inside the GTM container.
  function emitGA4(event) {
    if (!configured || !allowed() || !measurementId) return false;
    try {
      window.gtag('event', event.name, Object.assign(
        { send_to: measurementId }, event.params
      ));
      if (event.name === 'purchase' && event.params.transaction_id) {
        try { sessionStorage.setItem(sentKey(event.params.transaction_id), 'sent'); }
        catch (_) {}
      }
      return true;
    } catch (_) { return false; }
  }

  function ga4(name, params) {
    if (!allowed()) return false;
    const event = { name, params: Object.assign({
      landing_version: 'v2',
      analytics_test_mode: Boolean(window.MMCV2GTM?.isTemporaryBypassActive?.()),
      debug_mode: Boolean(window.MMCV2GTM?.isTemporaryBypassActive?.())
    }, params || {}) };
    // One GTM dataLayer event per action. Do not re-push on async GA4 flush.
    window.MMCV2GTM?.track?.(name, event.params);
    if (!configured) {
      if (queue.length < 35) queue.push(event);
      setup();
      return true;
    }
    return emitGA4(event);
  }

  function flush() {
    queue.splice(0).forEach(emitGA4);
  }

  function setup() {
    if (!allowed() || configured || typeof window.gtag !== 'function') return false;
    try {
      // The site already loads the Google tag in <head>, so configure this
      // GA4 property locally before draining funnel events.
      measurementId = GA4_ID;
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
      window.gtag('config', GA4_ID, {
        send_page_view: false,
        debug_mode: Boolean(window.MMCV2GTM?.isTemporaryBypassActive?.())
      });
      configured = true;
      flush();
      return true;
    } catch (_) {
      measurementId = '';
      return false;
    }
  }

  // Preserve marketing attribution without forwarding arbitrary URL values
  // (which could contain personal information) into Analytics.
  function safePageLocation() {
    const cleaned = new URLSearchParams();
    const query = new URLSearchParams(location.search || '');
    for (const key of ['utm_source','utm_medium','utm_campaign',
                       'utm_content','utm_term','gclid','gbraid','wbraid']) {
      const value = query.get(key);
      if (value && value.length <= 240) cleaned.set(key, value);
    }
    const qs = cleaned.toString();
    return location.origin + location.pathname + (qs ? '?' + qs : '');
  }

  function pageViewAndProduct() {
    if (!allowed()) return;
    if (!pageSent) {
      pageSent = true;
      ga4('page_view', {
        page_title: document.title,
        page_location: safePageLocation(),
        page_path: location.pathname
      });
    }
    if (product && !viewSent) {
      viewSent = true;
      ga4('view_item', commerce(product));
    }
    if (product && !metaViewSent) {
      metaViewSent = Boolean(window.MMCMeta?.track?.('ViewContent', {
        content_name: 'Fingerprint Tree Guest Book Canvas',
        content_ids: [product.sku],
        content_type: 'product',
        currency: product.currency,
        value: product.price
      }));
    }
    sendPurchase();
  }

  function setProduct(sku, currency, price) {
    if (!sku || !/^(EUR|USD)$/.test(currency) ||
        !Number.isFinite(Number(price)) || Number(price) <= 0) return;
    product = { sku: String(sku), currency, price: Number(price) };
    pageViewAndProduct();
  }

  function selectItem() {
    if (!product) return;
    ga4('select_item', {
      item_list_name: 'Canvas variants',
      item_list_id: 'v2-canvas-variants',
      ...commerce(product)
    });
  }

  function customise() {
    if (!product) return;
    ga4('customize_product', commerce(product));
  }

  function beginCheckout() {
    if (!product) return;
    ga4('begin_checkout', commerce(product));
  }

  function contactClick(channel, placement) {
    const channels = ['whatsapp','messenger','instagram','email'];
    const placements = ['contact_grid','contact_section','footer','floating'];
    if (!channels.includes(channel) || !placements.includes(placement)) return false;
    return ga4('contact_click', {
      contact_channel: channel,
      contact_placement: placement
    });
  }

  const customSignals = new Set([
    'select_delivery_country',
    'checkout_validation_error',
    'checkout_failed',
    'checkout_cancelled'
  ]);
  function signal(name, values) {
    if (!customSignals.has(name)) return false;
    return ga4(name, values || {});
  }

  function recordPurchase(order) {
    if (!order || !order.live || !/^cs_live_[A-Za-z0-9]+$/.test(order.sessionId) ||
        !/^(EUR|USD)$/.test(order.currency) || !(Number(order.value) > 0)) return;
    purchase = order;
    sendPurchase();
  }

  function sendPurchase() {
    if (!purchase || !allowed()) return;
    const p = purchase;
    const purchaseItem = {
      item_id: String(p.itemId || ''),
      item_name: String(p.itemName || 'Fingerprint Tree Guest Book Canvas'),
      item_brand: 'MyMagiCanvas',
      price: Number(p.value),
      quantity: 1
    };
    let recordedGa4 = false;
    try { recordedGa4 = sessionStorage.getItem(sentKey(p.sessionId)) === 'sent'; }
    catch (_) {}
    if (!recordedGa4 && pendingPurchaseId !== p.sessionId) {
      pendingPurchaseId = p.sessionId;
      ga4('purchase', {
        transaction_id: p.sessionId,
        currency: p.currency,
        value: Number(p.value),
        shipping: Number(p.shipping || 0),
        coupon: p.coupon || undefined,
        items: [purchaseItem]
      });
    }

    const pixelKey = 'mmc-v2-meta-purchase:' + p.sessionId;
    let alreadySent = false;
    try { alreadySent = sessionStorage.getItem(pixelKey) === 'sent'; } catch (_) {}
    if (!alreadySent && window.MMCMeta?.hasConsent?.()) {
      // loadPixel is also called by the cookie consent module when consent is
      // granted on the success page. Use a matching eventID for CAPI dedup.
      if (typeof window.fbq === 'function') {
        try {
          window.fbq('track', 'Purchase', {
            content_ids: [purchaseItem.item_id],
            content_name: purchaseItem.item_name,
            content_type: 'product',
            value: Number(p.amountTotal || p.value),
            currency: p.currency,
            num_items: 1
          }, { eventID: p.sessionId });
          try { sessionStorage.setItem(pixelKey, 'sent'); } catch (_) {}
        } catch (_) {}
      }
    }
  }

  function applyConsent(event) {
    // Rejecting optional advertising consent must not switch off GA4 during
    // the temporary V2 QA interval. The exception automatically expires.
    if (allowed()) {
      setup();
      pageViewAndProduct();
    } else {
      queue.length = 0;
      pendingPurchaseId = '';
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', { analytics_storage: 'denied' });
      }
    }
  }
  window.addEventListener('mmc:ads-consent', applyConsent);

  function init() { pageViewAndProduct(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MMCV2Funnel = Object.freeze({
    setProduct, selectItem, customise, beginCheckout, contactClick, signal, recordPurchase
  });
})();
