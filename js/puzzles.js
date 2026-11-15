import { Board, MARK, ARROW, uciToMove, moveToUci } from './board.js';
import * as store from './storage.js';
import { $, el, toast, sleep, fetchJSON } from './ui.js';

const FILTERS = {
  all: 'All themes',
  mate: 'All checkmates',
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2 or 3',
  fork: 'Forks',
  pin: 'Pins',
  skewer: 'Skewers',
  hanging: 'Hanging pieces',
  discovered: 'Discovered attacks',
};
const THEME_LABEL = {
  mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', fork: 'Fork', pin: 'Pin',
  skewer: 'Skewer', hanging: 'Hanging piece', discovered: 'Discovered attack',
};
const matchesFilter = (p, f) =>
  f === 'all' || p.theme === f ||
  (f === 'mate' && p.theme.startsWith('mate')) ||
  (f === 'mateIn2' && (p.theme === 'mateIn2' || p.theme === 'mateIn3'));

let puzzles = [];
let stats = store.load('puzzles', store.PUZZLE_DEFAULTS);
let settings = store.load('settings', store.SETTINGS_DEFAULTS);
const board = new Board($('#board'));

// per-puzzle state
let cur = null, game = null, ply = 0, rated = false, missed = false, done = false, hintLevel = 0, busy = false;

function setStatus(text, kind = '') {
  $('#status').className = 'status ' + kind;
  $('#status-text').textContent = text;
}

function renderStats(delta) {
  $('#rating').textContent = Math.round(stats.rating);
  const d = $('#rating-delta');
  if (delta) {
    d.textContent = (delta > 0 ? '+' : '') + delta;
    d.className = 'delta ' + (delta > 0 ? 'up' : 'down');
  } else d.textContent = '';
  $('#st-streak').textContent = stats.streak;
  $('#st-best').textContent = stats.bestStreak;
  $('#st-acc').textContent = stats.attempts ? Math.round((100 * stats.solved) / stats.attempts) + '%' : '–';
  $('#st-done').textContent = `${Object.keys(stats.results).length} / ${puzzles.length}`;
}

