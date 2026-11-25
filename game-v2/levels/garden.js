import { C } from '../core.js';
import { Batch, GEO, M, FM, frame, bx, cy, seg, clamp, lerp, sstep, rng, pick, TAU } from '../util.js';
import { buildSky, mats, sb, staticBox, staticMeshCol, staticCyl } from '../terrain.js';
import { addRamp, signPost } from '../course.js';
import { plainSign, fascia, TX } from '../textures.js?v=green-fingers';
import { makeTrolley } from '../models.js?v=green-fingers';

const T = C.T;
const HALF = 1.9;
// Each lettered section gets its own terrace. The middle turn looks back down the hill towards the café.
const stations = [
  [0, 37, 35], [0, 36.3, 12], [0, 34.3, -7], [0, 31, -24],
  [-7, 29.8, -42], [-18, 28.7, -59], [-14, 27.7, -77], [-3, 26.6, -92],
  [3.5, 23.1, -106], [12.5, 22.4, -121], [10, 21.8, -136], [0, 20.8, -149],
  [-3, 17.5, -166], [5, 16.9, -183], [23, 16.4, -196], [44, 15.1, -197],
  [56, 13.6, -187], [57, 12.9, -171], [52, 12.1, -153], [68, 11.2, -151],
  [91, 10.6, -149], [112, 9.7, -137], [119, 8.9, -118], [119, 7.4, -99],
  [110, 5.5, -79], [114, 4.9, -60], [115, 3.6, -43], [115, 3.1, -25],
];

function makeRoute() {
  const center = new T.CatmullRomCurve3(stations.map(point => new T.Vector3(...point)));
  center.arcLengthDivisions = (stations.length - 1) * 24;
  const lengths = center.getLengths(), total = lengths.at(-1), count = Math.ceil(total / 0.85);
  const marks = stations.map((_, i) => lengths[i * 24]);
  const rows = [], cellSize = 10, grid = new Map();
  for (let i = 0; i <= count; i++) {
    const p = center.getPointAt(i / count), v = center.getTangentAt(i / count);
    const th = Math.atan2(v.x, -v.z), row = { x: p.x, y: p.y, z: p.z, th, s: i * total / count };
    rows.push(row);
    const key = Math.floor(p.x / cellSize) + ',' + Math.floor(p.z / cellSize);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  function roadAt(s, out = {}) {
    const u = clamp(s / total, 0, 1) * count, i = Math.min(count - 1, Math.floor(u));
    const a = rows[i], b = rows[i + 1], f = u - i;
    const th = a.th + Math.atan2(Math.sin(b.th - a.th), Math.cos(b.th - a.th)) * f;
    out.x = lerp(a.x, b.x, f); out.y = lerp(a.y, b.y, f); out.z = lerp(a.z, b.z, f); out.th = th;
    out.fx = Math.sin(th); out.fz = -Math.cos(th); out.rx = Math.cos(th); out.rz = Math.sin(th); out.w = HALF;
    return out;
  }
  function locate(x, z, out = {}) {
    const gx = Math.floor(x / cellSize), gz = Math.floor(z / cellSize);
    let dist = Infinity, index = -1;
    const check = i => {
      const p = rows[i], d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < dist) { index = i; dist = d; }
    };
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const found = grid.get((gx + dx) + ',' + (gz + dz));
      if (found) for (const i of found) check(i);
    }
    if (index < 0) for (let i = 0; i <= count; i++) check(i);
    const p = rows[index], sin = Math.sin(p.th), cos = Math.cos(p.th), dx = x - p.x, dz = z - p.z;
    out.s = clamp(p.s + dx * sin - dz * cos, 0, total);
    out.d = dx * cos + dz * sin; out.dist = Math.sqrt(dist);
    return out;
  }
  const sample = {}, local = {};
  function P(s, d, h = 0) {
    const p = roadAt(s, sample);
    return { x: p.x + p.rx * d, y: p.y + h + edgeHeight(d), z: p.z + p.rz * d, th: p.th };
  }
  const groundY = (x, z) => { const a = locate(x, z, local); return roadAt(a.s, sample).y + edgeHeight(a.d); };
  return { roadAt, locate, groundY, P, total, marks, rows };
}
function edgeHeight(d) { return Math.abs(d) > HALF + 0.08 ? 0.07 : 0; }
const xyz = ({ x, y, z }) => [x, y, z];
const collider = name => ({ kind: 'ground', name });
function lineDistance(x, z, line) {
  const { start, end } = line, vx = end.x - start.x, vz = end.z - start.z;
  const u = clamp(((x - start.x) * vx + (z - start.z) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(x - start.x - u * vx, z - start.z - u * vz);
}
function earthHeight(W, x, z) {
  const local = W.locate(x, z, {}), r = W.roadAt(local.s, {});
  let y = r.y - 3.8 - Math.max(0, local.dist - 7) * 0.34;
  for (const line of W.junctions) if (lineDistance(x, z, line) < 12) {
    const { start, end } = line;
    const dx = end.x - start.x, dz = end.z - start.z;
    const u = clamp(((x - start.x) * dx + (z - start.z) * dz) / (dx * dx + dz * dz), 0, 1);
    y = Math.min(y, lerp(start.y, end.y, u) - 3.2);
  }
  return Math.max(-1.59, y);
}

function path(W) {
  const edges = [-8, -HALF - 0.18, -HALF, HALF, HALF + 0.18, 3.5, 4.6, 5.7, 6.8, 8, 9.5];
  const surface = ['grass', 'kerb', 'pave', 'kerb', 'grass', 'grass', 'grass', 'grass', 'grass', 'grass'];
  const n = W.rows.length - 1, pond = W.pond;
  function at(s, d) {
    const p = W.P(s, d);
    const pr = Math.hypot((p.x - pond.x) / pond.rx, (p.z - pond.z) / pond.rz);
    if (pr < 1.07 && d > HALF) p.y -= 0.79 * (1 - sstep(0.64, 1.07, pr));
    return xyz(p);
  }
  for (let start = 0; start < n; start += 50) {
    const chunk = 'garden' + start, body = new Batch(), retaining = sb(chunk, 'brickB');
    for (let i = start; i < Math.min(n, start + 50); i++) {
      const a = W.rows[i].s, b = W.rows[i + 1].s, winter = a > W.marks[22] + 6 && a < W.marks[26] - 5;
      for (let j = 0; j < surface.length; j++) {
        const low = edges[j], high = edges[j + 1];
        const pts = [at(a, low), at(a, high), at(b, high), at(b, low)];
        const isGrass = surface[j] === 'grass';
        const paint = j === 2 ? 0xe2d5bc : winter && isGrass ? 0xfaf7f0 : isGrass ? 0xa5c87e : 0xd7d0bf;
        sb(chunk, winter && isGrass ? 'lam' : surface[j]).quad(...pts, paint, [low / 1.8, a / 1.8, high / 1.8, b / 1.8]);
        body.quad(...pts);
      }
      for (const d of [-8, 9.5]) {
        const u = at(a, d), v = at(b, d);
        if (W.junctions.some(line => lineDistance((u[0] + v[0]) / 2, (u[2] + v[2]) / 2, line) < 3.2)) continue;
        const uBase = [u[0], earthHeight(W, u[0], u[2]) - 0.6, u[2]], vBase = [v[0], earthHeight(W, v[0], v[2]) - 0.6, v[2]];
        const quad = d < 0 ? [vBase, uBase, u, v] : [uBase, vBase, v, u];
        retaining.quad(...quad, 0xab9c7a, [a / 1.4, -1.12, b / 1.4, (u[1] + v[1]) / 2.8]);
        body.quad(...quad);
      }
    }
    const geo = body.geometry();
    staticMeshCol(geo, collider('GARDEN PATH'), { friction: 0.8, rest: 0.03 }); geo.dispose();
  }
}

function ribbon(points, width, material, name) {
  const B = sb(name, material), collision = new Batch();
  const rows = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b.x - a.x, b.z - a.z), ux = (a.z - b.z) * width / (length * 2), uz = (b.x - a.x) * width / (length * 2);
    return [[p.x - ux, p.y, p.z - uz], [p.x + ux, p.y, p.z + uz]];
  });
  for (let i = 0; i < rows.length - 1; i++) {
    const quad = [rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]];
    B.quad(...quad, 0xffffff, [0, i, width, i + 1]); collision.quad(...quad);
  }
  const g = collision.geometry(); staticMeshCol(g, collider(name), { friction: 0.72, rest: 0.02 }); g.dispose();
}

