import { C, G, ig } from './core.js';
import { angDiff, clamp } from './util.js';
const T = C.T;

// One chase camera.
export class Cam {
  constructor(camera) { this.c = camera; this.yaw = 0; this.pos = new T.Vector3(); this.look = new T.Vector3(); this.bufferSize = new T.Vector2(); this.forward = new T.Vector3(0, 0, -1); this.motion = matchMedia('(prefers-reduced-motion: reduce)'); this._w = new T.Vector3(); this._d = new T.Vector3(); this._l = new T.Vector3(); }
  // one reusable ray, so the camera makes no garbage each frame
  ray(x, y, z, d) { if (!this._r) this._r = new C.RAPIER.Ray({ x, y, z }, { x: d.x, y: d.y, z: d.z }); const r = this._r; r.origin.x = x; r.origin.y = y; r.origin.z = z; r.dir.x = d.x; r.dir.y = d.y; r.dir.z = d.z; return r; }
  update(dt) {
    const cam = this.c, tr = C.trolley, G2 = C.game; if (!tr) return;
    const snap = cam.userData.snap; cam.userData.snap = false;
    if (G2.state === 'select' && C.select && C.select.open) { C.select.camera(cam); this.setFov(C.touch && cam.aspect < 0.85 ? 61 : 50, 1); this.pos.copy(cam.position); return; }
    if (!dt && !snap) return;
    const p = tr.vis.root.position, v = tr.vel(), sp = Math.hypot(v.x, v.z);
    const f = this.forward.set(0, 0, -1).applyQuaternion(tr.vis.root.quaternion);
    // chase cam: follows the direction of travel, swings round slowly in the air
    let want = Math.atan2(-f.x, -f.z);
    if (sp > 2) want = Math.atan2(-v.x, -v.z);
    const airK = tr.nWheels === 0 ? 1.2 : 3.4;
    this.yaw = snap ? want : this.yaw + angDiff(want, this.yaw) * (1 - Math.exp(-dt * airK));
    // Show both sides of the car park exit on narrow phones, then ease into the hill camera.
    const carPark = C.world.carParkCamera && C.touch && cam.aspect < 0.7 ? clamp((p.z + 4) / 21, 0, 1) : 0;
    const over = G2.state === 'over', dist = over ? 6.5 : 4.4 + Math.min(sp, 22) * 0.06 + carPark * 1.6, ht = over ? 3.2 : 1.85 + Math.min(sp, 22) * 0.025;
    const tx = p.x + Math.sin(this.yaw) * dist, tz = p.z + Math.cos(this.yaw) * dist;
    const want3 = this._w.set(tx, p.y + ht, tz);
    // keep the camera out of walls and above the ground
    const dir = this._d.set(want3.x - p.x, want3.y - p.y - 0.8, want3.z - p.z); const L = dir.length(); dir.divideScalar(L);
    const hit = C.phys.castRay(this.ray(p.x, p.y + 0.8, p.z, dir), L, true, undefined, ig(G.TROLLEY, G.GROUND), undefined, tr.body);
    if (hit) want3.set(p.x + dir.x * Math.max(0.6, hit.timeOfImpact - 0.35), p.y + 0.8 + dir.y * Math.max(0.6, hit.timeOfImpact - 0.35), p.z + dir.z * Math.max(0.6, hit.timeOfImpact - 0.35));
    const gy = C.world.groundY(want3.x, want3.z) + 0.5; if (want3.y < gy) want3.y = gy;
    if (snap) this.pos.copy(want3); else this.pos.lerp(want3, 1 - Math.exp(-dt * 6.5));
    cam.position.copy(this.pos);
    const la = this._l.set(p.x - Math.sin(this.yaw) * 2.5, p.y + 0.5, p.z - Math.cos(this.yaw) * 2.5);
    if (snap) this.look.copy(la); else this.look.lerp(la, 1 - Math.exp(-dt * 9));
    cam.lookAt(this.look);
    const fov = 64 + Math.min(sp, 25) * 0.7;
    this.setFov(fov + (83 - fov) * carPark, snap && carPark > 0 ? 1 : dt * 2.5);
    if (dt > 0) this.applyShake();
  }
  applyShake() { const s = C.game.shake; if (s > 0.01 && !this.motion.matches) { const c = this.c; c.position.x += (Math.random() - 0.5) * s * 0.25; c.position.y += (Math.random() - 0.5) * s * 0.25; } }
  setFov(f, k) { const c = this.c; const nf = c.fov + (f - c.fov) * Math.min(1, k); if (Math.abs(nf - c.fov) > 0.01) { c.fov = nf; c.updateProjectionMatrix(); C.fx && C.fx.setScale(C.renderer.getDrawingBufferSize(this.bufferSize).y / (2 * Math.tan(c.fov * Math.PI / 360))); } }
}
