/* GTM-TF75WXX8 for MyMagiCanvas V2.
 * TEMPORARY PRODUCTION QA MODE until 27 October 2026, 23:59 Paris:
 * GA4 analytics_storage and V2 funnel events are available without optional
 * advertising opt-in. Meta Pixel has the same temporary V2 exception;
 * Pinterest and advertising user-data consent remain independent.
 * After expiry, analytics once again requires visitor opt-in automatically.
 * Only this V2 script is changed; V1 is unaffected.
 */
(function () {
  'use strict';

  const CONSENT_KEY = 'mmc-ads-consent-v2';
  const TEST_UNTIL = Date.parse('2026-10-27T22:59:00Z');

  function hasAdsConsent() {
    try { return localStorage.getItem(CONSENT_KEY) === 'accepted'; }
    catch (_) { return false; }
  }

  function isTemporaryBypassActive() {
    return Date.now() < TEST_UNTIL;
  }

  function analyticsAllowed() {
    return isTemporaryBypassActive() || hasAdsConsent();
  }

  function applyAnalyticsConsent() {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: analyticsAllowed() ? 'granted' : 'denied'
      });
    }
  }

  // Google Ads' shared tag has already established denied defaults.
  // GTM remains immediately discoverable, with Analytics enabled for QA only.
  applyAnalyticsConsent();

  function track(eventName, values) {
    if (!analyticsAllowed() || !/^[a-z][a-z0-9_]{0,50}$/.test(String(eventName))) {
      return false;
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({
      event: 'mmc_v2_' + eventName,
      landing_version: 'v2',
      analytics_test_mode: isTemporaryBypassActive(),
      ecommerce: Object.assign({}, values || {})
    });
    return true;
  }

  window.MMCV2GTM = Object.freeze({
    track,
    start: () => { applyAnalyticsConsent(); return true; },
    hasConsent: hasAdsConsent,
    analyticsAllowed,
    isTemporaryBypassActive
  });

  window.addEventListener('mmc:ads-consent', applyAnalyticsConsent);
})();
