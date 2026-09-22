/* ==========================================================================
   Shared by the three legal pages.

   Company details live in one place (LEGAL in config.js) and are printed
   wherever a page marks a slot with data-legal="fieldName". While any
   required field is still blank the page says so loudly, because a legal
   notice with gaps in it is worse than no page at all.
   ========================================================================== */

(function () {
  'use strict';

  const C = window.MMC;
  const L = C.LEGAL;
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // What the law expects to find. `host.address` is required too, because a
  // site must name who hosts it.
  const REQUIRED = [
    ['companyName',  'registered company name'],
    ['legalForm',    'legal form'],
    ['address',      'registered address'],
    ['registration', 'registration number'],
    ['director',     'person responsible for the site'],
    ['host.address', 'address of the hosting provider']
  ];

  const read = path => path.split('.').reduce((o, k) => (o || {})[k], L);

  function fill() {
    $$('[data-legal]').forEach(node => {
      const key = node.dataset.legal;
      let value = key === 'email' ? (L.email || C.SHOP.email) : read(key);
      if (value) {
        node.textContent = value;
        node.classList.remove('todo');
      } else {
        node.textContent = '[' + (node.dataset.legalLabel || key) + ' — to be completed]';
        node.classList.add('todo');
      }
    });

    $$('[data-shop]').forEach(n => { n.textContent = C.SHOP[n.dataset.shop] || ''; });

    const mail = L.email || C.SHOP.email;
    $$('[data-legal-mail]').forEach(a => { a.href = 'mailto:' + mail; a.textContent = mail; });

    const host = $('[data-legal-host-link]');
    if (host && L.host.url) host.href = L.host.url;
  }

  function warn() {
    const missing = REQUIRED.filter(([k]) => !read(k));
    const box = $('#legalWarn');
    if (!box) return;
    if (!missing.length) { box.remove(); return; }
    box.innerHTML =
      '<strong>This page is not finished.</strong> ' + missing.length + ' of ' +
      REQUIRED.length + ' required details are still blank: ' +
      missing.map(([, label]) => label).join(', ') +
      '. Fill them in <code>assets/js/config.js</code> under <code>LEGAL</code> ' +
      'before taking payments.';
    box.hidden = false;
  }

  /* the year and the "last updated" line */
  function stamp() {
    $$('[data-year]').forEach(n => { n.textContent = new Date().getFullYear(); });
    $$('[data-updated]').forEach(n => { n.textContent = L.updated; });
  }

  /* the privacy policy describes the pixel only when it is actually live */
  function metaState() {
    const on = C.META && C.META.enabled;
    $$('[data-meta="on"]').forEach(n => { n.hidden = !on; });
    $$('[data-meta="off"]').forEach(n => { n.hidden = !!on; });
  }

  function init() { fill(); warn(); stamp(); metaState(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
