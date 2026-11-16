// Renders a stored game review and drives the board for it (jump to a position,
// show the better move, retry a mistake). Used by play.html and history.html.
import { ARROW, MARK, uciToMove } from './board.js';
import { scoreToCp } from './engine.js';
import { KEY_LABELS } from './review.js';
import { el, $$ } from './ui.js';

export const LABEL_CLASS = {
  Brilliant: 'brilliant', Best: 'best', Good: 'good', Inaccuracy: 'inaccuracy',
  Mistake: 'mistake', Blunder: 'blunder', 'Missed Win': 'missed',
};
const SYMBOL = { Brilliant: '!!', Best: '★', Good: '✓', Inaccuracy: '?!', Mistake: '?', Blunder: '??', 'Missed Win': '✗' };
const moveNo = ply => `${Math.floor(ply / 2) + 1}${ply % 2 ? '...' : '.'}`;
const fmt = cp => (Math.abs(cp) >= 1000 ? (cp > 0 ? '+M' : '-M') : (cp > 0 ? '+' : '') + (cp / 100).toFixed(1));

/**
 * @param container element to render into
 * @param record   stored game {moves, userColor, review, ...}
 * @param board    Board instance
 * @param getEngine () => Engine (for Retry)
 */
export function mountReview(container, record, board, getEngine) {
  const rv = record.review;
  const fens = positions(record.moves);
  const user = record.userColor;
  let current = fens.length - 1;
  let retryToken = 0;

  const root = el('div', { class: 'review' });
  container.replaceChildren(root);

  /* ---- summary ---- */
  const PLURAL = { Brilliant: 'Brilliant', Best: 'Best', Good: 'Good', Inaccuracy: 'Inaccuracies', Mistake: 'Mistakes', Blunder: 'Blunders', 'Missed Win': 'Missed Wins' };
  const chips = Object.entries(rv.counts).filter(([, n]) => n).map(([l, n]) =>
    el('span', { class: 'chip ' + LABEL_CLASS[l] }, `${n} ${n > 1 ? PLURAL[l] : l}`));
  root.append(el('div', { class: 'review-summary' },
    el('div', { class: 'acc' }, el('div', { class: 'v' }, rv.accuracy == null ? '–' : rv.accuracy + '%'), el('div', { class: 'l' }, 'accuracy')),
    el('div', { class: 'counts' },
      el('div', { class: 'big' }, `${rv.counts.Blunder} blunder${rv.counts.Blunder === 1 ? '' : 's'} · ${rv.counts.Mistake} mistake${rv.counts.Mistake === 1 ? '' : 's'}`),
      el('div', { class: 'chips' }, ...chips))));
  root.append(el('h3', { style: 'margin-top:14px' }, '3 lessons from this game'),
    el('ol', { class: 'lessons' }, ...rv.lessons.map(t => el('li', {}, t))));
  if (rv.opening) {
    root.append(el('div', { class: 'opening-check ' + (rv.opening.status === 'kept' ? 'ok' : 'warn') },
      el('b', {}, rv.opening.status === 'kept' ? 'Opening check ✓ ' : 'Opening check: '), rv.opening.note));
  }

  /* ---- eval graph ---- */
  const graph = el('div', { class: 'eval-graph', title: 'Tap to jump to a position' });
  root.append(el('h3', { style: 'margin-top:14px' }, 'Evaluation (up = better for you)'), graph);
  drawGraph();

  /* ---- key moments ---- */
  const key = rv.moves.filter(m => m.mine && KEY_LABELS.includes(m.label));
  const keyBox = el('div', { class: 'review-list' });
  root.append(el('h3', { style: 'margin-top:14px' }, key.length ? `Key moments (${key.length})` : 'Key moments'), keyBox);
  if (!key.length) keyBox.append(el('p', { class: 'muted small' }, 'No mistakes, blunders or missed wins. Well played!'));
  for (const m of key) {
    keyBox.append(el('div', { class: 'review-item key-' + LABEL_CLASS[m.label], 'data-ply': m.ply },
      el('div', { class: 'line1' }, el('span', { class: 'chip ' + LABEL_CLASS[m.label] }, m.label), ` ${moveNo(m.ply)} ${m.san}`),
      el('div', { class: 'small' }, m.why || ''),
      m.bestSan ? el('div', { class: 'small muted' }, `Better: ${m.bestSan}. ${m.bestWhy || ''}`) : null,
      el('div', { class: 'btn-row', style: 'margin-top:6px' },
        el('button', { class: 'btn sm', onclick: () => showMistake(m) }, 'Show'),
        el('button', { class: 'btn sm primary', onclick: () => retry(m) }, 'Retry'))));
  }

  /* ---- retry panel ---- */
  const retryBox = el('div', { class: 'retry hidden' });
  root.append(retryBox);

  /* ---- move list ---- */
  const list = el('div', { class: 'moves review-moves' });
  root.append(el('h3', { style: 'margin-top:14px' }, 'All moves'), list);
  rv.moves.forEach((m, i) => {
    if (i % 2 === 0) list.append(el('div', { class: 'num' }, `${i / 2 + 1}.`));
    list.append(el('div', {
      class: 'mv clickable' + (m.mine ? ' lbl-' + LABEL_CLASS[m.label] : ''), 'data-ply': i,
      title: m.mine ? m.label : '', onclick: () => show(i + 1),
    }, m.san, m.mine && m.label !== 'Good' && m.label !== 'Best' ? el('span', { class: 'sym' }, SYMBOL[m.label]) : null));
  });

  function drawGraph() {
    const ns = 'http://www.w3.org/2000/svg';
    const W = 600, H = 120, N = rv.evalSeries.length;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const sign = user === 'w' ? 1 : -1;
    const x = i => (N > 1 ? (i / (N - 1)) * W : 0);
    const y = cp => H / 2 - (Math.max(-600, Math.min(600, sign * cp)) / 600) * (H / 2 - 6);
    const pts = rv.evalSeries.map((cp, i) => `${x(i)},${y(cp)}`);
    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', `M0,${H / 2} L${pts.join(' L')} L${x(N - 1)},${H / 2} Z`);
    area.setAttribute('class', 'g-area');
    const mid = document.createElementNS(ns, 'line');
    Object.entries({ x1: 0, x2: W, y1: H / 2, y2: H / 2, class: 'g-mid' }).forEach(([k, v]) => mid.setAttribute(k, v));
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', pts.join(' '));
    line.setAttribute('class', 'g-line');
    svg.append(area, mid, line);
    for (const m of rv.moves) {
      if (!m.mine || !['Mistake', 'Blunder', 'Missed Win', 'Brilliant'].includes(m.label)) continue;
      const c = document.createElementNS(ns, 'circle');
      Object.entries({ cx: x(m.ply + 1), cy: y(rv.evalSeries[m.ply + 1]), r: 5, class: 'g-dot ' + LABEL_CLASS[m.label] }).forEach(([k, v]) => c.setAttribute(k, v));
      svg.append(c);
    }
    const cursor = document.createElementNS(ns, 'line');
    cursor.setAttribute('class', 'g-cursor');
    svg.append(cursor);
    graph.replaceChildren(svg);
    const pick = (evt) => {
      const r = svg.getBoundingClientRect();
      const px = (evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left;
      show(Math.round(Math.max(0, Math.min(1, px / r.width)) * (N - 1)));
    };
    svg.addEventListener('click', pick);
    graph.moveCursor = (i) => {
      Object.entries({ x1: x(i), x2: x(i), y1: 0, y2: H }).forEach(([k, v]) => cursor.setAttribute(k, v));
    };
  }

  /** Show the position after `n` plies (0 = start). */
  async function show(n, opts = {}) {
    retryToken++;
    retryBox.classList.add('hidden');
    current = Math.max(0, Math.min(fens.length - 1, n));
    const g = new Chess(fens[current]);
    board.disableInput();
    await board.cb.setPosition(g.fen(), true);
    board.clearArrows();
    board.unmark(MARK.last);
    board.unmark(MARK.check);
    const m = current > 0 ? rv.moves[current - 1] : null;
    const hist = verboseMoves(record.moves);
    if (!opts.noMarks && current > 0) {
      const v = hist[current - 1];
      board.mark(MARK.last, v.from); board.mark(MARK.last, v.to);
    }
    graph.moveCursor(current);
    $$('.review-moves .mv', root).forEach(x => x.classList.toggle('cur', +x.dataset.ply === current - 1));
    $$('.review-item', root).forEach(x => x.classList.toggle('active', m && +x.dataset.ply === m.ply && opts.mistake));
    return m;
  }

  /** Position before the mistake, with the played move (red) and the best move (green). */
  async function showMistake(m) {
    await show(m.ply, { noMarks: true, mistake: true });
    const v = verboseMoves(record.moves)[m.ply];
    board.arrow(ARROW.bad, v.from, v.to);
    if (m.best) { const b = uciToMove(m.best); board.arrow(ARROW.good, b.from, b.to); }
    $$('.review-item', root).forEach(x => x.classList.toggle('active', +x.dataset.ply === m.ply));
    board.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** Play the position again and look for a better move. */
  async function retry(m) {
    await show(m.ply, { noMarks: true });
    const t = ++retryToken;
    const game = new Chess(m.fen);
    retryBox.classList.remove('hidden');
    const status = el('div', { class: 'status info' }, el('span', { class: 'dot' }), el('span', {}, `Retry ${moveNo(m.ply)}: you played ${m.san}. Find a better move for ${user === 'w' ? 'White' : 'Black'}.`));
    const answer = el('button', { class: 'btn sm', onclick: () => { const b = uciToMove(m.best); board.clearArrows(); board.arrow(ARROW.good, b.from, b.to); setText(`The best move was ${m.bestSan}. ${m.bestWhy || ''}`, 'info'); } }, 'Show answer');
    const back = el('button', { class: 'btn sm', onclick: () => { retryToken++; retryBox.classList.add('hidden'); board.disableInput(); show(fens.length - 1); } }, 'Back to review');
    retryBox.replaceChildren(el('h3', {}, 'Retry'), status, el('div', { class: 'btn-row', style: 'margin-top:8px' }, answer, back));
    const setText = (text, kind) => { status.className = 'status ' + kind; status.lastChild.textContent = text; };
    retryBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const onTry = async (mv) => {
      if (t !== retryToken) return false;
      setText(`Checking ${mv.san}…`, 'info');
      board.disableInput();
      const res = await getEngine().analyse(game.fen(), { depth: 13, movetime: 2500, skill: 20 });
      if (t !== retryToken) return true;
      const after = game.in_checkmate() ? 1000 : -scoreToCp(res.lines[0] && res.lines[0].score);
      const loss = m.before - after;
      if (loss <= 50 || mv.from + mv.to + (mv.promotion || '') === m.best) {
        setText(`✓ ${mv.san} works (${fmt(after)} instead of ${fmt(m.after)}). Well found!`, 'good');
      } else {
        setText(`${mv.san} is still not best (${fmt(after)}). Try again.`, 'bad');
        setTimeout(() => {
          if (t !== retryToken) return;
          game.undo();
          board.sync(game, true);
          board.enableInput(game, user, onTry);
        }, 900);
      }
      return true;
    };
    board.enableInput(game, user, onTry);
  }

  show(fens.length - 1);
  return { show, showMistake, retry };
}

function positions(sans) {
  const g = new Chess();
  const out = [g.fen()];
  for (const s of sans) { g.move(s); out.push(g.fen()); }
  return out;
}
function verboseMoves(sans) {
  const g = new Chess();
  return sans.map(s => g.move(s));
}
