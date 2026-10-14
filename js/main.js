/* Rumor Presents: New Year's Eve, Vol. 01
 * One fixed canvas draws the whole world: sky, the Rumor mirror ball, the skyline
 * and its reflection. Each section declares where the "camera" should sit
 * (data-scene), and the scene glides between them as you scroll.
 * Other scripts talk to the scene through window.Rumor and "rumor:*" events.
 */
'use strict';

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(`rumor:${name}`, { detail }));

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionQuery.matches;
  motionQuery.addEventListener('change', e => { reduced = e.matches; });
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const body = document.body;
  const root = document.documentElement;
  const canvas = $('#scene');
  const ctx = canvas.getContext('2d');
  const flashEl = $('.flash');

  /* ------------------------------------------------------------------ */
  /* Palettes                                                            */
  /* ------------------------------------------------------------------ */

  const hex = h => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  const KEYS = ['sky0', 'sky1', 'sky2', 'sky3', 'back', 'front', 'edge', 'win', 'glow', 'water0', 'water1', 'water2', 'ball', 'deep'];
  const THEMES = {
    ultramarine: {
      sky0: '#02032a', sky1: '#0e0c94', sky2: '#2724e2', sky3: '#8a87ff',
      back: '#2b29c4', front: '#17168c', edge: '#3a39dc',
      win: '#e4eaff', glow: '#7d7aff',
      water0: '#2a34ff', water1: '#0b0c62', water2: '#02032a',
      ball: '#0a0b48', deep: '#05063a',
      css: { deep: '#05063a', dim: '5, 6, 58', accent: '#a9adff' }
    },
    rose: {
      sky0: '#12020f', sky1: '#45093c', sky2: '#8c175f', sky3: '#ff86b3',
      back: '#6a1858', front: '#370a32', edge: '#8a2272',
      win: '#ffe4ef', glow: '#ff6aa9',
      water0: '#a3186b', water1: '#3a0832', water2: '#12020f',
      ball: '#1f0520', deep: '#14031a',
      css: { deep: '#14031a', dim: '20, 4, 24', accent: '#ff9cc4' }
    },
    emerald: {
      sky0: '#01100c', sky1: '#033a2d', sky2: '#08775c', sky3: '#7dffd0',
      back: '#0b5b49', front: '#05342b', edge: '#108064',
      win: '#e2fff3', glow: '#4dffb8',
      water0: '#0a9070', water1: '#043427', water2: '#01100c',
      ball: '#021a14', deep: '#01120e',
      css: { deep: '#01120e', dim: '2, 18, 14', accent: '#8fffd6' }
    },
    silver: {
      sky0: '#000000', sky1: '#111116', sky2: '#2a2a33', sky3: '#bdbdcc',
      back: '#2d2d35', front: '#16161b', edge: '#3d3d47',
      win: '#ffffff', glow: '#cfd0e6',
      water0: '#5a5a66', water1: '#17171c', water2: '#000000',
      ball: '#0c0c10', deep: '#000000',
      css: { deep: '#000000', dim: '0, 0, 0', accent: '#e4e4ee' }
    }
  };

  const pack = t => {
    const a = new Float32Array(KEYS.length * 3);
    KEYS.forEach((k, i) => a.set(hex(t[k]), i * 3));
    return a;
  };
  const colorNow = pack(THEMES.ultramarine);
  let colorTarget = colorNow.slice();
  const C = {};
  KEYS.forEach((k, i) => { C[k] = colorNow.subarray(i * 3, i * 3 + 3); });

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  const S = {
    W: 0, H: 0, dpr: 1, t: 0, dt: 0.016,
    horizon: 0, ref: 0, R: 150,
    cam: { x: 0.5, y: 0.29, s: 1, dim: 0, city: 0, a: 1 },
    camReady: false,
    entered: false, start: 0, intro: 0,
    rot: 0, spin: 0, fling: 0, rotV: 0,
    drag: null,
    light: [-0.45, -0.55, 0.7],
    mouse: { x: 0.5, y: 0.3, has: false },
    hold: 0, holding: false, press: 0, shake: 0,
    cityDark: 1, cel: 0, wave: 0,
    night: 0, pulse: 0, trail: [],
    ballAlpha: 1,
    ball: { x: -999, y: -999, R: 0, front: false },
    cacheDirty: true,
    lastScroll: scrollY
  };

  /* ------------------------------------------------------------------ */
  /* The mark on the ball                                                */
  /* Drawn once as a crisp vector sprite and laid over the facets, so it  */
  /* never shimmers or breaks up while the ball turns.                    */
  /* ------------------------------------------------------------------ */

  const FONT = '"ABC Diatype", "Diatype Fallback", "Helvetica Neue", Arial, sans-serif';
  const R_MARK = new Path2D('M 25.208 21.008 L 2.052 21.008 C 1.306 21.008 0.698 20.41 0.698 19.677 C 0.698 18.944 1.306 18.346 2.052 18.346 L 25.208 18.346 C 30.355 18.346 34.54 14.23 34.54 9.173 C 34.54 4.116 30.355 0 25.208 0 L 0.271 0 L 0.271 0.841 L 14.519 0.841 C 19.193 0.841 22.998 4.579 22.998 9.175 C 22.998 13.772 19.196 17.509 14.519 17.509 L 2.052 17.509 C 0.834 17.509 -0.155 18.484 -0.155 19.679 C -0.155 20.875 0.836 21.849 2.052 21.849 L 14.519 21.849 C 19.193 21.849 22.998 25.586 22.998 30.183 L 22.998 39.356 L 34.54 39.356 L 34.54 30.183 C 34.54 25.124 30.355 21.01 25.208 21.01 Z');
  const LOGO = 720; // sprite size, mapped to the ball's diameter
  const makeSprite = () => { const c = document.createElement('canvas'); c.width = c.height = LOGO; return c; };
  const logo = { cur: makeSprite(), prev: makeSprite(), mix: 1, ready: false };
  let letterKey = 'R*';

  function markPath(c, key, s) {
    if (key === 'R*') {
      const k = (s * 0.5) / 39.36;
      c.translate((s - 34.7 * k) / 2 + 0.155 * k + s * 0.012, (s - 39.36 * k) / 2);
      c.scale(k, k);
      c.fill(R_MARK);
      return;
    }
    let fs = s * 0.5;
    c.font = `500 ${fs}px ${FONT}`;
    let m = c.measureText(key);
    if (m.width > s * 0.5) { fs *= (s * 0.5) / m.width; c.font = `500 ${fs}px ${FONT}`; m = c.measureText(key); }
    const asc = m.actualBoundingBoxAscent || fs * 0.72, desc = m.actualBoundingBoxDescent || 0;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(key, s / 2, s / 2 + (asc - desc) / 2);
  }

  function renderLogo(key) {
    const swap = logo.prev; logo.prev = logo.cur; logo.cur = swap;
    const c = logo.cur.getContext('2d');
    const s = LOGO;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, s, s);
    // soft bloom
    c.save();
    c.shadowColor = 'rgba(255, 255, 255, 0.85)';
    c.shadowBlur = s * 0.045;
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    markPath(c, key, s);
    c.restore();
    // the mark itself, lit from above
    c.save();
    const g = c.createLinearGradient(0, s * 0.22, 0, s * 0.78);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#e3e6ff');
    c.fillStyle = g;
    markPath(c, key, s);
    c.restore();
    // a fine LED grain inside the mark, so it belongs to the mirror ball
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(30, 32, 110, 0.2)';
    const step = s / 64;
    c.beginPath();
    for (let y = 0, row = 0; y < s; y += step * 0.866, row++) {
      for (let x = (row % 2) * step * 0.5; x < s; x += step) {
        c.moveTo(x + step * 0.17, y);
        c.arc(x, y, step * 0.17, 0, Math.PI * 2);
      }
    }
    c.fill();
    c.restore();
    logo.mix = !logo.ready || reduced ? 1 : 0;
    logo.ready = true;
  }
  const showLogo = () => renderLogo(letterKey);
  renderLogo('R*');

  /* ------------------------------------------------------------------ */
  /* City                                                                */
  /* ------------------------------------------------------------------ */

  const skyCanvas = document.createElement('canvas'); // skyline at the horizon, for reflections
  const sctx = skyCanvas.getContext('2d');
  const cityCache = document.createElement('canvas'); // building bodies, redrawn only on theme/resize
  const cctx = cityCache.getContext('2d');
  let city = null;

  function rng(seed) {
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function makeLayer(ww, wh, alpha) {
    return { b: [], ww, wh, alpha, x: [], y: [], lit: [], r1: [], r2: [], ph: [], sp: [] };
  }

  function addBuilding(L, rand, x, w, h, type, k) {
    const b = { x, w, h, type, dir: rand() < 0.5 ? -1 : 1, slant: h * (0.1 + rand() * 0.14) };
    if (type === 'empire') b.slant = 0;
    L.b.push(b);
    const padX = Math.max(3 * k, w * 0.14);
    const sx = L.ww * 2.4;
    const sy = L.wh * 4.4;
    for (let ry = h - 7 * k; ry > 5 * k; ry -= sy) {
      const rowP = rand() < 0.38 ? 0.78 : 0.07;
      for (let xx = x + padX; xx < x + w - padX - L.ww; xx += sx) {
        if (type === 'slant') {
          const f = (xx - x) / w;
          const topAt = h - b.slant * (b.dir > 0 ? f : 1 - f);
          if (ry > topAt - 7 * k) continue;
        }
        L.x.push(xx); L.y.push(-ry);
        L.lit.push(rand() < rowP ? 1 : 0);
        L.r1.push(rand()); L.r2.push(rand());
        L.ph.push(rand() * Math.PI * 2); L.sp.push(0.3 + rand() * 1.6);
      }
    }
    return b;
  }

  function buildCity() {
    const W = S.W, ref = S.ref;
    const k = clamp(W / 1300, 0.62, 1.25);
    const rand = rng(1931);
    const back = makeLayer(Math.max(1.6, 2.4 * k), Math.max(1.1, 1.3 * k), 0.42);
    const front = makeLayer(Math.max(2, 3.2 * k), Math.max(1.3, 1.7 * k), 1);

    let x = -30;
    while (x < W + 30) {
      const w = (24 + rand() * 58) * k;
      const h = ref * (0.06 + rand() * 0.12);
      addBuilding(back, rand, x, w, h, rand() < 0.18 ? 'slant' : 'flat', k);
      x += w * (0.55 + rand() * 0.6);
    }
    x = -20;
    while (x < W + 20) {
      const w = (28 + rand() * 54) * k;
      const h = ref * (0.035 + Math.pow(rand(), 1.7) * 0.13);
      addBuilding(front, rand, x, w, h, rand() < 0.12 ? 'slant' : 'flat', k);
      x += w + (rand() < 0.3 ? rand() * 16 * k : 1.5 * k);
    }
    // Landmarks, drawn last so they stand in front: a pencil tower, a slanted crown, a spire.
    addBuilding(front, rand, W * 0.15, 30 * k, ref * 0.24, 'flat', k);
    addBuilding(front, rand, W * 0.41, 50 * k, ref * 0.27, 'slant', k);
    const empire = addBuilding(front, rand, W * 0.7, 46 * k, ref * 0.17, 'empire', k);
    city = { layers: [back, front], empire, k };
    for (const L of city.layers) {
      for (const key of ['x', 'y', 'lit', 'r1', 'r2', 'ph', 'sp']) L[key] = Float32Array.from(L[key]);
      L.n = L.x.length;
    }
    S.cacheDirty = true;
  }

  function buildingPath(c, b, base, ref) {
    c.moveTo(b.x, base);
    if (b.type === 'slant') {
      c.lineTo(b.x, base - b.h + (b.dir > 0 ? 0 : b.slant));
      c.lineTo(b.x + b.w, base - b.h + (b.dir > 0 ? b.slant : 0));
    } else if (b.type === 'empire') {
      // stepped crown rising to a spire
      const t = base - b.h;
      const pts = [[0, 0], [0.16, 0], [0.16, 0.035], [0.3, 0.035], [0.3, 0.065], [0.42, 0.065], [0.47, 0.095], [0.5, 0.16],
        [0.53, 0.095], [0.58, 0.065], [0.7, 0.065], [0.7, 0.035], [0.84, 0.035], [0.84, 0], [1, 0]];
      for (const [fx, up] of pts) c.lineTo(b.x + b.w * fx, t - ref * up);
    } else {
      c.lineTo(b.x, base - b.h);
      c.lineTo(b.x + b.w, base - b.h);
    }
    c.lineTo(b.x + b.w, base);
    c.closePath();
  }

  function renderCityCache() {
    const d = S.dpr;
    const cacheH = Math.ceil(S.ref * 0.42);
    cityCache.width = Math.max(1, Math.ceil(S.W * d));
    cityCache.height = Math.max(1, Math.ceil(cacheH * d));
    cctx.setTransform(d, 0, 0, d, 0, 0);
    cctx.clearRect(0, 0, S.W, cacheH);
    const base = cacheH;
    const [back, front] = city.layers;

    cctx.fillStyle = rgba(C.back);
    cctx.beginPath();
    for (const b of back.b) buildingPath(cctx, b, base, S.ref);
    cctx.fill();

    for (const b of front.b) {
      const g = cctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
      g.addColorStop(0, rgba(C.edge));
      g.addColorStop(0.35, rgba(C.front));
      g.addColorStop(1, rgba(C.front));
      cctx.fillStyle = g;
      cctx.beginPath();
      buildingPath(cctx, b, base, S.ref);
      cctx.fill();
      cctx.fillStyle = rgba(C.glow, 0.22);
      if (b.type === 'flat') cctx.fillRect(b.x, base - b.h, Math.max(1, b.w * 0.04), b.h);
    }
    city.cacheH = cacheH;
    S.cacheDirty = false;
  }

  function drawWindows(c, L, base) {
    const n = L.n;
    const p = [new Path2D(), new Path2D(), new Path2D()];
    const t = S.t;
    const dark = S.cityDark, cel = S.cel, wave = S.wave * S.W, bx = S.ball.x;
    const ww = L.ww, wh = L.wh;
    const fill = S.night * 0.32;
    const near = S.mouse.has && S.cam.dim < 0.4 && !reduced;
    const mx = S.mouse.x * S.W, my = S.mouse.y * S.H, rad = 150, rad2 = rad * rad;
    for (let i = 0; i < n; i++) {
      let on = L.lit[i];
      if (!on && L.r2[i] < fill) on = 1;
      if (near && !on) {
        const dx = L.x[i] - mx, dy = base + L.y[i] - my, d2 = dx * dx + dy * dy;
        if (d2 < rad2 && L.r2[i] < (1 - Math.sqrt(d2) / rad) * 0.85) on = 1;
      }
      if (!reduced && Math.sin(t * L.sp[i] * 0.35 + L.ph[i] * 7) > 0.997) on = 1 - on;
      if (cel > 0 && L.r2[i] < cel * 0.92 && Math.abs(L.x[i] - bx) < wave) on = 1;
      if (L.r1[i] < dark) on = 0;
      if (!on) continue;
      p[(L.r2[i] * 2.999) | 0].rect(L.x[i], base + L.y[i], ww, wh);
    }
    const a = L.alpha;
    c.fillStyle = rgba(C.glow, 0.75 * a); c.fill(p[0]);
    c.fillStyle = rgba(C.win, 0.7 * a); c.fill(p[1]);
    c.fillStyle = rgba(C.win, a); c.fill(p[2]);
  }

  function drawSpire(c, base) {
    if (S.cityDark >= 0.5) return;
    const e = city.empire, ref = S.ref, k = city.k;
    const top = base - e.h;
    c.fillStyle = rgba(C.win, 0.95);
    const s = Math.max(1.4, 1.8 * k);
    for (let i = 0; i < 9; i++) {
      const f = i / 8;
      const y = top - ref * (0.065 + f * 0.09);
      const half = e.w * (0.12 * (1 - f));
      for (let xx = -half; xx <= half + 0.01; xx += s * 2.2) c.fillRect(e.x + e.w * 0.5 + xx - s / 2, y, s, s);
    }
    const blink = reduced ? 1 : 0.5 + 0.5 * Math.sin(S.t * 2.2);
    c.fillStyle = rgba(C.glow, 0.4 + 0.6 * blink);
    c.beginPath();
    c.arc(e.x + e.w * 0.5, top - ref * 0.165, 1.8 * k + 0.6, 0, Math.PI * 2);
    c.fill();
  }

  /* ------------------------------------------------------------------ */
  /* Ambient details: stars, water glints, mirror-ball reflections        */
  /* ------------------------------------------------------------------ */

  let stars = [], glints = [];
  const spot = document.createElement('canvas'); // a soft light sprite, tinted per theme
  spot.width = spot.height = 64;
  const spotCtx = spot.getContext('2d');
  let spotTint = '';

  function tintSpot() {
    const key = rgba(C.win);
    if (key === spotTint) return;
    spotTint = key;
    spotCtx.clearRect(0, 0, 64, 64);
    const g = spotCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, rgba(C.win, 1));
    g.addColorStop(0.35, rgba(C.win, 0.5));
    g.addColorStop(1, rgba(C.glow, 0));
    spotCtx.fillStyle = g;
    spotCtx.fillRect(0, 0, 64, 64);
  }

  function buildAmbient() {
    const rand = rng(77);
    stars = Array.from({ length: Math.round(clamp(S.W * S.H / 14000, 40, 120)) }, () => ({
      x: rand() * S.W, y: rand() * S.horizon * 0.62, r: 0.5 + rand() * 1.1, ph: rand() * 6.28, sp: 0.4 + rand() * 1.4
    }));
    glints = Array.from({ length: Math.round(clamp(S.W / 9, 40, 160)) }, () => ({
      x: rand() * S.W, d: Math.pow(rand(), 1.4), len: 6 + rand() * 30, ph: rand() * 6.28, sp: 0.6 + rand() * 1.5
    }));
  }

  // light thrown by the mirror ball, sweeping across the sky and the towers
  function drawReflections(c, bx, by, alpha) {
    if (alpha <= 0.01) return;
    tintSpot();
    const speed = Math.abs(S.rotV);
    const stretch = 1 + Math.min(2.6, speed * 0.9);
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 34; k++) {
      const lon = k * 2.39996 + S.rot * 1.4;
      const front = Math.cos(lon);
      if (front < 0.08) continue;
      const lat = Math.sin(k * 1.71) * 0.75;
      const x = bx + Math.sin(lon) * Math.cos(lat) * S.W * 0.85;
      const y = by + S.H * 0.18 + lat * S.H * 0.5;
      if (x < -40 || x > S.W + 40 || y > S.horizon + 10) continue;
      const r = 5 + (k % 5) * 2.2;
      c.globalAlpha = alpha * front * (0.45 + 0.55 * ((k * 0.37) % 1));
      c.drawImage(spot, x - r * stretch, y - r, r * 2 * stretch, r * 2);
    }
    c.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Sizing                                                              */
  /* ------------------------------------------------------------------ */

  function resize() {
    S.W = innerWidth;
    S.H = innerHeight;
    S.dpr = Math.min(devicePixelRatio || 1, S.W < 760 ? 1.75 : S.W > 1700 ? 1.5 : 2);
    canvas.width = Math.max(1, Math.round(S.W * S.dpr));
    canvas.height = Math.max(1, Math.round(S.H * S.dpr));
    S.horizon = Math.round(S.H * (S.W < 760 ? 0.68 : 0.7));
    S.ref = Math.min(S.H, S.W * 0.95);
    S.R = Math.min(S.W * 0.27, S.H * 0.16, 190);
    skyCanvas.width = canvas.width;
    skyCanvas.height = Math.max(1, Math.ceil(S.horizon * S.dpr));
    root.style.setProperty('--ballR', `${S.R}px`);
    buildCity();
    buildAmbient();
  }

  /* ------------------------------------------------------------------ */
  /* Camera: each section says where the ball and city should be         */
  /* ------------------------------------------------------------------ */

  const scenes = $$('[data-scene]').map(el => ({
    el,
    d: JSON.parse(el.dataset.scene),
    m: el.dataset.sceneMobile ? JSON.parse(el.dataset.sceneMobile) : null
  }));
  const CAM_KEYS = ['x', 'y', 's', 'dim', 'city', 'a'];
  let midVis = 0;

  function cameraTarget() {
    const vh = S.H, mid = vh / 2, mobile = S.W < 900;
    const acc = { x: 0, y: 0, s: 0, dim: 0, city: 0, a: 0 };
    let sum = 0;
    midVis = 0;
    for (const sc of scenes) {
      const r = sc.el.getBoundingClientRect();
      const center = (r.top + r.bottom) / 2;
      const plateau = Math.max(0, r.height - vh) / 2;
      const dist = Math.max(0, Math.abs(center - mid) - plateau);
      const w = smooth(1 - dist / (vh * 0.8));
      if (sc.el.id === 'midnight') midVis = w;
      if (w <= 0) continue;
      const d = (mobile && sc.m) || sc.d;
      for (const key of CAM_KEYS) {
        let v = d[key] ?? (key === 'a' ? 1 : 0);
        // anchored scenes keep the ball pinned to their own layout as they scroll
        if (key === 'y' && d.anchor) v += r.top / vh;
        acc[key] += v * w;
      }
      sum += w;
    }
    if (!sum) return null;
    for (const key of CAM_KEYS) acc[key] /= sum;
    return acc;
  }

  /* ------------------------------------------------------------------ */
  /* The mirror ball                                                     */
  /* ------------------------------------------------------------------ */

  const facets = { u: [], v: [] }; // last frame's visible facets, in ball units
  const BUCKETS = 22;

  function drawBall(c, cx, cy, R, alpha) {
    if (!(R > 2)) return;
    const glowA = (0.28 + S.hold * 0.35 + S.cel * 0.1 + S.pulse * 0.55 + Math.min(0.2, Math.abs(S.rotV) * 0.05)) * S.cam.a;
    const halo = c.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * (3.2 + S.hold));
    halo.addColorStop(0, rgba(C.glow, glowA));
    halo.addColorStop(1, rgba(C.glow, 0));
    c.fillStyle = halo;
    c.fillRect(cx - R * 4.5, cy - R * 4.5, R * 9, R * 9);

    // the line it hangs from
    c.fillStyle = rgba(C.win, 0.5 * alpha);
    for (let y = cy - R - 4; y > -4; y -= 7) c.fillRect(cx - 0.6, y, 1.2, 2.2);

    if (alpha <= 0.01) return;
    c.save();
    c.globalAlpha = alpha;

    const bodyG = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    bodyG.addColorStop(0, rgba([C.ball[0] + 40, C.ball[1] + 40, C.ball[2] + 70]));
    bodyG.addColorStop(1, rgba(C.ball));
    c.fillStyle = bodyG;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();

    const rows = Math.round(clamp(R / 3.6, 26, 46));
    const tilt = 0.14 + (S.mouse.has ? (S.mouse.y - 0.4) * 0.25 : 0);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const [lx, ly, lz] = S.light;
    // half vector between light and viewer for the specular glint
    let hx = lx, hy = ly, hz = lz + 1;
    const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;

    const paths = Array.from({ length: BUCKETS }, () => new Path2D());
    const dimRest = 1 - S.hold * 0.4;
    const sparkGain = 0.35 + Math.min(0.5, Math.abs(S.rotV) * 0.12);
    const t = S.t;
    facets.u.length = 0; facets.v.length = 0;
    const step = Math.PI / rows;
    const baseR = R * step * 0.45;

    for (let i = 0; i < rows; i++) {
      const lat = -Math.PI / 2 + (i + 0.5) * step;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      const n = Math.max(6, Math.round(rows * 2 * cl));
      const off = (i % 2) * 0.5;
      for (let j = 0; j < n; j++) {
        const lon = ((j + off) / n) * Math.PI * 2 + S.rot;
        const x3 = cl * Math.sin(lon);
        const z0 = cl * Math.cos(lon);
        const y3 = sl * ct - z0 * st;
        const z3 = sl * st + z0 * ct;
        if (z3 <= 0.02) continue;
        // facets shrink smoothly toward the rim instead of popping in and out
        const r = baseR * Math.sqrt(z3) * 0.98;
        if (r < 0.35) continue;
        const sx = cx + x3 * R, sy = cy + y3 * R;
        const diff = Math.max(0, x3 * lx + y3 * ly + z3 * lz);
        const spec = Math.pow(Math.max(0, x3 * hx + y3 * hy + z3 * hz), 28);
        // each facet glints on its own slow clock, independent of rotation
        const seed = ((i * 73.13 + j * 19.7) % 6.283) * 9.1;
        const spark = reduced ? 0 : Math.pow(0.5 + 0.5 * Math.sin(t * 1.1 + seed), 14);
        // facets behind the mark stay quiet so the logo always reads cleanly
        const quiet = 1 - 0.82 * smooth(1 - Math.hypot(x3, y3 + 0.02) / 0.62);
        const b = (0.06 + 0.24 * diff * z3 + 0.7 * spec + sparkGain * spark * diff) * dimRest * (0.55 + 0.45 * z3) * quiet;
        const bi = Math.min(BUCKETS - 1, Math.round(clamp(b, 0, 1) * (BUCKETS - 1)));
        paths[bi].moveTo(sx + r, sy);
        paths[bi].arc(sx, sy, r, 0, Math.PI * 2);
        facets.u.push(x3); facets.v.push(y3);
      }
    }
    for (let i = 0; i < BUCKETS; i++) {
      const f = i / (BUCKETS - 1);
      c.fillStyle = f < 0.6 ? rgba(C.glow, 0.08 + f * 0.8) : rgba(C.win, 0.45 + f * 0.55);
      c.fill(paths[i]);
    }

    // the mark: a soft shadow to seat it, then the crisp sprite
    const seat = c.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 0.92);
    seat.addColorStop(0, rgba(C.ball, 0.78));
    seat.addColorStop(0.6, rgba(C.ball, 0.5));
    seat.addColorStop(1, rgba(C.ball, 0));
    c.fillStyle = seat;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.clip();
    const lvl = alpha * (0.94 + S.hold * 0.06);
    if (logo.mix < 1) {
      c.globalAlpha = lvl * (1 - logo.mix);
      c.drawImage(logo.prev, cx - R, cy - R, R * 2, R * 2);
    }
    c.globalAlpha = lvl * logo.mix;
    c.drawImage(logo.cur, cx - R, cy - R, R * 2, R * 2);
    if (S.hold > 0.01) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = alpha * S.hold * 0.45;
      c.drawImage(logo.cur, cx - R, cy - R, R * 2, R * 2);
    }
    c.restore();
    c.globalAlpha = alpha;

    c.strokeStyle = rgba(C.glow, 0.35);
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Midnight                                                            */
  /* ------------------------------------------------------------------ */

  const M = { state: 'idle', t: 0, P: null, shown: false };
  const strikeBtn = $('#strike');
  const ticksSvg = $('#ticks');
  const statusEl = $('#midnightStatus');
  const afterEl = $('#after');
  let lastTick = 0;

  // twelve strikes around the ball
  (() => {
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', 50 + Math.cos(a) * 46);
      l.setAttribute('y1', 50 + Math.sin(a) * 46);
      l.setAttribute('x2', 50 + Math.cos(a) * 49.5);
      l.setAttribute('y2', 50 + Math.sin(a) * 49.5);
      l.setAttribute('class', 'tick');
      ticksSvg.appendChild(l);
    }
  })();
  const ticks = $$('.tick', ticksSvg);

  function buildYearTargets(R) {
    const tw = Math.min(S.W * 0.86, 900);
    const g = clamp(tw / 82, 5, 12.5);
    const off = document.createElement('canvas');
    const th = Math.ceil(tw * 0.42);
    off.width = Math.ceil(tw); off.height = th;
    const oc = off.getContext('2d');
    let fs = th * 0.95;
    oc.font = `600 ${fs}px ${FONT}`;
    const w = oc.measureText('2027').width;
    fs *= Math.min(1, (tw * 0.98) / w);
    oc.font = `600 ${fs}px ${FONT}`;
    oc.textAlign = 'center';
    oc.textBaseline = 'middle';
    oc.fillStyle = '#fff';
    oc.fillText('2027', tw / 2, th / 2);
    const data = oc.getImageData(0, 0, off.width, th).data;
    const pts = [];
    for (let y = g / 2; y < th; y += g) {
      for (let x = g / 2; x < tw; x += g) {
        if (data[((y | 0) * off.width + (x | 0)) * 4 + 3] > 140) pts.push([(x - tw / 2) / R, (y - th / 2) / R - 0.35]);
      }
    }
    return { pts, dot: (g * 0.36) / R };
  }

  function strike() {
    if (M.state === 'struck') return;
    const R = S.ball.R || S.R;
    const { pts, dot } = buildYearTargets(R);
    const n = pts.length;
    const rand = Math.random;
    const fu = facets.u.length ? facets.u : [0], fv = facets.v.length ? facets.v : [0];
    const F = () => new Float32Array(n);
    const P = {
      n, dot,
      sx: F(), sy: F(), ex: F(), ey: F(), tx: F(), ty: F(), d: F(), ph: F(),
      ox: F(), oy: F(), vx: F(), vy: F(), px: F(), py: F()
    };
    for (let i = 0; i < n; i++) {
      const f = (rand() * fu.length) | 0;
      P.sx[i] = fu[f]; P.sy[i] = fv[f];
      const a = Math.atan2(fv[f], fu[f]) + (rand() - 0.5) * 0.9;
      const dist = 1.3 + rand() * 1.8;
      P.ex[i] = Math.cos(a) * dist; P.ey[i] = Math.sin(a) * dist;
      P.tx[i] = pts[i][0]; P.ty[i] = pts[i][1];
      P.d[i] = rand() * 0.3; P.ph[i] = rand() * 6.28;
    }
    M.P = P;
    M.state = 'struck';
    M.t = 0;
    M.shown = false;
    S.hold = 0;
    S.holding = false;
    S.shake = reduced ? 0 : 1;
    body.classList.add('is-midnight');
    statusEl.textContent = 'Midnight. Happy New Year.';
    if (navigator.vibrate) navigator.vibrate([24, 60, 40]);
    emit('strike');
  }

  function resetMidnight(silent) {
    if (M.state !== 'struck') return;
    M.state = 'resetting';
    M.t = 0;
    body.classList.remove('is-celebrating');
    afterEl.setAttribute('aria-hidden', 'true');
    $$('a, button', afterEl).forEach(el => el.setAttribute('tabindex', '-1'));
    statusEl.textContent = '';
    if (silent === true) return;
    strikeBtn.focus({ preventScroll: true });
    emit('reset');
  }

  // a tap in the new year's sky pushes the dots away; they spring back
  function shock(x, y) {
    const P = M.P;
    if (!P || M.state !== 'struck' || M.t < 2.2) return false;
    const radius = Math.max(S.W, S.H) * 0.45;
    for (let i = 0; i < P.n; i++) {
      const dx = P.px[i] - x, dy = P.py[i] - y, d = Math.hypot(dx, dy) || 1;
      if (d > radius) continue;
      const f = Math.pow(1 - d / radius, 1.4) * 2600;
      P.vx[i] += (dx / d) * f; P.vy[i] += (dy / d) * f;
    }
    emit('shock');
    return true;
  }

  function updateMidnight(dt) {
    if (M.state === 'idle') return;
    M.t += dt;
    if (M.state === 'struck') {
      S.ballAlpha = 0;
      // once you have scrolled on, the new year quietly folds back into the ball
      if (M.t > 3 && midVis < 0.02) { resetMidnight(true); return; }
      if (!M.shown && (M.t > 2.6 || reduced)) {
        M.shown = true;
        body.classList.add('is-celebrating');
        afterEl.setAttribute('aria-hidden', 'false');
        $$('a, button', afterEl).forEach(el => el.removeAttribute('tabindex'));
      }
    } else if (M.state === 'resetting') {
      const dur = reduced ? 0.4 : 1.4;
      S.ballAlpha = smooth((M.t - dur * 0.7) / (dur * 0.3));
      if (M.t >= dur) {
        M.state = 'idle';
        M.P = null;
        S.ballAlpha = 1;
        body.classList.remove('is-midnight');
      }
    }
  }

  function drawParticles(c, cx, cy, R, dt) {
    const P = M.P;
    if (!P) return;
    const resetDur = reduced ? 0.4 : 1.4;
    const paths = [new Path2D(), new Path2D()];
    const r = Math.max(1, P.dot * R);
    const mx = S.mouse.x * S.W, my = S.mouse.y * S.H, near = S.mouse.has && M.state === 'struck';
    let alpha = 1;
    if (M.state === 'resetting') alpha = 1 - smooth((M.t - resetDur * 0.7) / (resetDur * 0.3));
    alpha *= smooth(midVis * 1.6);
    if (alpha <= 0.01) return;
    const damp = Math.exp(-dt * 3.2);

    for (let i = 0; i < P.n; i++) {
      let u, v, lit;
      if (M.state === 'struck') {
        const lt = reduced ? 9 : M.t - P.d[i];
        if (lt <= 0) { u = P.sx[i]; v = P.sy[i]; }
        else if (lt < 0.6) { const k = easeOut(lt / 0.6); u = lerp(P.sx[i], P.ex[i], k); v = lerp(P.sy[i], P.ey[i], k); }
        else { const k = easeInOut(clamp((lt - 0.6) / 1.7, 0, 1)); u = lerp(P.ex[i], P.tx[i], k); v = lerp(P.ey[i], P.ty[i], k); }
        lit = lt > 2.3 && !reduced ? 0.62 + 0.38 * Math.sin(S.t * 2 + P.ph[i] * 5) : 1;
      } else {
        const k = easeInOut(clamp(M.t / (resetDur * 0.75), 0, 1));
        u = lerp(P.tx[i], P.sx[i], k); v = lerp(P.ty[i], P.sy[i], k);
        lit = 1;
      }
      const bx = cx + u * R, by = cy + v * R;

      // spring offsets: the cursor parts the dots, taps send shockwaves
      if (!reduced) {
        if (near) {
          const dx = bx + P.ox[i] - mx, dy = by + P.oy[i] - my, d = Math.hypot(dx, dy);
          if (d < 130 && d > 0.01) {
            const f = Math.pow(1 - d / 130, 2) * 5200 * dt;
            P.vx[i] += (dx / d) * f; P.vy[i] += (dy / d) * f;
          }
        }
        P.vx[i] = (P.vx[i] - P.ox[i] * 38 * dt) * damp;
        P.vy[i] = (P.vy[i] - P.oy[i] * 38 * dt) * damp;
        P.ox[i] += P.vx[i] * dt;
        P.oy[i] += P.vy[i] * dt;
      }
      const x = bx + P.ox[i], y = by + P.oy[i];
      P.px[i] = x; P.py[i] = y;
      const moving = Math.abs(P.vx[i]) + Math.abs(P.vy[i]) > 60;
      const p = paths[lit > 0.8 || moving ? 1 : 0];
      p.moveTo(x + r, y);
      p.arc(x, y, r, 0, Math.PI * 2);
    }
    c.save();
    c.globalAlpha = alpha;
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = rgba(C.glow, 0.5);
    c.fill(paths[0]); c.fill(paths[1]);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = rgba(C.win, 0.7); c.fill(paths[0]);
    c.fillStyle = rgba(C.win, 1); c.fill(paths[1]);
    c.restore();
  }

  function drawSearchlights(c, a) {
    if (a <= 0.01) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    [0.12, 0.38, 0.63, 0.9].forEach((fx, i) => {
      const x = fx * S.W, y = S.horizon - S.ref * 0.12;
      const ang = -Math.PI / 2 + Math.sin(S.t * 0.35 + i * 1.9) * 0.45;
      const len = S.H * 1.2, spread = 0.05;
      const g = c.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.addColorStop(0, rgba(C.win, 0.16 * a));
      g.addColorStop(1, rgba(C.win, 0));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(ang - spread) * len, y + Math.sin(ang - spread) * len);
      c.lineTo(x + Math.cos(ang + spread) * len, y + Math.sin(ang + spread) * len);
      c.closePath();
      c.fill();
    });
    c.restore();
  }

  /* ------------------------------------------------------------------ */
  /* After midnight: paint the sky with light                            */
  /* ------------------------------------------------------------------ */

  const midnightEl = $('#midnight');
  let lastPaint = null;
  if (finePointer) {
    addEventListener('pointermove', e => {
      if (reduced || M.state !== 'struck' || !M.shown || midVis < 0.6) { lastPaint = null; return; }
      if (e.target.closest && e.target.closest('a, button')) { lastPaint = null; return; }
      const x = e.clientX, y = e.clientY;
      if (lastPaint) {
        const d = Math.hypot(x - lastPaint[0], y - lastPaint[1]);
        const steps = Math.min(8, Math.floor(d / 9));
        for (let k = 1; k <= steps; k++) {
          const f = k / steps;
          S.trail.push({ x: lerp(lastPaint[0], x, f), y: lerp(lastPaint[1], y, f), t: 0, r: 2 + Math.random() * 3.5 });
        }
      }
      lastPaint = [x, y];
      if (S.trail.length > 420) S.trail.splice(0, S.trail.length - 420);
    }, { passive: true });
  }

  function drawTrail(c) {
    if (!S.trail.length) return;
    tintSpot();
    c.save();
    c.globalCompositeOperation = 'lighter';
    const dt = S.dt;
    let keep = 0;
    for (let i = 0; i < S.trail.length; i++) {
      const p = S.trail[i];
      p.t += dt;
      if (p.t > 1.8) continue;
      S.trail[keep++] = p;
      const life = 1 - p.t / 1.8;
      const r = p.r * (0.6 + life * 0.8) * 2.4;
      c.globalAlpha = life * life * 0.9;
      c.drawImage(spot, p.x - r, p.y - r - p.t * 6, r * 2, r * 2);
    }
    S.trail.length = keep;
    c.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                               */
  /* ------------------------------------------------------------------ */

  function update(dt) {
    S.dt = dt;
    if (!reduced) S.t += dt;

    // palette crossfade
    let moving = false;
    const k = 1 - Math.pow(0.004, dt);
    for (let i = 0; i < colorNow.length; i++) {
      const d = colorTarget[i] - colorNow[i];
      if (Math.abs(d) > 0.3) { colorNow[i] += d * k; moving = true; } else colorNow[i] = colorTarget[i];
    }
    if (moving) S.cacheDirty = true;

    // letter crossfade
    if (logo.mix < 1) logo.mix = Math.min(1, logo.mix + dt / 0.5);

    S.intro = !S.entered ? 0 : reduced ? 1 : Math.min(1, (performance.now() - S.start) / 2200);

    // camera
    const target = cameraTarget();
    if (target) {
      const ck = !S.camReady || reduced ? 1 : 1 - Math.exp(-dt * 6.5);
      for (const key of CAM_KEYS) S.cam[key] = lerp(S.cam[key], target[key], ck);
      S.camReady = true;
    }

    // scroll adds a little spin
    const dy = scrollY - S.lastScroll;
    S.lastScroll = scrollY;
    S.spin = clamp(S.spin * Math.pow(0.04, dt) + Math.abs(dy) * 0.0035, 0, 2.5);

    // light follows the cursor; drifts by itself on touch
    let lx, ly;
    if (S.mouse.has) {
      lx = (S.mouse.x * S.W - S.ball.x) / (S.W * 0.5);
      ly = (S.mouse.y * S.H - S.ball.y) / (S.H * 0.5);
    } else {
      lx = -0.45 + Math.sin(S.t * 0.25) * 0.35;
      ly = -0.5 + Math.cos(S.t * 0.2) * 0.15;
    }
    const L = [clamp(lx, -1.2, 1.2), clamp(ly, -1.2, 1.2), 0.75];
    const ll = Math.hypot(...L);
    const lk = 1 - Math.exp(-dt * 4);
    for (let i = 0; i < 3; i++) S.light[i] = lerp(S.light[i], L[i] / ll, lk);

    // hold to strike
    if (M.state === 'idle') {
      if (S.holding) S.hold = Math.min(1, S.hold + dt / 2.6);
      else S.hold = Math.max(0, S.hold - dt / 0.7);
      const count = Math.floor(S.hold * 12 + 1e-6);
      if (count !== lastTick) {
        ticks.forEach((el, i) => el.classList.toggle('on', i < count));
        if (count > lastTick && S.holding) {
          if (navigator.vibrate) navigator.vibrate(8);
          emit('tick', count);
        }
        lastTick = count;
      }
      if (S.hold >= 1) strike();
    } else if (lastTick) {
      ticks.forEach(el => el.classList.remove('on'));
      lastTick = 0;
    }

    // the ball gives a little under your finger, and trembles as midnight nears
    S.press = lerp(S.press, S.holding ? 1 : 0, 1 - Math.exp(-dt * 14));
    S.shake = Math.max(0, S.shake - dt * 1.6);
    S.pulse = Math.max(0, S.pulse - dt * 1.4);

    // the evening moves with the page: 9 PM at the top, 11:59 at the midnight section
    const midTop = midnightEl.getBoundingClientRect().top + scrollY;
    S.night = M.state === 'struck' ? 1 : clamp(scrollY / Math.max(1, midTop), 0, 1);

    // rotation: idle drift + scroll spin + flings from dragging
    const prev = S.rot;
    if (!S.drag) {
      const speed = (reduced ? 0 : 0.11 + S.spin * 0.4) * (1 - S.hold * 0.9);
      S.rot += (speed + S.fling) * dt;
      S.fling *= Math.exp(-dt * 0.9);
      if (Math.abs(S.fling) < 0.01) S.fling = 0;
    }
    S.rotV = lerp(S.rotV, (S.rot - prev) / Math.max(dt, 0.001), 0.25);

    updateMidnight(dt);

    // city lights
    const introDark = 1 - smooth((S.intro - 0.35) / 0.55);
    if (M.state === 'struck') {
      S.cityDark = 0;
      S.cel = Math.min(1, S.cel + dt * 2);
      S.wave = reduced ? 2 : easeOut(clamp((M.t - 0.15) / 2.4, 0, 1)) * 1.1;
    } else {
      S.cityDark = Math.max(introDark, S.hold * 0.97);
      S.cel = Math.max(0, S.cel - dt / 1.6);
    }

    const flash = M.state === 'struck' && !reduced ? Math.max(0, 0.38 * (1 - M.t / 0.9)) * (M.t < 0.05 ? M.t / 0.05 : 1) : 0;
    flashEl.style.opacity = flash.toFixed(3);

    if (window.RumorAudio) window.RumorAudio.frame(Math.abs(S.rotV) * (1 - S.cam.dim), 1 - S.cam.dim + S.hold * 0.6);
  }

  function render(dt) {
    const { W, H, dpr } = S;
    const c = ctx;
    // a short jolt when midnight strikes
    const q = S.shake * S.shake * 6;
    const ox = q ? Math.sin(S.t * 71) * q : 0, oy = q ? Math.cos(S.t * 57) * q : 0;
    c.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
    if (q) { c.fillStyle = rgba(C.sky0); c.fillRect(-10, -10, W + 20, H + 20); }

    const hz = S.horizon;
    const cityBase = hz + Math.max(0, S.cam.city) * H;

    // sky
    const sky = c.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, rgba(C.sky0));
    sky.addColorStop(0.42, rgba(C.sky1));
    sky.addColorStop(0.8, rgba(C.sky2));
    sky.addColorStop(1, rgba(C.sky3));
    c.fillStyle = sky;
    c.fillRect(0, 0, W, hz + 1);

    const dusk = 1 - S.night;
    if (dusk > 0.01) {
      const dg = c.createLinearGradient(0, hz * 0.35, 0, hz);
      dg.addColorStop(0, rgba(C.sky2, 0));
      dg.addColorStop(1, rgba(C.sky3, 0.28 * dusk));
      c.fillStyle = dg;
      c.fillRect(0, hz * 0.35, W, hz * 0.65 + 1);
    }
    const hzGlow = c.createRadialGradient(W / 2, hz, 0, W / 2, hz, Math.max(W, H) * 0.6);
    hzGlow.addColorStop(0, rgba(C.sky3, 0.3 + dusk * 0.12 + S.cel * 0.25));
    hzGlow.addColorStop(1, rgba(C.sky3, 0));
    c.fillStyle = hzGlow;
    c.fillRect(0, 0, W, hz);

    // stars
    c.fillStyle = rgba(C.win);
    for (const s of stars) {
      c.globalAlpha = (reduced ? 0.5 : 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(S.t * s.sp + s.ph))) * (0.35 + 0.65 * S.night);
      c.fillRect(s.x, s.y, s.r, s.r);
    }
    c.globalAlpha = 1;

    drawSearchlights(c, S.cel * (M.state === 'struck' ? smooth((M.t - 0.5) / 1.5) : 1));

    // ball placement
    const R = S.R * S.cam.s * (1 - S.press * 0.035 + S.hold * 0.02);
    const drop = easeOut(clamp(S.intro / 0.85, 0, 1));
    const par = S.mouse.has ? (S.mouse.x - 0.5) * 14 : 0;
    const tension = reduced ? 0 : Math.max(0, S.hold - 0.7) / 0.3;
    const jx = tension ? Math.sin(S.t * 46) * tension * 1.6 : 0;
    const jy = tension ? Math.cos(S.t * 39) * tension * 1.2 : 0;
    const bx = S.cam.x * W + par + jx;
    const by = lerp(-R * 1.6, S.cam.y * H, drop) + jy + easeInOut(S.hold) * H * 0.035;
    S.ball.x = bx; S.ball.y = by; S.ball.R = R;
    // over the text sections the ball floats above the dimmed city instead of behind it
    const ballFront = S.cam.dim > 0.35;
    S.ball.front = ballFront;
    // ease the ball in late, so it arrives after the section's copy has settled
    const ballA = S.ballAlpha * smooth((S.cam.a - 0.5) / 0.45);
    if (!ballFront) drawBall(c, bx, by, R, ballA);

    // skyline into its own layer so the water can reflect it
    if (S.cacheDirty) renderCityCache();
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, W, hz);
    sctx.drawImage(cityCache, 0, 0, cityCache.width, cityCache.height, 0, cityBase - city.cacheH, W, city.cacheH);
    for (const layer of city.layers) drawWindows(sctx, layer, cityBase);
    drawSpire(sctx, cityBase);
    c.drawImage(skyCanvas, 0, 0, skyCanvas.width, skyCanvas.height, 0, 0, W, hz);

    drawReflections(c, bx, by, (0.1 + Math.min(0.55, Math.abs(S.rotV) * 0.16)) * S.ballAlpha * (1 - S.cam.dim) * drop);

    // water
    const waterH = H - hz;
    const wg = c.createLinearGradient(0, hz, 0, H);
    wg.addColorStop(0, rgba(C.water0));
    wg.addColorStop(0.45, rgba(C.water1));
    wg.addColorStop(1, rgba(C.water2));
    c.fillStyle = wg;
    c.fillRect(0, hz, W, waterH + 1);

    // reflection, in rippling strips
    c.setTransform(1, 0, 0, 1, ox * dpr, oy * dpr);
    const hzD = Math.round(hz * dpr);
    const wD = canvas.height - hzD;
    const step = Math.max(2, Math.round(2 * dpr));
    for (let y = 0; y < wD; y += step) {
      const d = y / wD;
      const srcY = hzD - 1 - Math.floor(y * 1.25);
      if (srcY < 0) break;
      const yy = y / dpr;
      const off = reduced ? 0
        : (Math.sin(yy * 0.05 + S.t * 1.4) * (1 + d * 9) + Math.sin(yy * 0.17 - S.t * 2.1) * d * 5) * dpr;
      c.globalAlpha = 0.55 * (1 - d) * (1 - d);
      c.drawImage(skyCanvas, 0, srcY, skyCanvas.width, step, off, hzD + y, skyCanvas.width, step);
    }
    c.globalAlpha = 1;
    c.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);

    // the ball's light on the water
    if (S.ballAlpha > 0 || S.cel > 0) {
      c.save();
      c.translate(bx, hz);
      c.scale(1, 5);
      const streak = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.9);
      streak.addColorStop(0, rgba(C.glow, 0.28 * Math.max(S.ballAlpha, S.cel)));
      streak.addColorStop(1, rgba(C.glow, 0));
      c.fillStyle = streak;
      c.fillRect(-R, 0, R * 2, R);
      c.restore();
    }

    // glints across the water
    c.fillStyle = rgba(C.win);
    for (const g of glints) {
      const y = hz + 3 + g.d * (waterH - 6);
      const a = reduced ? 0.25 : Math.max(0, Math.sin(S.t * g.sp + g.ph)) * 0.55;
      if (a < 0.03) continue;
      c.globalAlpha = a * (1 - g.d * 0.6);
      const x = (g.x + S.t * 6 * (1 - g.d)) % (W + 40) - 20;
      c.fillRect(x, y, g.len * (0.4 + g.d), 1);
    }
    c.globalAlpha = 1;

    // a ferry crossing, a sailboat at anchor
    const fy = hz + waterH * 0.2;
    const fx = ((S.t * 9) % (W + 240)) - 120;
    c.fillStyle = rgba(C.front);
    c.fillRect(fx, fy - 5, 74, 5);
    c.fillRect(fx + 12, fy - 9, 44, 4);
    c.fillStyle = rgba(C.win, 0.9);
    for (let i = 0; i < 7; i++) c.fillRect(fx + 15 + i * 6, fy - 8, 2, 1.6);
    const sbx = W * 0.79, sby = hz + waterH * 0.1 + (reduced ? 0 : Math.sin(S.t * 1.3) * 1.2);
    c.fillStyle = rgba(C.win, 0.8);
    c.beginPath();
    c.moveTo(sbx, sby - 26); c.lineTo(sbx, sby - 3); c.lineTo(sbx + 14, sby - 3); c.closePath();
    c.fill();
    c.fillStyle = rgba(C.front);
    c.fillRect(sbx - 8, sby - 3, 26, 3);

    // a thin bright seam where the city meets the water
    c.fillStyle = rgba(C.sky3, 0.55);
    c.fillRect(0, hz - 0.5, W, 1);

    // dim the world under text-heavy sections, darker toward the edges
    if (S.cam.dim > 0.002) {
      const dg = c.createRadialGradient(W / 2, 0, 0, W / 2, 0, Math.max(W, H) * 1.1);
      dg.addColorStop(0, rgba(C.deep, S.cam.dim * 0.82));
      dg.addColorStop(0.7, rgba(C.deep, S.cam.dim));
      c.fillStyle = dg;
      c.fillRect(0, 0, W, H);
    }
    if (ballFront) drawBall(c, bx, by, R, ballA);

    drawParticles(c, bx, by, R, dt);
    drawTrail(c);
  }

  let last = performance.now();
  function frame(now) {
    // mobile URL bars change height constantly; only rebuild when it matters
    if (innerWidth !== S.W || Math.abs(innerHeight - S.H) > 120 || !S.H) resize();
    if (!S.W || !S.H) { requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render(dt);
    scrubWords();
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */

  if (finePointer) {
    addEventListener('pointermove', e => {
      S.mouse.x = e.clientX / S.W;
      S.mouse.y = e.clientY / S.H;
      S.mouse.has = true;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { S.mouse.has = false; });
  }

  // grab the sky in the hero (or the "make it yours" scene) and spin the ball
  $$('.hero, .yours').forEach(zone => {
    zone.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('a, button, input, label, .yours__panel')) return;
      S.drag = { x: e.clientX, sx: e.clientX, sy: e.clientY, t: performance.now(), v: 0, moved: false };
      zone.setPointerCapture?.(e.pointerId);
    });
    zone.addEventListener('pointermove', e => {
      if (!S.drag) return;
      const now = performance.now();
      const dx = e.clientX - S.drag.x;
      if (!S.drag.moved && Math.abs(e.clientX - S.drag.sx) > 5) {
        S.drag.moved = true;
        S.fling = 0;
        body.classList.add('is-dragging');
        emit('dragstart');
      }
      if (!S.drag.moved) return;
      const d = dx / Math.max(60, S.ball.R * 1.1);
      S.rot += d;
      const dtm = Math.max(8, now - S.drag.t) / 1000;
      S.drag.v = lerp(S.drag.v, d / dtm, 0.5);
      S.drag.x = e.clientX;
      S.drag.t = now;
    });
    const end = e => {
      if (!S.drag) return;
      if (!S.drag.moved) {
        // a tap on the ball makes it flare
        if (e && e.type === 'pointerup' && window.Rumor.ballHit(S.drag.sx, S.drag.sy)) {
          S.pulse = 1;
          if (!reduced) S.fling += 2.5;
          emit('balltap');
        }
        S.drag = null;
        return;
      }
      S.fling = clamp(S.drag.v, -14, 14);
      if (performance.now() - S.drag.t > 120) S.fling *= 0.2;
      S.drag = null;
      body.classList.remove('is-dragging');
      emit('dragend', S.fling);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  });

  const startHold = () => { if (M.state === 'idle' && !S.holding) { S.holding = true; emit('holdstart'); } };
  const endHold = () => { if (S.holding) { S.holding = false; emit('holdend'); } };
  strikeBtn.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    strikeBtn.setPointerCapture?.(e.pointerId);
    startHold();
  });
  strikeBtn.addEventListener('pointerup', endHold);
  strikeBtn.addEventListener('pointercancel', endHold);
  strikeBtn.addEventListener('lostpointercapture', endHold);
  strikeBtn.addEventListener('contextmenu', e => e.preventDefault());
  strikeBtn.addEventListener('keydown', e => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); }
    else if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
  });
  strikeBtn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') endHold(); });
  strikeBtn.addEventListener('blur', endHold);
  strikeBtn.addEventListener('click', e => e.preventDefault());

  $('#skipMidnight').addEventListener('click', strike);
  $('#replay').addEventListener('click', () => resetMidnight());
  $('#midnight').addEventListener('pointerdown', e => {
    if (e.target.closest('a, button')) return;
    shock(e.clientX, e.clientY);
  });

  /* ------------------------------------------------------------------ */
  /* Page behaviour                                                      */
  /* ------------------------------------------------------------------ */

  // header swaps "Vol. 01" for the invitation button once you leave the hero
  const onScroll = () => body.classList.toggle('is-scrolled', scrollY > S.H * 0.55);
  addEventListener('scroll', onScroll, { passive: true });

  // the opening line lights up word by word as you read it
  const lede = $('[data-scrub]');
  const words = lede.textContent.trim().split(/\s+/);
  lede.setAttribute('aria-label', lede.textContent.trim());
  lede.innerHTML = words.map(w => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
  const wordEls = $$('.w', lede);
  let lastScrub = -1;
  function scrubWords() {
    const r = lede.getBoundingClientRect();
    if (r.bottom < -50 || r.top > S.H + 50) return;
    const p = reduced ? 1 : clamp((S.H * 0.82 - r.top) / (r.height + S.H * 0.25), 0, 1);
    if (Math.abs(p - lastScrub) < 0.002) return;
    lastScrub = p;
    const n = wordEls.length;
    wordEls.forEach((el, i) => {
      const k = clamp(p * (n + 1) - i, 0, 1);
      el.style.opacity = (0.14 + 0.86 * k).toFixed(3);
      el.style.transform = reduced ? '' : `translateY(${((1 - k) * 0.12).toFixed(3)}em)`;
    });
  }

  // hairline rows draw in as they arrive
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.3, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 6) * 60}ms`; io.observe(el); });

  // the address stays a rumor
  const SCRAMBLE = 'RUMOR░▒▓█/\\-_';
  $$('.redact').forEach(el => {
    const hidden = el.textContent;
    const secret = el.dataset.secret;
    el.setAttribute('aria-label', `Address hidden. ${secret}`);
    let raf = 0;
    const scramble = (to, open) => {
      cancelAnimationFrame(raf);
      el.classList.toggle('is-open', open);
      if (open) emit('reveal');
      if (reduced) { el.textContent = to; return; }
      const len = Math.max(el.textContent.length, to.length);
      const t0 = performance.now();
      const tick = now => {
        const p = clamp((now - t0) / 520, 0, 1);
        let out = '';
        for (let i = 0; i < len; i++) {
          const settle = i / len < p;
          out += settle ? (to[i] || '') : (to[i] === ' ' ? ' ' : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]);
        }
        el.textContent = out;
        if (p < 1) raf = requestAnimationFrame(tick); else el.textContent = to;
      };
      raf = requestAnimationFrame(tick);
    };
    el.addEventListener('mouseenter', () => scramble(secret, true));
    el.addEventListener('mouseleave', () => scramble(hidden, false));
    el.addEventListener('focus', () => scramble(secret, true));
    el.addEventListener('blur', () => scramble(hidden, false));
    el.addEventListener('click', () => (el.classList.contains('is-open') ? scramble(hidden, false) : scramble(secret, true)));
  });

  // what time it is in New York right now
  const nyEl = $('#nyTime') || { set textContent(v) {} };
  const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  const tickNY = () => { nyEl.textContent = `It’s ${nyFmt.format(new Date())} in New York. You don’t have to wait.`; };
  tickNY();
  setInterval(tickNY, 20000);

  // guest list request (front end only in this demo)
  const form = $('#listForm');
  const fields = {
    name: { el: $('#fName'), err: $('#fNameErr'), check: v => (v.trim().length > 1 ? '' : 'Enter your full name.') },
    email: { el: $('#fEmail'), err: $('#fEmailErr'), check: v => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Enter an email address like name@example.com.') }
  };
  const shakeEl = el => {
    if (reduced) return;
    el.classList.remove('is-shaking');
    void el.offsetWidth;
    el.classList.add('is-shaking');
  };
  const validate = (f, loud) => {
    const msg = f.check(f.el.value);
    f.err.textContent = msg;
    f.el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) f.el.setAttribute('aria-describedby', f.err.id); else f.el.removeAttribute('aria-describedby');
    if (msg && loud) { shakeEl(f.el.parentElement); emit('invalid'); }
    return !msg;
  };
  Object.values(fields).forEach(f => {
    f.el.addEventListener('blur', () => { if (f.el.value) validate(f); });
    f.el.addEventListener('input', () => {
      f.el.parentElement.classList.toggle('is-valid', !f.check(f.el.value));
      if (f.el.getAttribute('aria-invalid') === 'true' && !f.check(f.el.value)) validate(f);
    });
  });
  form.addEventListener('animationend', e => e.target.classList.remove('is-shaking'));
  const submitBtn = $('.list__submit');
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (form.classList.contains('is-sending')) return;
    const okName = validate(fields.name, true);
    const okEmail = validate(fields.email, true);
    if (!okName) return fields.name.el.focus();
    if (!okEmail) return fields.email.el.focus();
    const name = fields.name.el.value.trim();
    const first = name.split(/\s+/)[0];
    $('#doneName').textContent = first ? `, ${first}` : '';
    $('#ticketName').textContent = name;
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 31) | 0]).join('');
    $('#ticketCode').textContent = `NYE-${code}`;
    form.classList.add('is-sending');
    submitBtn.setAttribute('aria-busy', 'true');
    emit('sending');
    // a short, honest pause so the hand-off reads as something happening
    setTimeout(() => {
      form.classList.add('is-leaving');
      setTimeout(() => {
        form.hidden = true;
        const done = $('#listDone');
        done.hidden = false;
        done.focus({ preventScroll: true });
        emit('requested', { name });
      }, reduced ? 0 : 520);
    }, reduced ? 0 : 1100);
  });

  /* ------------------------------------------------------------------ */
  /* Make it yours                                                       */
  /* ------------------------------------------------------------------ */

  const DEFAULT_TITLE = 'New Year’s Eve';
  const hostEls = [$('#hostLabel'), ...$$('.js-host')];
  const nameIn = $('#cName');
  const hostIn = $('#cHost');

  nameIn.addEventListener('input', () => {
    const v = nameIn.value.trim() || DEFAULT_TITLE;
    emit('title', v);
    document.title = `${hostIn.value.trim() || 'Rumor'} Presents: ${v}`;
  });
  hostIn.addEventListener('input', () => {
    const v = hostIn.value.trim();
    hostEls.forEach(el => { el.textContent = v || 'Rumor'; });
    body.classList.toggle('has-host', !!v && v.toLowerCase() !== 'rumor');
    const ch = (v.match(/[\p{L}\p{N}]/u) || [''])[0].toUpperCase();
    const key = !v || v.toLowerCase() === 'rumor' ? 'R*' : ch || 'R*';
    if (key !== letterKey) { letterKey = key; showLogo(); if (!reduced) S.fling += 7; emit('letter', key); }
    document.title = `${v || 'Rumor'} Presents: ${nameIn.value.trim() || DEFAULT_TITLE}`;
  });

  function setTheme(name) {
    const t = THEMES[name] || THEMES.ultramarine;
    colorTarget = pack(t);
    if (reduced) colorNow.set(colorTarget);
    root.style.setProperty('--deep', t.css.deep);
    root.style.setProperty('--dim-rgb', t.css.dim);
    root.style.setProperty('--accent', t.css.accent);
    $('meta[name="theme-color"]').setAttribute('content', t.css.deep);
    S.cacheDirty = true;
    emit('theme', name);
  }
  $$('input[name="theme"]').forEach(r => r.addEventListener('change', () => setTheme(r.value)));

  $('#cReset').addEventListener('click', () => {
    nameIn.value = '';
    hostIn.value = '';
    nameIn.dispatchEvent(new Event('input'));
    hostIn.dispatchEvent(new Event('input'));
    $('input[name="theme"][value="ultramarine"]').checked = true;
    setTheme('ultramarine');
  });

  /* ------------------------------------------------------------------ */
  /* Public surface for the experience layer                             */
  /* ------------------------------------------------------------------ */

  window.Rumor = {
    ballHit(x, y) {
      const b = S.ball;
      return S.entered && S.ballAlpha > 0.5 && !b.front && Math.hypot(x - b.x, y - b.y) < b.R * 1.08;
    },
    setGlyph() {},
    metrics() {
      return { hold: S.hold, holding: S.holding, state: M.state, spin: Math.abs(S.rotV), dim: S.cam.dim, dragging: !!S.drag };
    },
    strike,
    reset: () => resetMidnight(),
    nudge(v) { if (!reduced) S.fling += v; }
  };

  /* ------------------------------------------------------------------ */
  /* Go                                                                  */
  /* ------------------------------------------------------------------ */

  function enter() {
    if (S.entered) return;
    S.entered = true;
    S.start = performance.now();
    body.classList.add('is-loaded');
  }
  window.addEventListener('rumor:enter', enter);
  if (!$('#loader')) requestAnimationFrame(enter);

  resize();
  onScroll();
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (letterKey !== 'R*') showLogo(); if (hostIn.value.trim()) hostIn.dispatchEvent(new Event('input')); });
  }
})();
