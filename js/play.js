import { Board, ARROW, uciToMove, moveToUci, uciToSan } from './board.js';
import { Engine, formatScore } from './engine.js';
import { BOT_ELOS, botConfig } from './levels.js';
import { loadBook, bookMove, openingFor } from './book.js';
import { reviewGame } from './review.js';
import { mountReview } from './review-ui.js';
import * as store from './storage.js';
import { $, $$, el, toast, sleep } from './ui.js';

const engine = new Engine();
const board = new Board($('#board'));
let settings = store.load('settings', store.SETTINGS_DEFAULTS);
let botStats = store.load('bot', store.BOT_DEFAULTS);

let game = new Chess();
let elo = BOT_ELOS.includes(settings.botElo) ? settings.botElo : 800;
let colorChoice = settings.botColor || 'w';
let tcChoice = settings.botTc || '0';
let practice = settings.botPractice === 'ruy' ? 'ruy' : 'london';   // White's opening to practise
let userColor = 'w';
let token = 0;           // bumps on undo/new game to discard stale engine answers
let thinking = false;
let over = true;
let hints = 0, undos = 0;
let useBook = true;
let book = null;
let clock = null;        // {w, b, inc, turnStart, timer}
let userClocks = [];     // time left when you made each move (ms), by ply
let reviewToken = 0;

