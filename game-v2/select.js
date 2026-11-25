import { C } from './core.js';
import { clamp, lerp, sstep, fmt } from './util.js';
import { makeTrolley, VARIANTS } from './models.js?v=green-fingers';
import { trolleyStats } from './trolley.js?v=green-fingers';
const T = C.T, $ = id => document.getElementById(id);

// Trolley select: each trolley waits somewhere ordinary in the world and the camera goes to it.
// Stops in the bottom plaza are reached with a slow crane move; to or from the top car park it cuts.
const ease = t => t * t * t * (t * (t * 6 - 15) + 10);

export class Select {
  constructor() {
    this.open = false; this.S = []; this.models = []; this.previews = new Map(); this.idx = 0;
    this.pos = new T.Vector3(); this.look = new T.Vector3(); this.focus = new T.Vector3(); this.tw = null; this.fade = 0; this.t = 0;
    this.light = {};
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
    this.S = C.game.level.previewStops(C.world).filter(st => C.game.canUseTrolley(st.key));
    this.models = this.S.map(st => {
      const preview = this.previews.get(st.key);
      if (preview) return preview;
      const m = makeTrolley(st.key), s = VARIANTS[st.key].scale; m.root.position.set(st.at.x, st.at.y + 0.5 * s + 0.01, st.at.z); m.root.rotation.y = st.yaw;
      if (st.key === 'pensioner') m.wheels[0].pivot.rotation.y = 0.6; // the wonky one
      else m.wheels.forEach((w, i) => { if (i < 2) w.pivot.rotation.y = (i ? -0.15 : 0.25); });
      m.root.visible = false; C.scene.add(m.root); m.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.previews.set(st.key, m);
      return m;
    });
  }
  show() {
    this.build(); this.open = true;
    const sel = C.game.selectedTrolley, i = this.S.findIndex(s => s.key === sel); this.idx = i < 0 ? 0 : i;
    if (C.trolley) C.trolley.vis.root.visible = false;
    C.shopping.hidden = true;
    this.snapTo(this.idx); this.panel();
    C.audio.setAmbience(this.S[this.idx].amb ?? C.game.level.ambience);
  }
  close(apply) {
    if (!this.open) return;
    this.open = false; this.tw = null; this.setFade(0);
    for (const m of this.models) m.root.visible = false;
    C.shopping.hidden = false;
    Object.assign(this.light, C.game.level.light); this.applyLight();
    C.audio.setAmbience(null);
    const G = C.game;
    if (apply) { G.progress.selected = this.S[this.idx].key; G.persist(); }
    G.ensureTrolley(); C.trolley.vis.root.visible = true;
  }
  releaseLevel() { this.open = false; this.setFade(0); this.previews.clear(); this.models = []; this.S = []; this.tw = null; }
  confirm() {
    if (!this.open) return;
    C.audio.init();
    C.audio.sfx('click'); this.close(true); C.game.startRun();
  }
  step(d) {
    if (!this.open || this.S.length < 2) return;
    const n = this.S.length, from = this.idx; this.idx = (this.idx + d + n) % n;
    C.audio.sfx('click');
    const a = this.S[from], b = this.S[this.idx];
    if (this.motion.matches) { this.tw = null; this.setFade(0); this.snapTo(this.idx); }
    else if (a.area === b.area && (!this.tw || this.tw.mode === 'pan')) {
      this.setFade(0); this.showModels(from, this.idx);
      this.tw = { mode: 'pan', t: 0, dur: 1.7, p0: this.pos.clone(), l0: this.look.clone(), f0: this.focus.clone() };
    } else this.tw = { mode: 'cut', t: 0, dur: 0.75, switched: false };
    this.panel(); C.audio.setAmbience(b.amb ?? C.game.level.ambience);
  }
  showModels(...indices) { this.models.forEach((model, index) => { model.root.visible = indices.includes(index); }); }
  snapTo(i) { const st = this.S[i]; this.showModels(i); this.pos.copy(st.cam); this.look.copy(st.look); this.focus.copy(st.at); Object.assign(this.light, st.light); this.applyLight(); }
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
      this.lerpLight(cur.light, Math.min(1, dt * 2.5));
      if (tw.t >= tw.dur) { this.tw = null; this.showModels(this.idx); Object.assign(this.light, cur.light); this.applyLight(); }
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
    const st = this.S[this.idx], V = VARIANTS[st.key], S = trolleyStats(st.key);
    $('selName').textContent = V.name; $('selBlurb').textContent = V.blurb;
    $('selStats').innerHTML = [['Speed', S.speed], ['Stability', S.stability], ['Handling', S.handling]].map(([n, v]) =>
      `<div class="sst"><span>${n}</span><span class="segs" role="img" aria-label="${n} ${v} out of 10">${'<i class="on"></i>'.repeat(v)}${'<i></i>'.repeat(10 - v)}</span></div>`).join('');
    const best = C.game.progress.best; $('bestLine').textContent = best ? `BEST ${fmt(best)}` : '';
    const count = this.S.length;
    for (const id of ['selPrev', 'selIdx', 'selNext', 'selKeys']) $(id).classList.toggle('hidden', count < 2);
    $('selIdx').textContent = `${this.idx + 1} / ${count}`;
  }
}
