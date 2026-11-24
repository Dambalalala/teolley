import { C } from './core.js';
const T = C.T;

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export function rng(seed) { let a = seed | 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
export const fmt = n => Math.round(n).toLocaleString('en-GB');
export const col = h => (h && h.isColor) ? h : new T.Color(h);

// ---------- matrices ----------
const _m = new T.Matrix4(), _m2 = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _p = new T.Vector3(), _s = new T.Vector3();
// local transform (returns a shared matrix; consume immediately)
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); return _m.compose(_p, _q, _s);
}
// frame = position + yaw (+ optional pitch) as its own matrix
export function frame(x, y, z, ry = 0, rx = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(1, 1, 1); return new T.Matrix4().compose(_p.clone(), _q.clone(), _s.clone()); }
// parent * local
export function FM(F, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { M(x, y, z, rx, ry, rz, sx, sy, sz); if (!F) return _m; return _m2.multiplyMatrices(F, _m); }

// ---------- shared unit geometries ----------
export const GEO = {
  box: new T.BoxGeometry(1, 1, 1),
  cyl6: new T.CylinderGeometry(1, 1, 1, 6),
  cyl8: new T.CylinderGeometry(1, 1, 1, 8),
  cyl12: new T.CylinderGeometry(1, 1, 1, 12),
  cyl16: new T.CylinderGeometry(1, 1, 1, 16),
  cone8: new T.ConeGeometry(1, 1, 8),
  cone12: new T.ConeGeometry(1, 1, 12),
  ico: new T.IcosahedronGeometry(1, 0),
  ico1: new T.IcosahedronGeometry(1, 1),
  sph: new T.SphereGeometry(1, 10, 7),
  plane: new T.PlaneGeometry(1, 1),
  prism: (() => { // triangular roof prism: base 1 wide (x), 1 tall (y), 1 long (z); ridge at top centre
    const g = new T.BufferGeometry();
    const v = [
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, // front gable
      0.5, 0, 0.5, -0.5, 0, 0.5, 0, 1, 0.5,    // back gable
      -0.5, 0, 0.5, -0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5, // left slope
      0.5, 0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,   // right slope
    ];
    const uv = [0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
  })(),
  wedge: (() => { // ramp: 1 wide (x), rises from 0 at z=+0.5 to 1 at z=-0.5
    const g = new T.BufferGeometry();
    const P = [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]];
    const tri = (a, b, c) => [...P[a], ...P[b], ...P[c]];
    const v = [...tri(0, 1, 5), ...tri(0, 5, 4), ...tri(3, 4, 5), ...tri(3, 5, 2), ...tri(0, 4, 3), ...tri(1, 2, 5), ...tri(0, 3, 2), ...tri(0, 2, 1)];
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    const uv = []; for (let i = 0; i < v.length / 3; i++) uv.push(v[i * 3] + 0.5, v[i * 3 + 2] + 0.5);
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
  })(),
};

// ---------- geometry batch: merge many transformed parts into one mesh ----------
const _v = new T.Vector3(), _n = new T.Vector3(), _m3 = new T.Matrix3();
export class Batch {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.vc = 0; }
  get empty() { return this.vc === 0; }
  // geo: BufferGeometry, mat: Matrix4 (or null), color: hex/Color (or null keeps white), uvScale: [su,sv]
  add(geo, mat, color, uvScale) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, idx = geo.index;
    if (mat) _m3.getNormalMatrix(mat);
    const base = this.vc, c = color != null ? col(color) : null, ca = geo.attributes.color;
    const su = uvScale ? uvScale[0] : 1, sv = uvScale ? uvScale[1] : 1;
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k); if (mat) _v.applyMatrix4(mat); this.p.push(_v.x, _v.y, _v.z);
      if (nor) { _n.fromBufferAttribute(nor, k); if (mat) _n.applyMatrix3(_m3).normalize(); this.n.push(_n.x, _n.y, _n.z); } else this.n.push(0, 1, 0);
      if (c) this.c.push(c.r, c.g, c.b); else if (ca) this.c.push(ca.getX(k), ca.getY(k), ca.getZ(k)); else this.c.push(1, 1, 1);
      if (uv) this.u.push(uv.getX(k) * su, uv.getY(k) * sv); else this.u.push(0, 0);
    }
    if (idx) for (let k = 0; k < idx.count; k++) this.i.push(base + idx.getX(k));
    else for (let k = 0; k < pos.count; k++) this.i.push(base + k);
    this.vc += pos.count;
    return this;
  }
  // raw quad (4 points in order around the face), with uv rect and colour
  quad(a, b, c, d, color, uv) {
    const base = this.vc, cc = col(color == null ? 0xffffff : color);
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _n.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]); const nn = new T.Vector3().crossVectors(_v, _n).normalize();
    const U = uv || [0, 0, 1, 1];
    const uvs = [[U[0], U[1]], [U[2], U[1]], [U[2], U[3]], [U[0], U[3]]];
    [a, b, c, d].forEach((p, k) => { this.p.push(p[0], p[1], p[2]); this.n.push(nn.x, nn.y, nn.z); this.c.push(cc.r, cc.g, cc.b); this.u.push(uvs[k][0], uvs[k][1]); });
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vc += 4; return this;
  }
  geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.vc > 65000 ? new T.Uint32BufferAttribute(this.i, 1) : new T.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(material, shadows = [true, true]) {
    const m = new T.Mesh(this.geometry(), material); m.castShadow = shadows[0]; m.receiveShadow = shadows[1]; return m;
  }
}

