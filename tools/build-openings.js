// Validates every opening line with chess.js and writes data/openings.json.
const path = require('path');
const { Chess } = require(path.join(__dirname, '../vendor/chess.js/chess.js'));
const src = require('./openings.src.js');
let ok = true;
for (const op of src) for (const line of op.lines) {
  const g = new Chess();
  line.moves = line.moves.map(([san, note], i) => {
    const m = g.move(san);
    if (!m) { ok = false; console.error(`Illegal: ${op.name} / ${line.name} ply ${i + 1} ${san}`); return null; }
    return { san: m.san, uci: m.from + m.to + (m.promotion || ''), note };
  });
}
if (!ok) process.exit(1);
require('fs').writeFileSync(path.join(__dirname, '../data/openings.json'), JSON.stringify(src, null, 1));
console.log('openings.json written:', src.reduce((n, o) => n + o.lines.length, 0), 'lines');