function solidBox(B, F, x, y, z, w, h, d, color, name = 'DISPLAY') {
  bx(B, F, w, h, d, x, y, z, color);
  const p = new T.Vector3(x, y, z).applyMatrix4(F);
  const a = F.elements;
  staticBox(p.x, p.y, p.z, w / 2, h / 2, d / 2, Math.atan2(a[8], a[10]), { kind: 'wall', name });
}
function surfaceBox(B, F, x, y, z, w, h, d, color, name) {
  bx(B, F, w, h, d, x, y, z, color);
  const p = new T.Vector3(x, y, z).applyMatrix4(F);
  const a = F.elements;
  staticBox(p.x, p.y, p.z, w / 2, h / 2, d / 2, Math.atan2(a[8], a[10]), collider(name));
}
function site(W, s, d) { const p = W.P(s, d); return { ...p, F: frame(p.x, p.y, p.z, -p.th) }; }
function parkSign(scene, p, lines, width = 1.9, color = '#245b3c') {
  const tex = plainSign(lines, { w: 256, h: 128, bg: color, fg: '#fff2ca', border: '#163b2a' });
  return signPost(scene, p.x, p.y, p.z, Math.PI - p.th, tex, width, width / 2.25, 1.45, { name: lines[0] });
}
function pickup(W, k, s, d = 0, y = 0.94) {
  W.pickups.push({ k, ...W.P(s, d, y), reach: 1.17 });
}
function plants(B, F, x, y, z, tint, size = 0.8) {
  cy(B, F, size * 0.36, size * 0.32, x, y + size * 0.16, z, 0xae613d, 8);
  for (let j = 0; j < 4; j++) {
    const a = j * TAU / 4;
    B.add(GEO.ico, FM(F, x + Math.sin(a) * size * 0.19, y + size * 0.49, z + Math.cos(a) * size * 0.19,
      0, a, 0, size * 0.35, size * 0.46, size * 0.28), 0x508046);
    B.add(GEO.ico, FM(F, x + Math.sin(a) * size * 0.23, y + size * 0.69, z + Math.cos(a) * size * 0.21,
      0, 0, 0, size * 0.12, size * 0.11, size * 0.12), tint);
  }
}
function carPark(scene, W) {
  const B = sb('start', 'lam'), ground = sb('start', 'tarmac'), mark = sb('start', 'mark');
  const start = W.P(7, 0);
  W.start = { x: start.x, y: start.y, z: start.z, yaw: -start.th };
  for (const side of [-1, 1]) {
    const S = [xyz(W.P(0, side * 8)), xyz(W.P(0, side * 2.1)), xyz(W.P(26, side * 2.1)), xyz(W.P(26, side * 8))];
    if (side > 0) S.reverse();
    ground.quad(...S.map(p => [p[0], p[1] + 0.016, p[2]]), 0xeee8d9, [0, 0, 4, 8]);
    for (let k = 0; k < 4; k++) {
      const { F } = site(W, 3.5 + k * 4.8, side * 4.95);
      bx(mark, F, 4.3, 0.014, 0.075, 0, 0.032, 0, 0xebeddc);
    }
  }
  const bay = site(W, 7.5, -5.3);
  for (const x of [-1.4, 1.4]) for (const z of [-3.1, 3.1]) solidBox(B, bay.F, x, 1.02, z, 0.1, 2.04, 0.1, 0x3a5040, 'TROLLEY BAY');
  solidBox(B, bay.F, 0, 2.12, 0, 3.1, 0.11, 6.6, 0x35754b, 'TROLLEY BAY');
  const trolley = makeTrolley('flatbed').root;
  trolley.position.set(bay.x, bay.y + 0.48, bay.z); scene.add(trolley);
  const arch = site(W, 29, 0);
  for (const x of [-2.87, 2.87]) solidBox(B, arch.F, x, 1.58, 0, 0.16, 3.16, 0.17, 0x315b45, 'GARDEN CENTRE GATE');
  const gate = new T.Mesh(new T.PlaneGeometry(5.9, 1), new T.MeshBasicMaterial({ map: plainSign(['GREEN FINGERS', 'GARDEN CENTRE'], { w: 384, h: 90, bg: '#245b3c', border: '#163b2a', fg: '#fff2ca' }) }));
  gate.position.copy(new T.Vector3(0, 3.13, 0.1).applyMatrix4(arch.F)); gate.rotation.y = -arch.th; scene.add(gate);
  for (const [d, s, height] of [[5.2, 19.5, 1.4], [-5.4, 24, 1.12]]) {
    const shed = site(W, s, d);
    surfaceBox(sb('start', 'wood'), shed.F, 0, height / 2 - 0.03, 0, 3, height + 0.06, 5.1, 0xc9a675, 'DISPLAY SHED');
    surfaceBox(B, shed.F, 0, height + 0.055, 0, 2.95, 0.11, 5.2, 0x55705b, 'SHED ROOF');
    bx(B, shed.F, 0.77, height - 0.21, 0.04, 0, (height - 0.21) / 2, 2.58, 0x324940);
    const climb = W.P(s - 4.55, d), grade = (W.P(s - 2.55, d).y - W.P(s - 6.55, d).y) / 4;
    addRamp(scene, climb, climb.th, 2.4, 4, height + 0.04, 'wood', 'SHED DISPLAY RAMP', 31, grade);
  }
  const kicker = W.P(23, -1.35);
  addRamp(scene, kicker, kicker.th, 1.1, 2.8, 0.44, 'wood', 'COMPOST BAG KICKER', 23);
  for (let i = 0; i < 4; i++) {
    const p = W.P(21.8 + i * 0.68, -2.3, 0.16);
    W.dyn.push({ type: 'compost', ...p, yaw: -p.th });
    bx(B, site(W, 22.3 + i * 0.58, -1.36).F, 0, 0.05 + i * 0.082, 0, 1.1, 0.15, 0.42, i % 2 ? 0x719244 : 0x48783e);
  }
  pickup(W, 'seed', 31, 0);
}

