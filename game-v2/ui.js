import { C } from './core.js';
import { fmt } from './util.js';
import { LEVELS, LIST_NAMES } from './game.js?v=green-fingers';
const $ = id => document.getElementById(id);
const NOTE = '<svg class="px" viewBox="0 0 8 9" width="16" height="18" aria-hidden="true"><path d="M3 0h3v1h-3zM3 1h1v1h-1zM5 1h2v1h-2zM3 2h1v1h-1zM6 2h1v1h-1zM3 3h1v1h-1zM3 4h1v1h-1zM1 5h3v1h-3zM0 6h4v1h-4zM0 7h4v1h-4zM1 8h2v1h-2z"/></svg>';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor() {
    this.cur = null;
    const menus = {
      bPlay: 'levels', bLevelBack: 'title', bSelBack: 'levels',
      bPauseLevels: 'levels', bResultsLevels: 'levels', bTrolleys: 'select',
    };
    for (const [id, screen] of Object.entries(menus)) {
      $(id).addEventListener('click', () => { C.audio.init(); C.audio.sfx('click'); C.game.toMenu(screen); });
    }
    $('levelCards').addEventListener('click', event => {
      const button = event.target.closest('button[data-level]');
      if (!button || button.disabled) return;
      C.audio.init(); C.audio.sfx('click');
      C.loadLevel(button.dataset.level);
    });
    $('bAgain').addEventListener('click', () => C.game.startRun());
    $('bResume').addEventListener('click', () => this.resume());
    $('bRestart').addEventListener('click', () => C.game.startRun());
    $('select').addEventListener('pointerdown', () => C.audio.init()); // sound can only start after a touch or a key
    $('bMute').addEventListener('click', () => { C.audio.init(); this.toggleMute(); });
    $('bPause').addEventListener('click', () => this.pause());
    this.setMuteBtn();
  }
  show(name) {
    this.cur = name;
    for (const screen of ['title', 'levels', 'select', 'results', 'pause']) $(screen).classList.toggle('hidden', name !== screen);
    $('hudBtns').classList.toggle('hidden', !(name === 'hud' || name === 'pause'));
    if (name === 'levels') { this.levelCards(); $('levels').scrollTop = 0; }
    if (name === 'results') $('bTrolleys').classList.toggle('hidden', !C.game.hasTrolleyChoice());
    this.refreshTouch();
    if (name === 'select') C.select.show();
    const focus = { title: 'bPlay', levels: 'bLevelPlay', select: 'bSelDone', hud: 'gl', pause: 'bResume', results: 'bAgain' };
    $(focus[name])?.focus({ preventScroll: true });
  }
  levelCards() {
    const levels = C.game.save.levels;
    $('levelCards').innerHTML = LEVELS.map(level => {
      const state = levels[level.id], lock = !state.unlocked;
      const count = level.goals.filter(goal => state.goals[goal.id]).length;
      const goals = level.goals.map(goal => `<li${state.goals[goal.id] ? ' class="done"' : ''}>${esc(goal.label)}${state.goals[goal.id] ? '<span class="sr-only"> (complete)</span>' : ''}</li>`).join('');
      const requirement = lock ? `Complete ${level.requires.goals} goals in ${LEVELS.find(option => option.id === level.requires.level).name} to unlock` : '';
      return `<article class="levelCard${lock ? ' locked' : ''}" aria-labelledby="heading-${level.id}">
        <img src="${level.preview}" width="480" height="160" alt="${esc(level.previewAlt)}">
        <div class="levelBody">
          <h3 id="heading-${level.id}">${esc(level.name)}</h3>
          <p class="levelStats"><span>${count}/${level.goals.length} goals</span><span>Best ${fmt(state.best)}</span></p>
          <ul class="levelGoals" aria-label="${esc(level.name)} goals">${goals}</ul>
          ${lock ? `<p class="lockMessage">${esc(requirement)}</p>`
            : `<p class="levelShopping"><strong>Shopping list</strong> ${level.shopping.map(key => esc(LIST_NAMES[key])).join(' · ')}</p>`}
          <button id="${level === LEVELS[0] ? 'bLevelPlay' : 'bGreenPlay'}" class="btn" data-level="${level.id}"${lock ? ' disabled' : ''}>Choose trolley</button>
        </div>
      </article>`;
    }).join('');
  }
  refreshTouch() { const on = C.touch && (this.cur === 'hud'); $('touch').classList.toggle('hidden', !on); document.querySelectorAll('.only-keys').forEach(e => e.classList.toggle('hidden', !!C.touch)); }
  listHTML(R) {
    const li = (label, done, pts) => `<li${done ? ' class="done"' : ''}><span>${esc(label)}</span>${pts ? `<small>+${fmt(pts)}</small>` : ''}</li>`;
    const level = C.game.level;
    const items = level.shopping.map(k => li(LIST_NAMES[k], R?.got[k]));
    const tasks = level.goals.map(t => {
      const count = R?.goalCounts[t.id];
      const label = t.n && count && !R.done[t.id] ? `${t.label} (${count}/${t.n})` : t.label;
      return li(label, R?.done[t.id], R ? 0 : t.pts);
    });
    return `<section><h3>Shopping list</h3><ul>${items.join('')}</ul></section><section><h3>Challenges</h3><ul>${tasks.join('')}</ul></section>`;
  }
  pause() { const G = C.game; if (!(G.state === 'run' || G.state === 'push') || G.paused) return; G.paused = true; C.input.release(); C.audio.alarm(false); $('pauseList').innerHTML = this.listHTML(G.run); this.show('pause'); }
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
    const { shopping: list, shop } = C.game.level;
    const listCount = list.filter(k => R.got[k]).length;
    const shopping = listCount === list.length ? 'Complete' : `${listCount} / ${list.length}`;
    const receipt = $('receipt');
    receipt.innerHTML = `
      <div class="shop">${esc(shop.toUpperCase())}</div><p class="head">${esc(head)}</p><hr>
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
