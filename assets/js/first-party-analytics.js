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

  /* Additional anonymous journey signals. These are deliberately page-local:
     no visitor/session ID is stored and no advertising platform receives them. */
  const sent = Object.create(null);

  function trackOnce(event, details) {
    if (sent[event]) return false;
    sent[event] = true;
    return window.MMCAnalytics.track(event, details || {});
  }

  const heroCta = document.querySelector('.hero__cta a[href="#configurator"]');
  if (heroCta) {
    heroCta.addEventListener('click', function () {
      trackOnce('hero_cta_click', { target: 'configurator' });
    });
  }

  function observeOnce(selector, event, details, threshold) {
    const target = document.querySelector(selector);
    if (!target) return;

    if (!('IntersectionObserver' in window)) {
      return;
    }

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        trackOnce(event, details);
        observer.disconnect();
      });
    }, { threshold: threshold || 0.01 });

    observer.observe(target);
  }

  observeOnce('#configurator', 'configurator_view', { section: 'configurator' }, 0.01);
  observeOnce('#buy', 'pricing_view', { section: 'pricing' }, 0.05);

  function checkScrollDepth() {
    if (sent.scroll_50) return;
    const doc = document.documentElement;
    const maxScroll = Math.max(0, doc.scrollHeight - window.innerHeight);
    const progress = maxScroll === 0 ? 1 : window.scrollY / maxScroll;
    if (progress >= 0.5) {
      trackOnce('scroll_50', { depthPercent: 50 });
      window.removeEventListener('scroll', checkScrollDepth);
    }
  }

  window.addEventListener('scroll', checkScrollDepth, { passive: true });
  checkScrollDepth();

  let visibleStartedAt = document.visibilityState === 'visible' ? performance.now() : null;
  let visibleMs = 0;
  let engagedTimer = null;

  function scheduleEngagedTimer() {
    if (sent['engaged_30s'] || document.visibilityState !== 'visible') return;
    if (engagedTimer) clearTimeout(engagedTimer);

    const currentVisibleMs = visibleStartedAt == null ? 0 : performance.now() - visibleStartedAt;
    const remaining = Math.max(0, 30000 - visibleMs - currentVisibleMs);

    engagedTimer = setTimeout(function () {
      trackOnce('engaged_30s', { visibleSeconds: 30 });
    }, remaining);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      visibleStartedAt = performance.now();
      scheduleEngagedTimer();
      return;
    }

    if (visibleStartedAt != null) {
      visibleMs += performance.now() - visibleStartedAt;
      visibleStartedAt = null;
    }
    if (engagedTimer) {
      clearTimeout(engagedTimer);
      engagedTimer = null;
    }
  });

  scheduleEngagedTimer();
})();
