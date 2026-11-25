import { C } from './core.js';
import { Batch, cy } from './util.js';
import { mats, staticCyl, staticMeshCol } from './terrain.js';

const T = C.T;

const MATSIGN = new WeakMap();
function signMat(tex) { if (!MATSIGN.has(tex)) MATSIGN.set(tex, new T.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.1 })); return MATSIGN.get(tex); }
const backing = new T.MeshLambertMaterial({ color: 0x8a8d92 });
// a sign on a post: plate faces local -z (towards whoever approaches up the road), posts get a collider and can wobble
export function signPost(scene, x, y, z, yaw, tex, w, h, postH = 2.4, opts = {}) {
  const g = new T.Group(); g.name = opts.name || 'SIGN'; g.position.set(x, y, z); g.rotation.y = yaw; scene.add(g);
  const posts = opts.twin ? [-w * 0.35, w * 0.35] : [0];
  const pb = new Batch(); for (const px of posts) cy(pb, null, 0.04, postH, px, postH / 2, 0.03, opts.postCol || 0x8a8d92, 8);
  const pm = new T.Mesh(pb.geometry(), mats().lam); pm.castShadow = true; g.add(pm);
  const plate = new T.Mesh(new T.PlaneGeometry(w, h), signMat(tex)); plate.position.set(0, postH + h / 2 - (opts.sink || 0), 0); plate.rotation.y = Math.PI; g.add(plate);
  if (!opts.noBack) { const back = new T.Mesh(new T.PlaneGeometry(w * 0.98, h * 0.98), backing); back.position.set(0, postH + h / 2 - (opts.sink || 0), 0.012); g.add(back); }
  plate.castShadow = true;
  const { wobblers } = C.world;
  const wob = wobblers.length;
  wobblers.push({ obj: g, a: 0, v: 0 });
  for (const offset of posts) {
    staticCyl(x + Math.cos(yaw) * offset + Math.sin(yaw) * 0.03, y + postH / 2,
      z - Math.sin(yaw) * offset + Math.cos(yaw) * 0.03, 0.045, postH / 2,
      { kind: 'sign', name: opts.name || 'SIGN', wob });
  }
  return g;
}
// The mesh and collider share the ramp profile. The approach follows the grade before curving up to the lip.
export const rampPower = (length, height, lipDeg) => Math.max(1.05, Math.tan(lipDeg * Math.PI / 180) * length / height);
export function addRamp(scene, at, th, w, len, h, mat, name, lipDeg = 28, grade = 0) {
  const fx = Math.sin(th), fz = -Math.cos(th), rx = Math.cos(th), rz = Math.sin(th);
  const pw = rampPower(len, h, lipDeg), N = 14;
  const P3 = (u, v, y) => {
    const along = v - len / 2;
    return [at.x + rx * u + fx * along, at.y + y + grade * along, at.z + rz * u + fz * along];
  };
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
