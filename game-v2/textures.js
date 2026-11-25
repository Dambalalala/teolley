import { C } from './core.js';
import { rng } from './util.js';
const T = C.T;

// Small canvas textures: low resolution and bilinear filtered, the way a PS2 game would have done it.
export function ctex(w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = o.clamp ? T.ClampToEdgeWrapping : T.RepeatWrapping;
  t.anisotropy = o.aniso || 4;
  if (o.nearest) { t.magFilter = T.NearestFilter; t.minFilter = T.NearestMipMapLinearFilter; }
  t.userData = { canvas: c };
  return t;
}
function speckle(g, w, h, seed, n, cols, size = 1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; const s = size * (0.5 + r()); g.fillRect(r() * w, r() * h, s, s); }
}
function fill(g, w, h, c) { g.fillStyle = c; g.fillRect(0, 0, w, h); }

function asphalt(seed, base, aggregate) {
  return ctex(128, 128, (g, w, h) => {
    fill(g, w, h, base);
    // Keep the aggregate low contrast so the road stays even under moving mipmaps.
    speckle(g, w, h, seed, 700, ['rgba(22,24,25,.10)', 'rgba(208,204,194,.08)'], 2.6);
    speckle(g, w, h, seed + 1, 3800, aggregate, 0.95);
  });
}

