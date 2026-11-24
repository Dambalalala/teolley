import { C, G, ig } from './core.js';
import { clamp, lerp, angDiff } from './util.js';
const T = C.T;

// One chase camera.
export class Cam {
  constructor(camera) { this.c = camera; this.yaw = 0; this.pos = new T.Vector3(); this.look = new T.Vector3(); this.fov = 62; this._w = new T.Vector3(); this._d = new T.Vector3(); this._l = new T.Vector3(); }
  // one reusable ray, so the camera makes no garbage each frame
  ray(x, y, z, d) { if (!this._r) this._r = new C.RAPIER.Ray({ x, y, z }, { x: d.x, y: d.y, z: d.z }); const r = this._r; r.origin.x = x; r.origin.y = y; r.origin.z = z; r.dir.x = d.x; r.dir.y = d.y; r.dir.z = d.z; return r; }
  update(dt) {
    const cam = this.c, tr = C.trolley, G2 = C.game; if (!tr) return;
    const snap = cam.userData.snap; cam.userData.snap = false;
    const p = tr.pos(), v = tr.vel(), sp = Math.hypot(v.x, v.z), f = tr.fwd();
    if (G2.state === 'select' && C.select && C.select.open) { C.select.camera(cam); this.setFov(50, 1); this.pos.copy(cam.position); return; }
    if (G2.state === 'title' || G2.state === 'select' || G2.state === 'loading') {
      // looking past the trolley, down the hill at the town
      const t = performance.now() / 1000, sway = Math.sin(t * 0.15) * 0.6;
      cam.position.set(p.x - 1.6 + sway * 0.4, p.y + 1.0, p.z + 3.4); this.look.set(p.x - 0.9 + sway, p.y - 1.2, p.z - 24);
      cam.lookAt(this.look); this.setFov(52, 1); this.pos.copy(cam.position); this.yaw = Math.PI; return;
    }
    // chase cam: follows the direction of travel, swings round slowly in the air
    let want = Math.atan2(-f.x, -f.z);
    if (sp > 2) want = Math.atan2(-v.x, -v.z);
    const airK = tr.nWheels === 0 ? 1.2 : 3.4;
    this.yaw = snap ? want : this.yaw + angDiff(want, this.yaw) * (1 - Math.exp(-dt * airK));
    const over = G2.state === 'over', dist = over ? 6.5 : 4.4 + Math.min(sp, 22) * 0.06, ht = over ? 3.2 : 1.85 + Math.min(sp, 22) * 0.025;
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
    this.setFov(64 + Math.min(sp, 25) * 0.7, dt * 2.5);
    this.applyShake(dt);
  }
  applyShake(dt) { const s = C.game.shake; if (s > 0.01 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) { const c = this.c; c.position.x += (Math.random() - 0.5) * s * 0.25; c.position.y += (Math.random() - 0.5) * s * 0.25; } }
  setFov(f, k) { const c = this.c; const nf = c.fov + (f - c.fov) * Math.min(1, k); if (Math.abs(nf - c.fov) > 0.01) { c.fov = nf; c.updateProjectionMatrix(); C.fx && C.fx.setScale(C.renderer.getDrawingBufferSize(new T.Vector2()).y / (2 * Math.tan(c.fov * Math.PI / 360))); } }
}
