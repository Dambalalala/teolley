import { C } from './core.js';
import { clamp, lerp, sstep, fmt } from './util.js';
import { makeTrolley, VARIANTS } from './models.js';
import { trolleyStats } from './trolley.js';
import { UNLOCKS } from './game.js';
const T = C.T, $ = id => document.getElementById(id);

// Trolley select: each trolley waits somewhere ordinary in the world and the camera goes to it.
// Stops in the bottom plaza are reached with a slow crane move; to or from the top car park it cuts.
const LIGHT = {
  neutral: { sun: 0.78, sunC: 0xfff0d8, hemi: 0.72, sky: 0xd8e6f4, gnd: 0x7a8a5a, fog: 0xd5dee6, near: 140, far: 900 },
  bright: { sun: 0.86, sunC: 0xfff3e0, hemi: 0.76, sky: 0xdce8f4, gnd: 0x7f8a60, fog: 0xd9e1e8, near: 150, far: 950 },
  dusty: { sun: 0.82, sunC: 0xffe4c0, hemi: 0.66, sky: 0xe4dfd2, gnd: 0x8a7a5a, fog: 0xd8d2c4, near: 110, far: 720 },
  soft: { sun: 0.74, sunC: 0xfff4e2, hemi: 0.78, sky: 0xdae6ee, gnd: 0x7a9a5a, fog: 0xd2dde2, near: 120, far: 800 },
  damp: { sun: 0.6, sunC: 0xe6eefc, hemi: 0.8, sky: 0xd0dbe8, gnd: 0x66765a, fog: 0xc9d3dc, near: 80, far: 560 },
};
function stops() {
  const W = C.world, B = (lx, lf, h = 0) => { const p = W.botToWorld(lx, lf); return { x: p.x, y: W.groundY(p.x, p.z) + h, z: p.z }; };
  const top = (x, z, h = 0) => ({ x, y: W.groundY(x, z) + h, z });
  return [
    { key: 'dave', area: 'top', amb: 'muzak', light: 'neutral', at: top(-8.4, 27.2), yaw: 2.35, cam: top(-5.5, 24.3, 1.25), look: top(-9.2, 28.2, 0.42) },
    { key: 'demon', area: 'bot', amb: 'carpark', light: 'bright', at: B(-2, 92), yaw: 2.6, cam: B(1.4, 88.9, 1.2), look: B(-2.8, 93.0, 0.4) },
    { key: 'tank', area: 'bot', amb: 'yard', light: 'dusty', at: B(52.6, 23.3), yaw: -2.3, cam: B(48.9, 19.7, 1.35), look: B(53.4, 24.2, 0.45) },
    { key: 'green', area: 'bot', amb: 'garden', light: 'soft', at: B(-52.0, 29.6), yaw: -0.6, cam: B(-49.0, 25.0, 1.25), look: B(-52.6, 30.7, 0.45) },
    { key: 'pensioner', area: 'bot', amb: 'pond', light: 'damp', at: B(-12.6, 33.0), yaw: 1.2, cam: B(-16.7, 29.7, 1.2), look: B(-11.7, 34.0, 0.32) },
  ];
}
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);

