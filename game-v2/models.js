import { C } from './core.js';
import { Batch, GEO, M, FM, bx, cy, seg, lam, rng, pick, TAU, clamp } from './util.js';
import { TX, labelTex, signTex } from './textures.js?v=grumbleton-polish';
const T = C.T;

// ======================= THE TROLLEY =======================
// Heights are above the ground; local frame puts the centre of mass at the origin, so local y = h + GY.
export const TD = {
  GY: -0.5, r: 0.0625, pivotH: 0.165, trail: 0.035,
  wheels: [{ x: -0.18, z: -0.40, front: true }, { x: 0.18, z: -0.40, front: true }, { x: -0.25, z: 0.36, front: false }, { x: 0.25, z: 0.36, front: false }],
  top: { y: 0.98, x: 0.29, zf: -0.50, zb: 0.40 },
  bot: { y: 0.56, x: 0.24, zf: -0.38, zb: 0.36 },
  handle: { y: 1.00, z: 0.53, x: 0.29 },
};

export const VARIANTS = {
  dave: { name: 'Standard Dave', blurb: 'The one from the bay. Does everything all right.', scale: 1, metal: 0xc5c9cf, plastic: 0xf26a1b, plate: 'plate' },
  demon: { name: 'Speed Demon', blurb: 'Light frame. Fastest down the hill, first to fall over.', scale: 0.8, metal: 0xd9dade, plastic: 0xc81e1e, plate: 'plateR' },
  tank: { name: 'The Tank', blurb: 'Heavy duty. Slow to get going, then nothing stops it.', scale: 1.22, metal: 0x58705a, plastic: 0x2a2f2b, plate: 'plateT' },
  pensioner: { name: 'The Pensioner', blurb: 'Pulls to the right. Rolls faster than it should.', scale: 1, metal: 0x9a5a3a, plastic: 0x5a4a3a, plate: 'plateP' },
  green: { name: 'Green Fingers', blurb: 'Two-tier, extra shelf. Turns on a sixpence. Not quick.', scale: 0.95, metal: 0x4f7f56, plastic: 0x2f7a3a, plate: 'plateG' },
};

const wireMats = new Map(), trolleyMaterial = lam();
function wireMat(color) {
  if (!wireMats.has(color)) wireMats.set(color, new T.MeshLambertMaterial({ map: TX.wire, alphaTest: 0.45, side: T.DoubleSide, color }));
  return wireMats.get(color);
}

