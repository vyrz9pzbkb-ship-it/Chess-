// Turns an engine line into one plain-English sentence ("It wins a knight.").
// Pure functions: pass the chess.js constructor in, so this runs in the browser
// and in the Node build scripts alike.

export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** 'check' | 'capture' | 'quiet' from a SAN string. */
export function moveKind(san) {
  if (/[+#]/.test(san)) return 'check';
  if (san.includes('x')) return 'capture';
  return 'quiet';
}

function material(game, color) {
  let s = 0;
  for (const row of game.board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * VALUE[p.type];
  return s;
}

/** Same position with the other side to move (a "null move"). */
function flipTurn(Chess, fen) {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const g = new Chess();
  return g.load(parts.join(' ')) ? g : null;
}

function isDefended(Chess, fen, square, byColor) {
  // put a dummy enemy piece on `square` and see whether `byColor` can capture it
  const g = new Chess(fen);
  const target = g.get(square);
  if (!target) return false;
  const parts = g.fen().split(' ');
  parts[1] = byColor;
  parts[3] = '-';
  const h = new Chess();
  if (!h.load(parts.join(' '))) return false;
  h.remove(square);
  h.put({ type: 'p', color: byColor === 'w' ? 'b' : 'w' }, square);
  return h.moves({ verbose: true }).some(m => m.to === square);
}

/** Best immediate threat for the side to move in `g`: mate in one or a material grab. */
function immediateThreat(Chess, g) {
  const moves = g.moves({ verbose: true });
  for (const m of moves) {
    g.move(m);
    const mate = g.in_checkmate();
    g.undo();
    if (mate) return { mate: true, move: m };
  }
  let best = null;
  for (const m of moves) {
    if (!m.captured || m.captured === 'k') continue;
    const defended = isDefended(Chess, g.fen(), m.to, m.color === 'w' ? 'b' : 'w');
    const gain = defended ? VALUE[m.captured] - VALUE[m.piece] : VALUE[m.captured];
    if (gain >= 2 && (!best || gain > best.gain)) best = { gain, move: m };
  }
  return best;
}

function article(word) { return /^[aeiou]/.test(word) ? 'an ' + word : 'a ' + word; }

function gainPhrase(gain, capturedTypes) {
  if (gain >= 8) return 'wins the queen';
  if (gain >= 4.5) return 'wins a rook';
  if (gain >= 2.5) return 'wins a piece';
  if (gain >= 1.5) return capturedTypes.includes('r') ? 'wins the exchange' : 'wins two pawns';
  return 'wins a pawn';
}

/**
 * @param Chess chess.js constructor
 * @param fen position before the move
 * @param uci best move
 * @param line {score:{cp}|{mate}, pv:[uci...]} engine line starting with uci
 * @returns one sentence
 */
export function explainMove(Chess, fen, uci, line = {}) {
  const g = new Chess(fen);
  const me = g.turn();
  const opp = me === 'w' ? 'b' : 'w';
  const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  if (!m) return '';
  const score = line.score || {};
  const isCheck = /[+#]/.test(m.san);
  const piece = NAME[m.piece];

  if (g.in_checkmate()) return 'It is checkmate!';
  if (score.mate > 0) {
    return score.mate === 1 ? 'It is checkmate!' :
      `${isCheck ? 'This check' : 'It'} forces checkmate in ${score.mate} moves.`;
  }

  // material won along the engine line (counted after the opponent's replies)
  const base = material(new Chess(fen), me);
  const pv = (line.pv && line.pv[0] === uci) ? line.pv : [uci];
  const h = new Chess(fen);
  let gain = 0;
  const captured = [];
  for (let i = 0; i < Math.min(pv.length, 6); i++) {
    const mv = h.move({ from: pv[i].slice(0, 2), to: pv[i].slice(2, 4), promotion: pv[i][4] });
    if (!mv) break;
    if (mv.captured && mv.color === me) captured.push(mv.captured);
    if (i % 2 === 1) gain = material(h, me) - base;
  }
  if (pv.length === 1) gain = material(h, me) - base;

  // fork: after the move, the moved piece attacks two valuable targets
  let forkTargets = [];
  const nm = flipTurn(Chess, g.fen());
  if (nm) {
    forkTargets = nm.moves({ square: m.to, verbose: true })
      .filter(x => x.captured && (x.captured === 'k' || VALUE[x.captured] >= 3 || VALUE[x.captured] > VALUE[m.piece]))
      .map(x => x.captured);
    if (isCheck && !forkTargets.includes('k')) forkTargets.push('k');
  }

  if (gain >= 1) {
    const what = gainPhrase(gain, captured);
    if (forkTargets.length >= 2) {
      const names = [...new Set(forkTargets)].sort((a, b) => (a === 'k' ? -1 : b === 'k' ? 1 : VALUE[b] - VALUE[a])).slice(0, 2).map(t => NAME[t]);
      const both = `the ${names[0]} and ${names[1] === names[0] ? 'another ' + names[1] : 'the ' + names[1]}`;
      const top = forkTargets.filter(t => t !== 'k').sort((x, y) => VALUE[y] - VALUE[x])[0];
      const direct = top && Math.abs(VALUE[top] - gain) <= 1.5;
      return direct
        ? `The ${piece} forks ${both}, winning the ${NAME[top]}.`
        : `The ${piece} forks ${both}, and you come out ahead: it ${what}.`;
    }
    if (m.captured && VALUE[m.captured] >= gain - 0.5 && !isDefended(Chess, fen, m.to, opp)) {
      return `It captures the undefended ${NAME[m.captured]}.`;
    }
    if (isCheck) return `It's a check that ${what}.`;
    if (m.captured) return `This capture ${what}.`;
    return `It ${what}, because the opponent can't meet every threat.`;
  }

  // threats created by the move
  if (nm) {
    const t = immediateThreat(Chess, nm);
    if (t && t.mate) return `It threatens checkmate with ${t.move.san}.`;
    if (t && t.gain >= 3) return `It attacks the ${NAME[t.move.captured]} and threatens to win it.`;
  }

  // defence: the opponent had a threat that this move stops
  const before = flipTurn(Chess, fen);
  if (before && !new Chess(fen).in_check()) {
    const t0 = immediateThreat(Chess, before);
    if (t0) {
      const after = immediateThreat(Chess, new Chess(g.fen()));
      const stillThere = after && (after.mate === t0.mate) && (t0.mate || after.gain >= t0.gain);
      if (!stillThere) {
        if (t0.mate) return `It defends against the threat of ${t0.move.san} mate.`;
        if (t0.move.to === m.from) return `It moves the attacked ${piece} to safety.`;
        return `It defends the ${NAME[t0.move.captured]} that was under attack.`;
      }
    }
  }

  if (new Chess(fen).in_check()) return 'It is the best way to get out of check.';
  if (m.flags.includes('k') || m.flags.includes('q')) return 'Castling gets the king to safety and brings the rook into play.';
  const cp = score.cp ?? 0;
  if (isCheck) return 'This check drives the enemy king into a worse position.';
  if (m.captured) return `Taking the ${NAME[m.captured]} keeps the material balance in your favour.`;
  if (m.promotion) return `Promoting to ${article(NAME[m.promotion])} decides the game.`;
  if (cp >= 150) return `It builds on your advantage; other moves let the opponent back into the game.`;
  if (cp <= -150) return 'It is the toughest defence; everything else loses faster.';
  return `It's a quiet move that improves the ${piece}; the alternatives are clearly weaker.`;
}
