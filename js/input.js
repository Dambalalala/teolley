import { C } from './core.js';

// Keyboard and touch. Held keys drive ctl; taps drive the push-off and hops.
export class Input {
  constructor() {
    this.k = { push: false, brake: false, left: false, right: false };
    this.t = { push: false, brake: false, left: false, right: false };
    this.ctl = { push: false, brake: false, left: false, right: false, hop: false, pushTap: false };
    this.hopQ = false; this.pushQ = false;
    const map = { KeyW: 'push', ArrowUp: 'push', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    addEventListener('keydown', e => {
      const G = C.game; if (!G) return; C.audio && C.audio.init();
      const ui = G.state, typing = e.target && (e.target.tagName === 'INPUT');
      if (typing) return;
      if (ui === 'select') {
        const onBtn = e.target && e.target.tagName === 'BUTTON';
        if ((e.code === 'Enter' || e.code === 'Space') && !onBtn) { e.preventDefault(); C.select.confirm(); }
        else if (e.code === 'KeyA' || e.code === 'ArrowLeft') { e.preventDefault(); C.select.step(-1); }
        else if (e.code === 'KeyD' || e.code === 'ArrowRight') { e.preventDefault(); C.select.step(1); }
        return;
      }
      else if (ui === 'results') { if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); G.startRun(); } else if (e.code === 'KeyT') G.toSelect(); return; }
      if (G.paused) { if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); C.ui.resume(); } else if (e.code === 'KeyR') { C.ui.resume(); G.startRun(); } return; }
      if (map[e.code]) { e.preventDefault(); if (!e.repeat && map[e.code] === 'push') this.pushQ = true; this.k[map[e.code]] = true; }
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { if (G.state === 'push') this.pushQ = true; else this.hopQ = true; } }
      if (e.repeat) return;
      if (e.code === 'KeyR') G.startRun();
      else if (e.code === 'KeyC') C.cam.next();
      else if (e.code === 'KeyP' || e.code === 'Escape') C.ui.pause();
      else if (e.code === 'KeyM') C.ui.toggleMute();
    });
    addEventListener('keyup', e => { if (map[e.code]) this.k[map[e.code]] = false; });
    const release = () => { for (const k in this.k) this.k[k] = false; for (const k in this.t) this.t[k] = false; document.querySelectorAll('.pad.on').forEach(p => p.classList.remove('on')); };
    addEventListener('blur', () => { release(); if (C.game && (C.game.state === 'run' || C.game.state === 'push')) C.ui.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { release(); if (C.game && (C.game.state === 'run' || C.game.state === 'push')) C.ui.pause(); } });
    const pad = (id, prop, tap) => {
      const el = document.getElementById(id); if (!el) return;
      const set = v => { if (prop) this.t[prop] = v; el.classList.toggle('on', v); };
      el.addEventListener('pointerdown', e => { e.preventDefault(); C.audio && C.audio.init(); try { el.setPointerCapture(e.pointerId); } catch (_) {} set(true); if (tap) tap(); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => set(false));
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    pad('tL', 'left'); pad('tR', 'right'); pad('tB', 'brake');
    pad('tG', 'push', () => { this.pushQ = true; });
    pad('tH', null, () => { if (C.game.state === 'push') this.pushQ = true; else this.hopQ = true; });
    addEventListener('touchstart', () => { if (!C.touch) { C.touch = true; document.body.classList.add('touch'); C.ui && C.ui.refreshTouch(); } }, { passive: true });
  }
  // sample the controls for this physics substep
  sample() {
    const on = C.game && (C.game.state === 'run' || C.game.state === 'push') && !C.game.paused;
    for (const k of ['push', 'brake', 'left', 'right']) this.ctl[k] = on && (this.k[k] || this.t[k]);
    this.ctl.hop = on && this.hopQ; this.hopQ = false;
    this.ctl.pushTap = on && this.pushQ; this.pushQ = false;
    return this.ctl;
  }
}
