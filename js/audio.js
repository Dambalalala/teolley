import { C } from './core.js';
import { clamp } from './util.js';

// Everything is synthesised: rattling wire, squeaky casters, a scanner beep, overdramatic crashes,
// and supermarket muzak that turns into chase music as the trolley speeds up.
export class Audio {
  constructor() { this.ok = false; this.muted = false; this.intensity = 0; this.int = 0; this.voice = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const A = this.ctx = new AC();
      this.master = A.createGain(); this.master.gain.value = this.muted ? 0 : 0.55;
      const comp = A.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.2;
      this.master.connect(comp); comp.connect(A.destination);
      this.sfxBus = A.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
      this.musBus = A.createGain(); this.musBus.gain.value = 0.42;
      this.musLP = A.createBiquadFilter(); this.musLP.type = 'lowpass'; this.musLP.frequency.value = 20000; this.musBus.connect(this.musLP); this.musLP.connect(this.master);
      // a little room so things don't sound bone dry
      const dl = A.createDelay(0.5); dl.delayTime.value = 0.13; const fb = A.createGain(); fb.gain.value = 0.22; const wet = A.createGain(); wet.gain.value = 0.18; const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      this.sfxBus.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(this.master); this.verb = dl;
      const n = A.createBuffer(1, A.sampleRate * 2, A.sampleRate), d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = n;
      const loop = (type, f, q) => { const s = A.createBufferSource(); s.buffer = n; s.loop = true; const fl = A.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = A.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.sfxBus); s.start(0, Math.random()); return { f: fl, g }; };
      this.wind = loop('lowpass', 400, 0.5); this.rumble = loop('bandpass', 260, 0.9); this.rattle = loop('highpass', 2600, 0.7);
      this.water = loop('lowpass', 600, 0.7);
      // squeak and alarm oscillators
      const sq = A.createOscillator(); sq.type = 'sine'; sq.frequency.value = 2100; const sqg = A.createGain(); sqg.gain.value = 0; const vib = A.createOscillator(); vib.frequency.value = 17; const vg = A.createGain(); vg.gain.value = 160; vib.connect(vg); vg.connect(sq.frequency); sq.connect(sqg); sqg.connect(this.sfxBus); sq.start(); vib.start(); this.squeak = { o: sq, g: sqg };
      const al = A.createOscillator(); al.type = 'square'; al.frequency.value = 1200; const alf = A.createBiquadFilter(); alf.type = 'lowpass'; alf.frequency.value = 2400; const alg = A.createGain(); alg.gain.value = 0; al.connect(alf); alf.connect(alg); alg.connect(this.sfxBus); al.start(); this.alarmO = { o: al, g: alg };
      this.ok = true; this.startMusic();
    } catch (e) { this.ok = false; }
  }
  setMuted(m) { this.muted = m; if (this.ok) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.03); }
  // ---------- one-shots ----------
  tone(f, dur, type = 'sine', vol = 0.1, f2 = 0, when = 0, bus) { const A = this.ctx, t = A.currentTime + when, o = A.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); const g = A.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.05); }
  hiss(dur, vol, f, q = 0.8, type = 'bandpass', when = 0, f2 = 0) { const A = this.ctx, t = A.currentTime + when, s = A.createBufferSource(); s.buffer = this.noise; const fl = A.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q; const g = A.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl); fl.connect(g); g.connect(this.sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05); }
  clang(k = 1, when = 0) { const base = 380 + Math.random() * 160, parts = [1, 2.51, 4.07, 5.93, 8.2]; parts.forEach((p, i) => this.tone(base * p, (0.5 + Math.random() * 0.5) * (1.4 - i * 0.2), 'sine', 0.05 * k / (1 + i * 0.6), 0, when)); this.hiss(0.08, 0.12 * k, 3200, 0.7, 'bandpass', when); }
  sfx(name, k = 1) {
    if (!this.ok || this.muted) return; k = clamp(k, 0, 1.5);
    switch (name) {
      case 'beep': this.tone(2630, 0.09, 'square', 0.035); break;
      case 'beep2': this.tone(2630, 0.07, 'square', 0.03); this.tone(2630, 0.07, 'square', 0.03, 0, 0.11); break;
      case 'kaching': this.tone(1318, 0.5, 'triangle', 0.06); this.tone(2637, 0.4, 'sine', 0.04, 0, 0.02); for (let i = 0; i < 5; i++) this.tone(3500 + Math.random() * 2000, 0.05, 'sine', 0.025, 0, 0.12 + i * 0.045); this.hiss(0.05, 0.08, 4000, 1, 'highpass'); break;
      case 'clang': this.clang(k); break;
      case 'clatter': for (let i = 0; i < 4; i++) this.clang(0.35 * k, i * 0.045 + Math.random() * 0.02); break;
      case 'bonk': this.tone(190, 0.22, 'sine', 0.16 * k, 110); this.hiss(0.12, 0.1 * k, 500, 0.8, 'lowpass'); break;
      case 'thwop': this.tone(420, 0.12, 'triangle', 0.08 * k, 220); break;
      case 'thud': this.tone(90, 0.25, 'sine', 0.2 * k, 50); this.hiss(0.15, 0.12 * k, 260, 0.7, 'lowpass'); break;
      case 'item': this.tone(220 + Math.random() * 120, 0.08, 'triangle', 0.05 * k, 140); break;
      case 'squeak': this.tone(1900 + Math.random() * 500, 0.16, 'sine', 0.025 * k, 2300); break;
      case 'kerb': this.clang(0.7 * k); this.tone(120, 0.15, 'sine', 0.15 * k, 70); break;
      case 'pothole': this.tone(80, 0.2, 'sine', 0.2 * k, 45); this.clang(0.4 * k); break;
      case 'hop': this.tone(260, 0.18, 'triangle', 0.06, 520); this.clang(0.25); break;
      case 'land': this.tone(110, 0.2, 'sine', 0.16 * k, 60); for (let i = 0; i < 3; i++) this.clang(0.3 * k, i * 0.05); break;
      case 'glass': this.hiss(0.5, 0.2, 5200, 0.6, 'highpass'); for (let i = 0; i < 9; i++) this.tone(2800 + Math.random() * 3800, 0.15 + Math.random() * 0.25, 'sine', 0.02, 0, Math.random() * 0.25); break;
      case 'splash': this.hiss(0.9, 0.28, 1800, 0.6, 'lowpass', 0, 300); this.tone(140, 0.4, 'sine', 0.12, 60); break;
      case 'quack': for (let i = 0; i < 3; i++) { this.tone(620, 0.12, 'sawtooth', 0.03, 380, i * 0.22); this.hiss(0.1, 0.03, 900, 3, 'bandpass', i * 0.22); } break;
      case 'oi': this.tone(380, 0.18, 'sawtooth', 0.035, 260); this.hiss(0.14, 0.03, 1100, 4); break;
      case 'gasp': this.hiss(0.22, 0.04, 1500, 2, 'bandpass', 0, 2600); break;
      case 'flash': this.hiss(0.04, 0.12, 6000, 0.8, 'highpass'); this.tone(5200, 0.4, 'sine', 0.02, 9000, 0.03); break;
      case 'task': this.tone(988, 0.22, 'sine', 0.07); this.tone(1319, 0.4, 'sine', 0.06, 0, 0.1); this.tone(1976, 0.3, 'sine', 0.02, 0, 0.1); break;
      case 'tick': this.tone(1568, 0.12, 'sine', 0.045); break;
      case 'wheel': this.tone(1500, 0.3, 'sine', 0.05, 900); this.sfx('clatter'); break;
      case 'trick': this.tone(880, 0.08, 'triangle', 0.04); this.tone(1320, 0.12, 'triangle', 0.035, 0, 0.06); break;
      case 'click': this.tone(1400, 0.04, 'square', 0.03); break;
      case 'push': this.hiss(0.09, 0.025, 700, 1.2, 'bandpass'); break;
      case 'crash': {
        // absurdly dramatic: boom + orchestra hit + cymbal + metal
        const A = this.ctx; this.tone(70, 1.6, 'sine', 0.35, 28); this.hiss(2.2, 0.16, 7000, 0.5, 'highpass');
        for (const f of [130.8, 155.6, 196, 261.6, 311.1, 392]) { const o = A.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, A.currentTime); lp.frequency.exponentialRampToValueAtTime(400, A.currentTime + 1.4); const g = A.createGain(); g.gain.setValueAtTime(0.0001, A.currentTime); g.gain.exponentialRampToValueAtTime(0.05, A.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + 1.6); o.connect(lp); lp.connect(g); g.connect(this.sfxBus); o.start(); o.stop(A.currentTime + 1.7); }
        this.sfx('clatter', 1.2); break;
      }
      case 'sting': for (const [f, w] of [[392, 0], [370, 0.32], [349, 0.64], [330, 0.96]]) this.tone(f, w === 0.96 ? 1.1 : 0.3, 'square', 0.04, w === 0.96 ? 300 : 0, w); break; // wah-wah-wah-waaah
      case 'fanfare': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i === 3 ? 0.8 : 0.16, 'square', 0.035, 0, i * 0.12)); break;
    }
  }
  alarm(on) { if (!this.ok) return; const t = this.ctx.currentTime; this.alarmO.g.gain.setTargetAtTime(on && !this.muted ? 0.018 : 0, t, 0.05); if (on) this.alarmO.o.frequency.setValueAtTime(Math.sin(t * 12) > 0 ? 1150 : 1500, t); }
  // ---------- ambience for the trolley select spots ----------
  setAmbience(kind) { this.amb = kind || null; this.ambT = 0.6; }
  ambience(dt) {
    const A = this.ctx, t = A.currentTime, k = this.amb, on = this.muted ? 0 : 1;
    // wind, distant traffic, water
    const lv = { muzak: [0.012, 0.035, 0], carpark: [0.018, 0.055, 0], yard: [0.034, 0.025, 0], pond: [0.04, 0.008, 0.035], garden: [0.022, 0.02, 0] }[k] || [0, 0, 0];
    this.wind.g.gain.setTargetAtTime(lv[0] * on, t, 0.6); this.wind.f.frequency.setTargetAtTime(k === 'pond' ? 560 : 360, t, 0.6);
    this.rumble.g.gain.setTargetAtTime(lv[1] * on, t, 0.6); this.rumble.f.frequency.setTargetAtTime(130, t, 0.6);
    this.water.g.gain.setTargetAtTime(lv[2] * on, t, 0.6);
    this.rattle.g.gain.setTargetAtTime(0, t, 0.1); this.squeak.g.gain.setTargetAtTime(0, t, 0.1);
    // the shop's muzak, heard through the window at Spendwells; nothing elsewhere
    this.musLP.frequency.setTargetAtTime(k === 'muzak' ? 650 : 20000, t, 0.3); this.musBus.gain.setTargetAtTime(k === 'muzak' ? 0.55 : 0, t, 0.5);
    this.intensity = 0; this.int += (0 - this.int) * Math.min(1, dt);
    this.ambT -= dt; if (this.ambT > 0 || this.muted) return;
    if (k === 'pond') { const n = 1 + Math.floor(Math.random() * 3), f = 560 + Math.random() * 160; for (let i = 0; i < n; i++) { this.tone(f, 0.11, 'sawtooth', 0.014, f * 0.62, i * 0.2); this.hiss(0.09, 0.012, 900, 3, 'bandpass', i * 0.2); } this.ambT = 1.5 + Math.random() * 4; }
    else if (k === 'yard') { for (let i = 0; i < 4; i++) this.tone(1040, 0.3, 'square', 0.012, 0, i * 0.6); if (Math.random() < 0.4) this.clang(0.12, 2.6); this.ambT = 7 + Math.random() * 7; }
    else if (k === 'carpark') { if (Math.random() < 0.6) { this.tone(80, 0.2, 'sine', 0.06, 45); this.hiss(0.1, 0.03, 300, 0.7, 'lowpass'); } else for (let i = 0; i < 6; i++) this.clang(0.06, i * 0.05 + Math.random() * 0.03); this.ambT = 3 + Math.random() * 6; }
    else if (k === 'garden') { // a blackbird somewhere, and the wind chimes on the display stand
      if (Math.random() < 0.6) { const f0 = 1800 + Math.random() * 700; for (let i = 0; i < 4 + Math.floor(Math.random() * 4); i++) { const f = f0 * (0.8 + Math.random() * 0.5); this.tone(f, 0.1 + Math.random() * 0.12, 'sine', 0.012, f * (0.85 + Math.random() * 0.3), i * 0.13); } }
      else { const notes = [1568, 1760, 2093, 2349, 2637]; for (let i = 0; i < 4; i++) this.tone(notes[Math.floor(Math.random() * 5)], 1.4, 'sine', 0.008, 0, i * (0.18 + Math.random() * 0.25)); }
      this.ambT = 2.2 + Math.random() * 4; }
    else if (k === 'muzak') { if (Math.random() < 0.5) for (let i = 0; i < 5; i++) this.clang(0.05, i * 0.06 + Math.random() * 0.03); this.ambT = 5 + Math.random() * 7; }
    else this.ambT = 2;
  }
  // continuous sounds driven by the trolley
  update(dt, st) {
    if (!this.ok) return; const A = this.ctx, t = A.currentTime, sp = st.speed || 0;
    if (this.amb) return this.ambience(dt);
    this.musLP.frequency.setTargetAtTime(20000, t, 0.3); this.musBus.gain.setTargetAtTime(0.42, t, 0.4);
    const on = st.active && !this.muted;
    this.wind.g.gain.setTargetAtTime(on ? Math.min(0.08, sp * sp * 0.00018 + (st.air ? 0.01 : 0)) : 0, t, 0.15); this.wind.f.frequency.setTargetAtTime(300 + sp * 35, t, 0.2);
    const ground = st.wheels > 0 ? 1 : 0;
    this.rumble.g.gain.setTargetAtTime(on ? ground * Math.min(0.12, sp * 0.007) * (st.surface === 'pave' ? 1.4 : 1) : 0, t, 0.06); this.rumble.f.frequency.setTargetAtTime(180 + sp * 14, t, 0.1);
    const rat = on ? ground * Math.min(0.07, sp * 0.003 + st.bump * 0.05) * (0.6 + 0.8 * Math.random()) : 0; this.rattle.g.gain.setTargetAtTime(rat, t, 0.02);
    const sq = on ? (st.squeak || 0) : 0; this.squeak.g.gain.setTargetAtTime(sq * 0.02, t, 0.05); this.squeak.o.frequency.setTargetAtTime(1900 + Math.sin(t * 3) * 300, t, 0.1);
    this.water.g.gain.setTargetAtTime(on && st.wet ? 0.09 : 0, t, 0.1);
    this.intensity = st.active ? clamp((sp - 2.5) / 15, 0, 1) : 0.05; this.int += (this.intensity - this.int) * Math.min(1, dt * 1.2);
  }
  // ---------- music ----------
  startMusic() {
    const A = this.ctx; this.bpm = 116; this.step = 0; this.next = A.currentTime + 0.1;
    this.layers = {}; for (const k of ['keys', 'bass', 'drums', 'lead', 'stab']) { const g = A.createGain(); g.gain.value = 0; g.connect(this.musBus); this.layers[k] = g; }
    this.timer = setInterval(() => this.schedule(), 40);
  }
  schedule() {
    if (!this.ok) return; const A = this.ctx, I = this.int, L = this.layers, t0 = A.currentTime;
    const lv = (k, v) => L[k].gain.setTargetAtTime(v, t0, 0.4);
    lv('keys', 0.9 - I * 0.35); lv('bass', clamp((I - 0.12) * 3, 0, 1) * 0.9); lv('drums', clamp((I - 0.3) * 3, 0, 1)); lv('lead', clamp((I - 0.6) * 3, 0, 1) * 0.6); lv('stab', clamp((I - 0.82) * 5, 0, 1) * 0.6);
    const spb = 60 / this.bpm / 4;
    // I-vi-ii-V in C: chords per bar
    const CH = [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]];
    const BASS = [36, 33, 38, 31];
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    while (this.next < A.currentTime + 0.12) {
      const st = this.step % 64, bar = Math.floor(st / 16), s = st % 16, t = this.next, ch = CH[bar];
      // keys: bossa comping
      if (s === 0 || s === 6 || s === 10) for (const m of ch) this.note(mtof(m), t, spb * (s === 0 ? 5 : 3), 'ep', L.keys, 0.05);
      // bass: root and fifth
      if (s % 4 === 0 || (I > 0.5 && s % 2 === 0)) { const m = BASS[bar] + (s === 8 ? 7 : (s === 12 && I > 0.4 ? 12 : 0)); this.note(mtof(m), t, spb * 1.8, 'bass', L.bass, 0.13); }
      // drums
      if (s % 8 === 0 || (I > 0.7 && s === 10)) this.drum('kick', t, L.drums); if (s === 4 || s === 12) this.drum('snare', t, L.drums);
      if (s % 2 === 0 || I > 0.65) this.drum('hat', t, L.drums, s % 4 === 2 ? 1 : 0.6);
      // lead: arpeggio up the chord
      if (s % 2 === 0) { const m = ch[(s / 2) % 4] + 12 + (s % 8 === 6 ? 12 : 0); this.note(mtof(m), t, spb * 1.6, 'lead', L.lead, 0.05); }
      if (s === 2 || s === 7 || s === 11) for (const m of ch.slice(0, 3)) this.note(mtof(m + 12), t, spb * 0.9, 'stab', L.stab, 0.04);
      this.step++; this.next += spb;
    }
  }
  note(f, t, dur, kind, bus, vol) {
    const A = this.ctx, o = A.createOscillator(), g = A.createGain();
    if (kind === 'ep') { o.type = 'sine'; const m = A.createOscillator(), mg = A.createGain(); m.frequency.value = f * 2; mg.gain.value = f * 0.6; m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + dur + 0.1); }
    else if (kind === 'bass') o.type = 'triangle'; else if (kind === 'lead') o.type = 'square'; else o.type = 'sawtooth';
    o.frequency.value = f;
    let out = o;
    if (kind === 'lead' || kind === 'stab') { const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'lead' ? 2200 : 1800; o.connect(lp); out = lp; }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  drum(kind, t, bus, k = 1) {
    const A = this.ctx;
    if (kind === 'kick') { const o = A.createOscillator(), g = A.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.25); }
    else { const s = A.createBufferSource(); s.buffer = this.noise; const f = A.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800; const g = A.createGain(); const d = kind === 'hat' ? 0.04 : 0.16; g.gain.setValueAtTime((kind === 'hat' ? 0.05 : 0.16) * k, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + d + 0.02); }
  }

}
