import RAPIER from './rapier.js';
import { C } from './core.js';
import { buildTextures } from './textures.js';
import { buildWorldBase, flushStatics } from './world.js';
import { buildScenery } from './scenery.js?v=plank-skip';
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
const DT = 1 / 120, GAME_DT = 2 * DT;

async function boot() {
  if (!T) return fail("The 3D engine didn't load. Check your connection and reload.");
  // Start physics and the fonts used by procedural signs at the same time.
  const fonts = Promise.race([Promise.all(['16px "Press Start 2P"', '16px Silkscreen', '700 16px Silkscreen', '16px Tiny5', '16px Bungee', '700 16px "Barlow Condensed"', '600 16px "Barlow Condensed"'].map(f => document.fonts.load(f))).catch(() => {}), new Promise(r => setTimeout(r, 2000))]);
  try { await RAPIER.init(); } catch (e) { return fail('The physics engine could not start in this browser. Reload to try again.'); }
  await fonts;
  C.RAPIER = RAPIER;
  C.phys = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); C.phys.timestep = DT; C.phys.numSolverIterations = 6;
  C.events = new RAPIER.EventQueue(true);
  // renderer: low-res, no AA, vertex-lit materials: a lost PS2 game
  const canvas = $('gl');
  const touchy = matchMedia('(pointer: coarse)').matches;
  C.touch = touchy; document.body.classList.toggle('touch', touchy);
  const options = { alpha: false, antialias: false, depth: true, stencil: true, powerPreference: touchy ? 'default' : 'high-performance' };
  const context = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
  if (!context) return fail('Trolley needs WebGL. Try opening it in an up-to-date browser with hardware acceleration enabled.');
  const renderer = C.renderer = new T.WebGLRenderer({ canvas, context, ...options });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  const scene = C.scene = new T.Scene();
  scene.fog = new T.Fog(0xd5dee6, 140, 900);
  const camera = C.camera = new T.PerspectiveCamera(62, 1, 0.1, 4000);
  const hemi = new T.HemisphereLight(0xd8e6f4, 0x7a8a5a, 0.72); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff0d8, 0.78); sun.castShadow = true;
  const shadowRadius = touchy ? 24 : 32;
  sun.shadow.mapSize.setScalar(touchy ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -shadowRadius, right: shadowRadius, top: shadowRadius, bottom: -shadowRadius, near: 22, far: 198 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target); C.lights = { hemi, sun }; const SUN = new T.Vector3(0.55, 0.78, 0.3).normalize();
  // light-space axes for snapping the shadow camera to whole texels
  const LR = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), SUN).normalize(), LU = new T.Vector3().crossVectors(SUN, LR).normalize(), TEX = 2 * shadowRadius / sun.shadow.mapSize.x, snapP = new T.Vector3();
  buildTextures();
  buildWorldBase(scene);
  buildScenery(scene);
  buildExtras();
  flushStatics(scene);
  // Static scenery owns these visibility flags. Pickups, props and menu models keep their own state.
  const staticBounds = [], box = new T.Box3();
  for (const object of scene.children) {
    if (object.isLight || object.userData.background || object === sun.target || object === C.world.sky || object === C.world.clouds || object === C.world.water) continue;
    box.setFromObject(object);
    if (box.isEmpty()) continue;
    const bounds = box.getBoundingSphere(new T.Sphere());
    if (bounds.radius < 135) staticBounds.push({ object, bounds });
  }
  const offset = new T.Vector3(), view = new T.Frustum(), viewProjection = new T.Matrix4();
  let visibilityAge = 1;
  function updateVisibility(dt, snap) {
    visibilityAge += dt;
    if (!snap && visibilityAge < 0.1) return;
    visibilityAge = 0;
    camera.updateMatrixWorld();
    view.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const range = touchy ? 290 : 410;
    for (const { object, bounds } of staticBounds) {
      offset.subVectors(bounds.center, camera.position);
      object.visible = offset.lengthSq() < (55 + bounds.radius) ** 2 ||
        (offset.lengthSq() < (range + bounds.radius) ** 2 && view.intersectsSphere(bounds));
    }
  }
  C.fx = new FX(); C.props = new Props(); C.shopping = new Shopping(); C.audio = new Audio(); C.game = new Game();
  C.audio.muted = !!C.game.save.muted;
  C.input = new Input(); C.cam = new Cam(camera); C.hud = new HUD($('hud')); C.ui = new UI(); C.select = new Select();
  C.game.toSelect();
  let width = 0, height = 0, pixelRatio = 0, quality = 1, frameTime = 16.7, qualityTime = 0;
  let last = 0, acc = 0, gameAcc = 0, audioAcc = 0, contextLost = false, dirty = true, previousScreen;
  const bufferSize = new T.Vector2(), roadPosition = {}, road = {};
  function resize() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    const maxRatio = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt((touchy ? 550000 : 1600000) / (w * h)));
    const ratio = maxRatio * quality;
    if (w === width && h === height && ratio === pixelRatio) return;
    if (w !== width || h !== height) {
      C.hud.resize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    width = w; height = h; pixelRatio = ratio; dirty = true;
    renderer.setDrawingBufferSize(w, h, ratio);
    C.fx.setScale(renderer.getDrawingBufferSize(bufferSize).y / (2 * Math.tan(camera.fov * Math.PI / 360)));
  }
  resize();
  addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { last = 0; });
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); contextLost = true; C.ui.pause();
    const error = $('err'); error.textContent = 'Graphics paused. Waiting for the browser to recover…'; error.classList.remove('hidden');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false; dirty = true; last = 0; $('err').classList.add('hidden');
  });
  function loop(now) {
    const elapsed = last ? (now - last) / 1000 : 0; last = now;
    if (contextLost || document.hidden) { requestAnimationFrame(loop); return; }
    const dt = Math.min(0.05, elapsed);
    step(dt);
    const game = C.game;
    if (elapsed > 0 && game.state === 'run' && !game.paused) {
      frameTime += (Math.min(70, elapsed * 1000) - frameTime) * Math.min(1, dt * 3);
      qualityTime += dt;
      if (qualityTime >= 2.5) {
        let next = quality;
      if (frameTime > 24) next = Math.max(0.68, quality - 0.12);
      else if (frameTime < 17.5 && qualityTime >= 8) next = Math.min(1, quality + 0.06);
        if (next !== quality) { quality = next; qualityTime = 0; resize(); }
      }
    } else { qualityTime = 0; frameTime = 16.7; }
    if (!skipRender) {
      const screen = game.paused ? 'pause' : game.state;
      if (dirty || previousScreen !== screen || (screen !== 'pause' && screen !== 'results')) {
        render(dt);
        dirty = false; previousScreen = screen;
      }
      updateAudio(dt);
    }
    requestAnimationFrame(loop);
  }
  function step(dtR) {
    const game = C.game;
    if (game.paused || game.state === 'results') return;
    if (game.state === 'select') {
      C.props.update(dtR, C.time, false);
      return;
    }

    game.slowmo = Math.max(0, game.slowmo - dtR);
    acc += dtR * (game.slowmo > 0 ? 0.35 : 1);
    while (acc >= DT && game.state !== 'results') {
      C.props.stepBus(DT);
      C.trolley.step(DT, C.input.sample(), C.time);
      C.phys.step(C.events);
      C.trolley.post();
      game.processEvents();
      C.time += DT; acc -= DT; gameAcc += DT;
      if (gameAcc >= GAME_DT) {
        gameAcc = 0;
        C.shopping.update(GAME_DT, game.state === 'run' || game.state === 'push');
        C.props.update(GAME_DT, C.time, true);
        game.update(GAME_DT, C.time);
        emitTrolleyFx();
      }
    }
    C.fx.update(dtR * (game.slowmo > 0 ? 0.35 : 1));
  }
  function emitTrolleyFx() {
    const tr = C.trolley; if (!tr) return;
    for (const W of tr.wheels) if (W.gone) { const q = tr.local(W.lx, -0.47 * tr.s, W.lz), sp = tr.speed(); if (tr.touching && sp > 3 && Math.random() < 0.7) C.fx.emit('spark', q.x, q.y, q.z, 0, 1.2, 0, 2, 1.6); }
  }
  let skipRender = false;
  function render(dtR) {
    const tr = C.trolley, game = C.game;
    const frozen = game.paused || game.state === 'results';
    const drawDt = frozen ? 0 : dtR;
    const snap = camera.userData.snap;
    const blend = snap ? 1 : acc / DT;
    tr.sync(drawDt * (game.slowmo > 0 ? 0.35 : 1), blend);
    C.select.update(drawDt);
    C.cam.update(drawDt);
    updateVisibility(drawDt, snap || skipRender);
    C.props.sync(drawDt);
    C.shopping.sync();
    const p = game.state === 'select' ? C.select.focus : tr.vis.root.position;
    const a = Math.round(p.dot(LR) / TEX) * TEX, b = Math.round(p.dot(LU) / TEX) * TEX, c = p.dot(SUN);
    snapP.copy(LR).multiplyScalar(a).addScaledVector(LU, b).addScaledVector(SUN, c);
    sun.position.copy(snapP).addScaledVector(SUN, 120); sun.target.position.copy(snapP);
    const W = C.world;
    W.sky.position.copy(camera.position);
    W.clouds.position.set(camera.position.x * 0.9, 0, camera.position.z * 0.9);
    W.clouds.rotation.y += drawDt * 0.002;
    W.water.material.map.offset.x += drawDt * 0.01;
    for (const t of W.turbines) t.rotation.z += drawDt * 0.9;
    renderer.render(scene, camera);
    C.hud.draw(dtR);
  }
  function updateAudio(dt) {
    if (!C.audio.ok) return;
    audioAcc += dt;
    if (audioAcc >= 1 / 30) {
      const tr = C.trolley, game = C.game, p = tr.vis.root.position, W = C.world;
      const active = game.state !== 'select' && game.state !== 'results' && !game.paused;
      let bump = 0;
      for (const wheel of tr.wheels) bump += Math.abs(wheel.comp - 0.01) * 20;
      const L = active ? W.locate(p.x, p.z, roadPosition) : roadPosition;
      const surface = active && Math.abs(L.d) > W.roadAt(L.s, road).w ? 'pave' : 'road';
      C.audio.update(audioAcc, { active, speed: active ? tr.speed() : 0, air: tr.nWheels === 0, wheels: tr.nWheels, bump: Math.min(1, bump), wet: tr.submerged, surface, squeak: (tr.key === 'pensioner' ? 0.6 : 0) + (tr.wheels.some(w => w.stick > 0) ? 1 : 0) });
      audioAcc = 0;
    }
  }
  render(0);
  $('loading').classList.add('hidden');
  requestAnimationFrame(loop);
  // Expose automation tools only when explicitly enabled.
  if (!new URLSearchParams(window.location.search).has('debug')) return;
  window.__trolley = {
    get: () => { const tr = C.trolley, p = tr.pos(), v = tr.vel(), L = C.world.locate(p.x, p.z, {}); return { x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, speed: tr.speed(), mph: tr.speed() * 2.237, s: L.s, d: L.d, up: tr.up, wheels: tr.nWheels, touching: tr.touching, state: C.game.state, score: C.game.run.score, combo: C.game.combo.list.map(e => e.name), mult: C.game.combo.mult, basket: C.shopping.inBasket().length, hp: { b: tr.hp.basket, h: tr.hp.handle, w: tr.wheels.map(w => +w.hp.toFixed(2)) }, end: C.game.run.end, msgs: C.game.msgs.map(m => m.text), broken: C.game.run.broken, near: C.game.run.nearMisses, air: tr.airT, time: C.game.run.time, dist: C.game.run.dist }; },
    keys: k => { for (const n of ['push', 'brake', 'left', 'right']) C.input.k[n] = !!(k && k[n]); if (k && k.hop) C.input.hopQ = true; if (k && k.tap) C.input.pushQ = true; },
    start: () => C.game.startRun(),
    place: (s, d, yawOff = 0, h = 0.6) => { const tr = C.trolley, R = C.world.roadAt(s, {}), P = C.world.P(s, d); tr.reset({ x: P.x, y: P.y + h, z: P.z, yaw: -R.th + yawOff }); C.camera.userData.snap = true; },
    placeXZ: (x, z, yaw = 0, h = 0.6) => { C.trolley.reset({ x, y: C.world.groundY(x, z) + h, z, yaw }); C.camera.userData.snap = true; },
    vel: (vx, vy, vz) => C.trolley.body.setLinvel({ x: vx, y: vy, z: vz }, true),
    sim: (sec, k) => { window.__trolley.keys(k || {}); const n = Math.round(sec * 60); for (let i = 0; i < n; i++) step(1 / 60); return window.__trolley.get(); },
    render: on => { skipRender = !on; },
    frame: () => render(1 / 60),
    world: () => C.world, C,
  };
}
boot().catch(e => { console.error(e); fail('Something went wrong starting the game: ' + (e && e.message || e)); });
