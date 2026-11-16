import { Board, ARROW, uciToMove, moveToUci } from './board.js';
import { Engine, scoreToCp } from './engine.js';
import { explainMove, moveKind } from './explain.js';
import * as store from './storage.js';
import { $, $$, el, sleep, fetchJSON } from './ui.js';

const board = new Board($('#board'));
let engine = null;                       // started lazily: Find mode needs it, Guess mode does not
const getEngine = () => (engine ||= new Engine());

let stats = store.load('bestmove', store.BESTMOVE_DEFAULTS);
stats.guess = Object.assign(structuredClone(store.BESTMOVE_DEFAULTS.guess), stats.guess);
const save = () => store.save('bestmove', stats);

let positions = [], games = [];
let mode = 'find';
let token = 0;

/* ================= grades & shared stats ================= */
export const GRADES = [
  { name: 'Best', cls: 'best', max: 20, score: 1 },
  { name: 'Good', cls: 'good', max: 60, score: 0.7 },
  { name: 'Inaccuracy', cls: 'inaccuracy', max: 100, score: 0.4 },
  { name: 'Mistake', cls: 'mistake', max: 200, score: 0.15 },
  { name: 'Blunder', cls: 'blunder', max: Infinity, score: 0 },
];
const gradeFor = loss => GRADES.find(g => loss <= g.max);
const KIND_LABEL = { check: 'checks', capture: 'captures', quiet: 'quiet moves' };

function recordKind(kind, missed) {
  const k = stats.kinds[kind] || (stats.kinds[kind] = { seen: 0, missed: 0 });
  k.seen++;
  if (missed) k.missed++;
}

function mostMissed() {
  let worst = null;
  for (const [kind, k] of Object.entries(stats.kinds)) {
    if (k.seen < 3) continue;
    const rate = k.missed / k.seen;
    if (!worst || rate > worst.rate) worst = { kind, rate };
  }
  return worst ? `${KIND_LABEL[worst.kind]} (${Math.round(worst.rate * 100)}%)` : '–';
}

/* ================= mode switch ================= */
function setMode(m) {
  mode = m;
  token++;
  $('#mode-find').setAttribute('aria-pressed', String(m === 'find'));
  $('#mode-guess').setAttribute('aria-pressed', String(m === 'guess'));
  for (const id of ['find-panel', 'find-rating']) $('#' + id).classList.toggle('hidden', m !== 'find');
  for (const id of ['guess-panel', 'guess-games', 'guess-moves']) $('#' + id).classList.toggle('hidden', m !== 'guess');
  try { history.replaceState(null, '', m === 'guess' ? '#guess' : '#find'); } catch (e) { /* ignore */ }
  if (m === 'find') loadPosition(pos || pickPosition());
  else selectGame(gameSpec || games[0]);
}

/* ================= Find the Best Move ================= */
let pos = null, game = null, rated = false, answered = false, checks = new Set();

function setStatus(text, kind = '') {
  $('#status').className = 'status ' + kind;
  $('#status-text').replaceChildren(...[].concat(text));
}

function renderFindStats(delta) {
  $('#bm-rating').textContent = Math.round(stats.rating);
  const d = $('#bm-delta');
  if (delta) { d.textContent = (delta > 0 ? '+' : '') + delta; d.className = 'delta ' + (delta > 0 ? 'up' : 'down'); }
  else d.textContent = '';
  const good = (stats.grades.Best || 0) + (stats.grades.Good || 0);
  $('#bm-acc').textContent = stats.attempts ? Math.round((100 * good) / stats.attempts) + '%' : '–';
  $('#bm-done').textContent = `${Object.keys(stats.results).length} / ${positions.length}`;
  $('#bm-missed').textContent = mostMissed();
}

function pickPosition() {
  let cands = positions.filter(p => !stats.results[p.id]);
  if (!cands.length) cands = positions.filter(p => !['Best', 'Good'].includes(stats.results[p.id].grade));
  if (!cands.length) cands = positions;
  cands = cands.map(p => ({ p, d: Math.abs(p.rating - stats.rating) + Math.random() * 80 })).sort((a, b) => a.d - b.d).slice(0, 4);
  return cands[Math.floor(Math.random() * cands.length)].p;
}