export class Select {
  constructor() {
    this.open = false; this.S = null; this.models = []; this.idx = 0;
    this.pos = new T.Vector3(); this.look = new T.Vector3(); this.focus = new T.Vector3(); this.tw = null; this.fade = 0; this.t = 0;
    this.light = { ...LIGHT.neutral };
    this.targetPos = new T.Vector3(); this.targetLook = new T.Vector3();
    this.mixColor = new T.Color(); this.targetColor = new T.Color();
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    $('selPrev').addEventListener('click', () => { C.audio.init(); this.step(-1); });
    $('selNext').addEventListener('click', () => { C.audio.init(); this.step(1); });
    $('bSelDone').addEventListener('click', () => this.confirm());
    // swipe left/right on the view to change trolley
    let swipe;
    const sel = $('select');
    sel.addEventListener('pointerdown', e => { if (e.target === sel) swipe = { id: e.pointerId, x: e.clientX }; });
    sel.addEventListener('pointerup', e => {
      if (swipe?.id === e.pointerId && Math.abs(e.clientX - swipe.x) > 50) this.step(e.clientX < swipe.x ? 1 : -1);
      swipe = null;
    });
    sel.addEventListener('pointercancel', () => { swipe = null; });
  }
  build() {
    if (this.S) return;
    this.S = stops();
    for (const st of this.S) {
      const m = makeTrolley(st.key), s = VARIANTS[st.key].scale; m.root.position.set(st.at.x, st.at.y + 0.5 * s + 0.01, st.at.z); m.root.rotation.y = st.yaw;
      if (st.key === 'pensioner') m.wheels[0].pivot.rotation.y = 0.6; // the wonky one
      else m.wheels.forEach((w, i) => { if (i < 2) w.pivot.rotation.y = (i ? -0.15 : 0.25); });
      m.root.visible = false; C.scene.add(m.root); m.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); this.models.push(m);
    }
  }
  show() {
    this.build(); this.open = true;
    const sel = C.game.save.sel, i = this.S.findIndex(s => s.key === sel); this.idx = i < 0 ? 0 : i;
    if (C.trolley) C.trolley.vis.root.visible = false;
    C.shopping.hidden = true;
    this.snapTo(this.idx); this.panel();
    C.audio.setAmbience(this.S[this.idx].amb);
  }
  close(apply) {
    if (!this.open) return;
    this.open = false; this.tw = null; this.setFade(0);
    for (const m of this.models) m.root.visible = false;
    C.shopping.hidden = false;
    Object.assign(this.light, LIGHT.neutral); this.applyLight();
    C.audio.setAmbience(null);
    const G = C.game;
    if (apply) { G.save.sel = this.S[this.idx].key; G.persist(); }
    G.ensureTrolley(); C.trolley.vis.root.visible = true;
  }
  confirm() {
    const st = this.S[this.idx]; C.audio.init();
    if (!C.game.save.unlocked[st.key]) { C.audio.sfx('sting'); const l = $('selLock'); l.classList.remove('nudge'); void l.offsetWidth; l.classList.add('nudge'); return; }
    C.audio.sfx('click'); this.close(true); C.game.startRun();
  }
  step(d) {
    if (!this.open) return;
    const n = this.S.length, from = this.idx; this.idx = (this.idx + d + n) % n;
    C.audio.sfx('click');
    const a = this.S[from], b = this.S[this.idx];
    if (this.motion.matches) { this.tw = null; this.setFade(0); this.snapTo(this.idx); }
    else if (a.area === b.area && (!this.tw || this.tw.mode === 'pan')) {
      this.setFade(0); this.showModels(from, this.idx);
      this.tw = { mode: 'pan', t: 0, dur: 1.7, p0: this.pos.clone(), l0: this.look.clone(), f0: this.focus.clone() };
    } else this.tw = { mode: 'cut', t: 0, dur: 0.75, switched: false };
    this.panel(); C.audio.setAmbience(b.amb);
  }
  showModels(...indices) { this.models.forEach((model, index) => { model.root.visible = indices.includes(index); }); }
  snapTo(i) { const st = this.S[i]; this.showModels(i); this.pos.copy(st.cam); this.look.copy(st.look); this.focus.copy(st.at); Object.assign(this.light, LIGHT[st.light]); this.applyLight(); }
  // the view each stop settles into, with a slow drift round the trolley
  pose(i, outPos, outLook) {
    const st = this.S[i], a = Math.sin(this.t * 0.22) * 0.09, cx = st.cam.x - st.at.x, cz = st.cam.z - st.at.z;
    outPos.set(st.at.x + cx * Math.cos(a) - cz * Math.sin(a), st.cam.y + Math.sin(this.t * 0.31) * 0.06, st.at.z + cx * Math.sin(a) + cz * Math.cos(a));
    outLook.copy(st.look);
  }
  update(dt) {
    if (!this.open) return;
    if (!this.motion.matches) this.t += dt;
    const cur = this.S[this.idx], m = this.models[this.idx];
    if (!this.motion.matches) m.root.rotation.y += dt * 0.32;
    const P = this.targetPos, L = this.targetLook;
    this.pose(this.idx, P, L);
    const tw = this.tw;
    if (!tw) { this.pos.copy(P); this.look.copy(L); this.focus.copy(cur.at); }
    else if (tw.mode === 'pan') {
      tw.t += dt; const k = ease(clamp(tw.t / tw.dur, 0, 1));
      this.pos.lerpVectors(tw.p0, P, k); this.pos.y += Math.sin(Math.PI * k) * Math.min(9, tw.p0.distanceTo(P) * 0.1);
      this.look.lerpVectors(tw.l0, L, k); this.focus.lerpVectors(tw.f0, cur.at, k);
      this.lerpLight(LIGHT[cur.light], Math.min(1, dt * 2.5));
      if (tw.t >= tw.dur) { this.tw = null; this.showModels(this.idx); Object.assign(this.light, LIGHT[cur.light]); this.applyLight(); }
    } else {
      tw.t += dt; const h = tw.dur / 2;
      if (tw.t < h) this.setFade(tw.t / h); else { if (!tw.switched) { tw.switched = true; this.snapTo(this.idx); C.camera.userData.snap = true; } this.setFade(1 - (tw.t - h) / h); }
      if (tw.switched) { this.pos.copy(P); this.look.copy(L); }
      if (tw.t >= tw.dur) { this.tw = null; this.setFade(0); }
    }
  }
  camera(cam) { cam.position.copy(this.pos); cam.lookAt(this.look); }
  setFade(v) { this.fade = v; $('fade').style.opacity = String(clamp(v, 0, 1)); }
  lerpLight(to, k) {
    const L = this.light; for (const n of ['sun', 'hemi', 'near', 'far']) L[n] = lerp(L[n], to[n], k);
    for (const n of ['sunC', 'sky', 'gnd', 'fog']) L[n] = this.mixColor.setHex(L[n]).lerp(this.targetColor.setHex(to[n]), k).getHex();
    this.applyLight();
  }
  applyLight() {
    const L = this.light, Lg = C.lights; if (!Lg) return;
    Lg.sun.intensity = L.sun; Lg.sun.color.setHex(L.sunC); Lg.hemi.intensity = L.hemi; Lg.hemi.color.setHex(L.sky); Lg.hemi.groundColor.setHex(L.gnd);
    C.scene.fog.color.setHex(L.fog); C.scene.fog.near = L.near; C.scene.fog.far = L.far;
  }
  panel() {
    const st = this.S[this.idx], V = VARIANTS[st.key], un = !!C.game.save.unlocked[st.key], S = trolleyStats(st.key);
    $('selName').textContent = V.name; $('selBlurb').textContent = V.blurb;
    $('selStats').innerHTML = [['Speed', S.speed], ['Stability', S.stability], ['Handling', S.handling]].map(([n, v]) =>
      `<div class="sst"><span>${n}</span><span class="segs" role="img" aria-label="${n} ${v} out of 10">${'<i class="on"></i>'.repeat(v)}${'<i></i>'.repeat(10 - v)}</span></div>`).join('');
    const lock = $('selLock'); lock.classList.toggle('hidden', un); lock.textContent = un ? '' : 'Locked. ' + UNLOCKS[st.key].need + '.';
    $('bSelDone').disabled = !un;
    const best = C.game.save.best; $('bestLine').textContent = best ? `BEST ${fmt(best)}` : '';
    $('selIdx').textContent = `${this.idx + 1} / ${this.S.length}`;
  }
}