function outdoor(scene, W) {
  const start = W.marks[3], end = W.marks[7], r = rng(903);
  for (let i = 0; i < 7; i++) {
    const s = start + 8 + i * 8.8, side = i % 2 ? -1 : 1, p = site(W, s, side * 2.74);
    const L = sb('plants' + Math.floor(i / 2), 'lam');
    surfaceBox(L, p.F, 0, 0.38, 0, 1.25, 0.12, 6.4, 0x815a3b, 'PLANT BENCH');
    for (const x of [-0.49, 0.49]) for (const z of [-2.85, 2.85]) solidBox(L, p.F, x, 0.17, z, 0.1, 0.34, 0.12, 0x4f583a, 'PLANT BENCH LEG');
    // Low, bare edge allows a hop or approach ramp onto the row.
    const railX = -side * 0.43;
    surfaceBox(L, p.F, railX, 0.473, 0, 0.15, 0.06, 6.45, 0xafb3a6, 'BENCH GRIND RAIL');
    const lead = new T.Vector3(railX, 0, 4.4).applyMatrix4(p.F);
    addRamp(scene, lead, p.th, 0.83, 2.15, 0.45, 'wood', 'BENCH LEAD-IN', 21);
    const rail = new T.Vector3(railX, 0.503, 0).applyMatrix4(p.F);
    W.grinds.push({ x: rail.x, z: rail.z, y: rail.y, fx: Math.sin(p.th), fz: -Math.cos(p.th), half: 3.1 });
    for (let n = -2; n < 3; n++) plants(L, p.F, side * 0.20, 0.44, n * 1.14, pick(r, [0xed91a3, 0xe9be54, 0xe0e0e8]), 0.75);
    for (const z of [-2.8, 2.8]) cy(L, p.F, 0.06, 2.8, side * 0.58, 1.4, z, 0x59634e, 6);
    bx(L, p.F, 0.11, 0.11, 5.9, side * 0.58, 2.79, 0, 0x59634e);
    for (const z of [-1.8, 0, 1.8]) {
      seg(L, p.F, [side * 0.58, 2.78, z], [side * 0.12, 2.39, z], 0.016, 0x787e6d, 6);
      plants(L, p.F, side * 0.12, 2.22, z, 0xde7696, 0.55);
    }
  }
  for (let i = 0; i < 9; i++) {
    const p = W.P(start + 11 + i * 5.95, i % 2 ? -0.32 : 0.34, 0.22);
    W.dyn.push({ type: 'pot', ...p, yaw: 0 });
  }
  for (let s = start + 5; s < end; s += 8) {
    const p = site(W, s, -5.1);
    const B = sb('plantsBeds' + Math.floor(s / 40), 'lam');
    bx(B, p.F, 2.1, 0.25, 4.6, 0, 0.125, 0, 0x7c6242);
    for (const z of [-1.6, -0.8, 0, 0.8, 1.6]) plants(B, p.F, 0, 0.25, z, pick(r, [0xead989, 0xd67ea7, 0xbcb4dc]), 0.86);
  }
  parkSign(scene, W.P(start + 2.5, -2.7), ['OUTDOOR PLANTS', 'POTS & BEDDING'], 2.2);
  pickup(W, 'potPlant', start + 36);
}

