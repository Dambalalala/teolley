import RAPIER from './rapier.js';
import { C } from './core.js';
import { buildTextures } from './textures.js';
import { buildWorldBase, flushStatics } from './world.js';
import { buildScenery } from './scenery.js';
import { buildExtras } from './extras.js';
import { FX } from './fx.js';
import { Props } from './props.js';
import { Shopping } from './shopping.js';
import { Audio } from './audio.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { Cam } from './camera.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import { Select } from './select.js';

const T = C.T, $ = id => document.getElementById(id);
function fail(msg) { $('loading').classList.add('hidden'); const e = $('err'); e.textContent = msg; e.classList.remove('hidden'); }
const DT = 1 / 120;

async function boot() {
  if (!T) return fail("The 3D engine didn't load. Check your connection and reload.");
  try { await RAPIER.init(); } catch (e) { return fail('The physics engine could not start in this browser (' + (e && e.message || e) + ').'); }
  // load the fonts before anything draws with them (sign textures and the HUD canvas can't wait for a swap)
  try { await Promise.race([Promise.all(['16px "Press Start 2P"', '16px Silkscreen', '700 16px Silkscreen', '16px Tiny5', '16px Bungee', '700 16px "Barlow Condensed"', '600 16px "Barlow Condensed"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 3000))]); } catch (e) { /* draw with fallbacks */ }
  C.RAPIER = RAPIER;
  C.phys = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); C.phys.timestep = DT; C.phys.numSolverIterations = 6;
  C.events = new RAPIER.EventQueue(true);
  // renderer: low-res, no AA, vertex-lit materials: a lost PS2 game
  const canvas = $('gl');
  const renderer = C.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  const scene = C.scene = new T.Scene();
  scene.fog = new T.Fog(0xd5dee6, 140, 900);
  const camera = C.camera = new T.PerspectiveCamera(62, 1, 0.1, 4000);
  const hemi = new T.HemisphereLight(0xd8e6f4, 0x7a8a5a, 0.72); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff0d8, 0.78); sun.castShadow = true;
  const touchy = matchMedia('(pointer: coarse)').matches; C.touch = touchy; if (touchy) document.body.classList.add('touch');
  sun.shadow.mapSize.set(touchy ? 1024 : 2048, touchy ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 260 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target); C.lights = { hemi, sun }; const SUN = new T.Vector3(0.55, 0.78, 0.3).normalize();
  buildTextures();
  buildWorldBase(scene);
  buildScenery(scene);
  buildExtras(scene);
  flushStatics(scene);
  C.fx = new FX(); C.props = new Props(); C.shopping = new Shopping(); C.audio = new Audio(); C.game = new Game();
  C.audio.muted = !!C.game.save.muted;
  C.input = new Input(); C.cam = new Cam(camera); C.hud = new HUD($('hud')); C.ui = new UI(); C.select = new Select();
  // compile the select screen's trolleys up front so opening it doesn't stall
  C.select.build(); for (const m of C.select.models) m.root.visible = true; try { renderer.compile(scene, camera); } catch (e) {} for (const m of C.select.models) m.root.visible = false;
  // settle the props before the first frame
  for (let i = 0; i < 60; i++) C.phys.step(C.events); C.events.drainCollisionEvents(() => {}); C.events.drainContactForceEvents(() => {});
  C.game.toSelect();
  $('loading').classList.add('hidden');
  // ---------- sizing ----------
  let prCur = Math.min(window.devicePixelRatio || 1, 1), prMax = prCur, ftAvg = 16, ftT = 0;
  const resize = () => { const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight); renderer.setPixelRatio(prCur); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); C.hud.resize(w, h); C.fx.setScale(renderer.getDrawingBufferSize(new T.Vector2()).y / (2 * Math.tan(camera.fov * Math.PI / 360))); };
  resize(); addEventListener('resize', resize);
  // ---------- loop ----------
  let last = performance.now(), acc = 0, slow = 0, cullT = 0;
  // hide things well behind the camera or far off, so busy stretches of the hill stay light
  const cBox = new T.Box3(), cV = new T.Vector3(), cS = new T.Vector3(), cF = new T.Vector3();
  const cull = () => {
    camera.getWorldDirection(cF);
    for (const o of scene.children) {
      if (o.isLight || o.isCamera || o.isPoints || o === sun.target || o.userData.noCull) continue;
      let d = o.userData.cr;
      if (!d) { cBox.setFromObject(o); if (cBox.isEmpty()) { o.userData.cr = { skip: true }; continue; } cBox.getCenter(cV); cBox.getSize(cS); d = o.userData.cr = { r: cS.length() / 2, off: cV.sub(o.position).clone() }; d.skip = d.r > 120; }
      if (d.skip) continue;
      cV.copy(o.position).add(d.off).sub(camera.position); const dist = cV.length() - d.r;
      const vis = dist < 40 || (dist < 420 && cV.dot(cF) > -d.r);
      if (!vis && !o.userData.hidden && o.visible) { o.userData.hidden = true; o.visible = false; }
      else if (vis && o.userData.hidden) { o.userData.hidden = false; o.visible = true; }
    }
  };
  const loop = (now) => {
    const dtR = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    step(dtR);
    // only on a sustained slowdown, never below 75%, and climb back once frames are normal again (60Hz = ~17ms)
    ftAvg += (dtR * 1000 - ftAvg) * 0.05; ftT += dtR; if (ftT > 3) { ftT = 0; let n = prCur; if (ftAvg > 30 && prCur > prMax * 0.76) n = Math.max(prMax * 0.75, prCur * 0.9); else if (ftAvg < 21 && prCur < prMax) n = Math.min(prMax, prCur * 1.12); if (Math.abs(n - prCur) > 0.01) { prCur = n; resize(); } }
    if (!window.__noRender) render(dtR);
    // drop the render resolution a touch if frames run long
    cullT += dtR; if (cullT > 0.25) { cullT = 0; cull(); }
    requestAnimationFrame(loop);
  };
  function step(dtR) {
    const G = C.game;
    if (G.paused || G.state === 'results') return;
    if (G.slowmo > 0) G.slowmo -= dtR;
    const ts = G.slowmo > 0 ? 0.35 : 1, dt = dtR * ts;
    acc += dt; let n = 0;
    while (acc >= DT && n < 4) {
      const ctl = C.input.sample();
      C.trolley.step(DT, ctl, C.time);
      C.phys.step(C.events);
      C.trolley.post(DT, C.time);
      G.processEvents();
      C.time += DT; acc -= DT; n++;
    }
    if (acc > DT) acc = DT; // a slow frame: drop the backlog rather than spiral into catch-up
    const active = G.state === 'run' || G.state === 'push';
    C.shopping.update(dt, C.time, active); C.props.update(dt, C.time); G.update(dt, C.time); C.fx.update(dt);
    emitTrolleyFx(dt);
  }
  function emitTrolleyFx(dt) {
    const tr = C.trolley; if (!tr) return;
    for (const W of tr.wheels) if (W.gone) { const q = tr.local(W.lx, -0.47 * tr.s, W.lz), sp = tr.speed(); if (tr.touching && sp > 3 && Math.random() < 0.7) C.fx.emit('spark', q.x, q.y, q.z, 0, 1.2, 0, 2, 1.6); }
  }
  function render(dtR) {
    const tr = C.trolley, G = C.game;
    tr.sync(dtR, C.time); C.props.sync(); C.shopping.sync();
    C.select.update(dtR);
    C.cam.update(dtR);
    const p = G.state === 'select' && C.select.open ? C.select.focus : tr.pos(); sun.position.set(p.x + SUN.x * 120, p.y + SUN.y * 120, p.z + SUN.z * 120); sun.target.position.set(p.x, p.y, p.z);
    const W = C.world; W.sky.position.copy(camera.position); W.clouds.position.set(camera.position.x * 0.9, 0, camera.position.z * 0.9); W.clouds.rotation.y += dtR * 0.002;
    if (W.water && W.water.material.map) W.water.material.map.offset.x += dtR * 0.01;
    for (const t of W.turbines || []) t.rotation.z += dtR * 0.9;
    renderer.render(scene, camera);
    C.hud.draw(dtR);
    let bump = 0; for (const w of tr.wheels) bump += Math.abs(w.comp - 0.01) * 20;
    const active = G.state === 'run' || G.state === 'push' || G.state === 'over';
    const L = W.locate(p.x, p.z, {}), surface = Math.abs(L.d) > W.roadAt(L.s, {}).w ? 'pave' : 'road';
    C.audio.update(dtR, { active: active && !G.paused, speed: tr.speed(), air: tr.nWheels === 0, wheels: tr.nWheels, bump: Math.min(1, bump), wet: tr.submerged, surface, squeak: (tr.key === 'pensioner' ? 0.6 : 0) + (tr.wheels.some(w => w.stick > 0) ? 1 : 0) });
  }
  requestAnimationFrame(loop);
  // ---------- test hooks ----------
  window.__trolley = {
    get: () => { const tr = C.trolley, p = tr.pos(), v = tr.vel(), L = C.world.locate(p.x, p.z, {}); return { x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, speed: tr.speed(), mph: tr.speed() * 2.237, s: L.s, d: L.d, up: tr.up, wheels: tr.nWheels, touching: tr.touching, state: C.game.state, score: C.game.run.score, combo: C.game.combo.list.map(e => e.name), mult: C.game.combo.mult, basket: C.shopping.inBasket().length, hp: { b: tr.hp.basket, h: tr.hp.handle, w: tr.wheels.map(w => +w.hp.toFixed(2)) }, end: C.game.run.end, msgs: C.game.msgs.map(m => m.text), broken: C.game.run.broken, near: C.game.run.nearMisses, air: tr.airT, time: C.game.run.time, dist: C.game.run.dist }; },
    keys: k => { for (const n of ['push', 'brake', 'left', 'right']) C.input.k[n] = !!(k && k[n]); if (k && k.hop) C.input.hopQ = true; if (k && k.tap) C.input.pushQ = true; },
    start: () => C.game.startRun(),
    place: (s, d, yawOff = 0, h = 0.6) => { const tr = C.trolley, R = C.world.roadAt(s, {}), P = C.world.P(s, d); tr.reset({ x: P.x, y: P.y + h, z: P.z, yaw: -R.th + yawOff }); C.camera.userData.snap = true; },
    placeXZ: (x, z, yaw = 0, h = 0.6) => { C.trolley.reset({ x, y: C.world.groundY(x, z) + h, z, yaw }); C.camera.userData.snap = true; },
    vel: (vx, vy, vz) => C.trolley.body.setLinvel({ x: vx, y: vy, z: vz }, true),
    sim: (sec, k) => { window.__trolley.keys(k || {}); const n = Math.round(sec * 60); for (let i = 0; i < n; i++) step(1 / 60); return window.__trolley.get(); },
    render: on => { window.__noRender = !on; },
    frame: () => render(1 / 60),
    world: () => C.world, C,
  };
}
boot().catch(e => { console.error(e); fail('Something went wrong starting the game: ' + (e && e.message || e)); });
