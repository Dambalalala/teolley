import { C } from './core.js';
import { clamp, lerp, angDiff } from './util.js';
import { ITEMS, VARIANTS } from './models.js?v=stop-sign-splash';
import { Trolley } from './trolley.js?v=stop-sign-splash';

const SAVE_KEY = 'trolley-save-v1';
export const GRUMBLETON = { name: 'Grumbleton', unlock: 'demon' };
// the list each run starts with
export const SHOPPING_LIST = ['pineapple', 'gnome', 'milk', 'tampons', 'loo'];
export const LIST_NAMES = { pineapple: 'Pineapple', gnome: 'Garden gnome', milk: 'Milk', tampons: 'Tampons', loo: 'Loo roll' };
export const TASKS = [
  { id: 'list', label: 'Get everything on the list', short: 'SHOPPING LIST', pts: 1000 },
  { id: 'cones', label: 'Knock over 10 traffic cones', short: '10 CONES', n: 10, pts: 500 },
  { id: 'camera', label: 'Trip the speed camera (over 30 mph)', short: 'SPEED CAMERA', pts: 500 },
  { id: 'lollipop', label: 'Bump into the lollipop lady', short: 'LOLLIPOP LADY', pts: 700 },
  { id: 'return', label: 'Return the trolley at Harrisons', short: 'TROLLEY RETURNED', pts: 5000 },
];
const SPIN_NAMES = ['', '180', '360', '540', '720', '900', '1080'];
// the only messages the game prints, each at most once a run
const QUIPS = { lost: 'UNEXPECTED ITEM IN BAGGING AREA' };

