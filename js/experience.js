/* The experience layer: the entrance and countdown, smooth scrolling, concepts,
 * the departure board, the invitation request, customization and the small
 * touches. The scene itself lives in main.js and is reached through window.Rumor.
 */
'use strict';

(() => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo(0, 0);
  addEventListener('beforeunload', () => window.scrollTo(0, 0));
  addEventListener('pageshow', e => { if (e.persisted) location.reload(); });

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;
  const body = document.body;
  const audio = window.RumorAudio;
  const rumor = () => window.Rumor;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  /* ------------------------------------------------------------------ */
  /* Smooth scrolling                                                    */
  /* ------------------------------------------------------------------ */

  let lenis = null;
  if (false) {
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.3 });
    root.classList.add('has-lenis');
  }
  const scrollToEl = (el, instant) => {
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { duration: instant ? 0 : 1.6, immediate: !!instant, easing: t => 1 - Math.pow(1 - t, 4) });
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
  });

  let locks = 0;
  function lockScroll(on) {
    locks = Math.max(0, locks + (on ? 1 : -1));
    const locked = locks > 0;
    root.classList.toggle('is-locked', locked);
    if (lenis) (locked ? lenis.stop() : lenis.start());
  }

  /* ------------------------------------------------------------------ */
  /* Entrance                                                            */
  /* ------------------------------------------------------------------ */

  const loader = $('#loader');
  const num = $('#loaderNum');
  const bar = $('#loaderBar');
  const enterSound = $('#enterSound');
  const enterQuiet = $('#enterQuiet');
  const countEl = $('#countNum');
  const countStatus = $('#countStatus');
  const skipBtn = $('#skipIntro');
  let entered = false, introLocked = false;

  function enter(withSound) {
    if (entered) return;
    entered = true;
    if (withSound && audio) audio.enable('build');
    loader.classList.add('is-leaving');
    setTimeout(() => window.dispatchEvent(new CustomEvent('rumor:enter')), reduced ? 0 : 650);
    setTimeout(() => { loader.hidden = true; }, reduced ? 400 : 1500);
  }

  lockScroll(true);
  introLocked = true;
  {
    const t0 = performance.now();
    let ready = false, progress = 0, shown = false;
    const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise(r => addEventListener('load', r, { once: true }));
    Promise.race([
      Promise.all([loaded, document.fonts ? document.fonts.ready : null]),
      new Promise(r => setTimeout(r, 5000))
    ]).then(() => { ready = true; });
    if (store.get('rumor-sound') === 'off') enterQuiet.after(enterSound);

    const step = () => {
      const elapsed = performance.now() - t0;
      const target = ready ? 1 : Math.min(0.88, elapsed / 2200);
      progress += (target - progress) * (reduced ? 1 : 0.07);
      num.textContent = String(Math.round(progress * 100)).padStart(3, '0');
      bar.style.transform = `scaleX(${progress.toFixed(4)})`;
      if (!shown && ready && progress > 0.995 && (elapsed > 1400 || reduced)) {
        shown = true;
        num.textContent = '100';
        loader.classList.add('is-ready');
        setTimeout(() => $('.loader__enter button', loader).focus({ preventScroll: true }), 350);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    enterSound.addEventListener('click', () => enter(true));
    enterQuiet.addEventListener('click', () => enter(false));
  }

  // 3, 2, 1
  window.addEventListener('rumor:introstart', () => {
    body.classList.add('is-counting');
    if (!introLocked) { lockScroll(true); introLocked = true; }
  });
  window.addEventListener('rumor:count', e => {
    const n = e.detail;
    if (audio) audio.count(n);
    if (n > 0) {
      countEl.textContent = n;
      countStatus.textContent = String(n);
      countEl.classList.remove('tick');
      void countEl.offsetWidth;
      countEl.classList.add('tick');
    } else {
      body.classList.remove('is-counting');
      countStatus.textContent = 'Midnight. Happy New Year.';
    }
  });
  window.addEventListener('rumor:strike', () => { if (audio) audio.drop(); });
  window.addEventListener('rumor:introdone', () => {
    body.classList.remove('is-counting');
    if (introLocked) { lockScroll(false); introLocked = false; }
  });
  skipBtn.addEventListener('click', () => rumor() && rumor().skipIntro());
  // scrolling or pressing a key during the countdown means "let me in"
  const impatient = () => { if (body.classList.contains('is-intro') && rumor()) rumor().skipIntro(); };
  addEventListener('wheel', impatient, { passive: true });
  addEventListener('touchmove', impatient, { passive: true });
  addEventListener('keydown', e => { if (['Escape', 'ArrowDown', 'PageDown', ' '].includes(e.key)) impatient(); });

  $('#replayIntro').addEventListener('click', () => {
    scrollToEl($('#arrival'), true);
    setTimeout(() => rumor() && rumor().replayIntro(), 80);
  });

  /* ------------------------------------------------------------------ */
  /* Titles                                                              */
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
    const chars = Array.from(text), before = Array.from(prevPreview);
    let same = 0;
    while (same < chars.length && chars[same] === before[same]) same++;
    previewEl.setAttribute('aria-label', text);
    // letters animate individually, but words never break apart
    let k = 0;
    previewEl.innerHTML = text.split(' ').map(word => {
      const html = Array.from(word).map(ch => {
        const cls = k >= same && !reduced ? 'pc pop' : 'pc';
        return `<span class="${cls}" style="--k:${Math.max(0, k++ - same)}" aria-hidden="true">${esc(ch)}</span>`;
      }).join('');
      k++;
      return `<span class="pw">${html}</span>`;
    }).join(' ');
    prevPreview = text;
  }
  setTitle(titleEl.textContent.trim());

  // section titles rise out of a mask
  const maskIO = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); maskIO.unobserve(en.target); } });
  }, { threshold: 0.4 });
  $$('.section-title, .yours__panel h2').forEach(h => {
    h.innerHTML = `<span class="mask"><span class="mask__in">${h.innerHTML}</span></span>`;
    h.classList.add('masked');
    maskIO.observe(h);
  });

  // one gentle entrance per block
  const revealIO = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); revealIO.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -10% 0px' });
  $$('[data-reveal], .partners, .details__foot, .lineup__stage, .timeline').forEach(el => revealIO.observe(el));

  /* ------------------------------------------------------------------ */
  /* Buttons: the label rolls                                            */
  /* ------------------------------------------------------------------ */

  $$('.btn').forEach(btn => {
    const target = btn.querySelector('.btn__label') || (btn.classList.contains('cal') ? null : btn);
    if (!target || target.querySelector('.roll')) return;
    const text = target.textContent.trim();
    target.innerHTML = `<span class="roll"><span class="roll__a">${esc(text)}</span><span class="roll__b" aria-hidden="true">${esc(text)}</span></span>`;
  });
  if (finePointer && !reduced) {
    $$('.btn, .sound').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.translate = `${((e.clientX - (r.left + r.width / 2)) * 0.14).toFixed(1)}px ${((e.clientY - (r.top + r.height / 2)) * 0.22).toFixed(1)}px`;
      });
      el.addEventListener('pointerleave', () => { el.style.translate = '0px 0px'; });
    });
  }

  /* ------------------------------------------------------------------ */
  /* The rumor, declassified: every word arrives redacted, then the bars   */
  /* peel away one by one                                                 */
  /* ------------------------------------------------------------------ */

  const storyEl = $('#story');
  const ledeEl = $('#lede');
  // the headline, with photographs tucked between the words
  const STORY_IMGS = [
    { src: 'https://images.unsplash.com/photo-1754766621748-2a96cbf56a1f', kicker: 'The city', title: 'New York, from the top', copy: 'The skyline does half the work. We do the rest.' },
    { src: 'https://images.unsplash.com/photo-1762854382956-110a4021d92a', kicker: 'The toast', title: 'Poured until the last call', copy: 'Curated cocktails and a proper champagne moment at twelve.' },
    { src: 'https://images.unsplash.com/photo-1517263904808-5dc91e3e7044', kicker: 'The drop', title: 'Midnight, under the ball', copy: 'The lights come up, and the room finds out what the rumor was.' }
  ];
  const imgUrl = (s, w) => `${s}?w=${w}&q=72&auto=format&fit=crop`;
  STORY_IMGS.forEach(m => { const im = new Image(); im.src = imgUrl(m.src, 420); });
  let storyShown = false;
  function buildHeadline(text) {
    // break after the second sentence when there is one, like a printed card
    const parts = text.match(/[^.!?]+[.!?]+/g) || [text];
    const lines = parts.length >= 3 ? [parts.slice(0, 2).join(' '), parts.slice(2).join(' ')] : [text];
    let t = 0.1;
    return lines.map(line => `<span class="sl">${line.trim().split(/\s+/).map(w => {
      const s = `<span class="iw" style="--d:${t.toFixed(2)}s">${esc(w)}</span>`;
      t += 0.08;
      return s;
    }).join(' ')}</span>`).join(' ');
  }
  function setStoryText(text, replay) {
    ledeEl.setAttribute('aria-label', text);
    if (replay && storyShown && !reduced) {
      storyEl.classList.remove('is-revealed');
      ledeEl.innerHTML = buildHeadline(text);
      void storyEl.offsetWidth;
      requestAnimationFrame(() => storyEl.classList.add('is-revealed'));
    } else {
      ledeEl.innerHTML = buildHeadline(text);
    }
  }
  setStoryText(ledeEl.textContent.trim());

  // a photograph opens into a card, growing out of its place in the sentence
  const lb = $('#lightbox'), lbCard = $('.lightbox__card', lb);
  let lbFrom = null, lbOpen = false;
  function openPhoto(btn) {
    const m = STORY_IMGS[+btn.dataset.i];
    $('#lbImg').style.backgroundImage = `url('${imgUrl(m.src, 1200)}')`;
    $('#lbKicker').textContent = m.kicker;
    $('#lbTitle').textContent = m.title;
    $('#lbCopy').textContent = m.copy;
    lbFrom = btn;
    lb.hidden = false;
    lockScroll(true);
    lbOpen = true;
    const from = btn.getBoundingClientRect();
    const to = lbCard.getBoundingClientRect();
    const sx = from.width / to.width, sy = from.height / to.height;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    if (!reduced) {
      lbCard.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: '28px', filter: 'blur(6px)' },
        { transform: 'none', borderRadius: '22px', filter: 'blur(0px)' }
      ], { duration: 750, easing: 'cubic-bezier(0.19, 1, 0.22, 1)' });
    }
    lb.classList.add('is-open');
    setTimeout(() => $('.lightbox__close', lb).focus({ preventScroll: true }), 50);
  }
  function closePhoto() {
    if (!lbOpen) return;
    lbOpen = false;
    lb.classList.remove('is-open');
    const done = () => { lb.hidden = true; lockScroll(false); lbFrom && lbFrom.focus({ preventScroll: true }); };
    if (reduced || !lbFrom) return done();
    const from = lbFrom.getBoundingClientRect(), to = lbCard.getBoundingClientRect();
    const sx = from.width / to.width, sy = from.height / to.height;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    lbCard.animate([
      { transform: 'none', borderRadius: '22px', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: '28px', opacity: 0.6 }
    ], { duration: 480, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }).finished.then(done);
  }
  $('#scards').addEventListener('click', e => { const b = e.target.closest('.scard'); if (b) openPhoto(b); });
  lb.addEventListener('click', e => { if (e.target.closest('[data-close]')) closePhoto(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closePhoto(); });

  function revealStory() {
    if (storyShown) return;
    storyShown = true;
    storyEl.classList.add('is-revealed');
  }
  function updateStory() {}

  /* ------------------------------------------------------------------ */
  /* Concepts: same event, different room                                 */
  /* ------------------------------------------------------------------ */

  const CONCEPTS = {
    midnight: { theme: 'ultramarine', lede: 'New York. New Year. No ordinary night.' },
    afterhours: { theme: 'rose', lede: 'Low lights. Late sets. A year that starts after midnight.' },
    blacktie: { theme: 'silver', lede: 'Sharp tailoring. Clear heads. Midnight in black and white.' }
  };
  const conceptWrap = $('.concepts');
  const conceptOpts = $$('.concepts__opt');
  const pill = $('.concepts__pill');
  const wipe = $('.wipe');
  let concept = 'midnight';

  function placePill() {
    const on = conceptOpts.find(b => b.dataset.concept === concept);
    if (!on) return;
    pill.style.width = `${on.offsetWidth}px`;
    pill.style.transform = `translateX(${on.offsetLeft}px)`;
  }
  function setConcept(key, from, quiet) {
    if (!CONCEPTS[key]) return;
    const changed = key !== concept;
    concept = key;
    conceptOpts.forEach(b => b.setAttribute('aria-checked', String(b.dataset.concept === key)));
    conceptWrap.dataset.active = key;
    body.dataset.concept = key;
    placePill();
    const c = CONCEPTS[key];
    if (rumor()) rumor().setTheme(c.theme);
    setStoryText(c.lede, changed);
    if (audio) audio.setConcept(key);
    if (changed && !quiet && !reduced && from) {
      wipe.style.setProperty('--x', `${from[0]}px`);
      wipe.style.setProperty('--y', `${from[1]}px`);
      wipe.style.setProperty('--c', getComputedStyle(root).getPropertyValue('--accent').trim() || '#a9adff');
      wipe.classList.remove('run');
      void wipe.offsetWidth;
      wipe.classList.add('run');
    }
  }
  conceptOpts.forEach(b => b.addEventListener('click', e => {
    // on small screens the control is a single button that cycles
    if (innerWidth < 760) {
      const keys = Object.keys(CONCEPTS);
      setConcept(keys[(keys.indexOf(concept) + 1) % keys.length], [e.clientX, e.clientY]);
      return;
    }
    setConcept(b.dataset.concept, [e.clientX, e.clientY]);
  }));
  conceptWrap.addEventListener('keydown', e => {
    const keys = Object.keys(CONCEPTS);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = keys[(keys.indexOf(concept) + d + keys.length) % keys.length];
    const btn = conceptOpts.find(b => b.dataset.concept === next);
    const r = btn.getBoundingClientRect();
    setConcept(next, [r.left + r.width / 2, r.top + r.height / 2]);
    btn.focus();
  });
  addEventListener('resize', placePill);
  if (document.fonts) document.fonts.ready.then(placePill);
  setConcept('midnight', null, true);

  /* ------------------------------------------------------------------ */
  /* The lineup: a playbill. The spotlight walks down the night; on hover  */
  /* a photograph follows the cursor and changes with a parallax reveal    */
  /* ------------------------------------------------------------------ */

  const rows = $$('.bill__row');
  const BILL_MS = 3800;
  let rowIdx = -1, rowT = 0, billSeen = false, billHover = false;
  function setRow(i) {
    rowIdx = i; rowT = 0;
    rows.forEach((r, k) => { r.classList.toggle('is-on', k === i); r.setAttribute('aria-current', k === i ? 'true' : 'false'); });
  }
  const bill = $('#bill');
  new IntersectionObserver(([en]) => {
    billSeen = en.isIntersecting;
    if (billSeen && rowIdx < 0) setTimeout(() => setRow(0), reduced ? 0 : 900);
  }, { threshold: 0.4 }).observe(bill);
  function updateLineup(dt) {
    if (billFloat) moveFloat(dt);
    if (!billSeen || billHover || rowIdx < 0 || reduced) return;
    rowT += dt * 1000;
    if (rowT > BILL_MS) setRow((rowIdx + 1) % rows.length);
  }

  // the floating photograph
  let billFloat = null, layers = [], fCur = -1, fx = 0, fy = 0, ftx = 0, fty = 0, fShown = false;
  rows.forEach(r => { const im = new Image(); im.src = r.dataset.img; });
  if (finePointer) {
    billFloat = document.createElement('div');
    billFloat.className = 'bill-float';
    billFloat.setAttribute('aria-hidden', 'true');
    billFloat.innerHTML = rows.map(r => `<div class="bill-float__layer"><div class="bill-float__img" style="background-image:url('${r.dataset.img}')"></div></div>`).join('');
    document.body.appendChild(billFloat);
    layers = $$('.bill-float__layer', billFloat);
  }
  function showImage(i) {
    if (!billFloat || i === fCur) return;
    layers.forEach((l, k) => { l.classList.toggle('is-prev', k === fCur); l.classList.toggle('is-on', k === i); });
    fCur = i;
  }
  function moveFloat(dt) {
    const k = reduced ? 1 : 1 - Math.exp(-dt * 9);
    fx = lerp(fx, ftx, k); fy = lerp(fy, fty, k);
    const tilt = reduced ? 0 : clamp((ftx - fx) * 0.06, -9, 9);
    billFloat.style.transform = `translate3d(${(fx + 36).toFixed(1)}px, ${(fy - billFloat.offsetHeight / 2).toFixed(1)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
  }
  bill.addEventListener('pointerenter', e => {
    billHover = true;
    if (!billFloat || e.pointerType !== 'mouse') return;
    ftx = fx = e.clientX; fty = fy = e.clientY;
    billFloat.classList.add('is-visible');
  });
  bill.addEventListener('pointerleave', () => {
    billHover = false;
    if (billFloat) billFloat.classList.remove('is-visible');
  });
  bill.addEventListener('pointermove', e => { ftx = e.clientX; fty = e.clientY; });
  rows.forEach((r, k) => {
    r.addEventListener('mouseenter', () => { if (finePointer) { setRow(k); showImage(k); } });
    r.addEventListener('click', () => setRow(k));
    r.addEventListener('focus', () => setRow(k));
  });

  /* ------------------------------------------------------------------ */
  /* The invitation: an envelope that opens, and closes again             */
  /* ------------------------------------------------------------------ */

  const envEl = $('#envelope');
  let envOpen = false;
  function setEnvelope(open) {
    envOpen = open;
    envEl.classList.toggle('open', open);
    envEl.classList.toggle('close', !open);
    envEl.setAttribute('aria-expanded', String(open));
    envEl.setAttribute('aria-label', open ? 'Close the invitation' : 'Open the invitation');
    // once the letter is out, the envelope leaves and only the card stays
    clearTimeout(envEl._t);
    if (open) envEl._t = setTimeout(() => { envEl.classList.add('is-card'); $('#details').classList.add('is-revealed'); }, reduced ? 0 : 1250);
    else { envEl.classList.remove('is-card'); $('#details').classList.remove('is-revealed'); }
    if (audio) audio.blip(open ? 900 : 600, 0.02);
  }
  envEl.addEventListener('click', e => { if (!e.target.closest('.env2__where')) setEnvelope(!envOpen); });
  envEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEnvelope(!envOpen); } });
  const where = $('.env2__where');
  where.addEventListener('click', () => where.classList.toggle('is-open'));
  const envIO = new IntersectionObserver(entries => {
    if (!entries.some(en => en.isIntersecting)) return;
    setTimeout(() => setEnvelope(true), reduced ? 0 : 1000);
    envIO.disconnect();
  }, { threshold: 0.55 });
  envIO.observe($('#envStage'));

  // the live countdown in the hero
  const liveCount = $('#liveCount');
  const MIDNIGHT = Date.UTC(2027, 0, 1, 5, 0, 0); // 12:00 AM Jan 1 in New York (EST)
  let lastCount = '';
  const two = n => String(n).padStart(2, '0');
  function tickLive() {
    let s = Math.max(0, Math.floor((MIDNIGHT - Date.now()) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    const txt = `${d}D ${two(h)}:${two(m)}:${two(s)}`;
    liveCount.innerHTML = Array.from(txt).map((ch, i) =>
      `<span class="${lastCount && lastCount[i] !== ch && !reduced ? 'tickRoll' : ''}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    liveCount.setAttribute('aria-label', `${d} days, ${h} hours and ${m} minutes until midnight in New York`);
    lastCount = txt;
  }
  tickLive();
  setInterval(tickLive, 1000);

  const pRow = $('.partners__row');
  if (pRow) {
    const items = pRow.innerHTML;
    pRow.innerHTML = items + items.replace(/<li /g, '<li aria-hidden="true" ');
  }

  /* ------------------------------------------------------------------ */
  /* Make it yours                                                       */
  /* ------------------------------------------------------------------ */

  const DEFAULTS = { title: 'New Year’s Eve', host: 'Rumor', date: 'THU DEC 31 2026', city: 'NEW YORK CITY', shortDate: '12.31.26', shortCity: 'New York' };
  const nameIn = $('#cName'), hostIn = $('#cHost'), dateIn = $('#cDate'), cityIn = $('#cCity');
  const hostEls = [$('#hostLabel'), ...$$('.js-host')];

  nameIn.addEventListener('input', () => {
    const v = nameIn.value.trim() || DEFAULTS.title;
    setTitle(v);
    $('#icardTitle').textContent = v;
    document.title = `${hostIn.value.trim() || 'Rumor'} Presents: ${v}`;
  });
  hostIn.addEventListener('input', () => {
    const v = hostIn.value.trim();
    hostEls.forEach(el => { el.textContent = v || 'Rumor'; });
    const custom = !!v && v.toLowerCase() !== 'rumor';
    body.classList.toggle('has-host', custom);
    const ch = (v.match(/[\p{L}\p{N}]/u) || [''])[0].toUpperCase();
    if (rumor()) rumor().setLetter(custom && ch ? ch : 'R*');
    setMark(custom ? v : 'Rumor');
  });
  dateIn.addEventListener('input', () => {
    const v = dateIn.value.trim();
    $('#heroDate').textContent = v || DEFAULTS.shortDate;
    $('#ticketDate').textContent = v ? v.slice(0, 10) : DEFAULTS.shortDate;
    $('#icardDate').textContent = v || 'Thursday, December 31';
  });
  cityIn.addEventListener('input', () => {
    const v = cityIn.value.trim();
    $('#heroWhere').textContent = v || DEFAULTS.shortCity;
    $('#icardCity').textContent = v || 'New York City';
  });
  const SAMPLES = [
    { name: 'Spring Collection', host: 'Maison Vale', date: 'Fri Mar 12 2027', city: 'Paris', concept: 'blacktie' },
    { name: 'Launch Night', host: 'Northbound', date: 'Thu Jun 3 2027', city: 'Miami', concept: 'afterhours' },
    { name: 'The Private Dinner', host: 'Hôtel Ondine', date: 'Sat Feb 6 2027', city: 'London', concept: 'blacktie' },
    { name: 'Summer Rooftop', host: 'Atlas Audio', date: 'Sat Jul 17 2027', city: 'Los Angeles', concept: 'midnight' },
    { name: 'Gallery Opening', host: 'Ferro & Co', date: 'Wed Apr 21 2027', city: 'Mexico City', concept: 'afterhours' }
  ];
  let sampleAt = -1;
  $('#cShuffle').addEventListener('click', e => {
    sampleAt = (sampleAt + 1) % SAMPLES.length;
    const smp = SAMPLES[sampleAt];
    const fill = (inp, v) => { inp.value = v; inp.dispatchEvent(new Event('input')); };
    fill(nameIn, smp.name); fill(hostIn, smp.host); fill(dateIn, smp.date); fill(cityIn, smp.city);
    setConcept(smp.concept, [e.clientX || innerWidth / 2, e.clientY || innerHeight / 2]);
    if (audio) audio.chime();
  });

  $('#cReset').addEventListener('click', () => {
    [nameIn, hostIn, dateIn, cityIn].forEach(i => { i.value = ''; i.dispatchEvent(new Event('input')); });
    setConcept('midnight', null, true);
    sampleAt = -1;
  });

  /* ------------------------------------------------------------------ */
  /* Invitation request                                                  */
  /* ------------------------------------------------------------------ */

  const dialog = $('#invite');
  const form = $('#listForm');
  const done = $('#listDone');
  let lastOpener = null;

  function openInvite(opener) {
    lastOpener = opener;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    body.classList.add('invite-open');
    lockScroll(true);
    requestAnimationFrame(() => dialog.classList.add('is-open'));
    setTimeout(() => (done.hidden ? $('#fName') : done).focus({ preventScroll: true }), 60);
    if (audio) audio.blip(1600, 0.02);
  }
  function closeInvite() {
    if (!dialog.open) return;
    dialog.classList.remove('is-open');
    body.classList.remove('invite-open');
    setTimeout(() => {
      dialog.close ? dialog.close() : dialog.removeAttribute('open');
      lockScroll(false);
      if (lastOpener) lastOpener.focus({ preventScroll: true });
    }, reduced ? 0 : 380);
  }
  $$('[data-invite]').forEach(b => b.addEventListener('click', () => openInvite(b)));
  $('#inviteClose').addEventListener('click', closeInvite);
  dialog.addEventListener('cancel', e => { e.preventDefault(); closeInvite(); });
  dialog.addEventListener('click', e => { if (e.target === dialog) closeInvite(); });

  const fields = {
    name: { el: $('#fName'), err: $('#fNameErr'), check: v => (v.trim().split(/\s+/).length > 1 ? '' : 'Enter your first and last name.') },
    email: { el: $('#fEmail'), err: $('#fEmailErr'), check: v => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Enter an email address like name@example.com.') },
    phone: { el: $('#fPhone'), err: $('#fPhoneErr'), check: v => (v.replace(/\D/g, '').length >= 10 ? '' : 'Enter a phone number with area code.') },
    ig: { el: $('#fIg'), err: $('#fIgErr'), check: v => (v.replace('@', '').trim().length > 1 ? '' : 'Enter your Instagram handle.') }
  };
  const validate = (f, loud) => {
    const msg = f.check(f.el.value);
    f.err.textContent = msg;
    f.el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) f.el.setAttribute('aria-describedby', f.err.id); else f.el.removeAttribute('aria-describedby');
    if (msg && loud && !reduced) {
      const field = f.el.parentElement;
      field.classList.remove('is-shaking'); void field.offsetWidth; field.classList.add('is-shaking');
    }
    return !msg;
  };
  Object.values(fields).forEach(f => {
    f.el.addEventListener('blur', () => { if (f.el.value) validate(f); });
    f.el.addEventListener('input', () => {
      f.el.parentElement.classList.toggle('is-valid', !f.check(f.el.value));
      if (f.el.getAttribute('aria-invalid') === 'true' && !f.check(f.el.value)) validate(f);
    });
  });
  $('#fIg').addEventListener('focus', e => { if (!e.target.value) e.target.value = '@'; });
  form.addEventListener('animationend', e => e.target.classList.remove('is-shaking'));

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (form.classList.contains('is-sending')) return;
    const bad = Object.values(fields).filter(f => !validate(f, true));
    if (bad.length) { bad[0].el.focus(); if (audio) audio.blip(320, 0.03); return; }
    const name = fields.name.el.value.trim();
    $('#doneName').textContent = `, ${name.split(/\s+/)[0]}`;
    $('#ticketName').textContent = $('input[name="plus"]:checked').value === 'plus-one' ? `${name} +1` : name;
    $('#ticketCode').textContent = `NYE-${Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 31) | 0]).join('')}`;
    form.classList.add('is-sending');
    setTimeout(() => {
      form.classList.add('is-leaving');
      setTimeout(() => {
        form.hidden = true;
        done.hidden = false;
        done.focus({ preventScroll: true });
        fillTicket();
        if (audio) audio.chime();
      }, reduced ? 0 : 480);
    }, reduced ? 0 : 1000);
  });

  const ticket = $('.ticket');
  function fillTicket() {
    const host = ($('#hostLabel').textContent || 'Rumor').trim();
    const custom = host.toLowerCase() !== 'rumor';
    const initial = (host.match(/[\p{L}\p{N}]/u) || ['R'])[0].toUpperCase();
    $('#ticketBall').innerHTML = custom
      ? `<text x="50" y="50" text-anchor="middle" dominant-baseline="central">${esc(initial)}</text>`
      : $('#rMarkTpl').innerHTML;
    $('#ticketHost').textContent = host;
    $('#ticketTitle').textContent = previewEl.getAttribute('aria-label') || previewEl.textContent;
    requestAnimationFrame(() => ticket.classList.add('is-in'));
  }

  if (!reduced) {
    let tx = 0, ty = 0, cx = 0, cy = 0, active = false;
    ticket.addEventListener('pointermove', e => {
      const r = ticket.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      active = true;
    });
    ticket.addEventListener('pointerleave', () => { tx = 0; ty = 0; active = false; });
    const tilt = () => {
      if (dialog.open && !done.hidden) {
        const idle = active ? 0 : performance.now() / 1000;
        cx = lerp(cx, tx + (active ? 0 : Math.sin(idle * 0.8) * 0.08), 0.12);
        cy = lerp(cy, ty + (active ? 0 : Math.cos(idle * 0.6) * 0.06), 0.12);
        ticket.style.setProperty('--ry', `${(cx * 22).toFixed(2)}deg`);
        ticket.style.setProperty('--rx', `${(-cy * 16).toFixed(2)}deg`);
        ticket.style.setProperty('--sx', `${((cx + 0.5) * 100).toFixed(1)}%`);
        ticket.style.setProperty('--sy', `${((cy + 0.5) * 100).toFixed(1)}%`);
      }
      requestAnimationFrame(tilt);
    };
    requestAnimationFrame(tilt);
  }

  // a shareable image of the invitation, 1200 x 630
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
    try { await Promise.all(['400 96px Romie', '400 30px "ABC Diatype"', '500 18px "ABC Diatype Semi-Mono"'].map(f => document.fonts.load(f))); } catch {}
    const cs = getComputedStyle(root);
    const deep = cs.getPropertyValue('--deep').trim() || '#05063a';
    const accent = cs.getPropertyValue('--accent').trim() || '#a9adff';
    const ink = '#eef0ff';
    const mono = sz => `500 ${sz}px "ABC Diatype Semi-Mono", "ABC Diatype", Arial, sans-serif`;
    x.fillStyle = deep; x.fillRect(0, 0, W, H);
    let g = x.createRadialGradient(0, 0, 0, 0, 0, W * 0.85);
    g.addColorStop(0, hexA(accent, 0.38)); g.addColorStop(1, hexA(accent, 0));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(W, H, 0, W, H, W * 0.75);
    g.addColorStop(0, hexA(accent, 0.3)); g.addColorStop(1, hexA(accent, 0));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255, 255, 255, 0.18)'; x.lineWidth = 2;
    x.beginPath(); x.roundRect(28, 28, W - 56, H - 56, 36); x.stroke();
    const host = ($('#hostLabel').textContent || 'Rumor').trim();
    const custom = host.toLowerCase() !== 'rumor';
    x.fillStyle = ink; x.textBaseline = 'alphabetic';
    if (!custom) {
      const k = 28 / 24;
      x.save(); x.translate(84, 78); x.scale(k, k);
      $$('path', $('#wordmarkTpl').content).forEach(p => x.fill(new Path2D(p.getAttribute('d'))));
      x.restore();
      x.font = mono(17); x.fillStyle = hexA(ink, 0.7); x.fillText('PRESENTS', 84 + 126 * k + 18, 104);
    } else {
      x.font = mono(17); x.fillStyle = hexA(ink, 0.7); x.fillText(`${host.toUpperCase()} PRESENTS`, 84, 104);
    }
    x.textAlign = 'right'; x.fillText('VOL. 01', W - 84, 104); x.textAlign = 'left';
    const bx = 228, by = 318, br = 116;
    g = x.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
    g.addColorStop(0, hexA(accent, 0.55)); g.addColorStop(1, deep);
    x.save(); x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fillStyle = g; x.fill(); x.clip();
    x.fillStyle = 'rgba(238, 240, 255, 0.2)';
    for (let yy = by - br; yy < by + br; yy += 9) for (let xx = bx - br + ((yy / 9) % 2) * 4.5; xx < bx + br; xx += 9) { x.beginPath(); x.arc(xx, yy, 1.9, 0, Math.PI * 2); x.fill(); }
    x.restore();
    x.save(); x.shadowColor = 'rgba(255, 255, 255, 0.8)'; x.shadowBlur = 24; x.fillStyle = '#fff';
    if (!custom) {
      const k = br / 39.36;
      x.translate(bx - (34.7 * k) / 2 + 0.155 * k, by - (39.36 * k) / 2); x.scale(k, k);
      x.fill(new Path2D($('#rMarkTpl').content.querySelector('path').getAttribute('d')));
    } else {
      x.font = `500 ${br * 1.05}px "ABC Diatype", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText((host.match(/[\p{L}\p{N}]/u) || ['R'])[0].toUpperCase(), bx, by + 4);
    }
    x.restore();
    x.strokeStyle = hexA(accent, 0.45); x.lineWidth = 1.5; x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.stroke();
    x.fillStyle = ink; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    const title = previewEl.getAttribute('aria-label') || previewEl.textContent;
    let fs = 92;
    x.font = `400 ${fs}px Romie, Georgia, serif`;
    while (x.measureText(title).width > W - 504 && fs > 40) { fs -= 4; x.font = `400 ${fs}px Romie, Georgia, serif`; }
    x.fillText(title, 400, 318);
    x.font = '400 30px "ABC Diatype", Arial, sans-serif'; x.fillStyle = hexA(ink, 0.72);
    x.fillText(`Admit ${$('#ticketName').textContent}`, 402, 372);
    x.strokeStyle = 'rgba(255, 255, 255, 0.3)'; x.setLineDash([10, 10]); x.lineWidth = 2;
    x.beginPath(); x.moveTo(28, 462); x.lineTo(W - 28, 462); x.stroke(); x.setLineDash([]);
    const cols = [['DATE', $('#ticketDate').textContent.toUpperCase()], ['DOORS', '9 PM'], ['WHERE', ($('#heroWhere').textContent || 'New York').toUpperCase()], ['STATUS', 'PENDING'], ['REF', $('#ticketCode').textContent]];
    cols.forEach(([k, v], i) => {
      const cx = 84 + i * ((W - 168) / cols.length);
      x.font = mono(15); x.fillStyle = hexA(ink, 0.46); x.fillText(k, cx, 520);
      x.font = mono(24); x.fillStyle = ink; x.fillText(v, cx, 556);
    });
    cv.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'rumor-invitation.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (audio) audio.chime();
    }, 'image/png');
  });

  /* ------------------------------------------------------------------ */
  /* Saving the date                                                     */
  /* ------------------------------------------------------------------ */

  const calBtn = $('#addCal');
  calBtn.addEventListener('click', () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const host = $('#hostLabel').textContent || 'Rumor';
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rumor//NYE Vol 01//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', 'UID:rumor-nye-vol01@therumor.com', `DTSTAMP:${stamp}`,
      'DTSTART:20270101T020000Z', 'DTEND:20270101T080000Z',
      `SUMMARY:${host} Presents: ${previewEl.getAttribute('aria-label') || previewEl.textContent}`,
      'LOCATION:New York City (shared with the guest list on Dec 30)',
      'DESCRIPTION:Guest list only. 21+. Cocktail chic. Doors 9 PM until late.',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'rumor-new-years-eve.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    calBtn.classList.add('is-done');
    if (audio) audio.chime();
    clearTimeout(calBtn._t);
    calBtn._t = setTimeout(() => calBtn.classList.remove('is-done'), 3600);
  });


  /* ------------------------------------------------------------------ */
  /* Cursor                                                              */
  /* ------------------------------------------------------------------ */

  const cursor = $('.cursor');
  const cLabel = $('.cursor__label');
  let px = -100, py = -100, rx = -100, ry = -100, overEl = null, cursorOn = false, lastMode = '', lastLabel = '';
  if (finePointer) {
    root.classList.add('has-cursor');
    addEventListener('pointermove', e => {
      px = e.clientX; py = e.clientY; overEl = e.target;
      if (!cursorOn) { cursorOn = true; rx = px; ry = py; cursor.classList.remove('is-hidden'); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => { cursorOn = false; cursor.classList.add('is-hidden'); });
    addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    addEventListener('pointerup', () => cursor.classList.remove('is-down'));
  } else {
    cursor.remove();
  }
  function cursorState() {
    const m = rumor() ? rumor().metrics() : null;
    const el = overEl;
    if (!el || !el.closest) return { label: '', mode: '' };
    if (el.closest('input, textarea, select')) return { label: '', mode: 'text' };
    if (m && m.dragging) return { label: 'Spin', mode: 'label' };
    if (el.closest('.scard')) return { label: 'View', mode: 'label' };
    if (el.closest('.env2__where')) return { label: 'Reveal', mode: 'label' };
    if (el.closest('.env2')) return { label: envOpen ? 'Close' : 'Open', mode: 'label' };
    if (el.closest('a, button, label')) return { label: '', mode: 'link' };
    if (rumor() && rumor().ballHit(px, py)) return { label: 'Tap', mode: 'label' };
    return { label: '', mode: '' };
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
    window.addEventListener('rumor:balltap', () => audio.flare());
    let lastBlip = 0;
    document.addEventListener('pointerover', e => {
      if (!finePointer) return;
      const t = e.target.closest && e.target.closest('.btn, .link, .concepts__opt, .sound');
      if (!t || t.contains(e.relatedTarget)) return;
      const n = performance.now();
      if (n - lastBlip > 80) { lastBlip = n; audio.blip(2700, 0.006); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Footer wordmark                                                     */
  /* ------------------------------------------------------------------ */

  const footEl = $('#footer');
  const footMark = $('#footMark');
  function setMark(text) {
    if (!text.trim() || text.trim().toLowerCase() === 'rumor') {
      footMark.innerHTML = `<span class="foot__svg"><svg width="0" height="0" style="position:absolute"><defs><linearGradient id="footGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0.15" stop-color="#eef0ff"/><stop offset="1" stop-color="#eef0ff" stop-opacity="0.12"/></linearGradient></defs></svg>${$('#wordmarkTpl').innerHTML}</span>`;
      footMark.style.fontSize = '';
      return;
    }
    const chars = Array.from(text.trim());
    footMark.innerHTML = chars.map((ch, k) => `<span style="--k:${k}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
    footMark.style.fontSize = `${Math.min(27, 96 / Math.max(1, chars.length * 0.56)).toFixed(2)}vw`;
  }
  setMark('Rumor');
  new IntersectionObserver(([en]) => { footEl.classList.toggle('is-here', en.isIntersecting); }, { threshold: 0.35 }).observe(footEl);


  /* ------------------------------------------------------------------ */
  /* Scenes: one screen each, with a navigator                           */
  /* ------------------------------------------------------------------ */

  const panels = $$('.panel');
  const sceneIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const i = panels.indexOf(en.target);
      en.target.classList.add('is-here');
      if (en.target === storyEl) revealStory();
    });
  }, { threshold: 0.55 });
  panels.forEach(p => sceneIO.observe(p));

  /* ------------------------------------------------------------------ */
  /* Progress ruler: rounded bars that swell under the cursor on a spring */
  /* ------------------------------------------------------------------ */

  const prog = $('#prog');
  const stops = [...panels, $('#footer')];
  const STOP_NAMES = ['Arrival', 'The rumor', 'The lineup', 'The invitation', 'Your event', 'Sign-off'];
  const PER = 2;
  const nT = (stops.length - 1) * PER + 1;
  prog.innerHTML = Array.from({ length: nT }, (_, i) => {
    const major = i % PER === 0;
    const name = STOP_NAMES[Math.round(i / PER)];
    return `<button type="button" class="prog__t${major ? ' is-major' : ''}" ${major ? `aria-label="Go to ${name}"` : 'tabindex="-1" aria-hidden="true"'}><i></i><span>${name}</span></button>`;
  }).join('');
  const progT = $$('.prog__t', prog);
  const progBars = progT.map(t => $('i', t));
  const pScale = new Float32Array(nT).fill(0.4), pVel = new Float32Array(nT);
  let pHover = null, pActive = -1, pShown = null;
  progT.forEach((t, i) => {
    t.addEventListener('mouseenter', () => { pHover = i; });
    t.addEventListener('focus', () => { pHover = i; });
    t.addEventListener('touchstart', () => { pHover = i; }, { passive: true });
    t.addEventListener('click', () => {
      scrollToEl(stops[Math.round(i / PER)]);
      t.classList.remove('is-picked'); void t.offsetWidth; t.classList.add('is-picked');
      if (audio) audio.blip(1900, 0.012);
    });
  });
  prog.addEventListener('mouseleave', () => { pHover = null; });
  prog.addEventListener('focusout', () => { pHover = null; });
  prog.addEventListener('touchend', () => { setTimeout(() => { pHover = null; }, 600); });

  function updateProg(dt) {
    // where are we, measured between the scenes rather than in raw pixels
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const tops = stops.map((st, k) => (k === stops.length - 1 ? max : Math.min(max, st.getBoundingClientRect().top + scrollY)));
    const y = scrollY;
    let k = 0;
    while (k < tops.length - 2 && y >= tops[k + 1]) k++;
    const f = clamp((y - tops[k]) / Math.max(1, tops[k + 1] - tops[k]), 0, 1);
    const act = clamp(Math.round((k + f) * PER), 0, nT - 1);
    if (act !== pActive) {
      progT.forEach((t, i) => { t.classList.toggle('is-active', i === act); t.classList.toggle('is-past', i < act); });
      pActive = act;
    }
    if (pHover !== pShown) {
      progT.forEach((t, i) => t.classList.toggle('is-hover', i === pHover));
      pShown = pHover;
    }
    // spring each bar toward its size: the hovered one full, neighbours tapering
    const h = Math.min(dt, 0.032) / 2;
    for (let i = 0; i < nT; i++) {
      let target = pHover === null ? 0.4 : Math.max(1 - Math.abs(i - pHover) * 0.2, 0.4);
      if (i === act && pHover === null) target = 0.72;
      for (let sub = 0; sub < 2; sub++) {
        const a = 300 * (target - pScale[i]) - 20 * pVel[i];
        pVel[i] += a * h;
        pScale[i] += pVel[i] * h;
      }
      if (reduced) pScale[i] = target;
      progBars[i].style.transform = `scale(${pScale[i].toFixed(4)})`;
    }
  }

  window.addEventListener('rumor:dragstart', () => body.classList.add('has-dragged'), { once: true });

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
  /* Depth between scenes: the scene you leave sinks back and fades,      */
  /* the one you arrive at rises to meet you. Transform and opacity only. */
  /* ------------------------------------------------------------------ */

  const depthItems = $$('.panel:not(.hero)').map(p => ({ el: p.firstElementChild, panel: p, last: '' }));
  function updateDepth() {
    if (reduced) return;
    const vh = innerHeight;
    depthItems.forEach(d => {
      const r = d.panel.getBoundingClientRect();
      // 0 when the scene is in place, toward 1 as it moves a screen away
      const p = clamp(r.top / vh, -1, 1);
      const a = Math.abs(p);
      let v = '';
      if (a > 0.002 && a < 1) {
        const k = a * a * (3 - 2 * a);
        v = `${(1 - k * 0.85).toFixed(3)}|translate3d(0, ${(p * 70).toFixed(1)}px, 0) scale(${(1 - k * 0.07).toFixed(4)})`;
      }
      if (v === d.last) return;
      d.last = v;
      if (!v) { d.el.style.opacity = ''; d.el.style.transform = ''; return; }
      const [o, t] = v.split('|');
      d.el.style.opacity = o;
      d.el.style.transform = t;
    });
  }

  /* ------------------------------------------------------------------ */
  /* One loop                                                            */
  /* ------------------------------------------------------------------ */

  const heroBottom = $('.hero__bottom');
  let prev = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (lenis) lenis.raf(now);
    const y = scrollY;
    if (!reduced && y < innerHeight * 1.3) {
      const p = y / innerHeight;
      heroBottom.style.transform = `translate3d(0, ${(y * 0.32).toFixed(1)}px, 0)`;
      heroBottom.style.opacity = clamp(1 - p * 2.2, 0, 1).toFixed(3);
    }
    updateStory();
    updateDepth();
    updateProg(dt);
    updateLineup(dt);
    if (cursorOn) {
      const k = reduced ? 1 : 1 - Math.exp(-dt * 16);
      rx = lerp(rx, px, k); ry = lerp(ry, py, k);
      cursor.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
      cursor.style.setProperty('--dx', `${(px - rx).toFixed(1)}px`);
      cursor.style.setProperty('--dy', `${(py - ry).toFixed(1)}px`);
      const { label, mode } = cursorState();
      if (mode !== lastMode) { cursor.dataset.mode = mode; lastMode = mode; }
      if (label !== lastLabel) { cLabel.textContent = label; cursor.classList.toggle('has-label', !!label); lastLabel = label; }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
