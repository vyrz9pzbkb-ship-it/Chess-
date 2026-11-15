// Verifies puzzle candidates with Stockfish and writes data/puzzles.json.
// Usage: node tools/build-puzzles.js   (DEPTH=20 to search deeper)
const { Chess } = require('../vendor/chess.js/chess.js');
const { Engine, val } = require('./engine');
const cands = require('./puzzle-candidates');
const D = +process.env.DEPTH || 18;
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const uci = m => m.from + m.to + (m.promotion || '');
(async () => {
  const e = new Engine(); await e.ready();
  const out = [], fails = [];
  for (let i = 0; i < cands.length; i++) {
    if (only && !only.includes(i)) continue;
    const [fen, key, theme, rating, title] = cands[i];
    const g = new Chess();
    if (!g.load(fen)) { fails.push([i, 'bad fen', g.validate_fen(fen)]); continue; }
    const km = g.move(key, { sloppy: true });
    if (!km) { fails.push([i, 'illegal key ' + key]); continue; }
    g.undo();
    const mateN = { mateIn1: 1, mateIn2: 2, mateIn3: 3 }[theme];
    const plies = mateN ? mateN * 2 - 1 : 3;
    const sol = []; let err = null;
    for (let p = 0; p < plies; p++) {
      if (g.game_over()) break;
      const pos = g.fen();
      if (p % 2 === 0) {
        const r = await e.analyse(pos, D, 3);
        const best = r[0], second = r[1];
        let mv = p === 0 ? uci(km) : best.move;
        const tm = g.move(mv, { sloppy: true }); const isMate = g.in_checkmate(); g.undo();
        if (p === 0 && best.move !== mv && !isMate) {
          const alt = r.find(x => x.move === mv);
          err = `engine prefers ${best.move} ${JSON.stringify(best.score)} over key ${mv} ${alt ? JSON.stringify(alt.score) : '(not top3)'}`; break;
        }
        let unique = true;
        if (isMate) unique = true;
        else if (best.score.mate > 0) unique = !(second && second.score.mate > 0 && second.score.mate <= best.score.mate) || (mateN && p === 0 && false);
        else unique = !second || (val(best.score) - val(second.score) >= 150);
        if (mateN && p === 0 && best.score.mate !== mateN && !isMate) { err = `expected mate ${mateN}, got ${JSON.stringify(best.score)}`; break; }
        if (!unique) {
          if (p === 0) { err = `key not unique: ${best.move} ${JSON.stringify(best.score)} vs ${second.move} ${JSON.stringify(second.score)}`; break; }
          sol.pop(); g.undo(); break;
        }
        if (!mateN && p === 0 && val(best.score) < 200) { err = 'key eval too low ' + JSON.stringify(best.score); break; }
        sol.push(mv); g.move(mv, { sloppy: true });
      } else {
        const r = await e.analyse(pos, D, 1);
        sol.push(r[0].move); g.move(r[0].move, { sloppy: true });
      }
    }
    if (err) { fails.push([i, title, err]); continue; }
    if (mateN && !g.in_checkmate()) { fails.push([i, title, 'line does not end in mate: ' + sol.join(' ')]); continue; }
    const san = []; const g2 = new Chess(fen); sol.forEach(m => san.push(g2.move(m, { sloppy: true }).san));
    out.push({ id: 'p' + String(out.length + 1).padStart(3, '0'), fen, moves: sol, san, theme, rating, title });
    console.error('OK', i, title, san.join(' '));
  }
  console.error('FAILS'); fails.forEach(f => console.error(JSON.stringify(f)));
  if (!only) { out.sort((a, b) => a.rating - b.rating); require('fs').writeFileSync(__dirname + '/../data/puzzles.json', JSON.stringify(out, null, 1)); console.error('wrote data/puzzles.json', out.length); }
  e.quit();
})();
