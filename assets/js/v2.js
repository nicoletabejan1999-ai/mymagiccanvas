/* MyMagiCanvas LP V2 — self-contained storefront.
   No full configurator, no duplicated price catalog, original index untouched. */
(function () {
  'use strict';
  const C = window.MMC;
  const X = window.MMCConfigurator;
  const Pricing = window.MMCPricing;
  if (!C || !X || !Pricing) return;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const esc = text => String(text).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const element = (tag, className, markup) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (markup != null) el.innerHTML = markup;
    return el;
  };

  let marketCountry = '';
  let currency = 'EUR';
  let checkoutBusy = false;
  let wasCustomised = false;
  let galleryShow = () => {};
  const formats = {
    canvas: { framed: false, easel: false, media: 2,
      caption: 'Classic stretched canvas, ready to hang. The display easel is an optional accessory.' },
    framed: { framed: true, easel: false, media: 9,
      caption: 'Premium solid-wood frame around the printed canvas, shown in the selected photograph.' },
    easel: { framed: false, easel: true, media: 8,
      caption: 'Tall wooden display easel included with the canvas. Suitable for all three canvas sizes.' },
    both: { framed: true, easel: true, media: 12,
      caption: 'Two real product photos: premium wooden frame and tall display easel. Both are included.' }
  };

  function trackFirstParty(event, extra) {
    const analytics = window.MMCAnalytics;
    if (!analytics || typeof analytics.track !== 'function') return;
    analytics.track(event, Object.assign({
      variant: X.variantKey(X.state),
      currency: C.CHECKOUT.currency,
      value: Number((priceCents() / 100).toFixed(2)),
      pageVersion: 'v2'
    }, extra || {}));
  }

  function commerceParams() {
    return {
      content_name: 'Fingerprint Tree Guest Book Canvas',
      content_ids: [X.variantKey(X.state)],
      content_type: 'product',
      num_items: 1,
      currency: C.CHECKOUT.currency,
      value: Number((priceCents() / 100).toFixed(2))
    };
  }

  function trackCustomise() {
    if (wasCustomised) return;
    wasCustomised = true;
    trackFirstParty('customize_start');
    window.MMCMeta?.track?.('CustomizeProduct', commerceParams());
  }

  const saleCents = cents => Math.round(cents * 0.90);
  function priceCents(state = X.state) {
    const catalog = Pricing.catalogs[currency];
    return saleCents(catalog.prices[X.baseVariantKey(state)]) +
      (state.easel ? saleCents(catalog.easel) : 0) +
      X.extraInkCount(state) * saleCents(catalog.extraInk);
  }

  function money(cents) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  }

  function formatOfState() {
    return X.state.framed ? (X.state.easel ? 'both' : 'framed') :
      (X.state.easel ? 'easel' : 'canvas');
  }

  function amount(format, size) {
    const option = formats[format];
    const baseKey = (option.framed ? 'FRAMED-' : '') + size;
    const catalog = Pricing.catalogs[currency];
    return saleCents(catalog.prices[baseKey]) + (option.easel ? saleCents(catalog.easel) : 0);
  }

  // The mobile browser renders this as a native pick-list like Etsy.
  // Values are real Stripe SKU keys; labels are built from the shared catalog.
  const variants = [
    ['S', 'S', 'canvas'],
    ['M', 'M', 'canvas'],
    ['L', 'L', 'canvas'],
    ['FRAMED-S', 'FRAMED S', 'framed'],
    ['FRAMED-M', 'FRAMED M', 'framed'],
    ['FRAMED-L', 'FRAMED L', 'framed'],
    ['S-EASEL', 'S + EASEL', 'easel'],
    ['M-EASEL', 'M + EASEL', 'easel'],
    ['L-EASEL', 'L + EASEL', 'easel'],
    ['FRAMED-S-EASEL', 'FRAMED S + EASEL', 'both'],
    ['FRAMED-M-EASEL', 'FRAMED M + EASEL', 'both'],
    ['FRAMED-L-EASEL', 'FRAMED L + EASEL', 'both']
  ];

  function refreshVariantOptions() {
    const select = $('#v2Size');
    variants.forEach(([sku, label, format], index) => {
      let option = select.options[index];
      if (!option || option.value !== sku) {
        option = new Option('', sku);
        select.add(option, index);
      }
      const size = sku.replace(/^FRAMED-/, '').replace(/-EASEL$/, '');
      option.textContent = label + ' (' + money(amount(format, size)) + ')';
    });
    while (select.options.length > variants.length) select.remove(select.options.length - 1);
  }

  function selectVariant(sku, fromCustomer = true) {
    const variant = variants.find(([key]) => key === sku);
    if (!variant) return;
    const [key, , format] = variant;
    const size = key.replace(/^FRAMED-/, '').replace(/-EASEL$/, '');
    const flags = formats[format];
    const sizeData = C.SIZES.find(item => item.id === size);
    X.set({ size, framed: flags.framed, easel: flags.easel, guests: sizeData.capacity });
    galleryShow(flags.media);
    $('#v2GalleryCaption').textContent = flags.caption;
    updatePrices();
    if (fromCustomer) trackCustomise();
  }

  function updatePrices() {
    const s = X.state;
    const total = priceCents(s);
    const regularTotal = Pricing.total(currency, X.baseVariantKey(s), s.easel, X.extraInkCount(s));
    $('#v2RegularPrice').textContent = regularTotal == null ? '' : money(regularTotal);
    $('#v2Price').textContent = total == null ? 'Price on request' : money(total);
    refreshVariantOptions();
    // Maximum real saving across the 12 purchasable format/size combinations.
    // Uses the same per-item cent rounding as our V2 Stripe checkout.
    const catalog = Pricing.catalogs[currency];
    const largestSaving = Math.max(...C.SIZES.flatMap(size =>
      Object.entries(formats).map(([format, option]) => {
        const key = (option.framed ? 'FRAMED-' : '') + size.id;
        const regular = catalog.prices[key] + (option.easel ? catalog.easel : 0);
        return regular - amount(format, size.id);
      })
    ));
    const heroSavings = $('#v2HeroSavingsAmount');
    if (heroSavings) {
      heroSavings.textContent = money(largestSaving);
      heroSavings.closest('.v2-hero-savings')?.setAttribute(
        'aria-label', 'Save up to ' + money(largestSaving) + ' with 10% off');
    }
    $('#v2Size').value = X.variantKey(s);
    const country = $('#v2Country').value;
    const shipping = Pricing.catalogs[currency].shipping[Pricing.zone(country || marketCountry)];
    $('#v2Shipping').textContent = country
      ? 'Standard shipping ' + money(shipping.standard) + ' · Express ' + money(shipping.express) + '. Choose at checkout.'
      : 'Select your delivery country to see shipping prices.';
    const dockPrice = $('#dockPrice');
    if (dockPrice) dockPrice.textContent = money(total ?? 0);
    const dockWhat = $('#dockWhat');
    if (dockWhat) dockWhat.textContent = 'Canvas ' + s.size + ' · ' +
      (formatOfState() === 'canvas' ? 'stretched canvas' : formatOfState() === 'framed' ?
        'wooden frame' : formatOfState() === 'easel' ? 'with easel' : 'frame + easel');
    const basePrices = C.SIZES.map(v => Pricing.catalogs[currency].prices[v.id]);
    $$('#sizeCards .szc').forEach((el, i) => {
      const price = el.querySelector('.szc__p');
      if (price) price.textContent = 'from ' + money(saleCents(basePrices[i])) + ' · −10%';
    });
  }

  function applyCurrency() {
    currency = Pricing.currencyFor($('#v2Country').value || marketCountry);
    const catalog = Pricing.catalogs[currency];
    C.CHECKOUT.currency = currency;
    C.CHECKOUT.currencySymbol = currency === 'USD' ? '$' : '€';
    Object.keys(catalog.prices).forEach(key =>
      C.VARIANTS[key] = { price: catalog.prices[key] / 100 });
    C.EASEL_PRICE = catalog.easel / 100;
    C.EXTRA_INK_PRICE = catalog.extraInk / 100;
    updatePrices();
    productStructuredData();
  }

  function gallery() {
    const list = C.GALLERY.concat([{
      type: 'duo', alt: 'Both products: premium wooden frame and tall display easel'
    }]);
    const stage = $('#galStage');
    const strip = $('#galStrip');
    const frame = element('div', 'gal__frame');
    frame.style.cssText = 'position:absolute;inset:0';
    stage.appendChild(frame);
    const count = element('p', 'gal__count');
    count.setAttribute('aria-live', 'polite');
    let active = 0;
    const arrow = (dir, path) => {
      const b = element('button', 'gal__nav gal__nav--' + dir,
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>');
      b.type = 'button'; b.setAttribute('aria-label', dir === 'prev' ? 'Previous image' : 'Next image');
      b.addEventListener('click', () => galleryShow(active + (dir === 'prev' ? -1 : 1)));
      stage.appendChild(b);
    };
    arrow('prev', 'M15 5l-7 7 7 7');
    arrow('next', 'M9 5l7 7-7 7');
    stage.appendChild(count);

    galleryShow = n => {
      active = (n + list.length) % list.length;
      const media = list[active];
      frame.replaceChildren();
      if (media.type === 'duo') {
        const duo = element('div', 'v2-gallery-duo',
          '<figure><img src="assets/media/10-premium-wooden-framing.webp" alt="Premium frame option" loading="lazy"><figcaption>Wood frame</figcaption></figure>' +
          '<figure><img src="assets/media/09-optional-easel.webp" alt="Tall wooden easel option" loading="lazy"><figcaption>Display easel</figcaption></figure>');
        frame.appendChild(duo);
      } else if (media.type === 'video') {
        const video = element('video');
        video.src = media.src;
        video.poster = media.poster;
        video.preload = 'metadata';
        video.controls = true;
        video.playsInline = true;
        video.setAttribute('aria-label', media.alt);
        frame.appendChild(video);
      } else {
        const picture = element('picture');
        picture.innerHTML = '<source srcset="' + media.src + '.webp" type="image/webp">' +
          '<img src="' + media.src + '.jpg" alt="' + esc(media.alt) + '" width="1400" height="1400">';
        frame.appendChild(picture);
      }
      count.textContent = (active + 1) + ' / ' + list.length;
      $$('.gal__t').forEach((button, i) => {
        button.setAttribute('aria-selected', String(i === active));
        button.tabIndex = i === active ? 0 : -1;
      });
      const activeButton = $$('.gal__t')[active];
      if (activeButton && activeButton.scrollIntoView) {
        activeButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };
    list.forEach((media, i) => {
      const button = element('button', 'gal__t');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-label', (i + 1) + ' of ' + list.length + ': ' + media.alt);
      const thumb = media.type === 'video' ? media.poster :
        media.type === 'duo' ? 'assets/media/10-premium-wooden-framing-thumb.webp' :
        media.src + '-thumb.webp';
      button.innerHTML = '<img src="' + thumb + '" alt="" width="320" height="320" decoding="async">' +
        (media.type === 'video' ? '<span class="gal__play">▶</span>' : '');
      button.addEventListener('click', () => galleryShow(i));
      strip.appendChild(button);
    });
    strip.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      galleryShow(active + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1));
      $$('.gal__t')[active]?.focus();
    });
    galleryShow(2);
  }

  function swatchButton(ink) {
    const button = element('button', 'v2-ink',
      '<span class="v2-ink__colour" style="background:' + ink.hex + '"></span>' +
      '<span class="v2-ink__name">' + esc(ink.name) + '</span>');
    button.type = 'button';
    button.title = 'Colour ' + ink.n + ': ' + ink.name;
    button.setAttribute('aria-label', 'Select ink colour ' + ink.n + ', ' + ink.name);
    button.dataset.ink = ink.n;
    button.addEventListener('click', () => {
      const next = X.state.inks.slice();
      const index = next.indexOf(ink.n);
      if (index >= 0) {
        if (next.length === 1) {
          $('#v2InkStatus').textContent = 'Please keep at least one ink colour.';
          return;
        }
        next.splice(index, 1);
      } else if (next.length >= 4) {
        $('#v2InkStatus').textContent = 'Four colours are included. Deselect one to choose another.';
        return;
      } else {
        next.push(ink.n);
      }
      X.set({ inks: next });
      updateInks();
      trackCustomise();
    });
    return button;
  }

  function buildInks() {
    const palettes = $('#v2Palettes');
    C.PALETTES.forEach(p => {
      const button = element('button', 'v2-palette',
        '<span class="v2-palette__dots">' +
        p.inks.map(n => '<i style="background:' + X.inkOf(n).hex + '"></i>').join('') +
        '</span><span>' + esc(p.name) + '</span>');
      button.type = 'button';
      button.dataset.palette = p.name;
      button.addEventListener('click', () => {
        X.set({ inks: p.inks.slice(0, 4) });
        updateInks();
        trackCustomise();
      });
      palettes.appendChild(button);
    });
    C.INKS.forEach(ink => $('#v2Inks').appendChild(swatchButton(ink)));
    C.CARD_LANGUAGES.forEach(lang => {
      const o = document.createElement('option');
      o.value = lang; o.textContent = lang;
      $('#v2Lang').appendChild(o);
    });
    $('#v2Lang').value = X.state.lang;
    $('#v2Lang').addEventListener('change', event => {
      X.set({ lang: event.target.value }); trackCustomise();
    });
    updateInks();
  }

  function updateInks() {
    const key = X.state.inks.slice().sort((a, b) => a - b).join();
    $$('.v2-palette').forEach(b => {
      const p = C.PALETTES.find(p => p.name === b.dataset.palette);
      b.setAttribute('aria-pressed', String(p.inks.slice().sort((a,b)=>a-b).join() === key));
    });
    $$('.v2-ink').forEach(b =>
      b.setAttribute('aria-pressed', String(X.state.inks.includes(Number(b.dataset.ink)))));
    $('#v2InkStatus').textContent = X.state.inks.length + ' colour' +
      (X.state.inks.length === 1 ? '' : 's') + ' selected · up to 4 included.';
  }

  function fillReviewSections() {
    $('#v2Rating').textContent = Number(C.SHOP.rating).toFixed(1) + ' / 5';
    $('#v2ReviewLink').textContent = C.SHOP.reviewCount + ' reviews on ' + C.SHOP.reviewSource;
    $('#v2ReviewSummary').textContent = C.SHOP.reviewCount + ' reviews on ' + C.SHOP.reviewSource +
      ' · ' + Number(C.SHOP.rating).toFixed(1) + ' / 5.';
    if (C.REVIEWS.length) {
      const r = C.REVIEWS[0];
      $('#v2Quote').textContent = '“' + r.text + '” — ' + r.name + ', via ' + r.via;
    }
    $('#revTitle').textContent = Number(C.SHOP.rating).toFixed(1) + ' out of 5, from ' +
      C.SHOP.reviewCount + ' clients';
    $('#revSub').textContent = 'Buyer reviews originally posted on ' + C.SHOP.reviewSource + '.';
    const badge = $('#revSource');
    badge.innerHTML = '<span>Verified reviews on</span>' +
      '<picture><source srcset="assets/img/etsy-logo.webp" type="image/webp">' +
      '<img src="assets/img/etsy-logo.png" alt="Etsy" width="152" height="72"></picture>';
    const anchor = element('a', 'rev__src-link', 'Read reviews on Etsy →');
    anchor.href = C.SHOP.etsyShopUrl;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    badge.appendChild(anchor);
    C.REVIEWS.forEach(r => $('#revList').appendChild(element('article','rev',
      '<p class="rev__s" aria-label="' + r.stars + ' out of 5 stars">' + '★'.repeat(r.stars) + '</p>' +
      '<p class="rev__t">' + esc(r.text) + '</p>' +
      '<p class="rev__m"><b>' + esc(r.name) + '</b> · ' + esc(r.date) +
      ' · <span class="rev__via">via ' + esc(r.via) + '</span></p>')));
  }

  function buildOtherSections() {
    const trust = [
      '<b>' + C.SHOP.rating + '</b> / 5 from ' + C.SHOP.reviewCount + ' reviews on Etsy',
      '<b>' + C.SHOP.salesCount + '</b> canvases sent',
      '<b>' + C.DELIVERY.scope + '</b> shipping from Europe',
      'Made & shipped in <b>' + C.DELIVERY.dispatch + '</b>'
    ];
    trust.forEach(line => $('#trustRow').appendChild(element('li','', '<span aria-hidden="true">✓</span> ' + line)));
    $$('[data-pay-badges]').forEach(node => {
      const label = element('span','pay__lbl');
      label.textContent = node.getAttribute('data-pay-label') || 'Secure payment';
      node.appendChild(label);
      C.CHECKOUT.methods.forEach(m => {
        const badge = element('span','pay__b');
        badge.textContent = m.label;
        badge.style.background = m.bg;
        badge.style.color = m.fg;
        node.appendChild(badge);
      });
    });
    C.SIZES.forEach(s => {
      const card = element('article','szc',
        '<div class="szc__h"><span class="szc__l">' + s.label + '</span><span class="szc__p"></span></div>' +
        '<p class="szc__cm">' + s.cm + '</p><p class="szc__in">' + s.inch + '</p>' +
        '<p class="szc__cap">Comfortable for about <b>' + s.capacity + ' fingerprints</b></p>');
      const go = element('button','btn btn--ghost btn--sm','Choose size ' + s.label);
      go.type = 'button';
      go.addEventListener('click', () => {
        chooseSize(s.id);
        $('#product-details').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      card.appendChild(go);
      $('#sizeCards').appendChild(card);
    });
    [['Standard', C.DELIVERY.standard, '+ ' + C.DELIVERY.production + ' production'],
     ['Express', C.DELIVERY.express, '+ ' + C.DELIVERY.production + ' production']]
      .forEach(parts => $('#shipGrid').appendChild(element('div','shipc',
        '<p class="shipc__t">' + parts[0] + '</p>' +
        '<p class="shipc__d">' + parts[1] + '</p><p class="shipc__s">' + parts[2] + '</p>')));
    C.FAQ.forEach(f => {
      const answer = f.a.replace(
        'Set your guest count in the configurator and it will point you at the size that fits.',
        'Choose S for 40, M for 80, or L for 120+ fingerprints.');
      $('#faqList').appendChild(element('details','',
        '<summary>' + esc(f.q) + '</summary><p>' + esc(answer) + '</p>'));
    });
    const film = C.PRODUCTION_FILM;
    if (film.enabled && $('#production')) {
      $('#production').hidden = false;
      $('#filmTitle').textContent = film.title;
      $('#filmText').textContent = film.text;
      const video = element('video');
      video.src = film.src; video.poster = film.poster; video.controls = true;
      video.playsInline = true; video.preload = 'none'; video.muted = true; video.loop = true;
      $('#filmMount').appendChild(video);
    }
    fillReviewSections();
    $('#ftrShop').textContent = C.SHOP.tagline;
    $('#ftrYear').textContent = '© ' + new Date().getFullYear() + ' ' + C.SHOP.name;
    $('#ftrMail').href = 'mailto:' + C.SHOP.email;
    $('#ftrMail').textContent = C.SHOP.email;
    if ($('#whatsappBtn') && C.SHOP.whatsapp) {
      $('#whatsappBtn').href = 'https://wa.me/' + C.SHOP.whatsapp +
        '?text=' + encodeURIComponent('Hello MyMagiCanvas, I have a question about a fingerprint tree canvas.');
    }
  }

  function productStructuredData() {
    $('#productLd')?.remove();
    const values = Object.values(Pricing.catalogs[currency].prices).map(saleCents);
    const ld = element('script');
    ld.id = 'productLd';
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context':'https://schema.org', '@type':'Product',
      name:'Fingerprint Tree Guest Book Canvas',
      description:'Personalised wedding fingerprint tree canvas, optional premium wooden frame and display easel, four washable ink pads included.',
      brand: { '@type':'Brand', name:'MyMagiCanvas' },
      image:['assets/media/01-olive-tree-wedding-easel.jpg','assets/media/10-premium-wooden-framing.jpg'],
      offers: { '@type':'AggregateOffer', priceCurrency:currency,
        lowPrice: Math.min(...values)/100, highPrice:(Math.max(...values) + saleCents(Pricing.catalogs[currency].easel))/100,
        offerCount:values.length * 2,
        availability:'https://schema.org/InStock' }
    });
    document.head.appendChild(ld);
  }

  const SHIPPING_COUNTRIES = (
    'AD AE AF AG AI AL AM AO AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VN VU WF WS YE YT ZA ZM ZW'
  ).trim().split(/\s+/);

  const PHONE_PREFIXES = Object.freeze({
    AD:'+376', AE:'+971', AF:'+93', AG:'+1', AI:'+1', AL:'+355', AM:'+374', AO:'+244',
    AR:'+54', AT:'+43', AU:'+61', AW:'+297', AX:'+358', AZ:'+994', BA:'+387', BB:'+1',
    BD:'+880', BE:'+32', BF:'+226', BG:'+359', BH:'+973', BI:'+257', BJ:'+229', BL:'+590',
    BM:'+1', BN:'+673', BO:'+591', BQ:'+599', BR:'+55', BS:'+1', BT:'+975', BW:'+267',
    BY:'+375', BZ:'+501', CA:'+1', CD:'+243', CF:'+236', CG:'+242', CH:'+41', CI:'+225',
    CK:'+682', CL:'+56', CM:'+237', CN:'+86', CO:'+57', CR:'+506', CV:'+238', CW:'+599',
    CY:'+357', CZ:'+420', DE:'+49', DJ:'+253', DK:'+45', DM:'+1', DO:'+1', DZ:'+213',
    EC:'+593', EE:'+372', EG:'+20', EH:'+212', ER:'+291', ES:'+34', ET:'+251', FI:'+358',
    FJ:'+679', FK:'+500', FO:'+298', FR:'+33', GA:'+241', GB:'+44', GD:'+1', GE:'+995',
    GF:'+594', GG:'+44', GH:'+233', GI:'+350', GL:'+299', GM:'+220', GN:'+224', GP:'+590',
    GQ:'+240', GR:'+30', GS:'+500', GT:'+502', GU:'+1', GW:'+245', GY:'+592', HK:'+852',
    HN:'+504', HR:'+385', HT:'+509', HU:'+36', ID:'+62', IE:'+353', IL:'+972', IM:'+44',
    IN:'+91', IO:'+246', IQ:'+964', IS:'+354', IT:'+39', JE:'+44', JM:'+1', JO:'+962',
    JP:'+81', KE:'+254', KG:'+996', KH:'+855', KI:'+686', KM:'+269', KN:'+1', KR:'+82',
    KW:'+965', KY:'+1', KZ:'+7', LA:'+856', LB:'+961', LC:'+1', LI:'+423', LK:'+94',
    LR:'+231', LS:'+266', LT:'+370', LU:'+352', LV:'+371', LY:'+218', MA:'+212', MC:'+377',
    MD:'+373', ME:'+382', MF:'+590', MG:'+261', MK:'+389', ML:'+223', MM:'+95', MN:'+976',
    MO:'+853', MQ:'+596', MR:'+222', MS:'+1', MT:'+356', MU:'+230', MV:'+960', MW:'+265',
    MX:'+52', MY:'+60', MZ:'+258', NA:'+264', NC:'+687', NE:'+227', NG:'+234', NI:'+505',
    NL:'+31', NO:'+47', NP:'+977', NR:'+674', NU:'+683', NZ:'+64', OM:'+968', PA:'+507',
    PE:'+51', PF:'+689', PG:'+675', PH:'+63', PK:'+92', PL:'+48', PM:'+508', PN:'+64',
    PR:'+1', PS:'+970', PT:'+351', PY:'+595', QA:'+974', RE:'+262', RO:'+40', RS:'+381',
    RU:'+7', RW:'+250', SA:'+966', SB:'+677', SC:'+248', SD:'+249', SE:'+46', SG:'+65',
    SH:'+290', SI:'+386', SJ:'+47', SK:'+421', SL:'+232', SM:'+378', SN:'+221', SO:'+252',
    SR:'+597', SS:'+211', ST:'+239', SV:'+503', SX:'+1', SZ:'+268', TC:'+1', TD:'+235',
    TF:'+262', TG:'+228', TH:'+66', TJ:'+992', TK:'+690', TL:'+670', TM:'+993', TN:'+216',
    TO:'+676', TR:'+90', TT:'+1', TV:'+688', TW:'+886', TZ:'+255', UA:'+380', UG:'+256',
    US:'+1', UY:'+598', UZ:'+998', VA:'+39', VC:'+1', VE:'+58', VG:'+1', VN:'+84',
    VU:'+678', WF:'+681', WS:'+685', YE:'+967', YT:'+262', ZA:'+27', ZM:'+260', ZW:'+263'
  });


  function setPhonePrefix() {
    const code = PHONE_PREFIXES[$('#v2Country').value] || '';
    $('#v2PhonePrefix').textContent = code || '+';
    $('#v2Phone').dataset.prefix = code;
  }

  function phoneValue() {
    const input = $('#v2Phone');
    const value = input.value.trim();
    if (!value) return '';
    if (value.startsWith('+')) return value;
    return input.dataset.prefix ? input.dataset.prefix + ' ' + value : value;
  }

  function buildCountries() {
    let displayNames;
    try { displayNames = new Intl.DisplayNames(['en'], { type:'region' }); }
    catch (_) { displayNames = null; }
    SHIPPING_COUNTRIES.map(code => ({
      code, name: displayNames ? displayNames.of(code) : code
    })).sort((a,b) => a.name.localeCompare(b.name)).forEach(row => {
      const option = document.createElement('option');
      option.value = row.code;
      option.textContent = row.name;
      $('#v2Country').appendChild(option);
    });
    $('#v2Country').addEventListener('change', () => {
      setPhonePrefix();
      applyCurrency();
    });
  }

  async function detectMarket() {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 2500);
    try {
      const res = await fetch('/api/market', { signal: abort.signal, cache: 'no-store' });
      if (!res.ok) return;
      const result = await res.json();
      if (/^[A-Z]{2}$/.test(result.country)) {
        marketCountry = result.country;
        if (SHIPPING_COUNTRIES.includes(marketCountry)) $('#v2Country').value = marketCountry;
      }
    } catch (_) {
      // Visitors may choose a delivery country themselves when geolocation is unavailable.
    } finally {
      clearTimeout(timeout);
      setPhonePrefix();
      applyCurrency();
    }
  }

  function chooseSize(size) {
    if (!C.SIZES.some(item => item.id === size)) return;
    const key = (X.state.framed ? 'FRAMED-' : '') + size +
      (X.state.easel ? '-EASEL' : '');
    selectVariant(key);
  }

  function syncInputs() {
    $('#v2Size').addEventListener('change', event => selectVariant(event.target.value));
    $('#v2Names').addEventListener('input', e => {
      X.set({ names: e.target.value }); trackCustomise();
    });
    $('#v2Date').addEventListener('input', e => {
      X.set({ date: e.target.value }); trackCustomise();
    });
    $('#v2Terms').addEventListener('change', () => {
      if ($('#v2Terms').checked) $('#v2Error').hidden = true;
    });
    $('#v2OrderForm').addEventListener('submit', checkout);
    // The original version's footer/hero buttons remain familiar anchor links.
    // Nothing navigates to the old configurator on the new page.
    document.addEventListener('click', event => {
      const anchor = event.target.closest?.('a[href]');
      if (!anchor) return;
      if (/^(mailto:|tel:|https:\/\/(?:wa\.me|(?:api\.)?whatsapp\.com)\/)/i
          .test(anchor.getAttribute('href') || '')) {
        window.MMCMeta?.track?.('Contact', { content_name:'Customer contact' });
      }
    });
  }

  function showError(message, field) {
    const node = $('#v2Error');
    node.hidden = false;
    node.textContent = message;
    if (field) {
      if (field.closest('details')) field.closest('details').open = true;
      field.focus({ preventScroll:false });
    }
    trackFirstParty('checkout_validation_error', { reason:message.slice(0,60) });
  }

  async function checkout(event) {
    event.preventDefault();
    if (checkoutBusy) return;
    const state = X.state;
    trackFirstParty('checkout_click');
    const names = $('#v2Names');
    const country = $('#v2Country');
    const terms = $('#v2Terms');
    if (!state.names.trim()) return showError('Please enter the names or text for your personalised canvas.',names);
    if (!state.inks.length) return showError('Choose at least one ink pad colour.', $('#v2Palettes button'));
    if (!country.value) return showError('Select a delivery country before checkout.', country);
    if (!terms.checked) return showError('Please accept the Terms of Sale and Privacy Policy.',terms);

    const totalCents = priceCents(state);
    if (totalCents == null) return showError('This product combination is not available.', null);

    checkoutBusy = true;
    const button = $('#v2CheckoutBtn');
    const originalText = button.textContent;
    button.textContent = 'Opening secure checkout…';
    button.disabled = true;
    $('#v2Error').hidden = true;
    trackFirstParty('checkout_attempt', { country:country.value });

    try {
      const api = window.MMCMeta;
      const analytics = window.MMCAnalytics;
      const response = await fetch('/api/v2-create-checkout', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          variant: X.variantKey(state),
          country: country.value,
          currency,
          pricingVersion: Pricing.version,
          subtotal: totalCents,
          returnPath: '/v2.html',
          meta: api?.checkoutContext?.() || {consent:false},
          analytics: analytics?.context?.() || {},
          design: {
            size:state.size, framed:state.framed, easel:state.easel,
            names:state.names.trim(), date:state.date.trim(),
            font:state.font, nameX:state.nameX, nameY:state.nameY,
            nameScale:state.nameScale, layout:null,
            phone:phoneValue(),
            inks:state.inks.slice(), guests:state.guests,
            lang:state.lang
          }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || 'Checkout could not be started.');

      const unitPrice = totalCents/100;
      window.MMCPinterest?.track?.('initiatecheckout', {
        value:unitPrice, currency, order_quantity:1,
        event_id:String(data.designId || ''),
        line_items:[{
          product_name:'Fingerprint Tree Guest Book Canvas',
          product_id:X.variantKey(state), product_price:unitPrice, product_quantity:1,
          product_category:'Wedding guest book canvas', product_brand:'MyMagiCanvas'
        }]
      })?.catch?.(() => {});
      window.MMCMeta?.track?.('InitiateCheckout', commerceParams());
      window.location.assign(data.url);
    } catch (error) {
      checkoutBusy = false;
      button.disabled = false;
      button.textContent = originalText;
      $('#v2Error').hidden = false;
      $('#v2Error').textContent = error.message || 'Checkout is temporarily unavailable.';
      trackFirstParty('checkout_failed', {reason:'create_checkout'});
    }
  }

  function mobileDock() {
    const dock = $('#dock');
    const listing = $('#product-details');
    if (!dock || !listing || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([entry]) => {
      dock.hidden = entry.isIntersecting || entry.boundingClientRect.top > 0;
    }, {threshold:0});
    io.observe(listing);
  }

  function startPromoTimer() {
    // Ongoing evergreen 10%-off promotion; the 10-hour counter is a
    // transparent *renewing cycle*, not a false claim of a final deadline.
    const storageKey = 'mmc-v2-sale-cycle-until';
    const cycle = 10 * 60 * 60 * 1000;
    const save = value => {
      try { sessionStorage.setItem(storageKey, String(value)); } catch (_) {}
    };
    let endsAt = 0;
    try { endsAt = Number(sessionStorage.getItem(storageKey)); } catch (_) {}
    const now = Date.now();
    if (!Number.isFinite(endsAt) || endsAt <= now || endsAt > now + cycle) {
      endsAt = now + cycle;
      save(endsAt);
    }
    const output = $('#v2PromoTimer');
    if (!output) return;
    const tick = () => {
      const time = Date.now();
      if (time >= endsAt) {
        endsAt = time + cycle;
        save(endsAt);
      }
      const seconds = Math.max(0, Math.ceil((endsAt - time) / 1000));
      const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
      const mm = String(Math.floor(seconds % 3600 / 60)).padStart(2, '0');
      const ss = String(seconds % 60).padStart(2, '0');
      output.textContent = hh + ':' + mm + ':' + ss;
    };
    tick();
    setInterval(tick, 1000);
  }

  function boot() {
    // This variant deliberately starts with the lowest-priced SKU, not a
    // remembered/previously selected format or a more expensive upsell.
    X.set({
      size:'S', guests:40, framed:false, easel:false,
      names:'', date:'', font:7, inks:[3,4,5,8], lang:'English'
    });
    buildOtherSections();
    gallery();
    buildInks();
    buildCountries();
    syncInputs();
    applyCurrency();
    detectMarket();
    mobileDock();
    startPromoTimer();
    const whatsapp = $('#v2WhatsApp');
    if (whatsapp && C.SHOP.whatsapp) {
      whatsapp.href = 'https://wa.me/' + C.SHOP.whatsapp + '?text=' +
        encodeURIComponent('Hello MyMagiCanvas, I have a question about a personalised fingerprint tree canvas.');
    }
    const hash = new URLSearchParams(location.search);
    if (hash.get('checkout') === 'cancelled') {
      $('#v2Error').hidden = false;
      $('#v2Error').textContent = 'Checkout was cancelled. Your choices can be entered again below.';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
