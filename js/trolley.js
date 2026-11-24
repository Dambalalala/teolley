import { C, G, ig, ALL } from './core.js';
import { clamp, lerp, angDiff, TAU, sstep } from './util.js';
import { makeTrolley, TD, VARIANTS } from './models.js';
const T = C.T;

// Per-trolley handling. Push is self-propulsion (m/s^2) up to pushV; crr is rolling resistance, drag is air drag.
// level: self-righting torque; gripH: how far above the contact the sideways grip acts (higher = less tippy);
// inert: rotational inertia multiplier; pull: a front caster that sits permanently off-straight (rad).
export const VPARAM = {
  dave: { mass: 28, push: 3.4, pushV: 8.6, crr: 0.012, drag: 0.00145, mu: 0.48, muC: 0.3, steer: 1.0, wobble: 1.0, cap: 10, brake: 0.42, hp: 1.0, level: 2.6, gripH: 0.22, inert: 1  },
  demon: { mass: 18, push: 4.4, pushV: 10.2, crr: 0.007, drag: 0.0010, mu: 0.45, muC: 0.32, steer: 1.12, wobble: 1.3, cap: 7, brake: 0.32, hp: 0.75, level: 1.6, gripH: 0.12, inert: 0.88  },
  tank: { mass: 72, push: 2.3, pushV: 7.4, crr: 0.011, drag: 0.0013, mu: 0.52, muC: 0.28, steer: 0.68, wobble: 0.7, cap: 16, brake: 0.3, hp: 2.2, level: 4.6, gripH: 0.32, inert: 1.3  },
  pensioner: { mass: 30, push: 3.5, pushV: 9.4, crr: 0.008, drag: 0.00112, mu: 0.47, muC: 0.34, steer: 0.9, wobble: 1.4, cap: 10, brake: 0.38, hp: 1.0, level: 3.2, gripH: 0.26, inert: 1, badWheel: 0, pull: 0.08  },
  green: { mass: 24, push: 3.3, pushV: 8.4, crr: 0.013, drag: 0.002, mu: 0.56, muC: 0.34, steer: 1.5, wobble: 0.6, cap: 12, brake: 0.46, hp: 1.0, level: 2.4, gripH: 0.2, inert: 0.95  },
};
// Stat bars (1-10) worked out from the numbers above, so what the select screen says is what the physics does.
export function trolleyStats(key) {
  const P = VPARAM[key], c = (v) => Math.max(1, Math.min(10, Math.round(v)));
  const vt = Math.sqrt(9.81 * (0.09 - P.crr) / P.drag); // free-rolling speed on a typical stretch of the hill
  const speed = 1 + 9 * (0.8 * (vt - 18) / 10 + 0.2 * (P.push - 2.0) / 2.4);
  const stab = 1 + 9 * (0.45 * (P.level - 1) / 3.6 + 0.3 * (P.gripH - 0.1) / 0.22 + 0.25 * Math.log(P.mass / 15) / Math.log(75 / 15) + 0.05);
  const hand = 1 + 9 * (0.75 * (P.steer - 0.6) / 0.9 + 0.15 * (P.mu - 0.4) / 0.16 - 0.12 * (P.wobble - 1) - 2.0 * (P.pull || 0) + 0.12);
  return { speed: c(speed), stability: c(stab), handling: c(hand) };
}

