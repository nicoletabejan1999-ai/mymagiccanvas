/* GTM container GTM-TF75WXX8 for V2 only.
 * Load only after optional analytics/advertising consent.
 * Non-JavaScript iframe deliberately omitted: it cannot read consent state.
 * Custom event names avoid accidentally duplicating V1 and Google Ads tags.
 */
(function () {
  'use strict';

  const CONTAINER_ID = 'GTM-TF75WXX8';
  const CONSENT_KEY = 'mmc-ads-consent-v2';
  let started = false;

  function hasConsent() {
    try { return localStorage.getItem(CONSENT_KEY) === 'accepted'; }
    catch (_) { return false; }
  }

  function start() {
    if (started || !hasConsent()) return false;
    started = true;
    const w = window;
    const d = document;
    const l = 'dataLayer';
    w[l] = w[l] || [];
    w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    const script = d.createElement('script');
    const first = d.getElementsByTagName('script')[0];
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + CONTAINER_ID;
    if (first && first.parentNode) first.parentNode.insertBefore(script, first);
    else d.head.appendChild(script);
    return true;
  }

  function track(ga4Event, values) {
    if (!hasConsent() || !/^[a-z][a-z0-9_]{0,50}$/.test(String(ga4Event))) return false;
    if (!start() && !started) return false;
    window.dataLayer.push({ ecommerce: null });
    const payload = Object.assign({}, values || {});
    window.dataLayer.push({
      event: 'mmc_v2_' + ga4Event,
      landing_version: 'v2',
      ecommerce: payload
    });
    return true;
  }

  window.MMCV2GTM = Object.freeze({ track, start, hasConsent });
  window.addEventListener('mmc:ads-consent', function (e) {
    if (e && e.detail === 'accepted') start();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else start();
})();