function glasshouse(scene, W) {
  const { start: entry, end: exit } = W.junctions[0];
  const between = (t, rise = 0) => {
    const x = lerp(entry.x, exit.x, t), z = lerp(entry.z, exit.z, t);
    const join = Math.min(sstep(0, 0.095, t), sstep(1, 0.905, t));
    const grade = lerp(entry.y, exit.y, t), apron = W.groundY(x, z);
    return { x, y: lerp(grade, Math.max(grade, apron + 0.17), join) + rise, z };
  };
  const yaw = Math.atan2(exit.x - entry.x, entry.z - exit.z);
  const route = [];
  for (let i = 0; i <= 36; i++) route.push(between(i / 36));
  ribbon(route, 3.75, 'pave', 'GREENHOUSE FLOOR');
  const B = sb('greenhouse', 'lam');
  for (const t of [0.18, 0.29, 0.4, 0.51, 0.62, 0.73, 0.83]) {
    const p = between(t);
    const F = frame(p.x, p.y, p.z, -yaw);
    for (const x of [-3.1, 3.1]) {
      surfaceBox(B, F, x, 1.31, 0, 0.12, 2.62, 0.14, 0x648b6e, 'GLASSHOUSE POSTS');
      bx(B, F, 0.12, 0.14, 5.4, x, 2.58, 0, 0x638c74);
      for (const h of [0.17, 1.36]) bx(B, F, 0.1, 0.085, 5.4, x, h, 0, 0x709f80);
      bx(sb('greenhouse-sides', 'glass'), F, 0.04, 2.3, 5.3, x, 1.35, 0, 0xcdebe0);
    }
    bx(B, F, 6.3, 0.1, 0.13, 0, 2.64, 0, 0x7ca18b);
    if (t < 0.79) W.dyn.push({ type: 'pane', x: p.x, y: p.y + 1.08, z: p.z, yaw: -yaw, w: 2.28 });
  }
  const high = W.P(W.marks[7] + 6, -0.95);
  const roofStart = between(0.17, 2.79), roofEnd = between(0.79, 2.79);
  const roofExit = W.P(W.marks[12] + 1.75, -4.3);
  ribbon([high, roofStart, roofEnd, roofExit], 2.65, 'glass', 'SLOPING GLASS ROOF');
  // The side of the roof stays open so a missed shortcut can rejoin the paving.
  const arrows = sb('glass-arrows', 'mark');
  for (const t of [0.05, 0.1]) {
    const p = between(t, 0.035), F = frame(p.x, p.y, p.z, -yaw);
    bx(arrows, F, 0.13, 0.01, 0.48, -0.13, 0, 0, 0xe5e5a7, 0, -0.55);
    bx(arrows, F, 0.13, 0.01, 0.48, 0.13, 0, 0, 0xe5e5a7, 0, 0.55);
  }
  // Both glasshouse routes rejoin before the gnome display.
  pickup(W, 'gnome', W.marks[12] + 10, -0.42);
  const sign = W.P(W.marks[8] - 3, -4.05);
  parkSign(scene, sign, ['GLASSHOUSE', 'ROOF RAMP TO LEFT'], 2.25);
  W.glassRoute = { entry, exit, between, yaw };
}

