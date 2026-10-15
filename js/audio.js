/* Rumor audio: everything is synthesized live with Web Audio, no files.
 * A deep-house groove that changes with the concept, a countdown that builds,
 * and a proper drop at midnight. Nothing plays until the guest asks for sound.
 */
'use strict';

window.RumorAudio = (() => {
  const KEY = 'rumor-sound';
  let ctx = null, master, musicBus, musicFilter, fxBus, verbIn, duckBus;
  let enabled = false, playing = false, phase = 'idle';
  let timer = 0, nextTime = 0, step = 0;
  let noise = null;

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const now = () => ctx.currentTime;

  /* ---------------- concepts: same night, different room ---------------- */

  const SONGS = {
    // Midnight: classic NYC deep house, warm minor-ninth chords
    midnight: {
      bpm: 122, swing: 0.04, cutoff: 2200,
      chords: [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 52, 55, 59, 62], [55, 59, 62, 65, 69]],
      bass: [33, 29, 36, 31],
      kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], ghost: [7, 15],
      stab: [3, 10], bassSteps: [2, 6, 10, 14], stabWave: 'sawtooth'
    },
    // After Hours: slower, rounder, late-night
    afterhours: {
      bpm: 104, swing: 0.1, cutoff: 1400,
      chords: [[50, 53, 57, 60, 64], [55, 58, 62, 65, 69], [48, 51, 55, 58, 62], [53, 57, 60, 64, 67]],
      bass: [26, 31, 24, 29],
      kick: [0, 7, 10], clap: [8], hat: [2, 6, 10, 14], ghost: [3, 11, 13],
      stab: [0, 11], bassSteps: [0, 3, 7, 10], stabWave: 'triangle'
    },
    // Black Tie: brighter, piano-like stabs, a little swing
    blacktie: {
      bpm: 118, swing: 0.14, cutoff: 3400,
      chords: [[51, 55, 58, 62, 65], [48, 51, 55, 58, 62], [53, 56, 60, 63, 67], [46, 50, 53, 57, 60]],
      bass: [27, 24, 29, 22],
      kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], ghost: [14],
      stab: [2, 6, 11], bassSteps: [0, 6, 10], stabWave: 'triangle'
    }
  };
  let song = SONGS.midnight, pendingSong = null;

  /* ---------------- graph ---------------- */

  function impulse(sec, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
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
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);

    const verb = ctx.createConvolver();
    verb.buffer = impulse(2.4, 2.8);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.35;
    verbIn = ctx.createGain();
    verbIn.connect(verb).connect(verbOut).connect(master);

    // music runs through a low-pass that opens up when you're near the party
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 600;
    musicFilter.Q.value = 0.6;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.8;
    musicBus.connect(musicFilter).connect(master);
    // chords and bass pump under the kick
    duckBus = ctx.createGain();
    duckBus.connect(musicBus);

    fxBus = ctx.createGain();
    fxBus.gain.value = 0.9;
    fxBus.connect(master);

    const len = ctx.sampleRate;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  const env = (g, t, peak, a, dcy) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  };

  /* ---------------- instruments ---------------- */

  function kick(t, amp = 0.9, dest = musicBus) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    const g = ctx.createGain();
    env(g, t, amp, 0.003, 0.32);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + 0.4);
    // pump everything else
    duckBus.gain.cancelScheduledValues(t);
    duckBus.gain.setValueAtTime(0.35, t);
    duckBus.gain.linearRampToValueAtTime(1, t + 0.22);
  }

  function noiseHit(t, { type = 'highpass', freq = 8000, q = 0.7, amp = 0.1, dcy = 0.05, verb = 0, dest = musicBus }) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, amp, 0.002, dcy);
    s.connect(f).connect(g).connect(dest);
    if (verb) { const sg = ctx.createGain(); sg.gain.value = verb; g.connect(sg).connect(verbIn); }
    s.start(t, Math.random() * 0.5); s.stop(t + dcy + 0.05);
  }

  const hat = (t, amp = 0.06) => noiseHit(t, { freq: 8500, amp, dcy: 0.045 });
  const clap = t => { [0, 0.012, 0.024].forEach((o, i) => noiseHit(t + o, { type: 'bandpass', freq: 1500, q: 0.9, amp: i === 2 ? 0.22 : 0.12, dcy: i === 2 ? 0.16 : 0.02, verb: i === 2 ? 0.5 : 0 })); };

  function bass(t, midi, dur) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(520, t);
    f.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = ctx.createGain();
    env(g, t, 0.22, 0.006, dur);
    o.connect(f).connect(g).connect(duckBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function stab(t, notes, amp = 0.05, dur = 0.42, wave = song.stabWave) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(song.cutoff * 1.4, t);
    f.frequency.exponentialRampToValueAtTime(song.cutoff * 0.35, t + dur);
    const g = ctx.createGain();
    env(g, t, amp, 0.008, dur);
    f.connect(g).connect(duckBus);
    const send = ctx.createGain(); send.gain.value = 0.35; g.connect(send).connect(verbIn);
    notes.forEach(n => [-6, 6].forEach(det => {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.value = mtof(n + 12);
      o.detune.value = det;
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.05);
    }));
  }

  function pad(t, notes, dur, amp = 0.025) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(duckBus);
    const send = ctx.createGain(); send.gain.value = 0.5; g.connect(send).connect(verbIn);
    notes.forEach(n => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(n);
      o.detune.value = (Math.random() - 0.5) * 14;
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }

  /* ---------------- sequencer ---------------- */

  function schedule(s, t) {
    const bar = Math.floor(s / 16) % 4, k = s % 16;
    const sixteenth = 60 / song.bpm / 4;
    const chord = song.chords[bar];
    if (phase === 'build') {
      // just the chords and a rising hat while the countdown runs
      if (k === 0) pad(t, chord, sixteenth * 16);
      if (k % 2 === 0) hat(t, 0.02 + (s % 64) / 64 * 0.04);
      return;
    }
    if (song.kick.includes(k)) kick(t);
    if (song.clap.includes(k)) clap(t);
    if (song.hat.includes(k)) hat(t, 0.07);
    if (song.ghost.includes(k)) hat(t, 0.025);
    if (song.bassSteps.includes(k)) bass(t, song.bass[bar] + (k > 8 && bar % 2 ? 7 : 0), sixteenth * 1.6);
    if (song.stab.includes(k)) stab(t, chord);
    if (k === 0) pad(t, chord, sixteenth * 16, 0.018);
  }

  function tickLoop() {
    const sixteenth = 60 / song.bpm / 4;
    while (nextTime < now() + 0.12) {
      const swing = step % 2 ? sixteenth * song.swing : 0;
      schedule(step, nextTime + swing);
      nextTime += sixteenth;
      step++;
      // concept changes land on the next bar
      if (pendingSong && step % 16 === 0) { song = pendingSong; pendingSong = null; }
    }
  }

  function startMusic(p) {
    phase = p;
    if (playing) return;
    playing = true;
    step = 0;
    nextTime = now() + 0.05;
    timer = setInterval(tickLoop, 25);
  }
  function stopMusic() { clearInterval(timer); playing = false; }

  /* ---------------- api ---------------- */

  const api = {
    get enabled() { return enabled; },
    get preferred() { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } },

    enable(p = 'groove') {
      if (!init()) return false;
      ctx.resume();
      const t = now();
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.85, t + 0.8);
      enabled = true;
      startMusic(phase === 'groove' ? 'groove' : p);
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
        master.gain.linearRampToValueAtTime(0, t + 0.4);
        setTimeout(() => { if (!enabled) stopMusic(); }, 450);
      }
      window.dispatchEvent(new CustomEvent('rumor:sound', { detail: false }));
    },

    toggle() { return enabled ? (api.disable(), false) : api.enable(); },

    // 3, 2, 1: a soft rim tick that climbs, with the filter slowly opening
    count(n) {
      if (!enabled) return;
      const t = now();
      if (n > 0) {
        noiseHit(t, { type: 'bandpass', freq: 1800 + (3 - n) * 400, q: 6, amp: 0.18, dcy: 0.06, dest: fxBus, verb: 0.4 });
        const o = ctx.createOscillator();
        o.frequency.value = mtof(76 + (3 - n) * 2);
        const g = ctx.createGain();
        env(g, t, 0.05, 0.004, 0.18);
        o.connect(g).connect(fxBus);
        o.start(t); o.stop(t + 0.25);
        musicFilter.frequency.cancelScheduledValues(t);
        musicFilter.frequency.setTargetAtTime(500 + (3 - n) * 500, t, 0.3);
      }
    },

    // the drop: a riser lands on a big kick, a chord hit, and the groove arrives
    drop() {
      if (!enabled) return;
      const t = now();
      kick(t, 1.1, fxBus);
      stab(t, song.chords[0], 0.09, 1.4);
      noiseHit(t, { type: 'lowpass', freq: 1200, amp: 0.25, dcy: 1.4, dest: fxBus, verb: 0.6 });
      const sub = ctx.createOscillator();
      sub.frequency.setValueAtTime(60, t);
      sub.frequency.exponentialRampToValueAtTime(38, t + 1.2);
      const g = ctx.createGain();
      env(g, t, 0.5, 0.01, 1.5);
      sub.connect(g).connect(fxBus);
      sub.start(t); sub.stop(t + 1.6);
      musicFilter.frequency.cancelScheduledValues(t);
      musicFilter.frequency.setValueAtTime(400, t);
      musicFilter.frequency.exponentialRampToValueAtTime(9000, t + 1.6);
      // start the full groove on the next downbeat
      phase = 'groove';
      step = 0;
      nextTime = t + 60 / song.bpm;
      if (!playing) startMusic('groove');
    },

    setConcept(name) {
      const s = SONGS[name] || SONGS.midnight;
      if (!ctx || !playing) { song = s; return; }
      pendingSong = s;
      if (!enabled) return;
      // a quick filter sweep carries you between rooms
      const t = now();
      musicFilter.frequency.cancelScheduledValues(t);
      musicFilter.frequency.setValueAtTime(musicFilter.frequency.value, t);
      musicFilter.frequency.exponentialRampToValueAtTime(500, t + 0.25);
      musicFilter.frequency.exponentialRampToValueAtTime(9000, t + 1.4);
    },

    blip(f = 2600, g = 0.01) {
      if (!enabled) return;
      const t = now();
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const gn = ctx.createGain();
      env(gn, t, g, 0.004, 0.07);
      o.connect(gn).connect(fxBus);
      o.start(t); o.stop(t + 0.1);
    },

    // a soft electric-piano chord, for confirmations
    chime() {
      if (!enabled) return;
      const t = now();
      [72, 76, 79].forEach((n, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = mtof(n);
        const g = ctx.createGain();
        env(g, t + i * 0.03, 0.035, 0.005, 0.9);
        o.connect(g).connect(fxBus);
        const sg = ctx.createGain(); sg.gain.value = 0.3; g.connect(sg).connect(verbIn);
        o.start(t + i * 0.03); o.stop(t + 1.1);
      });
    },

    // a short sting per performer: house, jazz, disco, and a room full of people
    motif(i) {
      if (!enabled) return;
      const t = now(), b = 60 / 122;
      if (i === 0) {
        [0, 1, 2, 3].forEach(k => kick(t + k * b * 0.5, 0.5, fxBus));
        stab(t + b * 0.75, song.chords[0], 0.06, 0.4); stab(t + b * 1.25, song.chords[1], 0.05, 0.5);
      } else if (i === 1) {
        [45, 47, 48, 50].forEach((n, k) => {
          const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(n);
          const g = ctx.createGain(); env(g, t + k * 0.24, 0.16, 0.01, 0.22);
          o.connect(g).connect(fxBus); o.start(t + k * 0.24); o.stop(t + k * 0.24 + 0.3);
          noiseHit(t + k * 0.24 + (k % 2 ? 0.08 : 0), { freq: 9000, amp: 0.05, dcy: 0.25, dest: fxBus, verb: 0.3 });
        });
      } else if (i === 2) {
        [0, 1, 2, 3].forEach(k => { bass(t + k * 0.2, 33 + (k % 2 ? 12 : 0), 0.16); noiseHit(t + k * 0.2 + 0.1, { freq: 7000, amp: 0.08, dcy: 0.12, dest: fxBus }); });
        stab(t, [69, 72, 76], 0.05, 0.8, 'square');
      } else {
        const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.7;
        f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1500, t + 0.6);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        s.connect(f).connect(g).connect(fxBus); const sg = ctx.createGain(); sg.gain.value = 0.5; g.connect(sg).connect(verbIn);
        s.start(t); s.stop(t + 1.7);
      }
    },

    flare() { if (enabled) { stab(now(), song.chords[0], 0.05, 0.8); noiseHit(now(), { freq: 6000, amp: 0.05, dcy: 0.3, dest: fxBus, verb: 0.5 }); } },

    // called every frame: the music opens up near the party and muffles in the quiet sections
    frame(spin, bright) {
      if (!enabled || !ctx || phase !== 'groove') return;
      const t = now();
      if (t < musicFilterLock) return;
      musicFilter.frequency.setTargetAtTime(700 + Math.pow(Math.max(0, Math.min(1, bright)), 2) * 9000, t, 0.5);
    }
  };
  let musicFilterLock = 0;
  const origDrop = api.drop;
  api.drop = () => { musicFilterLock = (ctx ? now() : 0) + 1.8; origDrop(); };
  const origConcept = api.setConcept;
  api.setConcept = n => { if (ctx) musicFilterLock = now() + 1.5; origConcept(n); };
  return api;
})();