/* ---------------- setup ---------------- */
function renderSetup() {
  $$('#color-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === colorChoice)));
  $$('#tc-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tc === tcChoice)));
  $$('#practice-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.practice === practice)));
  $('#practice-field').classList.toggle('hidden', colorChoice === 'b');
  $('#practice-note').textContent = colorChoice === 'b'
    ? 'As Black the bot usually opens 1.e4 so you can play the Caro-Kann.'
    : practice === 'ruy'
      ? 'As White the bot usually answers 1.e4 with 1...e5 and 2...Nc6, so you reach the Ruy Lopez.'
      : 'As White the bot usually meets 1.d4 with normal London replies.';
  $('#levels').replaceChildren(...BOT_ELOS.map(e => el('button', {
    'aria-pressed': String(e === elo),
    onclick: () => { elo = e; settings.botElo = e; store.save('settings', settings); renderSetup(); },
  }, String(e))));
  const rec = (botStats.elo || {})[elo] || { w: 0, l: 0, d: 0 };
  $('#level-desc').textContent = `Bot rated about ${elo}. ${botConfig(elo).desc} Your record: ${rec.w}W ${rec.l}L ${rec.d}D.`;
}
$$('#color-seg button').forEach(b => b.addEventListener('click', () => {
  colorChoice = b.dataset.color; settings.botColor = colorChoice; store.save('settings', settings); renderSetup();
}));
$$('#practice-seg button').forEach(b => b.addEventListener('click', () => {
  practice = b.dataset.practice; settings.botPractice = practice; store.save('settings', settings); renderSetup();
}));
$$('#tc-seg button').forEach(b => b.addEventListener('click', () => {
  tcChoice = b.dataset.tc; settings.botTc = tcChoice; store.save('settings', settings); renderSetup();
}));

function setStatus(text, kind = '') {
  $('#status').className = 'status ' + kind;
  $('#status-text').textContent = text;
}

/* ---------------- clocks ---------------- */
const fmtClock = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function timeLeft(color) {
  if (!clock) return Infinity;
  const running = !over && game.turn() === color;
  return clock[color] - (running ? performance.now() - clock.turnStart : 0);
}
function renderClocks() {
  const show = !!clock;
  $('#clock-top').classList.toggle('hidden', !show);
  $('#clock-bottom').classList.toggle('hidden', !show);
  if (!show) return;
  const opp = userColor === 'w' ? 'b' : 'w';
  for (const [id, c] of [['top', opp], ['bottom', userColor]]) {
    const t = timeLeft(c);
    $(`#clock-${id}-time`).textContent = fmtClock(t);
    $(`#clock-${id}`).classList.toggle('active', !over && game.turn() === c);
    $(`#clock-${id}`).classList.toggle('low', t < 20000);
  }
}
function startClock(tc, saved) {
  stopClock();
  if (!tc || tc === '0') { clock = null; renderClocks(); return; }
  const [min, inc] = tc.split('+').map(Number);
  clock = { w: min * 60000, b: min * 60000, inc: inc * 1000, turnStart: performance.now(), tc };
  if (saved) Object.assign(clock, { w: saved.w, b: saved.b });
  clock.timer = setInterval(() => {
    renderClocks();
    if (over) return;
    const side = game.turn();
    if (timeLeft(side) <= 0) {
      clock[side] = 0;
      endGame(side === userColor ? 'l' : 'w', 'timeout', side === userColor ? 'You ran out of time.' : 'The bot ran out of time. You win!');
    }
  }, 200);
  renderClocks();
}
function clockAfterMove(mover) {
  if (!clock) return;
  const now = performance.now();
  clock[mover] = clock[mover] - (now - clock.turnStart) + clock.inc;
  clock.turnStart = now;
}
function stopClock() { if (clock && clock.timer) clearInterval(clock.timer); }

/* ---------------- game flow ---------------- */
async function startGame(opts = {}) {
  token++;
  reviewToken++;
  engine.stop();
  engine.newGame();
  book = await loadBook();
  game = new Chess();
  elo = opts.elo || elo;
  userColor = opts.color || (colorChoice === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice);
  over = false; thinking = false;
  hints = opts.hints || 0; undos = opts.undos || 0;
  userClocks = opts.clocks || [];
  useBook = opts.useBook ?? Math.random() < 0.85;
  if (opts.practice) practice = opts.practice;
  for (const san of opts.moves || []) game.move(san);
  $('#setup').classList.add('hidden');
  $('#game').classList.remove('hidden');
  $('#game-buttons').classList.remove('hidden');
  $('#review').classList.add('hidden');
  $('#moves-panel').classList.remove('hidden');
  const tc = opts.tc ?? tcChoice;
  const opName = book ? book.openings[openingFor(userColor, practice)].name : '';
  $('#game-meta').textContent = `You play ${userColor === 'w' ? 'White' : 'Black'} vs the bot (~${elo})${tc && tc !== '0' ? ' · ' + tc : ''}${opName ? ' · practising the ' + opName : ''}`;
  $('#clock-top-name').textContent = `Bot (${elo})`;
  await board.setOrientation(userColor);
  await board.sync(game, false);
  if (!opts.moves && window.matchMedia('(max-width: 900px)').matches) $('.board-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  startClock(tc, opts.clock);
  board.enableInput(game, userColor, onUserMove);
  renderMoves();
  saveCurrent();
  nextTurn();
}

function nextTurn() {
  updateButtons();
  renderClocks();
  if (checkGameOver()) return;
  if (game.turn() === userColor) setStatus('Your move.', 'turn-' + userColor);
  else botMove();
}

async function onUserMove(move) {
  if (over || thinking || game.turn() === userColor) return false;
  userClocks[game.history().length - 1] = clock ? Math.max(0, Math.round(timeLeft(userColor))) : null;
  clockAfterMove(userColor);
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
  const cfg = botConfig(elo);
  const started = performance.now();
  let uci = useBook ? bookMove(book, game.history(), userColor, practice) : null;
  if (!uci) {
    const legal = game.moves({ verbose: true });
    if (Math.random() < cfg.random) uci = moveToUci(legal[Math.floor(Math.random() * legal.length)]);
    else {
      const res = await engine.analyse(game.fen(), { depth: cfg.depth, movetime: cfg.movetime, skill: cfg.skill, elo: cfg.elo || 0 });
      uci = res.bestmove || moveToUci(legal[0]);
    }
  }
  const wait = 350 + Math.random() * 300 - (performance.now() - started);
  if (wait > 0) await sleep(wait);
  if (t !== token || over) return;
  thinking = false;
  const mover = game.turn();
  game.move(uciToMove(uci));
  clockAfterMove(mover);
  await board.sync(game, true);
  renderMoves();
  saveCurrent();
  nextTurn();
}

function checkGameOver() {
  if (!game.game_over()) return false;
  if (game.in_checkmate()) {
    const res = game.turn() === userColor ? 'l' : 'w';
    endGame(res, 'checkmate', res === 'w' ? 'Checkmate. You win! 🎉' : 'Checkmate. The bot wins.');
  } else {
    const reason = game.in_stalemate() ? 'stalemate' : game.in_threefold_repetition() ? 'repetition' : game.insufficient_material() ? 'insufficient material' : '50-move rule';
    endGame('d', reason, `Draw by ${reason}.`);
  }
  return true;
}

const REASON_TEXT = { checkmate: 'checkmate', resignation: 'resignation', timeout: 'timeout' };

function endGame(res, reason, text) {
  if (over) return;
  over = true; thinking = false;
  token++;
  stopClock();
  renderClocks();
  board.disableInput();
  setStatus(text, res === 'w' ? 'good' : res === 'l' ? 'bad' : 'info');
  botStats.elo = botStats.elo || {};
  const rec = botStats.elo[elo] || (botStats.elo[elo] = { w: 0, l: 0, d: 0 });
  rec[res]++;
  store.save('bot', botStats);
  clearCurrent();
  updateButtons();
  $('#game-buttons').classList.add('hidden');
  const record = {
    id: 'g' + Date.now(), at: Date.now(), userColor, elo, tc: clock ? clock.tc : null, opening: openingFor(userColor, practice),
    result: res, reason: REASON_TEXT[reason] || reason, moves: game.history(),
    clocks: userClocks.slice(0, game.history().length), hints, undos, review: null,
  };
  saveGame(record);
  runReview(record);
}

/* ---------------- saving ---------------- */
function saveGame(record) {
  const data = store.load('games', store.GAMES_DEFAULTS);
  const i = data.games.findIndex(g => g.id === record.id);
  if (i >= 0) data.games[i] = record; else data.games.push(record);
  if (data.games.length > 150) data.games.splice(0, data.games.length - 150);
  // if storage is full, drop the reviews of the oldest games first
  for (let tries = 0; tries < 50; tries++) {
    try { localStorage.setItem('chesstrainer.games', JSON.stringify(data)); return; } catch (e) {
      const old = data.games.find(g => g.review && g.id !== record.id);
      if (!old) return;
      old.review = null;
    }
  }
}

/* ---------------- review ---------------- */
async function runReview(record) {
  const t = ++reviewToken;
  $('#review').classList.remove('hidden');
  $('#review-body').replaceChildren();
  const bar = $('#review-bar');
  bar.classList.remove('hidden');
  const review = await reviewGame(engine, Chess, record, book, (i, n) => {
    if (t !== reviewToken) return;
    $('#review-progress').replaceChildren(el('span', { class: 'loader' }), ` Stockfish is reviewing your game (depth 15): position ${Math.min(i + 1, n)} of ${n}…`);
    bar.firstElementChild.style.width = (100 * i / n) + '%';
  }, () => t !== reviewToken);
  if (!review || t !== reviewToken) return;
  bar.classList.add('hidden');
  $('#review-progress').textContent = '';
  record.review = review;
  saveGame(record);
  $('#moves-panel').classList.add('hidden');
  mountReview($('#review-body'), record, board, () => engine);
  if (window.matchMedia('(max-width: 900px)').matches) $('#review').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- buttons ---------------- */
function updateButtons() {
  const userTurn = game.turn() === userColor;
  $('#btn-undo').disabled = over || !!clock || game.history().length === 0 || (!userTurn && !thinking) ||
    (userColor === 'b' && game.history().length < 2 && !thinking);
  $('#btn-undo').title = clock ? 'Undo is off in games with a clock' : '';
  $('#btn-hint').disabled = over || !userTurn || thinking;
  $('#btn-resign').disabled = over;
}

function undo() {
  if (over || clock) return;
  if (thinking) { token++; thinking = false; engine.stop(); game.undo(); }
  else if (game.turn() === userColor && game.history().length >= 2) { game.undo(); game.undo(); }
  else return;
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
  setStatus(`Best move: ${uciToSan(fen, res.bestmove)}${line ? ` (eval ${formatScore(line.score)} for you)` : ''}`, 'info');
  updateButtons();
}

function resign() {
  if (over || !confirm('Resign this game?')) return;
  engine.stop();
  endGame('l', 'resignation', 'You resigned.');
}

/* ---------------- move list ---------------- */
function renderMoves() {
  const box = $('#moves');
  box.replaceChildren();
  const hist = game.history();
  hist.forEach((san, i) => {
    if (i % 2 === 0) box.append(el('div', { class: 'num' }, `${i / 2 + 1}.`));
    box.append(el('div', { class: 'mv' + (i === hist.length - 1 ? ' cur' : '') }, san));
  });
  box.scrollTop = box.scrollHeight;
}

/* ---------------- unfinished game ---------------- */
function saveCurrent() {
  if (over) return;
  settings.current = {
    elo, color: userColor, moves: game.history(), hints, undos, useBook, clocks: userClocks, practice,
    tc: clock ? clock.tc : '0', clock: clock ? { w: Math.round(timeLeft('w')), b: Math.round(timeLeft('b')) } : null,
  };
  store.save('settings', settings);
}
function clearCurrent() { delete settings.current; store.save('settings', settings); }

/* ---------------- wiring ---------------- */
$('#btn-start').addEventListener('click', () => startGame());
$('#btn-undo').addEventListener('click', undo);
$('#btn-hint').addEventListener('click', hint);
$('#btn-resign').addEventListener('click', resign);
$('#btn-new').addEventListener('click', () => {
  if (!over && game.history().length > 1 && !confirm('Abandon the current game? It won\'t be saved.')) return;
  token++; reviewToken++; engine.stop(); thinking = false; over = true;
  stopClock(); clock = null; renderClocks();
  clearCurrent();
  board.disableInput();
  $('#game').classList.add('hidden');
  $('#review').classList.add('hidden');
  $('#moves-panel').classList.remove('hidden');
  $('#setup').classList.remove('hidden');
  game = new Chess();
  board.sync(game, true);
  renderMoves();
  renderSetup();
});
// keep the clock honest when the tab is hidden and shown again
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderClocks(); });
window.addEventListener('beforeunload', saveCurrent);

renderSetup();
renderMoves();
if (settings.current && settings.current.moves) {
  const c = settings.current;
  startGame({ elo: c.elo, color: c.color, moves: c.moves, hints: c.hints, undos: c.undos, useBook: c.useBook, clocks: c.clocks, tc: c.tc, clock: c.clock, practice: c.practice });
  toast('Resumed your unfinished game.');
}
