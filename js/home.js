import * as store from './storage.js';
import { $ } from './ui.js';

const p = store.load('puzzles', store.PUZZLE_DEFAULTS);
const o = store.load('openings', store.OPENING_DEFAULTS);
const b = store.load('bot', store.BOT_DEFAULTS);

$('#meta-puzzles').textContent = p.attempts
  ? `Rating ${Math.round(p.rating)} · streak ${p.streak} · ${Math.round((100 * p.solved) / p.attempts)}% accuracy`
  : 'You start at 800 rating';

const lines = Object.values(o.lines);
$('#meta-openings').textContent = lines.length
  ? `${lines.filter(l => l.perfect).length} lines mastered · ${lines.filter(l => l.studied).length} studied`
  : '12 lines to learn';

const tot = Object.values(b.levels).reduce((a, r) => ({ w: a.w + r.w, l: a.l + r.l, d: a.d + r.d }), { w: 0, l: 0, d: 0 });
$('#meta-play').textContent = tot.w + tot.l + tot.d
  ? `${tot.w} wins · ${tot.l} losses · ${tot.d} draws`
  : 'Levels 1 to 10';

$('#meta-stats').textContent = p.bestStreak ? `Best puzzle streak: ${p.bestStreak}` : 'Track your progress';

const bm = store.load('bestmove', store.BESTMOVE_DEFAULTS);
$('#meta-bestmove').textContent = bm.attempts
  ? `Rating ${Math.round(bm.rating)} · ${bm.attempts} positions`
  : '120 positions · 12 famous games';

const sim = store.load('sim', store.SIM_DEFAULTS);
const simTot = Object.values(sim.openings).reduce((a, o) => ({ m: a.m + o.moves, c: a.c + o.correct }), { m: 0, c: 0 });
$('#meta-sim').textContent = simTot.m
  ? `${Math.round((100 * simTot.c) / simTot.m)}% accuracy · ${Object.keys(sim.lines).length} line${Object.keys(sim.lines).length === 1 ? "" : "s"} seen`
  : '39 lines · London and Caro-Kann';