async function loadPosition(p) {
  if (!p) return;
  token++;
  pos = p;
  game = new Chess(p.fen);
  rated = !stats.results[p.id];
  answered = false;
  checks = new Set();
  $$('.check-item').forEach(b => { b.setAttribute('aria-pressed', 'false'); b.disabled = false; });
  $('#checklist-wrap').classList.remove('hidden');
  $('#find-result').classList.add('hidden');
  const side = game.turn();
  await board.setOrientation(side);
  await board.sync(game, false);
  board.disableInput();
  setStatus(`${side === 'w' ? 'White' : 'Black'} to move. Go through the checklist first.`, 'turn-' + side);
  $('#find-meta').textContent = `Position rating ${p.rating} · ${rated ? 'Rated' : 'Practice'} · from a real master game`;
  renderFindStats();
  try { history.replaceState(null, '', '#find/' + p.id); } catch (e) { /* ignore */ }
  getEngine();                                    // warm up the engine while the user thinks
}

function toggleCheck(btn) {
  if (answered) return;
  const q = btn.dataset.q;
  if (checks.has(q)) { checks.delete(q); btn.setAttribute('aria-pressed', 'false'); }
  else { checks.add(q); btn.setAttribute('aria-pressed', 'true'); }
  if (checks.size === 4) {
    setStatus('Now find the best move and play it on the board.', 'turn-' + game.turn());
    board.enableInput(game, game.turn(), onFindMove);
  } else {
    board.disableInput();
    setStatus(`${4 - checks.size} question${checks.size === 3 ? '' : 's'} left on the checklist.`, 'turn-' + game.turn());
  }
}

async function onFindMove(move) {
  if (answered) return false;
  answered = true;
  board.disableInput();
  $$('.check-item').forEach(b => { b.disabled = true; });
  const t = token;
  const fenBefore = pos.fen;
  const userUci = moveToUci(move);
  setStatus([el('span', { class: 'loader' }), ' Stockfish is checking your move…'], 'info');

  let userCp, topCp;
  const eng = getEngine();
  const res = await eng.analyse(fenBefore, { depth: 14, movetime: 2500, multipv: 3, skill: 20 });
  if (t !== token) return true;
  topCp = scoreToCp(res.lines[0] && res.lines[0].score);
  const own = res.lines.find(l => l.move === userUci);
  if (game.in_checkmate()) userCp = 1000;
  else if (game.game_over()) userCp = 0;
  else if (own) userCp = scoreToCp(own.score);
  else {
    const after = await eng.analyse(game.fen(), { depth: 13, movetime: 2000, skill: 20 });
    if (t !== token) return true;
    userCp = -scoreToCp(after.lines[0] && after.lines[0].score);
  }
  const deepCp = scoreToCp(pos.score);
  const refCp = Math.max(topCp, Math.min(deepCp, topCp + 50));
  const isBest = userUci === pos.best;
  const loss = isBest ? 0 : Math.max(0, refCp - userCp);
  const grade = gradeFor(loss);
  showFindResult(move, grade, userCp, refCp, isBest);
  return true;
}

