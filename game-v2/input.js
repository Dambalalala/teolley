import { C } from './core.js';

const CONTROL_KEYS = ['push', 'brake', 'left', 'right'];

// Keyboard and touch. Held keys drive ctl; taps drive the push-off and hops.
export class Input {
  constructor() {
    this.k = { push: false, brake: false, left: false, right: false };
    this.t = { push: false, brake: false, left: false, right: false };
    this.ctl = { push: false, brake: false, left: false, right: false, hop: false, pushTap: false };
    this.hopQ = false; this.pushQ = false; this.keys = new Set(); this.pointers = new Map();
    const map = { KeyW: 'push', ArrowUp: 'push', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    addEventListener('keydown', e => {
      const G = C.game; if (!G) return; C.audio && C.audio.init();
      const ui = G.state, typing = e.target?.tagName === 'INPUT';
      if (typing) return;
      if (ui === 'select') {
        const onBtn = e.target && e.target.tagName === 'BUTTON';
        if (!e.repeat && (e.code === 'Enter' || e.code === 'Space') && !onBtn) { e.preventDefault(); C.select.confirm(); }
        else if (e.code === 'KeyA' || e.code === 'ArrowLeft') { e.preventDefault(); C.select.step(-1); }
        else if (e.code === 'KeyD' || e.code === 'ArrowRight') { e.preventDefault(); C.select.step(1); }
        return;
      }
      if (ui === 'results') {
        const onButton = e.target?.tagName === 'BUTTON';
        if (!e.repeat && (e.code === 'KeyR' || (!onButton && (e.code === 'Enter' || e.code === 'Space')))) {
          e.preventDefault(); G.toBriefing();
        } else if (!e.repeat && e.code === 'KeyT' && G.hasTrolleyChoice()) G.toSelect();
        return;
      }
      if (ui === 'briefing') {
        if (e.repeat && (e.code === 'Enter' || e.code === 'Space')) e.preventDefault();
        if (!e.repeat && e.code === 'Escape' && G.hasTrolleyChoice()) { e.preventDefault(); G.toSelect(); }
        return;
      }
      if (G.paused) { if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); C.ui.resume(); } else if (!e.repeat && e.code === 'KeyR') G.toBriefing(); return; }
      if (G.state === 'over' && e.code !== 'KeyR' && e.code !== 'KeyM') return;
      if (map[e.code] && (!e.repeat || this.keys.has(e.code))) {
        e.preventDefault();
        if (!e.repeat && map[e.code] === 'push') this.pushQ = true;
        this.keys.add(e.code); this.k[map[e.code]] = true;
      }
      if (e.code === 'Space' && !e.target?.matches('#hudBtns button')) {
        e.preventDefault();
        if (!e.repeat) this.hopQ = true;
      }
      if (e.repeat) return;
      if (e.code === 'KeyR') G.toBriefing();
      else if (e.code === 'KeyP' || e.code === 'Escape') C.ui.pause();
      else if (e.code === 'KeyM') C.ui.toggleMute();
    });
    addEventListener('keyup', e => {
      if (!map[e.code]) return;
      this.keys.delete(e.code);
      this.k[map[e.code]] = [...this.keys].some(code => map[code] === map[e.code]);
    });
    const pauseOnExit = () => { this.release(); C.ui?.pause(); };
    addEventListener('blur', pauseOnExit);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnExit(); });
    const pad = (id, prop, tap) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0 || this.pointers.has(el)) return;
        e.preventDefault(); C.audio.init();
        el.setPointerCapture(e.pointerId);
        this.pointers.set(el, { id: e.pointerId });
        if (prop) this.t[prop] = true;
        el.classList.add('on');
        tap?.();
      });
      const releasePointer = e => {
        if (this.pointers.get(el)?.id !== e.pointerId) return;
        this.pointers.delete(el);
        if (prop) this.t[prop] = false;
        el.classList.remove('on');
      };
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(event, releasePointer);
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    pad('tL', 'left'); pad('tR', 'right'); pad('tB', 'brake');
    pad('tG', 'push', () => { this.pushQ = true; });
    pad('tH', null, () => { this.hopQ = true; });
    addEventListener('touchstart', () => { if (!C.touch) { C.touch = true; document.body.classList.add('touch'); C.ui && C.ui.refreshTouch(); } }, { passive: true });
  }
  release() {
    for (const [el, pointer] of this.pointers) {
      if (el.hasPointerCapture(pointer.id)) el.releasePointerCapture(pointer.id);
      el.classList.remove('on');
    }
    this.pointers.clear(); this.keys.clear();
    for (const key of Object.keys(this.k)) { this.k[key] = false; this.t[key] = false; }
    this.hopQ = false; this.pushQ = false;
  }
  // sample the controls for this physics substep
  sample() {
    const on = C.game && (C.game.state === 'run' || C.game.state === 'push') && !C.game.paused;
    for (const k of CONTROL_KEYS) this.ctl[k] = on && (this.k[k] || this.t[k]);
    this.ctl.hop = on && this.hopQ; this.hopQ = false;
    this.ctl.pushTap = on && this.pushQ; this.pushQ = false;
    return this.ctl;
  }
}
