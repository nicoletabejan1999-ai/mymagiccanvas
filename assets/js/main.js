/* ==========================================================================
   Page assembly: renders every data-driven block, wires the configurator
   controls and keeps the buy buttons in sync.
   ========================================================================== */

(function () {
  'use strict';

  const C = window.MMC;
  const X = window.MMCConfigurator;
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderNameText(host, text, font) {
    host.textContent = '';
    String(text).split(/(&)/).forEach(part => {
      if (!part) return;
      if (part === '&' && font && font.ampStand) {
        const amp = document.createElement('span');
        amp.className = 'name-amp-fallback';
        amp.style.fontFamily = font.ampStand;
        amp.textContent = '&';
        host.appendChild(amp);
      } else {
        host.appendChild(document.createTextNode(part));
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════ fonts */

  // The bought fonts are served from assets/fonts/. Until a file is there
  // its entry carries no `file` and nothing is asked for, so the preview
  // falls back to the free stand-in rather than to a missing download.
  function serveFonts() {
    const faces = C.FONTS.concat([C.DATE_FONT]).filter(f => f.file);
    if (!faces.length) return;
    const css = faces.map(f =>
      '@font-face{font-family:"MMC ' + f.name + '";' +
      'src:url("assets/fonts/' + f.file + '") format("' +
      (/\.woff2$/i.test(f.file) ? 'woff2' : /\.woff$/i.test(f.file) ? 'woff' :
       /\.otf$/i.test(f.file) ? 'opentype' : 'truetype') + '");' +
      'font-weight:' + (f.weight || 400) + ';font-display:swap}').join('');
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ══════════════════════════════════════════════════════ static blocks */

  /* ── trust row ── */
  const ICON = {
    star: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4 4.2 13.4l.7-4.3-3.1-3 4.3-.6z"/></svg>',
    box:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1.8l5.6 2.9v6.6L8 14.2l-5.6-2.9V4.7z" stroke-linejoin="round"/><path d="M2.6 4.9L8 7.7l5.4-2.8M8 7.8v6.3"/></svg>',
    pin:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 14.5s5-4.2 5-8A5 5 0 003 6.5c0 3.8 5 8 5 8z" stroke-linejoin="round"/><circle cx="8" cy="6.4" r="1.9"/></svg>',
    clock:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.4 1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function buildTrust() {
    const row = $('#trustRow'); if (!row) return;
    [
      [ICON.star, '<b>' + C.SHOP.rating + '</b> from ' + C.SHOP.reviewCount +
                  ' reviews on ' + C.SHOP.reviewSource],
      [ICON.box,  '<b>' + C.SHOP.salesCount + '</b> canvases sent'],
      [ICON.pin,  '<b>' + C.DELIVERY.scope + '</b> shipping, from ' + C.DELIVERY.from],
      [ICON.clock,'Made &amp; shipped in <b>' + C.DELIVERY.dispatch + '</b>']
    ].forEach(([svg, txt]) => row.appendChild(el('li', '', svg + '<span>' + txt + '</span>')));
  }

  /* ── payment badges ── */
  function buildPayments() {
    $$('[data-pay-badges]').forEach(host => {
      host.innerHTML = '';
      host.appendChild(el('span', 'pay__lbl', esc(host.dataset.payLabel || 'We accept')));
      C.CHECKOUT.methods.forEach(m => {
        const b = el('span', 'pay__b');
        b.style.background = m.bg;
        b.style.color = m.fg;
        if (m.mark === 'mc') b.innerHTML = '<span class="pay__mc"><i></i><i></i></span>';
        b.appendChild(document.createTextNode(m.label));
        b.title = m.label;
        host.appendChild(b);
      });
    });
  }

  /* ── gallery ── */
  function buildGallery() {
    const stage = $('#galStage'), strip = $('#galStrip');
    if (!stage || !strip) return;

    const n = C.GALLERY.length;
    let current = 0;

    /* the picture itself lives in its own layer, under the controls */
    const frame = el('div', 'gal__frame');
    frame.style.cssText = 'position:absolute;inset:0';
    stage.appendChild(frame);

    const arrow = (dir, path) => {
      const b = el('button', 'gal__nav gal__nav--' + dir,
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>');
      b.type = 'button';
      b.setAttribute('aria-label', dir === 'prev' ? 'Previous image' : 'Next image');
      b.addEventListener('click', () => show(dir === 'prev' ? current - 1 : current + 1));
      stage.appendChild(b);
      return b;
    };
    arrow('prev', 'M15 5l-7 7 7 7');
    arrow('next', 'M9 5l7 7-7 7');

    const counter = el('p', 'gal__count');
    counter.setAttribute('aria-live', 'polite');
    stage.appendChild(counter);

    function show(i) {
      i = (i % n + n) % n;              // wrap around at both ends
      current = i;
      const m = C.GALLERY[i];
      frame.innerHTML = '';

      if (m.type === 'video') {
        const v = el('video');
        v.src = m.src; v.poster = m.poster; v.controls = true;
        v.playsInline = true; v.preload = 'metadata';
        v.setAttribute('aria-label', m.alt);
        frame.appendChild(v);
        v.play().catch(() => {});       // browsers may refuse until a tap
      } else {
        const p = el('picture');
        p.innerHTML = '<source srcset="' + m.src + '.webp" type="image/webp">' +
                      '<img src="' + m.src + '.jpg" alt="' + esc(m.alt) + '" width="1400" height="1400">';
        frame.appendChild(p);
      }

      counter.textContent = (i + 1) + ' / ' + n;
      $$('.gal__t', strip).forEach((b, k) => {
        const on = k === i;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    }

    C.GALLERY.forEach((m, i) => {
      const b = el('button', 'gal__t');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', (i + 1) + ' of ' + n + ': ' + m.alt);
      // thumbnails are a few KB each and must never collapse, so no lazy load
      const thumb = m.type === 'video' ? m.poster : m.src + '-thumb.webp';
      b.innerHTML = '<img src="' + thumb + '" alt="" width="320" height="320" decoding="async">' +
        (m.type === 'video'
          ? '<span class="gal__play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg></span>'
          : '');
      b.addEventListener('click', () => show(i));
      strip.appendChild(b);
    });

    /* arrow keys move through the rail */
    strip.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' &&
          e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      show(current + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1));
      $$('.gal__t', strip)[current].focus();
    });

    show(0);
  }

  /* ── production film (second video, off until the file is added) ── */
  function buildFilm() {
    const f = C.PRODUCTION_FILM, sec = $('#production');
    if (!sec || !f.enabled) return;
    sec.hidden = false;
    $('#filmTitle').textContent = f.title;
    $('#filmText').textContent = f.text;
    const v = el('video');
    v.src = f.src; v.poster = f.poster; v.controls = true;
    v.playsInline = true; v.preload = 'none'; v.muted = true; v.loop = true;
    $('#filmMount').appendChild(v);
  }

  /* ── size cards ── */
  function buildSizes() {
    const host = $('#sizeCards'); if (!host) return;
    C.SIZES.forEach(s => {
      const from = C.VARIANTS[s.id] ? C.VARIANTS[s.id].price : null;
      const c = el('article', 'szc');
      c.innerHTML =
        '<div class="szc__h"><span class="szc__l">' + s.label + '</span>' +
        (from != null ? '<span class="szc__p">from ' + X.money(from) + '</span>' : '') + '</div>' +
        '<p class="szc__cm">' + s.cm + '</p>' +
        '<p class="szc__in">' + s.inch + '</p>' +
        '<p class="szc__cap">Comfortable for about <b>' + s.capacity + ' fingerprints</b></p>';
      const b = el('button', 'btn btn--ghost btn--sm', 'Preview size ' + s.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        X.set({ size: s.id });
        $('#configurator').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      c.appendChild(b);
      host.appendChild(c);
    });
  }

  /* ── reviews ── */
  function buildReviews() {
    const src = C.SHOP.reviewSource;
    $('#revTitle').textContent = C.SHOP.rating.toFixed(1) + ' out of 5, from ' +
      C.SHOP.reviewCount + ' clients';
    $('#revSub').textContent = 'Every word below was left by a buyer on ' + src +
      ', across ' + C.SHOP.salesCount + ' orders. ' +
      'We cannot edit them and neither can you.';

    // say it once, plainly, with the mark people recognise
    const badge = $('#revSource');
    if (badge) {
      badge.innerHTML =
        '<span>Verified reviews on</span>' +
        '<picture><source srcset="assets/img/etsy-logo.webp" type="image/webp">' +
        '<img src="assets/img/etsy-logo.png" alt="' + esc(src) + '" width="152" height="72"></picture>';
      if (C.SHOP.etsyShopUrl) {
        const a = el('a', 'rev__src-link', 'Read all ' + C.SHOP.reviewCount + ' on ' + src + ' \u2192');
        a.href = C.SHOP.etsyShopUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        badge.appendChild(a);
      }
    }

    const host = $('#revList');
    C.REVIEWS.forEach(r => {
      host.appendChild(el('article', 'rev',
        '<p class="rev__s" aria-label="' + r.stars + ' out of 5 stars">' + '★'.repeat(r.stars) + '</p>' +
        '<p class="rev__t">' + esc(r.text) + '</p>' +
        '<p class="rev__m"><b>' + esc(r.name) + '</b> · ' + esc(r.date) +
          (r.via ? ' · <span class="rev__via">via ' + esc(r.via) + '</span>' : '') + '</p>'));
    });
  }

  /* ── delivery ── */
  function buildDelivery() {
    const host = $('#shipGrid'); if (!host) return;
    [
      ['Standard', C.DELIVERY.standard, '+ ' + C.DELIVERY.production + ' production'],
      ['Express',  C.DELIVERY.express,  '+ ' + C.DELIVERY.production + ' production']
    ].forEach(([t, d, s]) => host.appendChild(el('div', 'shipc',
      '<p class="shipc__t">' + t + '</p><p class="shipc__d">' + d + '</p><p class="shipc__s">' + s + '</p>')));
  }

  /* ── faq (+ structured data) ── */
  function buildFaq() {
    const host = $('#faqList'); if (!host) return;
    C.FAQ.forEach(f => {
      const d = el('details');
      d.innerHTML = '<summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p>';
      host.appendChild(d);
    });
    const ld = el('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: C.FAQ.map(f => ({
        '@type': 'Question', name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    });
    document.head.appendChild(ld);
  }

  function buildProductLd() {
    const prices = Object.values(C.VARIANTS).map(v => v.price).filter(p => p != null);
    const ld = el('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Product',
      name: 'Fingerprint Tree Guest Book Canvas',
      description: 'Personalised fingerprint tree canvas used as a wedding guest book. Printed and stretched in Europe and shipped worldwide, supplied with four water-washable ink pads and an instruction card.',
      brand: { '@type': 'Brand', name: C.SHOP.name },
      image: ['assets/media/01-olive-tree-wedding-easel.jpg', 'assets/media/10-premium-wooden-framing.jpg'],
      // No aggregateRating here on purpose: these ratings were collected by
      // Etsy, and Google's review-snippet guidelines forbid republishing a
      // third party's ratings as your own structured data.
      offers: {
        '@type': 'AggregateOffer', priceCurrency: C.CHECKOUT.currency,
        lowPrice: Math.min.apply(null, prices), highPrice: Math.max.apply(null, prices),
        offerCount: prices.length, availability: 'https://schema.org/InStock',
        areaServed: 'Worldwide'
      }
    });
    document.head.appendChild(ld);
  }

  /* ── footer ── */
  function buildFooter() {
    $('#ftrShop').textContent = [C.SHOP.tagline, C.SHOP.city].filter(Boolean).join(' · ');
    $('#ftrYear').textContent = '© ' + new Date().getFullYear() + ' ' + C.SHOP.name;
    const mail = $('#ftrMail');
    mail.href = 'mailto:' + C.SHOP.email;
    mail.textContent = C.SHOP.email;
  }

  /* ══════════════════════════════════════════════════ configurator UI */

  function optBtn(cls, html, pressed, onClick) {
    const b = el('button', cls, html);
    b.type = 'button';
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.addEventListener('click', onClick);
    return b;
  }

  const SHIPPING_COUNTRIES = (
    'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
  ).trim().split(/\s+/);

  function buildCountrySelect() {
    const select = $('#shipCountry');
    if (!select) return;
    let display;
    try { display = new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'region' }); }
    catch (_) { display = null; }

    const rows = SHIPPING_COUNTRIES.map(code => ({
      code,
      name: display ? display.of(code) : code
    })).sort((a, b) => a.name.localeCompare(b.name));

    rows.forEach(row => {
      const o = document.createElement('option');
      o.value = row.code;
      o.textContent = row.name;
      select.appendChild(o);
    });
  }

  async function startCheckout(e) {
    e.preventDefault();

    const terms = $('#okTerms');
    const country = $('#shipCountry');
    const err = $('#buyErr');
    const btn = $('#buyBtn');

    if (!terms || !terms.checked) {
      $('#consentErr').hidden = false;
      terms && terms.focus();
      $('.consent').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    $('#consentErr').hidden = true;

    if (!country || !country.value) {
      err.hidden = false;
      err.textContent = 'Please select the delivery country before continuing.';
      country && country.focus();
      return;
    }

    const price = X.priceOf(X.state);
    if (price == null) return;

    const oldText = btn.textContent;
    btn.textContent = 'Opening secure checkout…';
    btn.setAttribute('aria-disabled', 'true');
    err.hidden = true;

    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant: X.variantKey(X.state),
          country: country.value,
          reference: X.reference(X.state)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || 'Checkout could not be started.');
      window.location.assign(data.url);
    } catch (error) {
      btn.textContent = oldText;
      btn.removeAttribute('aria-disabled');
      err.hidden = false;
      err.textContent = error.message || 'Checkout is temporarily unavailable.';
    }
  }

  function buildControls() {
    buildCountrySelect();
    /* size */
    const hSize = $('#optSize');
    C.SIZES.forEach(s => {
      hSize.appendChild(optBtn('opt',
        '<span class="opt__t">' + s.label + '</span><span class="opt__s">' + s.cm + '</span>',
        X.state.size === s.id, () => X.set({ size: s.id })));
    });

    /* finish */
    const hFrame = $('#optFrame');
    [[false, 'Canvas', 'Stretched on wood, ready to hang'],
     [true,  'Framed', 'Premium solid wood frame']].forEach(([v, t, s]) => {
      hFrame.appendChild(optBtn('opt',
        '<span class="opt__t">' + t + '</span><span class="opt__s">' + s + '</span>',
        X.state.framed === v, () => X.set({ framed: v })));
    });

    /* easel */
    const easel = $('#optEasel');
    easel.checked = X.state.easel;
    easel.addEventListener('change', () => X.set({ easel: easel.checked }));

    /* lettering */
    const inNames = $('#inNames'), inDate = $('#inDate');
    inNames.value = X.state.names;
    inDate.value = X.state.date;
    inNames.addEventListener('input', () => X.set({ names: inNames.value }));
    inDate.addEventListener('input', () => X.set({ date: inDate.value }));

    wireNameDrag();

    const hFont = $('#optFont');
    C.FONTS.forEach(f => {
      const b = optBtn('font',
        '<span class="font__s">Emma &amp; Leo</span>' +
        '<span class="font__n">' + f.n + ' · ' + f.name + '</span>',
        X.state.font === f.n, () => X.set({ font: f.n }));
      const sample = $('.font__s', b);
      sample.style.fontFamily = f.css;
      if (f.ampStand) renderNameText(sample, 'Emma & Leo', f);
      // the same point size reads much wider on a serif than on a script,
      // so each sample is set at the size that font is drawn at
      $('.font__s', b).style.fontSize = (1.24 * f.scale).toFixed(2) + 'rem';
      hFont.appendChild(b);
    });

    /* inks */
    const hInks = $('#optInks');
    C.INKS.forEach(i => {
      const b = optBtn('ink',
        '<span class="ink__sw" style="background:' + i.hex + '"></span><span class="ink__n">' + i.n + '</span>',
        X.state.inks.includes(i.n), () => {
          if (!X.toggleInk(i.n)) flashInkLimit();
        });
      b.title = i.n + ' · ' + i.name;
      b.setAttribute('aria-label', 'Ink ' + i.n + ', ' + i.name);
      hInks.appendChild(b);
    });

    const hPal = $('#optPalettes');
    C.PALETTES.forEach(p => {
      const dots = p.inks.map(n =>
        '<i style="background:' + X.inkOf(n).hex + '"></i>').join('');
      hPal.appendChild(optBtn('pal',
        '<span class="pal__d">' + dots + '</span>' + esc(p.name),
        false, () => X.set({ inks: p.inks.slice() })));
    });

    const guests = $('#inGuests');
    guests.value = X.state.guests;
    guests.addEventListener('input', () => X.set({ guests: +guests.value }));

    /* language */
    const hLang = $('#optLang');
    C.CARD_LANGUAGES.forEach(l => {
      hLang.appendChild(optBtn('opt',
        '<span class="opt__t">' + l + '</span>',
        X.state.lang === l, () => X.set({ lang: l })));
    });

    /* consent — the terms box gates checkout, the advertising box never does */
    const okTerms = $('#okTerms'), okAds = $('#okAds');
    okTerms.addEventListener('change', () => {
      if (okTerms.checked) $('#consentErr').hidden = true;
      sync(X.state);
    });
    okAds.addEventListener('change', () => X.set({ ads: okAds.checked }));

    $('#buyBtn').addEventListener('click', startCheckout);
    $('#dockBtn').addEventListener('click', startCheckout);

    /* copy */
    $('#btnCopy').addEventListener('click', async e => {
      const b = e.currentTarget, old = b.textContent;
      try {
        await navigator.clipboard.writeText(X.recap());
        b.textContent = 'Copied';
      } catch (_) {
        const pre = $('#recText'), r = document.createRange();
        r.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        b.textContent = 'Select & copy';
      }
      setTimeout(() => { b.textContent = old; }, 1800);
    });

  }

  function wireNameDrag() {
    const name = $('#pvNames');
    const sheet = $('#sheet');
    if (!name || !sheet) return;

    const initialText = name.textContent;
    name.textContent = '';
    const textNode = document.createElement('span');
    textNode.className = 'sheet__names-text';
    renderNameText(textNode, initialText, X.fontOf(X.state.font));
    const resize = document.createElement('button');
    resize.type = 'button';
    resize.className = 'sheet__names-resize';
    resize.setAttribute('aria-label', 'Resize names');
    resize.title = 'Drag to resize';
    name.append(textNode, resize);

    name.setAttribute('role', 'button');
    name.setAttribute('tabindex', '0');
    name.setAttribute('aria-label', 'Drag the names to reposition them on the canvas');

    let active = null;
    let sizing = null;

    const applyPx = (dx, dy) => {
      name.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px)';
    };

    const clampOffset = (dx, dy) => {
      const sr = active.sheetRect;
      const pad = Math.max(4, sr.width * 0.02);
      const minX = sr.left + pad - active.baseLeft;
      const maxX = sr.right - pad - active.nameWidth - active.baseLeft;
      const minY = sr.top + pad - active.baseTop;
      const maxY = sr.bottom - pad - active.nameHeight - active.baseTop;
      return [
        Math.min(maxX, Math.max(minX, dx)),
        Math.min(maxY, Math.max(minY, dy))
      ];
    };

    name.addEventListener('pointerdown', e => {
      if (e.target === resize) return;
      if (e.button != null && e.button !== 0) return;
      const sr = sheet.getBoundingClientRect();
      const nr = name.getBoundingClientRect();
      const startX = X.state.nameX * sr.width;
      const startY = X.state.nameY * sr.height;
      active = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        startX,
        startY,
        sheetRect: sr,
        baseLeft: nr.left - startX,
        baseTop: nr.top - startY,
        nameWidth: nr.width,
        nameHeight: nr.height
      };
      name.setPointerCapture(e.pointerId);
      name.classList.add('is-dragging');
      sheet.classList.add('is-aligning');
      e.preventDefault();
    });

    name.addEventListener('pointermove', e => {
      if (!active || e.pointerId !== active.id) return;
      const dx = active.startX + (e.clientX - active.x);
      const dy = active.startY + (e.clientY - active.y);
      let [x, y] = clampOffset(dx, dy);

      // Snap the visual centre of the name to the canvas centre when it is
      // close enough to the centre guide.
      const centreX = active.baseLeft + x + active.nameWidth / 2;
      const sheetCentreX = active.sheetRect.left + active.sheetRect.width / 2;
      const snap = Math.max(5, active.sheetRect.width * 0.018);
      const snapped = Math.abs(centreX - sheetCentreX) <= snap;
      if (snapped) x += sheetCentreX - centreX;
      sheet.classList.toggle('is-centred', snapped);

      applyPx(x, y);
      active.nextX = x;
      active.nextY = y;
    });

    const finish = e => {
      if (!active || e.pointerId !== active.id) return;
      const sr = sheet.getBoundingClientRect();
      const x = active.nextX == null ? active.startX : active.nextX;
      const y = active.nextY == null ? active.startY : active.nextY;
      active = null;
      name.classList.remove('is-dragging');
      sheet.classList.remove('is-aligning', 'is-centred');
      X.set({
        nameX: sr.width ? x / sr.width : 0,
        nameY: sr.height ? y / sr.height : 0
      });
    };
    name.addEventListener('pointerup', finish);
    name.addEventListener('pointercancel', finish);

    resize.addEventListener('pointerdown', e => {
      if (e.button != null && e.button !== 0) return;
      e.stopPropagation();
      const sr = sheet.getBoundingClientRect();
      const nr = name.getBoundingClientRect();
      const sheetCentreX = sr.left + sr.width / 2;
      const nameCentreX = nr.left + nr.width / 2;
      sizing = {
        id: e.pointerId,
        x: e.clientX,
        startScale: X.state.nameScale,
        width: nr.width,
        maxWidth: sr.width * 0.92,
        keepCentred: Math.abs(nameCentreX - sheetCentreX) <= Math.max(6, sr.width * 0.02)
      };
      resize.setPointerCapture(e.pointerId);
      name.classList.add('is-sizing');
      sheet.classList.add('is-aligning');
      sheet.classList.toggle('is-centred', sizing.keepCentred);
      e.preventDefault();
    });

    resize.addEventListener('pointermove', e => {
      if (!sizing || e.pointerId !== sizing.id) return;
      const factor = Math.max(0.6, 1 + (e.clientX - sizing.x) / Math.max(60, sizing.width));
      const maxByWidth = sizing.startScale * (sizing.maxWidth / Math.max(1, sizing.width));
      const scale = Math.min(2.2, maxByWidth, Math.max(0.6, sizing.startScale * factor));
      name.style.setProperty('--name-scale-live', scale);
      name.style.fontSize = 'calc(var(--fs-names, 9cqw) * var(--name-scale-live, 1))';
      if (sizing.keepCentred) {
        // nameX = 0 is the natural centred position of this inline element.
        name.style.transform = 'translate(0px,' +
          (X.state.nameY * sheet.clientHeight).toFixed(2) + 'px)';
      }
      sizing.nextScale = scale;
    });

    const finishSize = e => {
      if (!sizing || e.pointerId !== sizing.id) return;
      const scale = sizing.nextScale == null ? sizing.startScale : sizing.nextScale;
      const keepCentred = sizing.keepCentred;
      sizing = null;
      name.classList.remove('is-sizing');
      sheet.classList.remove('is-aligning', 'is-centred');
      name.style.removeProperty('--name-scale-live');
      X.set(keepCentred ? { nameScale: scale, nameX: 0 } : { nameScale: scale });
    };
    resize.addEventListener('pointerup', finishSize);
    resize.addEventListener('pointercancel', finishSize);
  }

  let inkFlash;
  function flashInkLimit() {
    const n = $('#inkCount');
    n.textContent = '— four is the maximum';
    n.style.color = '#A8442E';
    clearTimeout(inkFlash);
    inkFlash = setTimeout(() => { n.style.color = ''; syncInkCount(); }, 1600);
  }
  function syncInkCount() {
    $('#inkCount').textContent = '— ' + X.state.inks.length + ' of ' + C.MAX_INKS + ' chosen';
  }

  /* ══════════════════════════════════════════════════════════════ sync */

  function sync(s) {
    const size = X.sizeOf(s.size);
    const font = X.fontOf(s.font);

    /* preview geometry */
    const sheet = $('#sheet');
    // --ar lives on the scene so the easel spacer can read it too
    $('#scene').style.setProperty('--ar', size.ratio);
    sheet.style.setProperty('--f-names', font.css);
    // Deliberately larger than the original configurator, but fixed: the
    // landing stays simple and the buyer only chooses the text and font.
    sheet.style.setProperty('--fs-names', (9 * font.scale * s.nameScale).toFixed(2) + 'cqw');
    sheet.style.setProperty('--f-date', C.DATE_FONT.css);
    sheet.style.setProperty('--fw-date', C.DATE_FONT.weight);
    // The date sits two physical centimetres above the bottom edge on every
    // real canvas size, so the percentage changes with the canvas height.
    const heightCm = parseFloat(size.cm) / size.ratio;
    sheet.style.setProperty('--date-bottom',
      (C.PREVIEW.dateFromBottomCm / heightCm * 100).toFixed(2) + '%');

    const pvNames = $('#pvNames');
    const pvNamesText = $('.sheet__names-text', pvNames);
    if (pvNamesText) renderNameText(pvNamesText, s.names, font);
    else renderNameText(pvNames, s.names, font);
    pvNames.style.fontSize = '';
    pvNames.style.transform = 'translate(' +
      (s.nameX * sheet.clientWidth).toFixed(2) + 'px,' +
      (s.nameY * sheet.clientHeight).toFixed(2) + 'px)';
    $('#pvDate').textContent = s.date;
    $('#pvDate').style.visibility = s.date.trim() ? 'visible' : 'hidden';

    $('#frame').classList.toggle('is-framed', s.framed);
    $('#easel').hidden = !s.easel;

    /* Draw the canvas to scale, so the three sizes are visibly different.
       On the easel it is measured against the stand, which is a real object
       of a known height. Off the easel the largest canvas fills the frame
       and the smaller ones are drawn beside it in proportion. */
    const scene = $('#scene');
    scene.classList.toggle('is-easel', s.easel);
    const P = C.PREVIEW;
    const widthCm = parseFloat(size.cm);
    const cw = s.easel
      ? widthCm / (P.easelHeightCm * P.easelAspect)   // share of the easel's width
      : widthCm / P.largestCm;                        // share of the preview box
    $('.rig').style.setProperty('--cw', (cw * 100).toFixed(2) + '%');
    scene.style.maxWidth = (s.easel ? 340 : 400) + 'px';
    $('#stageScale').textContent = size.cm + '  ·  ' + size.inch +
      (s.framed ? '  ·  plus the frame' : '');

    /* pressed states */
    const press = (sel, test) => $$(sel + ' > button').forEach((b, i) =>
      b.setAttribute('aria-pressed', test(i) ? 'true' : 'false'));
    press('#optSize',  i => C.SIZES[i].id === s.size);
    press('#optFrame', i => (i === 1) === s.framed);
    press('#optFont',  i => C.FONTS[i].n === s.font);
    press('#optLang',  i => C.CARD_LANGUAGES[i] === s.lang);
    press('#optPalettes', i => {
      const a = C.PALETTES[i].inks.slice().sort().join();
      return a === s.inks.slice().sort().join();
    });
    $$('#optInks > button').forEach((b, i) => {
      const n = C.INKS[i].n, on = s.inks.includes(n);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      const full = !on && s.inks.length >= C.MAX_INKS;
      b.setAttribute('aria-disabled', full ? 'true' : 'false');
    });
    $('#optEasel').checked = s.easel;
    syncInkCount();

    /* what this size holds, right under the canvas */
    $('#fillNote').innerHTML = 'Room for <b>' + size.capacityLabel + '</b>';

    /* guest count drives the size recommendation */
    $('#guestOut').textContent = s.guests;
    const g = $('#inGuests');
    g.style.setProperty('--pct', ((s.guests - g.min) / (g.max - g.min) * 100) + '%');

    const want = X.recommendedSize(s.guests);
    const wantSize = X.sizeOf(want);
    const reco = $('#reco');
    const many = s.guests > C.SIZES[C.SIZES.length - 1].capacity;
    if (want === s.size) {
      reco.className = 'reco is-ok';
      reco.innerHTML = '<b>Size ' + wantSize.label + '</b> is the right fit for ' + s.guests +
        ' guests' + (many ? ' — the largest we make, and the one to pick past 120.' : '.');
    } else {
      reco.className = 'reco';
      reco.innerHTML = 'For ' + s.guests + ' guests we would go with <b>size ' +
        wantSize.label + '</b> — ' + wantSize.cm + '. ' +
        '<button type="button" class="reco__go" data-size="' + want + '">Use size ' +
        wantSize.label + '</button>';
      $('.reco__go', reco).addEventListener('click', e => X.set({ size: e.currentTarget.dataset.size }));
    }
    $$('#optSize > button').forEach((b2, i) =>
      b2.classList.toggle('is-reco', C.SIZES[i].id === want));

    /* price + checkout */
    const price = X.priceOf(s);
    const what = (s.framed ? 'Framed canvas ' : 'Canvas ') + size.label + ' · ' + size.cm +
      (s.easel ? ' · with easel' : '');
    $('#buyWhat').textContent = what;
    $('#buyShip').textContent = 'based on destination';
    $('#buyScope').textContent = C.DELIVERY.scope.toLowerCase();

    const pEl = $('#buyPrice'), btn = $('#buyBtn'), err = $('#buyErr');

    if (price == null) {
      pEl.classList.add('is-quote');
      pEl.textContent = 'Price on request';
      btn.textContent = 'Ask us for a price';
      btn.href = quoteMail(s);
      btn.removeAttribute('aria-disabled');
      err.hidden = false;
      err.textContent = 'This combination is not listed online yet. Send us the design and we will come back with a price the same day.';
    } else {
      pEl.classList.remove('is-quote');
      pEl.innerHTML = X.money(price) + ' <small>+ shipping</small>';
      btn.textContent = 'Continue to secure checkout';
      btn.href = '#';
      btn.removeAttribute('aria-disabled');
      err.hidden = true;
    }

    /* the button stays visibly inert until the terms are accepted */
    const agreed = $('#okTerms') && $('#okTerms').checked;
    btn.classList.toggle('is-locked', !agreed);

    /* recap */
    $('#recText').textContent = X.recap(s);

    /* mobile dock */
    $('#dockWhat').textContent = what;
    $('#dockPrice').textContent = price == null ? 'On request' : X.money(price);
    const dockBtn = $('#dockBtn');
    dockBtn.textContent = price == null ? 'Ask us' : 'Checkout';
    dockBtn.href = price == null ? btn.href : '#configurator';
  }

  function quoteMail(s) {
    const subject = 'Fingerprint tree — ' + X.variantKey(s);
    const body = 'Hello,\n\nI would like this canvas:\n\n' + X.recap(s) +
      '\n\nReference: ' + X.reference(s) + '\n\nThank you!';
    return 'mailto:' + C.SHOP.email +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  }

  /* ══════════════════════════════════════════════════════════ chrome */

  function stickyHeader() {
    const h = $('.hdr');
    const io = new IntersectionObserver(
      ([e]) => h.classList.toggle('is-stuck', !e.isIntersecting),
      { rootMargin: '-1px 0px 0px 0px', threshold: 1 });
    const probe = el('div');
    probe.style.cssText = 'position:absolute;top:0;height:1px;width:1px';
    document.body.prepend(probe);
    io.observe(probe);
  }

  function mobileDock() {
    const dock = $('#dock'), cfg = $('#configurator');
    if (!dock || !cfg) return;
    // show it once the configurator has scrolled off the top
    const io = new IntersectionObserver(([e]) => {
      dock.hidden = e.isIntersecting || e.boundingClientRect.top > 0;
    }, { threshold: 0 });
    io.observe(cfg);
  }

  function reveal() {
    const targets = $$('.sh, .steps li, .card, .szc, .rev, .two__copy, .two__art, .band, .end');
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach((t, i) => {
      t.classList.add('rv');
      t.style.transitionDelay = (Math.min(i % 4, 3) * 60) + 'ms';
      io.observe(t);
    });
  }

  /* Owner-facing reminder, shown only while no Stripe link is configured. */
  function setupNotice() {
    const missing = Object.keys(C.CHECKOUT.links).filter(k => !C.CHECKOUT.links[k]);
    if (!missing.length || sessionStorage.getItem('mmc-setup') === 'off') return;
    const n = el('aside', 'setup',
      '<b>Setup — ' + missing.length + ' of ' + Object.keys(C.CHECKOUT.links).length +
      ' checkout links missing</b>Paste your Stripe Payment Links into ' +
      '<code>assets/js/config.js</code>. Until then those options fall back to email ordering.' +
      '<button type="button" aria-label="Dismiss">×</button>');
    $('button', n).addEventListener('click', () => {
      sessionStorage.setItem('mmc-setup', 'off'); n.remove();
    });
    document.body.appendChild(n);
  }

  /* ════════════════════════════════════════════════════════════ start */

  function init() {
    serveFonts();
    buildTrust();
    buildPayments();
    buildGallery();
    buildFilm();
    buildSizes();
    buildReviews();
    buildDelivery();
    buildFaq();
    buildProductLd();
    buildFooter();

    buildControls();
    X.mount($('#prints'));
    X.onChange(sync);
    sync(X.state);

    // the canopy is sized from the artwork box, so redraw once it lands
    const tree = $('#treeImg');
    if (tree && !tree.complete) tree.addEventListener('load', () => X.render());

    // fonts change the lettering metrics
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => X.render());

    stickyHeader();
    mobileDock();
    reveal();
    // Stripe checkout is created server-side; no static Payment Links are needed.
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
