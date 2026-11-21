// Opening book for the bot, taken from the Opening Simulator's move trees, so that
// games against the bot practise your London or Ruy Lopez (as White) and your
// Caro-Kann (as Black).
// Also checks after a game whether you kept to your setup.
import { fetchJSON } from './ui.js';

let cache = null;
export async function loadBook() {
  if (!cache) cache = fetchJSON(new URL('../data/simulator.json', import.meta.url).href).catch(() => null);
  return cache;
}

/** Which simulator opening a game practises: White picks London or Ruy Lopez, Black is the Caro-Kann. */
export const openingFor = (userColor, practice) => (userColor === 'b' ? 'caro' : practice === 'ruy' ? 'ruy' : 'london');
const treeFor = (data, openingId) => data && data.trees[openingId];

/** Follow the played moves (SAN) down the tree; null once the game leaves it. */
function walk(tree, sans) {
  let node = tree;
  for (const san of sans) {
    node = node && node.c.find(c => c.m === san);
    if (!node) return null;
  }
  return node;
}

/**
 * The bot's book move (UCI) for this position, or null to let Stockfish decide.
 * `data` is data/simulator.json, `sans` the moves so far.
 */
export function bookMove(data, sans, userColor, practice) {
  const openingId = openingFor(userColor, practice);
  const tree = treeFor(data, openingId);
  const node = walk(tree, sans);
  if (!node || !node.c.length) return null;
  const weight = c => {
    const w = c.l.reduce((s, id) => s + (data.lines.find(l => l.id === id) || { w: 1 }).w, 0);
    // as White, the bot opens 1.e4 most of the time so you practise the Caro-Kann
    if (!sans.length && userColor === 'b') return c.m === 'e4' ? w * 3 : w;
    // in Ruy Lopez practice the bot heads for the Ruy: 1...e5 and 2...Nc6 most of the time
    if (openingId === 'ruy' && sans.length === 1) return c.m === 'e5' ? w * 4 : w;
    if (openingId === 'ruy' && sans.length === 3 && sans[1] === 'e5') return c.m === 'Nc6' ? w * 4 : w;
    return w;
  };
  const ws = node.c.map(weight);
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return node.c[i].u; }
  return node.c[0].u;
}

/**
 * Did the player keep to the setup? Returns
 * {opening, status: 'kept' | 'left' | 'notStarted', move, played, expected, note}.
 * `moves` are chess.js verbose moves of the whole game.
 */
export function openingCheck(data, moves, userColor, ChessCtor, openingId = openingFor(userColor)) {
  const name = data.openings[openingId].name;
  const setup = data.setup[openingId];
  const tree = treeFor(data, openingId);
  // a conditional setup move (Ruy Lopez: Ba4 after ...a6, Bb3 after ...b5) only counts while its piece is attacked
  const active = s => !s.when || underAttack(g, s.uci.slice(0, 2), ChessCtor);
  const g = new ChessCtor();
  const played = new Set();
  let node = tree;
  let lastOpp = null;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const moveNo = Math.floor(i / 2) + 1;
    if (m.color !== userColor) {
      node = node && node.c.find(c => c.m === m.san);
      g.move(m.san); lastOpp = m;
      continue;
    }
    const uci = m.from + m.to + (m.promotion || '');
    const inCheck = g.in_check();
    // pending setup moves whose piece is still at home and which are legal now
    const pending = setup.filter(s => !played.has(s.uci) && pieceHome(g, s) && active(s) && legal(g, s.uci, ChessCtor));
    if (!pending.length && !setup.some(s => !s.when && !played.has(s.uci) && pieceHome(g, s))) {
      return { opening: name, status: 'kept', move: moveNo, note: `You completed your ${name} setup by move ${moveNo - 1}.` };
    }
    const bookChild = node && node.c.find(c => c.u === uci);
    const inSetup = setup.some(s => s.uci === uci);
    if (inSetup) played.add(uci);
    const forced = inCheck || (lastOpp && lastOpp.captured && m.to === lastOpp.to && m.captured) ||
      underAttack(g, m.from, ChessCtor);
    if (!inSetup && !bookChild && !forced) {
      // inside the trained tree, the expected move may be a change of plan (e.g. Qc1 against ...Qb6)
      const trained = node && node.c[0];
      const exp = pending[0];
      const expected = trained ? trained.m
        : exp ? new ChessCtor(g.fen()).move({ from: exp.uci.slice(0, 2), to: exp.uci.slice(2, 4) }).san : null;
      const kind = trained && trained.p ? 'the trained change of plan' : 'the setup move';
      if (moveNo === 1 && userColor === 'w') {
        const first = setup[0].san;
        return { opening: name, status: 'notStarted', move: 1, played: m.san, expected: first, note: `You opened with 1.${m.san} instead of 1.${first}, so this wasn't a ${name}.` };
      }
      return {
        opening: name, status: 'left', move: moveNo, played: m.san, expected,
        note: `You left your ${name} setup on move ${moveNo} with ${m.san}${expected ? ` (${kind} was ${expected})` : ''}.`,
      };
    }
    if (bookChild) node = bookChild; else node = null;
    g.move(m.san);
    if (moveNo >= 12) break;
  }
  const done = setup.every(s => s.when || played.has(s.uci) || !pieceHome(g, s));
  return { opening: name, status: 'kept', move: null, note: done ? `You kept to your ${name} setup.` : `You kept to your ${name} setup as far as the game went.` };
}

function legal(g, uci, ChessCtor) {
  return !!new ChessCtor(g.fen()).move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
}
/** Is the setup move's piece still on its starting square? (`piece` overrides, e.g. the rook on f1 for Re1.) */
function pieceHome(g, s) {
  const from = s.uci.slice(0, 2);
  const p = g.get(from);
  if (!p) return false;
  const back = from[1] === '1' || from[1] === '8';
  const want = s.piece || (back ? { a: 'r', b: 'n', c: 'b', d: 'q', e: 'k', f: 'b', g: 'n', h: 'r' }[from[0]] : 'p');
  return p.type === want;
}

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** Is the piece on `sq` attacked by something cheaper, or attacked and undefended? */
function underAttack(g, sq, ChessCtor) {
  const piece = g.get(sq);
  if (!piece) return false;
  const parts = g.fen().split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-';
  const h = new ChessCtor();
  if (!h.load(parts.join(' '))) return false;
  const attackers = h.moves({ verbose: true }).filter(m => m.to === sq);
  if (!attackers.length) return false;
  const defended = g.moves({ verbose: true }).some(m => m.to === sq) || defendedBy(g, sq, ChessCtor);
  return !defended || attackers.some(a => VAL[a.piece] < VAL[piece.type]);
}
function defendedBy(g, sq, ChessCtor) {
  // put an enemy pawn on sq and see if we could capture it
  const h = new ChessCtor(g.fen());
  const own = h.get(sq);
  h.remove(sq);
  h.put({ type: 'p', color: own.color === 'w' ? 'b' : 'w' }, sq);
  return h.moves({ verbose: true }).some(m => m.to === sq);
}
