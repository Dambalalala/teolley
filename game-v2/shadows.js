import { C, G, ig } from './core.js';
import { clamp } from './util.js';
import { ctex } from './textures.js?v=grumbleton-audit';

const T = C.T;

export function makeContactShadow(scene) {
  const map = ctex(64, 64, (g, w, h) => {
    const r = w / 2;
    const shade = g.createRadialGradient(r, r, 0, r, r, r);
    shade.addColorStop(0, 'rgba(18,17,17,.48)');
    shade.addColorStop(0.43, 'rgba(18,17,17,.32)');
    shade.addColorStop(1, 'rgba(18,17,17,0)');
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
  }, { clamp: true });
  const geometry = new T.PlaneGeometry(1.9, 2.7);
  geometry.rotateX(-Math.PI / 2);
  const material = new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const shadow = new T.Mesh(geometry, material);
  shadow.visible = false;
  scene.add(shadow);

  const ray = new C.RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const groups = ig(G.TROLLEY, G.GROUND);
  const up = new T.Vector3(0, 1, 0), normal = new T.Vector3(), forward = new T.Vector3(), rotation = new T.Quaternion();
  return (root, selecting, submerged) => {
    shadow.visible = false;
    if (!root.visible || submerged) return;

    const p = root.position;
    ray.origin.x = p.x - 0.23;
    ray.origin.y = p.y + 0.3;
    ray.origin.z = p.z - 0.15;
    const hit = selecting ? null : C.phys.castRayAndGetNormal(ray, 5, true, undefined, groups);
    const ground = hit ? ray.origin.y - hit.timeOfImpact : C.world.groundY(ray.origin.x, ray.origin.z);
    const height = p.y - ground;
    if (height < -0.2 || height > 4 || (hit && hit.normal.y < 0.65)) return;

    forward.set(0, 0, 1).applyQuaternion(root.quaternion);
    normal.set(0, 1, 0);
    if (hit) normal.copy(hit.normal).normalize();
    rotation.setFromAxisAngle(up, Math.atan2(forward.x, forward.z));
    shadow.quaternion.setFromUnitVectors(up, normal).multiply(rotation);
    shadow.position.set(ray.origin.x, ground + 0.056, ray.origin.z);
    shadow.scale.setScalar(1 + Math.max(0, height - 0.5) * 0.19);
    material.opacity = clamp((4 - height) / 3.5, 0, 1);
    shadow.visible = true;
  };
}
