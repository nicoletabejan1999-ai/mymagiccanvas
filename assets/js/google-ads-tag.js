/* MyMagiCanvas Google Ads base tag (AW-18502103911).
   The browser does not request Google's advertising script before explicit opt-in.
   This base tag alone does not record a purchase conversion. */
(function () {
  'use strict';

  const ADS_ID = 'AW-18502103911';
  const CONSENT_KEY = 'mmc-ads-consent-v2';
  let loaded = false;

  function hasConsent() {
    try { return localStorage.getItem(CONSENT_KEY) === 'accepted'; }
    catch (_) { return false; }
  }

  function applyConsent(allowed) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('consent', 'update', {
      ad_storage: allowed ? 'granted' : 'denied',
      ad_user_data: allowed ? 'granted' : 'denied',
      ad_personalization: allowed ? 'granted' : 'denied',
      analytics_storage: 'denied'
    });
  }

  function start() {
    if (!hasConsent()) return;
    if (loaded) {
      applyConsent(true);
      return;
    }

    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };

    // Set Google Consent Mode defaults before initiating the tag.
    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied'
    });
    window.gtag('js', new Date());
    applyConsent(true);
    window.gtag('config', ADS_ID);

    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ADS_ID);
    document.head.appendChild(tag);
  }

  window.addEventListener('mmc:ads-consent', function (event) {
    if (event && event.detail === 'accepted') start();
    else applyConsent(false);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
