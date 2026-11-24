// Shared game context. Every module reads live objects from C at run time.
export const C = {
  T: window.THREE,
  RAPIER: null,
  phys: null,        // Rapier world
  events: null,      // Rapier event queue
  scene: null, camera: null, renderer: null,
  world: null, trolley: null, props: null, game: null, audio: null, hud: null, fx: null,
  input: null,
  colInfo: new Map(), // collider handle -> {kind, ...}
  time: 0,           // simulated seconds
  touch: false,
};

// Collision group bits (Rapier interaction groups: membership << 16 | filter)
export const G = { GROUND: 0x1, PROP: 0x2, TROLLEY: 0x4, ITEM: 0x8, DEBRIS: 0x10, PED: 0x20, WATER: 0x40 };
export const ig = (member, filter) => (((member & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
export const ALL = 0xffff;
