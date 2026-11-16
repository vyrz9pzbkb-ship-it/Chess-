// Builds data/bestmove.json (Find the Best Move positions) and data/master-games.json
// (Guess the Move) from master-game PGN files, using the vendored Stockfish.
//
// Usage: node tools/build-bestmove.js <dir-with-pgn-files> [positions=120]
// The PGNs used were the PgnMentor player collections (Morphy.pgn, Tal.pgn, ...).
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Chess } = require('../vendor/chess.js/chess.js');
const { Engine, val } = require('./engine');
const { parsePgnFile } = require('./pgn');
const { GAMES, NAMES } = require('./master-games.src');

const dir = process.argv[2];
const TARGET = +(process.argv[3] || 120);
if (!dir) { console.error('usage: node tools/build-bestmove.js <pgn-dir> [count]'); process.exit(1); }

let seed = +(process.env.SEED || 20261116);
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uci = m => m.from + m.to + (m.promotion || '');
const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const pieceMaterial = g => g.board().flat().filter(Boolean).reduce((s, p) => s + (p.type === 'p' ? 0 : V[p.type]), 0);
const clampCp = s => s.mate !== undefined ? (s.mate > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, s.cp));
const year = h => (h.Date || '').slice(0, 4).replace(/\?/g, '');
const cleanName = (n) => {
  const c = (n || '?').replace(/\s+/g, ' ').trim().replace(/^(.+?),\s*(.+)$/, '$2 $1');
  return NAMES[c] || c;
};

function sacrifice(fen, m) {
  // does the moved piece land on a square the opponent attacks, giving up more than it takes?
  const g = new Chess(fen); g.move(m);
  const att = g.moves({ verbose: true }).filter(x => x.to === m.to);
  if (!att.length) return false;
  const cheapest = Math.min(...att.map(x => V[x.piece] || 0));
  return V[m.piece] - (m.captured ? V[m.captured] : 0) >= 2 && cheapest < V[m.piece];
}

