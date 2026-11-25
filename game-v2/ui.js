import { C } from './core.js';
import { fmt } from './util.js';
import { GRUMBLETON, SHOPPING_LIST, LIST_NAMES, TASKS } from './game.js?v=roadworks-graffiti';
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
    if (name === 'briefing' || name === 'results') {
      $(name === 'briefing' ? 'bBriefBack' : 'bTrolleys').classList.toggle('hidden', !C.game.hasTrolleyChoice());
    }
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
    const R = d.R;
    const head = { returned: 'TROLLEY RETURNED', pond: 'TROLLEY FOUND IN POND', crash: 'TROLLEY ABANDONED', stopped: 'TROLLEY GAVE UP', void: 'TROLLEY LOST TO THE VOID' }[R.end] || 'RUN OVER';
    const listCount = SHOPPING_LIST.filter(k => R.got[k]).length;
    const shopping = listCount === SHOPPING_LIST.length ? 'Complete' : `${listCount} / ${SHOPPING_LIST.length}`;
    const receipt = $('receipt');
    receipt.innerHTML = `
      <div class="shop">SPENDWELLS</div><p class="head">${esc(head)}</p><hr>
      <div class="receiptScore${d.newBest ? ' new' : ''}">
        <h2>${d.newBest ? 'New high score' : 'High score'}</h2><strong>${fmt(d.best)}</strong>
      </div>
      <hr><dl>
        <div><dt>This run</dt><dd>${fmt(d.total)}</dd></div>
        <div><dt>Shopping list</dt><dd>${shopping}</dd></div>
        <div><dt>Top speed</dt><dd>${Math.round(R.maxMph)} mph</dd></div>
      </dl>
      ${R.end === 'returned' ? '<p class="refund">£1 deposit refunded</p>' : ''}
      ${d.unlocked.map(name => `<p class="stamp">${esc(name)} unlocked</p>`).join('')}`;
    receipt.scrollTop = 0;
  }
}