function waterFeatures(scene, W) {
  const pond = W.pond, flat = W.P(W.marks[13] + 5, 0);
  const material = new T.MeshLambertMaterial({ color: 0x70a28f, map: TX.water.clone(), transparent: true, opacity: 0.76 });
  material.map.repeat.set(2.2, 2.7);
  const geo = new T.CircleGeometry(1, 32); geo.rotateX(-Math.PI / 2);
  const water = W.water = new T.Mesh(geo, material);
  water.scale.set(pond.rx, 1, pond.rz); water.position.set(pond.x, pond.water, pond.z); scene.add(water);
  const rim = new T.RingGeometry(0.96, 1.105, 32); rim.rotateX(-Math.PI / 2);
  rim.scale(pond.rx, 1, pond.rz); rim.translate(pond.x, pond.water + 0.09, pond.z);
  const stone = new T.Mesh(rim, new T.MeshLambertMaterial({ color: 0xb0aa91 })); scene.add(stone);
  staticMeshCol(rim, collider('KOI POND EDGE'), { friction: 0.65 });
  const fish = [], r = rng(807), orange = [0xfba05b, 0xfbede2, 0xf37324, 0xffd3a2];
  for (let i = 0; i < 10; i++) {
    const b = new Batch(), tint = orange[i % 4], size = 0.8 + r() * 0.4;
    b.add(GEO.ico, M(0, 0, 0, 0, 0, 0, 0.16 * size, 0.09, 0.39 * size), tint);
    b.add(GEO.ico, M(0, 0, 0.31 * size, 0, 0, 0, 0.20 * size, 0.07, 0.16 * size), 0xeb7131);
    b.add(GEO.ico, M(0, 0.015, -0.06, 0, 0, 0, 0.113, 0.083, 0.125), i % 3 ? 0xdf5930 : 0xf5ecdd);
    const mesh = new T.Mesh(b.geometry(), mats().lam);
    mesh.userData.animated = true;
    scene.add(mesh); fish.push({ mesh, phase: r() * TAU, ring: 0.24 + r() * 0.47 });
  }
  W.fish = fish;
  const B = sb('garden-water', 'lam'), fountains = [];
  for (const d of [-1.8, 1.82]) {
    const p = site(W, W.marks[14] + 4.4, d);
    bx(B, p.F, 0.42, 0.08, 0.45, 0, 0.04, 0, 0x596b65);
    cy(B, p.F, 0.14, 0.14, 0, 0.1, 0, 0xbfc9bf, 12);
    fountains.push({ x: p.x, y: p.y + 0.16, z: p.z, vx: Math.cos(p.th) * -d * 1.55, vz: Math.sin(p.th) * -d * 1.55 });
  }
  const plinth = site(W, W.marks[14] + 9, -3.9);
  solidBox(B, plinth.F, 0, 0.36, 0, 1.66, 0.72, 1.5, 0x839a92, 'FOUNTAIN PLINTH');
  for (const [h, radius] of [[0.82, 0.64], [1.32, 0.48], [1.75, 0.32]]) cy(B, plinth.F, radius, 0.14, 0, h, 0, 0xc5d3c5, 12);
  cy(B, plinth.F, 0.14, 1.13, 0, 1.24, 0, 0xb1c1b7, 12);
  parkSign(scene, W.P(W.marks[14] + 6.8, -4.8), ['£899', 'DELUXE CASCADE'], 1.38);
  fountains.push({ x: plinth.x, y: plinth.y + 1.8, z: plinth.z, vx: 0, vz: 0 });
  W.fountains = fountains;
  W.waterSound = p => clamp(1 - Math.hypot(p.x - flat.x, p.z - flat.z) / 15, 0, 1);
  pickup(W, 'fishFood', W.marks[14] - 1.5, 0.42);
  parkSign(scene, W.P(W.marks[12] + 6, -2.68), ['WATER FEATURES', 'KOI POND'], 2.1);
}

function gardenFurniture(scene, W) {
  const { start: entry, end: exit } = W.junctions[1];
  const point = (t, rise = 0) => ({ x: lerp(entry.x, exit.x, t), y: lerp(entry.y, exit.y, t) + rise, z: lerp(entry.z, exit.z, t) });
  const axis = new T.Vector3(exit.x - entry.x, 0, exit.z - entry.z).normalize();
  const full = Math.hypot(exit.x - entry.x, exit.z - entry.z), half = 3.35 / full;
  const bowl = point(0.53, 0.82), inlet = point(0.53 - half, 0.82), outlet = point(0.53 + half, 0.82);
  ribbon([entry, point(0.30, 0.5), inlet], 3.2, 'wood', 'HOT TUB IN');
  ribbon([outlet, point(0.73, 0.47), exit], 3.2, 'wood', 'HOT TUB OUT');
  const rings = [new T.Vector2(0, -0.62), new T.Vector2(2, -0.60), new T.Vector2(2.48, -0.48), new T.Vector2(2.96, -0.26), new T.Vector2(3.31, 0), new T.Vector2(3.52, 0), new T.Vector2(3.53, -1.12)];
  const geo = new T.LatheGeometry(rings, 32);
  // Lathe's front face assumes a descending profile. Reverse it for the inside of the display bowl.
  const indices = geo.index.array;
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  geo.translate(bowl.x, bowl.y, bowl.z); geo.computeVertexNormals();
  const bowlMesh = new T.Mesh(geo, new T.MeshLambertMaterial({ color: 0x82acaa, side: T.DoubleSide }));
  bowlMesh.receiveShadow = true; scene.add(bowlMesh);
  staticMeshCol(geo, collider('HOT TUB DISPLAY'), { friction: 0.68, rest: 0.06 });
  const B = sb('furniture', 'lam');
  const cuff = new T.CylinderGeometry(3.5, 3.48, 1.1, 22, 1, true);
  B.add(cuff, M(bowl.x, bowl.y - 0.58, bowl.z, 0, 0, 0, 1, 1, 1), 0x7e5540);
  W.hotTub = { ...bowl, axis, radius: 3.5, entry, exit };
  parkSign(scene, W.P(W.marks[18] - 4, -3.7), ['GARDEN FURNITURE', 'HOT TUB DEMO'], 2.35);

  const f = W.marks[20], trampoline = site(W, f + 3.5, 0.15);
  const mat = frame(trampoline.x, trampoline.y, trampoline.z, -trampoline.th);
  addRamp(scene, W.P(f + 0.6, 0.15), trampoline.th, 2.5, 2.4, 0.34, 'wood', 'TRAMPOLINE ACCESS', 22);
  cy(B, mat, 1.53, 0.13, 0, 0.325, 0, 0x3d7b66, 16);
  cy(B, mat, 1.38, 0.085, 0, 0.39, 0, 0x383d42, 16);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    cy(B, mat, 0.035, 0.29, Math.cos(a) * 1.28, 0.145, Math.sin(a) * 1.28, 0xadb1af, 6);
  }
  staticCyl(trampoline.x, trampoline.y + 0.32, trampoline.z, 1.53, 0.12, collider('TRAMPOLINE MAT'), { friction: 0.7, rest: 0.18 });
  W.trampoline = { x: trampoline.x, y: trampoline.y + 0.44, z: trampoline.z, r: 1.48 };
  for (let i = 0; i < 6; i++) {
    const p = site(W, f - 14 + i * 4.8, i % 2 ? -4.55 : 4.75);
    surfaceBox(B, p.F, 0, 0.68, 0, 1.45, 0.11, 1.62, 0x996b43, 'PICNIC TABLE');
    for (const x of [-0.87, 0.87]) surfaceBox(B, p.F, x, 0.41, 0, 0.34, 0.08, 1.62, 0x996b43, 'PICNIC BENCH');
    for (const x of [-0.5, 0.5]) for (const z of [-0.59, 0.59]) bx(B, p.F, 0.12, 0.63, 0.12, x, 0.31, z, 0x556045);
    cy(B, p.F, 0.055, 2.4, 0, 1.2, 0, 0x6c756b);
    B.add(GEO.cone12, FM(p.F, 0, 2.44, 0, 0, 0, 0, 1.55, 0.52, 1.55), i % 2 ? 0xabb46e : 0xe3bf75);
  }
}

