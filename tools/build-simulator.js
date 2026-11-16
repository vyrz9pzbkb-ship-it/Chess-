// Builds data/simulator.json (Opening Simulator move tree) from tools/simulator.src.js.
// Checks every move with chess.js, and (unless NO_ENGINE=1) asks Stockfish whether
// each of YOUR moves is sound: it flags moves that lose more than 1.5 pawns, or
// more than 0.6 pawns while leaving you worse off.
// Usage: node tools/build-simulator.js
const path = require('path');
const fs = require('fs');
const { Chess } = require('../vendor/chess.js/chess.js');
const { OPENINGS, PLANS, DEFAULT, LINES } = require('./simulator.src');

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tokens = src => [...src.matchAll(/\{([!?])([^}]*)\}|(\S+)/g)].map(m => (m[3] ? { san: m[3] } : { kind: m[1], text: m[2].trim() }));

let ok = true;
const fail = msg => { ok = false; console.error('ERROR', msg); };

const roots = {};
for (const id of Object.keys(OPENINGS)) roots[id] = { c: [] };
const lines = [];
const userNodes = [];   // {fen, node, line, opening}

LINES.forEach(([opening, family, w, name, src]) => {
  const side = OPENINGS[opening].side;
  const id = slug(name);
  if (lines.some(l => l.id === id)) fail('duplicate line name ' + name);
  const line = { id, opening, family, w, name, plies: 0 };
  lines.push(line);
  const g = new Chess();
  let node = roots[opening];
  let last = null;
  for (const t of tokens(src)) {
    if (!t.san) {
      if (!last) { fail(`${name}: annotation before any move`); continue; }
      const mine = last.side === side;
      if (t.kind === '?' && !mine) fail(`${name}: {? } after opponent move ${last.node.m}`);
      if (t.kind === '!' && mine) fail(`${name}: {! } after your move ${last.node.m}`);
      if (t.kind === '!') t.text = t.text.replace(/^Watch out!\s*/, ''); // the page adds the label
      const key = t.kind === '?' ? 'n' : 'x';
      if (last.node[key] && last.node[key] !== t.text) fail(`${name}: conflicting note on ${last.node.m}: "${last.node[key]}" vs "${t.text}"`);
      last.node[key] = t.text;
      continue;
    }
    const mover = g.turn();
    const fen = g.fen();
    const mv = g.move(t.san);
    if (!mv) { fail(`${name}: illegal move ${t.san} at ply ${line.plies + 1} (${fen})`); return; }
    const uci = mv.from + mv.to + (mv.promotion || '');
    const mine = mover === side;
    let child = node.c.find(c => c.u === uci);
    if (!child) {
      if (mine && node.c.length) fail(`${name}: you play ${mv.san} but another line plays ${node.c[0].m} in the same position (${fen})`);
      child = { m: mv.san, u: uci, c: [], l: [] };
      node.c.push(child);
      if (mine) userNodes.push({ fen, node: child, line: name });
    }
    child.l.push(id);
    line.plies++;
    node = child;
    last = { node: child, side: mover };
  }
  if (line.plies < 12) fail(`${name}: only ${line.plies} plies`);
});

// default notes for your moves
for (const u of userNodes) {
  const side = new Chess(u.fen).turn();
  if (!u.node.n) u.node.n = DEFAULT[side][u.node.m] || DEFAULT[side][u.node.m.replace(/[+#]/, '')] || null;
  if (!u.node.n) fail(`${u.line}: no explanation for your move ${u.node.m} (${u.fen})`);
}

function countReplies(opening) {
  return lines.filter(l => l.opening === opening).length;
}

(async () => {
  if (!ok) process.exit(1);
  for (const id of Object.keys(OPENINGS)) console.error(`${id}: ${countReplies(id)} lines`);

  if (!process.env.NO_ENGINE) {
    const { Engine } = require('./engine');
    const clamp = s => (s.mate !== undefined ? (s.mate > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, s.cp)));
    const e = new Engine(); await e.ready();
    const depth = +(process.env.DEPTH || 14);
    let bad = 0;
    for (const u of userNodes) {
      const before = await e.analyse(u.fen, depth, 1);
      const g = new Chess(u.fen); g.move(u.node.m);
      const after = await e.analyse(g.fen(), depth, 1);
      const best = clamp(before[0].score);
      const mine = after[0].move ? -clamp(after[0].score) : (g.in_checkmate() ? 1000 : 0);
      const loss = best - mine;
      // flag: a clear loss, or a smaller one that also leaves you worse
      if (loss > 150 || (loss > 60 && mine < -30) || mine < -120) {
        bad++;
        const bestSan = new Chess(u.fen).move({ from: before[0].move.slice(0, 2), to: before[0].move.slice(2, 4), promotion: before[0].move[4] }).san;
        console.error(`CHECK ${u.line}: ${u.node.m} loses ${loss}cp (eval ${mine}); engine prefers ${bestSan} (${best})  ${u.fen}`);
      }
    }
    console.error(`${userNodes.length} of your moves checked, ${bad} flagged`);
    e.quit();
  }

  const out = { openings: OPENINGS, plans: PLANS, lines, trees: roots };
  fs.writeFileSync(path.join(__dirname, '../data/simulator.json'), JSON.stringify(out));
  console.error('wrote data/simulator.json');
})();
