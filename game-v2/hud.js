import { C } from './core.js';
import { clamp, fmt } from './util.js';
import { SHOPPING_LIST, LIST_NAMES } from './game.js?v=roadworks-graffiti';

// All three fonts are drawn on an 8-pixel grid, so sizes stay at multiples of 8 and every glyph is placed on a whole
// device pixel; that keeps the letters as hard-edged as the rest of the game.
const FACE = { d: '"Press Start 2P",monospace', l: '"Silkscreen",monospace', b: '"Tiny5","Silkscreen",monospace' };
const MID = { d: 4.5, l: 2.5, b: 2.5 }; // font pixels from the middle of a capital down to the baseline
// chrome bands for the big numbers, one per pixel row of a capital (top to bottom)
const STEEL = ['#ffffff', '#dde3ea', '#b4bfcb', '#69737f', '#8995a3', '#c3ccd6', '#eef2f6'];
const GOLD = ['#fffbe0', '#ffe680', '#ffd21f', '#c47a0a', '#e8a313', '#ffd54d', '#fff1a6'];
const HOT = ['#fff0e0', '#ffc28a', '#ff8a3d', '#b43c0c', '#e0601a', '#ff9a4d', '#ffd0a8'];
const RING = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const INK = '#0d0f12', PAPER = '#f6f2e7';

