import { C } from './core.js';
import { clamp, sstep, Batch, frame, bx, cy } from './util.js';
import { W, roadAt, prof, sb, chunkOf, staticBox, staticMeshCol, TOP, botToWorld, botH } from './world.js';
const T = C.T;

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
function transporter() {
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
  for (const [dv, hh, k] of [[5, 3.0, 'gnome']]) { const p = at(Lt + dv, dc, hAt(Lt) + hh - 2.75); W.pickups.push({ k, x: p[0], y: p[1] + 0.5, z: p[2] }); }
}

// ---------------- embankments round Harrison's car park ----------------
// Shallow concrete face with a grassy slope behind it.
const BERM = { h: 0.7, lip: Math.PI / 4, deck: 1.0, back: 3.0 };
BERM.r = BERM.h / (1 - Math.cos(BERM.lip)); BERM.u1 = BERM.r * Math.sin(BERM.lip); BERM.w = BERM.u1 + BERM.deck + BERM.back;
function bermProfile(u) {
  if (u <= 0) return 0;
  if (u < BERM.u1) return BERM.r - Math.sqrt(Math.max(0, BERM.r * BERM.r - u * u));
  if (u < BERM.u1 + BERM.deck) return BERM.h;
  const t = (u - BERM.u1 - BERM.deck) / BERM.back; return t >= 1 ? 0 : BERM.h * (1 - sstep(0, 1, t));
}
const NC = 6; // samples round the curve
const BERMS = [];
function berm(lx0, lf0, lx1, lf1, ox, of) {
  // edge from (lx0,lf0) to (lx1,lf1); (ox,of) points away from the car park
  const len = Math.hypot(lx1 - lx0, lf1 - lf0), ex = (lx1 - lx0) / len, ef = (lf1 - lf0) / len;
  BERMS.push({ lx0, lf0, ex, ef, ox, of, len });
  const taper = a => sstep(0, 3, Math.min(a, len - a));
  const pt = (a, u) => { const lx = lx0 + ex * a + ox * u, lf = lf0 + ef * a + of * u, w = botToWorld(lx, lf); return [w.x, botH(lx, lf) + bermProfile(u) * taper(a), w.z]; };
  const us = []; for (let k = 0; k <= NC; k++) us.push(BERM.u1 * (1 - Math.cos(k / NC * Math.PI / 2))); us.push(BERM.u1 + BERM.deck); for (let k = 1; k <= 5; k++) us.push(BERM.u1 + BERM.deck + BERM.back * k / 5);
  const face = sb('bot', 'kerb'), grass = sb('bot', 'grass'), CB = new Batch(), NA = Math.ceil(len);
  // make each quad face up whichever way the edge runs
  const flip = (ex * of - ef * ox) < 0;
  for (let i = 0; i < NA; i++) {
    const a0 = len * i / NA, a1 = len * (i + 1) / NA;
    for (let k = 0; k < us.length - 1; k++) {
      const u0 = us[k], u1 = us[k + 1], q = [pt(a0, u0), pt(a1, u0), pt(a1, u1), pt(a0, u1)];
      const quad = flip ? [q[0], q[3], q[2], q[1]] : q;
      const B = k < NC ? face : grass;
      B.quad(...quad, k < NC ? 0xe6e2d8 : 0xffffff, [a0 / 1.6, u0 / 1.6, a1 / 1.6, u1 / 1.6]); CB.quad(...quad);
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
}

export function buildExtras() {
  speedBump();
  transporter();
  carParkBerms();
  W.bermH = bermH;
}
