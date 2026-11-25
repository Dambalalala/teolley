import { C, G, ig, ALL } from './core.js';
import { TAU, clamp, lerp, sstep, rng, Batch, GEO, M, FM, frame, bx, vnoise } from './util.js';
import { TX, ctex } from './textures.js?v=grumbleton-polish';
const T = C.T;

// ============ the road: centreline, elevation and cross-section ============
export const RA_S = 420;            // roundabout centre (arc length)
export const ZEBRA_S = 180;
const HUMP_HALF_LENGTH = 0.9;
export const S_END = 782;           // where the hill road meets the bottom junction
const KERB = 0.13, PAVE = 2.2, CROWN = 0.07;
const kerbHeight = s => lerp(0.018, KERB, sstep(1.6, 3.2, Math.abs(s - ZEBRA_S)));
export const W = {
  KERB, PAVE,
  bumps: [72, 136, 226, 516, 652],
  potholes: [], nearTargets: [], pickups: [],
  houses: { L: [[8, 372], [486, 738]], R: [[8, 296], [490, 738]] },
};

// monotone cubic interpolation (keeps the hill profile from overshooting)
function pchip(xs, ys) {
  const n = xs.length, h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]);
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
const ELEV = pchip([-200, 0, 25, 110, 190, 300, 370, 395, 445, 470, 560, 700, 742, 772, 1000], [60, 60, 59.7, 54, 47.4, 39, 35, 34.3, 33.4, 32.3, 22.2, 6.2, 1.2, 0, 0]);
const TURNS = [[0, 110, 0], [110, 190, -0.35], [190, 480, 0], [480, 570, 0.35], [570, 2000, 0]];
const S0 = -160, S1 = 1000, DS = 0.5, NS = Math.round((S1 - S0) / DS) + 1;
const CX = new Float64Array(NS), CZ = new Float64Array(NS), CTH = new Float64Array(NS);
(function () {
  // integrate heading from s=0 both ways
  const i0 = Math.round(-S0 / DS);
  const rate = s => { for (const [a, b, t] of TURNS) if (s >= a && s < b) return t / (b - a); return 0; };
  CX[i0] = 0; CZ[i0] = 0; CTH[i0] = 0;
  for (let i = i0 + 1; i < NS; i++) { const s = S0 + (i - 0.5) * DS, th = CTH[i - 1] + rate(s) * DS; CTH[i] = th; const tm = (CTH[i - 1] + th) / 2; CX[i] = CX[i - 1] + Math.sin(tm) * DS; CZ[i] = CZ[i - 1] - Math.cos(tm) * DS; }
  for (let i = i0 - 1; i >= 0; i--) { CTH[i] = 0; CX[i] = CX[i + 1]; CZ[i] = CZ[i + 1] + DS; }
})();
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
export function roadW(s) {
  let w = 3.6; const u = (s - RA_S) / 17;
  if (Math.abs(u) < 1) w = smax(w, 13.4 * Math.sqrt(1 - u * u), 2.5);
  if (s > 758) w += sstep(758, 784, s) * 6;
  return w;
}
const RS = { x: 0, z: 0, th: 0, y: 0, w: 0, rx: 0, rz: 0, fx: 0, fz: 0 };
export function roadAt(s, o = RS) {
  const f = clamp((s - S0) / DS, 0, NS - 1.001), i = Math.floor(f), t = f - i;
  o.x = CX[i] + (CX[i + 1] - CX[i]) * t; o.z = CZ[i] + (CZ[i + 1] - CZ[i]) * t; o.th = CTH[i] + (CTH[i + 1] - CTH[i]) * t;
  o.y = ELEV(s); o.w = roadW(s); o.fx = Math.sin(o.th); o.fz = -Math.cos(o.th); o.rx = Math.cos(o.th); o.rz = Math.sin(o.th);
  return o;
}
export function hasHouse(s, side) { for (const [a, b] of W.houses[side < 0 ? 'L' : 'R']) if (s >= a && s <= b) return true; return false; }
const gardenH = (s, side) => (hasHouse(s, side) ? 0.30 : 0.16);
export function humpAt(s, ad, w) {
  if (ad > w - 0.35) return 0;
  const edge = sstep(w - 0.35, w - 0.75, ad);
  for (const b of W.bumps) { const u = (s - b) / HUMP_HALF_LENGTH; if (Math.abs(u) < 1) { const c = Math.cos(u * Math.PI / 2); return 0.085 * c * c * edge; } }
  return 0;
}
const PR = { x: 0, z: 0, th: 0, y: 0, w: 0, rx: 0, rz: 0, fx: 0, fz: 0 };
// surface height relative to nothing (absolute) across the corridor at (s, d)
export function prof(s, d) {
  const R = roadAt(s, PR), w = R.w, ad = Math.abs(d);
  if (ad <= w) return R.y + CROWN * sstep(0, 10, s) * (1 - (ad / w) * (ad / w)) * (3.6 / w) + humpAt(s, ad, w);
  if (ad <= w + PAVE) return R.y + kerbHeight(s) + 0.03 * (ad - w) / PAVE;
  return R.y + gardenH(s, Math.sign(d));
}
// world position on the corridor
export function P(s, d, h = 0) { const R = roadAt(s, PR); return { x: R.x + R.rx * d, y: prof(s, d) + h, z: R.z + R.rz * d, th: R.th }; }
// yaw for an object whose local +z should point along (dx, dz)
export const yawTo = (dx, dz) => Math.atan2(dx, dz);

