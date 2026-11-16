// Re-generates the one-sentence explanations in data/bestmove.json from a fresh
// engine line (useful after editing js/explain.js). Usage: node tools/explain-bestmove.js
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Chess } = require('../vendor/chess.js/chess.js');
const { Engine } = require('./engine');
const FILE = path.join(__dirname, '../data/bestmove.json');
(async () => {
  const { explainMove } = await import(pathToFileURL(path.join(__dirname, '../js/explain.js')).href);
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const e = new Engine(); await e.ready();
  for (const p of data) {
    if (!p.pv || process.env.REANALYSE) {
      const g = new Chess(p.fen);
      // search the best move's line specifically
      const r = await e.analyse(p.fen, 16, 1);
      p.pv = r[0].move === p.best ? r[0].pv.slice(0, 8) : [p.best];
    }
    p.explanation = explainMove(Chess, p.fen, p.best, { score: p.score, pv: p.pv });
    console.log(p.id, p.bestSan.padEnd(7), p.kind.padEnd(8), p.explanation);
  }
  fs.writeFileSync(FILE, JSON.stringify(data));
  e.quit();
})();
