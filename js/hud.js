import { C } from './core.js';
import { clamp, fmt } from './util.js';
import { CAM_NAMES } from './camera.js';
import { SHOPPING_LIST, LIST_NAMES, TASKS } from './game.js';

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
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.w = 1; this.h = 1; this.dpr = 1; this.toast = null; this.grads = new Map(); }
  resize(w, h) { this.dpr = clamp(Math.floor(window.devicePixelRatio || 1), 1, 3); this.w = w; this.h = h; this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr); this.grads.clear(); }
  camToast(name) { this.toast = { text: name, t: 0 }; }
  snap(v) { return Math.round(v * this.dpr) / this.dpr; }
  // y is the middle of the capitals; o.metal is a band palette for chrome lettering (Press Start only)
  text(t, x, y, face, size, col, align = 'left', o = {}) {
    const g = this.g, fp = size / 8; g.font = `${o.bold ? '700 ' : ''}${size}px ${FACE[face]}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const w = g.measureText(t).width, x0 = this.snap(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x), yb = this.snap(y + MID[face] * fp);
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
  fit(t, maxW, sizes, face) { const g = this.g; for (const s of sizes) { g.font = `${s}px ${FACE[face]}`; if (g.measureText(t).width <= maxW) return s; } return sizes[sizes.length - 1]; }
  rect(x, y, w, h) { const s = v => this.snap(v); this.g.fillRect(s(x), s(y), s(x + w) - s(x), s(y + h) - s(y)); }
  // a line drawn as a staircase of square pixels, and a filled pixel disc
  pxLine(x0, y0, x1, y1, t) { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / t)); for (let i = 0; i <= n; i++) this.rect(x0 + (x1 - x0) * i / n - t / 2, y0 + (y1 - y0) * i / n - t / 2, t, t); }
  pxDisc(cx, cy, r, p = 2) { for (let y = -r; y < r; y += p) { const hw = Math.round(Math.sqrt(Math.max(0, r * r - (y + p / 2) * (y + p / 2))) / p) * p; if (hw > 0) this.rect(cx - hw, cy + y, hw * 2, p); } }
  draw(dt) {
    const g = this.g, G = C.game, W = this.w, H = this.h; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false;
    const st = G.state; if (!(st === 'push' || st === 'run' || st === 'over')) return;
    const R = G.run, tr = C.trolley, small = W < 640, narrow = W < 520, pad = small ? 12 : 16;
    // CCTV look
    if (C.cam.mode === 2 && C.cam.cctv) {
      g.fillStyle = 'rgba(20,30,20,.12)'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,.1)'; for (let y = 0; y < H; y += 4) this.rect(0, y, W, 2);
      const cy0 = pad + 124 + (C.touch ? 96 : 0);
      if (Math.sin(performance.now() / 300) > 0) { g.fillStyle = '#e0302a'; this.pxDisc(pad + 8, cy0, 6); }
      this.text('REC  ' + C.cam.cctv.name, pad + 22, cy0, 'l', 16, '#e8f0e0');
      const d = new Date(), ts = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${d.toTimeString().slice(0, 8)}`;
      this.text(ts, pad + 22, cy0 + 22, 'l', 16, '#e8f0e0');
    }
    // score / best
    this.text('SCORE', pad, pad + 6, 'l', 16, PAPER);
    this.text(fmt(R.score), pad, pad + (small ? 30 : 34), 'd', small ? 24 : 32, null, 'left', { metal: GOLD });
    this.text('BEST ' + fmt(G.save.best), pad, pad + (small ? 58 : 66), 'l', 16, PAPER);
    // the task list: in full at the start, then just a count
    const got = SHOPPING_LIST.filter(k => R.got[k]).length, nd = TASKS.filter(t => R.done[t.id]).length;
    const cardA = st === 'push' ? 1 : st === 'run' ? clamp((4.5 - R.time) / 0.8, 0, 1) : 0;
    if (cardA < 1) this.text(`LIST ${got}/${SHOPPING_LIST.length} · TASKS ${nd}/${TASKS.length}`, pad, pad + (small ? 80 : 90), 'l', 16, PAPER);
    // time: top centre, or under the buttons on a narrow screen
    const tm = R.time, mm = Math.floor(tm / 60), ss = (tm % 60).toFixed(1).padStart(4, '0');
    if (narrow) this.text(`${mm}:${ss}`, W - pad, 76, 'd', 16, PAPER, 'right'); else this.text(`${mm}:${ss}`, W / 2, pad + 14, 'd', 24, PAPER, 'center');
    // combo
    const cb = G.combo, cy = narrow ? 222 : small ? 96 : 92;
    if (cb.list.length) {
      const names = cb.list.map(e => e.name + (e.pts >= 1 && e.name.length < 18 && cb.live && Object.values(cb.live).includes(e) ? ' ' + Math.round(e.pts) : ''));
      let line = names.slice(-4).join(' + '); if (names.length > 4) line = '… + ' + line;
      this.text(line, W / 2, cy, 'b', this.fit(line, W * 0.92, small ? [16] : [24, 16], 'b'), PAPER, 'center');
      this.text(`${fmt(cb.base)} × ${cb.mult}`, W / 2, cy + (small ? 30 : 38), 'd', small ? 24 : 32, null, 'center', { metal: GOLD });
      const tw = Math.min(160, W * 0.3), by = cy + (small ? 52 : 64); g.fillStyle = 'rgba(22,22,26,.5)'; this.rect(W / 2 - tw / 2, by, tw, 4); g.fillStyle = '#f26a1b'; this.rect(W / 2 - tw / 2, by, tw * clamp(cb.timer / 3, 0, 1), 4);
    } else if (G.bankPop) { g.globalAlpha = clamp(2 - G.bankPop.t, 0, 1); this.text('+' + fmt(G.bankPop.v), W / 2, cy + 24 - Math.round(G.bankPop.t * 12), 'd', small ? 24 : 40, null, 'center', { metal: GOLD }); g.globalAlpha = 1; }
    else if (G.lostPop) { g.globalAlpha = clamp(1.8 - G.lostPop.t, 0, 1); this.text('COMBO LOST  -' + fmt(G.lostPop.v), W / 2, cy + 10, 'l', 16, '#ff8a7a', 'center', { bold: true }); g.globalAlpha = 1; }
    // trick names (actual tricks only)
    if (G.pops.length) {
      const p = G.pops[G.pops.length - 1], a = p.t > 0.9 ? clamp((1.3 - p.t) / 0.4, 0, 1) : 1, big = p.t < 0.1 ? 8 : 0;
      g.globalAlpha = a; this.text(p.text, W / 2, H * 0.38, 'd', this.fit(p.text, W * 0.86, small ? [24 + big, 16] : [32 + big, 24, 16], 'd'), null, 'center', { metal: p.col ? HOT : STEEL }); g.globalAlpha = 1;
    }
    // the occasional message
    if (G.msgs.length) this.message(G.msgs[0], W, H, small);
    // speed
    const mph = Math.round((tr ? tr.speed() : 0) * 2.237);
    this.text(String(mph), W / 2, H - pad - (small ? 42 : 52), 'd', small ? 32 : 40, null, 'center', { metal: mph > 30 ? HOT : STEEL });
    this.text('MPH', W / 2, H - pad - 10, 'l', 16, PAPER, 'center');
    // damage diagram + basket count
    // (on touch screens the steering pads live bottom-left, so the panel moves up under the score)
    if (cardA > 0) this.listCard(R, pad, pad + (small ? 72 : 84), W, H, cardA);
    if (tr && !(C.touch && cardA > 0)) this.damage(tr, pad, C.touch ? pad + 100 : H - pad - 96);
    // push-off meter
    if (st === 'push') {
      const pw = clamp(G.pushPower / 6, 0, 1), bw = Math.min(256, W * 0.5), bx = W / 2 - bw / 2, by = Math.round(H * 0.64);
      g.fillStyle = 'rgba(22,22,26,.55)'; this.rect(bx - 4, by - 4, bw + 8, 16); g.fillStyle = '#f26a1b'; this.rect(bx, by, bw * pw, 8);
      this.text(C.touch ? 'TAP PUSH TO GET GOING' : 'TAP W TO GET GOING', W / 2, by - 20, 'l', 16, PAPER, 'center', { bold: true });
    }
    // camera toast
    if (this.toast) { this.toast.t += dt; g.globalAlpha = clamp(1.6 - this.toast.t, 0, 1); this.text('CAMERA: ' + this.toast.text, W - pad, narrow ? 100 : pad + 72, 'l', 16, PAPER, 'right', { bold: true }); g.globalAlpha = 1; if (this.toast.t > 1.6) this.toast = null; }
    if (G.flash > 0) { g.fillStyle = `rgba(255,255,255,${G.flash * 0.8})`; g.fillRect(0, 0, W, H); }
  }
  message(m, W, H, small) {
    // one plain style: a dark label with light text; the tannoy gets a small header
    const g = this.g, a = m.t < 0.2 ? m.t / 0.2 : m.t > m.dur - 0.4 ? clamp((m.dur - m.t) / 0.4, 0, 1) : 1, y = Math.round(H * (small ? 0.3 : 0.25));
    g.globalAlpha = a;
    const size = this.fit(m.text, W * 0.84, small ? [16] : [24, 16], 'b'); g.font = `${size}px ${FACE.b}`;
    const tw = g.measureText(m.text).width, bw = Math.round(tw + 32), bh = size + 16, x = Math.round(W / 2 - bw / 2);
    g.fillStyle = 'rgba(22,22,26,.78)'; this.rect(x, y - bh / 2, bw, bh);
    if (m.kind === 'tannoy') { g.fillStyle = '#f26a1b'; this.rect(x, y - bh / 2, bw, 4); this.text('ATTENTION SHOPPERS', W / 2, y - bh / 2 - 12, 'l', 16, PAPER, 'center', { bold: true }); }
    this.text(m.text, W / 2, y, 'b', size, m.kind === 'cheer' ? '#ffd21f' : PAPER, 'center', { shadow: false });
    g.globalAlpha = 1;
  }
  // today's list: down the left on a tall screen; on a short one, a wide compact card across the top
  listCard(R, x, y, W, H, a) {
    const g = this.g, wide = H < 560 && W >= 540, lh = wide ? 22 : 24, sc = wide ? 3 : 2, tc = wide ? 2 : 1;
    const sw = wide ? 124 : 132, tw = wide ? 264 : 256, sRows = Math.ceil(SHOPPING_LIST.length / sc), tRows = Math.ceil(TASKS.length / tc);
    const w = Math.max(sc * sw, tc * tw) + 20, h = 32 + sRows * lh + 12 + tRows * lh + 2;
    if (wide) { x = Math.round(W / 2 - w / 2); y = 60; }
    g.globalAlpha = a;
    g.fillStyle = 'rgba(246,242,231,.95)'; this.rect(x, y, w, h); g.fillStyle = 'rgba(0,0,0,.35)'; this.rect(x + w, y + 8, 8, h); this.rect(x + 8, y + h, w, 8);
    this.text("TODAY'S LIST", x + 12, y + 18, 'l', 16, '#16161a', 'left', { bold: true, shadow: false });
    SHOPPING_LIST.forEach((k, i) => { const cx = x + 12 + (i % sc) * sw, cy = y + 44 + Math.floor(i / sc) * lh; this.tickBox(cx, cy, R.got[k]); this.text(LIST_NAMES[k], cx + 24, cy, 'b', 16, '#16161a', 'left', { shadow: false }); });
    const y0 = y + 44 + sRows * lh + 10; g.fillStyle = 'rgba(22,22,26,.25)'; this.rect(x + 12, y0 - 14, w - 24, 2);
    TASKS.forEach((t, i) => {
      const cx = x + 12 + Math.floor(i / tRows) * tw, cy = y0 + (i % tRows) * lh;
      this.tickBox(cx, cy, R.done[t.id]); this.text(t.id === 'cones' && !R.done.cones && R.cones ? `${t.label} (${R.cones})` : t.label, cx + 24, cy, 'b', 16, '#16161a', 'left', { shadow: false });
    });
    g.globalAlpha = 1;
  }
  // a 16px pixel-art box, ticked in green when done
  tickBox(x, y, done) {
    const g = this.g, p = 2, X = x, Y = y - 8;
    g.fillStyle = '#16161a'; this.rect(X, Y, 16, p); this.rect(X, Y + 14, 16, p); this.rect(X, Y, p, 16); this.rect(X + 14, Y, p, 16);
    if (done) { g.fillStyle = '#1f8a3a'; for (const [cx, cy, w] of [[6, 2, 1], [5, 3, 2], [1, 4, 1], [4, 4, 2], [1, 5, 4], [2, 6, 2]]) this.rect(X + cx * p, Y + cy * p, w * p, p); }
  }
  damage(tr, x, y) {
    const g = this.g, col = h => h > 0.66 ? '#7ccf5a' : h > 0.33 ? '#ffd21f' : '#ff5a3d';
    g.fillStyle = 'rgba(22,22,26,.45)'; this.rect(x, y, 160, 88);
    const ox = x + 8, oy = y + 10;
    // basket outline (top-down), handle at the bottom, in chunky pixels
    g.fillStyle = 'rgba(246,242,231,.22)'; for (let i = 1; i < 5; i++) this.pxLine(ox + 6 + i * 8.5, oy + 2, ox + 5 + i * 9, oy + 48, 2);
    g.fillStyle = col(tr.hp.basket); this.pxLine(ox + 8, oy, ox + 44, oy, 4); this.pxLine(ox + 44, oy, ox + 48, oy + 50, 4); this.pxLine(ox + 48, oy + 50, ox + 4, oy + 50, 4); this.pxLine(ox + 4, oy + 50, ox + 8, oy, 4);
    g.fillStyle = col(tr.hp.handle); this.rect(ox, oy + 60, 52, 4);
    const pos = [[ox + 12, oy + 2], [ox + 40, oy + 2], [ox + 6, oy + 50], [ox + 46, oy + 50]];
    tr.wheels.forEach((w, i) => { const [px, py] = pos[i]; if (w.gone) { g.fillStyle = '#ff5a3d'; this.pxLine(px - 5, py - 5, px + 5, py + 5, 2); this.pxLine(px + 5, py - 5, px - 5, py + 5, 2); } else { g.fillStyle = col(w.hp); this.pxDisc(px, py, 6); } });
    const n = C.shopping.inBasket().length, cap = tr.capacity();
    this.text('BASKET', x + 72, y + 22, 'l', 16, PAPER, 'left', { shadow: false });
    this.text(`${n}/${cap}`, x + 72, y + 52, 'd', 16, null, 'left', { metal: n >= cap ? HOT : GOLD });
  }
}
