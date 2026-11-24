import { C } from './core.js';
import { TAU, clamp, sstep, rng, pick, Batch, GEO, M, FM, frame, bx, cy, seg, Baker } from './util.js';
const DECOR = new Baker();
import { TX, signTex, plainSign, limitSign, warnSign, giveWay, chevron, fascia, textFit } from './textures.js';
import { W, RA_S, S_END, roadAt, prof, P, hasHouse, sb, chunkOf, staticBox, staticCyl, staticHull, staticMeshCol, mats, yawTo, TOP, POND, botToWorld, botH, BOT } from './world.js';
import { makeTrolley, makeCar } from './models.js';
const T = C.T;
const _v = new T.Vector3();
const tp = (F, x, y, z) => { _v.set(x, y, z); if (F) _v.applyMatrix4(F); return [_v.x, _v.y, _v.z]; };
const wp = (F, x, y, z) => { const v = new T.Vector3(x, y, z); if (F) v.applyMatrix4(F); return v; };
// textured box with world-scaled UVs (tile metres per texture repeat)
export function tbox(B, F, w, h, d, cx, cy, cz, color = 0xffffff, tile = 1.2, noBottom = true) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2, t = tile;
  B.quad(tp(F, x0, y0, z1), tp(F, x1, y0, z1), tp(F, x1, y1, z1), tp(F, x0, y1, z1), color, [x0 / t, y0 / t, x1 / t, y1 / t]);
  B.quad(tp(F, x1, y0, z0), tp(F, x0, y0, z0), tp(F, x0, y1, z0), tp(F, x1, y1, z0), color, [x1 / t, y0 / t, x0 / t, y1 / t]);
  B.quad(tp(F, x0, y0, z0), tp(F, x0, y0, z1), tp(F, x0, y1, z1), tp(F, x0, y1, z0), color, [z0 / t, y0 / t, z1 / t, y1 / t]);
  B.quad(tp(F, x1, y0, z1), tp(F, x1, y0, z0), tp(F, x1, y1, z0), tp(F, x1, y1, z1), color, [z1 / t, y0 / t, z0 / t, y1 / t]);
  B.quad(tp(F, x0, y1, z1), tp(F, x1, y1, z1), tp(F, x1, y1, z0), tp(F, x0, y1, z0), color, [x0 / t, z1 / t, x1 / t, z0 / t]);
}
// box collider in a frame
function colBox(F, yaw, w, h, d, cx, cy, cz, info, opts) { const c = wp(F, cx, cy, cz); return staticBox(c.x, c.y, c.z, w / 2, h / 2, d / 2, yaw, info, 0, 0, opts); }
const MATSIGN = new Map();
function signMat(tex) { if (!MATSIGN.has(tex)) MATSIGN.set(tex, new T.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1 })); return MATSIGN.get(tex); }
const backMat = () => (MATSIGN.get('back') || (MATSIGN.set('back', new T.MeshLambertMaterial({ color: 0x8a8d92 })), MATSIGN.get('back')));
// a sign on a post: plate faces local -z (towards whoever approaches up the road), posts get a collider and can wobble
export function signPost(scene, x, y, z, yaw, tex, w, h, postH = 2.4, opts = {}) {
  const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = yaw; scene.add(g);
  const posts = opts.twin ? [-w * 0.35, w * 0.35] : [0];
  const pb = new Batch(); for (const px of posts) cy(pb, null, 0.04, postH, px, postH / 2, 0.03, opts.postCol || 0x8a8d92, 8);
  const pm = new T.Mesh(pb.geometry(), mats().lam); pm.castShadow = true; g.add(pm);
  const plate = new T.Mesh(new T.PlaneGeometry(w, h), signMat(tex)); plate.position.set(0, postH + h / 2 - (opts.sink || 0), 0); plate.rotation.y = Math.PI; g.add(plate);
  if (!opts.noBack) { const back = new T.Mesh(new T.PlaneGeometry(w * 0.98, h * 0.98), backMat()); back.position.set(0, postH + h / 2 - (opts.sink || 0), 0.012); g.add(back); }
  plate.castShadow = true;
  const c = staticCyl(x, y + postH / 2, z, 0.06 * posts.length, postH / 2, { kind: 'sign', name: opts.name || 'SIGN' });
  W.wobblers.push({ obj: g, handle: c.handle, a: 0, v: 0, axis: 0 });
  C.colInfo.get(c.handle).wob = W.wobblers.length - 1;
  return g;
}
function lampPost(s, side, chunk) {
  const R = roadAt(s, {}), d = side * (R.w + 0.45), x = R.x + R.rx * d, z = R.z + R.rz * d, y = prof(s, d);
  const B = sb(chunk, 'lam'), yaw = yawTo(-side * R.rx, -side * R.rz), F = frame(x, y, z, yaw);
  cy(B, F, 0.09, 6.2, 0, 3.1, 0, 0x8c9096, 8); cy(B, F, 0.13, 0.5, 0, 0.25, 0, 0x6a6e74, 8);
  bx(B, F, 0.08, 0.08, 1.2, 0, 6.15, 0.55, 0x8c9096); bx(B, F, 0.32, 0.12, 0.55, 0, 6.12, 1.15, 0x6a6e74); bx(B, F, 0.26, 0.03, 0.45, 0, 6.05, 1.15, 0xfff6d8);
  staticCyl(x, y + 3, z, 0.1, 3, { kind: 'pole', name: 'LAMP POST' });
  W.nearTargets.push({ x, z, r: 0.25, kind: 'LAMP POST' });
}