// nearest centreline point for any (x,z): grid hash of samples
const GH = new Map(), GCELL = 12;
const cellKey = (x, z) => x * 65536 + z;
for (let i = 0; i < NS; i += 2) { const k = cellKey(Math.floor(CX[i] / GCELL), Math.floor(CZ[i] / GCELL)); if (!GH.has(k)) GH.set(k, []); GH.get(k).push(i); }
const LOC = { s: 0, d: 0, dist: 1e9 };
export function locate(x, z, o = LOC) {
  const cx = Math.floor(x / GCELL), cz = Math.floor(z / GCELL); let best = -1, bd = 1e18;
  for (let r = 0; r < 12 && best < 0; r++) {
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
      const L = GH.get(cellKey(cx + a, cz + b)); if (!L) continue;
      for (const i of L) { const dx = x - CX[i], dz = z - CZ[i], dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = i; } }
    }
    if (best >= 0 && r < 11) { // one more ring to be safe
      for (let a = -r - 1; a <= r + 1; a++) for (let b = -r - 1; b <= r + 1; b++) { if (Math.max(Math.abs(a), Math.abs(b)) !== r + 1) continue; const L = GH.get(cellKey(cx + a, cz + b)); if (!L) continue; for (const i of L) { const dx = x - CX[i], dz = z - CZ[i], dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = i; } } }
    }
  }
  if (best < 0) { o.s = 0; o.d = 0; o.dist = 1e9; return o; }
  let i = best; // refine against neighbours
  for (let k = 0; k < 4; k++) { const a = Math.max(0, i - 1), b = Math.min(NS - 1, i + 1); const da = (x - CX[a]) ** 2 + (z - CZ[a]) ** 2, db = (x - CX[b]) ** 2 + (z - CZ[b]) ** 2, di = (x - CX[i]) ** 2 + (z - CZ[i]) ** 2; if (da < di) i = a; else if (db < di) i = b; else break; }
  const th = CTH[i], fx = Math.sin(th), fz = -Math.cos(th), dx = x - CX[i], dz = z - CZ[i];
  const along = dx * fx + dz * fz; o.s = S0 + i * DS + along; o.d = dx * Math.cos(th) + dz * Math.sin(th); o.dist = Math.abs(o.d);
  return o;
}