function santaModel() {
  const B = new Batch();
  B.add(GEO.sph, M(0, -0.19, 0, 0, 0, 0, 0.66, 0.73, 0.48), 0xc52f39);
  B.add(GEO.sph, M(0, 0.52, 0, 0, 0, 0, 0.38, 0.34, 0.36), 0xebbf9c);
  B.add(GEO.sph, M(0, 0.40, 0.22, 0, 0, 0, 0.36, 0.24, 0.24), 0xf6efe0);
  B.add(GEO.cone12, M(0.04, 0.93, 0, 0, 0, -0.22, 0.4, 0.56, 0.4), 0xc62c38);
  B.add(GEO.sph, M(0.14, 1.22, 0, 0, 0, 0, 0.125, 0.125, 0.125), 0xf5f0e5);
  for (const side of [-1, 1]) {
    B.add(GEO.sph, M(side * 0.53, -0.1, 0.06, 0, 0, side * 0.58, 0.22, 0.47, 0.23), 0xcb3843);
    B.add(GEO.sph, M(side * 0.29, -1.02, 0.12, 0, 0, 0, 0.25, 0.20, 0.34), 0x302d33);
    B.add(GEO.sph, M(side * 0.14, 0.59, 0.325, 0, 0, 0, 0.035, 0.047, 0.022), 0x292631);
  }
  cy(B, null, 0.61, 0.13, 0, -0.35, 0, 0x312d32, 12, 0, 0, 0, 0.5);
  bx(B, null, 0.18, 0.16, 0.05, 0, -0.35, 0.49, 0xf2c251);
  return B.mesh(mats().lam);
}
function grotto(scene, W) {
  const s = W.marks[23] + 6, B = sb('grotto', 'lam'), deer = new Batch();
  parkSign(scene, W.P(s - 4, -2.85), ['CHRISTMAS GROTTO', 'MIND THE SLEIGH'], 2.6, '#772c35');
  for (let i = 0; i < 4; i++) {
    const p = site(W, s + i * 4.75, i % 2 ? -3.65 : 4);
    B.add(GEO.ico, FM(p.F, 0, 0.73, 0, 0, 0, 0, 0.36, 0.36, 0.67), 0xa38152);
    seg(B, p.F, [0, 0.79, -0.36], [0, 1.32, -0.65], 0.115, 0xbc9963);
    B.add(GEO.ico, FM(p.F, 0, 1.35, -0.77, 0, 0, 0, 0.19, 0.19, 0.29), 0xbc9963);
    for (const a of [-1, 1]) {
      for (const z of [-0.39, 0.39]) seg(B, p.F, [a * 0.19, 0.70, z], [a * 0.22, 0.08, z + 0.08], 0.05, 0x806544);
      seg(B, p.F, [a * 0.12, 1.41, -0.71], [a * 0.29, 1.77, -0.57], 0.033, 0x8f7250);
      seg(B, p.F, [a * 0.22, 1.63, -0.62], [a * 0.31, 1.68, -0.84], 0.023, 0x8f7250);
    }
    deer.add(GEO.ico, FM(p.F, 0, 1.32, -1, 0, 0, 0, 0.105, 0.085, 0.09), 0xf65154);
    for (let n = 0; n < 6; n++) deer.add(GEO.ico, FM(p.F, Math.cos(n) * 0.24, 0.95 + Math.sin(n) * 0.07, -0.22 + n * 0.08, 0, 0, 0, 0.055, 0.055, 0.055), [0xffe989, 0x95edaf, 0xff9ab0][n % 3]);
    const pY = p.y + 0.61;
    staticBox(p.x, pY, p.z, 0.32, 0.35, 0.60, -p.th, { kind: 'wall', name: 'REINDEER DISPLAY' });
  }
  scene.add(deer.mesh(new T.MeshBasicMaterial({ vertexColors: true }), [false, false]));
  const p = W.P(s + 10, 1.32, 1.23);
  W.dyn.push({ type: 'santa', ...p, yaw: -p.th, mesh: santaModel() });
  const sleigh = W.P(s + 18, -0.48);
  addRamp(scene, sleigh, sleigh.th, 1.75, 3.8, 0.77, 'wood', 'SANTA’S SLEIGH', 29);
  const sf = site(W, s + 18, -0.48).F;
  for (const x of [-0.87, 0.87]) {
    bx(B, sf, 0.14, 0.59, 2.1, x, 0.35, -0.79, 0xb23338);
    seg(B, sf, [x, 0.12, 1.75], [x, 0.12, -1.50], 0.087, 0xe3b653, 8);
    seg(B, sf, [x, 0.12, -1.50], [x, 0.38, -1.84], 0.087, 0xe3b653, 8);
  }
  pickup(W, 'mincePie', s + 17.5, -0.45, 1.11);
}

