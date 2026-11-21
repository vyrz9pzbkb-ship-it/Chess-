// Automatic game review: Stockfish on every position, move labels, explanations,
// accuracy, opening check and the three main lessons. Pure logic, no DOM.
import { explainMove, VALUE, NAME } from './explain.js';
import { scoreToCp } from './engine.js';
import { openingCheck, openingFor } from './book.js';

export const REVIEW_VERSION = 1;
export const REVIEW_DEPTH = 15;
export const LABELS = ['Brilliant', 'Best', 'Good', 'Inaccuracy', 'Mistake', 'Blunder', 'Missed Win'];
export const KEY_LABELS = ['Mistake', 'Blunder', 'Missed Win'];

const toMove = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

/** Win chance (0-100) from centipawns, as used by Lichess for accuracy. */
export const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
export function moveAccuracy(cpBefore, cpAfter) {
  const drop = Math.max(0, winPct(cpBefore) - winPct(cpAfter));
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
}

function material(g, color) {
  let s = 0;
  for (const row of g.board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * VALUE[p.type];
  return s;
}

/** Does the move give up material (the moved piece can be taken for less)? */
function isSacrifice(Chess, fen, m) {
  if (VALUE[m.piece] < 3) return false;
  const g = new Chess(fen); g.move(m);
  const takers = g.moves({ verbose: true }).filter(x => x.to === m.to);
  if (!takers.length) return false;
  const cheapest = Math.min(...takers.map(x => VALUE[x.piece] || 0));
  const gave = VALUE[m.piece] - (m.captured ? VALUE[m.captured] : 0);
  return gave >= 2 && cheapest < VALUE[m.piece];
}

/** Material the side `color` loses along `pv` from `fen` (counted after the opponent's replies). */
function materialSwing(Chess, fen, pv, color, plies = 6) {
  const g = new Chess(fen);
  const base = material(g, color);
  let worst = 0;
  const caps = [];
  for (let i = 0; i < Math.min(plies, pv.length); i++) {
    const m = g.move(toMove(pv[i]));
    if (!m) break;
    if (m.captured) caps.push(m);
    const diff = material(g, color) - base;
    if (g.turn() === color) worst = diff;     // value once it's our move again
  }
  return { loss: -worst, caps };
}

const lcFirst = s => s.charAt(0).toLowerCase() + s.slice(1);
const gainName = n => (n >= 8 ? 'your queen' : n >= 4.5 ? 'a rook' : n >= 2.5 ? 'a piece' : n >= 1.5 ? 'the exchange' : 'a pawn');

/** One sentence: why the played move was a mistake. */
export function explainMistake(Chess, fen, played, afterLine, label, best) {
  const me = played.color;
  const g = new Chess(fen); g.move(played);
  const fenAfter = g.fen();
  const sc = afterLine && afterLine.score;            // opponent's view
  if (sc && sc.mate > 0) return `${played.san} allows checkmate in ${sc.mate}.`;
  if (label === 'Missed Win' && best) {
    const why = best.why ? lcFirst(best.why) : 'wins';
    return `${played.san} lets the win slip: ${best.san} was winning (${why.replace(/\.$/, '')}).`;
  }
  const pv = (afterLine && afterLine.pv) || [];
  const { loss, caps } = materialSwing(Chess, fenAfter, pv, me);
  if (loss >= 1) {
    const first = caps[0];
    // the piece that just moved gets taken
    if (first && first.to === played.to && first.color !== me) {
      if (played.captured && VALUE[played.piece] > VALUE[played.captured] + 1) {
        return `${played.san} is a bad trade: you give up your ${NAME[played.piece]} for a ${NAME[played.captured]}.`;
      }
      return `${played.san} hangs your ${NAME[played.piece]}: ${new Chess(fenAfter).move(toMove(pv[0])).san} wins it.`;
    }
    if (first && first.color !== me) {
      return `${played.san} leaves your ${NAME[first.captured]} on ${first.to} unprotected, and you lose ${gainName(loss)}.`;
    }
    const reply = pv[0] ? new Chess(fenAfter).move(toMove(pv[0])) : null;
    return `${played.san} allows ${reply ? reply.san : 'a tactic'}, which wins ${gainName(loss)}.`;
  }
  if (played.captured && caps[0] && caps[0].to === played.to && VALUE[played.piece] > VALUE[played.captured]) {
    return `${played.san} is a bad trade: your ${NAME[played.piece]} is worth more than the ${NAME[played.captured]}.`;
  }
  if (best) return `${played.san} gives your opponent the upper hand; ${best.san} kept your advantage.`;
  return `${played.san} gives your opponent the upper hand.`;
}

/**
 * Analyse a finished game.
 * game: {moves: [SAN], userColor, opening ('london' | 'ruy' | 'caro')}
 * returns the review object stored with the game.
 */
export async function reviewGame(engine, Chess, game, simData, onProgress = () => {}, isCancelled = () => false) {
  const g = new Chess();
  const verbose = [];
  const fens = [g.fen()];
  for (const san of game.moves) { verbose.push(g.move(san)); fens.push(g.fen()); }

  // 1. engine on every position
  const evals = [];
  for (let i = 0; i < fens.length; i++) {
    if (isCancelled()) return null;
    onProgress(i, fens.length);
    const pos = new Chess(fens[i]);
    if (pos.in_checkmate()) { evals.push({ cp: -1000, score: { mate: 0 }, best: null, pv: [] }); continue; }
    if (pos.game_over()) { evals.push({ cp: 0, score: { cp: 0 }, best: null, pv: [] }); continue; }
    const res = await engine.analyse(fens[i], { depth: REVIEW_DEPTH, skill: 20 });
    const line = res.lines[0] || { score: { cp: 0 }, pv: [] };
    evals.push({ cp: scoreToCp(line.score), score: line.score, best: res.bestmove, pv: line.pv.slice(0, 10) });
  }
  onProgress(fens.length, fens.length);

  // 2. label every one of the user's moves
  const moves = [];
  const accs = [];
  for (let i = 0; i < verbose.length; i++) {
    const m = verbose[i];
    const before = evals[i].cp;              // side to move = mover
    const after = -evals[i + 1].cp;          // flip back to the mover's view
    const entry = { ply: i, san: m.san, cp: before };
    if (m.color !== game.userColor) { moves.push(entry); continue; }
    const uci = m.from + m.to + (m.promotion || '');
    const isBest = evals[i].best === uci;
    const loss = isBest ? 0 : Math.max(0, before - after);
    let label;
    if (loss <= 10) label = isSacrifice(Chess, fens[i], m) && before > -300 && before < 500 && after >= -50 ? 'Brilliant' : 'Best';
    else if (before >= 250 && after < 100 && after > -150) label = 'Missed Win';
    else if (loss >= 200) label = 'Blunder';
    else if (loss >= 100) label = 'Mistake';
    else if (loss >= 50) label = 'Inaccuracy';
    else label = 'Good';
    accs.push(moveAccuracy(before, after));
    Object.assign(entry, { mine: true, uci, label, loss, before, after, fen: fens[i] });
    if (game.clocks && game.clocks[i] != null) entry.clock = game.clocks[i];
    if (KEY_LABELS.includes(label) && evals[i].best) {
      const bm = new Chess(fens[i]).move(toMove(evals[i].best));
      const bestWhy = explainMove(Chess, fens[i], evals[i].best, { score: evals[i].score, pv: evals[i].pv });
      entry.best = evals[i].best;
      entry.bestSan = bm.san;
      entry.bestWhy = bestWhy;
      entry.why = explainMistake(Chess, fens[i], m, { score: evals[i + 1].score, pv: evals[i + 1].pv }, label, { san: bm.san, why: bestWhy });
    }
    moves.push(entry);
  }

  const counts = Object.fromEntries(LABELS.map(l => [l, 0]));
  moves.filter(x => x.mine).forEach(x => { counts[x.label]++; });
  const accuracy = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null;
  const evalSeries = evals.map((e, i) => (i % 2 === 0 ? e.cp : -e.cp));     // White's view
  const opening = simData ? openingCheck(simData, verbose, game.userColor, Chess, game.opening || openingFor(game.userColor)) : null;
  const lessons = buildLessons(moves, counts, accuracy, opening, game);

  return { version: REVIEW_VERSION, depth: REVIEW_DEPTH, accuracy, counts, moves, evalSeries, opening, lessons };
}

/** Pick the three most important lessons from the game. */
export function buildLessons(moves, counts, accuracy, opening, game) {
  const mine = moves.filter(m => m.mine);
  const key = mine.filter(m => KEY_LABELS.includes(m.label));
  const num = m => `${Math.floor(m.ply / 2) + 1}${m.ply % 2 ? '...' : '.'}${m.san}`;
  const out = [];
  const hung = key.filter(m => /hangs|unprotected|bad trade/.test(m.why || ''));
  if (hung.length) out.push({ score: hung.reduce((s, m) => s + m.loss, 0) + 300, text: `Before every move, ask "what can my opponent take?" You gave away material ${hung.length} time${hung.length > 1 ? 's' : ''} (for example ${num(hung[0])}).` });
  const mates = key.filter(m => /checkmate/.test(m.why || ''));
  if (mates.length) out.push({ score: 2000, text: `Check your opponent's checks and threats against your king: ${num(mates[0])} allowed a mating attack.` });
  const missed = mine.filter(m => m.label === 'Missed Win');
  if (missed.length) out.push({ score: missed.reduce((s, m) => s + m.loss, 0) + 200, text: `Look for checks, captures and threats for YOU too: you missed ${missed.length} winning chance${missed.length > 1 ? 's' : ''}, like ${missed[0].bestSan} instead of ${num(missed[0])}.` });
  if (opening && opening.status !== 'kept') out.push({ score: 250, text: `Stick to your ${opening.opening} plan: ${opening.note.replace(/^You /, 'you ')}` });
  const other = key.filter(m => !hung.includes(m) && !mates.includes(m) && m.label !== 'Missed Win');
  if (other.length) out.push({ score: other.reduce((s, m) => s + m.loss, 0), text: `Slow down at critical moments: ${num(other[0])} was a ${other[0].label.toLowerCase()}; ${other[0].bestSan} was better.` });
  const lowClock = key.filter(m => m.clock != null && m.clock < 30000);
  if (lowClock.length >= 2) out.push({ score: 400, text: `Manage your clock: ${lowClock.length} of your mistakes came with less than 30 seconds left.` });
  if (counts.Inaccuracy >= 4) out.push({ score: counts.Inaccuracy * 30, text: `You had ${counts.Inaccuracy} inaccuracies: before moving, compare two candidate moves instead of playing the first one you see.` });
  if (counts.Brilliant) out.push({ score: 50, text: `Great find: you played ${counts.Brilliant} brilliant sacrifice${counts.Brilliant > 1 ? 's' : ''}. Trust your calculation!` });
  if (accuracy != null && accuracy >= 85 && !counts.Blunder) out.push({ score: 40, text: `Clean game with ${accuracy}% accuracy and no blunders. Keep checking threats every move.` });
  if (opening && opening.status === 'kept') out.push({ score: 30, text: opening.note });
  out.push({ score: 1, text: 'Replay your mistakes with the Retry button until you find the better move.' });
  out.push({ score: 0, text: 'Play slowly in the opening: follow your setup and check each move for threats.' });
  return out.sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.text);
}