(async () => {
  const { explainMove, moveKind } = await import(pathToFileURL(path.join(__dirname, '../js/explain.js')).href);
  const e = new Engine(); await e.ready();

  /* ---------- Find the Best Move ---------- */
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.pgn')).sort();
  const pool = [];
  for (const f of files) {
    const games = parsePgnFile(path.join(dir, f)).filter(g => !g.headers.FEN && g.sans.length >= 50);
    shuffle(games).slice(0, +(process.env.PER_FILE || 40)).forEach(g => pool.push({ ...g, file: f }));
  }
  shuffle(pool);
  console.error(`scanning ${pool.length} games`);
  // MERGE=1 keeps the positions already in data/bestmove.json and adds new ones
  const OUT = path.join(__dirname, '../data/bestmove.json');
  const found = process.env.MERGE && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).map(({ id, ...r }) => r) : [];
  const usedGames = new Set(found.map(p => JSON.stringify([p.source.white, p.source.black, p.source.year, p.source.move])));
  const seenFens = new Set(found.map(p => p.fen));
  const startCount = found.length;
  for (const game of pool) {
    if (found.length >= TARGET * 1.4) break;
    if (found.length - startCount >= +(process.env.MAX_NEW || 1e9)) break;
    const key = JSON.stringify([game.headers.White, game.headers.Black, game.headers.Date, game.headers.Round]);
    if (usedGames.has(key)) continue;
    const g = new Chess();
    const fens = [];
    let ok = true;
    for (const san of game.sans) { const mv = g.move(san, { sloppy: true }); if (!mv) { ok = false; break; } fens.push({ fen: g.fen(), last: mv }); }
    if (!ok) continue;
    // candidate plies: moves 12..35, middlegame material
    const cands = shuffle(fens.map((x, i) => ({ ...x, ply: i + 1 })).filter(x => x.ply >= 22 && x.ply <= 70 && !seenFens.has(x.fen))).slice(0, +(process.env.PLIES || 4));
    for (const c of cands) {
      const pos = new Chess(c.fen);
      if (pos.in_check() || pos.game_over() || pos.moves().length < 12) continue;
      if (pieceMaterial(pos) < 26) continue;
      const quick = await e.analyse(c.fen, 11, 2);
      if (quick.length < 2) continue;
      const gap = val(quick[0].score) - val(quick[1].score);
      const best = clampCp(quick[0].score);
      if (gap < 120 || best < -150 || best > 700) continue;
      // skip trivial recaptures
      const bm = pos.move({ from: quick[0].move.slice(0, 2), to: quick[0].move.slice(2, 4), promotion: quick[0].move[4] });
      pos.undo();
      if (!bm) continue;
      if (c.last.captured && bm.to === c.last.to) continue;
      const deep = await e.analyse(c.fen, 18, 3);
      if (deep.length < 2 || deep[0].move !== quick[0].move) continue;
      const dgap = val(deep[0].score) - val(deep[1].score);
      const dbest = clampCp(deep[0].score);
      if (dgap < 100 || dbest < -150 || dbest > 800) continue;
      const m = pos.move({ from: deep[0].move.slice(0, 2), to: deep[0].move.slice(2, 4), promotion: deep[0].move[4] }); pos.undo();
      const kind = moveKind(m.san);
      const sac = sacrifice(c.fen, m);
      const mate = deep[0].score.mate;
      // difficulty heuristic
      let rating = 1150;
      rating += kind === 'quiet' ? 250 : kind === 'capture' ? -150 : -50;
      if (sac) rating += 350;
      if (mate) rating += mate > 3 ? 250 : mate > 1 ? 100 : -300;
      if (dgap >= 400) rating -= 150; else if (dgap < 160) rating += 150;
      if (Math.abs(dbest) < 60) rating += 100;              // only move to hold the balance
      rating += Math.min(150, (pos.moves().length - 30) * 4);
      if (m.captured && !sac && V[m.captured] >= 3) rating -= 100;
      rating = Math.max(500, Math.min(2300, Math.round(rating / 25) * 25));
      const nextSan = game.sans[c.ply];
      const top = deep.map(l => {
        const t = new Chess(c.fen).move({ from: l.move.slice(0, 2), to: l.move.slice(2, 4), promotion: l.move[4] });
        return { uci: l.move, san: t.san, score: l.score };
      });
      found.push({
        fen: c.fen, best: deep[0].move, bestSan: m.san, score: deep[0].score, kind, sacrifice: sac, rating, top,
        explanation: explainMove(Chess, c.fen, deep[0].move, deep[0]),
        source: { white: cleanName(game.headers.White), black: cleanName(game.headers.Black), year: year(game.headers), event: game.headers.Event || '', move: Math.ceil((c.ply + 1) / 2), played: nextSan },
      });
      usedGames.add(key);
      console.error(found.length, m.san, kind, rating, '|', found[found.length - 1].explanation);
      break;
    }
  }
  // keep TARGET positions spread over the rating range
  found.sort((a, b) => a.rating - b.rating);
  let picked = found;
  if (found.length > TARGET) {
    picked = [];
    for (let i = 0; i < TARGET; i++) picked.push(found[Math.floor(i * found.length / TARGET)]);
  }
  picked.forEach((p, i) => { p.id = 'b' + String(i + 1).padStart(3, '0'); });
  fs.writeFileSync(OUT, JSON.stringify(picked.map(({ id, ...r }) => ({ id, ...r }))));
  console.error('wrote data/bestmove.json', picked.length);

  /* ---------- Guess the Move ---------- */
  if (process.env.SKIP_GAMES) { e.quit(); return; }
  const all = files.flatMap(f => parsePgnFile(path.join(dir, f)));
  const outGames = [];
  for (const spec of GAMES) {
    const game = all.find(x => spec.match(x.headers));
    if (!game) { console.error('NOT FOUND', spec.id); continue; }
    const g = new Chess();
    const moves = [];
    for (const san of game.sans) {
      const mv = g.move(san, { sloppy: true });
      if (!mv) { console.error('bad move', spec.id, san); break; }
      moves.push({ san: mv.san, uci: uci(mv) });
    }
    const side = spec.side;
    const replay = new Chess();
    for (let i = 0; i < moves.length; i++) {
      const turn = replay.turn();
      if (turn === side && i >= spec.startPly) {
        const lines = await e.analyse(replay.fen(), 16, 3);
        moves[i].top = lines.map(l => {
          const t = new Chess(replay.fen()).move({ from: l.move.slice(0, 2), to: l.move.slice(2, 4), promotion: l.move[4] });
          return { uci: l.move, san: t.san };
        });
        moves[i].kind = moveKind(moves[i].san);
      }
      replay.move(moves[i].san);
    }
    outGames.push({
      id: spec.id, title: spec.title, white: spec.white || cleanName(game.headers.White), black: spec.black || cleanName(game.headers.Black),
      event: spec.event || game.headers.Event, year: year(game.headers), result: game.headers.Result, side, startPly: spec.startPly,
      intro: spec.intro, moves,
    });
    console.error('game', spec.id, moves.length, 'plies');
  }
  fs.writeFileSync(path.join(__dirname, '../data/master-games.json'), JSON.stringify(outGames));
  console.error('wrote data/master-games.json', outGames.length);
  e.quit();
})();