// ============ static batches & colliders ============
const MATS = {};
export function mats() {
  if (MATS.lam) return MATS;
  const L = o => new T.MeshLambertMaterial(Object.assign({ vertexColors: true }, o));
  Object.assign(MATS, {
    lam: L(), road: L({ map: TX.asphalt }), tarmac: L({ map: TX.tarmac }), pave: L({ map: TX.pavement }), kerb: L({ map: TX.kerb }), grass: L({ map: TX.grass }),
    brick: L({ map: TX.brick }), brickY: L({ map: TX.brickY }), brickB: L({ map: TX.brickB }), render: L({ map: TX.render }), roof: L({ map: TX.roof }), tile: L({ map: TX.roofTile }),
    wood: L({ map: TX.wood }), hedge: L({ map: TX.hedge }), dirt: L({ map: TX.dirt }),
    glass: L({ map: TX.glass }), mark: L({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    decal: new T.MeshLambertMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  });
  return MATS;
}
const SB = new Map();
export function sb(chunk, mat) { const k = chunk + '|' + mat; if (!SB.has(k)) SB.set(k, { chunk, mat, B: new Batch() }); return SB.get(k).B; }
export const chunkOf = s => 'c' + Math.floor(clamp(s, -100, 999) / 90);
export function flushStatics(scene) {
  const MM = mats();
  for (const { chunk, mat, B } of SB.values()) {
    if (B.empty) continue; const m = new T.Mesh(B.geometry(), MM[mat] || MM.lam);
    const background = chunk.startsWith('bg');
    m.userData.background = background;
    m.receiveShadow = !background; m.castShadow = !background && !(mat === 'road' || mat === 'pave' || mat === 'grass' || mat === 'kerb' || mat === 'mark' || mat === 'tarmac' || mat === 'dirt' || mat === 'glass');
    m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m);
  }
  SB.clear();
}
const yq = (yaw, pitch = 0, roll = 0) => { const q = new T.Quaternion().setFromEuler(new T.Euler(pitch, yaw, roll, 'YXZ')); return { x: q.x, y: q.y, z: q.z, w: q.w }; };
function finishCol(desc, info, opts = {}) {
  desc.setFriction(opts.friction ?? 0.7).setRestitution(opts.rest ?? 0.15).setCollisionGroups(ig(G.GROUND, ALL));
  const c = C.phys.createCollider(desc); if (info) C.colInfo.set(c.handle, info); return c;
}
export function staticBox(x, y, z, hx, hy, hz, yaw = 0, info = null, pitch = 0, roll = 0, opts) {
  const R = C.RAPIER; return finishCol(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation(yq(yaw, pitch, roll)), info, opts);
}
export function staticCyl(x, y, z, r, hh, info = null, opts) { const R = C.RAPIER; return finishCol(R.ColliderDesc.cylinder(hh, r).setTranslation(x, y, z), info, opts); }
export function staticHull(pts, info = null, opts) { const R = C.RAPIER; const d = R.ColliderDesc.convexHull(new Float32Array(pts)); return d ? finishCol(d, info, opts) : null; }
// static triangle mesh from a (non-indexed or indexed) BufferGeometry already placed in world space
export function staticMeshCol(geo, info = null, opts) {
  const R = C.RAPIER, pos = geo.attributes.position.array, idx = geo.index ? geo.index.array : null;
  const ii = idx ? new Uint32Array(idx) : new Uint32Array(pos.length / 3).map((_, k) => k);
  return finishCol(R.ColliderDesc.trimesh(new Float32Array(pos), ii), info, opts);
}

// ============ corridor mesh + collider ============
function sampleList() {
  // The first road row meets the car park at its edge without an overlapping surface.
  const L = new Set([-TOP.z0]);
  for (let s = 1; s <= S_END + 0.01; s += 2) L.add(+s.toFixed(3));
  for (const b of W.bumps) for (let u = -1.2; u <= 1.21; u += 0.15) L.add(+(b + u).toFixed(3));
  for (let i = -8; i <= 8; i++) L.add(ZEBRA_S + i * 0.4);
  for (let s = 395; s <= 446; s += 1) L.add(s);
  for (let s = 752; s <= S_END; s += 1) L.add(s);
  return [...L].sort((a, b) => a - b);
}
function triOK(P, a, b, c) {
  const ax = P[b * 3] - P[a * 3], ay = P[b * 3 + 1] - P[a * 3 + 1], az = P[b * 3 + 2] - P[a * 3 + 2], bx2 = P[c * 3] - P[a * 3], by = P[c * 3 + 1] - P[a * 3 + 1], bz = P[c * 3 + 2] - P[a * 3 + 2];
  const cx = ay * bz - az * by, cy2 = az * bx2 - ax * bz, cz = ax * by - ay * bx2; return cx * cx + cy2 * cy2 + cz * cz > 1e-8;
}
function buildCorridor(scene) {
  const MM = mats(), ss = sampleList(), n = ss.length;
  const phys = { p: [], i: [] }, renderBatches = new Map();
  // lanes: list of d (with explicit y overrides) across the road, left to right
  const lanes = [
    { mat: 'grass', pts: (w, s) => [[-w - 16, null], [-w - PAVE, null]], uv: (d, s, w) => [d / 5, s / 5] },
    { mat: 'kerb', pts: (w, s) => [[-w - PAVE, gardenH(s, -1)], [-w - PAVE, kerbHeight(s) + 0.03]], uv: (d, s, w, j) => [s / 1, j * 0.2] },
    { mat: 'pave', pts: (w, s) => [[-w - PAVE, null], [-w - 0.15, null]], uv: (d, s, w) => [(Math.abs(d) - w) / 1.8, s / 1.8] },
    { mat: 'kerb', pts: (w, s) => [[-w - 0.15, kerbHeight(s)], [-w, kerbHeight(s)]], uv: (d, s, w, j) => [s / 1, j * 0.25] },
    { mat: 'kerb', pts: (w, s) => [[-w, kerbHeight(s)], [-w, 0]], uv: (d, s, w, j) => [s / 1, 0.25 + j * 0.2] },
    { mat: 'road', pts: (w, s) => { const a = []; for (let j = 0; j <= 10; j++) a.push([-w + 2 * w * j / 10, null]); return a; }, uv: (d, s, w) => [d / 4, s / 4] },
    { mat: 'kerb', pts: (w, s) => [[w, 0], [w, kerbHeight(s)]], uv: (d, s, w, j) => [s / 1, 0.25 + j * 0.2] },
    { mat: 'kerb', pts: (w, s) => [[w, kerbHeight(s)], [w + 0.15, kerbHeight(s)]], uv: (d, s, w, j) => [s / 1, j * 0.25] },
    { mat: 'pave', pts: (w, s) => [[w + 0.15, null], [w + PAVE, null]], uv: (d, s, w) => [(Math.abs(d) - w) / 1.8, s / 1.8] },
    { mat: 'kerb', pts: (w, s) => [[w + PAVE, kerbHeight(s) + 0.03], [w + PAVE, gardenH(s, 1)]], uv: (d, s, w, j) => [s / 1, j * 0.2] },
    { mat: 'grass', pts: (w, s) => [[w + PAVE, null], [w + 16, null]], uv: (d, s, w) => [d / 5, s / 5] },
  ];
  // chunked render meshes
  const CH = 110;
  for (const lane of lanes) {
    let B = null, chunk = null, prevRow = null;
    for (let k = 0; k < n; k++) {
      const s = ss[k], R = roadAt(s), pts = lane.pts(R.w, s), row = [];
      for (let j = 0; j < pts.length; j++) {
        const d = pts[j][0], y = pts[j][1] == null ? prof(s, d) : R.y + pts[j][1];
        const x = R.x + R.rx * d, z = R.z + R.rz * d; row.push([x, y, z, lane.uv(d, s, R.w, j)]);
      }
      const ck = Math.floor((s + 10) / CH);
      if (ck !== chunk) { if (B) { addLaneMesh(B, lane.mat, chunk); } B = { p: [], u: [], i: [], n: 0 }; chunk = ck; if (prevRow) pushRow(B, prevRow); }
      pushRow(B, row);
      // physics
      const base = phys.p.length / 3; for (const r of row) phys.p.push(r[0], r[1], r[2]);
      if (prevRow) { const pb = base - row.length; for (let j = 0; j < row.length - 1; j++) { const a = pb + j, b = base + j, c = pb + j + 1, d = base + j + 1; if (triOK(phys.p, a, c, b)) phys.i.push(a, c, b); if (triOK(phys.p, b, c, d)) phys.i.push(b, c, d); } }
      prevRow = row;
    }
    if (B) addLaneMesh(B, lane.mat, chunk);
  }
  for (const { batch, material } of renderBatches.values()) {
    const mesh = batch.mesh(material, [false, true]);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }
  function pushRow(B, row) {
    const base = B.n; for (const r of row) { B.p.push(r[0], r[1], r[2]); B.u.push(r[3][0], r[3][1]); } B.n += row.length;
    if (base > 0) { const pb = base - row.length; for (let j = 0; j < row.length - 1; j++) { const a = pb + j, b = base + j, c = pb + j + 1, d = base + j + 1; B.i.push(a, c, b, b, c, d); } }
  }
  function addLaneMesh(B, mat, chunk) {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(B.p, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(B.u, 2));
    g.setIndex(B.i); g.computeVertexNormals();
    const key = chunk + '|' + mat;
    if (!renderBatches.has(key)) renderBatches.set(key, { batch: new Batch(), material: MM[mat] });
    renderBatches.get(key).batch.add(g, null);
  }
  // end caps so the raised pavements don't show open edges
  for (const s of [ss[0], ss[n - 1]]) {
    const R = roadAt(s), B = sb('caps', 'kerb'), dl = [-R.w - 16, -R.w - PAVE, -R.w, R.w, R.w + PAVE, R.w + 16];
    for (let j = 0; j < dl.length - 1; j++) {
      const a = dl[j], b = dl[j + 1], ya = prof(s, a + 0.01 * Math.sign(b - a)), yb = prof(s, b - 0.01 * Math.sign(b - a));
      const p = d => [R.x + R.rx * d, R.z + R.rz * d];
      const [ax, az] = p(a), [bx2, bz] = p(b), lo = R.y - 1;
      if (s === ss[0]) B.quad([ax, lo, az], [bx2, lo, bz], [bx2, yb, bz], [ax, ya, az], 0xbdb9ae); else B.quad([bx2, lo, bz], [ax, lo, az], [ax, ya, az], [bx2, yb, bz], 0xbdb9ae);
    }
  }
  for (let s = -2; s < S_END; s += 6) { const R2 = roadAt(s + 3, {}); for (const side of [-1, 1]) { const d = side * (R2.w + 15.6), y = prof(s + 3, d); staticBox(R2.x + R2.rx * d, y + 2, R2.z + R2.rz * d, 0.3, 4, 3.2, -R2.th, { kind: 'wall', name: 'FENCE' }); } }
  const R = C.RAPIER;
  const desc = R.ColliderDesc.trimesh(new Float32Array(phys.p), new Uint32Array(phys.i));
  finishCol(desc, { kind: 'ground' }, { friction: 0.8, rest: 0.05 });
}

// ============ road markings ============
function markStrip(s0, s1, d0, width0, color, { end = d0, width = width0, step = 1, lift = 0.019 } = {}) {
  const steps = Math.ceil((s1 - s0) / step - 1e-8);
  const point = (s, d) => { const p = P(s, d, lift); return [p.x, p.y, p.z]; };
  for (let k = 0; k < steps; k++) {
    const a = k / steps, b = (k + 1) / steps;
    const sa = lerp(s0, s1, a), sz = lerp(s0, s1, b);
    const da = lerp(d0, end, a), dz = lerp(d0, end, b);
    const wa = lerp(width0, width, a) / 2, wz = lerp(width0, width, b) / 2;
    sb(chunkOf(sa), 'mark').quad(point(sa, da - wa), point(sa, da + wa), point(sz, dz + wz), point(sz, dz - wz), color);
  }
}
function buildMarkings(scene) {
  const WHITE = 0xf2f2ee, YEL = 0xe7b727;
  const zigLength = 1.979, zigGap = 0.15, giveWay = 2.8;
  const terminal = giveWay + 0.1 + 8 * zigLength + 9 * zigGap + 0.1;
  const crossingFrom = ZEBRA_S - terminal - 0.25, crossingTo = ZEBRA_S + terminal + 0.25, entry = 15.5;
  // Centre-line module is 2 m of paint, 4 m clear. Reverse that near hazards.
  const centre = (from, to, warning = false) => {
    for (let s = from; s < to; s += 6) {
      const end = Math.min(to, s + (warning ? 4 : 2));
      const overHump = W.bumps.some(b => s < b + HUMP_HALF_LENGTH && end > b - HUMP_HALF_LENGTH);
      markStrip(s, end, 0, 0.1, WHITE, { step: overHump ? 0.15 : 1 });
    }
  };
  for (const [from, to] of [[6, crossingFrom], [crossingTo, RA_S - entry], [RA_S + entry, 772]]) {
    const hazards = W.bumps.filter(s => s > from && s < to).map(s => [s - 14, s + 14]);
    if (from === crossingTo) hazards.push([RA_S - 46, to]);
    if (from > RA_S) hazards.unshift([from, RA_S + 46]);
    let s = from;
    for (const [a, b] of hazards) {
      centre(s, a);
      centre(a, b, true);
      s = b;
    }
    centre(s, to);
  }
  // Double yellows track the kerb and stop clear of the crossing controls.
  for (const [a, b] of [[2, 40], [148, crossingFrom - 1], [crossingTo + 1, 206], [380, 402], [438, 460], [736, 772]]) {
    for (const side of [-1, 1]) for (const off of [0.15, 0.35]) {
      for (let s = a; s < b; s++) {
        const end = Math.min(b, s + 1);
        markStrip(s, end, side * (roadW(s) - off), 0.1, YEL, { end: side * (roadW(end) - off) });
      }
    }
  }
  // Two Diagram 1062 triangles on the approaching half of each lane.
  for (const s of W.bumps) {
    for (const d of [-2.53, -1.02]) markStrip(s - HUMP_HALF_LENGTH, s, d, 0.75, WHITE, { width: 0.005, step: 0.15 });
    for (const d of [1.02, 2.53]) markStrip(s, s + HUMP_HALF_LENGTH, d, 0.005, WHITE, { width: 0.75, step: 0.15 });
  }
  // Zebra stripes, dotted give-way lines and eight zigzags in each row.
  const half = roadW(ZEBRA_S);
  for (let d = -3; d <= 3; d += 1.2) markStrip(ZEBRA_S - 1.6, ZEBRA_S + 1.6, d, 0.6, WHITE);
  for (const side of [-1, 1]) {
    const line = ZEBRA_S + side * giveWay, edge = ZEBRA_S + side * terminal;
    for (let d = -3; d <= 3; d++) markStrip(line - 0.1, line + 0.1, d, 0.5, WHITE);
    for (const d of [-half + 0.36, 0, half - 0.36]) {
      markStrip(edge - 0.1, edge + 0.1, d, 0.6, WHITE);
      for (let i = 0; i < 8; i++) {
        const from = giveWay + 0.1 + zigGap + i * (zigLength + zigGap);
        const a = ZEBRA_S + side * from, b = a + side * zigLength;
        const offset = (d > 0 ? 1 : -1) * (i % 2 ? -0.25 : 0.25) * side;
        markStrip(Math.min(a, b), Math.max(a, b), d + offset, 0.1, WHITE, { end: d - offset });
      }
    }
  }
  const blister = ctex(32, 32, g => {
    g.fillStyle = '#a75648'; g.fillRect(0, 0, 32, 32);
    for (const x of [4, 12, 20, 28]) for (const y of [4, 12, 20, 28]) {
      g.fillStyle = '#864238'; g.fillRect(x - 2, y - 1, 5, 4);
      g.fillStyle = '#b66555'; g.fillRect(x - 2, y - 2, 4, 4);
    }
  });
  blister.repeat.set(3, 10);
  const tactile = new T.MeshLambertMaterial({ map: blister, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const side of [-1, 1]) roadDecal(scene, tactile, ZEBRA_S, side * (half + 0.64), 0.96, 3.2);
  // Single broken give-way line at each roundabout entry, on the left of travel.
  for (const side of [-1, 1]) {
    const s = RA_S + side * entry, w = roadW(s);
    for (let d = 0.2; d + 0.6 < w - 0.17; d += 1.2) markStrip(s - 0.1, s + 0.1, side * (d + 0.3), 0.6, WHITE);
  }
  // Speed camera calibration marks give the player a visible cue on the approach.
  for (let s = 558; s <= 568; s++) markStrip(s - 0.04, s + 0.04, -1.8, 1.4, WHITE);
  // SLOW painted on the road (one textured decal each)
  const slowTex = ctex(256, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#f2f2ee'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 110px "Barlow Condensed",Arial Narrow,Arial'; g.fillText('SLOW', w / 2, h / 2 + 6); }, { clamp: true });
  const slowMat = new T.MeshLambertMaterial({ map: slowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  for (const [s, d] of [[152, -1.8], [384, -1.8], [600, -1.8]]) {
    roadDecal(scene, slowMat, s, d, 2.6, 3.6);
  }
}

// Follow the road's grade and crown so transparent markings stay above its mesh.
function roadDecal(scene, material, s, d, width, length) {
  const geo = new T.PlaneGeometry(width, length, 4, Math.ceil(length / 0.35));
  const vertices = geo.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const point = P(s + vertices.getY(i), d + vertices.getX(i), 0.027);
    vertices.setXYZ(i, point.x, point.y, point.z);
  }
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, material);
  mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  scene.add(mesh);
}

// ============ potholes (virtual dips with a decal) ============
function buildPotholes(scene) {
  const list = [[96, 1.2], [161, -2.0], [248, 0.6], [279, -1.4], [506, 2.2], [546, -0.8], [612, 1.5], [681, -2.4], [706, 0.3], [62, -1.2], [455, 4.5]];
  const tex = ctex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); const r = rng(5); g.fillStyle = '#26272a'; g.beginPath(); for (let a = 0; a < 6.3; a += 0.4) { const rr = 22 + r() * 9; g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); } g.fill(); g.fillStyle = '#3a3b3f'; g.beginPath(); g.arc(30, 30, 12, 0, 7); g.fill(); g.fillStyle = 'rgba(90,110,120,.6)'; g.beginPath(); g.ellipse(34, 36, 9, 5, 0.4, 0, 7); g.fill(); }, { clamp: true });
  const mat = new T.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  for (const [s, d] of list) {
    const R = roadAt(s), x = R.x + R.rx * d, z = R.z + R.rz * d, rad = 0.45 + (s % 3) * 0.08;
    W.potholes.push({ x, z, r: rad, depth: 0.06 + (s % 2) * 0.03 });
    roadDecal(scene, mat, s, d, rad * 2.4, rad * 2.4);
  }
}

