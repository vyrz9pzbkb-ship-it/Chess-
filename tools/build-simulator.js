// Builds data/simulator.json (Opening Simulator move tree) from tools/simulator.src.js.
//
// Your moves always follow the fixed SETUP order. For every one of your moves the
// build asks Stockfish whether the setup move is sound. If it loses material or
// walks into a threat, the build makes a change of plan (AUTO CHANGE): it prefers
// a recapture, then one of your setup moves played early, then moving the attacked
// piece, then Stockfish's best move, and writes the reason from what the setup move
// would have allowed. Write >Move{reason} in the source to choose it yourself.
// UNNEEDED warns about a written change of plan where the setup move was fine;
// write >>Move{reason} for a planned change (an answer to the opening itself).
// Opponent moves missing from a line are filled in with Stockfish's choice.
// Usage: node tools/build-simulator.js     (DEPTH=14 by default)
const path = require('path');
const fs = require('fs');
const { Chess } = require('../vendor/chess.js/chess.js');
const { Engine } = require('./engine');
const { OPENINGS, PLANS, SETUP, LINES, TIPS } = require('./simulator.src');

const DEPTH = +(process.env.DEPTH || 14);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clamp = s => (s.mate !== undefined ? (s.mate > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, s.cp)));
const toMove = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const uciOf = m => m.from + m.to + (m.promotion || '');

function parse(src) {
  const out = [];
  for (const m of src.matchAll(/>(>?)(\S+?)\{([^}]*)\}|\{!([^}]*)\}|(\S+)/g)) {
    if (m[2]) out.push({ type: 'change', san: m[2], text: m[3].trim(), planned: !!m[1] });
    else if (m[4] !== undefined) out.push({ type: 'watch', text: m[4].trim().replace(/^Watch out!\s*/, '') });
    else out.push({ type: 'opp', san: m[5] });
  }
  return out;
}

const ORIGINAL = { a: 'r', b: 'n', c: 'b', d: 'q', e: 'k', f: 'b', g: 'n', h: 'r' };
/** Setup moves still to play, in order. A setup move whose piece is not on its
 *  square (captured, moved by a change of plan) is skipped. A setup move with
 *  `when: 'attacked'` (like Ba4 after ...a6) only counts while its piece is attacked. */
function pending(g, setup, played, color, isAttacked = () => true) {
  const out = [];
  for (const s of setup) {
    if (played.has(s.uci)) continue;
    const from = s.uci.slice(0, 2);
    const p = g.get(from);
    const backRank = color === 'w' ? '1' : '8';
    const want = s.piece || (from[1] === backRank ? ORIGINAL[from[0]] : 'p');
    if (!p || p.color !== color || p.type !== want) continue;
    if (s.when === 'attacked' && !isAttacked(g.fen(), from)) continue;
    if (s.uci === 'e1g1' || s.uci === 'e8g8') {
      const rights = g.fen().split(' ')[2];
      if (!rights.includes(color === 'w' ? 'K' : 'k')) continue;
    }
    out.push(s);
  }
  // an active conditional move (Ba4 after ...a6, Bb3 after ...b5) answers a threat: it comes first
  return [...out.filter(s => s.when), ...out.filter(s => !s.when)];
}