function showFindResult(move, grade, userCp, refCp, isBest) {
  // rating & stats (first attempt only)
  let delta = 0;
  if (rated) {
    const expected = 1 / (1 + Math.pow(10, (pos.rating - stats.rating) / 400));
    const k = stats.attempts < 20 ? 40 : 24;
    delta = Math.round(k * (grade.score - expected));
    stats.rating = Math.max(100, stats.rating + delta);
    stats.attempts++;
    stats.grades[grade.name] = (stats.grades[grade.name] || 0) + 1;
    stats.history.push(Math.round(stats.rating));
    if (stats.history.length > 500) stats.history.shift();
    stats.results[pos.id] = { grade: grade.name, at: Date.now() };
    recordKind(pos.kind, !['Best', 'Good'].includes(grade.name));
    save();
  }
  renderFindStats(delta);

  const g = $('#grade');
  g.textContent = grade.name;
  g.className = 'grade ' + grade.cls;
  const fmt = cp => (Math.abs(cp) >= 1000 ? (cp > 0 ? '+M' : '-M') : (cp > 0 ? '+' : '') + (cp / 100).toFixed(1));
  $('#result-moves').replaceChildren(
    'Your move ', el('b', {}, move.san), ` (${fmt(userCp)})`,
    isBest ? ' is the engine\'s best move.' : el('span', {}, ' · Best ', el('b', {}, pos.bestSan), ` (${fmt(refCp)})`));
  $('#explanation').replaceChildren(el('span', { class: 'san' }, pos.bestSan), pos.explanation || explainMove(Chess, pos.fen, pos.best, { score: pos.score }));
  const s = pos.source;
  const masterPlayed = s.played === pos.bestSan ? `${s.played}, the best move.` : `${s.played}.`;
  $('#find-source').textContent = `${s.white} vs ${s.black}${s.year ? ', ' + s.year : ''} (move ${s.move}). The master played ${masterPlayed}`;
  $('#checklist-wrap').classList.add('hidden');
  $('#find-result').classList.remove('hidden');
  setStatus(rated ? `${grade.name}! Rating ${delta >= 0 ? '+' : ''}${delta}` : `${grade.name} (practice)`,
    ['Best', 'Good'].includes(grade.name) ? 'good' : grade.name === 'Inaccuracy' ? 'info' : 'bad');

  // arrows: engine best in green, the user's move in red if different
  const b = uciToMove(pos.best);
  board.clearArrows();
  if (!isBest) board.arrow(ARROW.bad, move.from, move.to);
  board.arrow(ARROW.good, b.from, b.to);
  $('#btn-find-next').focus({ preventScroll: true });
}

/* ================= Guess the Move ================= */
let gameSpec = null, gGame = null, gPly = 0, gScore = null, gBusy = false;

function gStatus(text, kind = '') {
  $('#g-status').className = 'status ' + kind;
  $('#g-status-text').textContent = text;
}

function renderGameList() {
  $('#game-list').replaceChildren(...games.map(g => {
    const rec = stats.guess.games[g.id];
    return el('button', { class: 'op-item', 'aria-pressed': String(g === gameSpec), onclick: () => selectGame(g) },
      el('span', {}, g.title, el('br'), el('span', { class: 'small muted' }, `${g.white} – ${g.black}, ${g.year}`)),
      el('span', { class: 'pct' }, rec ? `best ${rec.best}/${rec.max}` : ''));
  }));
}

function renderGuessMoves() {
  const box = $('#moves');
  box.replaceChildren();
  gameSpec.moves.slice(0, gPly).forEach((m, i) => {
    if (i % 2 === 0) box.append(el('div', { class: 'num' }, `${i / 2 + 1}.`));
    const r = gScore.marks[i];
    box.append(el('div', { class: 'mv' + (i === gPly - 1 ? ' cur' : '') + (r === 0 ? ' blunder' : r === 2 ? ' mistake' : '') }, m.san));
  });
  box.scrollTop = box.scrollHeight;
}

function renderGuessScore() {
  $('#g-points').textContent = gScore.points;
  $('#g-max').textContent = gScore.max;
  $('#g-matches').textContent = gScore.guesses ? `${gScore.master}/${gScore.guesses} master moves found` : '';
  $('#g-progress').style.width = (100 * gPly / gameSpec.moves.length) + '%';
}

async function selectGame(g) {
  if (!g) return;
  const t = ++token;
  gameSpec = g;
  gGame = new Chess();
  gPly = 0;
  gBusy = false;
  gScore = { points: 0, max: 0, guesses: 0, master: 0, marks: {} };
  $('#g-title').textContent = g.title;
  $('#g-intro').textContent = `${g.white} – ${g.black}, ${g.event} ${g.year}. ${g.intro}`;
  $('#g-feedback').textContent = '';
  renderGameList();
  await board.setOrientation(g.side);
  // opening moves are played straight away
  while (gPly < g.startPly && gPly < g.moves.length) gGame.move(uciToMove(g.moves[gPly++].uci));
  await board.sync(gGame, false);
  renderGuessMoves();
  renderGuessScore();
  try { history.replaceState(null, '', '#guess/' + g.id); } catch (e) { /* ignore */ }
  board.enableInput(gGame, g.side, onGuess);
  advanceGuess(t);
}

