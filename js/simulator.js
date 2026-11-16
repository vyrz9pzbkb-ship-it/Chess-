import { Board, ARROW, MARK, uciToMove, moveToUci } from './board.js';
import { Engine } from './engine.js';
import { LEVELS } from './levels.js';
import { describeThreat } from './explain.js';
import * as store from './storage.js';
import { $, $$, el, toast, sleep, fetchJSON } from './ui.js';

/* Stockfish strength after the opening -> bot level (see js/levels.js) */
const STRENGTHS = { 400: 2, 600: 3, 800: 4, 1000: 5, 1200: 6, 1500: 7 };
const BOX_INTERVAL = [0, 1, 2, 4, 8, 16];   // sessions until a line is due again, by box

const board = new Board($('#board'));
let engine = null;
const getEngine = () => (engine ||= new Engine());

let data = null;
let sim = store.load('sim', store.SIM_DEFAULTS);
const save = () => store.save('sim', sim);

let openingId = 'london';
let side = 'w';
let game = new Chess();
let node = null;          // current node in the move tree
let phase = 'setup';      // setup | book | play | over
let forced = null;        // line id when drilling a specific line
let token = 0;
let attempt = null;       // {moves, correct, missedHere}
let familyOfLine = null;

/* ---------------- helpers ---------------- */
const lineById = id => data.lines.find(l => l.id === id);
const sideName = c => (c === 'w' ? 'White' : 'Black');
const opening = () => data.openings[openingId];

function setStatus(text, kind = '') {
  $('#status').className = 'status ' + kind;
  $('#status-text').replaceChildren(...[].concat(text));
}
function showWatch(text) {
  $('#watch').classList.toggle('hidden', !text);
  $('#watch-text').textContent = text || '';
}
function showPlan(text) {
  $('#plan').classList.toggle('hidden', !text);
  $('#plan-text').textContent = cap((text || '').replace(/^Change of plan:\s*/, ''));
}
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const why = node => cap((node.p || node.n || '').replace(/^Change of plan:\s*/, ''));
function showFeedback(parts, kind) {
  const f = $('#feedback');
  if (!parts) { f.classList.add('hidden'); return; }
  f.classList.remove('hidden');
  f.style.borderLeftColor = kind === 'bad' ? 'var(--danger)' : 'var(--accent)';
  f.replaceChildren(...parts);
}

function renderMoves() {
  const box = $('#moves');
  box.replaceChildren();
  game.history().forEach((san, i) => {
    if (i % 2 === 0) box.append(el('div', { class: 'num' }, `${i / 2 + 1}.`));
    box.append(el('div', { class: 'mv' + (i === game.history().length - 1 ? ' cur' : '') }, san));
  });
  box.scrollTop = box.scrollHeight;
}

/* ---------------- spaced repetition ---------------- */
function lineStats(id) {
  return sim.lines[id] || { attempts: 0, moves: 0, correct: 0, box: 0, due: 0, perfect: 0 };
}

/** How keen we are to show this line now. Unseen and due lines win; lines you
 *  keep getting wrong sit in box 1 and come back every session. */
function lineWeight(id) {
  const l = lineById(id);
  const s = lineStats(id);
  if (!s.attempts) return l.w * 2;
  const acc = s.moves ? s.correct / s.moves : 1;
  if (s.due <= sim.session) return l.w * (1 + (5 - s.box)) * (1 + 2 * (1 - acc));
  return l.w * 0.15;
}

function pickChild(n) {
  if (forced) {
    const c = n.c.find(x => x.l.includes(forced));
    if (c) return c;
  }
  const weights = n.c.map(c => c.l.reduce((sum, id) => sum + lineWeight(id), 0));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n.c.length; i++) { r -= weights[i]; if (r <= 0) return n.c[i]; }
  return n.c[n.c.length - 1];
}

function weakestLines() {
  return data.lines
    .filter(l => l.opening === openingId)
    .map(l => {
      const s = lineStats(l.id);
      return { l, s, acc: s.moves ? s.correct / s.moves : null };
    })
    .sort((a, b) => {
      if (a.acc === null && b.acc === null) return 0;
      if (a.acc === null) return 1;
      if (b.acc === null) return -1;
      return a.acc - b.acc || a.s.box - b.s.box;
    });
}