export function makeTrolley(vkey) {
  const V = VARIANTS[vkey] || VARIANTS.dave, s = V.scale, GY = TD.GY;
  const root = new T.Group(); root.scale.setScalar(s);
  const metal = V.metal, plastic = V.plastic;
  const matV = trolleyMaterial;
  const H = h => h + GY; // ground height -> local y
  const t = TD.top, b = TD.bot;
  // ---- basket (its own group so it can be crushed) ----
  const basket = new T.Group(); root.add(basket);
  const P = {
    tfl: [-t.x, H(t.y), t.zf], tfr: [t.x, H(t.y), t.zf], tbl: [-t.x, H(t.y), t.zb], tbr: [t.x, H(t.y), t.zb],
    bfl: [-b.x, H(b.y), b.zf], bfr: [b.x, H(b.y), b.zf], bbl: [-b.x, H(b.y), b.zb], bbr: [b.x, H(b.y), b.zb],
  };
  const W = new Batch();
  const rep = 2.6; // wire cells per metre / 8
  const wq = (a, b2, c, d, lu, lv) => W.quad(a, b2, c, d, metal, [0, 0, lu * rep, lv * rep]);
  wq(P.bfl, P.bbl, P.tbl, P.tfl, 0.9, 0.42); // left
  wq(P.bbr, P.bfr, P.tfr, P.tbr, 0.9, 0.42); // right
  wq(P.bfr, P.bfl, P.tfl, P.tfr, 0.56, 0.44); // front (sloped)
  wq(P.bbl, P.bbr, P.tbr, P.tbl, 0.56, 0.42); // back gate
  wq(P.bfl, P.bfr, P.bbr, P.bbl, 0.5, 0.74); // floor
  const wires = new T.Mesh(W.geometry(), wireMat(metal)); wires.castShadow = true; wires.receiveShadow = true; basket.add(wires);
  const F = new Batch(), tube = 0.009;
  const edges = [['tfl', 'tfr'], ['tfr', 'tbr'], ['tbr', 'tbl'], ['tbl', 'tfl'], ['bfl', 'bfr'], ['bfr', 'bbr'], ['bbr', 'bbl'], ['bbl', 'bfl'], ['tfl', 'bfl'], ['tfr', 'bfr'], ['tbl', 'bbl'], ['tbr', 'bbr']];
  for (const [a, c] of edges) seg(F, null, P[a], P[c], tube * 1.3, metal);
  const mid = (a, c, k) => [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k];
  for (const k of [0.5]) { seg(F, null, mid(P.bfl, P.tfl, k), mid(P.bbl, P.tbl, k), tube, metal); seg(F, null, mid(P.bfr, P.tfr, k), mid(P.bbr, P.tbr, k), tube, metal); }
  // child seat flap + advert plate
  bx(F, null, 0.5, 0.012, 0.16, 0, H(t.y) - 0.02, t.zb - 0.09, plastic, 0.35);
  bx(F, null, 0.08, 0.03, 0.03, -t.x + 0.02, H(t.y) + 0.01, t.zf + 0.02, 0x333338);
  bx(F, null, 0.08, 0.03, 0.03, t.x - 0.02, H(t.y) + 0.01, t.zf + 0.02, 0x333338);
  const frame = new T.Mesh(F.geometry(), matV); frame.castShadow = true; basket.add(frame);
  const plate = new T.Mesh(new T.PlaneGeometry(0.34, 0.12), lblMat(V.plate));
  const ph = t.y - 0.12, fz = b.zf + (t.zf - b.zf) * (ph - b.y) / (t.y - b.y) - 0.012; plate.position.set(0, H(ph), fz); plate.rotation.set(-Math.atan2(b.zf - t.zf, t.y - b.y), Math.PI, 0); basket.add(plate);
  // ---- chassis ----
  const Ch = new Batch();
  const rail = H(0.19);
  seg(Ch, null, [-0.25, rail, 0.38], [-0.17, rail, -0.44], 0.013, metal); seg(Ch, null, [0.25, rail, 0.38], [0.17, rail, -0.44], 0.013, metal);
  seg(Ch, null, [-0.17, rail, -0.44], [0.17, rail, -0.44], 0.013, metal); seg(Ch, null, [-0.25, rail, 0.38], [0.25, rail, 0.38], 0.013, metal);
  // lower tray wires
  const Tw = new Batch(); Tw.quad([-0.19, H(0.235), -0.32], [0.19, H(0.235), -0.32], [0.23, H(0.235), 0.3], [-0.23, H(0.235), 0.3], metal, [0, 0, 1, 1.6]);
  const tray = new T.Mesh(Tw.geometry(), wireMat(metal)); tray.castShadow = true; root.add(tray);
  for (const sx of [-1, 1]) {
    seg(Ch, null, [sx * 0.25, rail, 0.38], [sx * 0.27, H(0.97), 0.5], 0.014, metal); // rear upright to handle
    seg(Ch, null, [sx * 0.21, rail, 0.0], [sx * 0.24, H(b.y), 0.1], 0.011, metal);   // basket support
    seg(Ch, null, [sx * 0.19, rail, -0.3], [sx * 0.24, H(b.y), -0.3], 0.011, metal);
    seg(Ch, null, [sx * 0.23, H(0.235), 0.3], [sx * 0.25, rail, 0.38], 0.009, metal);
    bx(Ch, null, 0.05, 0.04, 0.06, sx * 0.17, rail - 0.01, -0.46, 0x3a3a40); // corner bumpers
  }
  for (const w of TD.wheels) bx(Ch, null, 0.06, 0.012, 0.06, w.x, H(TD.pivotH) + 0.006, w.z, metal);
  const chassis = new T.Mesh(Ch.geometry(), matV); chassis.castShadow = true; root.add(chassis);
  // ---- handle ----
  const handle = new T.Group(); handle.position.set(0, H(0.97), 0.5); root.add(handle);
  const Hb = new Batch();
  seg(Hb, null, [-0.29, 0.03, 0.03], [0.29, 0.03, 0.03], 0.012, metal);
  cy(Hb, null, 0.021, 0.44, 0, 0.03, 0.03, plastic, 12, 0, 0, Math.PI / 2);
  bx(Hb, null, 0.07, 0.05, 0.07, -0.22, 0.0, 0.01, 0xd21f26); // coin lock
  bx(Hb, null, 0.03, 0.012, 0.035, -0.22, 0.03, -0.02, 0xffd21f);
  for (let i = 0; i < 4; i++) bx(Hb, null, 0.012, 0.014, 0.012, -0.22 + i * 0.012, -0.03 - i * 0.018, 0.02, 0xb9bcc2); // chain
  if (vkey === 'pensioner') { bx(Hb, null, 0.22, 0.28, 0.12, 0.08, -0.17, 0.1, 0x4b2a5e); for (let i = 0; i < 4; i++) bx(Hb, null, 0.225, 0.012, 0.125, 0.08, -0.29 + i * 0.07, 0.1, 0xc23a2a); for (let i = 0; i < 3; i++) bx(Hb, null, 0.012, 0.285, 0.125, 0.0 + i * 0.08, -0.17, 0.1, 0x2a6a3a); }
  const handleMesh = new T.Mesh(Hb.geometry(), matV); handleMesh.castShadow = true; handle.add(handleMesh);
  // ---- casters ----
  const wheels = [];
  const wb = new Batch(); cy(wb, null, TD.r, 0.032, 0, 0, 0, 0x2b2b30, 12, 0, 0, Math.PI / 2); cy(wb, null, TD.r * 0.45, 0.036, 0, 0, 0, 0xe2e2e2, 8, 0, 0, Math.PI / 2);
  const wheelGeo = wb.geometry();
  const fb = new Batch(); bx(fb, null, 0.008, 0.1, 0.05, -0.022, -0.05, TD.trail * 0.5, metal); bx(fb, null, 0.008, 0.1, 0.05, 0.022, -0.05, TD.trail * 0.5, metal); bx(fb, null, 0.05, 0.012, 0.05, 0, 0, 0, metal);
  const forkGeo = fb.geometry();
  for (const w of TD.wheels) {
    const pivot = new T.Group(); pivot.position.set(w.x, H(TD.pivotH), w.z); root.add(pivot);
    const fork = new T.Mesh(forkGeo, matV); fork.castShadow = true; pivot.add(fork);
    const wheel = new T.Mesh(wheelGeo, matV); wheel.castShadow = true; wheel.position.set(0, TD.r - TD.pivotH, TD.trail); pivot.add(wheel);
    wheels.push({ pivot, wheel, fork, spin: 0 });
  }
  if (vkey === 'tank') { const tb = new Batch(); for (const sx of [-1, 1]) seg(tb, null, [sx * 0.31, H(0.6), -0.52], [sx * 0.31, H(1.0), -0.52], 0.02, 0x2a2f2b); seg(tb, null, [-0.31, H(0.82), -0.53], [0.31, H(0.82), -0.53], 0.025, 0xffd21f); root.add(new T.Mesh(tb.geometry(), matV)); }
  if (vkey === 'green') { // a couple of plants in the basket and a tray of bedding on the bottom shelf
    const gb = new Batch();
    for (const [x, z, sc] of [[-0.1, -0.15, 1], [0.11, 0.08, 0.8]]) { cy(gb, null, 0.075 * sc, 0.13 * sc, x, H(b.y) + 0.07 * sc, z, 0xb5653a, 10); gb.add(GEO.ico1, M(x, H(b.y) + 0.2 * sc, z, 0.3, 1, 0, 0.12 * sc, 0.1 * sc, 0.12 * sc), 0x3f8a3a); }
    bx(gb, null, 0.34, 0.05, 0.4, 0, H(0.27), 0, 0x2a2a2e); for (let i = 0; i < 6; i++) gb.add(GEO.ico, M(-0.11 + (i % 3) * 0.11, H(0.32), -0.1 + Math.floor(i / 3) * 0.2, i, i, 0, 0.05, 0.04, 0.05), [0xd2486a, 0xf2c94a, 0x8a5ad2][i % 3]);
    const gm = new T.Mesh(gb.geometry(), matV); gm.castShadow = true; basket.add(gm); }
  if (vkey === 'demon') { const db = new Batch(); for (let i = 0; i < 3; i++) bx(db, null, 0.012, 0.05 + i * 0.03, 0.18, -t.x - 0.01, H(t.y) - 0.15, -0.3 + i * 0.12, [0xff3b1f, 0xffa21f, 0xffe21f][i]); root.add(new T.Mesh(db.geometry(), matV)); }
  return { root, basket, handle, wheels, plate };
}