// ---------------- houses ----------------
const DOORS = [0xb3202a, 0x1f3f8a, 0x1f5a36, 0x1c1c20, 0xf2c81f, 0x6a2a6a, 0x2a8a8a, 0xf4f2ea];
const RENDERS = [0xf2ead8, 0xdfe8ee, 0xf0dcdc, 0xe8eedc, 0xf6e8c8];
function house(F, yaw, r, chunk, kind) {
  const wd = 5.2, ht = 6.0, dp = 8, low = -1.2;
  const wallKind = kind || pick(r, ['brick', 'brick', 'brick', 'brickY', 'render']);
  const tint = wallKind === 'render' ? pick(r, RENDERS) : 0xffffff;
  const WB = sb(chunk, wallKind), L = sb(chunk, 'lam'), G = sb(chunk, 'glass'), RF = sb(chunk, r() < 0.8 ? 'roof' : 'tile');
  tbox(WB, F, wd, ht - low, dp, 0, (ht + low) / 2, -dp / 2, tint, 1.2);
  RF.add(GEO.prism, FM(F, 0, ht, -dp / 2, 0, Math.PI / 2, 0, dp + 0.7, 2.4, wd + 0.03), 0xffffff, [3, 2]);
  bx(L, F, wd + 0.03, 0.12, 0.14, 0, ht - 0.02, 0.38, 0x2a2a2e); // gutter
  tbox(WB, F, 0.9, 1.6, 0.7, wd / 2, ht + 1.9, -dp / 2, tint, 1.2);
  for (let k = 0; k < 3; k++) cy(L, F, 0.08, 0.36, wd / 2 - 0.25 + k * 0.25, ht + 2.86, -dp / 2, 0xb5603a, 8);
  // bay window
  tbox(WB, F, 2.2, 3.0, 0.75, -1.15, 1.5 + low / 2 - 0.2, 0.375, tint, 1.2);
  bx(L, F, 2.24, 0.12, 0.79, -1.15, 0.85, 0.38, 0xf2f2ee);
  G.quad(tp(F, -2.1, 0.95, 0.755), tp(F, -0.2, 0.95, 0.755), tp(F, -0.2, 2.45, 0.755), tp(F, -2.1, 2.45, 0.755), 0xffffff, [0, 0, 2, 1]);
  bx(L, F, 0.08, 1.5, 0.05, -1.15, 1.7, 0.77, 0xf2f2ee); bx(L, F, 2.0, 0.07, 0.05, -1.15, 2.0, 0.77, 0xf2f2ee);
  RF.add(GEO.wedge, FM(F, -1.15, 2.9, 0.45, 0, Math.PI, 0, 2.3, 0.45, 0.9), 0xffffff);
  // front door with fanlight
  const dc = pick(r, DOORS); bx(L, F, 0.98, 2.15, 0.08, 1.45, 1.08, 0.02, dc); bx(L, F, 1.16, 2.5, 0.06, 1.45, 1.25, 0.0, 0xf2f2ee);
  G.quad(tp(F, 1.02, 2.2, 0.065), tp(F, 1.88, 2.2, 0.065), tp(F, 1.88, 2.45, 0.065), tp(F, 1.02, 2.45, 0.065), 0xffffff);
  bx(L, F, 0.05, 0.05, 0.05, 1.75, 1.05, 0.09, 0xd8b84a); bx(L, F, 1.3, 0.16, 0.45, 1.45, 0.0, 0.22, 0xbdb9ae);
  // upstairs windows
  for (const x of [-1.15, 1.45]) {
    bx(L, F, 1.2, 1.4, 0.1, x, 4.2, 0.02, 0xf2f2ee); G.quad(tp(F, x - 0.5, 3.6, 0.075), tp(F, x + 0.5, 3.6, 0.075), tp(F, x + 0.5, 4.8, 0.075), tp(F, x - 0.5, 4.8, 0.075), 0xffffff);
    bx(L, F, 0.06, 1.2, 0.04, x, 4.2, 0.09, 0xf2f2ee); bx(L, F, 1.3, 0.1, 0.18, x, 3.47, 0.08, 0xd8d4c8);
  }
  if (r() < 0.3) { cy(L, F, 0.3, 0.05, 2.0, 5.2, 0.15, 0x9a9da2, 12, Math.PI / 2 - 0.3, 0.4, 0); }
  if (r() < 0.35) bx(L, F, 0.35, 0.45, 0.12, -2.2, 5.3, 0.06, pick(r, [0x1f5abf, 0xf2c81f, 0xd2202a]));
  if (r() < 0.25) { cy(L, F, 0.25, 0.2, 0.6, 2.4, 0.4, 0x3a3a3e, 8); for (let k = 0; k < 4; k++) L.add(GEO.ico, FM(F, 0.6 + Math.cos(k) * 0.15, 2.32, 0.4 + Math.sin(k) * 0.15, 0, 0, 0, 0.12, 0.12, 0.12), pick(r, [0xd2486a, 0xf2c94a, 0x8a5ad2, 0x4c8a3a])); }
  // collider for the body and bay
  colBox(F, yaw, wd, ht - low, dp, 0, (ht + low) / 2, -dp / 2, { kind: 'house', name: 'HOUSE' });
  colBox(F, yaw, 2.2, 2.9, 0.75, -1.15, 1.2, 0.375, { kind: 'house', name: 'BAY WINDOW' });
}
function frontGarden(F, yaw, r, chunk, s, side) {
  const wd = 5.2, gz = 4.0, L = sb(chunk, 'lam');
  const style = pick(r, ['wall', 'wall', 'wall', 'hedge', 'picket', 'rail']);
  // path to the front door
  const PV = sb(chunk, 'pave'); PV.quad(tp(F, 0.95, 0.02, gz), tp(F, 1.95, 0.02, gz), tp(F, 1.95, 0.02, 0.45), tp(F, 0.95, 0.02, 0.45), 0xffffff, [0, 0, 0.6, 2]);
  const seg2 = (x0, x1) => {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    if (style === 'wall') { tbox(sb(chunk, 'brick'), F, w, 0.72, 0.24, cx, 0.2, gz - 0.12, 0xffffff, 1.2); bx(L, F, w + 0.02, 0.07, 0.3, cx, 0.6, gz - 0.12, 0xc8c4b8); colBox(F, yaw, w, 0.8, 0.24, cx, 0.24, gz - 0.12, { kind: 'wall', name: 'GARDEN WALL' }); }
    else if (style === 'hedge') { tbox(sb(chunk, 'hedge'), F, w, 1.15, 0.7, cx, 0.42, gz - 0.38, 0xffffff, 1.0); colBox(F, yaw, w, 1.2, 0.7, cx, 0.45, gz - 0.38, { kind: 'hedge', name: 'HEDGE' }); }
    else if (style === 'rail') { bx(L, F, w, 0.35, 0.22, cx, 0.05, gz - 0.12, 0xbdb9ae); for (let x = x0 + 0.06; x < x1; x += 0.13) cy(L, F, 0.012, 0.7, x, 0.55, gz - 0.12, 0x1c1c1e, 6); bx(L, F, w, 0.04, 0.04, cx, 0.85, gz - 0.12, 0x1c1c1e); colBox(F, yaw, w, 1.0, 0.22, cx, 0.35, gz - 0.12, { kind: 'wall', name: 'RAILINGS' }); }
    else { const c = wp(F, cx, 0.42, gz - 0.12); W.dyn.push({ type: 'picket', x: c.x, y: c.y, z: c.z, yaw, w }); }
  };
  seg2(-wd / 2, 0.9); seg2(2.0, wd / 2);
  if (r() < 0.45) { const c = wp(F, -1.6 + r() * 0.8, 0.55, gz - 0.9); W.dyn.push({ type: 'bin', x: c.x, y: c.y, z: c.z, yaw: yaw + (r() - 0.5) * 0.4, lid: pick(r, [0x2a2a2c, 0x2a6a3a, 0x2a4aa0, 0x6a4a2a]) }); }
  r(); // (was a garden gnome; kept the draw so the rest of the street stays the same)
  if (r() < 0.08) { const c = wp(F, 2.3, 0, gz - 0.6); signPost(C.scene, c.x, c.y, c.z, yaw + Math.PI, plainSign(['FOR SALE', 'GRIMLEY & SONS'], { bg: '#f2f2ee', fg: '#c81e1e', border: '#1d3d8f', w: 192, h: 128 }), 0.8, 0.55, 1.5, { name: 'ESTATE AGENT SIGN' }); }
}
function terraces(scene) {
  const r = rng(42);
  for (const side of [-1, 1]) for (const [a, b] of W.houses[side < 0 ? 'L' : 'R']) {
    for (let s = a + 2.6; s < b - 2.5; s += 5.2) {
      if (side < 0 && s > 473 && s < 482) { shopFront(scene, s, side); continue; }
      if (side > 0 && s > 492 && s < 503) { pubFront(scene, s, side); continue; }
      const R = roadAt(s, {}), d = side * (R.w + 6.2), x = R.x + R.rx * d, z = R.z + R.rz * d, y = prof(s, d) - 0.01;
      const yaw = yawTo(-side * R.rx, -side * R.rz), F = frame(x, y, z, yaw), chunk = chunkOf(s);
      house(F, yaw, r, chunk); frontGarden(F, yaw, r, chunk, s, side);
    }
  }
}
function shopFront(scene, s, side) {
  const R = roadAt(s, {}), d = side * (R.w + 6.2), x = R.x + R.rx * d, z = R.z + R.rz * d, y = prof(s, d) - 0.01, yaw = yawTo(-side * R.rx, -side * R.rz), F = frame(x, y, z, yaw), chunk = chunkOf(s), r = rng(5);
  house(F, yaw, r, chunk, 'brickY');
  const G = sb(chunk, 'glass'), L = sb(chunk, 'lam');
  bx(L, F, 5.2, 0.9, 0.3, 0, 3.0, 0.2, 0x1d3d8f);
  G.quad(tp(F, -2.4, 0.4, 0.8), tp(F, 0.6, 0.4, 0.8), tp(F, 0.6, 2.4, 0.8), tp(F, -2.4, 2.4, 0.8), 0xffffff, [0, 0, 3, 1]);
  const fm = new T.Mesh(new T.PlaneGeometry(5.0, 0.8), new T.MeshLambertMaterial({ map: fascia('COST-A-LOT', { bg: '#1d3d8f', fg: '#ffd21f', sub: 'NEWSAGENT · OFF LICENCE · LOTTERY' }) }));
  const fp = wp(F, 0, 3.0, 0.36); fm.position.copy(fp); fm.rotation.y = yaw; scene.add(fm);
  // newspaper A-board on the pavement with a headline
  const bp = wp(F, -1.5, -0.12, 4.6);
  const hl = signTex(128, 160, (g, w, h) => { g.fillStyle = '#f6f2e7'; g.fillRect(0, 0, w, h); g.fillStyle = '#c81e1e'; g.fillRect(0, 0, w, 30); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '700 22px "Barlow Condensed",Arial'; g.fillText('GRUMBLETON GAZETTE', 64, 22); g.fillStyle = '#111'; g.font = '700 30px "Barlow Condensed",Arial'; ['LOCAL', 'MAN SEES', 'TROLLEY'].forEach((t, i) => g.fillText(t, 64, 66 + i * 32)); });
  const ab = new T.Group(); ab.position.copy(bp); ab.rotation.y = yaw; scene.add(ab);
  const pl = new T.Mesh(new T.PlaneGeometry(0.6, 0.75), new T.MeshLambertMaterial({ map: hl })); pl.position.set(0, 0.5, 0.12); pl.rotation.x = -0.18; ab.add(pl);
  const fr = new T.Mesh(new T.BoxGeometry(0.66, 0.85, 0.25), new T.MeshLambertMaterial({ color: 0x1c1c20 })); fr.position.set(0, 0.45, 0); fr.scale.set(1, 1, 0.3); ab.add(fr);
  staticBox(bp.x, bp.y + 0.45, bp.z, 0.33, 0.45, 0.1, yaw, { kind: 'sign', name: 'NEWSPAPER BOARD' });
}
function pubFront(scene, s, side) {
  const R = roadAt(s, {}), d = side * (R.w + 6.2), x = R.x + R.rx * d, z = R.z + R.rz * d, y = prof(s, d) - 0.01, yaw = yawTo(-side * R.rx, -side * R.rz), F = frame(x, y, z, yaw), chunk = chunkOf(s), r = rng(9);
  house(F, yaw, r, chunk, 'render');
  const L = sb(chunk, 'lam'); bx(L, F, 5.2, 0.7, 0.2, 0, 3.0, 0.12, 0x1f3a2a);
  const fm = new T.Mesh(new T.PlaneGeometry(5.0, 0.62), new T.MeshLambertMaterial({ map: fascia('THE RUSTY TROLLEY', { bg: '#1f3a2a', fg: '#e8d8a8', size: 52 }) }));
  fm.position.copy(wp(F, 0, 3.0, 0.23)); fm.rotation.y = yaw; scene.add(fm);
  const hp = wp(F, 2.3, 3.4, 1.0);
  const tex = signTex(128, 160, (g, w, h) => { g.fillStyle = '#1f3a2a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8b84a'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#c8783a'; g.fillRect(30, 60, 70, 40); g.strokeStyle = '#c8783a'; g.lineWidth = 4; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(30 + i * 14, 60); g.lineTo(30 + i * 14, 100); g.stroke(); } g.beginPath(); g.moveTo(100, 60); g.lineTo(112, 44); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.arc(42, 112, 7, 0, 7); g.arc(90, 112, 7, 0, 7); g.fill(); g.fillStyle = '#e8d8a8'; g.textAlign = 'center'; g.font = '700 20px "Barlow Condensed",Arial'; g.fillText('THE RUSTY', 64, 32); g.fillText('TROLLEY', 64, 142); });
  const hs = new T.Mesh(new T.PlaneGeometry(0.8, 1.0), new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide })); hs.position.copy(hp); hs.rotation.y = yaw + Math.PI / 2; scene.add(hs);
  bx(L, F, 0.06, 0.06, 1.1, 2.3, 4.0, 0.55, 0x1c1c1e);
  for (const px of [-1.4, 0.6]) { const p = wp(F, px, 0.0, 2.4); const T2 = frame(p.x, p.y, p.z, yaw); bx(L, T2, 1.6, 0.06, 0.7, 0, 0.74, 0, 0x9b7148); bx(L, T2, 1.6, 0.05, 0.28, 0, 0.45, 0.55, 0x9b7148); bx(L, T2, 1.6, 0.05, 0.28, 0, 0.45, -0.55, 0x9b7148); for (const sx of [-0.7, 0.7]) bx(L, T2, 0.06, 0.74, 1.3, sx, 0.37, 0, 0x7a5a3a); staticBox(p.x, p.y + 0.4, p.z, 0.8, 0.4, 0.7, yaw, { kind: 'wall', name: 'PICNIC BENCH' }); }
}

