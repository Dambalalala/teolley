const LIGHT = {
  neutral: { sun: 0.78, sunC: 0xfff0d8, hemi: 0.72, sky: 0xd8e6f4, gnd: 0x7a8a5a, fog: 0xd5dee6, near: 140, far: 900 },
  bright: { sun: 0.86, sunC: 0xfff3e0, hemi: 0.76, sky: 0xdce8f4, gnd: 0x7f8a60, fog: 0xd9e1e8, near: 150, far: 950 },
  soft: { sun: 0.74, sunC: 0xfff4e2, hemi: 0.78, sky: 0xdae6ee, gnd: 0x7a9a5a, fog: 0xd2dde2, near: 120, far: 800 },
  damp: { sun: 0.6, sunC: 0xe6eefc, hemi: 0.8, sky: 0xd0dbe8, gnd: 0x66765a, fog: 0xc9d3dc, near: 80, far: 560 },
};
function stops(W) {
  const B = (lx, lf, h = 0) => { const p = W.botToWorld(lx, lf); return { x: p.x, y: W.groundY(p.x, p.z) + h, z: p.z }; };
  const top = (x, z, h = 0) => ({ x, y: W.groundY(x, z) + h, z });
  return [
    { key: 'dave', area: 'top', amb: 'muzak', light: LIGHT.neutral, at: top(-8.4, 27.2), yaw: 2.35, cam: top(-5.5, 24.3, 1.25), look: top(-9.2, 28.2, 0.42) },
    { key: 'demon', area: 'bot', amb: 'carpark', light: LIGHT.bright, at: B(-2, 92), yaw: 2.6, cam: B(1.4, 88.9, 1.2), look: B(-2.8, 93.0, 0.4) },
    { key: 'tank', area: 'bot', amb: 'carpark', light: LIGHT.neutral, at: B(24, 100), yaw: -2.3, cam: B(28, 96.5, 1.35), look: B(23, 101, 0.45) },
    { key: 'green', area: 'bot', amb: 'pond', light: LIGHT.soft, at: B(-16.5, 45), yaw: 0.8, cam: B(-21, 40.5, 1.25), look: B(-15.6, 46, 0.45) },
    { key: 'pensioner', area: 'bot', amb: 'pond', light: LIGHT.damp, at: B(-12.6, 33.0), yaw: 1.2, cam: B(-16.7, 29.7, 1.2), look: B(-11.7, 34.0, 0.32) },
  ];
}
export const grumbleton = {
  id: 'grumbleton', name: 'Grumbleton', shop: 'Spendwells', reward: 'demon',
  preview: 'game-v2/grumbleton.webp', previewAlt: 'Grumbleton’s terraced houses and downhill street',
  shopping: ['pineapple', 'sausage', 'milk', 'tampons', 'loo'],
  goals: [
    { id: 'list', label: 'Complete the shopping list', short: 'SHOPPING LIST', pts: 1000 },
    { id: 'cones', label: 'Knock over 10 traffic cones', short: '10 CONES', n: 10, pts: 500 },
    { id: 'camera', label: 'Trip the speed camera (over 30 mph)', short: 'SPEED CAMERA', pts: 500 },
    { id: 'lollipop', label: 'Hit the lollipop lady', short: 'LOLLIPOP LADY', pts: 700 },
    { id: 'return', label: 'Return the trolley at Harrisons', short: 'TROLLEY RETURNED', pts: 5000 },
  ],
  light: LIGHT.neutral,
  previewStops: stops,
  async load() {
    const [world, scenery, extras] = await Promise.all([
      import('../world.js?v=green-fingers'), import('../scenery.js?v=green-fingers'), import('../extras.js?v=green-fingers'),
    ]);
    return {
      build(scene) {
        world.buildWorldBase(scene);
        scenery.buildScenery(scene);
        extras.buildExtras();
      },
      release: world.releaseWorld,
    };
  },
};