// ============ the bottom plaza (heightfield) ============
export const BOT = { lf0: 2, lf1: 136, lx0: -48, lx1: 48, res: 1 };
let BE = null;
export function botToWorld(lx, lf, out = {}) { if (!BE) BE = roadAt(780, {}); out.x = BE.x + lx; out.z = BE.z - lf; return out; }
export function worldToBot(x, z, out = {}) { if (!BE) BE = roadAt(780, {}); out.lx = x - BE.x; out.lf = BE.z - z; return out; }
export const POND = { lx: 0, lf: 38, rx: 13.5, rz: 9.5, water: -0.38 };
export function botH(lx, lf) {
  let h = 0;
  const pu = (lx - POND.lx) / POND.rx, pv = (lf - POND.lf) / POND.rz, pr = Math.sqrt(pu * pu + pv * pv);
  if (pr < 1.25) h -= 1.5 * (1 - sstep(0.55, 1.12, pr));
  // gentle banks at the edges
  const edge = Math.min(lx - BOT.lx0, BOT.lx1 - lx, BOT.lf1 - lf);
  h += 2.5 * (1 - sstep(0, 6, edge)) * sstep(17.5, 24, lf);
  return h;
}
function buildBottom(scene) {
  const MM = mats(), R = C.RAPIER;
  const nx = Math.round((BOT.lx1 - BOT.lx0) / BOT.res), nf = Math.round((BOT.lf1 - BOT.lf0) / BOT.res);
  // physics: Rapier heightfield, rows along local z, columns along local x, column-major
  const heights = new Float32Array((nx + 1) * (nf + 1));
  // world z decreases as lf increases, so row i (z from -0.5 to +0.5) maps to lf from lf1 down to lf0
  for (let j = 0; j <= nx; j++) for (let i = 0; i <= nf; i++) {
    const lx = BOT.lx0 + j * BOT.res, lf = BOT.lf1 - i * BOT.res; heights[i + j * (nf + 1)] = botH(lx, lf);
  }
  const c0 = botToWorld((BOT.lx0 + BOT.lx1) / 2, (BOT.lf0 + BOT.lf1) / 2);
  const hd = R.ColliderDesc.heightfield(nf, nx, heights, { x: BOT.lx1 - BOT.lx0, y: 1, z: BOT.lf1 - BOT.lf0 }).setTranslation(c0.x, 0, c0.z);
  finishCol(hd, { kind: 'ground' }, { friction: 0.8, rest: 0.05 });
  W.botHeights = { heights, nx, nf };
  // Grass and the pond bed share the base mesh. The pavement and car park sit just above it.
  const step = 2, gx = Math.round((BOT.lx1 - BOT.lx0) / step), gf = Math.round((BOT.lf1 - BOT.lf0) / step);
  const pos = [], uv = [], colr = [], idx = [];
  for (let i = 0; i <= gf; i++) for (let j = 0; j <= gx; j++) {
    const lx = BOT.lx0 + j * step, lf = BOT.lf0 + i * step, w = botToWorld(lx, lf), h = botH(lx, lf); pos.push(w.x, h, w.z); uv.push(lx / 5, lf / 5);
    const pu = (lx - POND.lx) / POND.rx, pv = (lf - POND.lf) / POND.rz, pr = Math.sqrt(pu * pu + pv * pv);
    let c = [1, 1, 1]; if (pr < 1.05) c = [0.55, 0.5, 0.36]; else if (pr < 1.2) c = [0.75, 0.68, 0.5];
    colr.push(...c);
  }
  for (let i = 0; i < gf; i++) for (let j = 0; j < gx; j++) { const a = i * (gx + 1) + j, b = a + 1, c = a + gx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(colr, 3)); g.setIndex(idx); g.computeVertexNormals();
  const ground = new T.Mesh(g, MM.grass); ground.receiveShadow = true; scene.add(ground);
  // flat overlays
  const flat = (mat, lx0, lx1, lf0, lf1, uvs, lift = 0.02) => {
    const B = sb('bot', mat); const a = botToWorld(lx0, lf0), b = botToWorld(lx1, lf0), c = botToWorld(lx1, lf1), d = botToWorld(lx0, lf1);
    B.quad([a.x, lift, a.z], [b.x, lift, b.z], [c.x, lift, c.z], [d.x, lift, d.z], 0xffffff, [lx0 / uvs, lf0 / uvs, lx1 / uvs, lf1 / uvs]);
  };
  flat('road', BOT.lx0, BOT.lx1, 5, 15, 4, 0.03);
  flat('pave', BOT.lx0, BOT.lx1, 2, 5, 1.8, 0.05); flat('pave', BOT.lx0, BOT.lx1, 15, 17.5, 1.8, 0.05);
  flat('tarmac', -36, 36, 54, 104, 4, 0.03); flat('pave', -36, 36, 104, 108, 1.8, 0.05);
  // markings
  const MB = sb('bot', 'mark'), WHITE = 0xf2f2ee, YEL = 0xf2c81f;
  const mq = (lx0, lx1, lf0, lf1, c, lift = 0.05) => { const a = botToWorld(lx0, lf0), b = botToWorld(lx1, lf0), cc = botToWorld(lx1, lf1), d = botToWorld(lx0, lf1); MB.quad([a.x, lift, a.z], [b.x, lift, b.z], [cc.x, lift, cc.z], [d.x, lift, d.z], c); };
  for (let x = BOT.lx0 + 8; x < BOT.lx1 - 8; x += 6) mq(x, x + 2.5, 9.95, 10.05, WHITE);
  mq(-30, -18, 5.6, 7.2, YEL); // bus stop box edge
  for (let f = 58; f < 100; f += 13) for (let x = -34; x <= 34; x += 2.6) { if (Math.abs(x) < 4) continue; mq(x - 0.05, x + 0.05, f, f + 5, WHITE); }
  // pond water
  const wg = new T.CircleGeometry(1, 40); wg.rotateX(-Math.PI / 2);
  const wtex = TX.water; wtex.repeat.set(4, 3);
  const water = new T.Mesh(wg, new T.MeshLambertMaterial({ map: wtex, transparent: true, opacity: 0.86, color: 0xbfe0dc }));
  const pc = botToWorld(POND.lx, POND.lf); water.position.set(pc.x, POND.water, pc.z); water.scale.set(POND.rx * 1.02, 1, POND.rz * 1.02); scene.add(water);
  W.water = water; W.pondCentre = { x: pc.x, z: pc.z };
}

