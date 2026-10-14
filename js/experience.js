/* The experience layer: the entrance, smooth scrolling, the cursor, the night's
 * clock, the marquee, sound wiring and the invitation card. The scene itself
 * lives in main.js and is reached through window.Rumor.
 */
'use strict';

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;
  const body = document.body;
  const audio = window.RumorAudio;
  const rumor = () => window.Rumor;

  /* ------------------------------------------------------------------ */
  /* Smooth scrolling                                                    */
  /* ------------------------------------------------------------------ */

  let lenis = null;
  if (window.Lenis && !reduced) {
    lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.3 });
    root.classList.add('has-lenis');
  }
  const scrollToEl = (el, instant) => {
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { duration: instant ? 0 : 1.9, immediate: !!instant, easing: t => 1 - Math.pow(1 - t, 4) });
    else el.scrollIntoView({ behavior: reduced || instant ? 'auto' : 'smooth' });
  };

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const el = id.length > 1 && document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    scrollToEl(el);
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  });

  /* ------------------------------------------------------------------ */
  /* Entrance                                                            */
  /* ------------------------------------------------------------------ */

  const loader = $('#loader');
  const num = $('#loaderNum');
  const bar = $('#loaderBar');
  const enterSound = $('#enterSound');
  const enterQuiet = $('#enterQuiet');
  let entered = false;

  function lockScroll(on) {
    root.classList.toggle('is-locked', on);
    if (lenis) (on ? lenis.stop() : lenis.start());
  }

  function enter(withSound) {
    if (entered) return;
    entered = true;
    if (withSound && audio) audio.enable();
    loader.classList.add('is-leaving');
    body.classList.add('is-revealing');
    setTimeout(() => body.classList.remove('is-revealing'), 2600);
    lockScroll(false);
    setTimeout(() => window.dispatchEvent(new CustomEvent('rumor:enter')), reduced ? 0 : 380);
    setTimeout(() => { loader.hidden = true; }, reduced ? 400 : 1500);
    const target = location.hash && document.querySelector(location.hash);
    if (target) setTimeout(() => scrollToEl(target, true), 50);
  }

  if (loader) {
    lockScroll(true);
    const t0 = performance.now();
    let ready = false, progress = 0, shown = false;
    const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise(r => addEventListener('load', r, { once: true }));
    Promise.race([
      Promise.all([loaded, document.fonts ? document.fonts.ready : null]),
      new Promise(r => setTimeout(r, 5000))
    ]).then(() => { ready = true; });

    if (audio && !audio.preferred) {
      // put the quiet option first for people who turned sound off last time
      try { if (localStorage.getItem('rumor-sound') === 'off') enterQuiet.after(enterSound); } catch {}
    }

    const step = () => {
      const elapsed = performance.now() - t0;
      const target = ready ? 1 : Math.min(0.88, elapsed / 2200);
      progress += (target - progress) * (reduced ? 1 : 0.07);
      const pct = Math.round(progress * 100);
      num.textContent = String(pct).padStart(3, '0');
      bar.style.transform = `scaleX(${progress.toFixed(4)})`;
      if (!shown && ready && progress > 0.995 && (elapsed > 1500 || reduced)) {
        shown = true;
        num.textContent = '100';
        loader.classList.add('is-ready');
        setTimeout(() => $('.loader__enter button', loader).focus({ preventScroll: true }), 250);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    enterSound.addEventListener('click', () => enter(true));
    enterQuiet.addEventListener('click', () => enter(false));
  }

  /* ------------------------------------------------------------------ */
  /* Hero title, set letter by letter                                    */
  /* ------------------------------------------------------------------ */

  const titleEl = $('#eventTitle');
  const previewEl = $('#previewTitle');
  let prevPreview = previewEl.textContent;
  function setTitle(text) {
    let i = 0;
    const words = text.split(/\s+/).map(w =>
      `<span class="word">${Array.from(w).map(ch => `<span class="ch" style="--i:${i++}">${esc(ch)}</span>`).join('')}</span>`
    );
    titleEl.innerHTML = `<span class="sr-only">${esc(text)}</span><span aria-hidden="true">${words.join(' ')}</span>`;

    // in the preview, only the letters that changed rise into place
    const chars = Array.from(text), before = Array.from(prevPreview);
    let same = 0;
    while (same < chars.length && chars[same] === before[same]) same++;
    previewEl.setAttribute('aria-label', text);
    previewEl.innerHTML = chars.map((ch, k) =>
      `<span class="pc${k >= same && !reduced ? ' pop' : ''}" style="--k:${Math.max(0, k - same)}" aria-hidden="true">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`
    ).join('');
    prevPreview = text;
  }
  setTitle(titleEl.textContent.trim());
  window.addEventListener('rumor:title', e => setTitle(e.detail));

  // headings rise out of a mask the first time they arrive
  const maskIO = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); maskIO.unobserve(en.target); } });
  }, { threshold: 0.4 });
  $$('.section-title, .midnight__copy h2, .list__intro h2, .yours__panel h2').forEach(h => {
    h.innerHTML = `<span class="mask"><span class="mask__in">${h.innerHTML}</span></span>`;
    h.classList.add('masked');
    maskIO.observe(h);
  });

  /* ------------------------------------------------------------------ */
  /* The night's clock: scrolling moves the evening toward midnight       */
  /* ------------------------------------------------------------------ */

  const clockTime = $('#clockTime');
  const clockEl = $('#clock');
  const midSection = $('#midnight');
  let lastClock = '', lastClockAt = 0, lastRollAt = 0;
  function fmt(mins) {
    const total = (21 * 60 + Math.floor(mins)) % (24 * 60);
    const h24 = Math.floor(total / 60), m = total % 60;
    const h = h24 % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
  }
  function updateClock() {
    const top = midSection.getBoundingClientRect().top + scrollY;
    const st = rumor() ? rumor().metrics().state : 'idle';
    let mins;
    const past = scrollY > top + innerHeight * 0.6;
    if (st === 'struck' || past) mins = 180 + Math.max(0, (scrollY - top) / innerHeight) * 18;
    else mins = clamp(scrollY / Math.max(1, top), 0, 1) * 179;
    const s = fmt(mins);
    const now = performance.now();
    if (s !== lastClock && now - lastClockAt > 90) {
      const old = lastClock;
      const calm = now - lastClockAt > 400;
      lastClock = s;
      lastClockAt = now;
      clockTime.innerHTML = Array.from(s).map((ch, i) =>
        `<span class="${old && calm && ch !== old[i] && !reduced ? 'roll' : ''}">${ch === ' ' ? '&nbsp;' : ch}</span>`
      ).join('');
      clockEl.classList.toggle('is-late', mins >= 170 && mins < 180);
      clockEl.classList.toggle('is-new', mins >= 180);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Marquee that leans into your scroll                                 */
  /* ------------------------------------------------------------------ */

  const marquee = $('.marquee');
  const track = $('.marquee__track');
  let mx = 0, half = 0, mDir = 1, mVisible = false, mSkew = 0;
  if (track) {
    track.innerHTML += track.innerHTML;
    const measure = () => { half = track.scrollWidth / 2; };
    measure();
    addEventListener('resize', measure);
    if (document.fonts) document.fonts.ready.then(measure);
    new IntersectionObserver(([en]) => { mVisible = en.isIntersecting; }).observe(marquee);
  }

  /* ------------------------------------------------------------------ */
  /* Cursor                                                              */
  /* ------------------------------------------------------------------ */

  const cursor = $('.cursor');
  const cLabel = $('.cursor__label');
  const cProg = $('.cursor__prog');
  let px = -100, py = -100, rx = -100, ry = -100, overEl = null, cursorOn = false;
  if (finePointer && cursor) {
    root.classList.add('has-cursor');
    addEventListener('pointermove', e => {
      px = e.clientX; py = e.clientY; overEl = e.target;
      if (!cursorOn) { cursorOn = true; rx = px; ry = py; cursor.classList.remove('is-hidden'); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => { cursorOn = false; cursor.classList.add('is-hidden'); });
    addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    addEventListener('pointerup', () => cursor.classList.remove('is-down'));
  } else if (cursor) {
    cursor.remove();
  }

  function cursorState() {
    const R = rumor();
    const m = R ? R.metrics() : null;
    const el = overEl;
    let label = '', mode = '';
    if (!el) return { label, mode };
    if (el.closest('input, textarea, select')) mode = 'text';
    else if (m && m.dragging) { label = 'Spin'; mode = 'label'; }
    else if (el.closest('#strike')) { label = m && m.holding ? '' : 'Hold'; mode = 'hold'; }
    else if (el.closest('.redact')) { label = 'Reveal'; mode = 'label'; }
    else if (el.closest('a, button, label, .swatch')) mode = 'link';
    else if (R && R.ballHit(px, py)) { label = 'Drag'; mode = 'label'; }
    else if (el.closest('.ticket')) mode = 'link';
    else if (el.closest('#midnight') && m && m.state === 'struck') { label = 'Tap'; mode = 'label'; }
    return { label, mode };
  }
  let lastMode = '', lastLabel = '';

  /* ------------------------------------------------------------------ */
  /* Buttons: label roll                                                 */
  /* ------------------------------------------------------------------ */

  $$('.btn').forEach(btn => {
    const target = btn.querySelector('.btn__label') || (btn.classList.contains('cal') ? null : btn);
    if (!target || target.querySelector('.roll')) return;
    const text = target.textContent.trim();
    target.innerHTML = `<span class="roll"><span class="roll__a">${esc(text)}</span><span class="roll__b" aria-hidden="true">${esc(text)}</span></span>`;
  });

  /* ------------------------------------------------------------------ */
  /* Magnetic buttons                                                    */
  /* ------------------------------------------------------------------ */

  if (finePointer && !reduced) {
    $$('.btn, .sound').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.translate = `${(dx * 0.14).toFixed(1)}px ${(dy * 0.22).toFixed(1)}px`;
      });
      el.addEventListener('pointerleave', () => { el.style.translate = '0px 0px'; });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Sound                                                               */
  /* ------------------------------------------------------------------ */

  const soundBtn = $('#soundToggle');
  const syncSound = on => {
    soundBtn.classList.toggle('is-on', on);
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
  };
  syncSound(false);
  soundBtn.addEventListener('click', () => { if (audio) audio.toggle(); });
  window.addEventListener('rumor:sound', e => syncSound(e.detail));

  if (audio) {
    window.addEventListener('rumor:tick', e => audio.tick(e.detail));
    window.addEventListener('rumor:strike', () => audio.strike());
    window.addEventListener('rumor:reset', () => audio.reset());
    window.addEventListener('rumor:shock', () => audio.shock());
    window.addEventListener('rumor:theme', () => audio.chime());
    window.addEventListener('rumor:letter', () => audio.blip(1800, 0.02));
    window.addEventListener('rumor:reveal', () => audio.blip(3200, 0.01));
    window.addEventListener('rumor:requested', () => audio.chime());
    window.addEventListener('rumor:balltap', () => audio.flare());
    window.addEventListener('rumor:invalid', () => audio.blip(320, 0.035));
    window.addEventListener('rumor:sending', () => [0, 160, 320].forEach(t => setTimeout(() => audio.blip(1900 + t * 2, 0.012), t)));
    window.addEventListener('rumor:wipe', () => audio.blip(1200, 0.018));
    let lastBlip = 0;
    document.addEventListener('pointerover', e => {
      if (!finePointer) return;
      const t = e.target.closest('.btn, .link, .swatch, .sound, .rail a');
      if (!t || t.contains(e.relatedTarget)) return;
      const n = performance.now();
      if (n - lastBlip > 70) { lastBlip = n; audio.blip(2700, 0.007); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* What the night holds: the line you're on comes forward              */
  /* ------------------------------------------------------------------ */

  const items = $$('.expect__list li');
  let hovered = null, scrolled = null;
  const applyGlyph = () => {
    const li = hovered || scrolled;
    items.forEach(el => el.classList.toggle('is-active', el === li));
  };
  items.forEach(li => {
    li.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hovered = li; applyGlyph(); } });
    li.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hovered = null; applyGlyph(); } });
  });
  const itemIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) scrolled = en.target;
      else if (scrolled === en.target) scrolled = null;
    });
    applyGlyph();
  }, { rootMargin: '-46% 0px -46% 0px' });
  if (!finePointer) items.forEach(li => itemIO.observe(li));

  /* ------------------------------------------------------------------ */
  /* The invitation card                                                 */
  /* ------------------------------------------------------------------ */

  const ticket = $('.ticket');
  window.addEventListener('rumor:requested', () => {
    const host = ($('#hostLabel').textContent || 'Rumor').trim();
    const custom = host.toLowerCase() !== 'rumor';
    const initial = (host.match(/[\p{L}\p{N}]/u) || ['R'])[0].toUpperCase();
    $('#ticketBall').innerHTML = custom
      ? `<text x="50" y="50" text-anchor="middle" dominant-baseline="central">${esc(initial)}</text>`
      : $('#rMarkTpl').innerHTML;
    $('#ticketHost').textContent = host;
    $('#ticketTitle').textContent = previewEl.textContent;
    requestAnimationFrame(() => ticket.classList.add('is-in'));
  });
  // a shareable image of the invitation, drawn fresh at 1200 x 630
  const hexA = (hex, a) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  $('#saveTicket').addEventListener('click', async () => {
    const W = 1200, H = 630;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    try {
      await Promise.all(['400 96px Romie', '400 30px "ABC Diatype"', '500 18px "ABC Diatype Semi-Mono"'].map(f => document.fonts.load(f)));
    } catch {}
    const cs = getComputedStyle(root);
    const deep = cs.getPropertyValue('--deep').trim() || '#05063a';
    const accent = cs.getPropertyValue('--accent').trim() || '#a9adff';
    const ink = '#eef0ff';
    const mono = (sz) => `500 ${sz}px "ABC Diatype Semi-Mono", "ABC Diatype", Arial, sans-serif`;

    x.fillStyle = deep;
    x.fillRect(0, 0, W, H);
    let g = x.createRadialGradient(0, 0, 0, 0, 0, W * 0.85);
    g.addColorStop(0, hexA(accent, 0.38)); g.addColorStop(1, hexA(accent, 0));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(W, H, 0, W, H, W * 0.75);
    g.addColorStop(0, 'rgba(43, 40, 230, 0.55)'); g.addColorStop(1, 'rgba(43, 40, 230, 0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    x.lineWidth = 2;
    x.beginPath(); x.roundRect(28, 28, W - 56, H - 56, 36); x.stroke();

    // header
    const host = ($('#hostLabel').textContent || 'Rumor').trim();
    const custom = host.toLowerCase() !== 'rumor';
    x.fillStyle = ink;
    x.textBaseline = 'alphabetic';
    let px = 84;
    if (!custom) {
      const k = 28 / 24;
      x.save(); x.translate(84, 78); x.scale(k, k);
      $$('path', $('#wordmarkTpl').content).forEach(p => x.fill(new Path2D(p.getAttribute('d'))));
      x.restore();
      px = 84 + 126 * k + 18;
      x.font = mono(17); x.fillStyle = hexA(ink, 0.7); x.fillText('PRESENTS', px, 104);
    } else {
      x.font = mono(17); x.fillStyle = hexA(ink, 0.7); x.fillText(`${host.toUpperCase()} PRESENTS`, 84, 104);
    }
    x.textAlign = 'right'; x.fillText('VOL. 01', W - 84, 104); x.textAlign = 'left';

    // the ball
    const bx = 228, by = 318, br = 116;
    g = x.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
    g.addColorStop(0, '#2b28c8'); g.addColorStop(1, '#0a0b48');
    x.save();
    x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fillStyle = g; x.fill(); x.clip();
    x.fillStyle = 'rgba(238, 240, 255, 0.2)';
    for (let yy = by - br; yy < by + br; yy += 9) for (let xx = bx - br + ((yy / 9) % 2) * 4.5; xx < bx + br; xx += 9) {
      x.beginPath(); x.arc(xx, yy, 1.9, 0, Math.PI * 2); x.fill();
    }
    x.restore();
    x.save();
    x.shadowColor = 'rgba(255, 255, 255, 0.8)'; x.shadowBlur = 24; x.fillStyle = '#fff';
    if (!custom) {
      const k = (br * 1.0) / 39.36;
      x.translate(bx - (34.7 * k) / 2 + 0.155 * k, by - (39.36 * k) / 2); x.scale(k, k);
      x.fill(new Path2D($('#rMarkTpl').content.querySelector('path').getAttribute('d')));
    } else {
      x.font = `500 ${br * 1.05}px "ABC Diatype", Arial, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText((host.match(/[\p{L}\p{N}]/u) || ['R'])[0].toUpperCase(), bx, by + 4);
    }
    x.restore();
    x.strokeStyle = 'rgba(169, 173, 255, 0.45)'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.stroke();

    // title and guest
    x.fillStyle = ink;
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    const title = previewEl.getAttribute('aria-label') || previewEl.textContent;
    let fs = 92;
    x.font = `400 ${fs}px Romie, Georgia, serif`;
    while (x.measureText(title).width > W - 420 - 84 && fs > 40) { fs -= 4; x.font = `400 ${fs}px Romie, Georgia, serif`; }
    x.fillText(title, 400, 318);
    x.font = '400 30px "ABC Diatype", Arial, sans-serif';
    x.fillStyle = hexA(ink, 0.72);
    x.fillText(`Admit ${$('#ticketName').textContent}`, 402, 372);

    // perforation and details
    x.strokeStyle = 'rgba(255, 255, 255, 0.3)'; x.setLineDash([10, 10]); x.lineWidth = 2;
    x.beginPath(); x.moveTo(28, 462); x.lineTo(W - 28, 462); x.stroke(); x.setLineDash([]);
    const cols = [['DATE', '12.31.26'], ['DOORS', '9 PM'], ['WHERE', 'NEW YORK'], ['STATUS', 'PENDING'], ['REF', $('#ticketCode').textContent]];
    cols.forEach(([k, v], i) => {
      const cx = 84 + i * ((W - 168) / cols.length);
      x.font = mono(15); x.fillStyle = hexA(ink, 0.46); x.fillText(k, cx, 520);
      x.font = mono(24); x.fillStyle = ink; x.fillText(v, cx, 556);
    });

    cv.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rumor-invitation.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (audio) audio.chime();
    }, 'image/png');
  });

  if (ticket && !reduced) {
    let tx = 0, ty = 0, cx = 0, cy = 0, active = false;
    ticket.addEventListener('pointermove', e => {
      const r = ticket.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      active = true;
    });
    ticket.addEventListener('pointerleave', () => { tx = 0; ty = 0; active = false; });
    const tilt = () => {
      if (!ticket.offsetParent) { requestAnimationFrame(tilt); return; }
      const idle = active ? 0 : performance.now() / 1000;
      cx = lerp(cx, tx + (active ? 0 : Math.sin(idle * 0.8) * 0.08), 0.12);
      cy = lerp(cy, ty + (active ? 0 : Math.cos(idle * 0.6) * 0.06), 0.12);
      ticket.style.setProperty('--ry', `${(cx * 22).toFixed(2)}deg`);
      ticket.style.setProperty('--rx', `${(-cy * 16).toFixed(2)}deg`);
      ticket.style.setProperty('--sx', `${((cx + 0.5) * 100).toFixed(1)}%`);
      ticket.style.setProperty('--sy', `${((cy + 0.5) * 100).toFixed(1)}%`);
      requestAnimationFrame(tilt);
    };
    requestAnimationFrame(tilt);
  }

  /* ------------------------------------------------------------------ */
  /* Film grain                                                          */
  /* ------------------------------------------------------------------ */

  (() => {
    const g = document.createElement('canvas');
    g.width = g.height = 160;
    const gc = g.getContext('2d');
    const img = gc.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 26;
    }
    gc.putImageData(img, 0, 0);
    root.style.setProperty('--grain', `url(${g.toDataURL()})`);
  })();

  /* ------------------------------------------------------------------ */
  /* Chapter rail                                                        */
  /* ------------------------------------------------------------------ */

  const railLinks = $$('.rail a');
  const railTargets = railLinks.map(a => document.getElementById(a.dataset.target));
  const railFill = $('.rail__fill');
  let railActive = -1;
  function updateRail() {
    const mid = innerHeight * 0.5;
    let active = 0;
    railTargets.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= mid) active = i; });
    if (active !== railActive) {
      railActive = active;
      railLinks.forEach((a, i) => {
        a.parentElement.classList.toggle('is-active', i === active);
        a.parentElement.classList.toggle('is-past', i < active);
        if (i === active) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }
    const max = document.documentElement.scrollHeight - innerHeight;
    railFill.style.transform = `scaleY(${clamp(scrollY / Math.max(1, max), 0, 1).toFixed(4)})`;
  }

  /* ------------------------------------------------------------------ */
  /* Staggered entrances: a wave, led by the most important line          */
  /* ------------------------------------------------------------------ */

  const stIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      $$('[data-st]', en.target).forEach((el, i) => { el.style.transitionDelay = `${i * 110}ms`; });
      en.target.classList.add('in');
      stIO.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  $$('[data-stagger]').forEach(el => stIO.observe(el));

  /* ------------------------------------------------------------------ */
  /* Hold-to-strike guidance                                             */
  /* ------------------------------------------------------------------ */

  const holdText = $('#holdText');
  const holdDefault = holdText.innerHTML;
  let holdStage = 0;
  function updateHoldText() {
    const m = rumor() && rumor().metrics();
    if (!m) return;
    const stage = m.state !== 'idle' || !m.holding ? 0 : m.hold < 0.45 ? 1 : m.hold < 0.82 ? 2 : 3;
    if (stage === holdStage) return;
    holdStage = stage;
    holdText.classList.remove('swap');
    void holdText.offsetWidth;
    holdText.innerHTML = [holdDefault, 'Keep holding', 'Almost midnight', 'Here it comes'][stage];
    holdText.classList.add('swap');
  }

  /* ------------------------------------------------------------------ */
  /* Days away, and saving the date                                      */
  /* ------------------------------------------------------------------ */

  (() => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date()).reduce((o, p) => (o[p.type] = +p.value, o), {});
    const days = Math.round((Date.UTC(2026, 11, 31) - Date.UTC(parts.year, parts.month - 1, parts.day)) / 864e5);
    $('#daysAway').textContent = days > 1 ? `${days} days away` : days === 1 ? 'Tomorrow' : days === 0 ? 'Tonight' : '';
  })();

  const calBtn = $('#addCal');
  calBtn.addEventListener('click', () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const host = $('#hostLabel').textContent || 'Rumor';
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rumor//NYE Vol 01//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', 'UID:rumor-nye-vol01@therumor.com', `DTSTAMP:${stamp}`,
      'DTSTART:20270101T020000Z', 'DTEND:20270101T080000Z',
      `SUMMARY:${host} Presents: ${previewEl.getAttribute('aria-label') || previewEl.textContent}`,
      'LOCATION:New York City (address shared with the guest list)',
      'DESCRIPTION:Guest list only. Cocktail chic. Doors 9 PM until late.',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rumor-new-years-eve.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    calBtn.classList.add('is-done');
    calBtn.setAttribute('aria-label', 'Saved to your calendar');
    if (audio) audio.chime();
    clearTimeout(calBtn._t);
    calBtn._t = setTimeout(() => { calBtn.classList.remove('is-done'); calBtn.removeAttribute('aria-label'); }, 3600);
  });

  /* ------------------------------------------------------------------ */
  /* Palette wipe: the new colour spreads from the swatch you picked      */
  /* ------------------------------------------------------------------ */

  const wipe = $('.wipe');
  let wipeFrom = null;
  $$('.swatch').forEach(sw => sw.addEventListener('pointerdown', e => { wipeFrom = [e.clientX, e.clientY]; }));
  $$('input[name="theme"]').forEach(r => r.addEventListener('change', () => {
    if (reduced) return;
    const box = r.closest('.swatch').getBoundingClientRect();
    const [x, y] = wipeFrom || [box.left + 20, box.top + box.height / 2];
    wipeFrom = null;
    wipe.style.setProperty('--x', `${x}px`);
    wipe.style.setProperty('--y', `${y}px`);
    wipe.style.setProperty('--c', getComputedStyle(root).getPropertyValue('--accent').trim() || '#a9adff');
    wipe.classList.remove('run');
    void wipe.offsetWidth;
    wipe.classList.add('run');
    if (rumor()) rumor().nudge(5);
    window.dispatchEvent(new CustomEvent('rumor:wipe'));
  }));

  /* ------------------------------------------------------------------ */
  /* Closing wordmark, scrubbed by the last stretch of scroll             */
  /* ------------------------------------------------------------------ */

  const footMark = $('#footMark');
  let markLetters = [];
  function setMark(text) {
    if (!text.trim() || text.trim().toLowerCase() === 'rumor') {
      footMark.innerHTML = `<span class="foot__svg"><svg width="0" height="0" style="position:absolute"><defs><linearGradient id="footGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0.15" stop-color="#eef0ff"/><stop offset="1" stop-color="#eef0ff" stop-opacity="0.12"/></linearGradient></defs></svg>${$('#wordmarkTpl').innerHTML}</span>`;
      footMark.style.fontSize = '';
      markLetters = $$('.foot__svg', footMark);
      return;
    }
    const chars = Array.from(text.trim());
    footMark.innerHTML = chars.map(ch => `<span>${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
    footMark.style.fontSize = `${Math.min(27, 96 / Math.max(1, chars.length * 0.56)).toFixed(2)}vw`;
    markLetters = $$('span', footMark);
  }
  setMark('Rumor');
  window.addEventListener('rumor:letter', () => setMark($('#hostLabel').textContent));
  function updateMark() {
    if (!markLetters.length) return;
    const r = footMark.getBoundingClientRect();
    if (r.top > innerHeight) return;
    const start = r.top + scrollY - innerHeight;
    const end = document.documentElement.scrollHeight - innerHeight;
    const p = reduced ? 1 : clamp((scrollY - start) / Math.max(1, end - start), 0, 1);
    const n = markLetters.length;
    markLetters.forEach((el, i) => {
      const k = clamp(p * 1.5 - (i / n) * 0.5, 0, 1);
      el.style.transform = `translate3d(0, ${((1 - k) * 105).toFixed(2)}%, 0)`;
    });
  }

  window.addEventListener('rumor:dragstart', () => body.classList.add('has-dragged'), { once: true });
  if (finePointer && !reduced) $('#afterHint').textContent = 'Paint or tap the sky';

  /* ------------------------------------------------------------------ */
  /* One loop for everything above                                        */
  /* ------------------------------------------------------------------ */

  const heroBottom = $('.hero__bottom');
  const cue = $('.scroll-cue');
  let lastY = scrollY, vel = 0, prev = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (lenis) lenis.raf(now);

    const y = scrollY;
    vel = lerp(vel, (y - lastY) / Math.max(dt, 0.001), 0.2);
    lastY = y;

    // hero copy lags the scroll and fades, like it's left behind on the water
    if (!reduced && y < innerHeight * 1.3) {
      const p = y / innerHeight;
      heroBottom.style.transform = `translate3d(0, ${(y * 0.32).toFixed(1)}px, 0)`;
      heroBottom.style.opacity = clamp(1 - p * 2.2, 0, 1).toFixed(3);
      cue.style.opacity = clamp(1 - p * 5, 0, 1).toFixed(3);
    }

    updateClock();
    updateRail();
    updateHoldText();
    updateMark();

    if (track && mVisible && !reduced) {
      mSkew = lerp(mSkew, Math.min(900, Math.abs(vel)) * 0.35, 1 - Math.exp(-dt * 3));
      mx -= (38 + mSkew) * dt;
      if (half > 0 && mx <= -half) mx += half;
      track.style.transform = `translate3d(${mx.toFixed(2)}px,0,0)`;
    }

    if (cursorOn) {
      const k = reduced ? 1 : 1 - Math.exp(-dt * 16);
      rx = lerp(rx, px, k); ry = lerp(ry, py, k);
      cursor.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
      cursor.style.setProperty('--dx', `${(px - rx).toFixed(1)}px`);
      cursor.style.setProperty('--dy', `${(py - ry).toFixed(1)}px`);
      const { label, mode } = cursorState();
      if (mode !== lastMode) { cursor.dataset.mode = mode; lastMode = mode; }
      if (label !== lastLabel) { cLabel.textContent = label; cursor.classList.toggle('has-label', !!label); lastLabel = label; }
      const m = rumor() ? rumor().metrics() : null;
      cProg.style.strokeDashoffset = (100 - (m ? m.hold : 0) * 100).toFixed(1);
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