// ======================= SHOPPING =======================
export const ITEMS = {
  milk: { name: 'MILK', pts: 150, mass: 2.3, shape: ['cuboid', 0.06, 0.12, 0.06] },
  loo: { name: 'TOILET ROLL', pts: 200, mass: 0.7, shape: ['cuboid', 0.11, 0.075, 0.11] },
  tampons: { name: 'TAMPONS', pts: 110, mass: 0.15, shape: ['cuboid', 0.05, 0.06, 0.035] },
  pineapple: { name: 'PINEAPPLE', pts: 500, mass: 1.2, shape: ['cuboid', 0.07, 0.15, 0.07], bargain: true },
  gnome: { name: 'CLEARANCE GNOME', pts: 750, mass: 1.5, shape: ['cuboid', 0.07, 0.14, 0.07], bargain: true },
};

const labelMats = {};
function lblMat(k) { if (!labelMats[k]) labelMats[k] = new T.MeshLambertMaterial({ map: labelTex(k) }); return labelMats[k]; }
const itemModels = new Map();
export function makeItemMesh(k) {
  const existing = itemModels.get(k);
  if (existing) return existing.clone();
  const g = new T.Group(), mv = lam();
  const B = new Batch();
  if (k === 'milk') { const m = new T.Mesh(GEO.box, lblMat('milk')); m.scale.set(0.12, 0.2, 0.12); m.position.y = -0.02; g.add(m); B.add(GEO.cyl8, M(0, 0.1, 0.02, 0, 0, 0, 0.03, 0.04, 0.03), 0xf4f4f0); B.add(GEO.cyl8, M(0, 0.125, 0.02, 0, 0, 0, 0.022, 0.02, 0.022), 0x2f9a4a); B.add(GEO.box, M(0, 0.03, -0.055, 0, 0, 0, 0.04, 0.12, 0.02), 0xf4f4f0); }
  else if (k === 'loo') { for (let i = 0; i < 4; i++) B.add(GEO.cyl12, M((i % 2 - 0.5) * 0.105, 0, (Math.floor(i / 2) - 0.5) * 0.105, 0, 0, 0, 0.052, 0.14, 0.052), 0xf8f8f8); const w = new T.Mesh(GEO.box, new T.MeshLambertMaterial({ map: labelTex('loo'), transparent: true, opacity: 0.55 })); w.scale.set(0.22, 0.12, 0.222); g.add(w); }
  else if (k === 'tampons') { const m = new T.Mesh(GEO.box, lblMat('tampons')); m.scale.set(0.1, 0.12, 0.07); g.add(m); }
  else if (k === 'pineapple') { B.add(GEO.ico1, M(0, -0.03, 0, 0, 0, 0, 0.07, 0.11, 0.07), 0xc98d2a); for (let i = 0; i < 6; i++) B.add(GEO.cone8, M(Math.cos(i) * 0.02, 0.12, Math.sin(i) * 0.02, Math.cos(i) * 0.4, 0, Math.sin(i) * 0.4, 0.02, 0.12, 0.012), 0x3f8a32); }
  else if (k === 'gnome') { B.add(GEO.cyl8, M(0, -0.06, 0, 0, 0, 0, 0.055, 0.08, 0.05), 0x2f62b8); B.add(GEO.cyl8, M(0, 0.02, 0, 0, 0, 0, 0.05, 0.08, 0.045), 0xc8402f); B.add(GEO.sph, M(0, 0.08, 0, 0, 0, 0, 0.04, 0.04, 0.04), 0xf0c8a0); B.add(GEO.cone8, M(0, 0.06, 0.015, 0, 0, 0, 0.04, 0.05, 0.03), 0xf4f4f4); B.add(GEO.cone8, M(0, 0.15, 0, 0, 0, 0, 0.042, 0.1, 0.042), 0xd21f26); }
  if (!B.empty) { const m = new T.Mesh(B.geometry(), mv); g.add(m); }
  if (ITEMS[k].bargain) { const st = new T.Mesh(new T.PlaneGeometry(0.12, 0.06), new T.MeshBasicMaterial({ map: labelTex('reduced'), transparent: true, alphaTest: 0.3, side: T.DoubleSide })); st.position.set(0, 0.02, 0.08); g.add(st); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  itemModels.set(k, g);
  return g.clone();
}

// ======================= PROPS =======================
export function makeBin(lidColor) {
  const B = new Batch(), g = new T.Group();
  // UK 240L wheelie bin: body tapers to the bottom; origin at the body centre
  const body = new T.CylinderGeometry(0.5, 0.42, 1, 4, 1); body.rotateY(Math.PI / 4);
  B.add(body, M(0, -0.03, 0, 0, 0, 0, 0.82, 0.96, 1.02), lidColor === 0x2a2a2c ? 0x2f2f33 : 0x3b3f45);
  B.add(GEO.box, M(0, 0.47, 0.37, 0, 0, 0, 0.6, 0.05, 0.08), 0x2a2a2c);
  cy(B, null, 0.1, 0.05, -0.25, -0.43, 0.32, 0x202022, 10, 0, 0, Math.PI / 2); cy(B, null, 0.1, 0.05, 0.25, -0.43, 0.32, 0x202022, 10, 0, 0, Math.PI / 2);
  B.add(GEO.box, M(0, -0.1, -0.375, 0, 0, 0, 0.3, 0.12, 0.02), 0xf4f4f4);
  const m = new T.Mesh(B.geometry(), lam()); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const lidG = new T.Group(); lidG.position.set(0, 0.5, 0.36); g.add(lidG);
  const LB = new Batch(); LB.add(GEO.box, M(0, 0.02, -0.37, 0, 0, 0, 0.62, 0.05, 0.76), lidColor); const lid = new T.Mesh(LB.geometry(), lam()); lid.castShadow = true; lidG.add(lid);
  return { group: g, lid: lidG };
}
export function makeCone() {
  const B = new Batch();
  B.add(GEO.box, M(0, -0.34, 0, 0, 0, 0, 0.36, 0.04, 0.36), 0x202022);
  B.add(GEO.cone12, M(0, 0.0, 0, 0, 0, 0, 0.16, 0.68, 0.16), 0xff6a14);
  B.add(GEO.cyl12, M(0, 0.02, 0, 0, 0, 0, 0.085, 0.1, 0.085), 0xf2f2f2);
  const m = new T.Mesh(B.geometry(), lam()); m.castShadow = true; return m;
}
export function makeBarrier() {
  const B = new Batch();
  for (let i = 0; i < 6; i++) B.add(GEO.box, M(-0.83 + i * 0.333, 0.25, 0, 0, 0, 0, 0.333, 0.16, 0.04), i % 2 ? 0xffffff : 0xd0202a);
  for (const sx of [-1, 1]) { B.add(GEO.box, M(sx * 0.9, -0.05, 0, 0, 0, 0, 0.05, 0.9, 0.05), 0x2a2a2a); B.add(GEO.box, M(sx * 0.9, -0.48, 0, 0, 0, 0, 0.06, 0.06, 0.5), 0x2a2a2a); }
  const m = new T.Mesh(B.geometry(), lam()); m.castShadow = true; return m;
}
export function makePicket(w = 2.4, h = 0.9) {
  const B = new Batch();
  for (let x = -w / 2 + 0.06; x < w / 2; x += 0.14) { B.add(GEO.box, M(x, 0, 0, 0, 0, 0, 0.08, h, 0.02), 0xf4f2ea); B.add(GEO.box, M(x, h / 2 + 0.03, 0, 0, Math.PI / 4, 0, 0.056, 0.056, 0.02), 0xf4f2ea); }
  B.add(GEO.box, M(0, h * 0.25, 0.02, 0, 0, 0, w, 0.06, 0.02), 0xe8e6de); B.add(GEO.box, M(0, -h * 0.25, 0.02, 0, 0, 0, w, 0.06, 0.02), 0xe8e6de);
  const m = new T.Mesh(B.geometry(), lam()); m.castShadow = true; return m;
}
export function makeHeras(w = 3.4, h = 2.0) {
  const g = new T.Group();
  const p = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial({ map: TX.mesh, alphaTest: 0.4, side: T.DoubleSide, color: 0xd8dcd6 }));
  p.material.map = TX.mesh.clone(); p.material.map.needsUpdate = true; p.material.map.repeat.set(w * 2.5, h * 2.5); g.add(p);
  const B = new Batch(); seg(B, null, [-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], 0.02, 0xb9bcc2); seg(B, null, [-w / 2, h / 2, 0], [w / 2, h / 2, 0], 0.02, 0xb9bcc2); seg(B, null, [-w / 2, -h / 2, 0], [-w / 2, h / 2, 0], 0.02, 0xb9bcc2); seg(B, null, [w / 2, -h / 2, 0], [w / 2, h / 2, 0], 0.02, 0xb9bcc2);
  for (const sx of [-1, 1]) B.add(GEO.box, M(sx * w / 2, -h / 2 - 0.05, 0, 0, 0, 0, 0.25, 0.12, 0.6), 0x8a8a85);
  const fr = new T.Mesh(B.geometry(), lam()); fr.castShadow = true; g.add(fr); p.castShadow = true;
  return g;
}
export function makePallet() {
  const B = new Batch();
  for (let i = 0; i < 5; i++) B.add(GEO.box, M(-0.48 + i * 0.24, 0.05, 0, 0, 0, 0, 0.14, 0.025, 1.2), 0xb8935e);
  for (const z of [-0.55, 0, 0.55]) B.add(GEO.box, M(0, -0.03, z, 0, 0, 0, 1.0, 0.1, 0.1), 0xa07e4e);
  for (let i = 0; i < 8; i++) B.add(GEO.box, M((i % 4 - 1.5) * 0.24, 0.17 + Math.floor(i / 4) * 0.1, (Math.floor(i / 4) - 0.5) * 0.3, 0, 0, 0, 0.22, 0.08, 0.1), 0xa4523a);
  const m = new T.Mesh(B.geometry(), lam()); m.castShadow = true; m.receiveShadow = true; return m;
}
export function makePot(color = 0xb5603a) {
  const B = new Batch(); B.add(new T.CylinderGeometry(0.24, 0.17, 0.4, 10), M(0, 0, 0), color);
  for (let i = 0; i < 5; i++) B.add(GEO.ico, M(Math.cos(i * 1.3) * 0.1, 0.32 + (i % 2) * 0.08, Math.sin(i * 1.3) * 0.1, i, i, 0, 0.14, 0.13, 0.14), [0x4c8a3a, 0x5f9c44, 0xd2486a, 0xf2c94a][i % 4]);
  const m = new T.Mesh(B.geometry(), lam()); m.castShadow = true; return m;
}
export function makeCompost() { const B = new Batch(); B.add(GEO.box, M(0, 0, 0, 0, 0, 0, 0.55, 0.16, 0.85), 0x2f6b32); B.add(GEO.box, M(0, 0.081, 0.1, 0, 0, 0, 0.3, 0.005, 0.3), 0xf2e6c8); const m = new T.Mesh(B.geometry(), lam()); m.castShadow = true; return m; }
export function makePane(w = 1.0, h = 1.6) { const m = new T.Mesh(new T.BoxGeometry(w, h, 0.02), new T.MeshLambertMaterial({ color: 0xbfe0e8, transparent: true, opacity: 0.45 })); return m; }