// ---------------- street furniture ----------------
function street(scene) {
  for (let s = 18, k = 0; s < 770; s += 34, k++) { if (Math.abs(s - RA_S) < 22) continue; lampPost(s, k % 2 ? 1 : -1, chunkOf(s)); }
  // bin day: wheelie bins at the kerb
  const r = rng(7);
  for (let s = 30; s < 740; s += 9 + r() * 14) {
    if (Math.abs(s - RA_S) < 50 || (s > 168 && s < 194) || (s > 216 && s < 296) || (s > 326 && s < 342)) continue;
    const side = r() < 0.5 ? -1 : 1; if (!hasHouse(s, side)) continue;
    const n = 1 + Math.floor(r() * 2.4);
    for (let i = 0; i < n; i++) { const R = roadAt(s + i * 0.75, {}), d = side * (R.w + 0.6), x = R.x + R.rx * d, z = R.z + R.rz * d; W.dyn.push({ type: 'bin', x, y: prof(s + i * 0.75, d) + 0.55, z, yaw: yawTo(-side * R.rx, -side * R.rz) + (r() - 0.5) * 0.3, lid: pick(r, [0x2a2a2c, 0x2a2a2c, 0x2a6a3a, 0x2a4aa0, 0x6a4a2a]) }); }
  }
  // zebra crossing: belisha beacons, bollards
  W.blink = [];
  for (const side of [-1, 1]) for (const ds of [-2.0, 2.0]) {
    const s = 180 + ds, R = roadAt(s, {}), d = side * (R.w + 0.35), x = R.x + R.rx * d, z = R.z + R.rz * d, y = prof(s, d), L = sb(chunkOf(s), 'lam');
    for (let i = 0; i < 6; i++) cy(L, null, 0.06, 0.4, x, y + 0.2 + i * 0.4, z, i % 2 ? 0xf2f2ee : 0x1c1c1e, 8);
    const globe = new T.Mesh(new T.SphereGeometry(0.17, 12, 8), new T.MeshBasicMaterial({ color: 0xffa21f })); globe.position.set(x, y + 2.55, z); scene.add(globe); W.blink.push(globe);
    staticCyl(x, y + 1.25, z, 0.07, 1.25, { kind: 'pole', name: 'BELISHA BEACON' });
    W.nearTargets.push({ x, z, r: 0.2, kind: 'BELISHA BEACON' });
  }
  const S = (s, side, tex, w, h, postH, opts = {}) => { const R = roadAt(s, {}), d = side * (R.w + (opts.off || 0.5)), x = R.x + R.rx * d, z = R.z + R.rz * d, y = prof(s, d); const yaw = yawTo(-R.fx, -R.fz) + (opts.turn || 0); return signPost(scene, x, y, z, yaw + Math.PI, tex, w, h, postH, opts); };
  const L30 = limitSign(30);
  S(10, -1, L30, 0.75, 0.75, 2.2, { name: '30 SIGN' }); S(10, 1, L30, 0.75, 0.75, 2.2, { name: '30 SIGN' }); S(498, -1, L30, 0.75, 0.75, 2.2, { name: '30 SIGN' });
  S(52, -1, warnSign('humps'), 0.8, 0.72, 2.0, { name: 'HUMPS SIGN' }); S(146, 1, warnSign('children'), 0.8, 0.72, 2.0, { name: 'SCHOOL SIGN' });
  S(202, -1, warnSign('works'), 0.85, 0.77, 1.6, { name: 'ROADWORKS SIGN' });
  S(366, -1, warnSign('roundabout'), 0.85, 0.77, 2.0, { name: 'ROUNDABOUT SIGN' }); S(398, -1, giveWay(), 0.75, 0.68, 1.6, { name: 'GIVE WAY SIGN' });
  S(388, -1, plainSign(['GRUMBLETON', ['Please drive carefully', 22], ['Twinned with nowhere in particular', 18]], { w: 256, h: 150, bg: '#ffffff', fg: '#111111', border: '#111111' }), 2.0, 1.15, 0.8, { name: 'TOWN SIGN', twin: true, off: 3 });
  S(538, 1, plainSign(['SPEED', 'CAMERAS'], { w: 128, h: 128, bg: '#ffffff', border: '#111' }), 0.7, 0.7, 2.0, { name: 'CAMERA SIGN' });
  S(700, -1, warnSign('ducks'), 0.85, 0.77, 1.9, { name: 'DUCKS SIGN' });
  S(120, 1, plainSign(['NEIGHBOURHOOD', 'WATCH', ['You are being watched', 20]], { w: 192, h: 160, bg: '#f2f2ee', fg: '#1d3d8f', border: '#1d3d8f' }), 0.6, 0.5, 2.2, { name: 'NEIGHBOURHOOD WATCH SIGN' });
  // speed camera
  { const s = 560, R = roadAt(s, {}), d = R.w + 0.6, x = R.x + R.rx * d, z = R.z + R.rz * d, y = prof(s, d), L = sb(chunkOf(s), 'lam'), F = frame(x, y, z, yawTo(-R.fx, -R.fz));
    cy(L, F, 0.08, 3.0, 0, 1.5, 0, 0x8c9096); bx(L, F, 0.55, 0.65, 0.75, 0, 3.2, 0, 0xf2c81f); bx(L, F, 0.4, 0.3, 0.05, 0, 3.3, -0.4, 0x1c1c1e);
    for (let i = 0; i < 4; i++) bx(L, F, 0.56, 0.06, 0.76, 0, 2.95 + i * 0.17, 0, i % 2 ? 0x1c1c1e : 0xf2c81f);
    staticCyl(x, y + 1.5, z, 0.1, 1.5, { kind: 'pole', name: 'SPEED CAMERA' }); W.speedCam = { s, x, y: y + 3.3, z };
  }
  // CCTV along the route
}
function groundAt(c) { return c.y > 50 ? TOP.y : (C.world && C.world.groundY ? C.world.groundY(c.x, c.z) : 0); }