const TX = {};
export function buildTextures() {
  TX.asphalt = asphalt(1, '#595b5d', ['#444647', '#656664', '#797771', '#6c6c6a', '#4c4d4b']);
  TX.tarmac = asphalt(12, '#494b4d', ['#3e4041', '#575859', '#62615e', '#484949']);
  TX.pavement = ctex(128, 128, (g, w, h) => {
    fill(g, w, h, '#8e8b82');
    const r = rng(9), colours = ['#b0aea6', '#a9a7a0', '#b3b0a7', '#a6a49d'];
    for (let y = 0; y < h; y += 32) {
      for (let x = 0; x < w; x += 32) {
        g.fillStyle = colours[Math.floor(r() * colours.length)];
        g.fillRect(x + 1, y + 1, 31, 31);
        g.fillStyle = 'rgba(242,239,229,.27)';
        g.fillRect(x + 1, y + 1, 31, 1);
        g.fillRect(x + 1, y + 2, 1, 30);
      }
    }
    speckle(g, w, h, 3, 1600, ['rgba(93,89,81,.16)', 'rgba(240,236,225,.21)'], 1.1);
  });
  TX.kerb = ctex(64, 32, (g, w, h) => { fill(g, w, h, '#c6c2b7'); speckle(g, w, h, 4, 300, ['#b5b1a6', '#d2cec4'], 1); g.fillStyle = '#8f8b82'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 1, h); });
  const brick = (base, seed) => ctex(128, 128, (g, w, h) => {
    fill(g, w, h, '#b9b0a0'); const r = rng(seed);
    for (let y = 0; y < 16; y++) for (let x = -1; x < 5; x++) {
      const ox = (y % 2) * 16, c = base[Math.floor(r() * base.length)]; g.fillStyle = c; g.fillRect(x * 32 + ox + 1, y * 8 + 1, 30, 6);
      g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.fillRect(x * 32 + ox + 1, y * 8 + 1, 30, 6);
    }
    speckle(g, w, h, seed + 1, 500, ['rgba(0,0,0,.15)', 'rgba(255,255,255,.12)'], 1);
  });
  TX.brick = brick(['#8f4632', '#9c5039', '#a65b41', '#83402e', '#94503a', '#7c3a2a'], 11);
  TX.brickY = brick(['#c7a26c', '#b99563', '#d2b07a', '#bf9a66', '#a8885a'], 12);
  TX.brickB = brick(['#6b3a2e', '#7a4433', '#5c3228', '#8a5038'], 13);
  TX.render = ctex(64, 64, (g, w, h) => { fill(g, w, h, '#efe9dc'); speckle(g, w, h, 5, 700, ['#e4ddcf', '#f6f1e6', '#ddd5c6'], 1.5); });
  TX.roof = ctex(128, 128, (g, w, h) => {
    fill(g, w, h, '#3c4048'); const r = rng(21);
    for (let y = 0; y < 16; y++) for (let x = -1; x < 9; x++) { const v = 52 + Math.floor(r() * 22); g.fillStyle = `rgb(${v},${v + 4},${v + 12})`; g.fillRect(x * 16 + (y % 2) * 8 + 1, y * 8 + 1, 14, 7); }
  });
  TX.roofTile = ctex(128, 128, (g, w, h) => {
    fill(g, w, h, '#6b2e22'); const r = rng(22);
    for (let y = 0; y < 16; y++) for (let x = -1; x < 9; x++) { const v = Math.floor(r() * 30); g.fillStyle = `rgb(${130 + v},${58 + v / 2},${40 + v / 3})`; g.fillRect(x * 16 + (y % 2) * 8 + 1, y * 8 + 1, 14, 7); }
  });
  TX.grass = ctex(128, 128, (g, w, h) => { fill(g, w, h, '#6f9b48'); speckle(g, w, h, 6, 3000, ['#628c3e', '#7aa853', '#5a8238', '#86b25d', '#6a9444'], 1.4); });
  TX.dirt = ctex(128, 128, (g, w, h) => { fill(g, w, h, '#8a6d4b'); speckle(g, w, h, 7, 2400, ['#7a5f40', '#9a7b56', '#6e5438', '#a3896a', '#8f8f86'], 1.6); });
  TX.wood = ctex(64, 64, (g, w, h) => { fill(g, w, h, '#9b7148'); for (let y = 0; y < h; y += 8) { g.fillStyle = y % 16 ? '#8c6540' : '#a57a4e'; g.fillRect(0, y, w, 7); } speckle(g, w, h, 8, 200, ['rgba(60,35,15,.3)'], 1); });
  TX.hedge = ctex(64, 64, (g, w, h) => { fill(g, w, h, '#3d6b2f'); speckle(g, w, h, 9, 1400, ['#335c27', '#4a7d38', '#2c5222', '#5a8c44'], 2.2); });
  TX.water = ctex(128, 128, (g, w, h) => {
    fill(g, w, h, '#4f7f86'); const r = rng(10);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(220,240,240,${0.08 + r() * 0.15})`; g.lineWidth = 1; g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 3, x + 16, y); g.stroke(); }
  });
  TX.wire = ctex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#e8e8ea'; for (let i = 0; i < 64; i += 8) { g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); } }, { nearest: false });
  TX.mesh = ctex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#d8dcd6'; for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); } });
  TX.glass = ctex(32, 32, (g, w, h) => { fill(g, w, h, '#9fb9c4'); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(4, 30); g.lineTo(14, 2); g.lineTo(20, 2); g.lineTo(10, 30); g.fill(); });
  return TX;
}
export { TX };

// ---------- signs & labels ----------
export function signTex(w, h, draw) { return ctex(w, h, draw, { clamp: true, aniso: 8 }); }
const FONT = '"Barlow Condensed","Arial Narrow",Arial,sans-serif';
const DISP = '"Bungee","Arial Black",Impact,sans-serif';
export function textFit(g, text, x, y, maxW, size, font = FONT, weight = '700') {
  let s = size; g.font = `${weight} ${s}px ${font}`; while (g.measureText(text).width > maxW && s > 6) { s -= 1; g.font = `${weight} ${s}px ${font}`; } g.fillText(text, x, y);
}
export function plainSign(lines, o = {}) {
  const w = o.w || 256, h = o.h || 128;
  return signTex(w, h, (g) => {
    g.fillStyle = o.border || '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = o.bg || '#ffffff'; g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = o.fg || '#111111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length, lh = (h - 20) / n;
    lines.forEach((ln, i) => { const big = Array.isArray(ln) ? ln[1] : (i === 0 ? (o.size || lh * 0.8) : lh * 0.62); const t = Array.isArray(ln) ? ln[0] : ln; textFit(g, t, w / 2, 10 + lh * (i + 0.55), w - 24, big, o.font || FONT); });
  });
}
export function limitSign(n) {
  return signTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#d0202a'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 47, 0, 7); g.fill(); g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 58px ${FONT}`; g.fillText(String(n), 64, 68); });
}
export function warnSign(kind) {
  return signTex(128, 116, (g, w, h) => {
    g.clearRect(0, 0, w, h); const tri = (inset, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(64, 4 + inset * 1.6); g.lineTo(124 - inset * 1.4, 112 - inset * 0.8); g.lineTo(4 + inset * 1.4, 112 - inset * 0.8); g.closePath(); g.fill(); };
    tri(0, '#d0202a'); tri(12, '#ffffff'); g.fillStyle = '#111'; g.strokeStyle = '#111'; g.lineWidth = 5; g.lineCap = 'round';
    if (kind === 'works') { g.beginPath(); g.arc(56, 50, 5, 0, 7); g.fill(); g.beginPath(); g.moveTo(56, 56); g.lineTo(60, 76); g.lineTo(52, 92); g.moveTo(60, 76); g.lineTo(68, 92); g.moveTo(57, 62); g.lineTo(74, 70); g.stroke(); g.beginPath(); g.moveTo(74, 70); g.lineTo(82, 92); g.stroke(); g.fillRect(76, 90, 18, 4); g.beginPath(); g.moveTo(40, 92); g.lineTo(48, 82); g.lineTo(52, 92); g.fill(); }
    else if (kind === 'humps') { g.beginPath(); g.moveTo(34, 88); g.lineTo(46, 88); g.quadraticCurveTo(64, 54, 82, 88); g.lineTo(94, 88); g.stroke(); }
    else if (kind === 'children') { for (const [x, s] of [[52, 1], [76, 0.85]]) { g.beginPath(); g.arc(x, 52 + (1 - s) * 10, 6 * s, 0, 7); g.fill(); g.beginPath(); g.moveTo(x, 60); g.lineTo(x, 80); g.lineTo(x - 7 * s, 94); g.moveTo(x, 80); g.lineTo(x + 7 * s, 94); g.moveTo(x - 8 * s, 66); g.lineTo(x + 8 * s, 70); g.stroke(); } }
    else if (kind === 'roundabout') { g.lineWidth = 6; for (let i = 0; i < 3; i++) { const a = i * 2.094 - 1.2; g.beginPath(); g.arc(64, 72, 18, a, a + 1.4); g.stroke(); const ex = 64 + Math.cos(a + 1.4) * 18, ey = 72 + Math.sin(a + 1.4) * 18; g.beginPath(); g.arc(ex, ey, 5, 0, 7); g.fill(); } }
    else if (kind === 'ducks') { g.beginPath(); g.ellipse(64, 78, 22, 11, 0, 0, 7); g.fill(); g.beginPath(); g.arc(82, 60, 8, 0, 7); g.fill(); g.fillRect(88, 58, 12, 4); }
  });
}
export function giveWay() {
  return signTex(128, 116, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#d0202a'; g.beginPath(); g.moveTo(4, 6); g.lineTo(124, 6); g.lineTo(64, 112); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(22, 16); g.lineTo(106, 16); g.lineTo(64, 90); g.closePath(); g.fill(); g.fillStyle = '#111'; g.textAlign = 'center'; g.font = `700 17px ${FONT}`; g.fillText('GIVE', 64, 36); g.fillText('WAY', 64, 54); });
}
export function chevron() {
  return signTex(128, 64, (g, w, h) => { fill(g, w, h, '#111'); g.strokeStyle = '#fff'; g.lineWidth = 9; for (let x = 18; x < 128; x += 36) { g.beginPath(); g.moveTo(x, 10); g.lineTo(x + 18, 32); g.lineTo(x, 54); g.stroke(); } });
}
export function fascia(text, o = {}) {
  const w = o.w || 512, h = o.h || 96;
  return signTex(w, h, (g) => {
    fill(g, w, h, o.bg || '#f26a1b');
    if (o.stripe) { g.fillStyle = o.stripe; g.fillRect(0, h - 14, w, 14); }
    g.fillStyle = o.fg || '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    textFit(g, text, w / 2, h / 2 - (o.stripe ? 5 : 0) + 3, w - 30, o.size || h * 0.62, o.font || DISP, o.weight || '400');
    if (o.sub) { g.font = `700 ${h * 0.18}px ${FONT}`; g.fillText(o.sub, w / 2, h - 22); }
  });
}

// shopping labels
export function labelTex(kind) {
  return signTex(128, 64, (g, w, h) => {
    if (kind === 'milk') { fill(g, w, h, '#f4f4f0'); g.fillStyle = '#2f9a4a'; g.fillRect(0, 22, w, 18); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `700 15px ${FONT}`; g.fillText('SEMI-SKIMMED  4 PINTS', 64, 36); }
    else if (kind === 'loo') { fill(g, w, h, '#ffffff'); g.fillStyle = '#7cc0e8'; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(8 + i * 16, 50, 5, 0, 7); g.fill(); } g.fillStyle = '#1b4f9c'; g.textAlign = 'center'; g.font = `700 16px ${FONT}`; g.fillText('9 ROLLS  SOFT', 64, 24); }
    else if (kind === 'reduced') { g.clearRect(0, 0, w, h); g.fillStyle = '#ffd21f'; g.beginPath(); g.ellipse(64, 32, 62, 30, 0, 0, 7); g.fill(); g.fillStyle = '#c4161c'; g.textAlign = 'center'; g.font = `700 22px ${FONT}`; g.fillText('REDUCED', 64, 30); g.font = `700 14px ${FONT}`; g.fillText('TO CLEAR', 64, 48); }
    else if (kind === 'plate') { fill(g, w, h, '#f26a1b'); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; textFit(g, 'SPENDWELLS', 64, 34, 116, 28, DISP, '400'); }
    else if (kind === 'plateR') { fill(g, w, h, '#c81e1e'); g.fillStyle = '#ffd21f'; g.textAlign = 'center'; g.textBaseline = 'middle'; textFit(g, 'SPEED DEMON', 64, 34, 118, 26, DISP, '400'); }
    else if (kind === 'plateT') { fill(g, w, h, '#2f4d34'); g.fillStyle = '#e8e2c8'; g.textAlign = 'center'; g.textBaseline = 'middle'; textFit(g, 'TRADE ONLY', 64, 34, 118, 26, DISP, '400'); }
    else if (kind === 'tampons') { fill(g, w, h, '#f4f6f8'); g.fillStyle = '#2aa3a0'; g.fillRect(0, 40, w, 24); g.fillStyle = '#1d3d6f'; g.textAlign = 'center'; g.font = `700 19px ${FONT}`; g.fillText('TAMPONS', 64, 28); g.fillStyle = '#fff'; g.font = `700 13px ${FONT}`; g.fillText('REGULAR · 20', 64, 56); }
    else if (kind === 'plateG') { fill(g, w, h, '#2f7a3a'); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; textFit(g, 'PLANTASTIC', 64, 34, 118, 26, DISP, '400'); }
    else if (kind === 'plateP') { fill(g, w, h, '#7a2f24'); g.fillStyle = '#efe2c2'; g.textAlign = 'center'; g.textBaseline = 'middle'; textFit(g, 'EST. 1987', 64, 34, 118, 26, DISP, '400'); }
  });
}