// ======================= PEOPLE & ANIMALS =======================
const PEOPLE = {
  lollipop: { top: 0xf4f4f0, legs: 0x2a2a36, shoes: 0x1a1a1a, skin: 0xf0c8a8, hair: 0xb8b8b8, hat: 'peak', h: 0.98, hivis: true },
};
export function makePerson(kind) {
  const P = PEOPLE[kind] || PEOPLE.lollipop, s = P.h, mat = lam();
  const g = new T.Group(); const body = new T.Group(); body.scale.setScalar(s); g.add(body);
  const part = (fn) => { const B = new Batch(); fn(B); const m = new T.Mesh(B.geometry(), mat); m.castShadow = true; return m; };
  const torso = part(B => {
    B.add(GEO.box, M(0, 1.18, 0, 0, 0, 0, 0.44, 0.6, 0.25), P.top);
    if (P.hivis) { B.add(GEO.box, M(0, 1.18, 0, 0, 0, 0, 0.45, 0.6, 0.26), 0xe8f23a); B.add(GEO.box, M(0, 1.1, 0, 0, 0, 0, 0.46, 0.05, 0.27), 0xd8d8d8); }
    B.add(GEO.box, M(0, 0.86, 0, 0, 0, 0, 0.42, 0.14, 0.24), P.legs);
    B.add(GEO.cyl8, M(0, 1.5, 0, 0, 0, 0, 0.06, 0.1, 0.06), P.skin);
  });
  body.add(torso);
  const head = new T.Group(); head.position.set(0, 1.62, 0); body.add(head);
  head.add(part(B => {
    B.add(GEO.ico1, M(0, 0, 0, 0, 0, 0, 0.12, 0.135, 0.12), P.skin);
    B.add(GEO.box, M(0, -0.01, -0.12, 0, 0, 0, 0.03, 0.04, 0.03), P.skin);
    B.add(GEO.box, M(-0.04, 0.03, -0.11, 0, 0, 0, 0.025, 0.018, 0.01), 0x1a1a1a); B.add(GEO.box, M(0.04, 0.03, -0.11, 0, 0, 0, 0.025, 0.018, 0.01), 0x1a1a1a);
    if (P.hat === 'peak') { B.add(GEO.cyl12, M(0, 0.1, 0, 0, 0, 0, 0.13, 0.07, 0.13), 0xf4f4f0); B.add(GEO.box, M(0, 0.08, -0.13, -0.2, 0, 0, 0.2, 0.02, 0.1), 0x1a1a1a); }
    else B.add(GEO.ico1, M(0, 0.05, 0.02, 0, 0, 0, 0.125, 0.1, 0.12), P.hair);
  }));
  const limb = (x, y, len, w, colTop, colEnd, endH) => { const grp = new T.Group(); grp.position.set(x, y, 0); body.add(grp); grp.add(part(B => { B.add(GEO.box, M(0, -len / 2, 0, 0, 0, 0, w, len, w * 1.1), colTop); B.add(GEO.box, M(0, -len - endH / 2, -0.03, 0, 0, 0, w * 1.05, endH, w * 1.6), colEnd); })); return grp; };
  const legL = limb(-0.11, 0.82, 0.74, 0.15, P.legs, P.shoes, 0.08), legR = limb(0.11, 0.82, 0.74, 0.15, P.legs, P.shoes, 0.08);
  const armL = limb(-0.29, 1.44, 0.56, 0.11, P.hivis ? 0xe8f23a : P.top, P.skin, 0.09), armR = limb(0.29, 1.44, 0.56, 0.11, P.hivis ? 0xe8f23a : P.top, P.skin, 0.09);
  let sign = null;
  if (kind === 'lollipop') {
    sign = new T.Group(); sign.position.set(0.36, 1, -0.05); body.add(sign);
    sign.add(part(B => {
      B.add(GEO.cyl8, M(0, -0.1, 0, 0, 0, 0, 0.02, 1.8, 0.02), 0xf2f2f2);
      B.add(GEO.cyl16, M(0, 0.9, 0, Math.PI / 2, 0, 0, 0.3, 0.02, 0.3), 0xd0202a);
      B.add(GEO.cyl16, M(0, 0.9, -0.012, Math.PI / 2, 0, 0, 0.25, 0.01, 0.25), 0xffffff);
    }));
    const label = signTex(128, 64, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#111'; g.textAlign = 'center'; g.font = '700 46px "Barlow Condensed",Arial';
      g.fillText('STOP', 64, 48);
    });
    const face = new T.Mesh(new T.PlaneGeometry(0.4, 0.2), new T.MeshBasicMaterial({ map: label, transparent: true }));
    face.position.set(0, 0.9, -0.025); face.rotation.y = Math.PI; sign.add(face);
  }
  return { group: g, body, head, legL, legR, armL, armR, torso, sign, kind };
}
export function makeDuck(drake) {
  const B = new Batch();
  B.add(GEO.sph, M(0, 0.08, 0, 0, 0, 0, 0.13, 0.08, 0.2), drake ? 0xb8b4ac : 0x8a6a48);
  B.add(GEO.sph, M(0, 0.1, -0.12, 0, 0, 0, 0.09, 0.08, 0.08), drake ? 0x7a4a3a : 0x8a6a48);
  B.add(GEO.box, M(0, 0.13, 0.17, -0.4, 0, 0, 0.08, 0.04, 0.08), drake ? 0x2a2a2a : 0x6a5038);
  B.add(GEO.sph, M(0, 0.24, -0.15, 0, 0, 0, 0.065, 0.07, 0.07), drake ? 0x1f6a3a : 0x7a5a3c);
  if (drake) B.add(GEO.cyl8, M(0, 0.18, -0.15, 0, 0, 0, 0.05, 0.015, 0.05), 0xf2f2f2);
  B.add(GEO.box, M(0, 0.22, -0.23, 0, 0, 0, 0.05, 0.02, 0.07), 0xf2a21f);
  B.add(GEO.box, M(-0.11, 0.1, 0.02, 0, 0, 0, 0.03, 0.05, 0.14), drake ? 0x3a4a8a : 0x6a5038); B.add(GEO.box, M(0.11, 0.1, 0.02, 0, 0, 0, 0.03, 0.05, 0.14), drake ? 0x3a4a8a : 0x6a5038);
  const m = new T.Mesh(B.geometry(), lam()); m.castShadow = true; return m;
}

