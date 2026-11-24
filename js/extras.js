import { C } from './core.js';
import { TAU, clamp, sstep, rng, pick, Batch, GEO, M, FM, frame, bx, cy, seg } from './util.js';
import { TX, plainSign, fascia } from './textures.js';
import { W, roadAt, prof, P, sb, chunkOf, staticBox, staticMeshCol, mats, TOP, botToWorld, botH, GC_PARK } from './world.js';
import { makeCar } from './models.js';
import { signPost, tbox } from './scenery.js';
const T = C.T;
const tp = (F, x, y, z) => { const v = new T.Vector3(x, y, z); if (F) v.applyMatrix4(F); return [v.x, v.y, v.z]; };

// Extra places to get some air: a rubber speed bump at Spendwells, a car transporter with its top deck down on
// the hill, embankments round Harrison's car park and a builders' merchant yard with heaps of sand and gravel.

// ---------------- speed bump in the Spendwells car park ----------------
function speedBump() {
  const y = TOP.y, z0 = 12, half = 0.5, H = 0.085, x0 = -5.9, x1 = 5.9, NZ = 8, NX = 22;
  const h = (x, z) => { const u = (z - z0) / half; if (Math.abs(u) >= 1) return 0; return H * 0.5 * (1 + Math.cos(Math.PI * u)) * sstep(0, 0.7, Math.min(x - x0, x1 - x)); };
  const B = sb('top', 'lam'), CB = new Batch();
  for (let i = 0; i < NX; i++) {
    const xa = x0 + (x1 - x0) * i / NX, xb = x0 + (x1 - x0) * (i + 1) / NX, c = i % 2 ? 0xe8b81a : 0x26262a;
    for (let k = 0; k < NZ; k++) {
      const za = z0 + half - 2 * half * k / NZ, zb = z0 + half - 2 * half * (k + 1) / NZ; // towards -z
      const q = [[xa, y + h(xa, za) + 0.004, za], [xb, y + h(xb, za) + 0.004, za], [xb, y + h(xb, zb) + 0.004, zb], [xa, y + h(xa, zb) + 0.004, zb]];
      B.quad(...q, c); CB.quad(...q, c);
    }
  }
  staticMeshCol(CB.geometry(), { kind: 'ground', name: 'SPEED BUMP' }, { friction: 0.8, rest: 0.02 });
}

