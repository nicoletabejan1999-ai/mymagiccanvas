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
    seed: 20250625
  };

  const listeners = [];
  const onChange = fn => listeners.push(fn);
  const emit = () => listeners.forEach(fn => fn(state));

  /* ------------------------------------------------------------ geometry */
  // The tree artwork sits inside the sheet at this offset (see styles.css).
  const TREE_TOP = 0.074, TREE_H = 0.769;
  const PRINT_CM = 1.6;   // how wide a thumbprint lands, in centimetres
  const SPACING  = 0.62;  // centres stay this many radii apart, so prints
                          // crowd together without stacking into mud

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
  function drawPrint(ctx, x, y, r, rot, hex, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;

    // a thumb leaves a narrow oval, taller than it is wide, soft at the rim
    const grd = ctx.createRadialGradient(0, -r * 0.12, r * 0.10, 0, 0, r * 1.05);
    grd.addColorStop(0.00, hex);
    grd.addColorStop(0.58, hex);
    grd.addColorStop(0.86, hex + 'B0');
    grd.addColorStop(1.00, hex + '00');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.70, r * 1.00, 0, 0, Math.PI * 2);
    ctx.fill();

    // ridge hint — only worth drawing once the print is big enough to see
    if (r > 5) {
      ctx.globalAlpha = alpha * 0.40;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.55, r * 0.075);
      for (let k = 1; k <= 3; k++) {
        const rr = r * (0.18 + k * 0.19);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.04, rr * 0.68, rr, 0, 0.6, Math.PI * 1.7);
        ctx.stroke();
      }
    }
    ctx.restore();
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

    // A thumb leaves a mark about the same size whatever the canvas, so on a
    // wider canvas the prints look smaller and more of them fit — which is
    // the whole point of choosing a size.
    const cm = parseFloat(sizeOf(state.size).cm);
    const r0 = Math.max(2.2, (PRINT_CM / cm / 1.4) * w);

    // Guests press side by side, not on top of each other. Keeping centres a
    // minimum distance apart fills the canopy while every print stays its
    // own leaf — a plain random scatter turns into mud where marks pile up.
    const minD = r0 * 2 * SPACING;
    const cell = minD;
    const cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
    const grid = new Array(cols * rows);

    function fits(px, py) {
      const cxi = (px / cell) | 0, cyi = (py / cell) | 0;
      for (let gy = Math.max(0, cyi - 1); gy <= Math.min(rows - 1, cyi + 1); gy++) {
        for (let gx = Math.max(0, cxi - 1); gx <= Math.min(cols - 1, cxi + 1); gx++) {
          const bucket = grid[gy * cols + gx];
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k += 2) {
            const dx = bucket[k] - px, dy = bucket[k + 1] - py;
            if (dx * dx + dy * dy < minD * minD) return false;
          }
        }
      }
      const idx = cyi * cols + cxi;
      (grid[idx] || (grid[idx] = [])).push(px, py);
      return true;
    }

    ctx.globalCompositeOperation = 'multiply';
    const budget = 14000;
    for (let tries = 0; tries < budget; tries++) {
      const x = (MASK.bx + rnd() * MASK.bw) * w;
      const y = (MASK.by + rnd() * MASK.bh) * h;
      if (!inCanopy(x / w, y / h) || !fits(x, y)) continue;
      drawPrint(ctx, x, y, r0 * (0.84 + rnd() * 0.30),
                (rnd() - 0.5) * 1.0,
                colours[Math.floor(rnd() * colours.length)],
                0.56 + rnd() * 0.26);
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
      'L' + s.lang.slice(0, 2).toUpperCase()
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
