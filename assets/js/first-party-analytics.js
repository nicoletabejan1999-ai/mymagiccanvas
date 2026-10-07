/* Privacy-minimal first-party landing measurement.
   Records one page-load event on our own server without cookies, localStorage,
   persistent identifiers, IP storage, or advertising-platform calls. */
(function () {
  'use strict';

  try {
    const params = new URLSearchParams(location.search);
    let referrerHost = '';
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname : '';
    } catch (_) {}

    const payload = {
      path: location.pathname || '/',
      referrerHost,
      utmSource: params.get('utm_source') || '',
      utmMedium: params.get('utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || '',
      utmContent: params.get('utm_content') || '',
      utmTerm: params.get('utm_term') || '',
      hasFbclid: params.has('fbclid'),
      hasGclid: params.has('gclid'),
      hasEpik: params.has('epik')
    };

    fetch('/api/landing-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (_) {}
})();