(async () => {
  const e = new Engine(); await e.ready();
  const roots = {};
  for (const id of Object.keys(OPENINGS)) roots[id] = { c: [] };
  const lines = [];
  let errors = 0, warnings = 0;

  async function judge(fen, uci) {
    const before = await e.analyse(fen, DEPTH, 1);
    const g = new Chess(fen); g.move(toMove(uci));
    const after = g.game_over() ? null : await e.analyse(g.fen(), DEPTH, 1);
    const best = clamp(before[0].score);
    const mine = after ? -clamp(after[0].score) : (g.in_checkmate() ? 1000 : 0);
    const bestSan = new Chess(fen).move(toMove(before[0].move)).san;
    const reply = after && after[0].move ? g.move(toMove(after[0].move)) : null;
    return { loss: best - mine, mine, best, bestSan, bestUci: before[0].move, reply };
  }
  const bad = j => j.loss > 150 || (j.loss > 60 && j.mine < -30) || j.mine < -120;
  const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const attacked = (fen, sq) => {
    const parts = fen.split(' '); parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-';
    const h = new Chess(); if (!h.load(parts.join(' '))) return false;
    return h.moves({ verbose: true }).some(m => m.to === sq && m.captured && (VAL[m.captured] > VAL[m.piece] || !new Chess(fen).moves({ verbose: true }).some(x => x.to === sq)));
  };

  // can the opponent recapture on the square after this capture?
  const defendedAfter = (fen, m) => { const g = new Chess(fen); g.move(m); return g.moves({ verbose: true }).some(x => x.to === m.to); };

  /** Pick a change of plan when the setup move fails, and explain it. */
  async function autoChange(fen, todo, def, lastOpp, defJudge) {
    const lines = await e.analyse(fen, DEPTH, 4);
    const best = clamp(lines[0].score);
    const ok = lines.filter(l => best - clamp(l.score) <= 50).map(l => new Chess(fen).move(toMove(l.move)));
    const pick =
      (lastOpp && lastOpp.captured && ok.find(m => m.to === lastOpp.to && m.captured)) ||
      todo.map(t => ok.find(m => uciOf(m) === t.uci)).find(Boolean) ||
      ok.find(m => attacked(fen, m.from)) ||
      ok[0];
    if (uciOf(pick) === def.uci) return null;          // the setup move is fine after all
    const opp = new Chess(fen).turn() === 'w' ? 'Black' : 'White';
    let why;
    if (new Chess(fen).in_check()) {
      why = `you are in check, so ${pick.piece === 'k' ? 'move your king with' : pick.captured ? 'take the checking piece with' : 'block it with'} ${pick.san}.`;
    } else if (lastOpp && lastOpp.captured && pick.to === lastOpp.to && pick.captured) {
      why = `${opp} just took your ${NAME[lastOpp.captured]} on ${pick.to}, so recapture with ${pick.san} first.`;
    } else if (pick.captured && VAL[pick.captured] - (defendedAfter(fen, pick) ? VAL[pick.piece] : 0) >= 2) {
      why = `${opp}'s ${NAME[pick.captured]} on ${pick.to} can be taken: win it with ${pick.san}.`;
    } else if (attacked(fen, pick.from) && !pick.captured) {
      why = `Your ${NAME[pick.piece]} on ${pick.from} is attacked, so move it to ${pick.to}.`;
    } else if (defJudge && defJudge.reply) {
      const r = defJudge.reply;
      let what = r.captured ? `, winning your ${NAME[r.captured]}` : (/#/.test(r.san) ? ', with checkmate' : '');
      if (!what) {
        // what does the reply attack?
        const g2 = new Chess(fen); g2.move(toMove(def.uci)); g2.move(r.san);
        const parts = g2.fen().split(' '); parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-';
        const h = new Chess(); h.load(parts.join(' '));
        const targets = [...new Set(h.moves({ verbose: true }).filter(m => m.captured && m.captured !== 'p' && m.captured !== 'k').map(m => NAME[m.captured]))];
        if (targets.length >= 2) what = `, attacking your ${targets[0]} and ${targets[1]}`;
        else if (targets.length) what = `, attacking your ${targets[0]}`;
        else if (/\+/.test(r.san)) what = ' with check';
      }
      why = what
        ? `${def.san} would let ${opp} play ${r.san}${what}. Play ${pick.san} instead.`
        : `${def.san} is weaker here (Stockfish answers ${r.san} and ${opp} is better). Play ${pick.san} instead.`;
    } else {
      why = `${def.san} isn't possible here, so play ${pick.san} instead.`;
    }
    if (todo.some(t => t.uci === uciOf(pick))) why += ` (${pick.san} is one of your setup moves, played early.)`;
    return { move: pick, why: 'Change of plan: ' + why };
  }

  for (const [opening, family, w, name, src] of LINES) {
    const side = OPENINGS[opening].side;
    const setup = SETUP[opening];
    const id = slug(name);
    const tokens = parse(src);
    const g = new Chess();
    const played = new Set();
    const rejected = new Set();
    let node = roots[opening];
    const moves = [];
    let lastOpp = null;
    const changes = [];
    let guard = 0;
    while (guard++ < 60) {
      if (g.turn() === side) {
        const todo = pending(g, setup, played, side, attacked);
        if (!todo.length || g.history().length >= 22) break;
        const fen = g.fen();
        let next = tokens[0];
        let uci, note, plan = null;
        // a setup move that is no longer possible (e.g. ...Bf5 once ...e6 blocks the
        // bishop) is dropped quietly, unless you are in check
        if (!g.in_check() && !(tokens[0] && tokens[0].type === 'change')) {
          while (todo.length && !new Chess(fen).move(toMove(todo[0].uci))) played.add(todo.shift().uci);
          if (!todo.length) break;     // the rest of the setup is impossible here: the book ends
        }
        let def = todo[0];
        const defLegal = !!def && !!new Chess(fen).move(toMove(def.uci));
        if (next && next.type === 'change') {
          tokens.shift();
          const mv = new Chess(fen).move(next.san);
          if (!mv) { console.error(`ERROR ${name}: change of plan ${next.san} is illegal (${fen})`); errors++; break; }
          uci = uciOf(mv); plan = next.text;
          if (defLegal) {
            const j = await judge(fen, def.uci);
            if (!bad(j) && !next.planned) { console.error(`UNNEEDED ${name}: change to ${mv.san}, but setup move ${def.san} is fine (loss ${j.loss}, eval ${j.mine})`); warnings++; }
          }
          const jc = await judge(fen, uci);
          if (bad(jc)) { console.error(`ERROR ${name}: change of plan ${mv.san} itself loses ${jc.loss} (eval ${jc.mine}); engine prefers ${jc.bestSan}  ${fen}`); errors++; }
          changes.push(mv.san);
        } else {
          let j = defLegal ? await judge(fen, def.uci) : null;
          // a setup move that was already turned down once and is still bad is dropped:
          // one change-of-plan message per stuck setup move is enough
          while (j && bad(j) && rejected.has(def.uci) && todo.length > 1) {
            played.add(todo.shift().uci);
            def = todo[0];
            j = new Chess(fen).move(toMove(def.uci)) ? await judge(fen, def.uci) : null;
          }
          const legalNow = !!new Chess(fen).move(toMove(def.uci));
          if (!legalNow) j = null;
          const ch = (!legalNow || bad(j)) ? await autoChange(fen, todo, def, lastOpp, j) : null;
          if (ch && legalNow) rejected.add(def.uci);
          if (ch) {
            uci = uciOf(ch.move); plan = ch.why;
            changes.push(ch.move.san + '*');
            console.error(`AUTO CHANGE ${name}: ${ch.move.san} instead of ${def.san} -> "${ch.why}"  [${moves.join(' ')}]`);
          } else { uci = def.uci; note = def.why; }
        }
        if (setup.some(s => s.uci === uci)) played.add(uci);
        const mv = g.move(toMove(uci));
        let child = node.c.find(c => c.u === uci);
        if (!child) {
          if (node.c.length) { console.error(`ERROR ${name}: you play ${mv.san} but another line plays ${node.c[0].m} here`); errors++; }
          child = { m: mv.san, u: uci, c: [], l: [] };
          if (plan) child.p = plan; else child.n = note;
          node.c.push(child);
        } else if ((child.p || null) !== (plan || null) && plan) {
          if (child.p && child.p !== plan) { console.error(`ERROR ${name}: different change-of-plan text for ${mv.san}`); errors++; }
          child.p = plan; delete child.n;
        }
        child.l.push(id);
        node = child;
        moves.push(mv.san);
      } else {
        let t = tokens[0];
        let mv;
        if (t && t.type === 'opp') {
          tokens.shift();
          mv = g.move(t.san, { sloppy: true });
          if (!mv) { console.error(`ERROR ${name}: opponent move ${t.san} is illegal after ${moves.join(' ')}`); errors++; break; }
        } else if (t && t.type === 'change') {
          console.error(`ERROR ${name}: change of plan ${t.san} written where the opponent moves (after ${moves.join(' ')})`); errors++; break;
        } else {
          const r = await e.analyse(g.fen(), 12, 1);
          mv = g.move(toMove(r[0].move));
          mv.auto = true;
        }
        const uci = uciOf(mv);
        let child = node.c.find(c => c.u === uci);
        if (!child) { child = { m: mv.san, u: uci, c: [], l: [] }; node.c.push(child); }
        if (tokens[0] && tokens[0].type === 'watch') {
          const wt = tokens.shift().text;
          if (child.x && child.x !== wt) { console.error(`ERROR ${name}: conflicting alert on ${mv.san}`); errors++; }
          child.x = wt;
        }
        child.l.push(id);
        node = child;
        moves.push(mv.auto ? `(${mv.san})` : mv.san);
        lastOpp = mv;
      }
    }
    const left = tokens.filter(t => t.type !== 'watch');
    if (left.length) { console.error(`ERROR ${name}: unused moves after the setup was complete: ${left.map(t => t.san).join(' ')}`); errors++; }
    lines.push({ id, opening, family, w, name, plies: moves.length, changes });
    console.error(`${opening.padEnd(6)} ${name}: ${moves.join(' ')}${changes.length ? '   [changes: ' + changes.join(', ') + ']' : ''}`);
  }
  e.quit();

  console.error(`${errors} errors, ${warnings} warnings`);
  if (errors) process.exit(1);
  const out = { openings: OPENINGS, setup: SETUP, plans: PLANS, tips: TIPS || {}, lines, trees: roots };
  fs.writeFileSync(path.join(__dirname, '../data/simulator.json'), JSON.stringify(out));
  console.error('wrote data/simulator.json');
})();