function recordLine(lineId) {
  const s = Object.assign(lineStats(lineId), {});
  s.attempts++;
  s.moves += attempt.moves;
  s.correct += attempt.correct;
  const perfect = attempt.correct === attempt.moves;
  if (perfect) { s.perfect++; s.box = Math.min(5, s.box + 1); }
  else s.box = 1;
  s.due = sim.session + BOX_INTERVAL[s.box];
  s.last = Date.now();
  sim.lines[lineId] = s;
  const o = sim.openings[openingId] || (sim.openings[openingId] = { moves: 0, correct: 0, lines: 0 });
  o.moves += attempt.moves; o.correct += attempt.correct; o.lines++;
  save();
  renderAccuracy();
  return perfect;
}

/* ---------------- setup ---------------- */
function renderSetup() {
  $$('#opening-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.op === openingId)));
  $('#op-blurb').textContent = data ? opening().blurb : '';
  $('#sim-levels').replaceChildren(...Object.keys(STRENGTHS).map(elo => el('button', {
    'aria-pressed': String(+elo === sim.level),
    onclick: () => { sim.level = +elo; save(); renderSetup(); },
  }, elo)));
}

function renderAccuracy() {
  if (!data) return;
  const o = sim.openings[openingId] || { moves: 0, correct: 0, lines: 0 };
  const g = sim.games[openingId] || { w: 0, l: 0, d: 0 };
  const lines = data.lines.filter(l => l.opening === openingId);
  const seen = lines.filter(l => lineStats(l.id).attempts).length;
  const mastered = lines.filter(l => lineStats(l.id).box >= 3).length;
  $('#acc-summary').replaceChildren(
    el('dt', {}, `${opening().name} accuracy`), el('dd', {}, o.moves ? Math.round(100 * o.correct / o.moves) + '%' : '–'),
    el('dt', {}, 'Lines seen'), el('dd', {}, `${seen} / ${lines.length}`),
    el('dt', {}, 'Lines mastered'), el('dd', {}, String(mastered)),
    el('dt', {}, 'After the opening (W-L-D)'), el('dd', {}, `${g.w}-${g.l}-${g.d}`),
  );
  const rows = weakestLines().slice(0, 8).map(({ l, s, acc }) => el('div', { class: 'review-item' },
    el('div', { class: 'line-row' },
      el('div', {}, el('div', { class: 'line1' }, l.name),
        el('div', { class: 'meta' }, acc === null ? 'Not seen yet' : `${Math.round(acc * 100)}% · ${s.attempts} tries · box ${s.box}/5`)),
      el('button', { class: 'btn sm', onclick: () => startLine(l.id) }, 'Drill'))));
  $('#line-list').replaceChildren(...rows);
}

/* ---------------- book phase ---------------- */
async function startLine(drillId = null) {
  const t = ++token;
  if (engine) engine.stop();
  if (drillId) openingId = lineById(drillId).opening;
  forced = drillId;
  side = opening().side;
  sim.session++;
  save();
  game = new Chess();
  node = data.trees[openingId];
  phase = 'book';
  attempt = { moves: 0, correct: 0, missedHere: false };
  familyOfLine = null;
  $('#setup').classList.add('hidden');
  $('#game').classList.remove('hidden');
  $('#plans').classList.add('hidden');
  $('#btn-hint').classList.remove('hidden');
  $('#btn-hint').textContent = 'Show move';
  $('#btn-hint').disabled = false;
  $('#btn-resign').classList.add('hidden');
  showWatch('');
  showPlan('');
  showFeedback(null);
  $('#learn').classList.add('hidden');
  $('#game-meta').textContent = drillId ? `Drilling: ${lineById(drillId).name}` : `${opening().name} · you play ${sideName(side)}`;
  await board.setOrientation(side);
  await board.sync(game, false);
  renderMoves();
  renderAccuracy();
  if (window.matchMedia('(max-width: 900px)').matches) $('.board-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  board.enableInput(game, side, onUserMove);
  bookStep(t);
}

function bookProgress() {
  $('#book-progress').style.width = Math.min(100, (100 * game.history().length) / 20) + '%';
}

async function bookStep(t) {
  bookProgress();
  if (!node.c.length) return finishBook();
  if (game.turn() === side) {
    attempt.missedHere = false;
    const num = Math.ceil((game.history().length + 1) / 2);
    const next = node.c[0];
    showPlan(next.p || '');
    setStatus(next.p ? `Move ${num}: the plan changes here. Find the right move.` : `Move ${num}: play your next setup move.`, 'turn-' + side);
    return;
  }
  await sleep(game.history().length ? 550 : 300);
  if (t !== token) return;
  const child = pickChild(node);
  game.move(uciToMove(child.u));
  node = child;
  await board.sync(game, true);
  if (t !== token) return;
  renderMoves();
  const threat = child.x || describeThreat(Chess, game.fen());
  showWatch(threat);
  bookStep(t);
}

async function onUserMove(move) {
  if (phase === 'play') return onPlayMove(move);
  if (phase !== 'book' || !node.c.length || game.turn() === side) return false;
  const expected = node.c[0];
  const uci = moveToUci(move);
  if (uci !== expected.u) {
    if (!attempt.missedHere) { attempt.missedHere = true; attempt.moves++; }
    const m = uciToMove(expected.u);
    setTimeout(() => board.arrow(ARROW.hint, m.from, m.to), 30);
    $('#board').classList.add('shake');
    setTimeout(() => $('#board').classList.remove('shake'), 300);
    showFeedback([el('span', { class: 'san', style: 'color:var(--danger)' }, `Not ${move.san}.`), `Play ${expected.m}: ${why(expected)}`], 'bad');
    setStatus(`Play ${expected.m} (follow the arrow).`, 'bad');
    return false;
  }
  if (!attempt.missedHere) { attempt.moves++; attempt.correct++; }
  showFeedback([el('span', { class: 'san' }, `✓ ${expected.m}`), why(expected)]);
  showWatch('');
  showPlan('');
  node = expected;
  renderMoves();
  bookStep(token);
  return true;
}

function showMoveHint() {
  if (phase === 'book' && node.c.length && game.turn() === side) {
    const e = node.c[0];
    if (!attempt.missedHere) { attempt.missedHere = true; attempt.moves++; }
    const m = uciToMove(e.u);
    board.clearArrows();
    board.arrow(ARROW.hint, m.from, m.to);
    showFeedback([el('span', { class: 'san' }, e.m), why(e)]);
    setStatus(`Play ${e.m} on the board.`, 'info');
  } else if (phase === 'play') playHint();
}

function finishBook() {
  showPlan('');
  const lineId = node.l[0];
  const line = lineById(lineId);
  familyOfLine = line.family;
  const perfect = recordLine(lineId);
  const pct = attempt.moves ? Math.round(100 * attempt.correct / attempt.moves) : 100;
  showWatch('');
  showFeedback([el('span', { class: 'san' }, perfect ? 'Perfect!' : `${pct}%`),
    `${line.name}: ${attempt.correct}/${attempt.moves} moves right first time. ${perfect ? 'This line moves up a box and will come back later.' : 'You\'ll see this line again soon.'}`]);
  if (perfect) toast('Line played perfectly ✓', 'good');
  renderPlans();
  startPlay();
}

/* ---------------- play-on phase ---------------- */
function renderPlans() {
  const fam = familyOfLine || (openingId === 'london' ? 'london' : 'caro');
  const names = { london: 'London System', caro: 'Caro-Kann', blacklondon: 'London setup as Black' };
  $('#plans-name').textContent = names[fam];
  $('#plans-list').replaceChildren(...data.plans[fam].map(p => el('li', {}, el('b', {}, p.title), el('span', {}, p.text))));
  $('#plans').classList.remove('hidden');
}

function startPlay() {
  phase = 'play';
  $('#btn-resign').classList.remove('hidden');
  $('#btn-hint').textContent = 'Hint';
  $('#btn-hint').disabled = false;
  $('#game-meta').textContent = `Opening done. Play on against Stockfish (~${sim.level}).`;
  $('#book-progress').style.width = '100%';
  getEngine();
  playStep(token);
}

function checkOver() {
  if (!game.game_over()) return false;
  let res, text;
  if (game.in_checkmate()) {
    res = game.turn() === side ? 'l' : 'w';
    text = res === 'w' ? 'Checkmate. You win! 🎉' : 'Checkmate. Stockfish wins.';
  } else { res = 'd'; text = 'Draw.'; }
  endPlay(res, text);
  return true;
}

function endPlay(res, text) {
  phase = 'over';
  token++;
  board.disableInput();
  const g = sim.games[openingId] || (sim.games[openingId] = { w: 0, l: 0, d: 0 });
  g[res]++;
  save();
  renderAccuracy();
  setStatus(text, res === 'w' ? 'good' : res === 'l' ? 'bad' : 'info');
  $('#btn-resign').classList.add('hidden');
  $('#btn-hint').disabled = true;
}

async function playStep(t) {
  if (checkOver()) return;
  if (game.turn() === side) { setStatus('Your move. Follow one of the plans below.', 'turn-' + side); return; }
  setStatus('Stockfish is thinking…', 'turn-' + game.turn());
  const cfg = LEVELS[STRENGTHS[sim.level]];
  const started = performance.now();
  let uci;
  const legal = game.moves({ verbose: true });
  if (Math.random() < cfg.random) uci = moveToUci(legal[Math.floor(Math.random() * legal.length)]);
  else {
    const res = await getEngine().analyse(game.fen(), { depth: cfg.depth, movetime: cfg.movetime, skill: cfg.skill });
    uci = res.bestmove || moveToUci(legal[0]);
  }
  const wait = 400 - (performance.now() - started);
  if (wait > 0) await sleep(wait);
  if (t !== token) return;
  game.move(uciToMove(uci));
  await board.sync(game, true);
  renderMoves();
  const threat = describeThreat(Chess, game.fen());
  showWatch(threat);
  playStep(t);
}

function onPlayMove() {
  if (game.turn() === side) return false;     // move already applied: turn flipped
  showWatch('');
  showFeedback(null);
  renderMoves();
  playStep(token);
  return true;
}

async function playHint() {
  if (phase !== 'play' || game.turn() !== side) return;
  const fen = game.fen();
  $('#btn-hint').disabled = true;
  const res = await getEngine().analyse(fen, { depth: 14, movetime: 1200, skill: 20 });
  $('#btn-hint').disabled = false;
  if (fen !== game.fen() || !res.bestmove) return;
  const m = uciToMove(res.bestmove);
  board.clearArrows();
  board.arrow(ARROW.hint, m.from, m.to);
  const san = new Chess(fen).move(m).san;
  setStatus(`Stockfish suggests ${san}.`, 'info');
}

/* ---------------- learn mode ---------------- */
let learnStep = 0;
function flipTurn(g) {
  const parts = g.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-';
  g.load(parts.join(' '));
}
function startLearn() {
  token++;
  if (engine) engine.stop();
  phase = 'learn';
  side = opening().side;
  board.disableInput();
  $('#setup').classList.add('hidden');
  $('#game').classList.add('hidden');
  $('#plans').classList.add('hidden');
  $('#learn').classList.remove('hidden');
  $('#learn-name').textContent = opening().name;
  const steps = data.setup[openingId];
  $('#learn-list').replaceChildren(...steps.map((s, i) => el('li', { onclick: () => showLearn(i + 1) }, el('b', {}, s.san), s.why)));
  // real examples of changes of plan, taken from the move tree
  const seen = new Set();
  const examples = [];
  (function walk(n) {
    for (const c of n.c) {
      if (c.p && !seen.has(c.m) && examples.length < 6) { seen.add(c.m); examples.push(c); }
      walk(c);
    }
  })(data.trees[openingId]);
  $('#learn-changes').replaceChildren(...examples.map(c => el('li', {}, el('b', {}, c.m + ': '), why(c))));
  board.setOrientation(side);
  showLearn(0);
}
async function showLearn(n) {
  const steps = data.setup[openingId];
  learnStep = Math.max(0, Math.min(steps.length, n));
  const g = new Chess();
  if (side === 'b') flipTurn(g);
  for (let i = 0; i < learnStep; i++) { g.move({ from: steps[i].uci.slice(0, 2), to: steps[i].uci.slice(2, 4) }); flipTurn(g); }
  await board.cb.setPosition(g.fen(), true);
  board.clearArrows();
  board.unmark(MARK.last);
  if (learnStep > 0) {
    const st = steps[learnStep - 1];
    board.mark(MARK.last, st.uci.slice(0, 2)); board.mark(MARK.last, st.uci.slice(2, 4));
  }
  if (learnStep < steps.length) {
    const nx = steps[learnStep];
    board.arrow(ARROW.hint, nx.uci.slice(0, 2), nx.uci.slice(2, 4));
  }
  $('#learn-note').replaceChildren(learnStep === 0
    ? `Your ${opening().name} setup has ${steps.length} moves. Press ▶ to see them one by one (the opponent's moves are left out, so you see only your own plan).`
    : el('span', {}, el('span', { class: 'san' }, `${learnStep}. ${steps[learnStep - 1].san}`), steps[learnStep - 1].why));
  $$('#learn-list li').forEach((li, i) => li.classList.toggle('cur', i === learnStep - 1));
  $('#learn-prev').disabled = learnStep === 0;
  $('#learn-next').disabled = learnStep === steps.length;
}

/* ---------------- wiring ---------------- */
$$('#opening-seg button').forEach(b => b.addEventListener('click', () => {
  openingId = b.dataset.op;
  settingsSave();
  renderSetup();
  renderAccuracy();
  board.setOrientation(data.openings[openingId].side);
}));
function settingsSave() { const s = store.load('settings', store.SETTINGS_DEFAULTS); s.simOpening = openingId; store.save('settings', s); }

$('#btn-start').addEventListener('click', () => startLine());
$('#btn-learn').addEventListener('click', startLearn);
$('#learn-prev').addEventListener('click', () => showLearn(learnStep - 1));
$('#learn-next').addEventListener('click', () => showLearn(learnStep + 1));
$('#learn-quiz').addEventListener('click', () => startLine());
$('#learn-back').addEventListener('click', () => {
  $('#learn').classList.add('hidden');
  $('#setup').classList.remove('hidden');
  phase = 'setup';
  board.sync(new Chess(), false);
});
document.addEventListener('keydown', (e) => {
  if (phase !== 'learn' || e.target.closest('select, input')) return;
  if (e.key === 'ArrowRight') showLearn(learnStep + 1);
  if (e.key === 'ArrowLeft') showLearn(learnStep - 1);
});
$('#btn-drill').addEventListener('click', () => {
  const w = weakestLines().find(x => x.acc !== null && x.acc < 1) || weakestLines().find(x => x.acc === null);
  if (!w) { toast('Every line here is perfect so far. Starting a random line.'); return startLine(); }
  startLine(w.l.id);
});
$('#btn-hint').addEventListener('click', showMoveHint);
$('#btn-restart').addEventListener('click', () => startLine(forced || (node && node.l && node.l.length === 1 ? node.l[0] : null)));
$('#btn-next').addEventListener('click', () => startLine());
$('#btn-resign').addEventListener('click', () => { if (phase === 'play' && confirm('Resign this game?')) endPlay('l', 'You resigned.'); });
$('#btn-setup').addEventListener('click', () => {
  token++;
  if (engine) engine.stop();
  phase = 'setup';
  board.disableInput();
  showWatch('');
  $('#game').classList.add('hidden');
  $('#plans').classList.add('hidden');
  $('#setup').classList.remove('hidden');
  renderSetup();
});

(async function init() {
  try {
    data = await fetchJSON('data/simulator.json');
  } catch (e) {
    $('#op-blurb').textContent = 'Could not load the opening tree. Serve the site over http(s), not file://.';
    return;
  }
  const s = store.load('settings', store.SETTINGS_DEFAULTS);
  if (data.openings[s.simOpening]) openingId = s.simOpening;
  if (!STRENGTHS[sim.level]) sim.level = 800;
  renderSetup();
  renderAccuracy();
  await board.setOrientation(opening().side);
})();
