/* Rumor audio: everything is synthesized live with Web Audio, no files.
 * A low city pad, a bell for each of the twelve strikes, a swell at midnight,
 * and a faint glitter that follows how fast the mirror ball is turning.
 */
'use strict';

window.RumorAudio = (() => {
  const KEY = 'rumor-sound';
  let ctx = null, master, fxBus, padBus, pad, glitter;
  let enabled = false;
  let filterLockUntil = 0;

  const now = () => ctx.currentTime;

  function impulse(sec, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function noiseBuffer(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3.5;
    master.connect(comp).connect(ctx.destination);

    const verb = ctx.createConvolver();
    verb.buffer = impulse(3.4, 2.4);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.6;
    verb.connect(verbOut).connect(master);

    fxBus = ctx.createGain();
    fxBus.connect(master);
    const fxSend = ctx.createGain();
    fxSend.gain.value = 0.9;
    fxBus.connect(fxSend).connect(verb);

    padBus = ctx.createGain();
    padBus.gain.value = 0;
    padBus.connect(master);
    const padSend = ctx.createGain();
    padSend.gain.value = 0.35;
    padBus.connect(padSend).connect(verb);

    // the pad: A minor with an added ninth, warm and a little unresolved
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 120;
    lfo.connect(lfoAmt).connect(filter.frequency);
    lfo.start();
    filter.connect(padBus);
    const notes = [55, 110, 164.81, 246.94, 261.63];
    const voices = [];
    notes.forEach((f, i) => {
      [-7, 7].forEach(det => {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.32 : 0.05;
        o.connect(g).connect(filter);
        o.start();
        voices.push({ o, i });
      });
    });
    pad = { filter, voices };

    // glitter: band-passed noise whose level follows the ball's spin
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 7200;
    bp.Q.value = 1.4;
    const gg = ctx.createGain();
    gg.gain.value = 0;
    src.connect(bp).connect(gg).connect(fxBus);
    src.start();
    glitter = gg;
    return true;
  }

  function bell(f, gain = 0.08, dur = 2.4, when = 0) {
    const t = now() + when;
    [[1, 1], [2.76, 0.32], [5.4, 0.1], [0.5, 0.18]].forEach(([m, a]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * m;
      const g = ctx.createGain();
      const d = m > 2 ? dur * 0.35 : dur;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * a, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(fxBus);
      o.start(t);
      o.stop(t + d + 0.05);
    });
  }

  function boom(f0 = 92, f1 = 38, gain = 0.5, dur = 2.6) {
    const t = now();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(fxBus);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  function swoosh(dur = 1.6, gain = 0.12, from = 400, to = 9000) {
    const t = now();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(fxBus);
    src.start(t);
  }

  const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];

  function setChord(major) {
    const t = now();
    pad.voices.forEach(v => { if (v.i === 4) v.o.frequency.setTargetAtTime(major ? 277.18 : 261.63, t, 0.4); });
  }

  function openFilter(peak, settle, secs) {
    const f = pad.filter.frequency, t = now();
    filterLockUntil = t + 0.8 + secs * 2;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.linearRampToValueAtTime(peak, t + 0.6);
    f.setTargetAtTime(settle, t + 0.8, secs);
  }

  const api = {
    get enabled() { return enabled; },
    get preferred() { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } },

    enable() {
      if (!init()) return false;
      ctx.resume();
      const t = now();
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.9, t + 1.2);
      padBus.gain.cancelScheduledValues(t);
      padBus.gain.setValueAtTime(padBus.gain.value, t);
      padBus.gain.linearRampToValueAtTime(0.55, t + 3);
      enabled = true;
      try { localStorage.setItem(KEY, 'on'); } catch {}
      window.dispatchEvent(new CustomEvent('rumor:sound', { detail: true }));
      return true;
    },

    disable() {
      enabled = false;
      try { localStorage.setItem(KEY, 'off'); } catch {}
      if (ctx) {
        const t = now();
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0, t + 0.5);
      }
      window.dispatchEvent(new CustomEvent('rumor:sound', { detail: false }));
    },

    toggle() { return enabled ? (api.disable(), false) : api.enable(); },

    tick(n) { if (enabled) bell(SCALE[Math.max(0, Math.min(11, n - 1))], 0.05 + n * 0.006, 1.8); },

    strike() {
      if (!enabled) return;
      boom();
      swoosh(1.4, 0.1, 300, 10000);
      bell(220, 0.12, 5);
      bell(329.63, 0.08, 5, 0.04);
      bell(554.37, 0.07, 5, 0.08);
      for (let i = 0; i < 26; i++) bell(1400 + Math.random() * 4200, 0.012 + Math.random() * 0.02, 0.9, 0.3 + Math.random() * 1.9);
      setChord(true);
      openFilter(2400, 900, 4);
    },

    reset() {
      if (!enabled) return;
      [1046.5, 783.99, 587.33, 440].forEach((f, i) => bell(f, 0.04, 1.4, i * 0.09));
      swoosh(1, 0.05, 6000, 500);
      setChord(false);
      openFilter(500, 420, 2);
    },

    shock() {
      if (!enabled) return;
      boom(140, 60, 0.25, 1.2);
      for (let i = 0; i < 8; i++) bell(1800 + Math.random() * 3000, 0.012, 0.7, Math.random() * 0.4);
    },

    blip(f = 2600, g = 0.012) {
      if (!enabled) return;
      const t = now();
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(g, t + 0.004);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(gn).connect(fxBus);
      o.start(t);
      o.stop(t + 0.1);
    },

    flare() { if (enabled) { bell(880, 0.04, 1.6); bell(1318.5, 0.025, 1.4, 0.05); for (let i = 0; i < 6; i++) bell(2200 + Math.random() * 2600, 0.008, 0.6, Math.random() * 0.3); } },

    chime() { if (enabled) { bell(659.25, 0.035, 1.2); bell(987.77, 0.025, 1.2, 0.06); } },

    // called every frame with the scene's state
    frame(spin, bright) {
      if (!enabled || !ctx) return;
      const t = now();
      glitter.gain.setTargetAtTime(Math.min(0.06, spin * 0.016), t, 0.15);
      if (t > filterLockUntil) pad.filter.frequency.setTargetAtTime(300 + bright * 520, t, 0.8);
    }
  };
  return api;
})();