// ============ top car park ============
export const TOP = { x0: -44, x1: 44, z0: 0, z1: 86, y: 60 };
function buildTop(scene) {
  const y = TOP.y;
  staticBox(0, y - 1, (TOP.z0 + TOP.z1) / 2, (TOP.x1 - TOP.x0) / 2, 1, (TOP.z1 - TOP.z0) / 2, 0, { kind: 'ground' }, 0, 0, { friction: 0.8, rest: 0.05 });
  const B = sb('top', 'tarmac'); B.quad([TOP.x0, y, TOP.z1], [TOP.x1, y, TOP.z1], [TOP.x1, y, TOP.z0], [TOP.x0, y, TOP.z0], 0xffffff, [TOP.x0 / 4, TOP.z1 / 4, TOP.x1 / 4, TOP.z0 / 4]);
  const MB = sb('top', 'mark');
  const mq = (x0, x1, z0, z1, c) => MB.quad([x0, y + 0.01, z1], [x1, y + 0.01, z1], [x1, y + 0.01, z0], [x0, y + 0.01, z0], c);
  for (const zr of [14, 30]) for (let x = -40; x <= 40; x += 2.7) { if (Math.abs(x) < 6) continue; mq(x - 0.05, x + 0.05, zr, zr + 5, 0xf2f2ee); }
  mq(-6, 6, 2.0, 2.25, 0xf2c81f); // the trolley boundary line
  for (let x = -5.6; x < 5.6; x += 0.7) mq(x, x + 0.35, 2.3, 3.3, 0xf2c81f);
  // skirts down the sides of the car park so it reads as a terrace on the hilltop
  const K = sb('top', 'brickB');
  const edge = (ax, az, bx2, bz) => K.quad([ax, y - 8, az], [bx2, y - 8, bz], [bx2, y, bz], [ax, y, az], 0xffffff, [0, 0, Math.hypot(bx2 - ax, bz - az) / 1.2, 8 / 1.2]);
  edge(TOP.x1, TOP.z0, TOP.x1, TOP.z1); edge(TOP.x0, TOP.z1, TOP.x0, TOP.z0); edge(TOP.x0, TOP.z0, -5.9, TOP.z0); edge(5.9, TOP.z0, TOP.x1, TOP.z0);
}