// ---------------- car transporter parked on the hill, top deck lowered to the road ----------------
const TR = { s0: 604, len: 18, side: -1 };
export function transporterSpan() { return TR; }
function transporter(scene) {
  const S0 = TR.s0, Lt = TR.len, Rm = roadAt(S0 + Lt / 2, {}), dc = TR.side * (Rm.w - 1.35), deckW = 2.6, H = 2.75, kick = 0.22;
  W.transporter = { s0: S0, len: Lt, dc };
  // deck height above the road along its length: eases off the road, climbs, levels over the cab, kicks up at the end
  const hAt = v => { const x = clamp(v / Lt, 0, 1); let h = H * x * x * (3 - 2 * x); if (v > Lt - 2.2) h += kick * ((v - (Lt - 2.2)) / 2.2) ** 2; return h - 0.03 * (1 - x); };
  const at = (v, d, h) => { const s = S0 + v, R = roadAt(s, {}); return [R.x + R.rx * d, prof(s, dc) + h, R.z + R.rz * d]; };
  const N = 24, chunk = chunkOf(S0), metal = sb(chunk, 'lam'), CB = new Batch();
  const dl = dc - deckW / 2, dr = dc + deckW / 2;
  for (let k = 0; k < N; k++) {
    const va = Lt * k / N, vb = Lt * (k + 1) / N, ha = hAt(va), hb = hAt(vb);
    // riding surface: two steel tracks with a darker channel down the middle
    const q = (d0, d1, c) => { const quad = [at(va, d0, ha), at(va, d1, ha), at(vb, d1, hb), at(vb, d0, hb)]; metal.quad(...quad, c); CB.quad(...quad, c); };
    q(dl, dc - 0.35, 0x8e959c); q(dc - 0.35, dc + 0.35, 0x5d6268); q(dc + 0.35, dr, 0x8e959c);
    // sides: thin plates under the edges, and a solid side all the way down for the collider so nothing slips under
    for (const [d, sgn] of [[dl, -1], [dr, 1]]) {
      const top = [at(va, d, ha), at(vb, d, hb)], low = [at(va, d, ha - 0.14), at(vb, d, hb - 0.14)];
      if (sgn < 0) metal.quad(low[0], low[1], top[1], top[0], 0x3c4046); else metal.quad(top[0], top[1], low[1], low[0], 0x3c4046);
      const g0 = [at(va, d, -0.05), at(vb, d, -0.05)];
      if (vb < Lt - 3.2) { if (sgn < 0) CB.quad(g0[0], g0[1], top[1], top[0]); else CB.quad(top[0], top[1], g0[1], g0[0]); }
    }
  }
  // the end of the deck
  { const hE = hAt(Lt); const a = at(Lt, dl, hE), b = at(Lt, dr, hE), c = at(Lt, dr, hE - 0.16), d = at(Lt, dl, hE - 0.16); metal.quad(b, a, d, c, 0x3c4046); CB.quad(b, a, d, c); }
  staticMeshCol(CB.geometry(), { kind: 'ground', name: 'CAR TRANSPORTER' }, { friction: 0.75, rest: 0.02 });
  // lorry body in a frame pitched with the road: origin at the back of the deck on the road, -z downhill
  const pr = at(0, dc, 0), pf = at(Lt, dc, 0), pitch = Math.atan2(pf[1] - pr[1], Math.hypot(pf[0] - pr[0], pf[2] - pr[2]));
  const F = frame(pr[0], pr[1], pr[2], -Rm.th, pitch);
  const L = metal, paint = 0x1f4f8a, dark = 0x2a2c30;
  // chassis and lower deck under the climbing part
  bx(L, F, 2.2, 0.45, 7.1, 0, 0.78, -11.55, dark); bx(L, F, 2.36, 0.08, 7.1, 0, 1.02, -11.55, 0x6b7076);
  // uprights from the chassis to the top deck
  for (const v of [8.2, 10.6, 13.0]) for (const sx of [-1.12, 1.12]) { const h = hAt(v); if (h > 1.15) bx(L, F, 0.12, h - 1.07, 0.12, sx, 1.07 + (h - 1.07) / 2, -v, paint); }
  // wheels: tandem axle at the back of the chassis, steer axle under the cab
  for (const v of [8.6, 9.9, 16.4]) for (const sx of [-1.02, 1.02]) { cy(L, F, 0.5, 0.36, sx, 0.5, -v, 0x1c1c1e, 12, 0, 0, Math.PI / 2); cy(L, F, 0.26, 0.37, sx, 0.5, -v, 0xb8bcc4, 8, 0, 0, Math.PI / 2); }
  // cab
  { const cz = -16.4; bx(L, F, 2.36, 1.55, 2.5, 0, 1.4, cz, paint); bx(L, F, 2.3, 0.85, 2.3, 0, 2.02 + 0.0, cz - 0.05, paint);
    bx(L, F, 2.1, 0.62, 0.05, 0, 2.02, cz - 1.27, 0x26303a, -0.12); for (const sx of [-1.18, 1.18]) bx(L, F, 0.04, 0.5, 1.0, sx, 2.05, cz - 0.6, 0x26303a);
    bx(L, F, 2.4, 0.3, 0.12, 0, 0.72, cz - 1.3, dark); bx(L, F, 1.4, 0.4, 0.04, 0, 1.15, cz - 1.27, 0x3a3e44);
    for (const sx of [-0.9, 0.9]) { bx(L, F, 0.34, 0.16, 0.04, sx, 0.98, cz - 1.29, 0xfff2c8); bx(L, F, 0.08, 0.3, 0.2, sx * 1.36, 2.1, cz - 1.05, dark); } }
  // ramp plates at the back look like loading ramps
  bx(L, F, 2.3, 0.08, 0.5, 0, 0.04, -0.2, 0x8e959c);
  // colliders for the cab and the chassis (the deck and sides have their own)
  const box = (v0, v1, h0, h1, hw, name) => { const vm = (v0 + v1) / 2, c = new T.Vector3(0, (h0 + h1) / 2, -vm).applyMatrix4(F); staticBox(c.x, c.y, c.z, hw, (h1 - h0) / 2, (v1 - v0) / 2, -Rm.th, { kind: 'wall', name }, pitch); };
  box(Lt - 3.1, Lt - 0.15, 0, 2.42, 1.18, 'LORRY CAB'); box(8.0, Lt - 3.1, 0, 1.05, 1.15, 'LORRY');
  // the driver, waiting on the pavement
  W.nearTargets.push({ x: (pr[0] + pf[0]) / 2, z: (pr[2] + pf[2]) / 2, r: 9, kind: 'LORRY', box: { hx: 1.25, hz: Lt / 2, yaw: -Rm.th } });
  // a couple of things to collect on the way off the end
  for (const [dv, hh, k] of [[5, 3.0, 'gnome'], [10, 2.4, 'milk']]) { const p = at(Lt + dv, dc, hAt(Lt) + hh - 2.75); W.pickups.push({ k, x: p[0], y: p[1] + 0.5, z: p[2] }); }
}

