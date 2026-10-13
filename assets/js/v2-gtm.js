/* GTM-TF75WXX8 is present in V2 <head> for Tag Assistant discovery.
 * Normal visitors: GA4 ecommerce events require optional analytics consent.
 * Temporary QA sessions opened with ?analytics_test=1:
 *   GA4 and the V2 GTM event bridge work without accepting the consent banner.
 *   This diagnostic exception expires on 20 October 2026 at 23:59 Paris time.
 * Meta Pixel, Pinterest and ad_user_data remain consent-dependent.
 */
(function () {
  'use strict';

  const CONSENT_KEY = 'mmc-ads-consent-v2';
  const TEST_KEY = 'mmc-v2-analytics-test-until';
  const TEST_UNTIL = Date.parse('2026-10-20T21:59:00Z');

  function isTestSession() {
    if (Date.now() >= TEST_UNTIL) return false;
    try {
      const query = new URLSearchParams(location.search);
      if (query.get('analytics_test') === '1') {
        sessionStorage.setItem(TEST_KEY, String(TEST_UNTIL));
        return true;
      }
      return sessionStorage.getItem(TEST_KEY) === String(TEST_UNTIL);
    } catch (_) { return false; }
  }

  function hasAdsConsent() {
    try { return localStorage.getItem(CONSENT_KEY) === 'accepted'; }
    catch (_) { return false; }
  }

  function analyticsAllowed() {
    return hasAdsConsent() || isTestSession();
  }

  function applyAnalyticsConsent() {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: analyticsAllowed() ? 'granted' : 'denied'
      });
    }
  }

  // This script follows the existing default-denied Google Consent Mode
  // initializer, and runs BEFORE the GTM container snippet.
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
      analytics_test_mode: isTestSession(),
      ecommerce: Object.assign({}, values || {})
    });
    return true;
  }

  function labelTestSession() {
    if (!isTestSession()) return;
    const copy = document.querySelector('.cookiebar__copy');
    if (!copy) return;
    const note = document.createElement('span');
    note.textContent = ' Diagnostic session: GA4 analytics is active for testing without optional advertising consent. Meta and Pinterest still require your choice.';
    copy.appendChild(note);
  }

  window.MMCV2GTM = Object.freeze({
    track,
    start: () => { applyAnalyticsConsent(); return true; },
    hasConsent: hasAdsConsent,
    analyticsAllowed,
    isTestSession
  });
  window.addEventListener('mmc:ads-consent', applyAnalyticsConsent);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', labelTestSession);
  } else labelTestSession();
})();