// ============ distant town and countryside (visual only) ============
function buildBackdrop(scene) {
  const n = vnoise(77), n2 = vnoise(91);
  const size = 2600, N = 90, pos = [], colr = [], idx = [];
  const fieldCols = [[0.47, 0.62, 0.3], [0.56, 0.66, 0.34], [0.72, 0.68, 0.4], [0.42, 0.55, 0.27], [0.62, 0.58, 0.36], [0.5, 0.6, 0.32]];
  const loc = { s: 0, d: 0, dist: 0 };
  const coarse = []; for (let s = -150; s <= 950; s += 8) { const R = roadAt(s, {}); coarse.push([s, R.x, R.z]); }
  const near = (x, z) => { let bs = 0, bd = 1e18; for (const c of coarse) { const dd = (x - c[1]) ** 2 + (z - c[2]) ** 2; if (dd < bd) { bd = dd; bs = c[0]; } } loc.s = bs; loc.dist = Math.sqrt(bd); return loc; };
  const heightAt = (x, z) => {
    near(x, z); const s = clamp(loc.s, -150, 950), base = ELEV(s) - 6;
    const far = sstep(150, 600, loc.dist + Math.max(0, -loc.s - 120) + Math.max(0, loc.s - 940));
    return base * (1 - far * 0.35) - 4 * sstep(60, 160, loc.dist) + far * (40 + 45 * n(x * 0.0022, z * 0.0022) + 12 * n2(x * 0.008, z * 0.008)) + 6 * n2(x * 0.004 + 3, z * 0.004);
  };
  const cx = 0, cz = -380;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = cx - size / 2 + size * j / N, z = cz - size / 2 + size * i / N, h = heightAt(x, z);
    pos.push(x, h, z);
    const fx = Math.floor(x / 140 + n(x * 0.01, z * 0.01) * 0.6), fz = Math.floor(z / 110 + n2(x * 0.01, z * 0.01) * 0.6);
    const c = fieldCols[Math.abs((fx * 7 + fz * 13) % fieldCols.length)]; const sh = 0.92 + 0.12 * n(x * 0.05, z * 0.05);
    colr.push(c[0] * sh, c[1] * sh, c[2] * sh);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(colr, 3)); g.setIndex(idx); g.computeVertexNormals();
  const g2 = g.toNonIndexed(); g2.computeVertexNormals();
  const m = new T.Mesh(g2, new T.MeshLambertMaterial({ vertexColors: true })); m.userData.background = true; scene.add(m);
  W.backdropH = heightAt;
  // A single row of low-detail rooflines behind each side of the playable street.
  const r = rng(31);
  const off = 35;
  for (const side of [-1, 1]) {
    for (let s = 30; s < 770; s += 16 + r() * 9) {
      if (Math.abs(s - RA_S) < 40) continue;
      const R = roadAt(s, {}), d = side * (off + R.w - 3.6 + r() * 4), x = R.x + R.rx * d, z = R.z + R.rz * d;
      { const b = worldToBot(x, z); if (b.lf > -14 && Math.abs(b.lx) < 150) continue; } // keep the town back from Station Road
      const h = Math.max(heightAt(x, z) + 6, ELEV(s) - 0.5 - (off - 30) * 0.05), len = 10 + r() * 14, yaw = -R.th;
      const section = 'bg' + Math.floor(s / 150), BB = sb(section, 'lam'), BR = sb(section, 'roof');
      const F = frame(x, h, z, yaw);
      const c = [0x8f4a35, 0x9a5a3e, 0xc19a68, 0xe8e0d0, 0x7a4030][Math.floor(r() * 5)];
      bx(BB, F, 7.5, 6, len, 0, 3, 0, c);
      BR.add(GEO.prism, FM(F, 0, 6, 0, 0, 0, 0, 8, 2.2, len + 0.3), 0xffffff, [4, 2]);
      bx(BB, F, 0.6, 1.2, 0.7, 0, 7.6, -len / 4, c);
    }
  }
  // church with a spire, a gasholder and some wind turbines on the far hills
  const BB = sb('bg-landmarks', 'lam'), BR = sb('bg-landmarks', 'roof'), E = roadAt(760, {});
  const ch = frame(E.x - 190, heightAt(E.x - 190, E.z - 120), E.z - 120, 0.4);
  bx(BB, ch, 9, 9, 22, 0, 4.5, 0, 0x9a9488); BR.add(GEO.prism, FM(ch, 0, 9, 0, 0, 0, 0, 10, 4, 22.4), 0xffffff, [4, 2]);
  bx(BB, ch, 6, 18, 6, 0, 9, 12, 0x9a9488); BB.add(GEO.cone8, FM(ch, 0, 26, 12, 0, Math.PI / 8, 0, 4.2, 16, 4.2), 0x6a6e76);
  const gh = { x: E.x + 210, z: E.z - 40 }; const ghy = heightAt(gh.x, gh.z);
  BB.add(GEO.cyl16, FM(null, gh.x, ghy + 11, gh.z, 0, 0, 0, 22, 22, 22), 0x7a8a7e);
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; BB.add(GEO.box, FM(null, gh.x + Math.cos(a) * 23, ghy + 13, gh.z + Math.sin(a) * 23, 0, -a, 0, 0.6, 26, 0.6), 0x4a5a50); }
  W.turbines = [];
  for (let k = 0; k < 5; k++) {
    const x = -500 + k * 70 + r() * 30, z = -1150 - r() * 80, y0 = heightAt(x, z);
    bx(BB, null, 1.6, 60, 1.6, x, y0 + 30, z, 0xe8eaee);
    const hub = new T.Group(); hub.position.set(x, y0 + 60, z + 1.2); scene.add(hub);
    const bb = new Batch(); for (let b = 0; b < 3; b++) bb.add(GEO.box, M(0, 0, 0, 0, 0, b * TAU / 3, 1.2, 0.5, 0.3), 0xf2f2f2).add(GEO.box, FM(new T.Matrix4().makeRotationZ(b * TAU / 3), 0, 12, 0, 0, 0, 0, 1.4, 24, 0.3), 0xf2f2f2);
    hub.add(new T.Mesh(bb.geometry(), mats().lam)); hub.rotation.z = r() * 3; W.turbines.push(hub);
  }
}

