/* MyMagiCanvas — Variant B product card and optional full designer.
   The original MMC + MMCConfigurator + checkout modules remain the only
   source of pricing, product options, shipping and payment. */
(function () {
  'use strict';

  const C = window.MMC;
  const X = window.MMCConfigurator;
  if (!C || !X) return;

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const section = $('#configurator');
  if (!section) return;

  let lastOpener = null;

  function syncListing() {
    const state = X.state;
    const size = $('#v2Size');
    const names = $('#v2Names');
    const date = $('#v2Date');
    const price = $('#v2Price');

    if (size && size.value !== state.size) size.value = state.size;
    if (names && document.activeElement !== names) names.value = state.names;
    if (date && document.activeElement !== date) date.value = state.date;

    // The original configurator is the only checkout source of truth.
    // Keep its ordinary fields in step with the quick choices as well.
    if ($('#inNames') && document.activeElement !== $('#inNames')) $('#inNames').value = state.names;
    if ($('#inDate') && document.activeElement !== $('#inDate')) $('#inDate').value = state.date;

    const amount = X.priceOf(state);
    if (price) price.textContent = amount == null ? 'Price on request' : X.money(amount);
  }

  function setExpanded(open) {
    section.hidden = !open;
    document.body.classList.toggle('v2-config-open', open);
    $$('[data-open-configurator]').forEach(button =>
      button.setAttribute('aria-expanded', String(open)));
  }

  function openDesigner(source) {
    if (source instanceof HTMLElement) lastOpener = source;
    setExpanded(true);

    // When mounted while hidden, the canvas can initially have zero width.
    // A layout frame after the section opens restores the real-size preview.
    requestAnimationFrame(() => {
      try { X.render(); } catch (_) { /* main module may still be loading */ }
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      requestAnimationFrame(() => {
        try { X.render(); } catch (_) { /* mount will redraw on resize */ }
      });
    });
  }

  function closeDesigner() {
    setExpanded(false);
    if (location.hash === '#configurator' && window.history.replaceState) {
      window.history.replaceState(null, '', location.pathname + location.search + '#product-details');
    }
    const target = lastOpener && lastOpener.isConnected ? lastOpener : $('[data-open-configurator]');
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function boot() {
    const rating = $('#v2Rating');
    const reviewLink = $('#v2ReviewLink');
    const summary = $('#v2ReviewSummary');
    const quote = $('#v2Quote');
    if (rating) rating.textContent = Number(C.SHOP.rating).toFixed(1) + ' / 5';
    if (reviewLink) reviewLink.textContent = C.SHOP.reviewCount + ' reviews on ' + C.SHOP.reviewSource;
    if (summary) summary.textContent = C.SHOP.reviewCount + ' customer reviews on ' +
      C.SHOP.reviewSource + ' · ' + Number(C.SHOP.rating).toFixed(1) + ' / 5.';
    if (quote && C.REVIEWS.length) {
      const review = C.REVIEWS[0];
      quote.textContent = '“' + review.text + '” — ' + review.name + ', via ' + review.via;
    }

    $('#v2Size').addEventListener('change', e => X.set({ size: e.target.value }));
    $('#v2Names').addEventListener('input', e => X.set({ names: e.target.value }));
    $('#v2Date').addEventListener('input', e => X.set({ date: e.target.value }));
    $$('[data-open-configurator]').forEach(button =>
      button.addEventListener('click', () => openDesigner(button)));
    $('#v2DesignerClose').addEventListener('click', closeDesigner);

    // Header, footer, hero, size cards and sticky checkout all link to
    // #configurator on the original page. They must reveal it in V2.
    document.addEventListener('click', event => {
      const a = event.target.closest && event.target.closest('a[href="#configurator"]');
      if (!a) return;
      event.preventDefault();
      openDesigner(a);
    }, true);

    X.onChange(syncListing);
    syncListing();

    // Pricing switches automatically by market/currency in main.js.
    // Observe the existing checkout price, rather than keeping a second
    // price list or inventing a fixed currency for this variant.
    const originalPrice = $('#buyPrice');
    if (originalPrice && window.MutationObserver) {
      new MutationObserver(syncListing).observe(originalPrice, {
        childList: true, characterData: true, subtree: true
      });
    }

    if (location.hash === '#configurator') openDesigner(null);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