async function advanceGuess(t) {
  const moves = gameSpec.moves;
  while (gPly < moves.length && !(gGame.turn() === gameSpec.side && moves[gPly].top)) {
    await sleep(500);
    if (t !== token) return;
    gGame.move(uciToMove(moves[gPly++].uci));
    await board.sync(gGame, true);
    renderGuessMoves();
    renderGuessScore();
  }
  if (gPly >= moves.length) return finishGuess();
  gStatus(`Your guess: what did ${gameSpec.side === 'w' ? gameSpec.white : gameSpec.black} play?`, 'turn-' + gameSpec.side);
}

function onGuess(move) {
  if (gBusy || gPly >= gameSpec.moves.length) return false;
  const m = gameSpec.moves[gPly];
  const guess = moveToUci(move);
  const rank = m.top.findIndex(x => x.uci === guess);
  let pts = 0, text;
  if (guess === m.uci) { pts = 5; text = `${move.san}: exactly the master's move! +5`; gScore.master++; stats.guess.master++; }
  else if (rank === 0) { pts = 4; text = `${move.san} is the engine's top choice. +4 (the master played ${m.san})`; stats.guess.top3++; }
  else if (rank > 0) { pts = 2; text = `${move.san} is the engine's #${rank + 1} choice. +2 (the master played ${m.san})`; stats.guess.top3++; }
  else text = `${move.san} isn't in the engine's top 3. The master played ${m.san}.`;
  gScore.points += pts; gScore.max += 5; gScore.guesses++;
  gScore.marks[gPly] = pts === 5 ? 5 : pts >= 2 ? 2 : 0;
  stats.guess.moves++; stats.guess.points += pts; stats.guess.maxPoints += 5;
  recordKind(m.kind || moveKind(m.san), pts < 4);
  save();
  $('#g-feedback').replaceChildren(el('span', { style: `color:${pts >= 4 ? 'var(--accent)' : pts ? 'var(--warn)' : 'var(--danger)'};font-weight:700` }, text));
  gBusy = true;
  const t = token;
  // the board undoes the guess (we return false); then the real move is played
  setTimeout(async () => {
    await sleep(250);
    if (t !== token) return;
    const played = gGame.move(uciToMove(m.uci));
    gPly++;
    await board.sync(gGame, true);
    board.arrow(ARROW.good, played.from, played.to);
    if (guess !== m.uci) board.arrow(ARROW.bad, move.from, move.to);
    renderGuessMoves();
    renderGuessScore();
    await sleep(900);
    if (t !== token) return;
    gBusy = false;
    advanceGuess(t);
  }, 0);
  return false;
}

function finishGuess() {
  board.disableInput();
  const rec = stats.guess.games[gameSpec.id] || { best: 0, max: gScore.max, plays: 0 };
  rec.plays++; rec.max = gScore.max; rec.best = Math.max(rec.best, gScore.points);
  stats.guess.games[gameSpec.id] = rec;
  save();
  renderGameList();
  const pct = gScore.max ? Math.round(100 * gScore.points / gScore.max) : 0;
  gStatus(`Game over (${gameSpec.result}). You scored ${gScore.points}/${gScore.max} (${pct}%).`, pct >= 60 ? 'good' : 'info');
}

/* ================= wiring ================= */
$('#mode-find').addEventListener('click', () => setMode('find'));
$('#mode-guess').addEventListener('click', () => setMode('guess'));
$$('.check-item').forEach(b => b.addEventListener('click', () => toggleCheck(b)));
$('#btn-find-next').addEventListener('click', () => loadPosition(pickPosition()));
$('#btn-find-retry').addEventListener('click', () => loadPosition(pos));
$('#btn-g-restart').addEventListener('click', () => selectGame(gameSpec));
$('#btn-g-next').addEventListener('click', () => selectGame(games[(games.indexOf(gameSpec) + 1) % games.length]));

(async function init() {
  try {
    [positions, games] = await Promise.all([fetchJSON('data/bestmove.json'), fetchJSON('data/master-games.json')]);
  } catch (e) {
    setStatus('Could not load the positions. Serve the site over http(s), not file://.', 'bad');
    return;
  }
  const [m, id] = location.hash.slice(1).split('/');
  if (m === 'guess') {
    gameSpec = games.find(g => g.id === id) || games[0];
    setMode('guess');
  } else {
    pos = positions.find(p => p.id === id) || null;
    setMode('find');
  }
})();
