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
    font: 7,
    // Name position is stored as a fraction of the canvas width/height,
    // measured from the default placement. The date stays fixed.
    nameX: 0,
    nameY: 0,
    nameScale: 1,
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

  function baseVariantKey(s = state) {
    return (s.framed ? 'FRAMED-' : '') + s.size;
  }

  function variantKey(s = state) {
    return baseVariantKey(s) + (s.easel ? '-EASEL' : '');
  }

  function extraInkCount(s = state) {
    return Math.max(0, s.inks.length - C.INCLUDED_INKS);
  }

  function priceOf(s = state) {
    const v = C.VARIANTS[baseVariantKey(s)];
    if (!v || v.price == null) return null;
    return v.price +
      (s.easel ? C.EASEL_PRICE : 0) +
      extraInkCount(s) * C.EXTRA_INK_PRICE;
  }

  function money(n) {
    return C.CHECKOUT.currencySymbol + n.toFixed(2).replace('.', ',');
  }

  /* ------------------------------------------------ draw one fingerprint */
  // Ink on canvas behaves like a watercolour wash: the edge dries a shade
  // darker than the middle, the pigment settles in patches, and nothing
  // ends on a clean line. Drawing it that way is what keeps the canopy
  // from looking like a page of printed dots.
  function drawPrint(ctx, x, y, r, rot, hex, alpha, rnd) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;

    // a thumb leaves a narrow oval, clearly taller than it is wide, and
    // only a little out of true wherever the finger rolled
    const rx = r * 0.66, ry = r * 1.00;
    const p1 = rnd() * 6.2832, p2 = rnd() * 6.2832;
    const wob = 0.020 + rnd() * 0.022;
    ctx.beginPath();
    for (let k = 0; k <= 44; k++) {
      const a = k / 44 * 6.2832;
      const f = 1 + wob * Math.sin(3 * a + p1) + wob * 0.6 * Math.sin(5 * a + p2);
      const px = Math.cos(a) * rx * f, py = Math.sin(a) * ry * f;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();

    ctx.save();
    ctx.clip();

    // the wash itself
    const grd = ctx.createRadialGradient(0, -r * 0.12, r * 0.10, 0, 0, r * 1.05);
    grd.addColorStop(0.00, hex + 'D2');
    grd.addColorStop(0.58, hex + 'E4');
    grd.addColorStop(0.88, hex + '9E');
    grd.addColorStop(1.00, hex + '00');
    ctx.fillStyle = grd;
    ctx.fillRect(-r * 1.4, -r * 1.4, r * 2.8, r * 2.8);

    // pigment settling in patches, the way a wash granulates as it dries
    for (let k = 0; k < 3; k++) {
      const bx = (rnd() - 0.5) * rx * 1.2, by = (rnd() - 0.5) * ry * 1.2;
      const br = r * (0.26 + rnd() * 0.26);
      const blot = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      blot.addColorStop(0, hex + (k ? '32' : '46'));
      blot.addColorStop(1, hex + '00');
      ctx.fillStyle = blot;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }

    // and a pale bloom where the paper dried first
    const bl = ctx.createRadialGradient(rx * 0.18, -ry * 0.22, 0, rx * 0.18, -ry * 0.22, r * 0.52);
    bl.addColorStop(0, 'rgba(255,255,255,.30)');
    bl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bl;
    ctx.fillRect(-r * 1.4, -r * 1.4, r * 2.8, r * 2.8);

    // The ridges. They arch around the core of the print and run almost
    // flat across the base of the pad, and it is the ink itself that
    // draws them — the paper between is what stays light.
    const coreX = (rnd() - 0.5) * rx * 0.28;
    const coreY = ry * (0.06 + rnd() * 0.16);
    const step  = ry * 0.128;
    const lean  = (rnd() - 0.5) * 0.40;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.5, r * 0.052);
    for (let k = 1; k <= 8; k++) {
      const rr = step * k;
      ctx.strokeStyle = hex + (k & 1 ? '86' : '6E');
      ctx.beginPath();
      ctx.ellipse(coreX, coreY - rr * 0.22, rr * 0.96, rr * 0.80, lean,
                  Math.PI * (0.90 + rnd() * 0.10), Math.PI * (2.10 - rnd() * 0.10));
      ctx.stroke();
    }
    for (let k = 1; k <= 4; k++) {
      const rr = step * k * 1.25;
      ctx.strokeStyle = hex + (k & 1 ? '7A' : '64');
      ctx.beginPath();
      ctx.ellipse(coreX, coreY + ry * 0.34, rx * (0.46 + k * 0.16), rr * 0.86, lean,
                  0.16, Math.PI - 0.16);
      ctx.stroke();
    }

    // the darker line the pigment leaves as it is pushed to the rim, and
    // the heavier pool on the side the wash ran to
    ctx.lineWidth = Math.max(0.7, r * 0.15);
    ctx.strokeStyle = hex + '62';
    ctx.stroke();
    const run = rnd() * 6.2832;
    ctx.lineWidth = Math.max(0.9, r * 0.26);
    ctx.strokeStyle = hex + '4A';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, run, run + 2.2);
    ctx.stroke();

    ctx.restore();

    // a couple of valleys opened between the ridges, where the skin did
    // not touch — only worth drawing once the print is big enough to see
    if (r > 5) {
      ctx.globalAlpha = alpha * 0.34;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.5, r * 0.055);
      for (let k = 1; k <= 3; k++) {
        const rr = r * (0.22 + k * 0.22);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.04, rr * 0.66, rr * 0.86, 0, 0.7, Math.PI * 1.6);
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
    // No print may hang over the edge of the canvas: on a real one the
    // guest would be pressing onto the wooden stretcher. How far an oval
    // reaches depends on how it was turned, so each one is measured.
    const EDGE = w * 0.030;

    const budget = 14000;
    for (let tries = 0; tries < budget; tries++) {
      const x = (MASK.bx + rnd() * MASK.bw) * w;
      const y = (MASK.by + rnd() * MASK.bh) * h;
      const pr = r0 * (0.84 + rnd() * 0.30);
      const rot = (rnd() - 0.5) * 1.0;
      const hex = colours[Math.floor(rnd() * colours.length)];
      const alpha = 0.56 + rnd() * 0.26;

      const co = Math.abs(Math.cos(rot)), si = Math.abs(Math.sin(rot));
      const hw = pr * 0.72 * co + pr * 1.06 * si + EDGE;
      const hh = pr * 0.72 * si + pr * 1.06 * co + EDGE;
      if (x < hw || x > w - hw || y < hh || y > h - hh) continue;
      if (!inCanopy(x / w, y / h) || !fits(x, y)) continue;
      drawPrint(ctx, x, y, pr, rot, hex, alpha, rnd);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* --------------------------------------------------- personalisation */
  function recap(s = state) {
    const sz = sizeOf(s.size);
    const lines = [
      'Canvas size: ' + sz.label + ' — ' + sz.cm + ' (' + sz.inch + ')',
      'Finish: ' + (s.framed ? 'Premium wooden frame' : 'Canvas on wooden stretcher'),
      'Display easel: ' + (s.easel ? 'Yes (+' + money(C.EASEL_PRICE) + ')' : 'No'),
      'Ink pad colours: ' + (s.inks.length
        ? s.inks.slice().sort((a, b) => a - b).map(n => n + ' (' + inkOf(n).name + ')').join(', ')
        : '—'),
      'Extra ink pads: ' + extraInkCount(s) +
        (extraInkCount(s) ? ' (+' + money(extraInkCount(s) * C.EXTRA_INK_PRICE) + ')' : ''),
      'Font: ' + s.font + ' (' + fontOf(s.font).name + ')',
      'Names / text: ' + (s.names.trim() || '—'),
      'Name position: ' + Math.round(s.nameX * 100) + '% horizontal, ' +
        Math.round(s.nameY * 100) + '% vertical from default',
      'Name size: ' + Math.round(s.nameScale * 100) + '%',
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
      'PX' + Math.round(s.nameX * 1000),
      'PY' + Math.round(s.nameY * 1000),
      'PS' + Math.round(s.nameScale * 100),
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
    recap, reference, checkoutUrl, baseVariantKey, variantKey, priceOf, extraInkCount, money,
    sizeOf, fontOf, inkOf
  };
})();
