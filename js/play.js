import { Board, ARROW, MARK, uciToMove, moveToUci, uciToSan } from './board.js';
import { Engine, scoreToCp, formatScore } from './engine.js';
import * as store from './storage.js';
import { $, $$, el, toast, sleep, sparkline } from './ui.js';
import { LEVELS } from './levels.js';


const engine = new Engine();
const board = new Board($('#board'));
let settings = store.load('settings', store.SETTINGS_DEFAULTS);
let botStats = store.load('bot', store.BOT_DEFAULTS);

let game = new Chess();
let level = settings.botLevel || 3;
let userColor = 'w';
let colorChoice = settings.botColor || 'w';
let token = 0;           // bumps on undo/new game to discard stale engine answers
let thinking = false;
let over = false;
let result = null;       // 'w' | 'l' | 'd'
let hints = 0, undos = 0;
let reviewData = null;

/* ---------- setup UI ---------- */
function renderSetup() {
  $$('#color-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === colorChoice)));
  const box = $('#levels');
  box.replaceChildren(...Object.keys(LEVELS).map(n => el('button', {
    'aria-pressed': String(+n === level), title: `Level ${n} (~${LEVELS[n].elo})`,
    onclick: () => { level = +n; settings.botLevel = level; store.save('settings', settings); renderSetup(); },
  }, n)));
  const rec = botStats.levels[level] || { w: 0, l: 0, d: 0 };
  $('#level-desc').textContent = `Level ${level} · about ${LEVELS[level].elo} rating. ${LEVELS[level].desc} Your record: ${rec.w}W ${rec.l}L ${rec.d}D.`;
}
$$('#color-seg button').forEach(b => b.addEventListener('click', () => {
  colorChoice = b.dataset.color; settings.botColor = colorChoice; store.save('settings', settings); renderSetup();
}));

function setStatus(text, kind = '') {
  $('#status').className = 'status ' + kind;
  $('#status-text').textContent = text;
}

/* ---------- game flow ---------- */
async function startGame(opts = {}) {
  token++;
  engine.stop();
  engine.newGame();
  game = new Chess();
  level = opts.level || level;
  userColor = opts.color || (colorChoice === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice);
  over = false; result = null; thinking = false; hints = opts.hints || 0; undos = opts.undos || 0; reviewData = null;
  for (const san of opts.moves || []) game.move(san);
  $('#setup').classList.add('hidden');
  $('#game').classList.remove('hidden');
  $('#review').classList.add('hidden');
  $('#btn-review').classList.add('hidden');
  $('#game-meta').textContent = `You play ${userColor === 'w' ? 'White' : 'Black'} vs Bot level ${level} (~${LEVELS[level].elo})`;
  await board.setOrientation(userColor);
  await board.sync(game, false);
  // on narrow screens the setup panel sits below the board: bring the board back into view
  if (!opts.moves && window.matchMedia('(max-width: 900px)').matches) {
    $('.board-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  board.enableInput(game, userColor, onUserMove);
  renderMoves();
  saveCurrent();
  nextTurn();
}

function nextTurn() {
  updateButtons();
  if (checkGameOver()) return;
  if (game.turn() === userColor) {
    setStatus('Your move.', 'turn-' + userColor);
  } else {
    botMove();
  }
}

async function onUserMove(move) {
  if (over || thinking || game.turn() === userColor) return false;
  renderMoves();
  saveCurrent();
  nextTurn();
  return true;
}

async function botMove() {
  const t = token;
  thinking = true;
  updateButtons();
  setStatus('Bot is thinking…', 'turn-' + game.turn());
  const cfg = LEVELS[level];
  const started = performance.now();
  let uci;
  const legal = game.moves({ verbose: true });
  if (Math.random() < cfg.random) {
    const m = legal[Math.floor(Math.random() * legal.length)];
    uci = moveToUci(m);
  } else {
    const res = await engine.analyse(game.fen(), { depth: cfg.depth, movetime: cfg.movetime, skill: cfg.skill });
    uci = res.bestmove || moveToUci(legal[0]);
  }
  const minDelay = 350 + Math.random() * 300;
  const wait = minDelay - (performance.now() - started);
  if (wait > 0) await sleep(wait);
  if (t !== token) return; // game changed while thinking
  thinking = false;
  game.move(uciToMove(uci));
  await board.sync(game, true);
  renderMoves();
  saveCurrent();
  nextTurn();
}

function checkGameOver() {
  if (!game.game_over()) return false;
  let text, res;
  if (game.in_checkmate()) {
    const loser = game.turn();
    res = loser === userColor ? 'l' : 'w';
    text = res === 'w' ? 'Checkmate. You win! 🎉' : 'Checkmate. The bot wins.';
  } else {
    res = 'd';
    text = game.in_stalemate() ? 'Stalemate. Draw.' :
      game.in_threefold_repetition() ? 'Draw by threefold repetition.' :
      game.insufficient_material() ? 'Draw: insufficient material.' : 'Draw (50-move rule).';
  }
  endGame(res, text);
  return true;
}

function endGame(res, text) {
  over = true; result = res; thinking = false;
  token++;
  board.disableInput();
  setStatus(text, res === 'w' ? 'good' : res === 'l' ? 'bad' : 'info');
  const rec = botStats.levels[level] || (botStats.levels[level] = { w: 0, l: 0, d: 0 });
  rec[res]++;
  botStats.games.push({ level, color: userColor, result: res, moves: game.history().length, hints, undos, at: Date.now() });
  if (botStats.games.length > 200) botStats.games.shift();
  store.save('bot', botStats);
  clearCurrent();
  $('#btn-review').classList.remove('hidden');
  updateButtons();
}

function updateButtons() {
  const userTurn = game.turn() === userColor;
  $('#btn-undo').disabled = over || game.history().length === 0 || (!userTurn && !thinking) ||
    (userColor === 'b' && game.history().length < 2 && !thinking);
  $('#btn-hint').disabled = over || !userTurn || thinking;
  $('#btn-resign').disabled = over;
}

function undo() {
  if (over) return;
  if (thinking) {
    token++; thinking = false; engine.stop();
    game.undo();                        // take back the user's last move
  } else if (game.turn() === userColor && game.history().length >= 2) {
    game.undo(); game.undo();
  } else return;
  undos++;
  board.sync(game, true);
  renderMoves();
  saveCurrent();
  nextTurn();
}

async function hint() {
  if (over || thinking || game.turn() !== userColor) return;
  const btn = $('#btn-hint');
  btn.disabled = true;
  btn.replaceChildren(el('span', { class: 'loader' }), ' Thinking');
  const fen = game.fen();
  const res = await engine.analyse(fen, { depth: 14, movetime: 1500, skill: 20 });
  btn.textContent = 'Hint';
  if (fen !== game.fen() || !res.bestmove) { updateButtons(); return; }
  hints++;
  const m = uciToMove(res.bestmove);
  board.clearArrows();
  board.arrow(ARROW.hint, m.from, m.to);
  const line = res.lines[0];
  // the score is from the side to move's view, which is the user here
  const evalText = line ? ` (eval ${formatScore(line.score)} for you)` : '';
  setStatus(`Best move: ${uciToSan(fen, res.bestmove)}${evalText}`, 'info');
  updateButtons();
}

function resign() {
  if (over) return;
  if (!confirm('Resign this game?')) return;
  engine.stop();
  endGame('l', 'You resigned.');
}

/* ---------- move list ---------- */
function renderMoves(marks = {}, onClick) {
  const box = $('#moves');
  box.replaceChildren();
  const hist = game.history();
  hist.forEach((san, i) => {
    if (i % 2 === 0) box.append(el('div', { class: 'num' }, `${i / 2 + 1}.`));
    const cls = ['mv'];
    if (i === hist.length - 1 && !onClick) cls.push('cur');
    if (marks[i]) cls.push(marks[i]);
    if (onClick) cls.push('clickable');
    box.append(el('div', { class: cls.join(' '), 'data-ply': i, onclick: onClick ? () => onClick(i) : null }, san));
  });
  box.scrollTop = box.scrollHeight;
}

/* ---------- persistence of an unfinished game ---------- */
function saveCurrent() {
  settings.current = { level, color: userColor, moves: game.history(), hints, undos };
  store.save('settings', settings);
}
function clearCurrent() { delete settings.current; store.save('settings', settings); }

/* ---------- review ---------- */
async function review() {
  $('#review').classList.remove('hidden');
  $('#btn-review').classList.add('hidden');
  $('#review-list').replaceChildren();
  $('#review-summary').replaceChildren();
  $('#review-chart').replaceChildren();
  const t = token;
  const hist = game.history({ verbose: true });
  const replay = new Chess();
  const fens = [replay.fen()];
  for (const m of hist) { replay.move(m); fens.push(replay.fen()); }

  // eval of each position, from the side to move's view
  const evals = [];
  for (let i = 0; i < fens.length; i++) {
    if (t !== token) return;
    $('#review-progress').replaceChildren(el('span', { class: 'loader' }), ` Analysing position ${i + 1} of ${fens.length}…`);
    const g = new Chess(fens[i]);
    if (g.in_checkmate()) { evals.push({ cp: -1000, best: null, score: { mate: 0 } }); continue; }
    if (g.game_over()) { evals.push({ cp: 0, best: null, score: { cp: 0 } }); continue; }
    const res = await engine.analyse(fens[i], { depth: 14, movetime: 600, skill: 20 });
    const line = res.lines[0];
    evals.push({ cp: scoreToCp(line && line.score), best: res.bestmove, score: line && line.score });
  }
  if (t !== token) return;
  $('#review-progress').textContent = '';

  const items = [];
  const marks = {};
  for (let i = 0; i < hist.length; i++) {
    const mover = i % 2 === 0 ? 'w' : 'b';
    if (mover !== userColor) continue;
    const before = evals[i].cp;            // user to move
    const after = -evals[i + 1].cp;        // opponent to move, so flip
    const loss = before - after;
    const playedUci = moveToUci(hist[i]);
    if (evals[i].best === playedUci) continue;
    if (loss >= 200) { marks[i] = 'blunder'; items.push({ i, loss, before, after, kind: 'Blunder' }); }
    else if (loss >= 100) { marks[i] = 'mistake'; items.push({ i, loss, before, after, kind: 'Mistake' }); }
  }
  reviewData = { fens, evals, hist, items, marks };
  const blunders = items.filter(x => x.kind === 'Blunder').length;
  const mistakes = items.length - blunders;
  $('#review-summary').append(el('p', {},
    blunders === 0 ? 'No blunders, well played! ' : `${blunders} blunder${blunders > 1 ? 's' : ''} (moves that lost 2+ pawns). `,
    mistakes ? `${mistakes} smaller mistake${mistakes > 1 ? 's' : ''}.` : ''));

  // eval chart from the user's perspective
  const series = evals.map((e, i) => {
    const whiteView = i % 2 === 0 ? e.cp : -e.cp;
    return userColor === 'w' ? whiteView : -whiteView;
  });
  const chart = sparkline(series, { height: 70 });
  $('#review-chart').append(el('div', { class: 'small muted' }, 'Evaluation for you across the game'), chart);

  for (const it of items) {
    const moveNo = Math.floor(it.i / 2) + 1 + (it.i % 2 ? '...' : '.');
    const bestSan = evals[it.i].best ? uciToSan(fens[it.i], evals[it.i].best) : '?';
    const node = el('div', { class: 'review-item', onclick: () => showReviewItem(it, node) },
      el('div', { class: 'line1' }, `${it.kind}: ${moveNo} ${hist[it.i].san}${it.kind === 'Blunder' ? '??' : '?'}`),
      el('div', { class: 'small muted' }, `Eval ${fmt(it.before)} → ${fmt(it.after)} · Better was ${bestSan}`));
    $('#review-list').append(node);
  }
  renderMoves(marks, (i) => showPly(i));
  if (items.length) showReviewItem(items[0], $('#review-list').firstChild);
}

const fmt = cp => (Math.abs(cp) >= 1000 ? (cp > 0 ? '+M' : '-M') : (cp > 0 ? '+' : '') + (cp / 100).toFixed(1));

async function showReviewItem(it, node) {
  $$('.review-item').forEach(n => n.classList.remove('active'));
  if (node) node.classList.add('active');
  const { fens, evals, hist } = reviewData;
  const g = new Chess(fens[it.i]);
  await board.sync(g, false);
  const played = hist[it.i];
  board.arrow(ARROW.bad, played.from, played.to);
  const best = evals[it.i].best;
  if (best) { const b = uciToMove(best); board.arrow(ARROW.good, b.from, b.to); }
  const bestSan = best ? uciToSan(fens[it.i], best) : '?';
  const n = $('#review-note');
  n.classList.remove('hidden');
  n.replaceChildren(
    el('div', {}, el('span', { class: 'san', style: 'color:var(--danger)' }, played.san), `cost you ${(it.loss / 100).toFixed(1)} pawns (${fmt(it.before)} → ${fmt(it.after)}).`),
    el('div', { style: 'margin-top:6px' }, el('span', { class: 'san', style: 'color:var(--accent)' }, bestSan), 'was the engine\'s choice. Green arrow: best move, red: your move.'));
  $('#btn-review-final').classList.remove('hidden');
}

async function showPly(i) {
  const { fens, hist, items } = reviewData;
  const it = items.find(x => x.i === i);
  if (it) return showReviewItem(it, $$('.review-item')[items.indexOf(it)]);
  const g = new Chess(fens[i + 1]);
  await board.sync(g, false);
  const m = hist[i];
  board.mark(MARK.last, m.from); board.mark(MARK.last, m.to);
  $('#review-note').classList.add('hidden');
  $('#btn-review-final').classList.remove('hidden');
}

/* ---------- wiring ---------- */
$('#btn-start').addEventListener('click', () => startGame());
$('#btn-undo').addEventListener('click', undo);
$('#btn-hint').addEventListener('click', hint);
$('#btn-resign').addEventListener('click', resign);
$('#btn-review').addEventListener('click', review);
$('#btn-review-final').addEventListener('click', async () => {
  $$('.review-item').forEach(n => n.classList.remove('active'));
  $('#review-note').classList.add('hidden');
  $('#btn-review-final').classList.add('hidden');
  await board.sync(game, false);
});
$('#btn-new').addEventListener('click', () => {
  if (!over && game.history().length > 1 && !confirm('Abandon the current game? It won\'t be counted.')) return;
  token++; engine.stop(); thinking = false; over = true;
  clearCurrent();
  board.disableInput();
  $('#game').classList.add('hidden');
  $('#review').classList.add('hidden');
  $('#setup').classList.remove('hidden');
  game = new Chess();
  board.sync(game, true);
  renderMoves();
  renderSetup();
});

renderSetup();
renderMoves();
if (settings.current && LEVELS[settings.current.level]) {
  const c = settings.current;
  startGame({ level: c.level, color: c.color, moves: c.moves, hints: c.hints, undos: c.undos });
  toast('Resumed your unfinished game.');
}
