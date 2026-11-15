import { Board, ARROW, MARK, uciToMove, moveToUci } from './board.js';
import * as store from './storage.js';
import { $, el, toast, sleep, fetchJSON } from './ui.js';

let openings = [];
let progress = store.load('openings', store.OPENING_DEFAULTS);
const board = new Board($('#board'));

let op = null, lineIdx = 0, mode = 'learn';
let game = new Chess();
let step = 0;                 // learn mode: number of plies shown
let quiz = null;              // quiz state
let token = 0;                // invalidates pending async quiz steps

const line = () => op.lines[lineIdx];
const key = (o = op, i = lineIdx) => `${o.id}/${i}`;
const lineProgress = (o, i) => progress.lines[key(o, i)] || {};

function setStatus(text, kind = 'info') {
  $('#status').className = 'status ' + kind;
  $('#status-text').textContent = text;
}

function setNote(san, text) {
  const n = $('#note');
  n.replaceChildren();
  if (san) n.append(el('span', { class: 'san' }, san));
  n.append(text);
}

function saveProgress(patch) {
  const k = key();
  progress.lines[k] = Object.assign({ studied: false, quizzes: 0, best: 0, perfect: false }, progress.lines[k], patch);
  store.save('openings', progress);
  renderList();
}

/* ---------- repertoire list ---------- */
function renderList() {
  const list = $('#op-list');
  list.replaceChildren();
  let group = '';
  openings.forEach((o) => {
    if (o.group !== group) { group = o.group; list.append(el('h3', { class: 'op-group' }, group)); }
    const mastered = o.lines.filter((_, i) => lineProgress(o, i).perfect).length;
    list.append(el('button', {
      class: 'op-item', 'aria-pressed': String(o === op),
      onclick: () => selectOpening(o, 0),
    }, el('span', {}, o.name), el('span', { class: 'pct' }, `${mastered}/${o.lines.length} mastered`)));
  });
}

function renderLineSelect() {
  const sel = $('#line');
  sel.replaceChildren(...op.lines.map((l, i) => {
    const p = lineProgress(op, i);
    const mark = p.perfect ? ' ✓' : p.quizzes ? ` (${p.best}%)` : '';
    return el('option', { value: i }, l.name + mark);
  }));
  sel.value = lineIdx;
}