// ---------------- parked cars ----------------
function parkedCars(scene) {
  const r = rng(23);
  const kinds = ['hatch', 'hatch', 'hatch', 'estate', 'van', 'hatch', 'estate'];
  let robin = false;
  for (let s = 26; s < 736; s += 11 + r() * 16) {
    if ((s > 166 && s < 196) || Math.abs(s - RA_S) < 54 || (s > 470 && s < 486)) continue;
    let bad = false; for (const b of W.bumps) if (Math.abs(s - b) < 7) bad = true; if (bad) continue;
    const side = r() < 0.5 ? -1 : 1; if (side > 0 && ((s > 236 && s < 296) || (s > 318 && s < 350))) continue; if (side < 0 && s > 586 && s < 652) continue;
    if (!hasHouse(s, side)) continue;
    let kind = pick(r, kinds); if (s > 410 && !robin) { kind = 'robin'; robin = true; }
    const car = makeCar(kind, kind === 'robin' ? 0xf2c81f : (kind === 'van' ? 0xf2f2ee : null), Math.floor(r() * 1e6));
    const R = roadAt(s, {}), d = side * (R.w - car.W / 2 - 0.18), x = R.x + R.rx * d, z = R.z + R.rz * d, y = prof(s, d);
    const yaw = -R.th + (r() < 0.5 ? 0 : Math.PI);
    car.group.position.set(x, y, z); car.group.rotation.y = yaw; scene.add(car.group);
    const idx = W.cars.length; W.cars.push({ car, x, y, z, yaw, alarm: 0, rock: 0 });
    staticBox(x, y + 0.6, z, car.W / 2, 0.45, car.L / 2 - 0.05, yaw, { kind: 'car', name: kind === 'van' ? 'WHITE VAN' : kind === 'robin' ? 'THREE-WHEELER' : 'PARKED CAR', car: idx });
    staticBox(x, y + 1.2, z, car.W / 2 - 0.1, 0.25 + (kind === 'van' ? 0.5 : 0), car.L / 2 - 0.9, yaw, { kind: 'car', name: 'PARKED CAR', car: idx });
    W.nearTargets.push({ x, z, r: Math.max(car.W, car.L) * 0.5, kind: kind === 'van' ? 'WHITE VAN' : 'PARKED CAR', box: { hx: car.W / 2, hz: car.L / 2, yaw } });
    s += car.L * 0.5;
  }
}

