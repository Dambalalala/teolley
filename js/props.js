import { C, G, ig, ALL } from './core.js';
import { clamp, lerp, TAU, angDiff, rng } from './util.js';
import { makeBin, makeCone, makeBarrier, makePicket, makeHeras, makePallet, makePot, makeCompost, makePane, makePerson, makeDuck, makeBus } from './models.js';
const T = C.T;

const SPEC = {
  bin: { shape: ['cuboid', 0.3, 0.5, 0.37], mass: 11, name: 'WHEELIE BIN', pts: 150 },
  cone: { shape: ['cylinder', 0.34, 0.22], mass: 0.8, name: 'TRAFFIC CONE', pts: 50 }, // straight-sided so a trolley can't ride up one
  barrier: { shape: ['cuboid', 0.95, 0.42, 0.22], off: -0.09, far: 180,  mass: 8, name: 'ROADWORKS BARRIER', pts: 100 },
  picket: { shape: ['cuboid', 1.2, 0.45, 0.05], far: 160,  mass: 6, name: 'PICKET FENCE', pts: 150, fixed: true },
  heras: { shape: ['cuboid', 1.7, 1.0, 0.25], far: 220,  mass: 14, name: 'SITE FENCE', pts: 120 },
  pallet: { shape: ['cuboid', 0.5, 0.2, 0.6], off: 0.1, mass: 30, name: 'PALLET OF BRICKS', pts: 120 },
  pot: { shape: ['cylinder', 0.2, 0.22], mass: 4, name: 'PLANT POT', pts: 60 },
  compost: { shape: ['cuboid', 0.28, 0.08, 0.43], mass: 12, name: 'COMPOST', pts: 60 },
  gnome: { shape: ['cuboid', 0.14, 0.4, 0.14], off: 0.08, mass: 3, name: 'GARDEN GNOME', pts: 200 },
  pane: { shape: ['cuboid', 0.95, 1.07, 0.03], far: 220,  mass: 5, name: 'GREENHOUSE GLASS', pts: 120, fixed: true },
};
export class Props {
  constructor() {
    this.list = []; this.byHandle = new Map(); this.debris = [];
    for (const d of C.world.dyn) this.create(d);
    this.peds = C.world.peds.map(s => this.makePed(s));
    this.makeDucks(); this.makeBusLine();
  }
  create(d) {
    const R = C.RAPIER, S = SPEC[d.type]; if (!S) return;
    let mesh, lid = null;
    if (d.type === 'bin') { const b = makeBin(d.lid); mesh = b.group; lid = b.lid; }
    else if (d.type === 'cone') mesh = makeCone(); else if (d.type === 'barrier') mesh = makeBarrier(); else if (d.type === 'picket') mesh = makePicket(d.w || 2.4, 0.9);
    else if (d.type === 'heras') mesh = makeHeras(); else if (d.type === 'pallet') mesh = makePallet(); else if (d.type === 'pot') mesh = makePot(); else if (d.type === 'compost') mesh = makeCompost();
    else if (d.type === 'pane') mesh = makePane(1.9, 2.15);
    C.scene.add(mesh);
    const q = new T.Quaternion().setFromEuler(new T.Euler(0, d.yaw || 0, 0));
    const bd = (S.fixed ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic().setSleeping(true).setCcdEnabled(false)).setTranslation(d.x, d.y, d.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setAngularDamping(0.3).setLinearDamping(0.1);
    const body = C.phys.createRigidBody(bd);
    const sh = S.shape; let cd = sh[0] === 'cone' ? R.ColliderDesc.cone(sh[1], sh[2]) : sh[0] === 'cylinder' ? R.ColliderDesc.cylinder(sh[1], sh[2]) : R.ColliderDesc.cuboid(d.type === 'picket' ? (d.w || 2.4) / 2 : sh[1], sh[2], sh[3]);
    cd.setTranslation(0, S.off || 0, 0).setMass(S.mass).setFriction(0.6).setRestitution(0.2).setCollisionGroups(ig(G.PROP, ALL)).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    const col = C.phys.createCollider(cd, body);
    const p = { type: d.type, S, body, col, mesh, lid, lidA: 0, home: { x: d.x, y: d.y, z: d.z, q: { x: q.x, y: q.y, z: q.z, w: q.w } }, hit: false, gone: false, hitT: -9 };
    mesh.position.set(d.x, d.y, d.z); mesh.quaternion.copy(q);
    this.list.push(p); this.byHandle.set(col.handle, p);
    C.colInfo.set(col.handle, { kind: 'prop', prop: p, name: S.name });
  }
  // called by the game when the trolley (or a flying prop) bumps a prop
  knock(p, by, relSpeed) {
    const R = C.RAPIER;
    if (p.gone) return false;
    if (p.type === 'pane') { if (relSpeed < 1.5) return false; p.gone = true; p.col.setSensor(true); p.mesh.visible = false; const q = p.body.translation(); for (let k = 0; k < 3; k++) C.fx.emit('glass', q.x, q.y + (k - 1) * 0.5, q.z, 0, 1, 0, 14, 3.5); C.audio.sfx('glass'); return true; }
    if (p.S.fixed && p.body.isFixed()) { if (relSpeed < 2.2) return false; p.body.setBodyType(R.RigidBodyType.Dynamic, true); }
    const first = !p.hit; p.hit = true; p.hitT = C.time;
    if (p.type === 'bin' && first) { const q = p.body.translation(); C.fx.emit('rubbish', q.x, q.y + 0.4, q.z, 0, 2.5, 0, 16, 2.2); }
    return first;
  }
  reset() {
    const R = C.RAPIER;
    for (const p of this.list) {
      if (p.S.fixed && !p.body.isFixed()) p.body.setBodyType(R.RigidBodyType.Fixed, false);
      p.body.setTranslation(p.home, false); p.body.setRotation(p.home.q, false);
      if (!p.body.isFixed()) { p.body.setLinvel({ x: 0, y: 0, z: 0 }, false); p.body.setAngvel({ x: 0, y: 0, z: 0 }, false); p.body.sleep(); }
      p.hit = false; p.gone = false; p.col.setSensor(false); p.mesh.visible = true; p.lidA = 0; if (p.lid) p.lid.rotation.x = 0;
      p.mesh.position.set(p.home.x, p.home.y, p.home.z); p.mesh.quaternion.set(p.home.q.x, p.home.q.y, p.home.q.z, p.home.q.w);
    }
    for (const d of this.debris) { C.phys.removeRigidBody(d.body); C.scene.remove(d.mesh); } this.debris = [];
    for (const pd of this.peds) this.resetPed(pd);
    for (const dk of this.ducks) { dk.state = 'swim'; dk.mesh.visible = true; dk.mesh.scale.set(1, 1, 1); dk.t = Math.random() * 10; dk.y = 0; }
    this.ducksGone = false;
    for (const c of C.world.cars) { c.alarm = 0; c.rock = 0; c.car.ind.material.opacity = 0; c.car.ind.visible = false; c.car.body.rotation.set(0, 0, 0); }
    for (const w of C.world.wobblers) { w.a = 0; w.v = 0; w.obj.rotation.x = 0; w.obj.rotation.z = 0; }
    this.bus.lx = -125; this.bus.wait = 0;
  }
  spawnDebrisWheel(tr, W) {
    const R = C.RAPIER, vw = tr.vis.wheels[W.i], p = new T.Vector3(); vw.wheel.getWorldPosition(p);
    const v = tr.vel(), body = C.phys.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y + 0.05, p.z).setLinvel(v.x * 0.8 + (Math.random() - 0.5) * 3, v.y + 2.5, v.z * 0.8 + (Math.random() - 0.5) * 3).setAngvel({ x: (Math.random() - 0.5) * 30, y: 0, z: (Math.random() - 0.5) * 30 }).setCcdEnabled(true));
    const c = C.phys.createCollider(R.ColliderDesc.cylinder(0.016 * tr.s, 0.0625 * tr.s).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setMass(0.4).setFriction(0.5).setRestitution(0.4).setCollisionGroups(ig(G.DEBRIS, G.GROUND | G.PROP | G.DEBRIS)), body);
    const mesh = new T.Group(); const wm = vw.wheel.clone(); wm.position.set(0, 0, 0); mesh.add(wm); mesh.scale.setScalar(tr.s); C.scene.add(mesh);
    this.debris.push({ body, mesh });
  }
  // ---------------- the lollipop lady ----------------
  makePed(spec) {
    const R = C.RAPIER, P = makePerson(spec.kind); C.scene.add(P.group);
    const body = C.phys.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
    const col = C.phys.createCollider(R.ColliderDesc.capsule(0.55, 0.24).setTranslation(0, 0.82, 0).setMass(70).setFriction(0.7).setCollisionGroups(ig(G.PED, ALL)).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), body);
    const pd = { spec, P, body, col, s: spec.s || 0, state: 'still', t: 0, ph: Math.random() * 6, x: 0, y: 0, z: 0, yaw: 0, dodge: null, near: null, downT: 0, oiT: 0 };
    C.colInfo.set(col.handle, { kind: 'ped', ped: pd, name: 'LOLLIPOP LADY' });
    this.resetPed(pd);
    return pd;
  }
  resetPed(pd) {
    const R = C.RAPIER, s = pd.spec;
    if (pd.body.bodyType() !== R.RigidBodyType.KinematicPositionBased) pd.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true); pd.body.setGravityScale(1, true);
    pd.state = 'still'; pd.dodge = null; pd.near = null; pd.downT = 0; pd.oiT = 0; pd.hitOnce = false;
    if (s.s != null) { const p = C.world.P(s.s, s.d); pd.x = p.x; pd.y = p.y; pd.z = p.z; pd.yaw = s.d < 0 ? -p.th - Math.PI / 2 : -p.th + Math.PI / 2; }
    else { pd.x = s.x; pd.z = s.z; pd.y = C.world.groundY(s.x, s.z); pd.yaw = s.yaw || 0; }
    pd.body.setTranslation({ x: pd.x, y: pd.y, z: pd.z }, true); pd.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    pd.P.group.position.set(pd.x, pd.y, pd.z); pd.P.group.rotation.set(0, pd.yaw, 0); pd.P.body.rotation.set(0, 0, 0); pd.P.body.position.set(0, 0, 0); pd.P.armL.rotation.z = 0; pd.P.armR.rotation.z = 0;
  }
  hitPed(pd, rel, tv) {
    // off she goes: launched up and away, spinning, falling far too slowly
    const R = C.RAPIER; if (pd.state === 'down') return false;
    pd.state = 'down'; pd.downT = 1e9; pd.body.setBodyType(R.RigidBodyType.Dynamic, true); pd.body.setGravityScale(0.35, true);
    const vh = Math.hypot(tv.x, tv.z) || 1, k = (14 + vh * 0.6) / vh;
    pd.body.setLinvel({ x: tv.x * k, y: 11, z: tv.z * k }, true); pd.body.setAngvel({ x: 9, y: 26, z: 7 }, true);
    C.audio.sfx('spin');
    const first = !pd.hitOnce; pd.hitOnce = true; return first;
  }

  updatePeds(dt, t) {
    const R = C.RAPIER, tr = C.trolley, tp = tr ? tr.pos() : null, tv = tr ? tr.vel() : null;
    for (const pd of this.peds) {
      const s = pd.spec, A = pd.P;
      if (pd.state === 'down') {
        pd.downT -= dt; const q = pd.body.translation(), r = pd.body.rotation(); A.group.position.set(q.x, q.y, q.z); A.group.quaternion.set(r.x, r.y, r.z, r.w);
        { const lv = pd.body.linvel(), fl = Math.min(1, Math.hypot(lv.x, lv.y, lv.z) / 3), w = t * 22; // flail while flying
          A.legL.rotation.x = Math.sin(w) * 1.3 * fl; A.legR.rotation.x = -Math.sin(w * 1.1) * 1.3 * fl; A.armL.rotation.x = -2.2 * fl + Math.sin(w * 1.3) * 1.1 * fl; A.armR.rotation.x = -2.2 * fl - Math.sin(w * 0.9) * 1.1 * fl; A.armL.rotation.z = Math.cos(w) * 0.9 * fl; A.armR.rotation.z = -Math.cos(w * 1.2) * 0.9 * fl; }
        if (pd.downT <= 0) { pd.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true); pd.x = q.x; pd.z = q.z; pd.y = C.world.groundY(q.x, q.z); pd.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); pd.body.setTranslation({ x: pd.x, y: pd.y, z: pd.z }, true); A.group.quaternion.set(0, 0, 0, 1); pd.state = 'still'; pd.oiT = 2.2; C.audio.sfx('oi'); }
        continue;
      }
      const moving = false;
      // stand facing the trolley as it comes down the hill
      if (tp && !pd.dodge) { const want = Math.atan2(-(tp.x - pd.x), -(tp.z - pd.z)); pd.yaw += angDiff(want, pd.yaw) * Math.min(1, dt * 4); }
      // near misses
      if (tr && !pd.dodge && tp) {
        const dx = pd.x - tp.x, dz = pd.z - tp.z, dist = Math.hypot(dx, dz), vh = Math.hypot(tv.x, tv.z);
        // near-miss bookkeeping
        if (dist < 4.5 && vh > 5 && !pd.hitOnce) { if (!pd.near) pd.near = { min: dist, t }; else pd.near.min = Math.min(pd.near.min, dist); }
        else if (pd.near && dist > 5) { if (pd.near.min < 1.7 && !pd.hitOnce && t - pd.near.t < 3) C.game.ev('nearMiss', { name: 'LOLLIPOP LADY', pts: 300 }); pd.near = null; }
      }
      if (pd.dodge) { const D = pd.dodge; D.t += dt / 0.45; const u = Math.min(1, D.t); pd.x = lerp(D.x0, D.x1, u); pd.z = lerp(D.z0, D.z1, u); pd.y = C.world.groundY(pd.x, pd.z) + Math.sin(u * Math.PI) * 0.45; if (D.t > 2.2) pd.dodge = null; }
      pd.body.setNextKinematicTranslation({ x: pd.x, y: pd.y, z: pd.z });
      A.group.position.set(pd.x, pd.y, pd.z); A.group.rotation.set(0, pd.yaw, 0);
      const sw = moving ? Math.sin(pd.ph) * 0.55 : (pd.dodge ? 0.9 : 0);
      A.legL.rotation.x = sw; A.legR.rotation.x = -sw; A.armL.rotation.x = -sw * 0.8 - (pd.dodge ? 1.2 : 0); A.armR.rotation.x = sw * 0.8 - (pd.dodge ? 1.2 : 0);
      A.armR.rotation.x = -0.25;
      A.body.rotation.z = pd.dodge ? Math.sin(Math.min(1, pd.dodge.t) * Math.PI) * 0.5 : 0;
      if (pd.oiT > 0) pd.oiT -= dt;
    }
  }
  // ---------------- ducks ----------------
  makeDucks() {
    this.ducks = []; const W = C.world;
    for (const d of W.ducks || []) { const m = makeDuck(d.drake); C.scene.add(m); this.ducks.push({ ...d, mesh: m, state: 'swim', t: Math.random() * 10, y: 0, vx: 0, vz: 0, vy: 0 }); }
  }
  disturbDucks() {
    if (this.ducksGone) return false; this.ducksGone = true;
    for (const dk of this.ducks) { dk.state = 'fly'; const a = Math.random() * TAU; dk.vx = Math.cos(a) * 4; dk.vz = Math.sin(a) * 4; dk.vy = 3 + Math.random() * 2; dk.t = 0; const p = dk.mesh.position; C.fx.emit('feather', p.x, p.y + 0.3, p.z, 0, 1, 0, 6, 1.2); }
    C.audio.sfx('quack'); return true;
  }
  updateDucks(dt, t) {
    const W = C.world, pond = W.pond; if (!pond) return;
    for (const dk of this.ducks) {
      if (dk.state === 'swim') { dk.t += dt * 0.3; const lx = dk.lx + Math.cos(dk.t + dk.lf) * 1.5, lf = dk.lf + Math.sin(dk.t * 0.8 + dk.lx) * 1.2; const p = W.botToWorld(lx, lf); dk.mesh.position.set(p.x, pond.water - 0.02 + Math.sin(t * 2 + dk.lx) * 0.015, p.z); dk.mesh.rotation.y = -dk.t - Math.PI / 2; }
      else if (dk.state === 'fly') { dk.t += dt; dk.vy += (2.4 - dk.vy) * dt; const p = dk.mesh.position; p.x += dk.vx * dt; p.y += dk.vy * dt; p.z += dk.vz * dt; dk.mesh.rotation.y = Math.atan2(-dk.vx, -dk.vz); dk.mesh.scale.set(1 + Math.sin(t * 30) * 0.4, 1, 1); if (dk.t > 7) { dk.state = 'gone'; dk.mesh.visible = false; } }
    }
    // disturbing them: the trolley in or over the pond
    const tr = C.trolley; if (!tr || this.ducksGone) return;
    const p = tr.pos(), u = (p.x - pond.x) / (pond.rx * 1.25), v = (p.z - pond.z) / (pond.rz * 1.25);
    if (u * u + v * v < 1 && p.y < 6) { if (this.disturbDucks()) C.game.ev('ducks', {}); }
  }
  // ---------------- the number 37 bus ----------------
  makeBusLine() {
    const R = C.RAPIER, b = makeBus(); C.scene.add(b.group);
    const body = C.phys.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -60, 0));
    const col = C.phys.createCollider(R.ColliderDesc.cuboid(1.25, 2.1, 5.4).setTranslation(0, 2.15, 0).setFriction(0.5).setCollisionGroups(ig(G.GROUND, ALL)), body);
    C.colInfo.set(col.handle, { kind: 'bus', name: 'THE NUMBER 37' });
    this.bus = { b, body, lx: -125, wait: 0, stopped: false };
  }
  updateBus(dt) {
    const B = this.bus, W = C.world;
    if (B.wait > 0) B.wait -= dt;
    else { const prev = B.lx; B.lx += 8.5 * dt; if (prev < -27 && B.lx >= -27 && !B.stopped) { B.wait = 3.5; B.stopped = true; } if (B.lx > 130) { B.lx = -130; B.wait = 5; B.stopped = false; } }
    const p = W.botToWorld(B.lx, 10.2), q = new T.Quaternion().setFromEuler(new T.Euler(0, -Math.PI / 2, 0));
    B.body.setNextKinematicTranslation({ x: p.x, y: 0.03, z: p.z }); B.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    B.b.group.position.set(p.x, 0.03, p.z); B.b.group.rotation.y = -Math.PI / 2;
    B.x = p.x; B.z = p.z;
  }
  // ---------------- cars, signs ----------------
  alarm(idx) { const c = C.world.cars[idx]; if (!c) return false; const first = c.alarm <= 0; c.alarm = 7; c.rock = 1; return first; }
  wobble(i, dir) { const w = C.world.wobblers[i]; if (!w) return; w.v += clamp(dir, -6, 6); }
  update(dt, t) {
    this.updatePeds(dt, t); this.updateDucks(dt, t); this.updateBus(dt);
    let anyAlarm = false;
    for (const c of C.world.cars) { if (c.alarm > 0) { c.alarm -= dt; anyAlarm = true; c.car.ind.material.opacity = Math.sin(t * 12) > 0 ? 0.85 : 0; if (c.alarm <= 0) c.car.ind.material.opacity = 0; c.car.ind.visible = c.car.ind.material.opacity > 0; } if (c.rock > 0) { c.rock = Math.max(0, c.rock - dt * 0.7); c.car.body.rotation.z = Math.sin(t * 9) * 0.05 * c.rock; } }
    C.audio.alarm(anyAlarm);
    for (const w of C.world.wobblers) { if (w.a === 0 && w.v === 0) continue; w.v += (-w.a * 60 - w.v * 3.2) * dt; w.a += w.v * dt; if (Math.abs(w.a) < 0.002 && Math.abs(w.v) < 0.01) { w.a = 0; w.v = 0; } w.obj.rotation.x = w.a; }
    for (const b of C.world.blink || []) b.visible = Math.sin(t * 5.2) > -0.2;
  }
  sync() {
    // small things far up the road aren't worth a draw call each
    const cp = C.camera.position;
    for (const p of this.list) { const mp = p.mesh.position, dx = mp.x - cp.x, dz = mp.z - cp.z; p.mesh.visible = !p.gone && dx * dx + dz * dz < (p.S.far || 135) ** 2; }
    for (const pd of this.peds) { const g = pd.P.group.position, dx = g.x - cp.x, dz = g.z - cp.z; pd.P.group.visible = dx * dx + dz * dz < 170 * 170; }
    for (const p of this.list) { if (p.body.isFixed() || p.body.isSleeping()) continue; const q = p.body.translation(), r = p.body.rotation(); p.mesh.position.set(q.x, q.y, q.z); p.mesh.quaternion.set(r.x, r.y, r.z, r.w); if (p.lid && p.hit) { p.lidA = Math.min(2.2, p.lidA + 0.12); p.lid.rotation.x = -p.lidA; } }
    for (const d of this.debris) { const q = d.body.translation(), r = d.body.rotation(); d.mesh.position.set(q.x, q.y, q.z); d.mesh.quaternion.set(r.x, r.y, r.z, r.w); }
  }
}
