/* MyMagiCanvas Google Ads base tag, using Google Consent Mode v2 (advanced).
   Load immediately for Google Ads tag discovery. Without consent, Google may
   send limited, cookieless consent/measurement pings. Advertising storage,
   user-data sharing and personalization remain denied until explicit opt-in.
   This base tag does NOT configure a Purchase conversion event. */
(function () {
  'use strict';

  const ADS_ID = 'AW-18502103911';
  const CONSENT_KEY = 'mmc-ads-consent-v2';

  function hasConsent() {
    try { return localStorage.getItem(CONSENT_KEY) === 'accepted'; }
    catch (_) { return false; }
  }

  function googleConsent(allowed) {
    return {
      ad_storage: allowed ? 'granted' : 'denied',
      ad_user_data: allowed ? 'granted' : 'denied',
      ad_personalization: allowed ? 'granted' : 'denied',
      analytics_storage: 'denied'
    };
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  // Consent defaults MUST precede the first Google tag configuration.
  window.gtag('consent', 'default', googleConsent(hasConsent()));
  window.gtag('set', 'ads_data_redaction', true);
  window.gtag('js', new Date());
  window.gtag('config', ADS_ID);

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ADS_ID);
  document.head.appendChild(script);

  // Update immediately when the visitor accepts or refuses optional cookies.
  window.addEventListener('mmc:ads-consent', function (event) {
    window.gtag('consent', 'update', googleConsent(!!event && event.detail === 'accepted'));
  });
})();