function cafe(scene, W) {
  const s = W.total - 12, center = site(W, s, 0), L = sb('cafe', 'lam'), brick = sb('cafe', 'brickY');
  const back = site(W, W.total - 1, 0);
  solidBox(brick, back.F, 0, 2.1, -3.6, 14, 4.2, 6.4, 0xcabaa0, 'GARDEN CAFÉ');
  bx(L, back.F, 14.35, 0.28, 6.7, 0, 4.35, -3.6, 0x2f694b);
  for (const x of [-4.8, -2.3, 2.3, 4.8]) bx(L, back.F, 1.78, 1.75, 0.07, x, 1.97, -0.35, 0x535f62);
  for (const x of [-0.53, 0.53]) bx(L, back.F, 1.02, 2.42, 0.11, x, 1.22, -0.32, 0x55645d);
  const label = fascia('CAFÉ & TILLS', { w: 512, h: 72, size: 48, bg: '#2a6043', fg: '#f0e2b4' });
  const mesh = new T.Mesh(new T.PlaneGeometry(8.3, 0.96), new T.MeshBasicMaterial({ map: label }));
  mesh.position.copy(new T.Vector3(0, 3.62, -0.29).applyMatrix4(back.F)); mesh.rotation.y = -back.th; scene.add(mesh);
  for (const x of [-1.65, 1.65]) for (const z of [-2.16, 2.16]) solidBox(L, center.F, x, 1.15, z, 0.12, 2.3, 0.12, 0x4b6252, 'RETURN BAY POST');
  solidBox(L, center.F, 0, 2.39, 0, 3.55, 0.14, 4.65, 0x397954, 'RETURN BAY ROOF');
  bx(sb('cafe', 'mark'), center.F, 3.05, 0.012, 4.55, 0, 0.018, 0, 0xc9bc58);
  parkSign(scene, W.P(s - 7, -3.5), ['TROLLEY RETURN', 'CAFÉ & TILLS'], 2.5);
  W.finishes = [{ x: center.x, y: center.y, z: center.z, hx: 1.39, hz: 2.1 }];
}

function terraceSteps(W) {
  const B = sb('terrace-steps', 'lam');
  for (const index of [2, 7, 11, 22]) {
    const begin = W.marks[index], end = W.marks[index + 1];
    for (let i = 0; i < 8; i++) {
      const s = lerp(begin + 2, end - 2, (i + 0.5) / 8);
      const p = site(W, s, index === 11 ? 4.15 : -4.15);
      const tread = (end - begin - 4) / 8 + 0.06;
      surfaceBox(B, p.F, 0, 0.015, 0, 1.49, 0.13, tread, 0xb2a795, 'TERRACE TREAD');
      bx(B, p.F, 1.49, 0.015, 0.055, 0, 0.087, -tread / 2 + 0.06, 0xe5dbb9);
    }
  }
}

function wayfinding(scene, W) {
  for (let s = 41; s < W.total - 24; s += 13) {
    const paint = sb('garden-way' + Math.floor(s / 60), 'mark');
    const at = (ahead, d) => xyz(W.P(s + ahead, d, 0.012));
    for (const side of [-1, 1]) {
      const points = [at(-0.43, side * 0.33), at(-0.2, side * 0.33), at(0.37, 0), at(0.14, 0)];
      if (side < 0) points.reverse();
      paint.quad(...points, 0xeee6c8);
    }
  }
  const vista = W.P(W.marks[16] + 4.5, -3.6);
  parkSign(scene, vista, ['CAFÉ & TILLS', 'FOLLOW THE PATH'], 2.22);
}

function gardenBackdrop(scene, W) {
  const B = new Batch(), r = rng(168);
  for (let x = -170; x <= 210; x += 34) for (let z = -257; z <= 82; z += 33) {
    if (x > -45 && x < 153 && z > -224 && z < 51) continue;
    const y = 1 + r() * 8;
    B.add(GEO.ico1, M(x, y - 4, z, 0, r() * TAU, 0, 29 + r() * 20, y + r() * 10, 31 + r() * 14), pick(r, [0x82a373, 0x728d69, 0x9ab178]));
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = r() * 19;
      B.add(GEO.ico, M(x + Math.cos(a) * d, y + 6 + r() * 4, z + Math.sin(a) * d, 0, a, 0, 2.5, 4.5 + r() * 2, 2.8), 0x678757);
    }
  }
  const background = B.mesh(mats().lam, [false, false]); background.userData.background = true; scene.add(background);
  const field = sb('garden-ground', 'grass');
  field.quad([-200, -1.6, 85], [210, -1.6, 85], [210, -1.6, -264], [-200, -1.6, -264], 0xa9b78a, [0, 0, 48, 48]);
  staticBox(5, -1.71, -89.5, 205, 0.10, 174.5, 0, collider('HILLSIDE'));
  const rows = [], step = 4, dirt = sb('garden-earth', 'grass');
  for (let z = 56; z >= -224; z -= step) {
    const row = [];
    for (let x = -48; x <= 148; x += step) row.push([x, earthHeight(W, x, z), z]);
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < rows[i].length - 1; j++) {
    const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
    dirt.quad(a, b, c, d, 0x8eac68, [a[0] / 5, a[2] / 5, c[0] / 5, c[2] / 5]);
  }
  const geometry = dirt.geometry();
  staticMeshCol(geometry, collider('GARDEN HILLSIDE'), { friction: 0.75 }); geometry.dispose();
}

