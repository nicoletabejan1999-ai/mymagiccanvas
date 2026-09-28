/* ==========================================================================
   Meta Pixel consent.
   Independent from the configurator so the consent UI still works even if
   another page script fails. Meta is never requested before explicit opt-in.
   ========================================================================== */
(function () {
  'use strict';

  const C = window.MMC;
  const KEY = 'mmc-meta-consent-v2';
  let loaded = false;

  const $ = s => document.querySelector(s);

  function readChoice() {
    try { return localStorage.getItem(KEY); }
    catch (_) { return null; }
  }

  function saveChoice(value) {
    try { localStorage.setItem(KEY, value); }
    catch (_) { /* The current choice still applies for this page view. */ }
  }

  function loadPixel() {
    if (loaded || !C || !C.META || !C.META.enabled || !C.META.pixelId) return;
    loaded = true;

    !function(f,b,e,v,n,t,s) {
      if (f.fbq) return;
      n=f.fbq=function(){ n.callMethod ?
        n.callMethod.apply(n,arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq=n;
      n.push=n; n.loaded=!0; n.version='2.0'; n.queue=[];
      t=b.createElement(e); t.async=!0; t.src=v;
      s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    fbq('consent', 'grant');
    fbq('init', C.META.pixelId);
    fbq('track', 'PageView');
  }

  function hasConsent() {
    return readChoice() === 'accepted';
  }

  function track(eventName, params) {
    if (!eventName || !hasConsent()) return false;
    if (!loaded) loadPixel();
    if (!window.fbq) return false;
    try {
      if (params && Object.keys(params).length) fbq('track', eventName, params);
      else fbq('track', eventName);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Single public tracking surface for the rest of the site. It never sends
  // anything before advertising consent has been granted.
  window.MMCMeta = Object.freeze({ track, hasConsent });

  function closePanel() {
    const bar = $('#cookieBar');
    if (bar) bar.hidden = true;
    document.body.classList.remove('cookie-open');
  }

  function applyChoice(value) {
    if (value === 'accepted') {
      if (window.fbq && loaded) fbq('consent', 'grant');
      else loadPixel();
    } else if (window.fbq) {
      fbq('consent', 'revoke');
    }
  }

  function showPanel(force) {
    const bar = $('#cookieBar');
    if (!bar || !C || !C.META || !C.META.enabled || !C.META.pixelId) return;

    const choice = readChoice();
    if (choice && !force) {
      applyChoice(choice);
      return;
    }

    bar.hidden = false;
    document.body.classList.add('cookie-open');
  }

  function init() {
    const accept = $('#metaAccept');
    const reject = $('#metaReject');
    if (!accept || !reject) return;

    accept.addEventListener('click', () => {
      saveChoice('accepted');
      applyChoice('accepted');
      closePanel();
    });

    reject.addEventListener('click', () => {
      saveChoice('rejected');
      applyChoice('rejected');
      closePanel();
    });

    const settings = $('#cookieSettings');
    if (settings) settings.addEventListener('click', () => showPanel(true));

    showPanel(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