export class Game {
  constructor() {
    this.state = 'loading'; this.paused = false;
    this.save = { best: 0, unlocked: { dave: true }, sel: 'dave', muted: false, runs: 0 };
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        const unlocked = this.save.unlocked;
        for (const key of Object.keys(VARIANTS)) if (saved.unlocked?.[key] === true) unlocked[key] = true;
        if (Object.hasOwn(unlocked, saved.sel)) this.save.sel = saved.sel;
        if (Number.isFinite(saved.best) && saved.best >= 0) this.save.best = saved.best;
        if (Number.isSafeInteger(saved.runs) && saved.runs >= 0) this.save.runs = saved.runs;
        this.save.muted = saved.muted === true;
      }
    } catch (e) { /* Storage may be unavailable in embedded browsers. */ }
    this.msgs = []; this.pops = []; this.shake = 0; this.flash = 0;
    this.roadPosition = {}; this.lastPos = {}; this.scrapePoint = {};
    this.onContactForce = this.onContactForce.bind(this);
    this.onCollision = this.onCollision.bind(this);
    this.resetRun();
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) {} }
  resetRun() {
    this.run = { got: {}, done: {}, cones: 0, score: 0, taskPts: 0, time: 0, dist: 0, maxSpeed: 0, maxMph: 0, items: {}, lost: 0, broken: 0, brokenBy: {}, peds: 0, nearMisses: 0, wheels: 0, bestCombo: 0, airMax: 0, tricks: 0, ducks: false, end: null, flags: {}, speedCam: false };
    this.combo = { list: [], base: 0, mult: 0, timer: 0, live: {} };
    this.collectTimes = []; this.chain = { n: 0, t: -9 }; this.lastHit = { t: -9, x: 0, z: 0 };
    this.near = new Map(); this.stillT = 0; this.tiltT = 0; this.wetT = 0; this.wetN = 0; this.overT = 0; this.trail = []; this.trailT = 0;
    this.air = null; this.twoT = 0; this.scrapeT = 0; this.hasLastPos = false; this.pushT = 0;
  }
  // ---------- messages ----------
  say(text, o = {}) { const m = { text, t: 0, dur: o.dur || 2.4, kind: o.kind || 'notice', big: o.big }; if (o.now) this.msgs.unshift(m); else this.msgs.push(m); if (this.msgs.length > 4) this.msgs.splice(1, 1); }
  quip(key, o) { const t = QUIPS[key] || key; if (this.run.flags['q_' + key] && !o?.again) return; this.run.flags['q_' + key] = true; this.say(t, o); }
  pop(text, o = {}) { this.pops.push({ text, t: 0, col: o.col || null, s: o.s || 1 }); if (this.pops.length > 2) this.pops.shift(); }
  // ---------- tasks ----------
  task(id) {
    const R = this.run; if (R.done[id] || !(this.state === 'run' || this.state === 'push' || (id === 'return' && this.state === 'over'))) return;
    const task = TASKS.find(t => t.id === id);
    R.done[id] = true;
    R.taskPts += task.pts;
    C.audio.sfx('kaching');
    this.say(task.short, { kind: 'cheer', dur: id === 'return' ? 3 : 2 });
  }
  listTick(k) {
    const R = this.run; if (!SHOPPING_LIST.includes(k) || R.got[k]) return; R.got[k] = true;
    if (SHOPPING_LIST.every(x => R.got[x])) this.task('list'); else C.audio.sfx('tick');
  }
  // ---------- combo ----------
  addCombo(name, pts, o = {}) {
    if (this.state !== 'run' && this.state !== 'push') return;
    const C2 = this.combo; let reps = 0; for (const e of C2.list) if (e.name === name) reps++;
    pts = Math.round(pts * Math.pow(0.6, reps));
    C2.list.push({ name, pts }); C2.base += pts; C2.mult += 1; C2.timer = o.hold || 3.0;
    if (o.trick) { this.pop(name, o); if (o.sound !== false) C.audio.sfx('trick'); }
  }
  countCombo(key, name, pts) { const C2 = this.combo; let e = C2.live[key]; if (!e) { e = C2.live[key] = { name, pts: 0 }; C2.list.push(e); C2.mult += 1; } e.name = name; e.pts += pts; C2.base += pts; C2.timer = Math.max(C2.timer, 3.0); }
  liveCombo(key, name, rate, dt) { const C2 = this.combo; let e = C2.live[key]; if (!e) { e = C2.live[key] = { name, pts: 0 }; C2.list.push(e); C2.mult += 1; } e.pts += rate * dt; C2.base += rate * dt; C2.timer = Math.max(C2.timer, 1.4); }
  endLive(key) { delete this.combo.live[key]; }
  bank(playSound = true) {
    const C2 = this.combo; if (!C2.list.length) return; const tot = Math.round(C2.base * C2.mult);
    this.run.score += tot; this.run.bestCombo = Math.max(this.run.bestCombo, tot); this.run.tricks += C2.list.length;
    this.bankPop = { v: tot, mult: C2.mult, t: 0 };
    if (playSound) C.audio.sfx('kaching');
    this.combo = { list: [], base: 0, mult: 0, timer: 0, live: {} };
  }
  loseCombo() { const C2 = this.combo; if (C2.list.length) { this.lostPop = { v: Math.round(C2.base * C2.mult), t: 0 }; C.audio.sfx('sting'); } this.combo = { list: [], base: 0, mult: 0, timer: 0, live: {} }; }
  // ---------- events from the world ----------
  ev(type, d) {
    const R = this.run, active = this.state === 'run' || this.state === 'push';
    switch (type) {
      case 'collect': {
        const I = ITEMS[d.k]; R.items[d.k] = (R.items[d.k] || 0) + 1;
        C.audio.sfx(I.bargain ? 'beep2' : 'beep');
        this.addCombo(I.name, I.pts); if (active) this.listTick(d.k);
        const t = C.time; this.collectTimes = this.collectTimes.filter(x => t - x < 4.5); this.collectTimes.push(t);
        if (this.collectTimes.length >= 3) this.countCombo('spree', 'SHOPPING ×' + this.collectTimes.length, 150);
        break;
      }
      case 'lost': if (active) { R.lost++; this.quip('lost'); C.audio.sfx('item'); } break;
      case 'recollect': this.addCombo(ITEMS[d.k].name + ' AGAIN', 40); C.audio.sfx('beep'); break;
      case 'kerb': C.audio.sfx('kerb', clamp(d.v / 8, 0.3, 1.2)); if (d.v > 5.5 && active) this.addCombo('KERB', 80); this.shake = Math.max(this.shake, Math.min(0.5, d.v * 0.04)); break;
      case 'hop': C.audio.sfx('hop'); break;
      case 'push': C.audio.sfx('push'); break;
      case 'wheelLost': R.wheels++; C.audio.sfx('wheel'); this.addCombo('LOST A WHEEL', 300); break;
      case 'nearMiss': R.nearMisses++; this.addCombo('NEAR MISS', d.pts || 200); break;
      case 'ducks': R.ducks = true; this.addCombo('DUCKS', 500); break;
    }
  }
  // Rapier contact events (called after each physics step)
  processEvents() {
    C.events.drainContactForceEvents(this.onContactForce);
    C.events.drainCollisionEvents(this.onCollision);
  }
  onContactForce(e) {
    const h1 = e.collider1(), h2 = e.collider2(), i1 = C.colInfo.get(h1), i2 = C.colInfo.get(h2);
    if (!i1 || !i2) return;
    let mine = null, other = null, mh = 0, oh = 0;
    if (i1.kind === 'trolley') { mine = i1; other = i2; mh = h1; oh = h2; } else if (i2.kind === 'trolley') { mine = i2; other = i1; mh = h2; oh = h1; }
    if (!mine) { if (i1.kind === 'item' || i2.kind === 'item') { const f = e.totalForceMagnitude(); if (f > 60 && Math.random() < 0.3) C.audio.sfx('item', clamp(f / 400, 0.2, 1)); } return; }
    this.trolleyImpact(mine, other, e.totalForceMagnitude(), mh, oh);
  }
  onCollision(h1, h2, started) {
    if (!started) return;
    const i1 = C.colInfo.get(h1), i2 = C.colInfo.get(h2); if (!i1 || !i2) return;
    const tv = C.trolley.vel(), ts = Math.hypot(tv.x, tv.y, tv.z);
    const pair = (a, b) => (i1.kind === a && i2.kind === b) ? [i1, i2] : (i2.kind === a && i1.kind === b) ? [i2, i1] : null;
    let pp;
    if ((pp = pair('trolley', 'prop'))) { const p = pp[1].prop; if (ts > 1.2 && C.props.knock(p, 'trolley', ts)) this.broke(p, ts); else if (ts > 1.2) this.sfxFor(p.type, ts); }
    else if ((pp = pair('trolley', 'ped'))) { const pd = pp[1].ped; if (ts > 1.6 && C.props.hitPed(pd, tv)) { this.run.peds++; this.addCombo('LOLLIPOP LADY', 700); this.task('lollipop'); } }
    else if ((pp = pair('prop', 'prop'))) { const a = pp[0].prop, b = pp[1].prop; const moving = p => !p.body.isFixed() && !p.body.isSleeping() && (C.time - p.hitT < 3); const src = moving(a) ? a : moving(b) ? b : null, dst = src === a ? b : a; if (src && dst && !dst.hit) { const v = src.body.linvel(), rs = Math.hypot(v.x, v.y, v.z); if (rs > 1.5 && C.props.knock(dst, 'prop', rs)) { this.broke(dst, rs, true); } } }
  }
  sfxFor(type, sp) { const k = clamp(sp / 8, 0.3, 1.2); if (type === 'bin') C.audio.sfx('bonk', k); else if (type === 'cone') C.audio.sfx('thwop', k); else if (type === 'pane') C.audio.sfx('glass'); else C.audio.sfx('thud', k * 0.7); }
  broke(p, sp, chain) {
    const R = this.run; R.broken++; R.brokenBy[p.S.name] = (R.brokenBy[p.S.name] || 0) + 1;
    this.sfxFor(p.type, sp);
    const t = C.time; if (t - this.chain.t < 1.5) this.chain.n++; else this.chain.n = 1; this.chain.t = t;
    if (this.state === 'run' || this.state === 'push') {
      this.addCombo(p.S.name, p.S.pts);
      if (p.type === 'cone') { R.cones++; if (R.cones >= 10) this.task('cones'); }
      if (this.chain.n >= 3) this.countCombo('chain', 'CHAIN REACTION ×' + this.chain.n, 60);
    }
  }
  trolleyImpact(mine, other, F, mh, oh) {
    if (other.kind === 'item') return;
    const tr = C.trolley, m = tr.mass / 28, t = C.time, v = tr.vel(), sp = Math.hypot(v.x, v.y, v.z);
    const F0 = 5200 * m, sev = (F - F0) / (38000 * m);
    const kind = other.kind;
    if (F > F0 * 0.6) {
      const k = clamp(F / (30000 * m), 0.25, 1.3);
      if (!this.lastClang || t - this.lastClang > 0.09) { this.lastClang = t; C.audio.sfx(kind === 'ground' ? 'clatter' : 'clang', k); }
      if (kind !== 'ground' && sp > 3) {
        let point;
        C.phys.contactPair(tr.colliders.get(mh), C.phys.getCollider(oh), man => {
          if (!point && man.numSolverContacts() > 0) point = man.solverContactPoint(0);
        });
        const p = point || tr.pos();
        C.fx.emit('spark', p.x, p.y, p.z, 0, 1.5, 0, Math.round(6 + k * 10), 2.5);
      }
      this.shake = Math.max(this.shake, Math.min(0.8, F / (60000 * m)));
      this.lastHit.t = t;
    }
    if (sev > 0 && kind !== 'item' && kind !== 'prop' && kind !== 'ped') tr.hurt(mine.part === 'floor' ? 'basket' : mine.part === 'front' ? 'basket' : mine.part, sev * (kind === 'ground' ? 0.5 : 1));
    const active = this.state === 'run' || this.state === 'push';
    if (!active) return;
    if (kind === 'car' && F > F0 * 0.5) { if (C.props.alarm(other.car)) this.addCombo('CAR ALARM', 250); }
    if ((kind === 'sign' || kind === 'pole') && F > F0 * 0.4) { if (other.wob != null) C.props.wobble(other.wob, sp * 0.5); if (!this.run.flags['pole' + oh]) { this.run.flags['pole' + oh] = true; this.addCombo(other.name || 'STREET FURNITURE', 100); } }
    if (kind === 'bus' && F > F0) { if (!this.run.flags.bus) { this.run.flags.bus = true; this.addCombo('HIT BY A BUS', 750); } }
  }
  // ---------- per-frame run logic ----------
  update(dt, t) {
    const tr = C.trolley; if (!tr) return;
    const msg = this.msgs[0]; if (msg) { msg.t += dt; if (msg.t > msg.dur) this.msgs.shift(); }
    for (let i = this.pops.length - 1; i >= 0; i--) { this.pops[i].t += dt; if (this.pops[i].t > 1.3) this.pops.splice(i, 1); }
    if (this.bankPop) { this.bankPop.t += dt; if (this.bankPop.t > 2) this.bankPop = null; }
    if (this.lostPop) { this.lostPop.t += dt; if (this.lostPop.t > 1.8) this.lostPop = null; }
    this.shake = Math.max(0, this.shake - dt * 1.8); this.flash = Math.max(0, this.flash - dt * 3);
    if (this.state !== 'push' && this.state !== 'run' && this.state !== 'over') return;
    const R = this.run, p = tr.pos(), v = tr.vel(), sp = Math.hypot(v.x, v.y, v.z), mph = sp * 2.237, W = C.world;
    if (this.state === 'over') {
      this.overT -= dt;
      if (this.overT <= 0) this.showResults();
      return;
    }
    if (this.state === 'push') { this.pushT -= dt; if (this.pushT <= 0 || p.z < 4) this.beginRun(); }
    if (this.state === 'run') R.time += dt;
    if (this.hasLastPos) { const d = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z); if (d < 5) R.dist += d; }
    this.lastPos.x = p.x; this.lastPos.z = p.z; this.hasLastPos = true;
    R.maxSpeed = Math.max(R.maxSpeed, sp); R.maxMph = Math.max(R.maxMph, mph);
    // where are we on the hill?
    const L = W.locate(p.x, p.z, this.roadPosition), s = L.s;
    // speed
    if (mph > 30 && tr.nWheels > 0) this.liveCombo('speed', 'SPEEDING', 55, dt); else this.endLive('speed');
    if (W.speedCam && !R.speedCam && Math.abs(s - W.speedCam.s) < 2.5 && mph > 30 && Math.abs(L.d) < W.roadAt(s).w) { R.speedCam = true; this.flash = 1; C.audio.sfx('flash'); this.addCombo(`SPEED CAMERA ${Math.round(mph)} MPH`, 400); this.task('camera'); }
    // air and landing
    const air = tr.nWheels === 0 && !tr.touching;
    if (air) {
      if (!this.air && tr.airT > 0.22) { this.air = { t: 0, x0: p.x, z0: p.z, maxH: 0, pitch: 0, yaw: 0, roll: 0, wet0: this.wetN }; tr.air = this.air; }
      if (this.air) { this.air.t += dt; const h = p.y - W.groundY(p.x, p.z) - 0.5 * tr.s; if (h > this.air.maxH) this.air.maxH = h; }
    } else if (this.air && tr.nWheels > 0) { this.land(this.air, tr, v); this.air = null; tr.air = null; }
    // two wheels, scraping
    const nw = tr.nWheels; if (nw === 2 && !air && sp > 3) { this.twoT += dt; if (this.twoT > 0.35) this.liveCombo('two', 'TWO-WHEELER', 140, dt); } else { this.twoT = 0; this.endLive('two'); }
    if (tr.touching && tr.hullGround && sp > 4 && nw < 4) { this.scrapeT += dt; if (this.scrapeT > 0.3) { this.liveCombo('scrape', 'SPARKY SCRAPE', 120, dt); const q = tr.local(0, -0.3 * tr.s, 0, this.scrapePoint); if (Math.random() < 0.6) C.fx.emit('spark', q.x, q.y, q.z, -v.x * 0.2, 1, -v.z * 0.2, 2, 1.5); } } else { this.scrapeT = 0; this.endLive('scrape'); }
    // near misses with parked cars, posts, the bus
    this.nearMisses(p, sp, t);
    // combo timer
    if (this.combo.list.length && !this.air) { this.combo.timer -= dt; if (this.combo.timer <= 0) this.bank(); }
    if (this.combo.live.chain && t - this.chain.t > 1.5) this.endLive('chain');
    if (this.combo.live.spree && (!this.collectTimes.length || t - this.collectTimes[this.collectTimes.length - 1] > 4.5)) this.endLive('spree');
    // run endings
    if (W.finishes && p.y < 3 && W.finishes.some(f => Math.abs(p.x - f.x) < f.hx && Math.abs(p.z - f.z) < f.hz)) return this.endRun('returned');
    if (tr.submerged) {
      if (this.wetT === 0) {
        C.fx.pondSplash(p.x, p.z, clamp(0.85 + sp * 0.045, 0.85, 1.5));
        if (C.props.disturbDucks()) this.ev('ducks', {});
      }
      this.wetN++; this.wetT += dt;
      if (this.wetT > 1.4) return this.endRun('pond');
    } else this.wetT = 0;
    if (p.y < -25) return this.endRun('void');
    const up = tr.up;
    // on its side or upside down on the ground for a moment means it's over
    const lying = up < 0.3 && (tr.touching || nw > 0), flat = up < -0.4 && tr.touching;
    if (!tr.submerged && (lying || up < 0.15)) { this.tiltT += dt * (flat ? 1.6 : 1); if (this.tiltT > (sp < 6 ? 1.3 : 2.2)) return this.endRun('crash'); } else this.tiltT = Math.max(0, this.tiltT - dt * 2);
    const inputting = C.input && (C.input.ctl.push || C.input.ctl.brake);
    if (this.state === 'run' && sp < 0.35 && s > 2) { this.stillT += inputting ? dt * 0.45 : dt; if (this.stillT > 5.5) return this.endRun('stopped'); } else this.stillT = 0;
    // wedged against something and getting nowhere for a while
    if (this.state === 'run') { this.trailT = (this.trailT || 0) + dt; if (this.trailT > 0.5) { this.trailT = 0; (this.trail = this.trail || []).push({ x: p.x, z: p.z }); if (this.trail.length > 18) this.trail.shift(); if (this.trail.length === 18 && Math.hypot(p.x - this.trail[0].x, p.z - this.trail[0].z) < 2.2) return this.endRun('stopped'); } }
  }
  land(a, tr, v) {
    const p = tr.pos(); if (a.t < 0.35) return;
    const sp = Math.hypot(v.x, v.z), f = tr.fwd(), fh = Math.hypot(f.x, f.z) || 1;
    const ang = sp > 1 ? Math.abs(angDiff(Math.atan2(f.x / fh, f.z / fh), Math.atan2(v.x, v.z))) : 0;
    const R = this.run; R.airMax = Math.max(R.airMax, a.t);
    const flips = Math.floor((Math.abs(a.pitch) + 0.9) / (Math.PI * 2)), halfSpins = Math.floor((Math.abs(a.yaw) + 0.5) / Math.PI), rolls = Math.floor((Math.abs(a.roll) + 0.9) / (Math.PI * 2));
    const upright = tr.up > 0.7;
    if (!upright) return; // a bad landing; the crash logic decides what happens next
    let tricks = 0;
    if (a.t > 0.45) this.addCombo(a.t > 1.2 ? 'BIG AIR' : 'AIR', Math.round(120 * a.t + 60 * a.t * a.t + (a.maxH > 4 ? a.maxH * 40 : 0)), { trick: a.t > 1.2 });
    if (halfSpins >= 1) { tricks++; this.addCombo(SPIN_NAMES[Math.min(halfSpins, 6)] || (halfSpins * 180 + ''), Math.round(260 * Math.pow(halfSpins, 1.5)), { trick: true }); }
    if (flips >= 1) { tricks++; const back = a.pitch > 0; this.addCombo((flips > 1 ? ['', '', 'DOUBLE ', 'TRIPLE '][Math.min(flips, 3)] : '') + (back ? 'BACKFLIP' : 'FRONTFLIP'), Math.round(900 * Math.pow(flips, 1.6)), { trick: true }); }
    if (rolls >= 1) { tricks++; this.addCombo('BARREL ROLL', 1100 * rolls, { trick: true }); }
    const dist = Math.hypot(p.x - a.x0, p.z - a.z0); if (dist > 9) this.addCombo(`${Math.round(dist)} M`, Math.round(dist * 14));
    if (ang > 2.5) this.addCombo('FAKIE', 300, { trick: true }); else if (ang < 0.6 && (tricks || a.t > 0.9)) this.addCombo('CLEAN LANDING', 150 + tricks * 150);
    C.audio.sfx('land', clamp(a.t / 1.5, 0.3, 1.2)); this.shake = Math.max(this.shake, Math.min(0.6, a.t * 0.25));
    const q = tr.pos(); C.fx.emit('dust', q.x, q.y - 0.4 * tr.s, q.z, 0, 0.3, 0, 8, 1.2);
  }
  nearMisses(p, sp, t) {
    const W = C.world, tr = C.trolley, r0 = 0.42 * tr.s;
    const check = (key, d, kind, pts) => {
      let n = this.near.get(key);
      if (d < 3.5) { if (!n) { n = { min: d, t }; this.near.set(key, n); } else n.min = Math.min(n.min, d); }
      else if (n) { this.near.delete(key); const recentHit = t - this.lastHit.t < 1.2; if (n.min < 0.7 && n.min > 0.02 && sp > 6 && !recentHit && t - n.t < 3) this.ev('nearMiss', { name: kind, pts }); }
    };
    if (sp > 5 || this.near.size) {
      for (let i = 0; i < W.nearTargets.length; i++) { const g = W.nearTargets[i], dx = p.x - g.x, dz = p.z - g.z; if (Math.abs(dx) > 9 || Math.abs(dz) > 9) { if (this.near.has(i)) check(i, 99, g.kind, 200); continue; }
        let d; if (g.box) { const c = Math.cos(g.box.yaw), s2 = Math.sin(g.box.yaw), lx = dx * c - dz * s2, lz = dx * s2 + dz * c; const qx = Math.max(0, Math.abs(lx) - g.box.hx), qz = Math.max(0, Math.abs(lz) - g.box.hz); d = Math.hypot(qx, qz) - r0; } else d = Math.hypot(dx, dz) - g.r - r0;
        check(i, d, g.kind, g.kind === 'PARKED CAR' || g.kind === 'WHITE VAN' ? 200 : 150); }
      const B = C.props.bus; if (B && B.x != null) { const dx = p.x - B.x, dz = p.z - B.z; const d = Math.hypot(Math.max(0, Math.abs(dx) - 5.4), Math.max(0, Math.abs(dz) - 1.25)) - r0; check('bus', d, 'THE BUS', 600); }
    }
  }
  // ---------- flow ----------
  ensureTrolley() {
    const key = this.save.unlocked[this.save.sel] ? this.save.sel : 'dave';
    if (!C.trolley || C.trolley.key !== key) { if (C.trolley) C.trolley.dispose(); C.trolley = new Trolley(key); }
  }
  toSelect() {
    this.state = 'select'; this.paused = false; this.slowmo = 0; this.msgs = []; this.pops = []; this.ensureTrolley(); this.resetWorld();
    C.ui.show('select');
  }
  toBriefing() {
    if (this.state === 'select') C.camera.userData.snap = true;
    this.state = 'briefing'; this.paused = false; this.slowmo = 0;
    C.input.release(); C.audio.alarm(false);
    C.ui.show('briefing');
  }
  resetWorld() {
    C.input.release(); C.props.reset(); C.shopping.reset(); C.fx.clear();
    this.shake = 0; this.flash = 0;
    C.trolley.reset(C.world.start); C.camera.userData.snap = true;
  }
  startRun() {
    C.audio.init(); C.select.close(false); this.ensureTrolley(); this.resetWorld(); this.resetRun();
    this.msgs = []; this.pops = []; this.bankPop = null; this.lostPop = null;
    this.state = 'push'; this.pushT = 2.4; this.paused = false; this.slowmo = 0;
    C.ui.show('hud');
  }
  beginRun() {
    if (this.state !== 'push') return; this.state = 'run';
  }
  pushTap() { if (this.state === 'push' || this.state === 'run') C.input.pushQ = true; }
  endRun(why) {
    if (this.state !== 'run' && this.state !== 'push') return;
    const R = this.run; R.end = why; this.state = 'over'; this.overT = why === 'returned' ? 2.2 : 2.6;
    R.basketPts = C.shopping.inBasket().reduce((pts, it) => pts + ITEMS[it.k].pts, 0);
    this.endLive('speed'); this.endLive('two'); this.endLive('scrape');
    this.msgs = [];
    if (why === 'crash' || why === 'void') { this.loseCombo(); C.audio.sfx('crash'); this.slowmo = 1.4; this.say(QUIPS.lost, { dur: 2.6, now: true }); }
    else { this.bank(why !== 'returned'); }
    if (why === 'returned') this.task('return');
  }
  showResults() {
    const R = this.run, tr = C.trolley; this.state = 'results'; C.audio.alarm(false);
    const bonus = [];
    if (R.basketPts > 0) bonus.push(['IN THE BASKET ×2', R.basketPts * 2]);
    if (R.end === 'pond') bonus.push(['FOUND IN POND', 1500]);
    bonus.push(['DISTANCE ' + Math.round(R.dist) + ' M', Math.round(R.dist * 2)]);
    for (const t of TASKS) if (R.done[t.id]) bonus.push([t.short, t.pts]);
    if (R.maxMph > 30) bonus.push(['SPEEDING (' + Math.round(R.maxMph) + ' MPH)', Math.round((R.maxMph - 30) * 40)]);
    const total = R.score + bonus.reduce((sum, [, value]) => sum + value, 0);
    const prevBest = this.save.best, newBest = total > prevBest;
    if (newBest) this.save.best = total;
    const unlocked = [];
    const reward = GRUMBLETON.unlock;
    if (R.end === 'returned' && !this.save.unlocked[reward]) {
      this.save.unlocked[reward] = true;
      unlocked.push(VARIANTS[reward].name);
    }
    this.save.runs++; this.persist();
    C.ui.receipt({ R, total, bonus, newBest, best: this.save.best, unlocked, trolley: VARIANTS[tr.key].name });
    C.ui.show('results');
  }
}
