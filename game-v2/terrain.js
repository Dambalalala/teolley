import { C, G, ig, ALL } from './core.js';
import { Batch, clamp, rng, M, GEO, TAU } from './util.js';
import { TX } from './textures.js?v=green-fingers';

const T = C.T;

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
export function finishCol(desc, info, opts = {}) {
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

export function buildSky(scene, world) {
  const sky = new T.Mesh(new T.SphereGeometry(3000, 24, 12), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new T.Color(0x6f9fd6) }, hor: { value: new T.Color(0xdfe6ea) } },
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 top,hor;varying vec3 vP;void main(){float h=clamp(vP.y,0.0,1.0);gl_FragColor=vec4(mix(hor,top,pow(h,0.55)),1.0);}',
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky); world.sky = sky;
  const r = rng(4), B = new Batch();
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, d = 700 + r() * 1300, x = Math.cos(a) * d, z = -380 + Math.sin(a) * d, y = 260 + r() * 220;
    for (let k = 0; k < 4; k++) B.add(GEO.ico1, M(x + (k - 1.5) * 38 + r() * 20, y + r() * 12, z + r() * 30, 0, r() * 3, 0, 46 + r() * 30, 18 + r() * 10, 34 + r() * 20), 0xffffff);
  }
  const clouds = new T.Mesh(B.geometry(), new T.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.92 }));
  clouds.renderOrder = -9; scene.add(clouds); world.clouds = clouds;
}