// ---------------- roadworks ----------------
function roadworks(scene) {
  // barriered-off right lane with a hole and a sand pile, well up the hill from the plank
  // cones along the works
  for (let s = 243; s <= 271; s += 2.6) { const R = roadAt(s, {}), d = 0.45, x = R.x + R.rx * d, z = R.z + R.rz * d; W.dyn.push({ type: 'cone', x, y: prof(s, d) + 0.36, z, yaw: 0 }); }
  for (const [s, d, turn] of [[244, 2.2, 0], [266, 2.2, 0], [255, 0.85, Math.PI / 2], [255, 3.3, Math.PI / 2]]) { const R = roadAt(s, {}), x = R.x + R.rx * d, z = R.z + R.rz * d; W.dyn.push({ type: 'barrier', x, y: prof(s, d) + 0.55, z, yaw: -R.th + turn + (turn ? 0 : Math.PI / 2) }); }
  const hole = new T.Mesh(new T.PlaneGeometry(2.0, 18), new T.MeshLambertMaterial({ color: 0x3a2c22, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  const hp = P(255, 2.1, 0.02); hole.position.set(hp.x, hp.y, hp.z); hole.rotation.order = 'YXZ'; hole.rotation.set(-Math.PI / 2, -hp.th, 0); scene.add(hole);
  // sand pile (static, rideable)
  { const c = P(272, 2.2), pts = []; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; pts.push(c.x + Math.cos(a) * 1.9, c.y, c.z + Math.sin(a) * 1.4); } pts.push(c.x, c.y + 1.05, c.z); staticHull(pts, { kind: 'ground', name: 'SAND PILE' });
    const g = new T.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2); const m = new T.Mesh(g, mats().dirt); m.scale.set(1.9, 1.05, 1.4); m.position.set(c.x, c.y, c.z); m.receiveShadow = true; m.castShadow = true; scene.add(m); }
  // skip and temporary lights
  { const c = P(290, 2.4), F = frame(c.x, c.y, c.z, -c.th), L = sb(chunkOf(290), 'lam');
    bx(L, F, 1.8, 1.2, 3.6, 0, 0.6, 0, 0xf2c81f); for (let i = 0; i < 6; i++) L.add(GEO.ico, FM(F, (i % 3 - 1) * 0.5, 1.25, (Math.floor(i / 3) - 0.5) * 1.2, i, i, 0, 0.35, 0.3, 0.4), pick(rng(i), [0x8a7a6a, 0xa4523a, 0x6a6a6a, 0x9b7148]));
    staticBox(c.x, c.y + 0.6, c.z, 0.9, 0.6, 1.8, -c.th, { kind: 'wall', name: 'SKIP' }); }
  for (const s of [220, 292]) { const R = roadAt(s, {}), d = -(R.w + 0.8), x = R.x + R.rx * d, z = R.z + R.rz * d, y = prof(s, d), L = sb(chunkOf(s), 'lam'), F = frame(x, y, z, -R.th + (s > 250 ? Math.PI : 0));
    cy(L, F, 0.05, 2.4, 0, 1.2, 0, 0x2a2a2e); bx(L, F, 0.3, 0.8, 0.25, 0, 2.6, 0, 0x2a2a2e); bx(L, F, 0.5, 0.15, 0.5, 0, 0.1, 0, 0xf2c81f);
    const red = new T.Mesh(new T.CircleGeometry(0.09, 10), new T.MeshBasicMaterial({ color: 0xff2a1f })); const rp = new T.Vector3(0, 2.85, -0.13).applyMatrix4(F); red.position.copy(rp); red.rotation.y = -R.th + (s > 250 ? 0 : Math.PI); scene.add(red);
    staticCyl(x, y + 1.3, z, 0.08, 1.3, { kind: 'pole', name: 'TRAFFIC LIGHTS' }); }
  // the plank someone left as a ramp, on its own further down
  addRamp(scene, P(334, 1.6), roadAt(334, {}).th, 1.25, 3.2, 0.62, 'wood', 'PLANK RAMP');

}
// static ramp (wedge collider), rising towards travel direction th
// a curved kicker: flat at the start, curving up to the lip angle at the far end (heading th, centred on at)
export function addRamp(scene, at, th, w, len, h, mat, name, lipDeg = 28) {
  const fx = Math.sin(th), fz = -Math.cos(th), rx = Math.cos(th), rz = Math.sin(th);
  const pw = Math.max(1.05, Math.tan(lipDeg * Math.PI / 180) * len / h), N = 14;
  const P3 = (u, v, y) => [at.x + rx * u + fx * (v - len / 2), at.y + y, at.z + rz * u + fz * (v - len / 2)];
  const top = [], pos = [], uv = [], col = [], tri = [];
  const vtx = (q, U, V, c = 1) => { pos.push(...q); uv.push(U, V); col.push(c, c, c); return pos.length / 3 - 1; };
  for (let k = 0; k <= N; k++) { const v = len * k / N, y = h * Math.pow(k / N, pw); top.push([v, y]); }
  // riding surface
  for (let k = 0; k < N; k++) { const [v0, y0] = top[k], [v1, y1] = top[k + 1]; const a = vtx(P3(-w / 2, v0, y0), 0, v0), b = vtx(P3(w / 2, v0, y0), w, v0), c = vtx(P3(w / 2, v1, y1), w, v1), d = vtx(P3(-w / 2, v1, y1), 0, v1); tri.push(a, b, c, a, c, d); }
  // sides and back
  for (const side of [-1, 1]) for (let k = 0; k < N; k++) { const [v0, y0] = top[k], [v1, y1] = top[k + 1], u = side * w / 2; const a = vtx(P3(u, v0, 0), v0, 0, 0.7), b = vtx(P3(u, v1, 0), v1, 0, 0.7), c = vtx(P3(u, v1, y1), v1, y1, 0.7), d = vtx(P3(u, v0, y0), v0, y0, 0.7); if (side > 0) tri.push(a, c, b, a, d, c); else tri.push(a, b, c, a, c, d); }
  { const a = vtx(P3(-w / 2, len, 0), 0, 0, 0.6), b = vtx(P3(w / 2, len, 0), w, 0, 0.6), c = vtx(P3(w / 2, len, h), w, h, 0.6), d = vtx(P3(-w / 2, len, h), 0, h, 0.6); tri.push(a, c, b, a, d, c); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv.map(x => x * 0.5), 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(tri); g.computeVertexNormals();
  const m = new T.Mesh(g, mat === 'wood' ? mats().wood : mats().lam); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  staticMeshCol(g, { kind: 'ground', name }, { friction: 0.6, rest: 0.02 });
}

// ---------------- roundabout ----------------
function roundabout(scene) {
  const c = P(RA_S, 0), R0 = 6.4, top = 1.7, base = c.y, KH = 0.07;
  // island: a low overrun kerb, then a smooth grassy mound that works as a kicker (mesh and collider share the shape)
  const domeH = r => KH + top * (1 - Math.min(1, r / R0) ** 2) ** 2;
  const white = g => { g.setAttribute('color', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)); return g; };
  { const ring = white(new T.CylinderGeometry(R0, R0, KH + 0.12, 40, 1, true)); const kerb = new T.Mesh(ring, mats().kerb); kerb.position.set(c.x, base + KH / 2 - 0.06, c.z); scene.add(kerb);
    const cap = white(new T.RingGeometry(R0 - 0.35, R0, 40, 1)); cap.rotateX(-Math.PI / 2); const capM = new T.Mesh(cap, mats().kerb); capM.position.set(c.x, base + KH + 0.004, c.z); scene.add(capM); }
  const prof2 = [new T.Vector2(R0, -0.1), new T.Vector2(R0, KH)]; for (let k = 1; k <= 14; k++) { const r = R0 * (1 - k / 14); prof2.push(new T.Vector2(Math.max(0.001, r), domeH(r))); }
  const domeG = new T.LatheGeometry(prof2, 32); domeG.translate(c.x, base, c.z);
  const dcol = new Float32Array(domeG.attributes.position.count * 3).fill(1); domeG.setAttribute('color', new T.BufferAttribute(dcol, 3));
  const dome = new T.Mesh(domeG, mats().grass); dome.receiveShadow = true; scene.add(dome);
  staticMeshCol(domeG, { kind: 'ground', name: 'ROUNDABOUT' }, { friction: 0.7, rest: 0.05 });
  // flower bed and chevrons
  const L = sb('ra', 'lam'), r = rng(3);
  for (let k = 0; k < 40; k++) { const a = r() * TAU, rr = 1.2 + r() * 2.2, x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr, h = base + domeH(rr) - 0.04; L.add(GEO.ico, M(x, h + 0.08, z, 0, 0, 0, 0.18, 0.14, 0.18), pick(r, [0xd2486a, 0xf2c94a, 0x8a5ad2, 0xf2f2f2, 0xe8602a])); }
  // chevrons stand either side of the straight-over line, so the mound works as a kicker
  const chev = chevron(), fx = Math.sin(c.th), fz = -Math.cos(c.th), rx = Math.cos(c.th), rz = Math.sin(c.th), rr2 = R0 - 1.1, ca = Math.cos(0.75), sa = Math.sin(0.75);
  for (const [side, back, yaw] of [[1, -1, Math.PI - c.th], [-1, 1, -c.th]]) {
    const x = c.x + (fx * back * ca + rx * side * sa) * rr2, z = c.z + (fz * back * ca + rz * side * sa) * rr2;
    signPost(scene, x, base + domeH(rr2) - 0.05, z, yaw, chev, 1.6, 0.8, 0.45, { name: 'CHEVRON SIGN', twin: true });
  }
  W.roundabout = { x: c.x, z: c.z, r: R0, top: base + 0.16 + top };
  // pickups on the island
  W.pickups.push({ k: 'pineapple', x: c.x, y: base + top + 1.4, z: c.z });
}
// green spaces around the roundabout and the allotments
function greens(scene) {
  const r = rng(17);
  const tree = (x, z, s = 1) => { const y = C.world.groundY(x, z), L = sb(chunkOf(locS(x, z)), 'lam'); cy(L, null, 0.18 * s, 3 * s, x, y + 1.5 * s, z, 0x6a5038, 6); for (let k = 0; k < 4; k++) L.add(GEO.ico, M(x + (r() - 0.5) * 1.6 * s, y + (3.2 + r() * 1.6) * s, z + (r() - 0.5) * 1.6 * s, r(), r(), 0, (1.4 + r() * 0.8) * s, (1.2 + r() * 0.6) * s, (1.4 + r() * 0.8) * s), pick(r, [0x4c7a35, 0x5a8a3e, 0x3f6a2e, 0x6a9a44])); staticCyl(x, y + 1.5 * s, z, 0.25 * s, 1.5 * s, { kind: 'pole', name: 'TREE' }); W.nearTargets.push({ x, z, r: 0.35, kind: 'TREE' }); };
  for (const side of [-1, 1]) for (let s = 378; s < 484; s += 9 + r() * 6) { const R = roadAt(s, {}); if (Math.abs(s - RA_S) < 8) continue; const d = side * (R.w + 6 + r() * 6); const p = P(s, d); tree(p.x, p.z, 0.9 + r() * 0.4); }
  // boundary hedges on the green
  for (const side of [-1, 1]) for (let s = 374; s < 486; s += 4) { const R = roadAt(s, {}), d = side * (R.w + 14.5), p = P(s, d), yaw = -R.th; tbox(sb(chunkOf(s), 'hedge'), frame(p.x, p.y, p.z, yaw), 1.2, 1.6, 4.2, 0, 0.8, 0, 0xffffff, 1.2); staticBox(p.x, p.y + 0.8, p.z, 0.6, 0.8, 2.1, yaw, { kind: 'hedge', name: 'HEDGE' }); }
  for (const side of [-1, 1]) for (let s = 298; s < 376; s += 4) { if (side < 0) continue; const R = roadAt(s, {}), d = side * (R.w + 6.2), p = P(s, d), yaw = -R.th; tbox(sb(chunkOf(s), 'hedge'), frame(p.x, p.y, p.z, yaw), 0.8, 1.3, 4.2, 0, 0.65, 0, 0xffffff, 1.2); staticBox(p.x, p.y + 0.65, p.z, 0.4, 0.65, 2.1, yaw, { kind: 'hedge', name: 'HEDGE' }); }
  // allotments behind that hedge: sheds and veg rows
  for (let s = 306; s < 370; s += 16) { const p = P(s, 13), F = frame(p.x, p.y, p.z, -roadAt(s, {}).th + (r() - 0.5) * 0.3), L = sb(chunkOf(s), 'lam'); bx(L, F, 2.2, 2.0, 1.8, 0, 1.0, 0, pick(r, [0x6a8a5a, 0x7a5a3a, 0x5a6a8a])); L.add(GEO.prism, FM(F, 0, 2.0, 0, 0, 0, 0, 2.4, 0.6, 2.0), 0x3a3a3e); for (let k = 0; k < 4; k++) bx(L, F, 0.5, 0.25, 5, 3 + k * 1.1, 0.12, 0, k % 2 ? 0x5a8a3e : 0x6a5038); }
  // bus shelter, phone box, post box and benches on the green
  { const R = roadAt(404, {}); busShelter(scene, P(404, R.w + 3.2), yawTo(R.rx, R.rz), 'mid'); }
  { const p = P(455, -(roadAt(455, {}).w + 4.5)), F = frame(p.x, p.y, p.z, -roadAt(455, {}).th - Math.PI / 2), L = sb('ra', 'lam'); bx(L, F, 1.0, 2.5, 1.0, 0, 1.25, 0, 0xc8202a); for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) bx(L, F, 0.22, 0.32, 1.02, -0.25 + i * 0.25, 0.7 + j * 0.38, 0, 0x2a3440); bx(L, F, 0.8, 0.15, 1.04, 0, 2.3, 0, 0xf2f2ee); bx(L, F, 1.1, 0.15, 1.1, 0, 2.6, 0, 0xc8202a); staticBox(p.x, p.y + 1.25, p.z, 0.5, 1.25, 0.5, -roadAt(455, {}).th, { kind: 'wall', name: 'PHONE BOX' }); }
  { const p = P(440, -(roadAt(440, {}).w + 2.0)), L = sb('ra', 'lam'); cy(L, null, 0.28, 1.3, p.x, p.y + 0.65, p.z, 0xc8202a, 12); L.add(GEO.sph, M(p.x, p.y + 1.3, p.z, 0, 0, 0, 0.3, 0.16, 0.3), 0xc8202a); bx(L, null, 0.62, 0.12, 0.62, p.x, p.y + 0.06, p.z, 0x1c1c1e); staticCyl(p.x, p.y + 0.7, p.z, 0.3, 0.7, { kind: 'pole', name: 'POST BOX' }); W.nearTargets.push({ x: p.x, z: p.z, r: 0.35, kind: 'POST BOX' }); }
  for (const [s, d] of [[392, 9], [448, 9], [430, -10]]) { const R = roadAt(s, {}), p = P(s, Math.sign(d) * (R.w + Math.abs(d) - 3.6)), F = frame(p.x, p.y, p.z, yawTo(-Math.sign(d) * R.rx, -Math.sign(d) * R.rz)), L = sb('ra', 'lam'); bx(L, F, 1.8, 0.06, 0.45, 0, 0.45, 0, 0x9b7148); bx(L, F, 1.8, 0.45, 0.06, 0, 0.7, -0.22, 0x9b7148); for (const sx of [-0.8, 0.8]) bx(L, F, 0.06, 0.45, 0.45, sx, 0.22, 0, 0x2a2a2e); staticBox(p.x, p.y + 0.45, p.z, 0.9, 0.45, 0.25, yawTo(-Math.sign(d) * R.rx, -Math.sign(d) * R.rz), { kind: 'wall', name: 'BENCH' }); }
  { const R = roadAt(462, {}), p = P(462, R.w + 6); signPost(scene, p.x, p.y, p.z, yawTo(R.rx, R.rz) + Math.PI, plainSign(['NO BALL GAMES', ['By order of Grumbleton Council', 18]], { w: 256, h: 110, bg: '#f2f2ee', fg: '#111', border: '#2a6a3a' }), 1.2, 0.52, 1.4, { name: 'NO BALL GAMES SIGN' }); }
}
function locS(x, z) { const L = (C.world && C.world.locate) ? C.world.locate(x, z, {}) : { s: 0 }; return L.s; }
function busShelter(scene, at, yaw, chunk) {
  const F = frame(at.x, at.y, at.z, yaw), L = sb(chunk, 'lam'), G = sb(chunk, 'glass');
  for (const sx of [-1.6, 1.6]) for (const sz of [-0.6, 0.6]) bx(L, F, 0.08, 2.3, 0.08, sx, 1.15, sz, 0x2a2a2e);
  bx(L, F, 3.5, 0.1, 1.5, 0, 2.35, 0, 0x2a2a2e);
  G.quad(tp(F, -1.6, 0.2, 0.6), tp(F, 1.6, 0.2, 0.6), tp(F, 1.6, 2.2, 0.6), tp(F, -1.6, 2.2, 0.6), 0xffffff, [0, 0, 3, 1]);
  G.quad(tp(F, -1.6, 0.2, -0.6), tp(F, -1.6, 0.2, 0.6), tp(F, -1.6, 2.2, 0.6), tp(F, -1.6, 2.2, -0.6), 0xffffff);
  bx(L, F, 2.4, 0.06, 0.35, 0, 0.55, 0.35, 0xc8202a);
  staticBox(...wp(F, 0, 1.2, 0.6).toArray(), 1.75, 1.2, 0.08, yaw, { kind: 'wall', name: 'BUS SHELTER' });
  staticBox(...wp(F, 0, 2.35, 0).toArray(), 1.75, 0.08, 0.75, yaw, { kind: 'wall', name: 'BUS SHELTER' });
  const sp = wp(F, 2.0, 0, -0.4); signPost(scene, sp.x, sp.y, sp.z, yaw, signTex(128, 128, (g, w, h) => { g.fillStyle = '#c8202a'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(14, 50, 100, 28); g.fillStyle = '#1d3d8f'; g.textAlign = 'center'; g.font = '700 24px "Barlow Condensed",Arial'; g.fillText('BUS STOP', 64, 72); }), 0.55, 0.55, 2.4, { name: 'BUS STOP SIGN' });
}