// ---------------- embankments round Harrison's car park ----------------
// cross-section: a curved concrete face (like a low quarter pipe), a grass top, then a gentle grass slope down the back
const BERM = { h: 0.7, lip: 45 * Math.PI / 180, deck: 1.0, back: 3.0 };
BERM.r = BERM.h / (1 - Math.cos(BERM.lip)); BERM.u1 = BERM.r * Math.sin(BERM.lip); BERM.w = BERM.u1 + BERM.deck + BERM.back;
function bermProfile(u) {
  if (u <= 0) return 0;
  if (u < BERM.u1) return BERM.r - Math.sqrt(Math.max(0, BERM.r * BERM.r - u * u));
  if (u < BERM.u1 + BERM.deck) return BERM.h;
  const t = (u - BERM.u1 - BERM.deck) / BERM.back; return t >= 1 ? 0 : BERM.h * (1 - sstep(0, 1, t));
}
const BERMS = [];
function berm(lx0, lf0, lx1, lf1, ox, of) {
  // edge from (lx0,lf0) to (lx1,lf1); (ox,of) points away from the car park
  const len = Math.hypot(lx1 - lx0, lf1 - lf0), ex = (lx1 - lx0) / len, ef = (lf1 - lf0) / len;
  BERMS.push({ lx0, lf0, ex, ef, ox, of, len });
  const taper = a => sstep(0, 3, Math.min(a, len - a));
  const pt = (a, u) => { const lx = lx0 + ex * a + ox * u, lf = lf0 + ef * a + of * u, w = botToWorld(lx, lf); return [w.x, botH(lx, lf) + bermProfile(u) * taper(a), w.z]; };
  const us = []; for (let k = 0; k <= 6; k++) us.push(BERM.u1 * k / 6); us.push(BERM.u1 + BERM.deck); for (let k = 1; k <= 5; k++) us.push(BERM.u1 + BERM.deck + BERM.back * k / 5);
  const face = sb('bot', 'kerb'), grass = sb('bot', 'grass'), CB = new Batch(), NA = Math.ceil(len);
  // make each quad face up whichever way the edge runs
  const flip = (ex * of - ef * ox) < 0;
  for (let i = 0; i < NA; i++) {
    const a0 = len * i / NA, a1 = len * (i + 1) / NA;
    for (let k = 0; k < us.length - 1; k++) {
      const u0 = us[k], u1 = us[k + 1], q = [pt(a0, u0), pt(a1, u0), pt(a1, u1), pt(a0, u1)];
      const quad = flip ? [q[0], q[3], q[2], q[1]] : q;
      const B = k < 6 ? face : grass;
      B.quad(...quad, k < 6 ? 0xe6e2d8 : 0xffffff, [a0 / 1.6, u0 / 1.6, a1 / 1.6, u1 / 1.6]); CB.quad(...quad);
    }
  }
  staticMeshCol(CB.geometry(), { kind: 'ground', name: 'EMBANKMENT' }, { friction: 0.75, rest: 0.02 });
}
// highest embankment surface at a plaza point (for the camera and in-air levelling)
export function bermH(lx, lf) {
  let h = 0;
  for (const b of BERMS) { const dx = lx - b.lx0, df = lf - b.lf0, a = dx * b.ex + df * b.ef, u = dx * b.ox + df * b.of; if (a < 0 || a > b.len || u < 0 || u > BERM.w) continue; h = Math.max(h, bermProfile(u) * sstep(0, 3, Math.min(a, b.len - a))); }
  return h;
}
function carParkBerms() {
  berm(-36, 103, -36, 56, -1, 0); // west side, face looks east into the car park
  berm(36, 56, 36, 103, 1, 0);    // east side
  berm(-34, 54, -7, 54, 0, -1);   // south side, either side of the way in from the pond
  berm(7, 54, 34, 54, 0, -1);
  berm(GC_PARK.lx0 + 1, GC_PARK.lf1, GC_PARK.lx1 - 1, GC_PARK.lf1, 0, 1); // back of the garden centre car park
}
// garden centre car park: a couple of cars in the bays, a trolley sign
function gardenCentrePark(scene) {
  const r = rng(808);
  for (const [lf, c] of [[24.55, 0x3a6a4a], [29.95, 0xd8d4c8]]) {
    const car = makeCar('estate', c, Math.floor(r() * 1e6)), p = botToWorld(GC_PARK.lx0 + 3.0, lf), yaw = -Math.PI / 2;
    car.group.position.set(p.x, 0.03, p.z); car.group.rotation.y = yaw; scene.add(car.group);
    const idx = W.cars.length; W.cars.push({ car, x: p.x, y: 0.03, z: p.z, yaw, alarm: 0, rock: 0 });
    staticBox(p.x, 0.7, p.z, car.W / 2, 0.6, car.L / 2, yaw, { kind: 'car', name: 'PARKED CAR', car: idx });
    W.nearTargets.push({ x: p.x, z: p.z, r: car.L / 2, kind: 'PARKED CAR', box: { hx: car.W / 2, hz: car.L / 2, yaw } });
  }
  // gnomes for sale along the top of the bank, and the usual sign behind
  const deck = GC_PARK.lf1 + BERM.u1 + BERM.deck / 2;
  for (let k = 0; k < 12; k++) { const lx = -59 + k, p = botToWorld(lx, deck); W.dyn.push({ type: 'gnome', x: p.x, y: botH(lx, deck) + BERM.h + 0.4, z: p.z, yaw: Math.PI + (r() - 0.5) * 0.7 }); }
  const sp = botToWorld(-53.5, GC_PARK.lf1 + 5); signPost(scene, sp.x, 0, sp.z, Math.PI, fascia('PLANTASTIC', { bg: '#2f7a3a', fg: '#fff', w: 256, h: 96, size: 44, sub: 'CUSTOMER PARKING ONLY' }), 3.0, 1.1, 1.45, { name: 'GARDEN CENTRE SIGN', twin: true });
}