function pickNext() {
  const pool = puzzles.filter(p => matchesFilter(p, settings.puzzleTheme));
  let cands = pool.filter(p => !stats.results[p.id]);
  if (!cands.length) cands = pool.filter(p => !stats.results[p.id].ok);
  if (!cands.length) cands = pool;
  // the three closest to the player's rating, then random among them
  cands = cands
    .map(p => ({ p, d: Math.abs(p.rating - stats.rating) + Math.random() * 60 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  return cands[Math.floor(Math.random() * cands.length)].p;
}

function sideName(c) { return c === 'w' ? 'White' : 'Black'; }

async function loadPuzzle(p) {
  cur = p;
  game = new Chess(p.fen);
  ply = 0; missed = false; done = false; hintLevel = 0; busy = false;
  rated = !stats.results[p.id];
  const side = game.turn();
  await board.setOrientation(side);
  await board.sync(game, false);
  const goal = p.theme.startsWith('mate') ? `checkmate in ${p.theme.slice(-1)}` : 'find the best move';
  setStatus(`${sideName(side)} to move: ${goal}`, 'turn-' + side);
  $('#puzzle-meta').textContent = `Puzzle rating ${p.rating} · ${rated ? 'Rated' : 'Practice (already attempted)'}`;
  $('#btn-hint').disabled = false;
  $('#btn-solution').disabled = false;
  board.enableInput(game, side, onUserMove);
  renderStats();
  try { history.replaceState(null, '', '#' + p.id); } catch (e) { /* ignore */ }
}

function applyResult(ok) {
  // rating change, first attempt only
  if (!rated || stats.results[cur.id]) return 0;
  const expected = 1 / (1 + Math.pow(10, (cur.rating - stats.rating) / 400));
  const k = stats.attempts < 20 ? 40 : 24;
  const delta = Math.round(k * ((ok ? 1 : 0) - expected));
  stats.rating = Math.max(100, stats.rating + delta);
  stats.attempts++;
  if (ok) { stats.solved++; stats.streak++; stats.bestStreak = Math.max(stats.bestStreak, stats.streak); }
  else stats.streak = 0;
  stats.history.push(Math.round(stats.rating));
  if (stats.history.length > 500) stats.history.shift();
  stats.results[cur.id] = { ok, at: Date.now() };
  const t = stats.themes[cur.theme] || (stats.themes[cur.theme] = { attempts: 0, solved: 0 });
  t.attempts++; if (ok) t.solved++;
  store.save('puzzles', stats);
  return delta;
}

function markMissed() {
  if (missed) return;
  missed = true;
  const delta = applyResult(false);
  renderStats(delta);
}

async function onUserMove(move) {
  if (done || busy) return false;
  const expected = cur.moves[ply];
  const correct = moveToUci(move) === expected || game.in_checkmate();
  if (!correct) {
    busy = true;
    markMissed();
    board.mark(MARK.bad, move.to);
    $('#board').classList.add('shake');
    setStatus('Not the right move. Try again!', 'bad');
    await sleep(550);
    $('#board').classList.remove('shake');
    board.unmark(MARK.bad);
    busy = false;
    return false;
  }
  ply++;
  hintLevel = 0;
  board.unmark(MARK.hint);
  if (ply >= cur.moves.length || game.game_over()) return solved();
  busy = true;
  setStatus('Correct! Keep going…', 'good');
  await sleep(450);
  game.move(uciToMove(cur.moves[ply++]));
  await board.sync(game, true);
  busy = false;
  setStatus(`Good. Now find the next move for ${sideName(game.turn())}.`, 'good');
  return true;
}

function revealTheme() {
  $('#puzzle-meta').textContent =
    `${THEME_LABEL[cur.theme]} · “${cur.title}” · rating ${cur.rating}`;
}

function solved() {
  done = true;
  board.disableInput();
  $('#btn-hint').disabled = true;
  $('#btn-solution').disabled = true;
  if (missed) {
    setStatus('Solved, but it didn\'t count this time.', 'info');
  } else {
    const delta = applyResult(true);
    renderStats(delta);
    setStatus(rated ? `Solved! Rating ${delta >= 0 ? '+' : ''}${delta}` : 'Solved! (practice)', 'good');
    if (rated && stats.streak > 1 && stats.streak % 5 === 0) toast(`🔥 ${stats.streak} in a row!`, 'good');
  }
  revealTheme();
  $('#btn-next').focus({ preventScroll: true });
  return true;
}

async function hint() {
  if (done || busy) return;
  markMissed();
  const m = uciToMove(cur.moves[ply]);
  if (hintLevel === 0) {
    board.mark(MARK.hint, m.from);
    setStatus('Hint: move the highlighted piece.', 'info');
    hintLevel = 1;
  } else {
    board.clearArrows();
    board.arrow(ARROW.hint, m.from, m.to);
    setStatus('Hint: play the arrow move.', 'info');
    hintLevel = 2;
  }
}

async function showSolution() {
  if (done || busy) return;
  markMissed();
  busy = true;
  board.disableInput();
  setStatus('Solution…', 'info');
  while (ply < cur.moves.length) {
    const m = game.move(uciToMove(cur.moves[ply++]));
    await board.sync(game, true);
    board.arrow(ARROW.hint, m.from, m.to);
    await sleep(800);
  }
  busy = false;
  done = true;
  $('#btn-hint').disabled = true;
  $('#btn-solution').disabled = true;
  const san = cur.san.map((s, i) => (i % 2 === 0 ? s : `(${s})`)).join(' ');
  setStatus('Solution: ' + san, 'info');
  revealTheme();
}

function initThemeSelect() {
  const sel = $('#theme');
  for (const [k, v] of Object.entries(FILTERS)) {
    const n = puzzles.filter(p => matchesFilter(p, k)).length;
    sel.append(el('option', { value: k }, `${v} (${n})`));
  }
  sel.value = FILTERS[settings.puzzleTheme] ? settings.puzzleTheme : 'all';
  sel.addEventListener('change', () => {
    settings.puzzleTheme = sel.value;
    store.save('settings', settings);
    loadPuzzle(pickNext());
  });
}

$('#btn-hint').addEventListener('click', hint);
$('#btn-solution').addEventListener('click', showSolution);
$('#btn-retry').addEventListener('click', () => cur && !busy && loadPuzzle(cur));
$('#btn-next').addEventListener('click', () => !busy && loadPuzzle(pickNext()));

(async function init() {
  try {
    puzzles = await fetchJSON('data/puzzles.json');
  } catch (e) {
    setStatus('Could not load puzzles. Serve the site over http(s), not file://.', 'bad');
    return;
  }
  initThemeSelect();
  const fromHash = puzzles.find(p => '#' + p.id === location.hash);
  loadPuzzle(fromHash || pickNext());
})();
