/* ==========================================================================
   Real-time canvas configurator.

   Layers inside .sheet, bottom to top:
     1. paper            — the canvas ground
     2. <canvas #prints> — the guests' fingerprints, drawn here
     3. <img .sheet__tree> in mix-blend-mode:multiply — the printed branches
        sit *over* the fingerprints, exactly as they do on a real canvas
     4. the lettering
   ========================================================================== */

window.MMCConfigurator = (function () {
  'use strict';

  const C = window.MMC;

  /* --------------------------------------------------------------- state */
  const state = {
    size: 'M',
    framed: false,
    easel: false,
    names: 'Noah & Rose',
    date: '25.06.2025',
    font: 5,
    inks: [3, 4, 6],
    guests: 80,
    lang: 'English',
    ads: false,        // advertising consent, recorded with the order

    seed: 20250625
  };

  const listeners = [];
  const onChange = fn => listeners.push(fn);
  const emit = () => listeners.forEach(fn => fn(state));

  /* ------------------------------------------------------------ geometry */
  // The tree artwork sits inside the sheet at this offset (see styles.css).
  const TREE_TOP = 0.074, TREE_H = 0.769;
  const PRINT_CM = 1.35;  // how wide a fingertip lands, in centimetres
  const REF_CM   = 40;    // the middle canvas, which the others scale against
  const SOFTEN   = 0.72;  // <1 keeps the prints on the big canvas readable
  const GAP      = 0.98;  // centres this many print widths apart
  const JITTER   = 0.92;  // how far a print strays from its square

  // Where a fingerprint may land, unpacked from the generated bitmap.
  const MASK = (function () {
    const src = window.MMC_CANOPY;
    if (!src) return null;
    const bin = atob(src.bits);
    const on = new Uint8Array(src.w * src.h);
    for (let i = 0; i < on.length; i++) {
      on[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
    }
    let count = 0, x0 = src.w, x1 = 0, y0 = src.h, y1 = 0;
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        if (!on[y * src.w + x]) continue;
        count++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return {
      w: src.w, h: src.h, on: on,
      coverage: count / (src.w * src.h),
      // bounding box in sheet coordinates, so sampling does not waste tries
      bx: x0 / src.w, bw: (x1 - x0 + 1) / src.w,
      by: TREE_TOP + (y0 / src.h) * TREE_H, bh: ((y1 - y0 + 1) / src.h) * TREE_H
    };
  })();

  // Is this point (in sheet coordinates) inside the canopy?
  function inCanopy(sx, sy) {
    if (!MASK) return false;
    const tv = (sy - TREE_TOP) / TREE_H;
    if (tv < 0 || tv >= 1 || sx < 0 || sx >= 1) return false;
    const gx = (sx * MASK.w) | 0, gy = (tv * MASK.h) | 0;
    return MASK.on[gy * MASK.w + gx] === 1;
  }

  /* ------------------------------------------------------------- helpers */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const sizeOf = id => C.SIZES.find(s => s.id === id) || C.SIZES[0];
  const fontOf = n => C.FONTS.find(f => f.n === n) || C.FONTS[0];
  const inkOf  = n => C.INKS.find(i => i.n === n) || C.INKS[0];

  // Smallest canvas whose capacity covers the guest list.
  function recommendedSize(guests) {
    return (C.SIZES.find(s => guests <= s.capacity) || C.SIZES[C.SIZES.length - 1]).id;
  }

  function variantKey(s = state) {
    return (s.framed ? 'FRAMED-' : '') + s.size + (s.easel ? '-EASEL' : '');
  }

  function priceOf(s = state) {
    const v = C.VARIANTS[variantKey(s)];
    return v ? v.price : null;
  }

  function money(n) {
    return C.CHECKOUT.currencySymbol + n.toFixed(2).replace('.', ',');
  }

  /* ------------------------------------------------ draw one fingerprint */
  /* A print is drawn once, in detail, into a small stencil — the uneven
     oval a fingertip leaves, the ink smudged between the ridges, and the
     ridges themselves arching around the core and flattening out towards
     the base. That stencil is then tinted and stamped over and over.
     Drawing every ridge of every guest would be pointless work: at this
     size nobody can tell one loop from another, but the eye sees at once
     that these are fingerprints and not painted dots. */
  const SPRITE_W = 76, SPRITE_H = 96;
  const SHAPES   = 8;     // how many different fingers are on file
  const TINTS    = 9;     // steps from a firm press to a barely-there one
  const PALEST   = 0.60;  // how far towards white the lightest press goes

  const stencils = [];
  const stamps   = new Map();

  function stencil(i) {
    if (stencils[i]) return stencils[i];
    const c = document.createElement('canvas');
    c.width = SPRITE_W; c.height = SPRITE_H;
    const g = c.getContext('2d');
    const rnd = mulberry32(1013904223 + i * 40503);
    const cx = SPRITE_W / 2, cy = SPRITE_H / 2;
    const rx = SPRITE_W * 0.42, ry = SPRITE_H * 0.45;

    // the outline — a finger never lands as a neat ellipse
    const p1 = rnd() * 6.2832, p2 = rnd() * 6.2832;
    const k1 = 2 + ((rnd() * 2) | 0), k2 = 4 + ((rnd() * 3) | 0);
    const wob = 0.05 + rnd() * 0.045;
    g.beginPath();
    for (let k = 0; k <= 84; k++) {
      const a = k / 84 * 6.2832;
      const f = 1 + wob * Math.sin(k1 * a + p1) + wob * 0.55 * Math.sin(k2 * a + p2);
      const x = cx + Math.cos(a) * rx * f, y = cy + Math.sin(a) * ry * f;
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
    g.save();
    g.clip();

    // ink between the ridges, heavier where the finger bore down
    ellipticalFill(g, cx, cy, rx, ry, [
      [0.00, 'rgba(0,0,0,.50)'], [0.70, 'rgba(0,0,0,.37)'], [1.00, 'rgba(0,0,0,.06)']
    ], ry * 0.08, ry * 1.06, ry * 0.12);

    // the ridges: arches around the core, then flat lines across the base
    const coreX = cx + (rnd() - 0.5) * rx * 0.30;
    const coreY = cy + ry * (0.04 + rnd() * 0.16);
    const step  = ry * 0.150;
    const lean  = (rnd() - 0.5) * 0.44;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,.80)';
    for (let k = 1; k <= 7; k++) {
      const r = step * k;
      g.lineWidth = Math.max(1, step * 0.46);
      g.setLineDash([r * (4 + rnd() * 7), r * (0.10 + rnd() * 0.18)]);
      g.lineDashOffset = rnd() * r * 6;
      g.beginPath();
      g.ellipse(coreX, coreY - r * 0.20, r * 1.02, r * 0.80, lean,
                Math.PI * (0.92 + rnd() * 0.08), Math.PI * (2.08 - rnd() * 0.08));
      g.stroke();
    }
    for (let k = 1; k <= 4; k++) {
      const r = step * k * 1.15;
      g.lineWidth = Math.max(1, step * 0.40);
      g.setLineDash([r * (5 + rnd() * 5), r * (0.10 + rnd() * 0.20)]);
      g.lineDashOffset = rnd() * r * 5;
      g.beginPath();
      g.ellipse(coreX, coreY + ry * 0.30, rx * (0.52 + k * 0.11), r * 0.92, lean, 0.14, Math.PI - 0.14);
      g.stroke();
    }
    g.setLineDash([]);
    g.restore();

    // soften the rim, so the stamp does not end on a drawn line
    g.save();
    g.globalCompositeOperation = 'destination-out';
    ellipticalFill(g, cx, cy, rx, ry, [
      [0.00, 'rgba(0,0,0,0)'], [1.00, 'rgba(0,0,0,.62)']
    ], ry * 0.62, ry, 0);
    g.restore();

    stencils[i] = c;
    return c;
  }

  // A radial gradient is round; a fingertip is not. Squashing the canvas
  // while it paints keeps the falloff following the oval.
  function ellipticalFill(g, cx, cy, rx, ry, stops, r0, r1, dy) {
    g.save();
    g.translate(cx, cy); g.scale(rx / ry, 1); g.translate(-cx, -cy);
    const grd = g.createRadialGradient(cx, cy + (dy || 0), r0, cx, cy, r1);
    for (let i = 0; i < stops.length; i++) grd.addColorStop(stops[i][0], stops[i][1]);
    g.fillStyle = grd;
    g.fillRect(-SPRITE_W, -SPRITE_H, SPRITE_W * 3, SPRITE_H * 3);
    g.restore();
  }

  // ink mixed towards white: a light press leaves a pale mark of the same
  // colour, which is where the shading across the canopy comes from
  function tintOf(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const mix = v => Math.round(v + (255 - v) * t);
    return 'rgb(' + mix((n >> 16) & 255) + ',' + mix((n >> 8) & 255) + ',' + mix(n & 255) + ')';
  }

  function stamp(shape, hex, ti) {
    const key = shape + hex + ti;
    const had = stamps.get(key);
    if (had) return had;
    if (stamps.size > 600) stamps.clear();
    const c = document.createElement('canvas');
    c.width = SPRITE_W; c.height = SPRITE_H;
    const g = c.getContext('2d');
    g.fillStyle = tintOf(hex, (ti / (TINTS - 1)) * PALEST);
    g.fillRect(0, 0, SPRITE_W, SPRITE_H);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(stencil(shape), 0, 0);
    stamps.set(key, c);
    return c;
  }

  /* ------------------------------------------------- render the canopy */
  let cv, ctx;

  function render() {
    if (!cv) return;
    const host = cv.parentElement;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const colours = (state.inks.length ? state.inks : [4]).map(n => inkOf(n).hex);
    const rnd = mulberry32(state.seed);

    // A fingertip leaves a mark of its own size whatever the canvas, so a
    // bigger canvas takes more prints and each one reads finer. The preview
    // shrinks them a little less than life, so even the largest canvas still
    // shows the ridges on a screen.
    const cm = parseFloat(sizeOf(state.size).cm);
    const pw = (PRINT_CM / REF_CM) * Math.pow(REF_CM / cm, SOFTEN) * w;
    const ph = pw * (SPRITE_H / SPRITE_W);
    const cell = Math.max(4, pw * GAP);

    // Guests press side by side. Working across a loose grid, with every
    // print nudged off its square, fills the canopy evenly the way a room
    // full of people does — random darts leave bald patches and pile-ups.
    const x0 = MASK.bx * w, x1 = (MASK.bx + MASK.bw) * w;
    const y0 = MASK.by * h, y1 = (MASK.by + MASK.bh) * h;
    const ccx = (x0 + x1) / 2, ccy = y0 + (y1 - y0) * 0.54;
    const crx = Math.max(1, (x1 - x0) / 2), cry = Math.max(1, (y1 - y0) / 2);

    ctx.globalCompositeOperation = 'multiply';
    let row = 0;
    for (let gy = y0; gy < y1; gy += cell, row++) {
      const stagger = (row & 1) ? cell * 0.5 : 0;
      for (let gx = x0 - stagger; gx < x1; gx += cell) {
        const x = gx + cell * (0.5 + (rnd() - 0.5) * JITTER);
        const y = gy + cell * (0.5 + (rnd() - 0.5) * JITTER);
        const hex = colours[(rnd() * colours.length) | 0];
        const shape = (rnd() * SHAPES) | 0;
        const noise = rnd(), size = rnd(), spin = rnd(), press = rnd();
        if (!inCanopy(x / w, y / h)) continue;

        // pale at the edge of the canopy, deeper towards the heart of it,
        // with enough scatter that it never looks like a printed gradient
        const d = Math.min(1, Math.hypot((x - ccx) / crx, (y - ccy) / cry));
        let t = 0.02 + 0.30 * d + (noise - 0.46) * 0.72;
        t = t < 0 ? 0 : t > 1 ? 1 : t;

        const sc = 0.82 + size * 0.38;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((spin - 0.5) * 1.15);
        ctx.globalAlpha = 0.70 + press * 0.30;
        ctx.drawImage(stamp(shape, hex, Math.round(t * (TINTS - 1))),
                      -pw * sc / 2, -ph * sc / 2, pw * sc, ph * sc);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* --------------------------------------------------- personalisation */
  function recap(s = state) {
    const sz = sizeOf(s.size);
    const lines = [
      'Canvas size: ' + sz.label + ' — ' + sz.cm + ' (' + sz.inch + ')',
      'Finish: ' + (s.framed ? 'Premium wooden frame' : 'Canvas on wooden stretcher'),
      'Display easel: ' + (s.easel ? 'Yes' : 'No'),
      'Ink pad colours: ' + (s.inks.length
        ? s.inks.slice().sort((a, b) => a - b).map(n => n + ' (' + inkOf(n).name + ')').join(', ')
        : '—'),
      'Font: ' + s.font + ' (' + fontOf(s.font).name + ')',
      'Names / text: ' + (s.names.trim() || '—'),
      'Date: ' + (s.date.trim() || '—'),
      'Instruction card language: ' + s.lang
    ];
    return lines.join('\n');
  }

  // Compact, URL-safe code so an order can be matched back to this design.
  function reference(s = state) {
    return [
      s.size,
      s.framed ? 'F1' : 'F0',
      s.easel ? 'E1' : 'E0',
      'C' + (s.inks.slice().sort((a, b) => a - b).join('-') || '0'),
      'T' + s.font,
      'L' + s.lang.slice(0, 2).toUpperCase(),
      s.ads ? 'ADS1' : 'ADS0'
    ].join('_');
  }

  function checkoutUrl(s = state) {
    const raw = C.CHECKOUT.links[variantKey(s)];
    if (!raw) return null;
    const sep = raw.indexOf('?') === -1 ? '?' : '&';
    return raw + sep + 'client_reference_id=' + encodeURIComponent(reference(s));
  }

  /* -------------------------------------------------------------- setters */
  function set(patch, reseed) {
    Object.assign(state, patch);
    if (reseed) state.seed = (Math.random() * 1e9) | 0;
    render();
    emit();
  }

  function toggleInk(n) {
    const i = state.inks.indexOf(n);
    if (i > -1) state.inks.splice(i, 1);
    else if (state.inks.length < C.MAX_INKS) state.inks.push(n);
    else return false;
    render();
    emit();
    return true;
  }

  /* ---------------------------------------------------------------- init */
  function mount(canvasEl) {
    cv = canvasEl;
    render();
    const ro = new ResizeObserver(() => render());
    ro.observe(cv.parentElement);
    return render;
  }

  return {
    state, set, toggleInk, onChange, mount, render, recommendedSize,
    recap, reference, checkoutUrl, variantKey, priceOf, money,
    sizeOf, fontOf, inkOf
  };
})();
