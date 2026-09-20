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
    crown: 'round',
    guests: 150,
    lang: 'English',
    seed: 20250625
  };

  const listeners = [];
  const onChange = fn => listeners.push(fn);
  const emit = () => listeners.forEach(fn => fn(state));

  /* ------------------------------------------------------------ geometry */
  // Normalised to the sheet. Derived by measuring the real artwork.
  const CROWN = {
    round: { cx: 0.520, cy: 0.325, rx: 0.400, ry: 0.235 },
    heart: { cx: 0.520, cy: 0.300, rx: 0.360, ry: 0.245 }
  };

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

  /* ------------------------------------ is a point inside the crown shape */
  function inHeart(u, v) {
    // u,v in [-1,1]; classic implicit heart, v flipped so the lobes sit up top
    const x = u * 1.18, y = -v * 1.10 + 0.32;
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0;
  }

  function crownSampler(style) {
    const g = CROWN[style] || CROWN.round;
    return function (rnd) {
      for (let i = 0; i < 60; i++) {
        const u = rnd() * 2 - 1, v = rnd() * 2 - 1;
        const inside = style === 'heart' ? inHeart(u, v) : (u * u + v * v <= 1);
        if (!inside) continue;
        // thin the very edge so the canopy fades out like the real thing
        const d = Math.sqrt(u * u + v * v);
        if (d > 0.72 && rnd() > 1 - (1 - d) / 0.55) continue;
        return { x: g.cx + u * g.rx, y: g.cy + v * g.ry };
      }
      return { x: g.cx, y: g.cy };
    };
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

    const inks = state.inks.length ? state.inks : [4];
    const colours = inks.map(n => inkOf(n).hex);
    const n = Math.max(6, Math.round(state.guests));
    const sample = crownSampler(state.crown);
    const rnd = mulberry32(state.seed);

    // print size scales with the canvas so a crowded L still reads as busy
    const g = CROWN[state.crown] || CROWN.round;
    const area = Math.PI * (g.rx * w) * (g.ry * h);
    const base = Math.sqrt(area / n) * 0.56;
    const r0 = Math.max(2.0, Math.min(base, w * 0.032));

    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < n; i++) {
      const p = sample(rnd);
      const hex = colours[Math.floor(rnd() * colours.length)];
      const r = r0 * (0.78 + rnd() * 0.46);
      drawPrint(ctx, p.x * w, p.y * h, r, (rnd() - 0.5) * 0.95, hex, 0.40 + rnd() * 0.28);
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
      'Canopy: ' + (s.crown === 'heart' ? 'Heart' : 'Full crown'),
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
      s.crown === 'heart' ? 'H' : 'R',
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

  /* ------------------------------------------------------ export as PNG */
  function toPNG() {
    const W = 900;
    const sz = sizeOf(state.size);
    const H = Math.round(W / sz.ratio);
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const o = out.getContext('2d');

    o.fillStyle = '#FCFCFA';
    o.fillRect(0, 0, W, H);

    // fingerprints, same recipe as the live preview
    const inks = (state.inks.length ? state.inks : [4]).map(n => inkOf(n).hex);
    const n = Math.max(6, Math.round(state.guests));
    const sample = crownSampler(state.crown);
    const rnd = mulberry32(state.seed);
    const g = CROWN[state.crown] || CROWN.round;
    const base = Math.sqrt((Math.PI * (g.rx * W) * (g.ry * H)) / n) * 0.56;
    const r0 = Math.max(2.0, Math.min(base, W * 0.032));

    o.globalCompositeOperation = 'multiply';
    for (let i = 0; i < n; i++) {
      const p = sample(rnd);
      const r = r0 * (0.78 + rnd() * 0.46);
      drawPrint(o, p.x * W, p.y * H, r, (rnd() - 0.5) * 0.95,
                inks[Math.floor(rnd() * inks.length)], 0.40 + rnd() * 0.28);
    }

    // branches on top, multiplied
    const tree = document.getElementById('treeImg');
    if (tree && tree.complete && tree.naturalWidth) {
      const th = H * 0.769, tw = th * (tree.naturalWidth / tree.naturalHeight);
      o.drawImage(tree, (W - Math.min(tw, W)) / 2, H * 0.074, Math.min(tw, W), th);
    }
    o.globalCompositeOperation = 'source-over';

    // lettering
    const f = fontOf(state.font);
    o.fillStyle = '#141414';
    o.textAlign = 'center';
    o.textBaseline = 'alphabetic';
    o.font = '400 ' + Math.round(W * 0.072 * f.scale) + "px " + f.css.replace(/'/g, '"');
    o.fillText(state.names || '', W / 2, H * 0.905);
    o.fillStyle = '#2A2A2A';
    o.font = '400 ' + Math.round(W * 0.026) + 'px Inter, sans-serif';
    o.fillText(state.date || '', W / 2, H * 0.955);

    return out.toDataURL('image/png');
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
    state, set, toggleInk, onChange, mount, render, toPNG,
    recap, reference, checkoutUrl, variantKey, priceOf, money,
    sizeOf, fontOf, inkOf
  };
})();