// ---------------- the top: Spendwells ----------------
function topScenery(scene) {
  const y = TOP.y, L = sb('top', 'lam'), G = sb('top', 'glass');
  // store
  const sF = frame(0, y, 74, 0);
  tbox(sb('top', 'render'), sF, 64, 9, 24, 0, 4.5, 0, 0xf2efe6, 1.5);
  bx(L, sF, 64.4, 1.8, 0.4, 0, 8.0, -12.2, 0xf26a1b); bx(L, sF, 64.4, 0.5, 0.42, 0, 9.3, -12.2, 0x1d3d8f);
  G.quad(tp(sF, 10, 0, -12.05), tp(sF, -10, 0, -12.05), tp(sF, -10, 4.2, -12.05), tp(sF, 10, 4.2, -12.05), 0xffffff, [0, 0, 8, 1.6]);
  bx(L, sF, 22, 0.3, 4, 0, 4.6, -14, 0xd8d4c8); for (const sx of [-10.5, 10.5]) cy(L, sF, 0.12, 4.5, sx, 2.25, -15.8, 0xf2f2ee, 8);
  const fm = new T.Mesh(new T.PlaneGeometry(26, 2.6), new T.MeshBasicMaterial({ map: fascia('SPENDWELLS', { bg: '#f26a1b', fg: '#ffffff', w: 512, h: 64, size: 48 }) }));
  fm.position.set(0, y + 8.0, 74 - 12.45); fm.rotation.y = Math.PI; scene.add(fm);
  staticBox(0, y + 4.5, 74, 32, 4.5, 12, 0, { kind: 'house', name: 'SPENDWELLS' });
  // trolley bay with a row of trolleys (one missing)
  const bayF = frame(-12, y, 30, Math.PI / 2);
  for (const sx of [-4, 4]) for (const sz of [-1.1, 1.1]) bx(L, bayF, 0.1, 2.4, 0.1, sx, 1.2, sz, 0x9a9da2);
  bx(L, bayF, 8.4, 0.08, 2.6, 0, 2.45, 0, 0x2f6a9a); bx(L, bayF, 8.4, 0.5, 0.06, 0, 2.15, -1.2, 0xf26a1b);
  staticBox(...wp(bayF, 0, 2.45, 0).toArray(), 4.2, 0.1, 1.3, Math.PI / 2, { kind: 'wall', name: 'TROLLEY BAY' });
  for (const sx of [-4, 4]) staticBox(...wp(bayF, sx, 1.2, 0).toArray(), 0.1, 1.2, 1.2, Math.PI / 2, { kind: 'wall', name: 'TROLLEY BAY' });
  const tmpl = makeTrolley('dave').root;
  for (let k = 0; k < 6; k++) { if (k === 2) continue; const t = tmpl.clone(); const p = wp(bayF, -3 + k * 0.32 + (k > 2 ? 1.5 : 0), 0.5, 0); t.position.copy(p); t.rotation.y = Math.PI / 2 + Math.PI / 2; DECOR.add(t); }
  const bs = wp(bayF, 4.6, 0, 1.8);
  signPost(scene, bs.x, bs.y, bs.z, Math.PI, plainSign(['RETURN', 'TROLLEYS', 'HERE'], { w: 128, h: 128, bg: '#f26a1b', fg: '#fff', border: '#f26a1b' }), 0.6, 0.6, 1.8, { name: 'TROLLEY SIGN' });
  // the ominous exit sign
  signPost(scene, -5.4, y, 3.2, Math.PI, plainSign(['TROLLEYS MUST NOT', 'BE TAKEN BEYOND', 'THIS POINT'], { w: 256, h: 150, bg: '#ffffff', fg: '#c81e1e', border: '#c81e1e' }), 1.4, 0.82, 1.2, { name: 'TROLLEY WARNING SIGN', twin: true });
  signPost(scene, 6.0, y, 3.2, Math.PI, plainSign(['WHEEL LOCK', 'ZONE', ['(currently broken)', 22]], { w: 192, h: 150, bg: '#ffd21f', fg: '#111', border: '#111' }), 0.9, 0.7, 1.4, { name: 'WHEEL LOCK SIGN' });
  // car park furniture: lamps, recycling, a few cars, boundary wall
  for (const [x, z] of [[-24, 10], [24, 10], [-24, 40], [24, 40], [0, 44]]) { cy(L, null, 0.1, 7, x, y + 3.5, z, 0x8c9096); bx(L, null, 0.6, 0.15, 0.3, x, y + 7, z, 0x6a6e74); staticCyl(x, y + 3.5, z, 0.12, 3.5, { kind: 'pole', name: 'LAMP POST' }); }
  // a crow on the lamp nearest the start, watching
  { const cr = new Batch(); cr.add(GEO.sph, M(0, 0, 0, 0, 0, 0, 0.12, 0.1, 0.2), 0x111114); cr.add(GEO.sph, M(0, 0.1, -0.15, 0, 0, 0, 0.07, 0.07, 0.07), 0x111114); cr.add(GEO.cone8, M(0, 0.09, -0.24, -Math.PI / 2, 0, 0, 0.025, 0.08, 0.025), 0x2a2a2a); cr.add(GEO.box, M(0, 0.02, 0.2, 0.3, 0, 0, 0.1, 0.02, 0.16), 0x111114); const crow = new T.Mesh(cr.geometry(), mats().lam); crow.position.set(0, y + 7.25, 44); crow.rotation.y = Math.PI; scene.add(crow); W.crow = crow; }
  for (const [x, z, c] of [[16, 70, 0x2a6a3a], [18.5, 70, 0x2a4aa0], [21, 70, 0x8a8a8a]]) { L.add(GEO.sph, M(x, y + 1.1, z - 12, 0, 0, 0, 1.1, 1.2, 1.1), c); L.add(GEO.box, M(x, y + 0.4, z - 12, 0, 0, 0, 2.0, 0.8, 2.0), c); staticBox(x, y + 0.9, z - 12, 1.0, 0.9, 1.0, 0, { kind: 'wall', name: 'BOTTLE BANK' }); }
  const r = rng(77);
  for (const [x, z, yaw] of [[-30, 17, 0], [-27.3, 17, Math.PI], [30, 33, 0], [19, 17, Math.PI], [-35, 33, 0], [27.4, 17, 0]]) { const car = makeCar(pick(r, ['hatch', 'estate', 'hatch']), null, Math.floor(r() * 1e6)); car.group.position.set(x, y, z); car.group.rotation.y = yaw; scene.add(car.group); const idx = W.cars.length; W.cars.push({ car, x, y, z, yaw, alarm: 0, rock: 0 }); staticBox(x, y + 0.7, z, car.W / 2, 0.6, car.L / 2, yaw, { kind: 'car', name: 'PARKED CAR', car: idx }); W.nearTargets.push({ x, z, r: car.L / 2, kind: 'PARKED CAR', box: { hx: car.W / 2, hz: car.L / 2, yaw } }); }
  // perimeter: low wall with railings, open at the exit
  const wall = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, yaw = Math.atan2(x1 - x0, z1 - z0), F = frame(cx, y, cz, yaw); tbox(sb('top', 'brick'), F, 0.3, 0.9, len, 0, 0.45, 0, 0xffffff); for (let k = -len / 2 + 0.2; k < len / 2; k += 0.25) cy(L, F, 0.012, 0.7, 0, 1.25, k, 0x1c1c1e, 6); bx(L, F, 0.04, 0.04, len, 0, 1.6, 0, 0x1c1c1e); staticBox(cx, y + 0.8, cz, 0.15, 0.8, len / 2, yaw, { kind: 'wall', name: 'CAR PARK WALL' }); };
  wall(TOP.x0, 0.2, -5.95, 0.2); wall(5.95, 0.2, TOP.x1, 0.2); wall(TOP.x0, 0.2, TOP.x0, 62); wall(TOP.x1, 0.2, TOP.x1, 62);
}

