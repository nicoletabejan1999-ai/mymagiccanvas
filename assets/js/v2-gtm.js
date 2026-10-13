/* V2 GTM event bridge. GTM-TF75WXX8 loads immediately from the canonical
 * <head> snippet, so Tag Assistant can identify it before cookie consent.
 * Events are only sent after optional analytics/advertising consent.
 * Configure consent checks for each tag within the GTM container as well.
 */
(function () {
  'use strict';

  const CONSENT_KEY = 'mmc-ads-consent-v2';

  function hasConsent() {
    try { return localStorage.getItem(CONSENT_KEY) === 'accepted'; }
    catch (_) { return false; }
  }

  function applyAnalyticsConsent(granted) {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: granted ? 'granted' : 'denied'
      });
    }
  }

  // Google Ads' existing shared tag has already set default consent in <head>.
  // Update V2 analytics permission before the container handles page events.
  applyAnalyticsConsent(hasConsent());

  function track(eventName, values) {
    if (!hasConsent() || !/^[a-z][a-z0-9_]{0,50}$/.test(String(eventName))) return false;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({
      event: 'mmc_v2_' + eventName,
      landing_version: 'v2',
      ecommerce: Object.assign({}, values || {})
    });
    return true;
  }

  window.MMCV2GTM = Object.freeze({
    track,
    start: () => { applyAnalyticsConsent(hasConsent()); return true; },
    hasConsent
  });

  window.addEventListener('mmc:ads-consent', function (event) {
    applyAnalyticsConsent(Boolean(event && event.detail === 'accepted'));
  });
})();
