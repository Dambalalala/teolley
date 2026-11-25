import { C, G, ig, ALL } from './core.js';
import { clamp, lerp, sstep, TAU, angDiff } from './util.js';
import { makeBin, makeCone, makeBarrier, makePicket, makeHeras, makePallet, makePot, makeCompost, makePane, makePerson, makeDuck, makeBus } from './models.js?v=stop-sign-splash';
import { BOT } from './world.js?v=stop-sign-splash';
const T = C.T;
const SIGN_SPIN = new T.Vector3(0.45, 0.68, 0.57).normalize();
const SIGN_FLAT = new T.Quaternion().setFromEuler(new T.Euler(Math.PI / 2, 0, 0));
const SIGN_IN_BIN = new T.Quaternion().setFromEuler(new T.Euler(0.16, 0, -0.22));

const SPEC = {
  bin: { shape: ['cuboid', 0.3, 0.5, 0.37], mass: 11, name: 'WHEELIE BIN', pts: 150 },
  cone: { shape: ['cylinder', 0.34, 0.26], mass: 0.45, name: 'TRAFFIC CONE', pts: 50 },
  barrier: { shape: ['cuboid', 0.95, 0.42, 0.22], off: -0.09, far: 180,  mass: 8, name: 'ROADWORKS BARRIER', pts: 100 },
  picket: { shape: ['cuboid', 1.2, 0.45, 0.05], far: 160,  mass: 6, name: 'PICKET FENCE', pts: 150, fixed: true },
  heras: { shape: ['cuboid', 1.7, 1.0, 0.25], far: 220,  mass: 14, name: 'SITE FENCE', pts: 120 },
  pallet: { shape: ['cuboid', 0.5, 0.2, 0.6], off: 0.1, mass: 30, name: 'PALLET OF BRICKS', pts: 120 },
  pot: { shape: ['cylinder', 0.2, 0.22], mass: 4, name: 'PLANT POT', pts: 60 },
  compost: { shape: ['cuboid', 0.28, 0.08, 0.43], mass: 12, name: 'COMPOST', pts: 60 },
  pane: { shape: ['cuboid', 0.95, 1.07, 0.03], far: 220,  mass: 5, name: 'GREENHOUSE GLASS', pts: 120, fixed: true },
};
export class Props {
  constructor() {
    this.list = []; this.debris = [];
    this.worldPoint = {};
    // Keep per-object frustum culling for the desktop shadow pass.
    this.instances = C.renderer.shadowMap.enabled ? null : new Map();
    this.frustum = new T.Frustum(); this.viewProjection = new T.Matrix4(); this.sphere = new T.Sphere();
    for (const d of C.world.dyn) this.create(d);
    this.bins = this.list.filter(p => p.type === 'bin');
    if (this.instances) for (const batch of this.instances.values()) {
      batch.meshes = batch.parts.map(part => {
        const mesh = new T.InstancedMesh(part.geometry, part.material, batch.props.length);
        mesh.count = 0; mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
        mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
        C.scene.add(mesh);
        return mesh;
      });
    }
    this.peds = C.world.peds.map(s => this.makePed(s));
    this.makeDucks(); this.makeBusLine();
  }
  create(d) {
    const R = C.RAPIER, S = SPEC[d.type]; if (!S) return;
    const keys = { bin: `bin/${d.lid}`, cone: 'cone', barrier: 'barrier', picket: `picket/${d.w || 2.4}` };
    const key = this.instances && keys[d.type];
    let batch = key && this.instances.get(key);
    let mesh, lid = null;
    if (batch) { mesh = batch.template.clone(); if (d.type === 'bin') lid = mesh.children[1]; }
    else if (d.type === 'bin') { const b = makeBin(d.lid); mesh = b.group; lid = b.lid; }
    else if (d.type === 'cone') mesh = makeCone(); else if (d.type === 'barrier') mesh = makeBarrier(); else if (d.type === 'picket') mesh = makePicket(d.w || 2.4, 0.9);
    else if (d.type === 'heras') mesh = makeHeras(); else if (d.type === 'pallet') mesh = makePallet(); else if (d.type === 'pot') mesh = makePot(); else if (d.type === 'compost') mesh = makeCompost();
    else if (d.type === 'pane') mesh = makePane(1.9, 2.15);
    const parts = lid ? [mesh.children[0], lid.children[0]] : [mesh];
    if (key && !batch) {
      const radius = new T.Box3().setFromObject(mesh).getBoundingSphere(this.sphere).radius;
      batch = { template: mesh.clone(), radius: radius + (lid ? 0.65 : 0.12), parts, props: [], packed: [], meshes: [] };
      this.instances.set(key, batch);
    }
    if (!batch) C.scene.add(mesh);
    const q = new T.Quaternion().setFromEuler(new T.Euler(0, d.yaw || 0, 0));
    const bd = (S.fixed ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic().setSleeping(true).setCcdEnabled(false)).setTranslation(d.x, d.y, d.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setAngularDamping(0.3).setLinearDamping(0.1);
    const body = C.phys.createRigidBody(bd);
    const sh = S.shape; let cd = sh[0] === 'cylinder' ? R.ColliderDesc.cylinder(sh[1], sh[2]) : R.ColliderDesc.cuboid(d.type === 'picket' ? (d.w || 2.4) / 2 : sh[1], sh[2], sh[3]);
    cd.setTranslation(0, S.off || 0, 0).setMass(S.mass).setFriction(0.6).setRestitution(0.2).setCollisionGroups(ig(G.PROP, ALL)).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    // Keep cone hit events, without letting the cone steer the trolley on contact.
    if (d.type === 'cone') cd.setSolverGroups(ig(G.PROP, ALL & ~G.TROLLEY));
    const col = C.phys.createCollider(cd, body);
    const p = { type: d.type, S, body, col, mesh, lid, lidA: 0, batch, parts, matrixDirty: true, fixed: !!S.fixed, far2: (S.far || 135) ** 2,
      home: { x: d.x, y: d.y, z: d.z, q: { x: q.x, y: q.y, z: q.z, w: q.w } }, hit: false, gone: false, hitT: -9 };
    mesh.position.set(d.x, d.y, d.z); mesh.quaternion.copy(q);
    this.list.push(p);
    if (batch) batch.props.push(p);
    C.colInfo.set(col.handle, { kind: 'prop', prop: p, name: S.name });
  }
  // called by the game when the trolley (or a flying prop) bumps a prop
  knock(p, relSpeed, velocity) {
    const R = C.RAPIER;
    if (p.gone) return false;
    if (p.type === 'pane') { if (relSpeed < 1.5) return false; p.gone = true; p.col.setSensor(true); p.mesh.visible = false; const q = p.body.translation(); for (let k = 0; k < 3; k++) C.fx.emit('glass', q.x, q.y + (k - 1) * 0.5, q.z, 0, 1, 0, 14, 3.5); C.audio.sfx('glass'); return true; }
    if (p.fixed) { if (relSpeed < 2.2) return false; p.body.setBodyType(R.RigidBodyType.Dynamic, true); p.fixed = false; }
    const first = !p.hit; p.hit = true; p.hitT = C.time;
    if (p.type === 'cone' && first) {
      const horizontal = Math.hypot(velocity.x, velocity.z);
      const x = horizontal > 0.1 ? velocity.x / horizontal : 0, z = horizontal > 0.1 ? velocity.z / horizontal : -1;
      const carry = clamp(2 + relSpeed * 0.45, 2, 10), spin = clamp(12 + relSpeed, 12, 26);
      // Let the cone clear the basket cleanly while it can still strike scenery and other cones.
      p.col.setCollisionGroups(ig(G.PROP, ALL & ~G.TROLLEY));
      p.body.setLinvel({ x: x * carry - z * 0.85, y: 4.8 + Math.min(relSpeed, 16) * 0.16, z: z * carry + x * 0.85 }, true);
      p.body.setAngvel({ x: -z * spin, y: 6, z: x * spin }, true);
    }
    if (p.type === 'bin' && first) { const q = p.body.translation(); C.fx.emit('rubbish', q.x, q.y + 0.4, q.z, 0, 2.5, 0, 16, 2.2); }
    return first;
  }
  reset() {
    const R = C.RAPIER;
    for (const p of this.list) {
      if (p.S.fixed && !p.fixed) { p.body.setBodyType(R.RigidBodyType.Fixed, false); p.fixed = true; }
      p.body.setTranslation(p.home, false); p.body.setRotation(p.home.q, false);
      if (p.gone) p.col.setSensor(false);
      if (p.type === 'cone' && p.hit) p.col.setCollisionGroups(ig(G.PROP, ALL));
      if (!p.fixed) { p.body.setLinvel({ x: 0, y: 0, z: 0 }, false); p.body.setAngvel({ x: 0, y: 0, z: 0 }, false); p.body.sleep(); }
      p.hit = false; p.gone = false; p.wasMoving = false; p.matrixDirty = true; p.mesh.visible = true; p.lidA = 0; if (p.lid) p.lid.rotation.x = 0;
      p.mesh.position.set(p.home.x, p.home.y, p.home.z); p.mesh.quaternion.set(p.home.q.x, p.home.q.y, p.home.q.z, p.home.q.w);
    }
    for (const d of this.debris) { C.phys.removeRigidBody(d.body); C.scene.remove(d.mesh); } this.debris = [];
    for (const pd of this.peds) this.resetPed(pd);
    for (const dk of this.ducks) { dk.state = 'swim'; dk.mesh.visible = true; dk.mesh.scale.set(1, 1, 1); dk.t = Math.random() * 10; dk.y = 0; }
    this.ducksGone = false;
    for (const c of C.world.cars) { c.alarm = 0; c.rock = 0; c.car.ind.material.opacity = 0; c.car.ind.visible = false; c.car.body.rotation.set(0, 0, 0); }
    for (const w of C.world.wobblers) { w.a = 0; w.v = 0; w.obj.rotation.x = 0; w.obj.rotation.z = 0; }
    const B = this.bus;
    B.lx = BOT.lx0 - 6; B.wait = 0; B.stopped = false;
    this.placeBus(true);
    C.audio?.alarm(false);
  }
  spawnDebrisWheel(tr, W) {
    const R = C.RAPIER, vw = tr.vis.wheels[W.i], p = new T.Vector3(); vw.wheel.getWorldPosition(p);
    const v = tr.vel(), body = C.phys.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y + 0.05, p.z).setLinvel(v.x * 0.8 + (Math.random() - 0.5) * 3, v.y + 2.5, v.z * 0.8 + (Math.random() - 0.5) * 3).setAngvel({ x: (Math.random() - 0.5) * 30, y: 0, z: (Math.random() - 0.5) * 30 }).setCcdEnabled(true));
    C.phys.createCollider(R.ColliderDesc.cylinder(0.016 * tr.s, 0.0625 * tr.s).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setMass(0.4).setFriction(0.5).setRestitution(0.4).setCollisionGroups(ig(G.DEBRIS, G.GROUND | G.PROP | G.DEBRIS)), body);
    const mesh = new T.Group(); const wm = vw.wheel.clone(); wm.position.set(0, 0, 0); mesh.add(wm); mesh.scale.setScalar(tr.s); C.scene.add(mesh);
    this.debris.push({ body, mesh });
  }
  // ---------------- the lollipop lady ----------------
  makePed(spec) {
    const R = C.RAPIER, P = makePerson(spec.kind); C.scene.add(P.group);
    const body = C.phys.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
    const col = C.phys.createCollider(R.ColliderDesc.capsule(0.55, 0.24).setTranslation(0, 0.82, 0).setMass(70).setFriction(0.7).setCollisionGroups(ig(G.PED, ALL)).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), body);
    const pd = { spec, P, body, state: 'still', x: 0, y: 0, z: 0, yaw: 0, near: null, hitOnce: false };
    if (P.sign) pd.flight = {
      state: 'held', destination: null, bin: null, time: 0, duration: 0, height: 0,
      home: P.sign.position.clone(), start: new T.Vector3(), end: new T.Vector3(),
      rotation: new T.Quaternion(), spin: new T.Quaternion(), settle: new T.Quaternion(),
      flat: new T.Euler(Math.PI / 2, 0, 0, 'YXZ'),
    };
    C.colInfo.set(col.handle, { kind: 'ped', ped: pd, name: 'LOLLIPOP LADY' });
    this.resetPed(pd);
    return pd;
  }
  resetPed(pd) {
    const R = C.RAPIER, s = pd.spec;
    if (pd.body.bodyType() !== R.RigidBodyType.KinematicPositionBased) pd.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true); pd.body.setGravityScale(1, true);
    pd.state = 'still'; pd.near = null; pd.hitOnce = false;
    const p = C.world.P(s.s, s.d);
    pd.x = p.x; pd.y = p.y; pd.z = p.z; pd.yaw = -p.th + (s.d < 0 ? -Math.PI / 2 : Math.PI / 2);
    pd.body.setTranslation(p, true); pd.body.setNextKinematicTranslation(p);
    const upright = { x: 0, y: 0, z: 0, w: 1 };
    pd.body.setRotation(upright, true); pd.body.setNextKinematicRotation(upright);
    pd.P.group.position.copy(p); pd.P.group.rotation.set(0, pd.yaw, 0);
    pd.P.legL.rotation.set(0, 0, 0); pd.P.legR.rotation.set(0, 0, 0);
    pd.P.armL.rotation.set(0, 0, 0); pd.P.armR.rotation.set(-0.25, 0, 0);
    if (pd.flight) {
      const { sign, body } = pd.P;
      body.add(sign);
      sign.position.copy(pd.flight.home); sign.rotation.set(0, 0, 0); sign.scale.setScalar(1);
      pd.flight.state = 'held'; pd.flight.destination = null; pd.flight.bin = null;
    }
  }
  hitPed(pd, tv) {
    // off she goes: launched up and away, spinning, falling far too slowly
    const R = C.RAPIER; if (pd.state === 'down') return false;
    this.throwSign(pd);
    pd.state = 'down'; pd.body.setBodyType(R.RigidBodyType.Dynamic, true); pd.body.setGravityScale(0.35, true);
    const vh = Math.hypot(tv.x, tv.z) || 1, k = (14 + vh * 0.6) / vh;
    pd.body.setLinvel({ x: tv.x * k, y: 11, z: tv.z * k }, true); pd.body.setAngvel({ x: 9, y: 26, z: 7 }, true);
    C.audio.sfx('spin');
    const first = !pd.hitOnce; pd.hitOnce = true; return first;
  }

  throwSign(pd) {
    const F = pd.flight, sign = pd.P.sign;
    if (!F || F.state !== 'held') return;
    const { pond, skip } = C.world, roll = Math.random();
    if (pond && roll < 1 / 3) {
      F.destination = 'pond';
      F.end.set(pond.x + 2.5, pond.water + 0.045, pond.z - 1.65);
      F.settle.copy(SIGN_FLAT);
    } else if (skip && roll < 2 / 3) {
      F.destination = 'skip';
      F.end.set(skip.x, skip.y + 0.16, skip.z);
      F.flat.y = skip.yaw;
      F.settle.setFromEuler(F.flat);
    } else if (this.bins.length) {
      F.destination = 'bin';
      let closest = Infinity;
      for (const bin of this.bins) {
        const d = Math.hypot(bin.mesh.position.x - pd.x, bin.mesh.position.z - pd.z);
        if (d < closest) { closest = d; F.bin = bin; }
      }
      this.signBinPose(F);
    } else return;

    C.scene.attach(sign);
    F.start.copy(sign.position); F.rotation.copy(sign.quaternion);
    const distance = Math.hypot(F.end.x - F.start.x, F.end.z - F.start.z);
    F.duration = clamp(1.3 + Math.sqrt(distance) * 0.07, 1.45, 2.3);
    F.height = clamp(4 + distance * 0.16, 5, 65);
    F.time = C.time; F.state = 'flying';
  }

  signBinPose(F) {
    const bin = F.bin.mesh;
    F.end.set(0, 0.74, -0.09).applyQuaternion(bin.quaternion).add(bin.position);
    F.settle.copy(bin.quaternion).multiply(SIGN_IN_BIN);
  }

  syncSign(pd, time) {
    const F = pd.flight, sign = pd.P.sign;
    if (!F || F.state === 'held') return;
    if (F.bin) this.signBinPose(F);
    if (F.state === 'landed') {
      sign.position.copy(F.end); sign.quaternion.copy(F.settle);
      return;
    }
    const u = clamp((time - F.time) / F.duration, 0, 1);
    sign.position.lerpVectors(F.start, F.end, u);
    sign.position.y += 4 * F.height * u * (1 - u);
    F.spin.setFromAxisAngle(SIGN_SPIN, TAU * 4.7 * u);
    sign.quaternion.copy(F.rotation).multiply(F.spin).slerp(F.settle, sstep(0.84, 1, u));
  }

  updatePeds(dt, t) {
    const tr = C.trolley, tp = tr.pos(), tv = tr.vel();
    for (const pd of this.peds) {
      const A = pd.P;
      if (pd.state === 'down') {
        const lv = pd.body.linvel(), fl = Math.min(1, Math.hypot(lv.x, lv.y, lv.z) / 3), w = t * 22;
        A.legL.rotation.x = Math.sin(w) * 1.3 * fl; A.legR.rotation.x = -Math.sin(w * 1.1) * 1.3 * fl;
        A.armL.rotation.x = -2.2 * fl + Math.sin(w * 1.3) * 1.1 * fl; A.armR.rotation.x = -2.2 * fl - Math.sin(w * 0.9) * 1.1 * fl;
        A.armL.rotation.z = Math.cos(w) * 0.9 * fl; A.armR.rotation.z = -Math.cos(w * 1.2) * 0.9 * fl;
        continue;
      }
      const dx = tp.x - pd.x, dz = tp.z - pd.z;
      const want = Math.atan2(-dx, -dz);
      pd.yaw += angDiff(want, pd.yaw) * Math.min(1, dt * 4);
      A.group.rotation.y = pd.yaw;
      const dist = Math.hypot(dx, dz), vh = Math.hypot(tv.x, tv.z);
      if (dist < 4.5 && vh > 5 && !pd.hitOnce) {
        if (!pd.near) pd.near = { min: dist, t };
        else pd.near.min = Math.min(pd.near.min, dist);
      } else if (pd.near && dist > 5) {
        if (pd.near.min < 1.7 && !pd.hitOnce && t - pd.near.t < 3) C.game.ev('nearMiss', { name: 'LOLLIPOP LADY', pts: 300 });
        pd.near = null;
      }
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
  updateDucks(dt, t, active) {
    const W = C.world, pond = W.pond; if (!pond) return;
    for (const dk of this.ducks) {
      if (dk.state === 'swim') { dk.t += dt * 0.3; const lx = dk.lx + Math.cos(dk.t + dk.lf) * 1.5, lf = dk.lf + Math.sin(dk.t * 0.8 + dk.lx) * 1.2; const p = W.botToWorld(lx, lf, this.worldPoint); dk.mesh.position.set(p.x, pond.water - 0.02 + Math.sin(t * 2 + dk.lx) * 0.015, p.z); dk.mesh.rotation.y = -dk.t - Math.PI / 2; }
      else if (dk.state === 'fly') { dk.t += dt; dk.vy += (2.4 - dk.vy) * dt; const p = dk.mesh.position; p.x += dk.vx * dt; p.y += dk.vy * dt; p.z += dk.vz * dt; dk.mesh.rotation.y = Math.atan2(-dk.vx, -dk.vz); dk.mesh.scale.set(1 + Math.sin(t * 30) * 0.4, 1, 1); if (dk.t > 7) { dk.state = 'gone'; dk.mesh.visible = false; } }
    }
    // disturbing them: the trolley on the ground near the pond (not flying over it)
    const tr = C.trolley; if (!active || this.ducksGone) return;
    const p = tr.pos(), u = (p.x - pond.x) / (pond.rx * 1.6), v = (p.z - pond.z) / (pond.rz * 1.6);
    if (u * u + v * v < 1 && (tr.nWheels > 0 || tr.submerged)) { if (this.disturbDucks()) C.game.ev('ducks', {}); }
  }
  // ---------------- the number 37 bus ----------------
  makeBusLine() {
    const R = C.RAPIER, b = makeBus(); C.scene.add(b.group);
    const body = C.phys.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -60, 0));
    const col = C.phys.createCollider(R.ColliderDesc.cuboid(1.25, 2.1, 5.4).setTranslation(0, 2.15, 0).setFriction(0.5).setCollisionGroups(ig(G.GROUND, ALL)), body);
    C.colInfo.set(col.handle, { kind: 'bus', name: 'THE NUMBER 37' });
    this.bus = { b, body, lx: BOT.lx0 - 6, wait: 0, stopped: false,
      rotation: { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } };
    this.placeBus(true);
  }
  stepBus(dt) {
    const B = this.bus;
    if (B.wait > 0) { B.wait -= dt; return; }
    const prev = B.lx;
    B.lx += 8.5 * dt;
    if (prev < -27 && B.lx >= -27 && !B.stopped) { B.wait = 3.5; B.stopped = true; }
    if (B.lx > BOT.lx1 + 6) { B.lx = BOT.lx0 - 6; B.wait = 5; B.stopped = false; this.placeBus(true); }
    else this.placeBus(false);
  }
  placeBus(reset) {
    const B = this.bus, p = C.world.botToWorld(B.lx, 10.2, this.worldPoint);
    p.y = 0.03;
    if (reset) { B.body.setTranslation(p, true); B.body.setRotation(B.rotation, true); }
    B.body.setNextKinematicTranslation(p);
    B.body.setNextKinematicRotation(B.rotation);
    B.x = p.x; B.z = p.z;
  }
  // ---------------- cars, signs ----------------
  alarm(idx) { const c = C.world.cars[idx]; if (!c) return false; const first = c.alarm <= 0; c.alarm = 7; c.rock = 1; return first; }
  wobble(i, dir) { const w = C.world.wobblers[i]; if (!w) return; w.v += clamp(dir, -6, 6); }
  update(dt, t, active) {
    if (active) this.updatePeds(dt, t);
    for (const pd of this.peds) {
      const F = pd.flight;
      if (F?.state === 'flying' && t - F.time >= F.duration) {
        F.state = 'landed';
        if (F.destination === 'pond') C.fx.pondSplash(F.end.x, F.end.z, 0.68);
        if (F.bin) {
          F.bin.lidA = 2.2;
          F.bin.lid.rotation.x = -F.bin.lidA;
          F.bin.matrixDirty = true;
        }
      }
    }
    this.updateDucks(dt, t, active);
    if (!active) return;
    for (const c of C.world.cars) { if (c.alarm > 0) { c.alarm -= dt; c.car.ind.material.opacity = Math.sin(t * 12) > 0 ? 0.85 : 0; if (c.alarm <= 0) c.car.ind.material.opacity = 0; c.car.ind.visible = c.car.ind.material.opacity > 0; } if (c.rock > 0) { c.rock = Math.max(0, c.rock - dt * 0.7); c.car.body.rotation.z = Math.sin(t * 9) * 0.05 * c.rock; } }
    this.refreshAlarm();
    for (const w of C.world.wobblers) { if (w.a === 0 && w.v === 0) continue; w.v += (-w.a * 60 - w.v * 3.2) * dt; w.a += w.v * dt; if (Math.abs(w.a) < 0.002 && Math.abs(w.v) < 0.01) { w.a = 0; w.v = 0; } w.obj.rotation.x = w.a; }
    for (const b of C.world.blink || []) b.visible = Math.sin(t * 5.2) > -0.2;
  }
  refreshAlarm() { C.audio.alarm(C.world.cars.some(c => c.alarm > 0)); }
  sync(dt, time) {
    const camera = C.camera, cp = camera.position;
    if (this.instances) {
      camera.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    }
    for (const p of this.list) {
      if (p.gone) continue;
      if (!p.fixed) {
        const moving = !p.body.isSleeping();
        if (moving || p.wasMoving) {
          p.mesh.position.copy(p.body.translation());
          p.mesh.quaternion.copy(p.body.rotation());
          p.matrixDirty = true;
        }
        p.wasMoving = moving;
      }
      const dx = p.mesh.position.x - cp.x, dz = p.mesh.position.z - cp.z;
      p.mesh.visible = dx * dx + dz * dz < p.far2;
      if (p.batch && p.mesh.visible) {
        this.sphere.center.copy(p.mesh.position); this.sphere.radius = p.batch.radius;
        p.mesh.visible = this.frustum.intersectsSphere(this.sphere);
      }
      if (p.lid && p.hit && p.lidA < 2.2) {
        p.lidA = Math.min(2.2, p.lidA + dt * 7.2);
        p.lid.rotation.x = -p.lidA;
        p.matrixDirty = true;
      }
    }
    if (this.instances) for (const batch of this.instances.values()) this.syncInstances(batch);
    for (const pd of this.peds) {
      const group = pd.P.group;
      if (pd.state === 'down') { group.position.copy(pd.body.translation()); group.quaternion.copy(pd.body.rotation()); }
      const dx = group.position.x - cp.x, dz = group.position.z - cp.z;
      group.visible = dx * dx + dz * dz < 170 ** 2;
      this.syncSign(pd, time);
    }
    for (const d of this.debris) {
      d.mesh.position.copy(d.body.translation()); d.mesh.quaternion.copy(d.body.rotation());
    }
    const B = this.bus;
    B.b.group.position.copy(B.body.translation());
    B.b.group.quaternion.copy(B.rotation);
    B.b.group.visible = B.lx > BOT.lx0 && B.lx < BOT.lx1;
  }
  syncInstances({ props, packed, meshes }) {
    let count = 0, upload = false;
    for (const p of props) {
      if (p.gone || !p.mesh.visible) continue;
      if (packed[count] !== p || p.matrixDirty) {
        p.mesh.updateMatrixWorld(true);
        for (let i = 0; i < meshes.length; i++) meshes[i].setMatrixAt(count, p.parts[i].matrixWorld);
        packed[count] = p; p.matrixDirty = false; upload = true;
      }
      count++;
    }
    packed.length = count;
    for (const mesh of meshes) {
      mesh.count = count;
      if (upload) { mesh.instanceMatrix.updateRange.count = count * 16; mesh.instanceMatrix.needsUpdate = true; }
    }
  }
}
