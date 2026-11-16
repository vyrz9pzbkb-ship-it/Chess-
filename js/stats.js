import * as store from './storage.js';
import { $, $$, el, sparkline, fetchJSON } from './ui.js';
import { LEVELS } from './levels.js';

const THEME_LABEL = {
  mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', fork: 'Fork', pin: 'Pin',
  skewer: 'Skewer', hanging: 'Hanging piece', discovered: 'Discovered attack',
};

const stat = (v, l) => el('div', { class: 'stat' }, el('div', { class: 'v' }, String(v)), el('div', { class: 'l' }, l));
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '–');
const bar = (a, b) => el('div', { class: 'bar' }, el('span', { style: `width:${b ? (100 * a) / b : 0}%` }));
const row = (cells, head = false) => el('tr', {}, ...cells.map(c => el(head ? 'th' : 'td', {}, c)));

function render() {
  const p = store.load('puzzles', store.PUZZLE_DEFAULTS);
  const o = store.load('openings', store.OPENING_DEFAULTS);
  const b = store.load('bot', store.BOT_DEFAULTS);

  /* puzzles */
  $('#puzzle-stats').replaceChildren(
    stat(Math.round(p.rating), 'Puzzle rating'),
    stat(Math.max(...p.history), 'Peak rating'),
    stat(p.streak, 'Current streak'),
    stat(p.bestStreak, 'Best streak'),
    stat(pct(p.solved, p.attempts), 'Accuracy'),
    stat(`${p.solved}/${p.attempts}`, 'Solved / attempted'),
  );
  $('#rating-chart').replaceChildren(p.history.length > 1
    ? sparkline(p.history)
    : el('p', { class: 'muted small' }, 'Solve a few puzzles to see your rating graph.'));
  $('#theme-table').replaceChildren(
    row(['Theme', 'Solved', 'Accuracy', ''], true),
    ...Object.keys(THEME_LABEL).map((t) => {
      const r = p.themes[t] || { attempts: 0, solved: 0 };
      return row([THEME_LABEL[t], `${r.solved}/${r.attempts}`, pct(r.solved, r.attempts), bar(r.solved, r.attempts)]);
    }),
  );

  /* best move */
  const bm = store.load('bestmove', store.BESTMOVE_DEFAULTS);
  const gq = Object.assign({}, store.BESTMOVE_DEFAULTS.guess, bm.guess);
  const good = (bm.grades.Best || 0) + (bm.grades.Good || 0);
  $('#bm-stats').replaceChildren(
    stat(Math.round(bm.rating), 'Best Move rating'),
    stat(Math.max(...bm.history), 'Peak rating'),
    stat(pct(good, bm.attempts), 'Accuracy (Best or Good)'),
    stat(bm.attempts, 'Positions rated'),
    stat(pct(gq.points, gq.maxPoints), 'Guess the Move score'),
    stat(`${gq.master}/${gq.moves}`, 'Master moves guessed'),
  );
  $('#bm-chart').replaceChildren(bm.history.length > 1
    ? sparkline(bm.history)
    : el('p', { class: 'muted small' }, 'Rate a few positions to see your graph.'));
  const KINDS = { check: 'Checks', capture: 'Captures', quiet: 'Quiet moves' };
  let worst = null;
  $('#bm-kind-table').replaceChildren(
    row(['Kind of best move', 'Seen', 'Missed', 'Miss rate', ''], true),
    ...Object.keys(KINDS).map((k) => {
      const r = bm.kinds[k] || { seen: 0, missed: 0 };
      if (r.seen >= 3 && (!worst || r.missed / r.seen > worst.rate)) worst = { k, rate: r.missed / r.seen };
      const b = el('div', { class: 'bar' }, el('span', { style: `width:${r.seen ? (100 * r.missed) / r.seen : 0}%;background:var(--danger)` }));
      return row([KINDS[k], String(r.seen), String(r.missed), pct(r.missed, r.seen), b]);
    }),
  );
  $('#bm-miss-note').textContent = worst
    ? `You miss ${KINDS[worst.k].toLowerCase()} most often (${Math.round(worst.rate * 100)}%). Counts both modes: a miss is anything worse than Good, or a guess that wasn't the master's or engine's top move.`
    : 'Play a few positions or guesses to see which kinds of moves you overlook.';
  const GR = ['Best', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'];
  $('#bm-grade-table').replaceChildren(
    row(['Grade', 'Count', 'Share', ''], true),
    ...GR.map(g => row([g, String(bm.grades[g] || 0), pct(bm.grades[g] || 0, bm.attempts), bar(bm.grades[g] || 0, bm.attempts)])),
  );

  /* bot */
  const tot = { w: 0, l: 0, d: 0 };
  for (const r of Object.values(b.levels)) { tot.w += r.w; tot.l += r.l; tot.d += r.d; }
  const games = tot.w + tot.l + tot.d;
  const beaten = Object.entries(b.levels).filter(([, r]) => r.w > 0).map(([k]) => +k);
  $('#bot-stats').replaceChildren(
    stat(games, 'Games played'),
    stat(tot.w, 'Wins'),
    stat(tot.l, 'Losses'),
    stat(tot.d, 'Draws'),
    stat(pct(tot.w, games), 'Win rate'),
    stat(beaten.length ? Math.max(...beaten) : '–', 'Highest level beaten'),
  );
  $('#bot-table').replaceChildren(
    row(['Level', '≈ Rating', 'W', 'L', 'D', 'Win %', ''], true),
    ...Object.keys(LEVELS).map((n) => {
      const r = b.levels[n] || { w: 0, l: 0, d: 0 };
      const g = r.w + r.l + r.d;
      return row([`Level ${n}`, String(LEVELS[n].elo), String(r.w), String(r.l), String(r.d), pct(r.w, g), bar(r.w, g)]);
    }),
  );

  /* openings */
  fetchJSON('data/openings.json').then((ops) => {
    const rows = [row(['Line', 'Studied', 'Quizzes', 'Best', 'Mastered'], true)];
    for (const op of ops) {
      rows.push(el('tr', {}, el('td', { colspan: 5, style: 'color:var(--muted);font-weight:700;padding-top:14px' },
        `${op.name} (${op.side === 'w' ? 'White' : 'Black'})`)));
      op.lines.forEach((l, i) => {
        const r = o.lines[`${op.id}/${i}`] || {};
        rows.push(row([
          el('a', { href: `openings.html#${op.id}/${i}` }, l.name),
          r.studied ? '✓' : '–',
          String(r.quizzes || 0),
          r.quizzes ? r.best + '%' : '–',
          r.perfect ? '✓' : '–',
        ]));
      });
    }
    $('#opening-table').replaceChildren(...rows);
  }).catch(() => $('#opening-table').replaceChildren(row(['Could not load openings.'])));
}

$$('[data-reset]').forEach(btn => btn.addEventListener('click', () => {
  const what = btn.dataset.reset;
  const label = { bot: 'bot game', puzzles: 'puzzle', openings: 'opening', bestmove: 'Best Move' }[what];
  if (!confirm(`Reset all ${label} statistics? This cannot be undone.`)) return;
  store.clear(what);
  render();
}));

render();