// helpers that add common shapes to a batch in a parent frame F (Matrix4 or null)
export const bx = (B, F, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0, uvs) => B.add(GEO.box, FM(F, x, y, z, rx, ry, rz, w, h, d), color, uvs);
export const cy = (B, F, r, h, x, y, z, color, seg = 8, rx = 0, ry = 0, rz = 0, r2) => B.add(seg === 6 ? GEO.cyl6 : seg === 12 ? GEO.cyl12 : seg === 16 ? GEO.cyl16 : GEO.cyl8, FM(F, x, y, z, rx, ry, rz, r, h, r2 == null ? r : r2), color);
// a tube between two points (radius r)
const _a = new T.Vector3(), _b = new T.Vector3(), _d = new T.Vector3(), _up = new T.Vector3(0, 1, 0), _qq = new T.Quaternion(), _mm = new T.Matrix4();
export function seg(B, F, a, b, r, color, sides = 6) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]); _d.subVectors(_b, _a); const L = _d.length(); if (L < 1e-5) return;
  _qq.setFromUnitVectors(_up, _d.divideScalar(L)); _p.addVectors(_a, _b).multiplyScalar(0.5); _s.set(r, L, r);
  _mm.compose(_p, _qq, _s); if (F) _mm.premultiply(F);
  B.add(sides === 8 ? GEO.cyl8 : GEO.cyl6, _mm, color);
}

// simple flat material set (vertex coloured, gouraud lit for the PS2 look)
export function lam(opts = {}) { return new T.MeshLambertMaterial(Object.assign({ vertexColors: true }, opts)); }

// value noise for terrain/colour variation
export function vnoise(seed) {
  const r = rng(seed), P = new Uint8Array(512), G = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; G[i] = r() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const h = (x, y) => G[P[(P[x & 255] + y) & 511]];
  return (x, y) => { const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = h(X, Y), b = h(X + 1, Y), c = h(X, Y + 1), d = h(X + 1, Y + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
}

// Bakes static decorative objects (built from several meshes) into one mesh per material.
export class Baker {
  constructor() { this.groups = new Map(); }
  add(obj, area = 'top') {
    obj.updateMatrixWorld(true);
    obj.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry, names = ['position', 'normal', 'uv', 'color'].filter(n => g.attributes[n]);
      const key = [area, o.material.uuid, o.castShadow, o.receiveShadow, ...names].join('|');
      let e = this.groups.get(key); if (!e) { e = { mat: o.material, names, parts: [], cast: o.castShadow, recv: o.receiveShadow }; this.groups.set(key, e); }
      e.parts.push({ g, m: o.matrixWorld.clone() });
    });
  }
  flush(scene) {
    const T = window.THREE, v = new T.Vector3(), nm = new T.Matrix3();
    for (const e of this.groups.values()) {
      let nv = 0, ni = 0;
      for (const p of e.parts) { nv += p.g.attributes.position.count; ni += p.g.index?.count ?? p.g.attributes.position.count; }
      const out = {};
      for (const n of e.names) out[n] = new Float32Array(nv * e.parts[0].g.attributes[n].itemSize);
      const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let offset = 0, indexOffset = 0;
      for (const p of e.parts) {
        const g = p.g, cnt = g.attributes.position.count;
        nm.getNormalMatrix(p.m);
        for (const n of e.names) {
          const attr = g.attributes[n], size = attr.itemSize, dst = out[n];
          if (n === 'position' || n === 'normal') {
            for (let k = 0; k < cnt; k++) {
              v.fromBufferAttribute(attr, k);
              if (n === 'position') v.applyMatrix4(p.m);
              else v.applyMatrix3(nm).normalize();
              v.toArray(dst, (offset + k) * size);
            }
          } else dst.set(attr.array, offset * size);
        }
        const count = g.index?.count ?? cnt;
        for (let k = 0; k < count; k++) index[indexOffset++] = offset + (g.index ? g.index.getX(k) : k);
        offset += cnt;
      }
      const geo = new T.BufferGeometry();
      for (const n of e.names) geo.setAttribute(n, new T.BufferAttribute(out[n], e.parts[0].g.attributes[n].itemSize));
      geo.setIndex(new T.BufferAttribute(index, 1));
      geo.computeBoundingSphere();
      const m = new T.Mesh(geo, e.mat); m.castShadow = e.cast; m.receiveShadow = e.recv; m.matrixAutoUpdate = false; scene.add(m);
    }
    this.groups.clear();
  }
}