// ---------------- builders' merchant yard (south part of the building site) ----------------
function buildersYard(scene) {
  const BW = botToWorld, L = sb('bot', 'lam'), r = rng(404);
  const bf = (lx, lf, yaw = 0) => { const p = BW(lx, lf); return frame(p.x, botH(lx, lf), p.z, yaw); };
  const solid = (lx, lf, w, h, d, name, yaw = 0) => { const p = BW(lx, lf); staticBox(p.x, botH(lx, lf) + h / 2, p.z, w / 2, h / 2, d / 2, yaw, { kind: 'wall', name }); };
  // sign at the gate
  { const sp = BW(50, 16.8); signPost(scene, sp.x, 0, sp.z, Math.PI, plainSign(['GRUMBLETON', 'BUILDERS MERCHANTS', ['Trade & Public', 20]], { w: 256, h: 150, bg: '#f4f2ea', fg: '#1d3d8f', border: '#1d3d8f' }), 1.6, 0.95, 1.5, { name: 'YARD SIGN' }); }
  // bulk bags of sand and gravel: a row along the front, a second row stacked behind
  const bag = (lx, lf, h0, fill) => { const F = bf(lx, lf, (r() - 0.5) * 0.12); bx(L, F, 0.92, 0.88, 0.92, 0, h0 + 0.44, 0, 0xf0ece0); L.add(GEO.ico1, FM(F, 0, h0 + 0.9, 0, 0, r() * 3, 0, 0.42, 0.12, 0.42), fill); for (const [ax, az] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) seg(L, F, [ax, h0 + 0.86, az], [ax * 0.7, h0 + 1.05, az * 0.7], 0.025, 0x2a6ab8, 4); };
  const SAND = 0xd9b77a, GRAVEL = 0x9a948a, SOIL = 0x6b4f36;
  for (let k = 0; k < 6; k++) { const lx = 50.5 + k * 1.0, fill = [SAND, GRAVEL, SAND, SOIL, GRAVEL, SAND][k]; bag(lx, 26.2, 0, fill); if (k > 0 && k < 5) bag(lx, 27.2, 0, fill); if (k > 1 && k < 4) bag(lx, 26.7, 0.92, fill); }
  solid(53, 26.7, 6.1, 1.85, 2.1, 'BULK BAGS');
  // pallets of bricks and blocks, wrapped in plastic
  const pallet = (lx, lf, h0, c) => { const F = bf(lx, lf, 0); bx(L, F, 1.1, 0.14, 1.1, 0, h0 + 0.07, 0, 0x9b7148); bx(L, F, 1.0, 0.72, 1.0, 0, h0 + 0.5, 0, c); };
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const c = (i + j) % 3 === 0 ? 0xa8a49a : 0xa4523a; pallet(80 + i * 1.3, 22 + j * 1.3, 0, c); if ((i + j) % 2 === 0) pallet(80 + i * 1.3, 22 + j * 1.3, 0.86, c); }
  solid(81.95, 22.65, 5.3, 1.72, 2.5, 'PALLETS OF BRICKS');
  // open-fronted timber store
  { const F = bf(95, 34, Math.PI / 2), Wd = 14, Dp = 6;
    for (const sx of [-Wd / 2, -Wd / 6, Wd / 6, Wd / 2]) bx(L, F, 0.18, 3.6, 0.18, sx, 1.8, -Dp / 2 + 0.3, 0x5a5e64);
    bx(L, F, Wd + 0.6, 0.12, Dp + 0.8, 0, 3.7, 0, 0x6f7a82, -0.08); tbox(sb('bot', 'wood'), F, Wd, 3.4, 0.2, 0, 1.7, Dp / 2, 0xffffff);
    for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) bx(sb('bot', 'wood'), F, Wd - 1.2, 0.18, 0.5, 0, 0.6 + k * 0.62, Dp / 2 - 0.6 - j * 0.7, 0xffffff);
    const p = BW(96.4, 34); staticBox(p.x, 1.8, p.z, 1.6, 1.8, Wd / 2, 0, { kind: 'wall', name: 'TIMBER STORE' }); }
  // a forklift parked up by the bricks
  { const F = bf(78, 28, 0.6); bx(L, F, 1.1, 0.9, 1.9, 0, 0.7, 0, 0xf2c81f); bx(L, F, 1.0, 0.08, 1.0, 0, 2.1, 0.2, 0x2a2c30); for (const sx of [-0.48, 0.48]) bx(L, F, 0.06, 1.3, 0.06, sx, 1.45, 0.62, 0x2a2c30);
    bx(L, F, 0.9, 1.9, 0.12, 0, 1.1, -1.05, 0x2a2c30); for (const sx of [-0.25, 0.25]) bx(L, F, 0.1, 0.06, 1.0, sx, 0.08, -1.55, 0x3a3e44);
    for (const [sx, sz, rr] of [[-0.55, -0.6, 0.3], [0.55, -0.6, 0.3], [-0.55, 0.65, 0.24], [0.55, 0.65, 0.24]]) cy(L, F, rr, 0.22, sx, rr, sz, 0x1c1c1e, 10, 0, 0, Math.PI / 2);
    const p = BW(78, 28); staticBox(p.x, 1.0, p.z, 0.6, 1.0, 1.3, 0.6, { kind: 'wall', name: 'FORKLIFT' }); }
  // a few bollards along the front
  for (const lx of [47, 60, 70, 100]) { const p = BW(lx, 18.4); cy(L, null, 0.1, 0.9, p.x, 0.45, p.z, 0x2a2c30, 8); bx(L, null, 0.21, 0.08, 0.21, p.x, 0.75, p.z, 0xe8e4da); }
}

export function buildExtras(scene) {
  speedBump();
  transporter(scene);
  carParkBerms();
  gardenCentrePark(scene);
  buildersYard(scene);
  W.bermH = bermH;
}
