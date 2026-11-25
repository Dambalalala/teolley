import { C, G, ig, ALL } from './core.js';
import { TAU } from './util.js';
import { ITEMS, makeItemMesh } from './models.js?v=stop-sign-splash';
const T = C.T;

// Floating pickups along the route, and the shopping that physically rattles about in the basket.
export class Shopping {
  constructor() {
    this.pickups = []; this.items = []; // items: {k, body, mesh, state:'basket'|'loose', lostT, looseT}
    this.mouth = {}; this.itemLocal = {};
    const ringG = new T.TorusGeometry(0.42, 0.04, 6, 24); ringG.rotateX(Math.PI / 2);
    this.ringMat = new T.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.85 });
    for (const sp of C.world.pickups) {
      const g = new T.Group(); g.position.set(sp.x, sp.y, sp.z); C.scene.add(g);
      const m = makeItemMesh(sp.k); m.scale.setScalar(2.3); g.add(m);
      const ring = new T.Mesh(ringG, this.ringMat); ring.position.y = -0.45; g.add(ring);
      this.pickups.push({ k: sp.k, g, m, ring, x: sp.x, y: sp.y, z: sp.z, reach: sp.reach ?? 0.95, taken: false, ph: Math.random() * TAU });
    }
  }
  reset() {
    for (const p of this.pickups) { p.taken = false; p.g.visible = true; }
    for (const it of this.items) this.removeItem(it, true);
    this.items = [];
  }
  removeItem(it, keepList) { C.phys.removeRigidBody(it.body); C.scene.remove(it.mesh); C.colInfo.delete(it.handle); if (!keepList) this.items.splice(this.items.indexOf(it), 1); }
  inBasket() { return this.items.filter(i => i.state === 'basket'); }
  basketCount() {
    let count = 0;
    for (const item of this.items) if (item.state === 'basket') count++;
    return count;
  }
  spawn(k, x, y, z, v, state) {
    const R = C.RAPIER, I = ITEMS[k], sh = I.shape;
    const body = C.phys.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinvel(v.x, v.y, v.z).setCcdEnabled(true).setAngularDamping(0.4).setLinearDamping(0.05));
    let d = sh[0] === 'ball' ? R.ColliderDesc.ball(sh[1]) : sh[0] === 'cylinder' ? R.ColliderDesc.cylinder(sh[1], sh[2]) : R.ColliderDesc.cuboid(sh[1], sh[2], sh[3]);
    d.setMass(I.mass).setFriction(0.65).setRestitution(0.2).setCollisionGroups(ig(G.ITEM, ALL)).setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(40);
    const c = C.phys.createCollider(d, body);
    const mesh = makeItemMesh(k); C.scene.add(mesh);
    const it = { k, body, mesh, handle: c.handle, state, lostT: 0, looseT: 0 };
    C.colInfo.set(c.handle, { kind: 'item', item: it });
    this.items.push(it); return it;
  }
  addToBasket(k) {
    const tr = C.trolley, s = tr.s, p = tr.local((Math.random() - 0.5) * 0.2 * s, 0.32 * s, (Math.random() - 0.5) * 0.3 * s), v = tr.vel();
    return this.spawn(k, p.x, p.y, p.z, v, 'basket');
  }
  update(dt, active) {
    const tr = C.trolley; if (!tr) return;
    const s = tr.s, mouth = tr.local(0, 0.42 * s, -0.05 * s, this.mouth);
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.ph += dt; p.m.rotation.y += dt * 1.6; p.m.position.y = Math.sin(p.ph * 2.2) * 0.08;
      if (!active) continue;
      const dx = p.x - mouth.x, dy = p.y - mouth.y, dz = p.z - mouth.z, r = p.reach * Math.max(1, s);
      if (dx * dx + dy * dy + dz * dz < r * r) {
        p.taken = true; p.g.visible = false;
        const full = this.basketCount() >= tr.capacity();
        if (!full) this.addToBasket(p.k);
        else { const v = tr.vel(); const it = this.spawn(p.k, mouth.x, mouth.y + 0.3, mouth.z, { x: v.x * 0.6 + (Math.random() - 0.5) * 3, y: 3.5, z: v.z * 0.6 + (Math.random() - 0.5) * 3 }, 'loose'); it.looseT = -1.5; }
        C.game.ev('collect', { k: p.k, full, x: p.x, y: p.y, z: p.z });
      }
    }
    // basket contents: lost if they leave the basket for a moment; loose items can be scooped up again
    const cap = tr.capacity(); let count = 0;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i], q = it.body.translation();
      if (q.y < -40) { this.removeItem(it); i--; continue; }
      if (it.state === 'basket') {
        const L = tr.toLocal(q.x, q.y, q.z, this.itemLocal), xs = 0.36 * s, out = Math.abs(L.x) > xs || L.y < (0.56 - 0.5 - 0.12) * s || L.y > (0.98 - 0.5 + 0.35) * s || L.z < -0.58 * s || L.z > 0.48 * s;
        if (out) it.lostT += dt; else it.lostT = 0;
        if (it.lostT > 0.25) { it.state = 'loose'; it.looseT = 0; C.game.ev('lost', { k: it.k, x: q.x, y: q.y, z: q.z }); }
        else { count++; if (count > cap) { it.body.applyImpulse({ x: (Math.random() - 0.5) * 2, y: 4 * ITEMS[it.k].mass, z: (Math.random() - 0.5) * 2 }, true); } }
      } else {
        it.looseT += dt;
        if (active && it.looseT > 1.5 && this.basketCount() < cap) {
          const dx = q.x - mouth.x, dy = q.y - mouth.y, dz = q.z - mouth.z;
          if (dx * dx + dy * dy + dz * dz < 0.8 * 0.8 * Math.max(1, s)) { it.state = 'basket'; it.lostT = 0; const p = tr.local(0, 0.32 * s, 0), v = tr.vel(); it.body.setTranslation(p, true); it.body.setLinvel(v, true); C.game.ev('recollect', { k: it.k }); }
        }
      }
    }
  }
  sync() {
    const camera = C.camera.position;
    for (const p of this.pickups) {
      const dx = p.x - camera.x, dz = p.z - camera.z;
      p.g.visible = !p.taken && !this.hidden && dx * dx + dz * dz < 160 ** 2;
    }
    for (const it of this.items) { const p = it.body.translation(), q = it.body.rotation(); it.mesh.position.set(p.x, p.y, p.z); it.mesh.quaternion.set(q.x, q.y, q.z, q.w); } }
}