function renderMoves(current, opts = {}) {
  const box = $('#moves');
  box.replaceChildren();
  const moves = line().moves;
  const shown = opts.shown ?? moves.length;
  for (let i = 0; i < shown; i++) {
    if (i % 2 === 0) box.append(el('div', { class: 'num' }, `${i / 2 + 1}.`));
    const cls = 'mv' + (i === current - 1 ? ' cur' : '') + (mode === 'learn' ? ' clickable' : '');
    box.append(el('div', { class: cls, onclick: mode === 'learn' ? () => goTo(i + 1) : null }, moves[i].san));
  }
  const cur = box.querySelector('.cur');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

/* ---------- selection ---------- */
async function selectOpening(o, li) {
  op = o; lineIdx = li;
  token++;
  $('#op-group').textContent = o.group;
  $('#op-name').textContent = o.name;
  renderList();
  renderLineSelect();
  await board.setOrientation(o.side);
  try { history.replaceState(null, '', `#${o.id}/${li}`); } catch (e) { /* ignore */ }
  if (mode === 'learn') startLearn(); else startQuiz();
}

function setMode(m) {
  mode = m;
  $('#mode-learn').setAttribute('aria-pressed', String(m === 'learn'));
  $('#mode-quiz').setAttribute('aria-pressed', String(m === 'quiz'));
  $('#learn-controls').classList.toggle('hidden', m !== 'learn');
  $('#quiz-controls').classList.toggle('hidden', m !== 'quiz');
  token++;
  if (m === 'learn') startLearn(); else startQuiz();
}

/* ---------- learn mode ---------- */
function startLearn() {
  step = 0;
  goTo(0, false);
}

async function goTo(n, animated = true) {
  const moves = line().moves;
  step = Math.max(0, Math.min(moves.length, n));
  game = new Chess();
  for (let i = 0; i < step; i++) game.move(uciToMove(moves[i].uci));
  await board.sync(game, animated);
  if (step < moves.length) {
    const nx = uciToMove(moves[step].uci);
    board.arrow(ARROW.hint, nx.from, nx.to);
  }
  const yourSide = op.side === 'w' ? 'White' : 'Black';
  if (step === 0) {
    setNote('', op.summary);
    setStatus(`You play ${yourSide}. Step through the line, or play the arrow move on the board.`);
  } else {
    const m = moves[step - 1];
    const num = Math.ceil(step / 2) + (step % 2 ? '.' : '...');
    setNote(num + ' ' + m.san, m.note);
    const yours = (step - 1) % 2 === (op.side === 'w' ? 0 : 1);
    setStatus(step === moves.length ? 'End of the line. Try the quiz!' : (yours ? 'Your move in this line.' : 'Opponent\'s move.'), step === moves.length ? 'good' : 'info');
  }
  $('#progress').style.width = (100 * step / moves.length) + '%';
  $('#btn-prev').disabled = $('#btn-first').disabled = step === 0;
  $('#btn-next').disabled = $('#btn-last').disabled = step === moves.length;
  renderMoves(step, { shown: step });
  if (step === moves.length && !lineProgress(op, lineIdx).studied) saveProgress({ studied: true });
  // allow playing the next book move on the board (either colour)
  board.enableInput(game, game.turn(), async (mv) => {
    if (mode !== 'learn') return false;
    if (step < moves.length && moveToUci(mv) === moves[step].uci) {
      game.undo();
      goTo(step + 1, false);
      return true;
    }
    toast('That\'s not the move in this line.', 'bad');
    return false;
  });
}

/* ---------- quiz mode ---------- */
function startQuiz() {
  const t = ++token;
  game = new Chess();
  quiz = { ply: 0, total: 0, firstTry: 0, misses: 0, done: false };
  board.sync(game, false);
  renderMoves(0, { shown: 0 });
  setNote('', 'Play the repertoire moves from memory. The opponent\'s replies are played for you.');
  setStatus('Quiz started.', 'info');
  $('#progress').style.width = '0';
  $('#btn-qhint').disabled = false;
  board.enableInput(game, op.side, onQuizMove);
  advanceQuiz(t);
}

async function advanceQuiz(t) {
  const moves = line().moves;
  while (quiz.ply < moves.length && game.turn() !== op.side) {
    await sleep(quiz.ply === 0 ? 300 : 450);
    if (t !== token) return;
    game.move(uciToMove(moves[quiz.ply].uci));
    quiz.ply++;
    await board.sync(game, true);
    renderMoves(quiz.ply, { shown: quiz.ply });
  }
  $('#progress').style.width = (100 * quiz.ply / moves.length) + '%';
  if (quiz.ply >= moves.length) return finishQuiz();
  quiz.misses = 0;
  setStatus(`Your move (${op.side === 'w' ? 'White' : 'Black'}).`, 'turn-' + op.side);
}

async function onQuizMove(mv) {
  const moves = line().moves;
  if (quiz.done || game.turn() === op.side) return false; // move already applied, so turn flipped
  const expected = moves[quiz.ply];
  if (moveToUci(mv) !== expected.uci) {
    quiz.misses++;
    $('#board').classList.add('shake');
    setTimeout(() => $('#board').classList.remove('shake'), 300);
    if (quiz.misses >= 2) {
      const e = uciToMove(expected.uci);
      setTimeout(() => board.arrow(ARROW.hint, e.from, e.to), 50);
      setStatus(`Not this time. The book move is ${expected.san}.`, 'bad');
    } else {
      setStatus('Not the repertoire move. Try again.', 'bad');
    }
    return false;
  }
  quiz.total++;
  if (quiz.misses === 0) quiz.firstTry++;
  quiz.ply++;
  setNote(expected.san, expected.note);
  setStatus(quiz.misses === 0 ? 'Correct!' : 'Correct, on the second try.', 'good');
  renderMoves(quiz.ply, { shown: quiz.ply });
  advanceQuiz(token);
  return true;
}

function finishQuiz() {
  quiz.done = true;
  board.disableInput();
  $('#btn-qhint').disabled = true;
  const pct = quiz.total ? Math.round(100 * quiz.firstTry / quiz.total) : 100;
  const prev = lineProgress(op, lineIdx);
  saveProgress({ quizzes: (prev.quizzes || 0) + 1, best: Math.max(prev.best || 0, pct), perfect: prev.perfect || pct === 100 });
  renderLineSelect();
  setStatus(`Line complete: ${quiz.firstTry}/${quiz.total} moves on the first try (${pct}%).`, pct === 100 ? 'good' : 'info');
  if (pct === 100) toast('Perfect! Line mastered ✓', 'good');
}

function nextLine() {
  if (lineIdx + 1 < op.lines.length) return selectOpening(op, lineIdx + 1);
  const i = openings.indexOf(op);
  selectOpening(openings[(i + 1) % openings.length], 0);
}

/* ---------- wiring ---------- */
$('#mode-learn').addEventListener('click', () => setMode('learn'));
$('#mode-quiz').addEventListener('click', () => setMode('quiz'));
$('#line').addEventListener('change', (e) => selectOpening(op, +e.target.value));
$('#btn-first').addEventListener('click', () => goTo(0));
$('#btn-prev').addEventListener('click', () => goTo(step - 1));
$('#btn-next').addEventListener('click', () => goTo(step + 1));
$('#btn-last').addEventListener('click', () => goTo(line().moves.length));
$('#btn-qrestart').addEventListener('click', startQuiz);
$('#btn-qnext').addEventListener('click', nextLine);
$('#btn-qhint').addEventListener('click', () => {
  if (!quiz || quiz.done || game.turn() !== op.side) return;
  const e = line().moves[quiz.ply];
  const m = uciToMove(e.uci);
  quiz.misses = Math.max(quiz.misses, 1);
  board.clearArrows();
  board.arrow(ARROW.hint, m.from, m.to);
  setStatus(`The book move is ${e.san}. Play it on the board.`, 'info');
});
document.addEventListener('keydown', (e) => {
  if (mode !== 'learn' || e.target.closest('select, input')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); goTo(step + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(step - 1); }
});

(async function init() {
  try {
    openings = await fetchJSON('data/openings.json');
  } catch (e) {
    setStatus('Could not load openings. Serve the site over http(s), not file://.', 'bad');
    return;
  }
  const fromHash = () => {
    const [id, li] = location.hash.slice(1).split('/');
    const o = openings.find(x => x.id === id) || op || openings[0];
    const i = Math.min(+li || 0, o.lines.length - 1);
    if (o !== op || i !== lineIdx) selectOpening(o, i);
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
