/* Pinterest Tag: loads only after optional advertising consent. */
(function () {
  'use strict';

  const CONSENT_KEY = 'mmc-ads-consent-v2';
  let started = false;
  let readyPromise = null;

  function hasConsent() {
    try { return localStorage.getItem(CONSENT_KEY) === 'accepted'; }
    catch (_) { return false; }
  }

  function makeEventId(prefix) {
    try {
      if (crypto && typeof crypto.randomUUID === 'function') {
        return prefix + '_' + crypto.randomUUID();
      }
    } catch (_) {}
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  function installBase(tagId) {
    if (!window.pintrk) {
      window.pintrk = function () {
        window.pintrk.queue.push(Array.prototype.slice.call(arguments));
      };
      window.pintrk.queue = [];
      window.pintrk.version = '3.0';

      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://s.pinimg.com/ct/core.js';
      const first = document.getElementsByTagName('script')[0];
      first.parentNode.insertBefore(script, first);
    }

    window.pintrk('load', tagId);
    window.pintrk('page');
    window.pintrk('track', 'pagevisit', {
      event_id: makeEventId('pagevisit')
    });
  }

  async function start() {
    if (!hasConsent()) return false;
    if (readyPromise) return readyPromise;

    started = true;
    readyPromise = (async function () {
      try {
        const response = await fetch('/api/pinterest-config', {
          credentials: 'same-origin',
          cache: 'no-store'
        });
        if (!response.ok) return false;

        const data = await response.json();
        if (!data || data.enabled !== true || !/^\d{13}$/.test(String(data.tagId || ''))) {
          return false;
        }

        installBase(String(data.tagId));
        return true;
      } catch (_) {
        return false;
      }
    })();

    return readyPromise;
  }

  async function track(eventName, params) {
    if (!eventName || !hasConsent()) return false;
    const ok = await start();
    if (!ok || !window.pintrk) return false;
    try {
      window.pintrk('track', eventName, params || {});
      return true;
    } catch (_) {
      return false;
    }
  }

  window.MMCPinterest = Object.freeze({
    track,
    ready: start,
    hasConsent
  });

  window.addEventListener('mmc:ads-consent', event => {
    if (event && event.detail === 'accepted') start();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