// ---------------- the bottom ----------------
function bottomScenery(scene) {
  const L = sb('bot', 'lam'), G = sb('bot', 'glass'), r = rng(55);
  const BW = (lx, lf) => botToWorld(lx, lf);
  const bf = (lx, lf, yaw = 0) => { const p = BW(lx, lf); return frame(p.x, botH(lx, lf), p.z, yaw); };
  // Harrisons store
  { const F = bf(0, 118, 0); tbox(sb("bot", "brickY"), F, 74, 10, 24, 0, 5, 0, 0xffffff, 1.2);
    bx(L, F, 74.4, 2.2, 0.4, 0, 8.6, 12.2, 0x0c5a37); bx(L, F, 74.4, 0.4, 0.42, 0, 7.4, 12.2, 0xffd21f);
    G.quad(tp(F, -12, 0, 12.06), tp(F, 12, 0, 12.06), tp(F, 12, 4.4, 12.06), tp(F, -12, 4.4, 12.06), 0xffffff, [0, 0, 10, 1.6]);
    bx(L, F, 26, 0.35, 4.5, 0, 4.8, 14.2, 0x0c5a37); for (const sx of [-12.5, 12.5]) cy(L, F, 0.14, 4.8, sx, 2.4, 16.2, 0xffd21f, 8);
    const p = BW(0, 118); staticBox(p.x, 5, p.z, 37, 5, 12, 0, { kind: 'house', name: 'HARRISONS' });
    const fm = new T.Mesh(new T.PlaneGeometry(30, 2.4), new T.MeshBasicMaterial({ map: fascia('HARRISONS', { bg: '#0c5a37', fg: '#ffd21f', w: 512, h: 64, size: 50 }) })); const fp = BW(0, 118 - 12.45); fm.position.set(fp.x, 8.6, fp.z); scene.add(fm); }
  // trolley shelters; the one by the door is the finish
  const tmpl = makeTrolley('dave').root;
  const shelter = (lx, lf, n, finish) => { const F = bf(lx, lf, 0); for (const sx of [-1.4, 1.4]) for (const sz of [-4, 4]) bx(L, F, 0.1, 2.4, 0.1, sx, 1.2, sz, 0x9a9da2); bx(L, F, 3.0, 0.08, 8.4, 0, 2.45, 0, 0x0c5a37); bx(L, F, 0.06, 0.5, 8.4, -1.4, 2.15, 0, 0xffd21f);
    const p = BW(lx, lf); staticBox(p.x, 2.45, p.z, 1.5, 0.08, 4.2, 0, { kind: 'wall', name: 'TROLLEY SHELTER' });
    for (let k = 0; k < n; k++) { const t = tmpl.clone(); const q = BW(lx, lf - 3 + k * 0.34); t.position.set(q.x, 0.5, q.z); t.rotation.y = Math.PI; DECOR.add(t, 'bottom'); }
    if (finish) { (W.finishes = W.finishes || []).push({ x: p.x, z: p.z + 0.5, hx: 1.6, hz: 4.2 }); const sp = BW(lx + 2.0, lf + 4.5); signPost(scene, sp.x, 0, sp.z, Math.PI, plainSign(['RETURN', 'TROLLEYS', 'HERE'], { w: 128, h: 128, bg: '#0c5a37', fg: '#ffd21f', border: '#ffd21f' }), 0.7, 0.7, 2.0, { name: 'TROLLEY SIGN' }); } };
  shelter(-22, 70, 6, true); shelter(22, 70, 3, true); shelter(12, 96, 2, true);
  // a few parked cars
  for (const [lx, lf, yaw] of [[-29.2, 60.5, 0], [-26.6, 60.5, Math.PI], [26.6, 60.5, 0], [-18.8, 86.5, 0], [29.2, 86.5, Math.PI], [-31.8, 86.5, 0], [21.2, 60.5, Math.PI]]) { const car = makeCar(pick(r, ['hatch', 'estate', 'van']), null, Math.floor(r() * 1e6)); const p = BW(lx, lf); car.group.position.set(p.x, 0.03, p.z); car.group.rotation.y = yaw; scene.add(car.group); const idx = W.cars.length; W.cars.push({ car, x: p.x, y: 0, z: p.z, yaw, alarm: 0, rock: 0 }); staticBox(p.x, 0.7, p.z, car.W / 2, 0.6, car.L / 2, yaw, { kind: 'car', name: 'PARKED CAR', car: idx }); W.nearTargets.push({ x: p.x, z: p.z, r: car.L / 2, kind: 'PARKED CAR', box: { hx: car.W / 2, hz: car.L / 2, yaw } }); }
  // car park lamps
  for (const [lx, lf] of [[-14, 62], [14, 62], [-14, 88], [14, 88], [0, 75]]) { const p = BW(lx, lf); cy(L, null, 0.1, 7, p.x, 3.5, p.z, 0x8c9096); bx(L, null, 0.6, 0.15, 0.3, p.x, 7, p.z, 0x6a6e74); staticCyl(p.x, 3.5, p.z, 0.12, 3.5, { kind: 'pole', name: 'LAMP POST' }); W.nearTargets.push({ x: p.x, z: p.z, r: 0.25, kind: 'LAMP POST' }); }
  // bus stop on Station Road
  { const p = BW(-24, 16.3); busShelter(scene, { x: p.x, y: 0.05, z: p.z }, Math.PI, 'bot'); W.busStop = { lx: -24 }; }
  // the pond: ramp, railings, reeds, a sign about bread
  { const at = BW(0, 24.4); addRamp(scene, { x: at.x, y: 0.0, z: at.z }, 0, 5.2, 6.5, 2.2, 'wood', 'POND RAMP', 30);
    const pc = BW(POND.lx, POND.lf);
    for (let k = 0; k < 70; k++) { const a = r() * TAU, rr = 1.0 + r() * 0.12, lx = POND.lx + Math.cos(a) * POND.rx * rr, lf = POND.lf + Math.sin(a) * POND.rz * rr; if (Math.abs(lx) < 4 && lf < POND.lf) continue; const p = BW(lx, lf); for (let j = 0; j < 3; j++) L.add(GEO.cone8, M(p.x + (r() - 0.5) * 0.5, botH(lx, lf) + 0.5, p.z + (r() - 0.5) * 0.5, (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3, 0.05, 1.1 + r() * 0.5, 0.05), pick(r, [0x5a7a35, 0x6a8a3e, 0x4c6a2e])); }
    for (let k = 0; k < 12; k++) { const a = r() * TAU, rr = 0.3 + r() * 0.5; const p = BW(POND.lx + Math.cos(a) * POND.rx * rr, POND.lf + Math.sin(a) * POND.rz * rr); L.add(GEO.cyl12, M(p.x, POND.water + 0.02, p.z, 0, 0, 0, 0.45, 0.02, 0.45), 0x4c8a3a); }
    const sp = BW(-12, 22); signPost(scene, sp.x, 0, sp.z, Math.PI, plainSign(['PLEASE DO NOT', 'FEED THE DUCKS', 'BREAD'], { w: 192, h: 150, bg: '#f2f2ee', fg: '#1f5a36', border: '#1f5a36' }), 0.9, 0.7, 1.2, { name: 'DUCK SIGN' });
    W.pond = { x: pc.x, z: pc.z, rx: POND.rx, rz: POND.rz, water: POND.water };
    W.ducks = []; for (let k = 0; k < 9; k++) { const a = r() * TAU, rr = r() * 0.7; W.ducks.push({ lx: POND.lx + Math.cos(a) * POND.rx * rr, lf: POND.lf + Math.sin(a) * POND.rz * rr, drake: k % 3 !== 0 }); }
  }
  // boundary around the bottom
  const fence = (lx0, lf0, lx1, lf1) => { const a = BW(lx0, lf0), b = BW(lx1, lf1), len = Math.hypot(b.x - a.x, b.z - a.z), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, yaw = Math.atan2(b.x - a.x, b.z - a.z), F = frame(cx, 2.5, cz, yaw); tbox(sb('bot', 'hedge'), F, 1.4, 2.2, len, 0, 1.0, 0, 0xffffff, 1.2); staticBox(cx, 3.5, cz, 0.7, 3, len / 2, yaw, { kind: 'hedge', name: 'HEDGE' }); };
  fence(BOT.lx0 + 1, 1, BOT.lx0 + 1, BOT.lf1 - 1); fence(BOT.lx1 - 1, 1, BOT.lx1 - 1, BOT.lf1 - 1); fence(BOT.lx0 + 1, BOT.lf1 - 1, BOT.lx1 - 1, BOT.lf1 - 1);
  const edge = (lx0, lx1) => { const a = BW(lx0, 0.8), b = BW(lx1, 0.8), len = Math.abs(b.x - a.x), cx = (a.x + b.x) / 2; tbox(sb('bot', 'brick'), frame(cx, 0, a.z, Math.PI / 2), 0.3, 1.0, len, 0, 0.5, 0, 0xffffff); staticBox(cx, 0.6, a.z, len / 2, 0.6, 0.15, 0, { kind: 'wall', name: 'WALL' }); };
  edge(BOT.lx0 + 1, -10.5); edge(10.5, BOT.lx1 - 1);
}

// ---------------- shopping placement ----------------
function placePickups() {
  // one of each thing on the list, each sat over something you can jump off
  const add = (k, x, y, z) => W.pickups.push({ k, x, y, z });
  { const p = botToWorld(0, 37); add('milk', p.x, 4.8, p.z); } // over the duck pond
  { const p = P(136, 0, 1.7); add('loo', p.x, p.y, p.z); } // road hump on the hill
  { const p = P(335.2, 1.6, 1.05); add('tampons', p.x, p.y, p.z); } // on the plank ramp itself
  // pineapple: on the roundabout island (placed with the island); gnome: off the car transporter (extras)
}

// ---------------- pedestrians ----------------
function placePeds() {
  W.peds.push({ kind: 'lollipop', s: 181, d: -1.8 });
}

export function buildScenery(scene) {
  W.dyn = []; W.peds = []; W.wobblers = []; W.cars = [];
  topScenery(scene);
  terraces(scene);
  street(scene);
  parkedCars(scene);
  roadworks(scene);
  roundabout(scene);
  greens(scene);
  bottomScenery(scene);
  placePickups();
  placePeds();
  DECOR.flush(scene);
}