// ======================= VEHICLES =======================
const CARCOLS = [0xb8bcc4, 0xb3202a, 0x2a4f9c, 0xf2f2ee, 0x1c1c20, 0x1f4d36, 0x8a8f96, 0x5a2a6a, 0xd2a21f];
// ---------- cars ----------
// Each body is a side profile extruded across the width with rounded edges, with a narrower glasshouse on top
// that leans in towards the roof. Shapes are built once per kind and recoloured per car.
const CAR_GEO = {};
const sideX = (draw, width, bt, bs, seg = 5) => {
  const s = new T.Shape(); draw(s);
  const g = new T.ExtrudeGeometry(s, { depth: width - 2 * bt, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bs, bevelSegments: 2, curveSegments: seg, steps: 1 });
  g.applyMatrix4(new T.Matrix4().makeRotationY(-Math.PI / 2)); g.translate((width - 2 * bt) / 2, 0, 0); return g;
};
const polyS = pts => s => { s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); };
const archTo = (s, uc, yc, r, y0) => { const a = Math.asin(clamp((y0 - yc) / r, -1, 1)); s.absarc(uc, yc, r, Math.PI - a, a, true); };
const tumble = (g, y0, y1, k) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = clamp((p.getY(i) - y0) / (y1 - y0), 0, 1); p.setX(i, p.getX(i) * (1 - k * t)); } p.needsUpdate = true; return g; };
// glass lying along a→b of the side profile (outside is to the left of a→b), pushed out by off
function pane(B, a, b, off, w, t0, t1, col) {
  const du = b[0] - a[0], dv = b[1] - a[1], len = Math.hypot(du, dv), d = [du / len, dv / len], n = [-d[1], d[0]], tm = (t0 + t1) / 2;
  B.add(GEO.box, M(0, a[1] + dv * tm + n[1] * off, a[0] + du * tm + n[0] * off, Math.atan2(-d[1], d[0]), 0, 0, w, 0.014, len * (t1 - t0)), col);
}
// side windows: thin prisms through the glasshouse; only their ends show, on each side
function windows(B, list, width, col) { for (const pts of list) B.add(sideX(polyS(pts), width, 0, 0, 1), null, col); }
const GLASS = 0x26303a;
function carParts(kind) {
  if (CAR_GEO[kind]) return CAR_GEO[kind];
  const P = { body: [], glass: null }, G = new Batch();
  if (kind === 'hatch' || kind === 'estate') {
    const est = kind === 'estate', L = est ? 4.5 : 3.9, W = 1.72, f = -L / 2 + 0.04, b = L / 2 - 0.04, wz = L / 2 - 0.75, y0 = 0.26, rY = est ? 1.46 : 1.41, cw = W - 0.2;
    P.body.push(sideX(s => {
      s.moveTo(f + 0.16, y0); archTo(s, -wz, 0.32, 0.46, y0); archTo(s, wz, 0.32, 0.46, y0);
      s.lineTo(b - 0.16, y0); s.quadraticCurveTo(b, y0, b, y0 + 0.16); s.lineTo(b, 0.7); s.quadraticCurveTo(b, 0.88, b - 0.2, 0.88);
      s.lineTo(-wz + 0.35, 0.86); s.quadraticCurveTo(f + 0.36, 0.84, f + 0.16, 0.73); s.quadraticCurveTo(f, 0.7, f, 0.56); s.lineTo(f, y0 + 0.16); s.quadraticCurveTo(f, y0, f + 0.16, y0);
    }, W, 0.1, 0.04));
    const ws0 = [-wz + 0.22, 0.8], ws1 = [-wz + 0.94, rY - 0.06];
    const rear = est ? [[b - 0.3, rY], [b - 0.14, rY], [b - 0.12, rY - 0.16], [b - 0.06, 0.8]] : [[b - 0.69, rY - 0.01], [b - 0.41, rY - 0.01], [b - 0.33, rY - 0.15], [b - 0.12, 0.8]];
    const cab = sideX(s => {
      s.moveTo(ws0[0], ws0[1]); s.lineTo(ws1[0], ws1[1]); s.quadraticCurveTo(-wz + 1.06, rY, -wz + 1.24, rY);
      s.lineTo(rear[0][0], rear[0][1]); s.quadraticCurveTo(rear[1][0], rear[1][1], rear[2][0], rear[2][1]); s.lineTo(rear[3][0], rear[3][1]);
    }, cw, 0.1, 0.04);
    P.body.push(tumble(cab, 0.9, rY + 0.04, 0.13));
    const wl = Math.hypot(ws1[0] - ws0[0], ws1[1] - ws0[1]), wd = [(ws1[0] - ws0[0]) / wl, (ws1[1] - ws0[1]) / wl];
    const uIn = v => ws0[0] + 0.08 / wd[1] + (v - ws0[1]) * wd[0] / wd[1], lo = 0.97, hi = rY - 0.08;
    const wins = est
      ? [[[uIn(lo), lo], [uIn(hi), hi], [0.02, hi], [0.02, lo]], [[0.14, lo], [0.14, hi], [1.05, hi], [1.05, lo]], [[1.17, lo], [1.17, hi], [b - 0.42, hi], [b - 0.3, lo]]]
      : [[[uIn(lo), lo], [uIn(hi), hi], [0.3, hi], [0.3, lo]], [[0.42, lo], [0.42, hi], [1.15, hi], [1.38, lo]]];
    windows(G, wins, cw + 0.012, GLASS);
    pane(G, ws0, ws1, 0.047, cw - 0.3, 0.18, 0.93, GLASS);
    if (est) pane(G, rear[2], rear[3], 0.047, cw - 0.34, 0.05, 0.5, GLASS); else pane(G, rear[2], rear[3], 0.047, cw - 0.34, 0.08, 0.86, GLASS);
    P.glass = tumble(G.geometry(), 0.9, rY + 0.04, 0.13);
    P.dims = { L, W, H: est ? 1.5 : 1.45 };
    P.trim = (B, c) => {
      for (const sx of [-1, 1]) {
        B.add(GEO.box, M(sx * 0.6, 0.6, -L / 2 + 0.05, 0, 0, 0, 0.32, 0.12, 0.1), 0xfff2c8);                 // headlamps
        B.add(GEO.box, M(sx * 0.68, 0.68, L / 2 - 0.025, 0, 0, 0, 0.24, 0.15, 0.06), 0xc81f28);              // tail lamps
        B.add(GEO.box, M(sx * (W / 2 + 0.03), 0.98, -wz + 0.42, 0, 0, 0, 0.1, 0.08, 0.06), c);                 // mirrors
        B.add(GEO.box, M(sx * (W / 2 + 0.005), 0.78, -wz + 0.95, 0, 0, 0, 0.02, 0.03, 0.14), 0x2a2a2e);      // door handle
      }
      B.add(GEO.box, M(0, 0.5, -L / 2 + 0.01, 0, 0, 0, 0.6, 0.1, 0.05), 0x2a2a2e);                            // grille
      for (const sz of [-1, 1]) B.add(GEO.box, M(0, 0.33, sz * (L / 2 - 0.05), 0, 0, 0, W - 0.22, 0.13, 0.12), 0x2e2e32); // bumpers
      B.add(GEO.box, M(0, 0.42, -L / 2 - 0.015, 0, 0, 0, 0.52, 0.11, 0.02), 0xf6f6f2); B.add(GEO.box, M(0, 0.55, L / 2 - 0.005, 0, 0, 0, 0.52, 0.11, 0.02), 0xf2c81f);
      wheel4(B, W / 2 - 0.13, wz, 0.32);
    };
    P.lamps = [[0.6, 0.6, -L / 2 + 0.04], [0.68, 0.68, L / 2 - 0.02]];
  } else if (kind === 'van') {
    const L = 5.2, W = 1.95, f = -L / 2 + 0.04, b = L / 2 - 0.04, y0 = 0.3;
    P.body.push(tumble(sideX(s => {
      s.moveTo(f + 0.14, y0); archTo(s, -1.6, 0.36, 0.5, y0); archTo(s, 1.6, 0.36, 0.5, y0);
      s.lineTo(b - 0.1, y0); s.quadraticCurveTo(b, y0, b, y0 + 0.1); s.lineTo(b, 2.06); s.quadraticCurveTo(b, 2.26, b - 0.2, 2.26);
      s.lineTo(-1.25, 2.26); s.quadraticCurveTo(-1.6, 2.26, -1.7, 2.04); s.lineTo(-2.06, 1.32); s.quadraticCurveTo(-2.14, 1.17, -2.3, 1.15); s.quadraticCurveTo(f, 1.12, f, 0.9);
      s.lineTo(f, y0 + 0.14); s.quadraticCurveTo(f, y0, f + 0.14, y0);
    }, W, 0.12, 0.04), 1.3, 2.3, 0.05));
    const uIn = v => -2.06 + 0.08 / 0.894 + (v - 1.32) * 0.5;
    windows(G, [[[uIn(1.4), 1.4], [uIn(1.98), 1.98], [-1.02, 1.98], [-1.02, 1.4]]], W + 0.012, GLASS);
    pane(G, [-2.06, 1.32], [-1.7, 2.04], 0.047, W - 0.4, 0.08, 0.93, GLASS);
    P.glass = tumble(G.geometry(), 1.3, 2.3, 0.05);
    P.dims = { L, W, H: 2.3 };
    P.trim = (B) => {
      for (const sx of [-1, 1]) {
        B.add(GEO.box, M(sx * 0.68, 0.98, -L / 2 + 0.05, 0, 0, 0, 0.3, 0.15, 0.1), 0xfff2c8);
        B.add(GEO.box, M(sx * 0.86, 1.0, L / 2 - 0.02, 0, 0, 0, 0.13, 0.34, 0.06), 0xc81f28);
        B.add(GEO.box, M(sx * 0.42, 1.8, L / 2 - 0.006, 0, 0, 0, 0.62, 0.42, 0.03), GLASS);                   // rear door windows
        B.add(GEO.box, M(sx * (W / 2 + 0.05), 1.55, -1.72, 0, 0, 0, 0.06, 0.24, 0.14), 0x2a2a2e);
      }
      B.add(GEO.box, M(0, 0.72, -L / 2 + 0.01, 0, 0, 0, 0.9, 0.22, 0.05), 0x2a2a2e);
      for (const sz of [-1, 1]) B.add(GEO.box, M(0, 0.42, sz * (L / 2 - 0.05), 0, 0, 0, W - 0.26, 0.2, 0.14), 0x2e2e32);
      B.add(GEO.box, M(0, 0.52, -L / 2 - 0.025, 0, 0, 0, 0.52, 0.11, 0.02), 0xf6f6f2); B.add(GEO.box, M(0, 0.62, L / 2 + 0.025, 0, 0, 0, 0.52, 0.11, 0.02), 0xf2c81f);
      wheel4(B, W / 2 - 0.15, 1.6, 0.36);
    };
    P.lamps = [[0.68, 0.98, -L / 2 + 0.04], [0.86, 1.0, L / 2 - 0.01]];
  } else { // robin
    const L = 3.3, W = 1.45, f = -L / 2 + 0.04, b = L / 2 - 0.04, y0 = 0.24, cw = W - 0.14;
    P.body.push(sideX(s => {
      s.moveTo(f + 0.18, y0); archTo(s, 0.95, 0.27, 0.36, y0); s.lineTo(b - 0.14, y0); s.quadraticCurveTo(b, y0, b, y0 + 0.14); s.lineTo(b, 0.66); s.quadraticCurveTo(b, 0.8, b - 0.16, 0.8);
      s.lineTo(-0.55, 0.8); s.quadraticCurveTo(-1.3, 0.76, f + 0.12, 0.6); s.quadraticCurveTo(f, 0.56, f, 0.44); s.lineTo(f, y0 + 0.14); s.quadraticCurveTo(f, y0, f + 0.18, y0);
    }, W, 0.09, 0.04));
    const ws0 = [-0.62, 0.76], ws1 = [-0.1, 1.3];
    P.body.push(tumble(sideX(s => { s.moveTo(ws0[0], ws0[1]); s.lineTo(ws1[0], ws1[1]); s.quadraticCurveTo(0.0, 1.36, 0.14, 1.36); s.lineTo(0.85, 1.35); s.quadraticCurveTo(1.15, 1.34, 1.25, 1.2); s.lineTo(1.5, 0.76); }, cw, 0.09, 0.04), 0.84, 1.4, 0.1));
    const wl = Math.hypot(0.52, 0.54), wd = [0.52 / wl, 0.54 / wl], uIn = v => ws0[0] + 0.08 / wd[1] + (v - ws0[1]) * wd[0] / wd[1];
    windows(G, [[[uIn(0.9), 0.9], [uIn(1.28), 1.28], [0.4, 1.28], [0.4, 0.9]], [[0.52, 0.9], [0.52, 1.28], [0.9, 1.28], [1.12, 0.9]]], cw + 0.012, GLASS);
    pane(G, ws0, ws1, 0.047, cw - 0.28, 0.16, 0.92, GLASS); pane(G, [1.25, 1.2], [1.5, 0.76], 0.047, cw - 0.32, 0.1, 0.8, GLASS);
    P.glass = tumble(G.geometry(), 0.84, 1.4, 0.1);
    P.dims = { L, W, H: 1.4 };
    P.trim = (B) => {
      for (const sx of [-1, 1]) { B.add(GEO.box, M(sx * 0.48, 0.5, -L / 2 + 0.05, 0, 0, 0, 0.24, 0.12, 0.1), 0xfff2c8); B.add(GEO.box, M(sx * 0.55, 0.6, L / 2 - 0.02, 0, 0, 0, 0.16, 0.14, 0.05), 0xc81f28); }
      for (const sz of [-1, 1]) B.add(GEO.box, M(0, 0.3, sz * (L / 2 - 0.05), 0, 0, 0, W - 0.2, 0.11, 0.1), 0x2e2e32);
      B.add(GEO.box, M(0, 0.4, -L / 2 - 0.01, 0, 0, 0, 0.44, 0.1, 0.02), 0xf6f6f2); B.add(GEO.box, M(0, 0.48, L / 2 - 0.0, 0, 0, 0, 0.44, 0.1, 0.02), 0xf2c81f);
      tyre(B, 0, 0.27, -1.1, 0.27, 0.17); tyre(B, -(W / 2 - 0.1), 0.27, 0.95, 0.27, 0.18); tyre(B, W / 2 - 0.1, 0.27, 0.95, 0.27, 0.18);
    };
    P.lamps = [[0.48, 0.5, -L / 2 + 0.04], [0.55, 0.6, L / 2 - 0.01]];
  }
  CAR_GEO[kind] = P; return P;
}
function tyre(B, x, y, z, r, w) { cy(B, null, r, w, x, y, z, 0x1c1c1e, 14, 0, 0, Math.PI / 2); cy(B, null, r * 0.58, w + 0.01, x, y, z, 0xb8bcc4, 10, 0, 0, Math.PI / 2); cy(B, null, r * 0.2, w + 0.02, x, y, z, 0x6a6e76, 6, 0, 0, Math.PI / 2); }
function wheel4(B, x, z, r) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) tyre(B, sx * x, r, sz * z, r, 0.21); }
export function makeCar(kind, color, seed = 1) {
  const r = rng(seed), c = color != null ? color : pick(r, CARCOLS), P = carParts(kind === 'van' || kind === 'robin' || kind === 'estate' ? kind : 'hatch'), B = new Batch();
  for (const g of P.body) B.add(g, null, c);
  B.add(P.glass, null, null); P.trim(B, c);
  const g = new T.Group(); const m = new T.Mesh(B.geometry(), lam()); m.castShadow = true; m.receiveShadow = true; g.add(m);
  // hazard lamps that flash when the alarm goes off
  const IB = new Batch(); for (const [lx, ly, lz] of P.lamps) for (const sx of [-1, 1]) IB.add(GEO.box, M(sx * lx, ly, lz, 0, 0, 0, 0.2, 0.13, 0.1), 0xffa21f);
  const ind = new T.Mesh(IB.geometry(), new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0 })); ind.visible = false; m.add(ind);
  return { group: g, body: m, ind, L: P.dims.L, W: P.dims.W, H: P.dims.H };
}
let BUS_GEO = null;
export function makeBus() {
  const red = 0xc81e24, L = 10.8, W = 2.5, f = -L / 2 + 0.04, b = L / 2 - 0.04, y0 = 0.32;
  if (!BUS_GEO) {
    const G = new Batch();
    G.add(sideX(s => {
      s.moveTo(f + 0.2, y0); archTo(s, -3.6, 0.5, 0.64, y0); archTo(s, 3.4, 0.5, 0.64, y0); s.lineTo(b - 0.2, y0); s.quadraticCurveTo(b, y0, b, y0 + 0.2);
      s.lineTo(b, 3.86); s.quadraticCurveTo(b, 4.26, b - 0.4, 4.26); s.lineTo(f + 0.45, 4.26); s.quadraticCurveTo(f, 4.26, f, 3.8); s.lineTo(f, y0 + 0.2); s.quadraticCurveTo(f, y0, f + 0.2, y0);
    }, W, 0.16, 0.04), null, red);
    G.add(sideX(polyS([[f + 0.03, 2.0], [b - 0.03, 2.0], [b - 0.03, 2.2], [f + 0.03, 2.2]]), W + 0.02, 0.17, 0.06, 1), null, 0xe8e4da); // the cream band between decks
    windows(G, [[[-4.0, 1.15], [4.6, 1.15], [4.6, 1.95], [-4.0, 1.95]], [[-5.0, 2.8], [5.0, 2.8], [5.0, 3.72], [-5.0, 3.72]]], W + 0.012, 0x26303a);
    for (const z of [-2.9, -1.6, -0.3, 1.0, 2.3, 3.6]) G.add(GEO.box, M(0, 3.26, z, 0, 0, 0, W + 0.03, 0.92, 0.09), red);           // upper deck pillars
    for (const z of [-1.3, 0.4, 2.1, 3.8]) G.add(GEO.box, M(0, 1.55, z, 0, 0, 0, W + 0.03, 0.8, 0.09), red);                   // lower deck pillars
    G.add(GEO.box, M(0, 1.55, -L / 2 - 0.006, 0, 0, 0, W - 0.4, 1.0, 0.01), 0x26303a); G.add(GEO.box, M(0, 3.06, -L / 2 - 0.006, 0, 0, 0, W - 0.4, 0.66, 0.01), 0x26303a);
    G.add(GEO.box, M(0, 0.56, -L / 2 - 0.03, 0, 0, 0, W - 0.3, 0.34, 0.1), 0x2a2a2e); G.add(GEO.box, M(0, 0.56, L / 2 + 0.03, 0, 0, 0, W - 0.3, 0.34, 0.1), 0x2a2a2e);
    for (const sx of [-1, 1]) { G.add(GEO.box, M(sx * 0.95, 0.86, -L / 2 - 0.01, 0, 0, 0, 0.26, 0.16, 0.04), 0xfff2c8); G.add(GEO.box, M(sx * 1.05, 1.0, L / 2 + 0.0, 0, 0, 0, 0.14, 0.34, 0.05), 0xc81f28); }
    for (const z of [-3.6, 3.4]) for (const sx of [-1, 1]) tyre(G, sx * (W / 2 - 0.16), 0.5, z, 0.5, 0.3);
    BUS_GEO = G.geometry();
  }
  const g = new T.Group(); const m = new T.Mesh(BUS_GEO, lam()); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const blind = new T.Mesh(new T.PlaneGeometry(1.8, 0.32), new T.MeshBasicMaterial({ map: signTex(256, 48, (g2, w, h) => { g2.fillStyle = '#111'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#ffb21f'; g2.textAlign = 'center'; let sz = 34; const txt = '37  GRUMBLETON'; do { g2.font = `700 ${sz}px "Barlow Condensed",Arial`; } while (g2.measureText(txt).width > w - 16 && --sz > 14); g2.fillText(txt, w / 2, 24 + sz * 0.36); }) }));
  blind.position.set(0, 3.6, -L / 2 - 0.012); blind.rotation.y = Math.PI; g.add(blind);
  return { group: g, L, W, H: 4.3 };
}