// ============ sky ============
function buildSky(scene) {
  const sky = new T.Mesh(new T.SphereGeometry(3000, 24, 12), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new T.Color(0x6f9fd6) }, hor: { value: new T.Color(0xdfe6ea) } },
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top,hor;varying vec3 vP;void main(){float h=clamp(vP.y,0.0,1.0);gl_FragColor=vec4(mix(hor,top,pow(h,0.55)),1.0);}',
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky); W.sky = sky;
  const r = rng(4), B = new Batch();
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, d = 700 + r() * 1300, x = Math.cos(a) * d, z = -380 + Math.sin(a) * d, y = 260 + r() * 220;
    for (let k = 0; k < 4; k++) B.add(GEO.ico1, M(x + (k - 1.5) * 38 + r() * 20, y + r() * 12, z + r() * 30, 0, r() * 3, 0, 46 + r() * 30, 18 + r() * 10, 34 + r() * 20), 0xffffff);
  }
  const clouds = new T.Mesh(B.geometry(), new T.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 }));
  clouds.renderOrder = -9; scene.add(clouds); W.clouds = clouds;
}

// ============ queries used by gameplay ============
const bottomPosition = {};
export function groundY(x, z) {
  if (z > TOP.z0 && x > TOP.x0 && x < TOP.x1 && z < TOP.z1) return TOP.y;
  const b = worldToBot(x, z, bottomPosition);
  if (b.lf >= BOT.lf0 && b.lf < BOT.lf1 && b.lx > BOT.lx0 && b.lx < BOT.lx1) return botH(b.lx, b.lf) + (W.bermH ? W.bermH(b.lx, b.lf) : 0);
  const L = locate(x, z, {}); return prof(L.s, L.d);
}

export function buildWorldBase(scene) {
  mats();
  buildSky(scene);
  buildCorridor(scene);
  buildMarkings(scene);
  buildPotholes(scene);
  buildTop(scene);
  buildBottom(scene);
  buildBackdrop(scene);
  W.start = { x: 0, y: TOP.y, z: 24, yaw: 0 };
  Object.assign(W, { locate, groundY, P, roadAt, prof, botToWorld, worldToBot, botH });
  C.world = W;
  return W;
}