export class HUD {
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.w = 1; this.h = 1; this.dpr = 1; this.grads = new Map(); this.widths = new Map(); this.elapsed = 0; this.visible = false;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
  }
  resize(w, h) {
    this.dpr = clamp(Math.floor(window.devicePixelRatio || 1), 1, 2); this.w = w; this.h = h;
    this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr);
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.grads.clear(); this.elapsed = 1;
    const css = getComputedStyle(document.documentElement);
    this.insets = ['t', 'r', 'b', 'l'].map(key => parseFloat(css.getPropertyValue('--safe-' + key)) || 0);
  }
  measure(t) {
    const key = this.g.font + '|' + t;
    let width = this.widths.get(key);
    if (width === undefined) {
      if (this.widths.size >= 256) this.widths.clear();
      width = this.g.measureText(t).width; this.widths.set(key, width);
    }
    return width;
  }
  snap(v) { return Math.round(v * this.dpr) / this.dpr; }
  // y is the middle of the capitals; o.metal is a band palette for chrome lettering (Press Start only)
  text(t, x, y, face, size, col, align = 'left', o = {}) {
    const g = this.g, fp = size / 8; g.font = `${o.bold ? '700 ' : ''}${size}px ${FACE[face]}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const w = this.measure(t), x0 = this.snap(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x), yb = this.snap(y + MID[face] * fp);
    if (o.metal) {
      g.fillStyle = INK; g.fillText(t, x0 + fp, yb + 2 * fp); for (const [dx, dy] of RING) g.fillText(t, x0 + dx * fp, yb + dy * fp);
      g.fillStyle = this.bands(yb - 8 * fp, fp, o.metal); g.fillText(t, x0, yb);
    } else {
      if (o.shadow !== false) { g.fillStyle = 'rgba(12,12,16,.85)'; g.fillText(t, x0 + fp, yb + fp); }
      g.fillStyle = col; g.fillText(t, x0, yb);
    }
    return w;
  }
  bands(top, fp, pal) {
    const key = `${top}|${fp}|${pal[2]}`; let gr = this.grads.get(key); if (gr) return gr;
    gr = this.g.createLinearGradient(0, top, 0, top + 8 * fp);
    pal.forEach((c, i) => { gr.addColorStop(i / 8, c); gr.addColorStop((i + 1) / 8 - 1e-4, c); }); gr.addColorStop(7 / 8, pal[5]); gr.addColorStop(1, pal[5]);
    if (this.grads.size > 96) this.grads.clear(); this.grads.set(key, gr); return gr;
  }
  // the biggest of the given sizes that fits
  fit(t, maxW, sizes, face) { const g = this.g; for (const s of sizes) { g.font = `${s}px ${FACE[face]}`; if (this.measure(t) <= maxW) return s; } return sizes[sizes.length - 1]; }
  rect(x, y, w, h) { const s = v => this.snap(v); this.g.fillRect(s(x), s(y), s(x + w) - s(x), s(y + h) - s(y)); }
  // a line drawn as a staircase of square pixels, and a filled pixel disc
  pxLine(x0, y0, x1, y1, t) { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / t)); for (let i = 0; i <= n; i++) this.rect(x0 + (x1 - x0) * i / n - t / 2, y0 + (y1 - y0) * i / n - t / 2, t, t); }
  pxDisc(cx, cy, r, p = 2) { for (let y = -r; y < r; y += p) { const hw = Math.round(Math.sqrt(Math.max(0, r * r - (y + p / 2) * (y + p / 2))) / p) * p; if (hw > 0) this.rect(cx - hw, cy + y, hw * 2, p); } }
  draw(dt) {
    const g = this.g, G = C.game, W = this.w, H = this.h, st = G.state;
    const visible = !G.paused && (st === 'push' || st === 'run' || st === 'over');
    this.elapsed += dt;
    if (visible === this.visible && (!visible || (dt > 0 && this.elapsed < 1 / 30))) return;
    this.visible = visible; this.elapsed %= 1 / 30;
    g.clearRect(0, 0, W, H);
    if (!visible) return;
    const [top, right, bottom, left] = this.insets;
    const R = G.run, tr = C.trolley, small = W < 640, narrow = W < 520, pad = small ? 12 : 16;
    const xPad = pad + left, yPad = pad + top, width = W - left - right, mid = left + width / 2;
    // score / best
    this.text('SCORE', xPad, yPad + 6, 'l', 16, PAPER);
    this.text(fmt(R.score + R.taskPts), xPad, yPad + (small ? 30 : 34), 'd', small ? 24 : 32, null, 'left', { metal: GOLD });
    this.text('BEST ' + fmt(G.save.best), xPad, yPad + (small ? 58 : 66), 'l', 16, PAPER);
    // Show shopping progress once the first list item has been picked up.
    let comboY = yPad + 80;
    if (SHOPPING_LIST.some(k => R.got[k])) {
      let x = xPad, y = yPad + (small ? 76 : 84); g.font = `16px ${FACE.l}`;
      for (const k of SHOPPING_LIST) {
        const lab = LIST_NAMES[k].toUpperCase(), w = Math.ceil(this.measure(lab)) + 14, on = R.got[k];
        if (x + w > W - pad - right) { x = xPad; y += 24; }
        g.fillStyle = on ? '#ffd21f' : 'rgba(22,22,26,.55)'; this.rect(x, y, w, 20);
        this.text(lab, x + 7, y + 10, 'l', 16, on ? '#16161a' : 'rgba(246,242,231,.6)', 'left', { shadow: false });
        x += w + 6;
      }
      comboY = y + 32;
    }
    // time: top centre, or under the buttons on a narrow screen
    const ticks = Math.floor(R.time * 10), mm = Math.floor(ticks / 600), ss = (ticks % 600 / 10).toFixed(1).padStart(4, '0');
    if (narrow) this.text(`${mm}:${ss}`, W - pad - right, top + 66, 'd', 16, PAPER, 'right');
    else this.text(`${mm}:${ss}`, mid, yPad + 14, 'd', 24, PAPER, 'center');
    // combo
    const cb = G.combo, cy = comboY;
    const comboSize = small || H < 440 ? 24 : 32;
    if (cb.list.length) {
      const shown = cb.list.slice(-4), live = Object.values(cb.live);
      const names = shown.map(e => e.name + (e.pts >= 1 && e.name.length < 18 && live.includes(e) ? ' ' + Math.round(e.pts) : ''));
      g.font = '16px ' + FACE.b;
      while (names.length > 1 && this.measure(names.join(' + ')) > width * 0.88) names.shift();
      const line = names.join(' + ');
      this.text(line, mid, cy, 'b', this.fit(line, W * 0.92, small ? [16] : [24, 16], 'b'), PAPER, 'center');
      this.text(`${fmt(cb.base)} × ${cb.mult}`, mid, cy + (small ? 30 : 38), 'd', comboSize, null, 'center', { metal: GOLD });
      const tw = Math.min(160, W * 0.3), by = cy + (small ? 52 : 64); g.fillStyle = 'rgba(22,22,26,.5)'; this.rect(mid - tw / 2, by, tw, 4); g.fillStyle = '#f26a1b'; this.rect(mid - tw / 2, by, tw * clamp(cb.timer / 3, 0, 1), 4);
    } else if (G.bankPop) { g.globalAlpha = clamp(2 - G.bankPop.t, 0, 1); this.text('+' + fmt(G.bankPop.v), mid, cy + 24 - Math.round(G.bankPop.t * 12), 'd', small ? 24 : 40, null, 'center', { metal: GOLD }); g.globalAlpha = 1; }
    else if (G.lostPop) { g.globalAlpha = clamp(1.8 - G.lostPop.t, 0, 1); this.text('COMBO LOST  -' + fmt(G.lostPop.v), mid, cy + 10, 'l', 16, '#ff8a7a', 'center', { bold: true }); g.globalAlpha = 1; }
    // trick names (actual tricks only)
    if (G.pops.length && !C.touch) {
      const p = G.pops[G.pops.length - 1], a = p.t > 0.9 ? clamp((1.3 - p.t) / 0.4, 0, 1) : 1, big = p.t < 0.1 ? 8 : 0;
      g.globalAlpha = a; this.text(p.text, W / 2, H * 0.38, 'd', this.fit(p.text, W * 0.86, small ? [24 + big, 16] : [32 + big, 24, 16], 'd'), null, 'center', { metal: p.col ? HOT : STEEL }); g.globalAlpha = 1;
    }
    // the occasional message
    if (G.msgs.length) this.message(G.msgs[0], W, H, small);
    // speed
    const mph = Math.round((tr ? tr.speed() : 0) * 2.237);
    const speedSize = width < 375 ? 24 : small ? 32 : 40;
    this.text(String(mph), mid, H - bottom - pad - (small ? 36 : 48), 'd', speedSize, null, 'center', { metal: mph > 30 ? HOT : STEEL });
    this.text('MPH', mid, H - bottom - pad - 8, 'l', 16, PAPER, 'center');
    if (G.flash > 0 && !this.motion.matches) { g.fillStyle = `rgba(255,255,255,${G.flash * 0.5})`; g.fillRect(0, 0, W, H); }
  }
  message(m, W, H, small) {
    // one plain style: a dark label with light text
    const g = this.g, a = m.t < 0.2 ? m.t / 0.2 : m.t > m.dur - 0.4 ? clamp((m.dur - m.t) / 0.4, 0, 1) : 1, y = Math.round(H * (C.touch ? 0.56 : small ? 0.3 : 0.25));
    g.globalAlpha = a;
    const size = this.fit(m.text, W * 0.84, small ? [16] : [24, 16], 'b'); g.font = `${size}px ${FACE.b}`;
    const tw = this.measure(m.text), bw = Math.round(tw + 32), bh = size + 16, x = Math.round(W / 2 - bw / 2);
    g.fillStyle = 'rgba(22,22,26,.78)'; this.rect(x, y - bh / 2, bw, bh);
    this.text(m.text, W / 2, y, 'b', size, m.kind === 'cheer' ? '#ffd21f' : PAPER, 'center', { shadow: false });
    g.globalAlpha = 1;
  }
}
