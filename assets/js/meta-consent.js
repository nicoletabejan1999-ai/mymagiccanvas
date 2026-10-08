/* Advertising measurement consent. Meta Pixel never loads before explicit opt-in,
   and Pinterest conversion matching data is sent only after the same opt-in. */
(function () {
  'use strict';

  const C = window.MMC;
  // Adding Google Ads expands the set of vendors, so require fresh opt-in.
  const KEY = 'mmc-ads-consent-v2';
  const PREVIOUS_KEY = 'mmc-ads-consent-v1';
  const LEGACY_KEY = 'mmc-meta-consent-v3';
  const PINTEREST_CLICK_KEY = 'mmc-pinterest-click-v1';
  let loaded = false;
  const $ = s => document.querySelector(s);

  function readChoice() {
    try {
      const current = localStorage.getItem(KEY);
      if (current) return current;

      // Preserve an earlier refusal, but ask again after consent scope expands.
      const previous = localStorage.getItem(PREVIOUS_KEY);
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (previous === 'rejected' || legacy === 'rejected') {
        localStorage.setItem(KEY, 'rejected');
        return 'rejected';
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function saveChoice(value) {
    try { localStorage.setItem(KEY, value); }
    catch (_) {}
  }

  function cookieValue(name) {
    const prefix = name + '=';
    const row = document.cookie.split('; ').find(v => v.indexOf(prefix) === 0);
    if (!row) return '';
    try { return decodeURIComponent(row.slice(prefix.length)); }
    catch (_) { return row.slice(prefix.length); }
  }

  function currentPinterestClickId() {
    if (readChoice() !== 'accepted') return '';
    let clickId = cookieValue('_epik');
    if (!clickId) {
      try { clickId = new URLSearchParams(location.search).get('epik') || ''; }
      catch (_) {}
    }
    if (!clickId) {
      try { clickId = localStorage.getItem(PINTEREST_CLICK_KEY) || ''; }
      catch (_) {}
    }
    return String(clickId || '').trim().slice(0, 512);
  }

  function capturePinterestClickId() {
    const clickId = currentPinterestClickId();
    if (!clickId) return;
    try { localStorage.setItem(PINTEREST_CLICK_KEY, clickId); }
    catch (_) {}
  }

  function clearPinterestClickId() {
    try { localStorage.removeItem(PINTEREST_CLICK_KEY); }
    catch (_) {}
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

  function applyChoice(value) {
    if (value === 'accepted') {
      capturePinterestClickId();
      if (window.fbq && loaded) fbq('consent', 'grant');
      else loadPixel();
    } else {
      clearPinterestClickId();
      if (window.fbq) fbq('consent', 'revoke');
    }

    try {
      window.dispatchEvent(new CustomEvent('mmc:ads-consent', { detail: value }));
    } catch (_) {}
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

  function checkoutContext() {
    if (!hasConsent()) return { consent: false };
    capturePinterestClickId();
    return {
      consent: true,
      fbp: cookieValue('_fbp').slice(0, 255),
      fbc: cookieValue('_fbc').slice(0, 255),
      pinterestClickId: currentPinterestClickId()
    };
  }

  window.MMCMeta = Object.freeze({ track, hasConsent, checkoutContext });

  function closePanel() {
    const bar = $('#cookieBar');
    if (bar) bar.hidden = true;
    document.body.classList.remove('cookie-open');
  }

  function showPanel(force) {
    const bar = $('#cookieBar');
    if (!bar) return;
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