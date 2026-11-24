import { C, G, ig } from './core.js';
import { clamp, lerp, angDiff } from './util.js';
const T = C.T;

export const CAM_NAMES = ['CHASE', 'TROLLEY CAM', 'CCTV'];
// Chase cam, a low cam off the handle, and CCTV cameras dotted along the route.
export class Cam {
  constructor(camera) { this.c = camera; this.mode = 0; this.yaw = 0; this.pos = new T.Vector3(); this.look = new T.Vector3(); this.cctv = null; this.fov = 62; }
  next() { this.mode = (this.mode + 1) % 3; C.game.save.cam = this.mode; C.game.persist(); this.c.userData.snap = true; C.hud && C.hud.camToast(CAM_NAMES[this.mode]); }
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
    let mode = this.mode;
    if (mode === 2) { // nearest CCTV with the trolley in range
      let best = null, bd = 1e9; for (const c of C.world.cctv) { const d = Math.hypot(c.x - p.x, c.z - p.z) + Math.max(0, c.y - p.y - 20) * 3; if (d < bd) { bd = d; best = c; } }
      if (best && bd < 95) {
        if (this.cctv !== best) { this.cctv = best; this.look.set(p.x, p.y, p.z); }
        cam.position.set(best.x, best.y, best.z); this.look.lerp(new T.Vector3(p.x, p.y + 0.4, p.z), 1 - Math.exp(-dt * 4)); cam.lookAt(this.look);
        const d = Math.hypot(best.x - p.x, best.y - p.y, best.z - p.z); this.setFov(clamp(1400 / (d + 8), 14, 60), dt * 2);
        this.applyShake(dt); return;
      }
      this.cctv = null; mode = 0;
    } else this.cctv = null;
    if (mode === 1 && G2.state !== 'over') { // trolley cam: off the handle, looking over the basket
      const s = tr.s, q = tr.local(0, 0.72 * s, 0.98 * s), ahead = tr.local(0, 0.1 * s, -3.5 * s);
      if (snap) cam.position.set(q.x, q.y, q.z); else cam.position.lerp(new T.Vector3(q.x, q.y, q.z), 1 - Math.exp(-dt * 25));
      this.look.set(ahead.x, ahead.y, ahead.z); cam.lookAt(this.look); this.setFov(78 + Math.min(sp, 25) * 0.4, dt * 3); this.applyShake(dt); return;
    }
    // chase cam: follows the direction of travel, swings round slowly in the air
    let want = Math.atan2(-f.x, -f.z);
    if (sp > 2) want = Math.atan2(-v.x, -v.z);
    const airK = tr.nWheels === 0 ? 1.2 : 3.4;
    this.yaw = snap ? want : this.yaw + angDiff(want, this.yaw) * (1 - Math.exp(-dt * airK));
    const over = G2.state === 'over', dist = over ? 6.5 : 4.4 + Math.min(sp, 22) * 0.06, ht = over ? 3.2 : 1.85 + Math.min(sp, 22) * 0.025;
    const tx = p.x + Math.sin(this.yaw) * dist, tz = p.z + Math.cos(this.yaw) * dist;
    const want3 = new T.Vector3(tx, p.y + ht, tz);
    // keep the camera out of walls and above the ground
    const dir = new T.Vector3().subVectors(want3, new T.Vector3(p.x, p.y + 0.8, p.z)); const L = dir.length(); dir.divideScalar(L);
    const hit = C.phys.castRay(new C.RAPIER.Ray({ x: p.x, y: p.y + 0.8, z: p.z }, dir), L, true, undefined, ig(G.TROLLEY, G.GROUND), undefined, tr.body);
    if (hit) want3.set(p.x + dir.x * Math.max(0.6, hit.timeOfImpact - 0.35), p.y + 0.8 + dir.y * Math.max(0.6, hit.timeOfImpact - 0.35), p.z + dir.z * Math.max(0.6, hit.timeOfImpact - 0.35));
    const gy = C.world.groundY(want3.x, want3.z) + 0.5; if (want3.y < gy) want3.y = gy;
    if (snap) this.pos.copy(want3); else this.pos.lerp(want3, 1 - Math.exp(-dt * 6.5));
    cam.position.copy(this.pos);
    const la = new T.Vector3(p.x - Math.sin(this.yaw) * 2.5, p.y + 0.5, p.z - Math.cos(this.yaw) * 2.5);
    if (snap) this.look.copy(la); else this.look.lerp(la, 1 - Math.exp(-dt * 9));
    cam.lookAt(this.look);
    this.setFov(64 + Math.min(sp, 25) * 0.7, dt * 2.5);
    this.applyShake(dt);
  }
  applyShake(dt) { const s = C.game.shake; if (s > 0.01 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) { const c = this.c; c.position.x += (Math.random() - 0.5) * s * 0.25; c.position.y += (Math.random() - 0.5) * s * 0.25; } }
  setFov(f, k) { const c = this.c; const nf = c.fov + (f - c.fov) * Math.min(1, k); if (Math.abs(nf - c.fov) > 0.01) { c.fov = nf; c.updateProjectionMatrix(); C.fx && C.fx.setScale(C.renderer.getDrawingBufferSize(new T.Vector2()).y / (2 * Math.tan(c.fov * Math.PI / 360))); } }
}
