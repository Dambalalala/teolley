import { C } from './core.js';
import { fmt } from './util.js';
import { ITEMS } from './models.js?v=grumbleton-polish';
import { GRUMBLETON, SHOPPING_LIST, LIST_NAMES, TASKS } from './game.js?v=grumbleton-polish';
const $ = id => document.getElementById(id);
const NOTE = '<svg class="px" viewBox="0 0 8 9" width="16" height="18" aria-hidden="true"><path d="M3 0h3v1h-3zM3 1h1v1h-1zM5 1h2v1h-2zM3 2h1v1h-1zM6 2h1v1h-1zM3 3h1v1h-1zM3 4h1v1h-1zM1 5h3v1h-3zM0 6h4v1h-4zM0 7h4v1h-4zM1 8h2v1h-2z"/></svg>';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor() {
    this.cur = null;
    $('bAgain').addEventListener('click', () => C.game.toBriefing());
    $('bTrolleys').addEventListener('click', () => C.game.toSelect());
    $('bStartRun').addEventListener('click', () => C.game.startRun());
    $('bBriefBack').addEventListener('click', () => C.game.toSelect());
    $('briefLevel').textContent = GRUMBLETON.name;
    $('briefList').innerHTML = this.listHTML();
    $('bResume').addEventListener('click', () => this.resume());
    $('bRestart').addEventListener('click', () => C.game.toBriefing());
    $('select').addEventListener('pointerdown', () => C.audio.init()); // sound can only start after a touch or a key
    $('bMute').addEventListener('click', () => { C.audio.init(); this.toggleMute(); });
    $('bPause').addEventListener('click', () => this.pause());
    this.setMuteBtn();
  }
  show(name) {
    this.cur = name;
    $('select').classList.toggle('hidden', name !== 'select');
    $('briefing').classList.toggle('hidden', name !== 'briefing');
    $('results').classList.toggle('hidden', name !== 'results');
    $('pause').classList.toggle('hidden', name !== 'pause');
    $('hudBtns').classList.toggle('hidden', !(name === 'hud' || name === 'pause'));
    this.refreshTouch();
    if (name === 'select') { C.game.state = 'select'; C.select.show(); try { document.activeElement && document.activeElement.blur(); } catch (e) {} }
    if (name === 'briefing') { $('briefing').scrollTop = 0; $('bStartRun').focus({ preventScroll: true }); }
    if (name === 'hud') $('gl').focus({ preventScroll: true });
    if (name === 'results') $('bAgain').focus({ preventScroll: true });
  }
  refreshTouch() { const on = C.touch && (this.cur === 'hud'); $('touch').classList.toggle('hidden', !on); document.querySelectorAll('.only-keys').forEach(e => e.classList.toggle('hidden', !!C.touch)); }
  listHTML(R) {
    const li = (label, done, pts) => `<li${done ? ' class="done"' : ''}><span>${esc(label)}</span>${pts ? `<small>+${fmt(pts)}</small>` : ''}</li>`;
    const items = SHOPPING_LIST.map(k => li(LIST_NAMES[k], R?.got[k]));
    const tasks = TASKS.map(t => {
      const label = t.id === 'cones' && R?.cones && !R.done.cones ? `${t.label} (${R.cones}/${t.n})` : t.label;
      return li(label, R?.done[t.id], R ? 0 : t.pts);
    });
    return `<section><h3>Shopping list</h3><ul>${items.join('')}</ul></section><section><h3>Challenges</h3><ul>${tasks.join('')}</ul></section>`;
  }
  pause() { const G = C.game; if (!(G.state === 'run' || G.state === 'push') || G.paused) return; G.paused = true; C.input.release(); C.audio.alarm(false); $('pauseList').innerHTML = this.listHTML(G.run); this.show('pause'); setTimeout(() => { try { $('bResume').focus({ preventScroll: true }); } catch (e) {} }, 30); }
  resume() {
    C.game.paused = false;
    C.input.release();
    C.audio.init();
    C.props.refreshAlarm();
    this.show('hud');
  }
  toggleMute() { const S = C.game.save; S.muted = !S.muted; C.game.persist(); C.audio.setMuted(S.muted); this.setMuteBtn(); }
  setMuteBtn() { const m = C.game && C.game.save.muted; $('bMute').setAttribute('aria-pressed', String(!!m)); $('bMute').innerHTML = m ? '×' : NOTE; }
  receipt(d) {
    const R = d.R, L = [], ln = (a, b, cls = '') => L.push(`<div class="ln ${cls}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`);
    const head = { returned: 'TROLLEY RETURNED', pond: 'TROLLEY FOUND IN POND', crash: 'TROLLEY ABANDONED', stopped: 'TROLLEY GAVE UP', void: 'TROLLEY LOST TO THE VOID' }[R.end] || 'RUN OVER';
    const now = new Date();
    L.push(`<div class="shop">SPENDWELLS</div><div class="c">Hill Road, Grumbleton<br>Tel 01632 960 018</div><hr>`);
    L.push(`<div class="head">${esc(head)}</div><div class="c">Trolley: ${esc(d.trolley)}</div><hr>`);
    ln('TOTAL', fmt(d.total), 'tot');
    ln('BEST', fmt(d.best));
    if (d.newBest) L.push(`<div class="new">NEW BEST SCORE</div>`);
    L.push('<hr>');
    L.push('<div class="head">SHOPPING SCANNED</div>');
    const items = Object.entries(R.items);
    for (const [k, n] of items) ln(ITEMS[k].name, `×${n}`);
    if (!items.length) ln('NO SHOPPING', '—');
    if (R.lost) ln(`SHOPPING LOST ×${R.lost}`, '—', 'neg');
    if (R.end === 'returned') ln('TROLLEY DEPOSIT REFUNDED', '£1.00');
    L.push('<hr><div class="head">POINTS</div>');
    if (R.bestCombo) ln('BEST COMBO (INCLUDED)', fmt(R.bestCombo), 'detail');
    if (R.nearMisses) ln(`NEAR MISSES ×${R.nearMisses}`, '', 'detail');
    const br = Object.entries(R.brokenBy).sort((a, b) => b[1] - a[1]).slice(0, 4);
    for (const [n, c] of br) ln(`${n} ×${c}`, '', 'detail');
    ln('TRICKS & COMBOS', fmt(R.score));
    for (const [n, v] of d.bonus) ln(n, fmt(v));
    const listCount = SHOPPING_LIST.filter(k => R.got[k]).length;
    ln(`LIST ${listCount}/${SHOPPING_LIST.length}`, '');
    L.push('<hr>');
    const ticks = Math.floor(R.time * 10);
    ln('TOP SPEED', Math.round(R.maxMph) + ' MPH'); ln('TIME', `${Math.floor(ticks / 600)}:${(ticks % 600 / 10).toFixed(1).padStart(4, '0')}`); ln('LONGEST AIR', R.airMax.toFixed(2) + ' S');
    if (R.wheels) ln('WHEELS LOST', String(R.wheels), 'neg');
    L.push('<hr>');
    ln('LOYALTY POINTS EARNED', fmt(Math.floor(d.total / 100)));
    L.push(`<div class="c">SERVED BY: DAVE<br>${now.toLocaleDateString('en-GB')} ${now.toTimeString().slice(0, 5)}<br>Thank you for shopping with us</div>`);
    for (const u of d.unlocked) L.push(`<div class="stamp">UNLOCKED: ${esc(u)}</div>`);
    $('receipt').innerHTML = L.join('');
    $('receipt').scrollTop = 0;
  }
}