const _q = new T.Quaternion(), _v = new T.Vector3(), _w = new T.Vector3(), _a = new T.Vector3(), _n = new T.Vector3();
export class Trolley {
  constructor(vkey) {
    this.key = vkey; this.V = VARIANTS[vkey]; this.P = VPARAM[vkey]; this.s = this.V.scale;
    const s = this.s, P = this.P;
    this.mass = P.mass;
    // inertia of a ~1m box-ish trolley (scaled); generous pitch/roll inertia keeps it from feeling twitchy
    const ik = P.inert || 1; this.I = { x: P.mass * 0.19 * s * s * ik, y: P.mass * 0.12 * s * s * ik, z: P.mass * 0.13 * s * s * ik };
    this.vis = makeTrolley(vkey); this.vis.root.userData.noCull = true; C.scene.add(this.vis.root);
    this.R = new Float64Array(9);
    this.wheels = TD.wheels.map((w, i) => ({ i, lx: w.x * s, lz: w.z * s, front: w.front, phi: 0, stick: 0, stickA: 0, contact: false, wasContact: false, comp: 0, prevComp: 0, hitY: null, load: 0, hp: 1, gone: false, roll: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 1, nz: 0, slip: 0, blocked: 0, kerbT: 0 }));
    this.attachY = (TD.pivotH + TD.GY) * s; this.Ln = TD.pivotH * s + 0.010; this.k = P.mass * 9.81 / (4 * 0.010); this.cd = 2 * 0.7 * Math.sqrt(this.k * P.mass / 4);
    this.hp = { basket: 1, handle: 1 };
    this.colliders = new Set(); this.parts = new Map();
    this.items = [];
    this.airT = 0; this.air = null; this.groundT = 0; this.hopCD = 0; this.pushPh = 0; this.steerFlip = 0; this.steerFlipT = 2;
    this.tilt = 0; this.touching = false; this.submerged = false; this.scrape = 0;
    this.makeBody(C.world.start);
  }
  makeBody(at) {
    const R = C.RAPIER, s = this.s, P = this.P;
    const desc = R.RigidBodyDesc.dynamic().setTranslation(at.x, at.y + 0.5 * s + 0.01, at.z).setCcdEnabled(true).setCanSleep(false).setAngularDamping(0.05)
      .setAdditionalMassProperties(P.mass, { x: 0, y: 0, z: 0 }, this.I, { x: 0, y: 0, z: 0, w: 1 });
    this.body = C.phys.createRigidBody(desc);
    this.setYaw(at.yaw || 0);
    const H = h => (h + TD.GY);
    const add = (part, hx, hy, hz, x, y, z, rx = 0, fr = 0.45) => {
      const q = new T.Quaternion().setFromEuler(new T.Euler(rx, 0, 0));
      const d = R.ColliderDesc.cuboid(hx * s, hy * s, hz * s).setTranslation(x * s, y * s, z * s).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setDensity(0)
        .setFriction(fr).setRestitution(0.04).setCollisionGroups(ig(G.TROLLEY, ALL)).setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS | R.ActiveEvents.COLLISION_EVENTS).setContactForceEventThreshold(250 * P.mass / 28);
      const c = C.phys.createCollider(d, this.body); this.colliders.add(c.handle); this.parts.set(c.handle, part); C.colInfo.set(c.handle, { kind: 'trolley', part }); return c;
    };
    add('floor', 0.24, 0.015, 0.37, 0, H(0.56), 0);
    add('basket', 0.015, 0.21, 0.44, -0.265, H(0.77), -0.05); add('basket', 0.015, 0.21, 0.44, 0.265, H(0.77), -0.05);
    add('front', 0.27, 0.22, 0.015, 0, H(0.77), -0.44, -Math.atan2(0.12, 0.42));
    add('basket', 0.27, 0.21, 0.015, 0, H(0.77), 0.385);
    add('handle', 0.29, 0.03, 0.05, 0, H(1.0), 0.53);
    add('base', 0.21, 0.03, 0.44, 0, H(0.19), -0.02, 0, 0.12);
  }
  setYaw(yaw) { _q.setFromEuler(new T.Euler(0, yaw, 0)); this.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true); }
  reset(at) {
    const s = this.s; this.body.setTranslation({ x: at.x, y: at.y + 0.5 * s + 0.01, z: at.z }, true); this.setYaw(at.yaw || 0);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true); this.qpT = 0; this.qp = null;
    for (const w of this.wheels) Object.assign(w, { phi: 0, stick: 0, contact: false, wasContact: false, comp: 0, prevComp: 0, hitY: null, hp: 1, gone: false, blocked: 0 });
    this.hp.basket = 1; this.hp.handle = 1; this.airT = 0; this.air = null; this.submerged = false;
    this.safe = null; this.safeT = 0; this.landT = null; this.landOK = true; this.hopCD = 0; this.pushPh = 0; this.steerFlip = 0; this.steerFlipT = 2; this.heldAtTakeoff = null;
    for (const w of this.vis.wheels) { w.pivot.visible = true; }
    this.vis.basket.scale.set(1, 1, 1); this.vis.basket.rotation.set(0, 0, 0); this.vis.handle.rotation.set(0, 0, 0);
  }
  dispose() { C.scene.remove(this.vis.root); for (const h of this.colliders) C.colInfo.delete(h); C.phys.removeRigidBody(this.body); }
  updR() { const q = this.body.rotation(), x = q.x, y = q.y, z = q.z, w = q.w, R = this.R; R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w); R[2] = 2 * (x * z + y * w); R[3] = 2 * (x * y + z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w); R[6] = 2 * (x * z - y * w); R[7] = 2 * (y * z + x * w); R[8] = 1 - 2 * (x * x + y * y); }
  // world inverse inertia applied to a world vector
  invI(ax, ay, az, o) { const R = this.R, lx = R[0] * ax + R[3] * ay + R[6] * az, ly = R[1] * ax + R[4] * ay + R[7] * az, lz = R[2] * ax + R[5] * ay + R[8] * az; const tx = lx / this.I.x, ty = ly / this.I.y, tz = lz / this.I.z; o.x = R[0] * tx + R[1] * ty + R[2] * tz; o.y = R[3] * tx + R[4] * ty + R[5] * tz; o.z = R[6] * tx + R[7] * ty + R[8] * tz; return o; }
  effM(nx, ny, nz, rx, ry, rz) { this.invI(ry * nz - rz * ny, rz * nx - rx * nz, rx * ny - ry * nx, _a); const ux = _a.y * rz - _a.z * ry, uy = _a.z * rx - _a.x * rz, uz = _a.x * ry - _a.y * rx; return 1 / (1 / this.mass + nx * ux + ny * uy + nz * uz); }
  imp(jx, jy, jz, rx, ry, rz) { const v = this.v, w = this.w, im = 1 / this.mass; v.x += jx * im; v.y += jy * im; v.z += jz * im; this.invI(ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx, _a); w.x += _a.x; w.y += _a.y; w.z += _a.z; }

  // ---------------- physics substep (before world.step) ----------------
  step(dt, ctl, t) {
    const b = this.body, R = this.R, s = this.s, P = this.P;
    this.updR();
    const p = b.translation(), lv = b.linvel(), av = b.angvel();
    this.v = { x: lv.x, y: lv.y, z: lv.z }; this.w = { x: av.x, y: av.y, z: av.z };
    const v = this.v, w = this.w;
    const upx = R[1], upy = R[4], upz = R[7], fwx = -R[2], fwy = -R[5], fwz = -R[8], rtx = R[0], rty = R[3], rtz = R[6];
    const sp = Math.hypot(v.x, v.y, v.z), vfwd = v.x * fwx + v.y * fwy + v.z * fwz;
    const dmg = 1 - (this.wheels.reduce((a, w2) => a + w2.hp, 0) / 4) * 0.7 - this.hp.basket * 0.15 - this.hp.handle * 0.15;
    const Rap = C.RAPIER;
    // ---- wheels: raycast suspension ----
    let n = 0, nax = 0, nay = 0, naz = 0;
    for (const W of this.wheels) {
      W.wasContact = W.contact; W.contact = false; W.load = 0;
      if (W.gone) continue;
      const ax = p.x + R[0] * W.lx + R[1] * this.attachY + R[2] * W.lz, ay = p.y + R[3] * W.lx + R[4] * this.attachY + R[5] * W.lz, az = p.z + R[6] * W.lx + R[7] * this.attachY + R[8] * W.lz;
      const ray = new Rap.Ray({ x: ax, y: ay, z: az }, { x: -upx, y: -upy, z: -upz });
      const hit = C.phys.castRayAndGetNormal(ray, this.Ln + 0.08, true, undefined, ig(G.TROLLEY, G.GROUND), undefined, b);
      if (!hit) { W.hitY = null; continue; }
      let tt = hit.timeOfImpact; const hx = ax - upx * tt, hz = az - upz * tt;
      // potholes: virtual dips
      let dip = 0; for (const ph of C.world.potholes) { const dx = hx - ph.x, dz = hz - ph.z, d2 = dx * dx + dz * dz; if (d2 < ph.r * ph.r) dip = Math.max(dip, ph.depth * (1 - d2 / (ph.r * ph.r))); }
      tt += dip / Math.max(0.3, upy);
      const gy = ay - upy * tt;
      // a sudden step up (kerb) at this wheel
      if (W.hitY != null && W.wasContact) {
        const rise = gy - W.hitY;
        if (rise > 0.075 * s && rise < 0.5) {
          const rx2 = ax - p.x, ry2 = ay - p.y, rz2 = az - p.z, vx = v.x + w.y * rz2 - w.z * ry2, vz = v.z + w.x * ry2 - w.y * rx2, vh = Math.hypot(vx, vz);
          if (vh < 2.3 * Math.sqrt(s)) { // jammed against it
            const J = Math.min(vh, 2) * this.mass * 0.35; this.imp(-vx / (vh || 1) * J, 0, -vz / (vh || 1) * J, rx2, ry2, rz2); W.blocked = 0.08; W.kerbT = t;
            tt = ay - W.hitY; // keep the wheel down below the step
          } else if (t - W.kerbT > 0.12) {
            const J = this.mass * (0.25 + vh * 0.03) * Math.min(1, rise / 0.13); this.imp(upx * J * 0.7, upy * J * 0.7, upz * J * 0.7, 0, 0, 0); this.imp(upx * J * 0.3, upy * J * 0.3, upz * J * 0.3, rx2 * 0.5, ry2 * 0.5, rz2 * 0.5);
            const Jb = this.mass / 4 * vh * 0.05; this.imp(-vx / (vh || 1) * Jb, 0, -vz / (vh || 1) * Jb, rx2, ry2, rz2);
            W.kerbT = t; C.game && C.game.ev('kerb', { wheel: W.i, v: vh, rise });
            this.hurtWheel(W, (vh - 2.5) * 0.03 * (rise / 0.13));
          }
        }
      }
      W.hitY = ay - upy * tt;
      if (tt >= this.Ln) continue;
      W.contact = true; n++;
      W.px = ax - upx * tt; W.py = ay - upy * tt; W.pz = az - upz * tt; W.nx = hit.normal.x; W.ny = hit.normal.y; W.nz = hit.normal.z;
      if (!(Math.abs(W.nx) + Math.abs(W.ny) + Math.abs(W.nz) > 0.5) || W.ny < 0) { W.nx = upx; W.ny = upy; W.nz = upz; }
      nax += W.nx; nay += W.ny; naz += W.nz;
      const rxw = ax - p.x, ryw = ay - p.y, rzw = az - p.z;
      const vax = v.x + w.y * rzw - w.z * ryw, vay = v.y + w.z * rxw - w.x * rzw, vaz = v.z + w.x * ryw - w.y * rxw;
      const comp = this.Ln - tt, cdot = clamp(-(vax * upx + vay * upy + vaz * upz), -4, 4); W.prevComp = comp; W.comp = comp;
      let F = this.k * comp + this.cd * cdot; const stop = 0.028 * s;
      if (comp > stop) { F += this.k * 18 * (comp - stop); if (cdot > 2.6 && !W.wasContact) this.hurtWheel(W, (cdot - 2.6) * 0.03); }
      if (F < 0) F = 0;
      const cap = this.mass * 9.81 * 2.6;
      const rx = ax - p.x, ry = ay - p.y, rz = az - p.z;
      if (F > cap) {
        // bottoming out: soak up the rest of a landing through the centre of mass, so one wheel can't flip it
        const vn = v.x * W.nx + v.y * W.ny + v.z * W.nz;
        if (vn < 0) { const j = Math.min(-vn * this.mass * 0.25, (F - cap) * dt) / this.mass; v.x += W.nx * j; v.y += W.ny * j; v.z += W.nz * j; }
        F = cap;
      }
      W.load = F;
      this.imp(upx * F * dt, upy * F * dt, upz * F * dt, rx, ry, rz);
    }
    for (const W of this.wheels) if (!W.contact) W.prevComp = 0;
    this.nWheels = n;
    // a landing roughly the right way up gets a moment of help settling onto its wheels
    if (n > 0 && this.airT > 0.15) { this.landT = t; this.landOK = upy > 0.45; }
    const landK = this.landOK && this.landT != null ? clamp((t - this.landT) / 0.5, 0, 1) : 1;
    // ---- caster swivel (front) ----
    const wob = P.wobble * (1 + dmg * 2.2);
    for (const W of this.wheels) {
      if (!W.front) { W.phi = 0; continue; }
      const rx = R[0] * W.lx + R[1] * this.attachY + R[2] * W.lz, ry = R[3] * W.lx + R[4] * this.attachY + R[5] * W.lz, rz = R[6] * W.lx + R[7] * this.attachY + R[8] * W.lz;
      const vx = v.x + w.y * rz - w.z * ry, vy = v.y + w.z * rx - w.x * rz, vz = v.z + w.x * ry - w.y * rx;
      const lx = vx * rtx + vy * rty + vz * rtz, lf = vx * fwx + vy * fwy + vz * fwz, vp = Math.hypot(lx, lf);
      if (vp > 0.05) { const tgt = Math.atan2(lx, lf), rate = vp / (TD.trail * s * 2.5); const dphi = angDiff(tgt, W.phi); W.phi += clamp(dphi, -rate * dt, rate * dt); }
      // sticky caster: now and then one jams at an angle for a moment
      if (W.stick > 0) W.stick -= dt; else if (vp > 2 && Math.random() < dt * 0.12 * wob) { W.stick = 0.25 + Math.random() * 0.45; W.stickA = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35); }
      if (P.badWheel === W.i && vp > 1 && W.stick <= 0 && Math.random() < dt * 0.25) { W.stick = 0.25 + Math.random() * 0.3; W.stickA = 0.3 * (Math.random() < 0.75 ? 1 : -1); }
      const shimmy = wob * (0.015 + 0.06 * sstep(3, 15, vp)) * Math.sin(t * TAU * (4 + vp * 0.45) + W.i * 1.7) * (W.hp < 0.6 ? 2.5 : 1);
      W.phiEff = W.phi + shimmy + (W.stick > 0 ? W.stickA : 0);
    }
    // ---- tyre friction: rolling/braking along each wheel, sideways grip at the axle ----
    const braking = ctl.brake && vfwd > 0.8;
    for (let it = 0; it < 2; it++) for (const W of this.wheels) {
      if (!W.contact) continue;
      const nx = W.nx, ny = W.ny, nz = W.nz;
      let fx = fwx, fy = fwy, fz = fwz;
      if (W.front) { const c = Math.cos(W.phiEff || 0), sn = Math.sin(W.phiEff || 0); fx = fwx * c + rtx * sn; fy = fwy * c + rty * sn; fz = fwz * c + rtz * sn; }
      const fn = fx * nx + fy * ny + fz * nz; fx -= nx * fn; fy -= ny * fn; fz -= nz * fn; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      const qx = ny * fz - nz * fy, qy = nz * fx - nx * fz, qz = nx * fy - ny * fx;
      const rx = W.px - p.x, ry = W.py - p.y, rz = W.pz - p.z;
      const vx = v.x + w.y * rz - w.z * ry, vy = v.y + w.z * rx - w.x * rz, vz = v.z + w.x * ry - w.y * rx;
      const vl = vx * fx + vy * fy + vz * fz;
      // sideways grip acts a little above the contact so cornering doesn't tip it over on every bend
      const gh = P.gripH * s, lrx = rx + upx * gh, lry = ry + upy * gh, lrz = rz + upz * gh;
      const lvx = v.x + w.y * lrz - w.z * lry, lvy = v.y + w.z * lrx - w.x * lrz, lvz = v.z + w.x * lry - w.y * lrx;
      const vq = lvx * qx + lvy * qy + lvz * qz;
      const Fdt = W.load * dt / 2;
      const mu = (W.front ? P.muC : P.mu) * (W.hp < 0.3 ? 0.7 : 1) * (0.3 + 0.7 * landK);
      let jq = -vq * this.effM(qx, qy, qz, lrx, lry, lrz) * 0.9; const lim = mu * Fdt; if (Math.abs(jq) > lim) jq = Math.sign(jq) * lim;
      W.slip = Math.abs(vq) > 0.6 ? Math.abs(vq) : 0;
      this.imp(qx * jq, qy * jq, qz * jq, lrx, lry, lrz);
      // a bent front wheel drags the nose to the right (a small steady sideways shove at that wheel)
      if (it === 0 && P.pull && P.badWheel === W.i) { const jp = -P.pull * W.load * dt * sstep(0.4, 3, Math.abs(vl)); this.imp(qx * jp, qy * jp, qz * jp, lrx, lry, lrz); }
      let crr = P.crr + (W.hp < 0.6 ? 0.09 * (0.6 - W.hp) / 0.6 : 0) + (C.world.surfaceDrag ? C.world.surfaceDrag(W.px, W.pz) : 0);
      if (braking) crr += P.brake;
      const jlMax = crr * Fdt; let jl = -vl * this.effM(fx, fy, fz, rx, ry, rz); if (Math.abs(jl) > jlMax) jl = Math.sign(jl) * jlMax;
      this.imp(fx * jl, fy * jl, fz * jl, rx, ry, rz);
      if (it === 1) W.roll = vl;
    }
    // ---- driver inputs ----
    const grounded = n >= 2, hl = Math.hypot(fwx, fwz) || 1;
    if (this.hopCD > 0) this.hopCD -= dt;
    if (grounded && !this.submerged) {
      const steerIn = ((ctl.right ? 1 : 0) - (ctl.left ? 1 : 0)) * (this.hp.handle < 0.5 && this.steerFlip > 0 ? -1 : 1);
      const handleK = this.hp.handle < 0.5 ? 0.55 : 1;
      const spd = Math.hypot(v.x, v.z), wt = -steerIn * Math.min(2.6, 7.5 / (spd + 0.6)) * P.steer * handleK;
      const navx = nax / n, navy = nay / n, navz = naz / n, wy = w.x * navx + w.y * navy + w.z * navz;
      // steering yaws the trolley about its fixed rear axle (like swinging the handle), so the back wheels don't scrub against it;
      // let go and it straightens up gently
      const dw = steerIn !== 0 ? clamp((wt - wy) * 24 * dt, -30 * dt, 30 * dt) : clamp(-wy * 2.2 * dt, -3 * dt, 3 * dt);
      if (dw !== 0) {
        w.x += navx * dw; w.y += navy * dw; w.z += navz * dw;
        const ry0 = -0.5 * s, rz0 = TD.wheels[2].z * s, rrx = R[1] * ry0 + R[2] * rz0, rry = R[4] * ry0 + R[5] * rz0, rrz = R[7] * ry0 + R[8] * rz0;
        v.x -= dw * (navy * rrz - navz * rry); v.y -= dw * (navz * rrx - navx * rrz); v.z -= dw * (navx * rry - navy * rrx);
      }
      // push: hold for a steady shove, tap for an extra stroke each time
      // pushing still helps once it's rolling, just less and less the faster it goes
      const pk = vfwd < P.pushV ? 1 - 0.7 * Math.max(0, vfwd) / P.pushV : 0.3 * Math.max(0, 1 - (vfwd - P.pushV) / (P.pushV * 1.2));
      if (ctl.pushTap && pk > 0) { const dv = 0.42 * (P.push / 2.8) * pk; v.x += fwx / hl * dv; v.z += fwz / hl * dv; C.game && C.game.ev('push', { dv }); }
      if (ctl.push) { this.pushPh += dt * TAU * 2.2; const stroke = 0.55 + 0.9 * Math.max(0, Math.sin(this.pushPh)); const a = P.push * pk * stroke; v.x += fwx / hl * a * dt; v.z += fwz / hl * a * dt; }
      if (ctl.brake && vfwd < 0.8 && vfwd > -2.6) { const a = P.push * 0.55; v.x -= fwx / hl * a * dt; v.z -= fwz / hl * a * dt; }
      // keep it on its wheels unless something big happens: a gentle roll-levelling torque
      const cx = upy * navz - upz * navy, cy2 = upz * navx - upx * navz, cz = upx * navy - upy * navx, tr = cx * fwx + cy2 * fwy + cz * fwz;
      const lk = P.level / 2.5;
      if (Math.abs(tr) < 0.55 + Math.max(0, lk - 1) * 0.15) { const wr = w.x * fwx + w.y * fwy + w.z * fwz, tq = (tr * this.mass * P.level - wr * this.mass * 0.25 * lk) * dt; this.invI(fwx * tq, fwy * tq, fwz * tq, _a); w.x += _a.x; w.y += _a.y; w.z += _a.z; }
    }
    if (landK < 1) {
      // settling after a landing: steer pitch and roll rates towards lying flat on the ground, at a capped rate
      let gx, gy, gz;
      if (n > 0) { const nl = Math.hypot(nax, nay, naz) || 1; gx = nax / nl; gy = nay / nl; gz = naz / nl; }
      else { const e = 0.8, W2 = C.world, hx2 = W2.groundY(p.x + e, p.z) - W2.groundY(p.x - e, p.z), hz2 = W2.groundY(p.x, p.z + e) - W2.groundY(p.x, p.z - e), gl = Math.hypot(hx2, 2 * e, hz2); gx = -hx2 / gl; gy = 2 * e / gl; gz = -hz2 / gl; }
      const a = (1 - landK) * 0.3;
      const lx = w.x * rtx + w.y * rty + w.z * rtz, lz = -(w.x * fwx + w.y * fwy + w.z * fwz);
      const ex = -(fwx * gx + fwy * gy + fwz * gz), ez = -(rtx * gx + rty * gy + rtz * gz);
      const dx = (clamp(ex * 7, -4.5, 4.5) - lx) * a, dz = (clamp(ez * 7, -4.5, 4.5) - lz) * a;
      w.x += rtx * dx - fwx * dz; w.y += rty * dx - fwy * dz; w.z += rtz * dx - fwz * dz;
    }
    // hop
    if (ctl.hop && this.hopCD <= 0 && n >= 2 && !this.submerged) { v.y += 3.15; w.x += rtx * 0.9; w.y += rty * 0.9; w.z += rtz * 0.9; this.hopCD = 0.55; C.game && C.game.ev('hop', {}); }
    // ---- air control ----
    const airborne = n === 0 && !this.touching;
    if (airborne) {
      // keys already held at take-off (pushing, braking) don't flip you until you press them again
      if (this.airT === 0) this.heldAtTakeoff = { push: !!ctl.push, brake: !!ctl.brake };
      if (this.heldAtTakeoff.push && !ctl.push) this.heldAtTakeoff.push = false;
      if (this.heldAtTakeoff.brake && !ctl.brake) this.heldAtTakeoff.brake = false;
      this.airT += dt;
      if (this.airT > 0.08 && !(this.qpT > 0)) {
        const auth = clamp((this.airT - 0.12) / 0.3, 0, 1);
        // body-frame angular velocity
        const lx = w.x * rtx + w.y * rty + w.z * rtz, ly = w.x * upx + w.y * upy + w.z * upz, lz = w.x * -fwx + w.y * -fwy + w.z * -fwz;
        let nlx = lx, nly = ly, nlz = lz;
        const pin = (ctl.brake && !this.heldAtTakeoff.brake ? 1 : 0) - (ctl.push && !this.heldAtTakeoff.push ? 1 : 0), yin = (ctl.left ? 1 : 0) - (ctl.right ? 1 : 0);
        if (pin) { if (pin * nlx < 5.5) nlx += pin * 10 * auth * dt; } else nlx *= 1 - 2.2 * dt;
        if (yin) { if (yin * nly < 6.5) nly += yin * 12 * auth * dt; } else nly *= 1 - 2.2 * dt;
        const gx = p.x, gz = p.z, e = 0.8, W2 = C.world, hx2 = W2.groundY(gx + e, gz) - W2.groundY(gx - e, gz), hz2 = W2.groundY(gx, gz + e) - W2.groundY(gx, gz - e);
        let gnx = -hx2, gny = 2 * e, gnz = -hz2; const gl = Math.hypot(gnx, gny, gnz); gnx /= gl; gny /= gl; gnz /= gl;
        const rollErr = rtx * gnx + rty * gny + rtz * gnz, pitchErr = fwx * gnx + fwy * gny + fwz * gnz;
        nlz += -rollErr * 6 * dt; nlz *= 1 - 2.5 * dt; // roll levels itself
        if (!pin && upy > 0) nlx += -pitchErr * 5.5 * dt;
        // rebuild world angular velocity from body axes: pitch about right, spin about up, roll about back
        w.x = rtx * nlx + upx * nly - fwx * nlz; w.y = rty * nlx + upy * nly - fwy * nlz; w.z = rtz * nlx + upz * nly - fwz * nlz;
        if (this.air) { this.air.pitch += nlx * dt; this.air.yaw += nly * dt; this.air.roll += nlz * dt; }
      }
    } else this.airT = 0;
    // ---- drag, water ----
    const dk = P.drag * sp * dt; v.x -= v.x * dk; v.y -= v.y * dk; v.z -= v.z * dk;
    if (this.submerged) { v.x *= 1 - 2.5 * dt; v.z *= 1 - 2.5 * dt; v.y = v.y * (1 - 3 * dt) + 7 * dt; w.x *= 1 - 2 * dt; w.y *= 1 - 2 * dt; w.z *= 1 - 2 * dt; }
    const vm = Math.hypot(v.x, v.y, v.z); if (vm > 45) { v.x *= 45 / vm; v.y *= 45 / vm; v.z *= 45 / vm; }
    const wm = Math.hypot(w.x, w.y, w.z); if (wm > 25) { w.x *= 25 / wm; w.y *= 25 / wm; w.z *= 25 / wm; }
    if (!(isFinite(v.x) && isFinite(v.y) && isFinite(v.z) && isFinite(w.x) && isFinite(w.y) && isFinite(w.z))) { this.recover(); return; }
    b.setLinvel(v, true); b.setAngvel(w, true);
    this.qpAssist(dt, airborne);
    if (this.up > 0.8 && n >= 3 && (!this.safeT || t - this.safeT > 0.5)) { this.safeT = t; const q = b.rotation(); this.safe = { p: { x: p.x, y: p.y, z: p.z }, q: { x: q.x, y: q.y, z: q.z, w: q.w } }; }
  }
  recover() {
    const b = this.body, S = this.safe || { p: C.world.start, q: { x: 0, y: 0, z: 0, w: 1 } };
    b.setTranslation({ x: S.p.x, y: S.p.y + 0.3, z: S.p.z }, true); b.setRotation(S.q, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  hurtWheel(W, amt) {
    if (amt <= 0 || W.gone) return; W.hp -= amt / this.P.hp;
    if (W.hp <= 0) { W.hp = 0; W.gone = true; C.game && C.game.ev('wheelLost', { wheel: W.i }); this.dropWheel(W); }
    else C.game && C.game.ev('damage', { part: 'wheel', amt });
  }
  hurt(part, amt) {
    if (amt <= 0) return;
    if (part === 'handle') { this.hp.handle = Math.max(0, this.hp.handle - amt / this.P.hp); }
    else if (part === 'base') { this.updR(); const fronts = this.wheels.filter(w => w.front && !w.gone); for (const w of fronts) this.hurtWheel(w, amt * 0.5); }
    else { this.hp.basket = Math.max(0, this.hp.basket - amt / this.P.hp); }
    C.game && C.game.ev('damage', { part, amt });
  }
  dropWheel(W) {
    const vw = this.vis.wheels[W.i]; vw.pivot.visible = false;
    C.props && C.props.spawnDebrisWheel(this, W);
  }
  capacity() { return Math.max(2, Math.round(this.P.cap * (0.35 + 0.65 * this.hp.basket))); }
  // ---------------- after the physics step ----------------
  post(dt, t) {
    this.updR(); const R = this.R, p = this.body.translation();
    // touching anything with the body (for airborne logic, scraping)
    this.touching = false; let ground = false;
    for (const h of this.colliders) {
      const c = C.phys.getCollider(h);
      C.phys.contactPairsWith(c, o => {
        if (this.touching && ground) return; if (this.colliders.has(o.handle)) return;
        const inf = C.colInfo.get(o.handle); if (inf && (inf.kind === 'item' || inf.kind === 'debris')) return; // shopping in the basket doesn't count
        C.phys.contactPair(c, o, (m) => { if (m.numContacts() > 0 && m.contactDist(0) < 0.03) { this.touching = true; if (inf && inf.kind === 'ground') ground = true; } });
      });
    }
    this.hullGround = ground;
    // pond
    const pond = C.world.pond; this.submerged = false;
    if (pond) { const u = (p.x - pond.x) / pond.rx, v2 = (p.z - pond.z) / pond.rz; if (u * u + v2 * v2 < 1.05 && p.y < pond.water + 0.25 * this.s) this.submerged = true; }
    // tilt and crash
    this.up = R[4];
  }
  sync(dtR, t) {
    const p = this.body.translation(), q = this.body.rotation(), V = this.vis;
    V.root.position.set(p.x, p.y, p.z); V.root.quaternion.set(q.x, q.y, q.z, q.w);
    for (const W of this.wheels) {
      const vw = V.wheels[W.i]; if (W.gone) continue;
      vw.pivot.rotation.y = -(W.front ? (W.phiEff || 0) : 0);
      vw.wheel.rotation.x -= (W.roll || 0) / (TD.r * this.s) * dtR;
    }
    V.basket.scale.y = 0.72 + 0.28 * this.hp.basket; V.basket.position.y = -(1 - V.basket.scale.y) * 0.1; V.basket.rotation.z = (1 - this.hp.basket) * 0.09; V.basket.rotation.x = (1 - this.hp.basket) * 0.05;
    V.handle.rotation.x = (1 - this.hp.handle) * 0.9; V.handle.rotation.z = this.hp.handle < 0.5 ? 0.15 : 0;
    if (this.hp.handle < 0.5) { this.steerFlipT -= dtR; if (this.steerFlipT < 0) { this.steerFlip = this.steerFlip > 0 ? 0 : 0.45; this.steerFlipT = this.steerFlip > 0 ? 0.45 : 1.5 + Math.random() * 2; } if (this.steerFlip > 0) this.steerFlip -= dtR; }
  }
  // helpers for other modules
  pos() { return this.body.translation(); }
  // quarter pipes: leave the lip going up and it goes straight up, turns 180 and drops back in nose first
  qpAssist(dt, airborne) {
    const b = this.body;
    if (this.qp) { // scripted air: straight up, a clean 180 about the axis pointing into the car park, then back onto the face
      const Q = this.qp; Q.t += dt; const k = Q.t / Q.dur, v = b.linvel();
      if (k > 1.6 || (!airborne && v.y < 0 && k > 0.6)) { this.qp = null; this.qpT = 0; b.setAngvel({ x: 0, y: 0, z: 0 }, true); return; }
      const T = C.T, kk = Math.min(1, k), q = new T.Quaternion().setFromAxisAngle(Q.n, Math.PI * kk).multiply(Q.q0);
      b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      const spin = kk < 1 ? Math.PI / Q.dur : 0; b.setAngvel({ x: Q.n.x * spin, y: 0, z: Q.n.z * spin }, true);
      const vn = k < 0.5 ? 0.1 : -0.9; // drift back towards the face once it's over the top
      b.setLinvel({ x: Q.n.x * vn + Q.ex * Q.along, y: v.y, z: Q.n.z * vn + Q.ez * Q.along }, true);
      this.qpT = 1; return;
    }
    const pipes = C.world.pipes; if (!pipes) return;
    const p = b.translation(), v = b.linvel(); if (v.y < 2.2) return;
    for (const Q of pipes) {
      const dx = p.x - Q.x, dz = p.z - Q.z, a = dx * Q.ex + dz * Q.ez, u = dx * Q.ox + dz * Q.oz;
      if (a < 1.5 || a > Q.len - 1.5 || u < Q.u1 - 0.75 || u > Q.u1 + 0.9 || p.y < Q.y0 + Q.h * 0.72) continue;
      const T = C.T, nx = -Q.ox, nz = -Q.oz, along = (v.x * Q.ex + v.z * Q.ez) * 0.5, up = Math.max(v.y, Math.hypot(v.x, v.y, v.z) * 0.92), dur = 2 * up / 9.81;
      const hy = Math.min(Q.h, p.y - Q.y0), uf = Math.sqrt(Math.max(0, Q.r * Q.r - (Q.r - hy) * (Q.r - hy))), tu = uf - 0.75 - u; // clear of the face
      b.setTranslation({ x: p.x + Q.ox * tu, y: p.y, z: p.z + Q.oz * tu }, true);
      b.setLinvel({ x: nx * 0.1 + Q.ex * along, y: up, z: nz * 0.1 + Q.ez * along }, true);
      const zAx = new T.Vector3(0, -1, 0), yAx = new T.Vector3(nx, 0, nz), xAx = new T.Vector3().crossVectors(yAx, zAx);
      const q0 = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(xAx, yAx, zAx));
      b.setRotation({ x: q0.x, y: q0.y, z: q0.z, w: q0.w }, true);
      this.qp = { t: 0, dur, q0, n: yAx, ex: Q.ex, ez: Q.ez, along }; this.qpT = 1;
      if (C.game.state === 'run') C.game.addCombo(up > 7 ? 'BIG AIR 180' : 'FRONTSIDE 180', Math.round(150 + up * 40), { trick: true });
      return;
    }
  }
  vel() { return this.body.linvel(); }
  speed() { const v = this.body.linvel(); return Math.hypot(v.x, v.y, v.z); }
  fwd() { this.updR(); return { x: -this.R[2], y: -this.R[5], z: -this.R[8] }; }
  local(x, y, z) { this.updR(); const p = this.body.translation(), R = this.R; return { x: p.x + R[0] * x + R[1] * y + R[2] * z, y: p.y + R[3] * x + R[4] * y + R[5] * z, z: p.z + R[6] * x + R[7] * y + R[8] * z }; }
  toLocal(x, y, z) { this.updR(); const p = this.body.translation(), R = this.R, dx = x - p.x, dy = y - p.y, dz = z - p.z; return { x: R[0] * dx + R[3] * dy + R[6] * dz, y: R[1] * dx + R[4] * dy + R[7] * dz, z: R[2] * dx + R[5] * dy + R[8] * dz }; }
}
