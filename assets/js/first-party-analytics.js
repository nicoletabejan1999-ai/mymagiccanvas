/* Privacy-minimal first-party funnel measurement.
   Records aggregate funnel events on our own server without cookies, localStorage,
   persistent visitor identifiers, IP storage, browser user-agent storage, or
   advertising-platform calls. */
(function () {
  'use strict';

  function attributionContext() {
    const params = new URLSearchParams(location.search);
    let referrerHost = '';
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname : '';
    } catch (_) {}

    return {
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
  }

  function post(url, payload) {
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify(payload)
      }).catch(() => {});
      return true;
    } catch (_) {
      return false;
    }
  }

  const context = attributionContext();

  window.MMCAnalytics = {
    context: function () {
      return { ...context };
    },
    track: function (event, details) {
      return post('/api/funnel-event', {
        event: String(event || ''),
        context,
        details: details && typeof details === 'object' ? details : {}
      });
    }
  };

  post('/api/landing-view', context);
})();