function updateGarden(W, dt, time) {
  const game = C.game, tr = C.trolley, p = tr.pos(), v = tr.vel(), active = game.state === 'run' || game.state === 'push';
  const pond = W.pond, dx = p.x - pond.x, dz = p.z - pond.z;
  if (active && !W.scattered && tr.nWheels > 0 && Math.abs(p.y - pond.water) < 1.22 && dx * dx + dz * dz < 7.2 ** 2) {
    W.scattered = true; W.scatterTime = time;
    for (const fish of W.fish) {
      const x = fish.mesh.position.x - p.x, z = fish.mesh.position.z - p.z;
      fish.escape = Math.atan2(z, x);
    }
    C.fx.pondSplash(pond.x, pond.z, 0.56); game.task('koi'); game.addCombo('KOI SCATTER', 350);
  }
  const scatter = W.scattered ? Math.min(1, (time - W.scatterTime) / 0.72) : 0;
  for (const fish of W.fish) {
    const a = W.scattered ? fish.escape : fish.phase + time * (0.60 - fish.ring * 0.30);
    const r = lerp(fish.ring, 0.93, scatter);
    fish.mesh.position.set(pond.x + Math.cos(a) * pond.rx * r, pond.water + (W.scattered ? -0.08 - 0.15 * scatter : 0.015), pond.z + Math.sin(a) * pond.rz * r);
    fish.mesh.rotation.y = W.scattered ? Math.atan2(-Math.cos(a), -Math.sin(a)) : -a;
  }
  if (!active) return;
  if (time >= W.fountainNext) {
    W.fountainNext = time + 0.095;
    for (const fountain of W.fountains) if ((fountain.x - p.x) ** 2 + (fountain.z - p.z) ** 2 < 40 ** 2) {
      C.fx.emit('fountain', fountain.x, fountain.y, fountain.z, fountain.vx, 3.35, fountain.vz, 4, 0.9);
    }
  }
  const jump = W.trampoline, stamp = game.run.flags;
  if (time >= (stamp.trampoline ?? 0) && v.y < 1.2 && p.y < jump.y + 0.59 * tr.s && p.y > jump.y - 0.07
    && (p.x - jump.x) ** 2 + (p.z - jump.z) ** 2 < jump.r ** 2 && tr.up > 0.45) {
    stamp.trampoline = time + 0.95;
    tr.body.setLinvel({ x: v.x, y: 7.75, z: v.z }, true);
    C.audio.sfx('hop'); game.task('bounce'); game.addCombo('TRAMPOLINE BOUNCE', 350, { trick: true });
  }
  let grinding = false;
  if (tr.nWheels && tr.up > 0.66) for (const rail of W.grinds) {
    const x = p.x - rail.x, z = p.z - rail.z, along = x * rail.fx + z * rail.fz, across = -x * rail.fz + z * rail.fx;
    const speed = v.x * rail.fx + v.z * rail.fz;
    if (Math.abs(along) > rail.half || Math.abs(across) > 0.44 || Math.abs(p.y - (rail.y + 0.5 * tr.s)) > 0.23 || Math.abs(speed) < 3) continue;
    const correction = clamp(-across * 5, -1.5, 1.5), steer = Math.min(1, dt * 5);
    tr.body.setLinvel({ x: lerp(v.x, speed * rail.fx - correction * rail.fz, steer), y: v.y, z: lerp(v.z, speed * rail.fz + correction * rail.fx, steer) }, true);
    game.liveCombo('plantBench', 'PLANT BENCH GRIND', 155, dt); grinding = true; break;
  }
  if (!grinding) game.endLive('plantBench');
}

export function buildGarden(scene) {
  const W = C.world = { ...makeRoute(), dyn: [], peds: [], cars: [], wobblers: [], turbines: [],
    pickups: [], potholes: [], nearTargets: [], grinds: [], scattered: false, fountainNext: 0 };
  buildSky(scene, W);
  W.sky.material.uniforms.top.value.setHex(0x88afd3);
  W.sky.material.uniforms.hor.value.setHex(0xe5ebcd);
  const pondSite = W.P(W.marks[13] + 2.4, 5.6);
  W.pond = { x: pondSite.x, z: pondSite.z, rx: 3.45, rz: 4.8, water: pondSite.y - 0.06 };
  W.junctions = [{ start: W.P(W.marks[8], 0), end: W.P(W.marks[12], -2.65) },
    { start: W.P(W.marks[18] - 0.2, 0), end: W.P(W.marks[22] - 1, 0) }];
  path(W); gardenBackdrop(scene, W);
  terraceSteps(W);
  wayfinding(scene, W);
  carPark(scene, W); outdoor(scene, W); glasshouse(scene, W); waterFeatures(scene, W);
  gardenFurniture(scene, W); grotto(scene, W); cafe(scene, W);
  W.reset = () => {
    W.scattered = false; W.fountainNext = 0;
    for (const fish of W.fish) {
      fish.mesh.position.set(W.pond.x + Math.cos(fish.phase) * W.pond.rx * fish.ring, W.pond.water + 0.015,
        W.pond.z + Math.sin(fish.phase) * W.pond.rz * fish.ring);
    }
  };
  W.update = (dt, time) => updateGarden(W, dt, time);
}
