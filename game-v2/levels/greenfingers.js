const light = { sun: 0.92, sunC: 0xffe4b3, hemi: 0.78, sky: 0xe1eed7, gnd: 0x667c48, fog: 0xd7e5c7, near: 100, far: 520 };

export const greenFingers = {
  id: 'greenfingers', name: 'Green Fingers Garden Centre', shop: 'Green Fingers', reward: 'green', starter: 'flatbed',
  requires: { level: 'grumbleton', goals: 4 },
  preview: 'game-v2/greenfingers.webp?v=garden-aisle', previewAlt: 'The paved aisle through the Green Fingers outdoor plant displays',
  shopping: ['seed', 'potPlant', 'gnome', 'fishFood', 'mincePie'],
  goals: [
    { id: 'list', label: 'Complete the shopping list', short: 'SHOPPING LIST', pts: 1000 },
    { id: 'pots', label: 'Smash 6 terracotta pots', short: '6 POTS', n: 6, pts: 500 },
    { id: 'glass', label: 'Break 4 glass panes', short: '4 PANES', n: 4, pts: 700 },
    { id: 'koi', label: 'Scatter the koi', short: 'KOI SCATTERED', pts: 550 },
    { id: 'bounce', label: 'Bounce off the trampoline', short: 'TRAMPOLINE', pts: 700 },
    { id: 'return', label: 'Return the trolley at the café', short: 'TROLLEY RETURNED', pts: 5000 },
  ],
  light,
  ambience: 'garden',
  previewStops(W) {
    const start = W.start;
    return ['flatbed', 'dave', 'demon', 'tank', 'green', 'pensioner'].map((key, i) => {
      const x = start.x - 2.5 + i * 1.15, z = start.z - 2 - i * 0.35, y = W.groundY(x, z);
      return { key, area: 'garden', light, at: { x, y, z }, yaw: 2.42,
        cam: { x: x + 2.25, y: y + 1.2, z: z - 3.4 }, look: { x: x - 0.28, y: y + 0.36, z: z + 0.55 } };
    });
  },
  async load() {
    const { buildGarden } = await import('./garden.js?v=garden-aisle');
    return { build: buildGarden };
  },
};
