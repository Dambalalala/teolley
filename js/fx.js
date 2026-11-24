import { C } from './core.js';
const T = C.T;

// Point-sprite particles: sparks, dust, splashes, glass and rubbish.
const VS = 'attribute float aSize;attribute float aAlpha;attribute vec3 aCol;uniform float uScale;varying float vA;varying vec3 vC;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uScale/max(0.1,-mv.z),1.0,300.0);vA=aAlpha;vC=aCol;}';
const FS = 'uniform float uSoft;varying float vA;varying vec3 vC;void main(){vec2 c=gl_PointCoord-0.5;float d=length(c);float a=uSoft>0.5?smoothstep(0.5,0.0,d):step(d,0.5);if(a<0.01)discard;gl_FragColor=vec4(vC,vA*a);}';
function system(max, additive, soft) {
  const g = new T.BufferGeometry(), A = (n, k) => { const a = new T.BufferAttribute(new Float32Array(n * k), k); a.setUsage(T.DynamicDrawUsage); return a; };
  g.setAttribute('position', A(max, 3)); g.setAttribute('aCol', A(max, 3)); g.setAttribute('aSize', A(max, 1)); g.setAttribute('aAlpha', A(max, 1)); g.setDrawRange(0, 0);
  const mat = new T.ShaderMaterial({ uniforms: { uScale: { value: 600 }, uSoft: { value: soft ? 1 : 0 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending });
  const pts = new T.Points(g, mat); pts.frustumCulled = false; C.scene.add(pts);
  return { g, mat, max, n: 0, pos: g.attributes.position.array, col: g.attributes.aCol.array, size: g.attributes.aSize.array, alpha: g.attributes.aAlpha.array, vel: new Float32Array(max * 3), life: new Float32Array(max), ml: new Float32Array(max), grav: new Float32Array(max), grow: new Float32Array(max), a0: new Float32Array(max), drag: new Float32Array(max) };
}
const KINDS = {
  spark: { sys: 'add', col: [1, 0.7, 0.3], size: 0.06, life: 0.35, grav: 1, grow: 0, a: 1, drag: 1, spread: 1 },
  dust: { sys: 'soft', col: [0.72, 0.7, 0.66], size: 0.5, life: 1.2, grav: -0.05, grow: 1.2, a: 0.45, drag: 2.5, spread: 0.4 },
  splash: { sys: 'soft', col: [0.85, 0.93, 0.97], size: 0.25, life: 0.9, grav: 1, grow: 0.3, a: 0.85, drag: 0.4, spread: 1 },
  foam: { sys: 'soft', col: [0.96, 0.94, 0.88], size: 0.16, life: 0.6, grav: 0.4, grow: 0.5, a: 0.9, drag: 0.8, spread: 0.6 },
  glass: { sys: 'add', col: [0.7, 0.85, 0.95], size: 0.07, life: 0.8, grav: 1, grow: 0, a: 0.9, drag: 0.2, spread: 1 },
  rubbish: { sys: 'hard', col: null, size: 0.09, life: 1.6, grav: 1, grow: 0, a: 1, drag: 0.3, spread: 1 },
  confetti: { sys: 'hard', col: null, size: 0.07, life: 2.0, grav: 0.25, grow: 0, a: 1, drag: 1.4, spread: 1 },
  feather: { sys: 'hard', col: [0.95, 0.95, 0.92], size: 0.06, life: 2.2, grav: 0.08, grow: 0, a: 1, drag: 1.6, spread: 1 },
};
const RUB = [[0.9, 0.9, 0.88], [0.85, 0.2, 0.2], [0.2, 0.45, 0.8], [0.95, 0.8, 0.2], [0.3, 0.6, 0.3], [0.6, 0.45, 0.3]];
export class FX {
  constructor() { this.S = { soft: system(1400, false, true), add: system(500, true, true), hard: system(600, false, false) }; }
  emit(kind, x, y, z, vx, vy, vz, n = 1, spd = 1) {
    const K = KINDS[kind]; if (!K) return; const S = this.S[K.sys];
    for (let k = 0; k < n; k++) {
      if (S.n >= S.max) return; const i = S.n++, i3 = i * 3;
      S.pos[i3] = x; S.pos[i3 + 1] = y; S.pos[i3 + 2] = z;
      const sp = spd * K.spread; S.vel[i3] = vx + (Math.random() - 0.5) * 2 * sp; S.vel[i3 + 1] = vy + Math.random() * sp; S.vel[i3 + 2] = vz + (Math.random() - 0.5) * 2 * sp;
      const c = K.col || RUB[Math.floor(Math.random() * RUB.length)], j = 0.9 + Math.random() * 0.2;
      S.col[i3] = c[0] * j; S.col[i3 + 1] = c[1] * j; S.col[i3 + 2] = c[2] * j;
      S.size[i] = K.size * (0.7 + Math.random() * 0.6); S.life[i] = S.ml[i] = K.life * (0.7 + Math.random() * 0.6); S.grav[i] = K.grav; S.grow[i] = K.grow; S.a0[i] = K.a; S.alpha[i] = K.a; S.drag[i] = K.drag;
    }
  }
  update(dt) {
    for (const S of Object.values(this.S)) {
      for (let i = 0; i < S.n; i++) {
        S.life[i] -= dt;
        if (S.life[i] <= 0) { const j = --S.n; if (i !== j) { const i3 = i * 3, j3 = j * 3; for (let k = 0; k < 3; k++) { S.pos[i3 + k] = S.pos[j3 + k]; S.vel[i3 + k] = S.vel[j3 + k]; S.col[i3 + k] = S.col[j3 + k]; } S.size[i] = S.size[j]; S.life[i] = S.life[j]; S.ml[i] = S.ml[j]; S.grav[i] = S.grav[j]; S.grow[i] = S.grow[j]; S.a0[i] = S.a0[j]; S.drag[i] = S.drag[j]; } i--; continue; }
        const i3 = i * 3, d = Math.exp(-S.drag[i] * dt);
        S.vel[i3 + 1] -= 9.81 * S.grav[i] * dt; S.vel[i3] *= d; S.vel[i3 + 1] *= d; S.vel[i3 + 2] *= d;
        S.pos[i3] += S.vel[i3] * dt; S.pos[i3 + 1] += S.vel[i3 + 1] * dt; S.pos[i3 + 2] += S.vel[i3 + 2] * dt;
        S.size[i] += S.grow[i] * dt; const f = S.life[i] / S.ml[i]; S.alpha[i] = S.a0[i] * Math.min(1, f * 2.5);
      }
      S.g.setDrawRange(0, S.n); for (const k of ['position', 'aCol', 'aSize', 'aAlpha']) S.g.attributes[k].needsUpdate = true;
    }
  }
  setScale(s) { for (const S of Object.values(this.S)) S.mat.uniforms.uScale.value = s; }
  clear() { for (const S of Object.values(this.S)) { S.n = 0; S.g.setDrawRange(0, 0); } }
}
