/* ==========================================================================
   MyMagiCanvas — single source of truth for the landing page.
   Everything a shop owner needs to change lives in this file.

   TO DO BEFORE GOING LIVE
   1. STRIPE  — paste one Payment Link per variant in CHECKOUT.links below.
   2. PRICES  — two variants are still missing a price (FRAMED M + EASEL,
                FRAMED L + EASEL). Fill in `price` and they light up by
                themselves; until then the configurator asks the buyer to
                request a quote.
   3. LINKS   — SHOP.etsyUrl / SHOP.email are used by the quote + help buttons.
   ========================================================================== */

window.MMC = (function () {
  'use strict';

  /* ---------------------------------------------------------------- shop */
  const SHOP = {
    name: 'MyMagiCanvas',
    tagline: 'Fingerprint guest book canvases, made in Europe and posted worldwide',
    email: 'hello@mymagicanvas.com',        // ← replace with your real address
    etsyUrl: '',                            // ← optional: your Etsy listing
    city: '',                               // left blank on purpose: we say Europe, not a country
    rating: 4.9,
    reviewCount: 552,
    salesCount: '2,600+',
    itemReviewCount: 66,
    itemRating: 5.0
  };

  /* ------------------------------------------------------------ checkout */
  const CHECKOUT = {
    currency: 'EUR',
    currencySymbol: '€',
    shipping: 15.9,

    // Paste your Stripe Payment Links here — one per variant key.
    // Key format: SIZE | FRAMED-SIZE | SIZE-EASEL | FRAMED-SIZE-EASEL
    links: {
      'S': '',
      'M': '',
      'L': '',
      'FRAMED-S': '',
      'FRAMED-M': '',
      'FRAMED-L': '',
      'S-EASEL': '',
      'M-EASEL': '',
      'L-EASEL': '',
      'FRAMED-S-EASEL': '',
      'FRAMED-M-EASEL': '',
      'FRAMED-L-EASEL': ''
    },

    // Payment methods shown as badges. They are enabled in your Stripe
    // dashboard (Settings → Payment methods), not here — this list only
    // tells visitors what to expect.
    methods: [
      { id: 'visa',       label: 'Visa',        bg: '#1434CB', fg: '#ffffff' },
      { id: 'mastercard', label: 'Mastercard',  bg: '#ffffff', fg: '#1a1a1a', mark: 'mc' },
      { id: 'amex',       label: 'Amex',        bg: '#1F72CD', fg: '#ffffff' },
      { id: 'applepay',   label: 'Apple Pay',   bg: '#000000', fg: '#ffffff' },
      { id: 'googlepay',  label: 'Google Pay',  bg: '#ffffff', fg: '#3c4043' },
      { id: 'paypal',     label: 'PayPal',      bg: '#003087', fg: '#ffffff' },
      { id: 'klarna',     label: 'Klarna',      bg: '#FFB3C7', fg: '#0B051D' },
      { id: 'ideal',      label: 'iDEAL',       bg: '#CC0066', fg: '#ffffff' },
      { id: 'bancontact', label: 'Bancontact',  bg: '#ffffff', fg: '#1a1a1a' },
      { id: 'sepa',       label: 'SEPA Debit',  bg: '#ffffff', fg: '#1a1a1a' },
      { id: 'link',       label: 'Link',        bg: '#00D66F', fg: '#011E0F' }
    ]
  };

  /* --------------------------------------------------------------- sizes */
  // `capacity` is how many fingerprints the crown holds comfortably. It
  // drives both the note under the preview and the size we recommend for a
  // given guest list, so these two always agree.
  const SIZES = [
    { id: 'S', label: 'S', cm: '30 × 40 cm', inch: '11.6 × 15.7 in', ratio: 30 / 40,
      capacity: 40,  capacityLabel: 'about 40 fingerprints' },
    { id: 'M', label: 'M', cm: '40 × 50 cm', inch: '15.7 × 19.7 in', ratio: 40 / 50,
      capacity: 80,  capacityLabel: 'about 80 fingerprints' },
    { id: 'L', label: 'L', cm: '50 × 60 cm', inch: '19.7 × 23.6 in', ratio: 50 / 60,
      capacity: 120, capacityLabel: 'about 120+ fingerprints' }
  ];

  /* ------------------------------------------------------------ variants */
  // price === null  →  not published yet, the configurator asks for a quote.
  const VARIANTS = {
    'S':                { price: 31.90 },
    'M':                { price: 49.90 },
    'L':                { price: 64.90 },
    'FRAMED-S':         { price: 79.99 },
    'FRAMED-M':         { price: 109.99 },
    'FRAMED-L':         { price: 149.99 },
    'S-EASEL':          { price: 84.90 },
    'M-EASEL':          { price: 99.90 },
    'L-EASEL':          { price: 114.90 },
    'FRAMED-S-EASEL':   { price: 112.99 },
    'FRAMED-M-EASEL':   { price: null },   // ← add your price
    'FRAMED-L-EASEL':   { price: null }    // ← add your price
  };

  /* ----------------------------------------------------------- ink pads */
  // The 15 numbered colours from the ink-pad chart. Numbers must stay in
  // sync with the chart photo, because the buyer orders by number.
  const INKS = [
    { n: 1,  name: 'Lavender',    hex: '#8B6CAA' },
    { n: 2,  name: 'Sand',        hex: '#C9B090' },
    { n: 3,  name: 'Dusty Rose',  hex: '#C87B9A' },
    { n: 4,  name: 'Sage Grey',   hex: '#A0A699' },
    { n: 5,  name: 'Teal',        hex: '#377769' },
    { n: 6,  name: 'Sage Green',  hex: '#84AB7C' },
    { n: 7,  name: 'Powder Blue', hex: '#AFC3D7' },
    { n: 8,  name: 'Light Olive', hex: '#848E44' },
    { n: 9,  name: 'Deep Olive',  hex: '#5C6314' },
    { n: 10, name: 'Lilac',       hex: '#B6A0C8' },
    { n: 11, name: 'Mustard',     hex: '#F0B40D' },
    { n: 12, name: 'Orange',      hex: '#DC5D06' },
    { n: 13, name: 'Burgundy',    hex: '#832330' },
    { n: 14, name: 'Royal Blue',  hex: '#2F5292' },
    { n: 15, name: 'Plum',        hex: '#67336F' }
  ];

  const MAX_INKS = 4;

  // Ready-made palettes taken from the colour-inspiration card.
  const PALETTES = [
    { name: 'Olive grove',   inks: [3, 4, 5, 8] },
    { name: 'Blush hearts',  inks: [1, 3, 10] },
    { name: 'Lavender bloom',inks: [1, 9, 12] },
    { name: 'Eucalyptus',    inks: [4, 6] },
    { name: 'Autumn',        inks: [2, 11, 12, 13] },
    { name: 'Something blue',inks: [7, 14, 4] }
  ];

  /* --------------------------------------------------------------- fonts */
  // `css` is the closest web equivalent used for the on-screen preview.
  // The print always uses the numbered font from the chart.
  const FONTS = [
    { n: 1, name: 'Marck Script',        css: "'Marck Script', cursive",        scale: 1.00 },
    { n: 2, name: 'Italianno',           css: "'Italianno', cursive",           scale: 1.22 },
    { n: 3, name: 'Mrs Saint Delafield', css: "'Mrs Saint Delafield', cursive", scale: 1.18 },
    { n: 4, name: 'Pinyon Script',       css: "'Pinyon Script', cursive",       scale: 1.00 },
    { n: 5, name: 'Dancing Script',      css: "'Dancing Script', cursive",      scale: 0.94 },
    { n: 6, name: 'Great Vibes',         css: "'Great Vibes', cursive",         scale: 1.06 },
    { n: 7, name: 'Parisienne',          css: "'Parisienne', cursive",          scale: 1.02 },
    { n: 8, name: 'Allura',              css: "'Allura', cursive",              scale: 1.10 }
  ];

  /* ------------------------------------------------ instruction language */
  const CARD_LANGUAGES = ['English', 'French', 'German', 'Italian', 'Spanish'];

  /* ------------------------------------------------------------- gallery */
  // Order is the display order. The film sits in position 2 on purpose.
  const GALLERY = [
    { type: 'image', src: 'assets/media/01-olive-tree-wedding-easel', alt: 'Olive-green fingerprint tree on an easel at an outdoor wedding' },
    { type: 'video', src: 'assets/media/02-video.mp4', poster: 'assets/media/02-video-poster.jpg', alt: 'The fingerprint tree canvas in motion' },
    { type: 'image', src: 'assets/media/03-high-quality-printing', alt: 'Close-up of the printed branches showing the heart hidden in the canopy' },
    { type: 'image', src: 'assets/media/04-canvas-wooden-frame-back', alt: 'Back of the canvas — wooden stretcher and ready-to-hang hardware' },
    { type: 'image', src: 'assets/media/05-kit-includes', alt: 'What the kit includes: canvas, instruction card, mini easel and four ink pads' },
    { type: 'image', src: 'assets/media/06-size-guide', alt: 'Size guide — S 30×40, M 40×50 and L 50×60 cm on a wall' },
    { type: 'image', src: 'assets/media/07-how-to-order', alt: 'How to order — the 15 ink colours and the 8 lettering fonts' },
    { type: 'image', src: 'assets/media/08-color-inspiration', alt: 'Colour inspiration — three finished trees with their colour numbers' },
    { type: 'image', src: 'assets/media/09-optional-easel', alt: 'The optional wooden display easel, fits every canvas size' },
    { type: 'image', src: 'assets/media/10-premium-wooden-framing', alt: 'Premium wooden framing option around a finished tree' },
    { type: 'image', src: 'assets/media/11-framed-tree-interior', alt: 'Framed fingerprint tree displayed on a sideboard at home' },
    { type: 'image', src: 'assets/media/12-estimated-delivery', alt: 'Estimated delivery — standard 3-7 days, express 1-3 days, plus 2 days production' }
  ];

  /* ----------------------------------------------- behind-the-scenes film */
  // Second film, showing how each canvas is made. Drop the file in
  // assets/media/ and flip `enabled` to true — the section appears.
  const PRODUCTION_FILM = {
    enabled: false,
    src: 'assets/media/production.mp4',
    poster: 'assets/media/production-poster.jpg',
    title: 'Made by hand, two at a time',
    text: 'Every canvas is printed, stretched and checked in our own studio before it is packed. No warehouse, no middleman — just us and your names.'
  };

  /* ------------------------------------------------------------ delivery */
  const DELIVERY = {
    production: '2 business days',
    standard: '3–7 business days',
    express: '1–3 business days',
    from: 'Europe',
    scope: 'Worldwide',      // where we post to
    dispatch: '2 days',       // shown as a badge under the headline
    returns: '14 days'        // stated in the delivery section and the FAQ
  };

  /* ------------------------------------------------------------- reviews */
  const REVIEWS = [
    { name: 'Estela',   stars: 5, date: '20 Aug 2026', text: 'We ordered a wedding fingerprint tree canvas and could not be happier with the outcome! The vendor was an absolute dream to work with — they collaborated with us closely on the design and made sure it was exactly what we envisioned. The final canvas print looks stunning and high-quality.' },
    { name: 'Ashlynn',  stars: 5, date: '17 Aug 2026', text: 'Just as pictured! Shop was great at communicating and ensured we’d have this in time for the wedding. Shipping was impressive. I think it’s going to be a great touch for our guests and a lovely keepsake for my fiancé and I.' },
    { name: 'Jerry',    stars: 5, date: '13 Sep 2026', text: 'Really lovely item, and I can’t wait to use it for my wedding. Dimitri messaged to keep me updated and clarify anything — would recommend!' },
    { name: 'Audrey',   stars: 5, date: '13 Aug 2026', text: 'It’s gorgeous! I can’t wait for our wedding!!' },
    { name: 'Danielle', stars: 5, date: '16 Aug 2026', text: 'It’s perfect! Looks great.' },
    { name: 'Kim',      stars: 5, date: '11 Aug 2026', text: 'Very good, I love it.' }
  ];

  /* ----------------------------------------------------------------- faq */
  const FAQ = [
    { q: 'How many guests fit on one tree?',
      a: 'As a guide, the S canvas holds about 40 fingerprints, M about 80 and L about 120 or more. Set your guest count in the configurator and it will point you at the size that fits.' },
    { q: 'What exactly arrives in the box?',
      a: 'The printed canvas on its wooden stretcher, four water-washable ink pads in the colours you chose, an instruction card for your guests in the language you pick, and a small easel to stand that card on. Hanging hardware is already fitted on the back.' },
    { q: 'Is the ink safe and does it wash off hands?',
      a: 'Yes. The pads are water-washable — a bit of soap and water is enough, which matters when a hundred guests and a few children are queuing up.' },
    { q: 'Can I write something other than our names and a date?',
      a: 'Of course. The lettering is free text. Couples use a surname, a place, a line from their vows, or nothing at all. Anniversaries, baptisms, birthdays and retirement parties all work the same way.' },
    { q: 'Do I have to use the four colours together?',
      a: 'No. Pick anything from one to four of the fifteen numbered colours. One colour gives a calm, single-tone canopy; three or four give the layered look you see in the colour inspiration photos.' },
    { q: 'What is the difference between the framed and unframed canvas?',
      a: 'The standard canvas is printed and stretched over a wooden frame, with the sides finished and hardware fitted — it hangs as it is. The framed option adds a premium solid wood frame around that canvas, which gives it a gallery finish.' },
    { q: 'Do I need the easel?',
      a: 'Only if you want the canvas standing at the entrance of your venue rather than lying on a table. The tall wooden easel fits all three canvas sizes. A small easel for the instruction card is always included.' },
    { q: 'How long does it take to arrive?',
      a: 'Two business days of production, then 3–7 business days with standard delivery or 1–3 with express. We post worldwide from within Europe, so allow a little longer for destinations further afield. Order with some margin before the date if you can.' },
    { q: 'Do you ship to my country?',
      a: 'Almost certainly — we post worldwide from within Europe. Customs and import charges, where a country applies them, are the buyer\u2019s to settle. If checkout will not take your address, write to us and we will sort it out by hand.' },
    { q: 'What if something is wrong when it arrives?',
      a: 'Write to us. Returns and exchanges are accepted within 14 days, and in practice we would rather reprint a canvas than leave you with one you do not love.' }
  ];

  return { SHOP, CHECKOUT, SIZES, VARIANTS, INKS, MAX_INKS, PALETTES, FONTS,
           CARD_LANGUAGES, GALLERY, PRODUCTION_FILM, DELIVERY, REVIEWS, FAQ };
})();
