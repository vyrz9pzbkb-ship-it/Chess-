import { Board } from './board.js';
import { Engine } from './engine.js';
import { loadBook } from './book.js';
import { reviewGame } from './review.js';
import { mountReview } from './review-ui.js';
import * as store from './storage.js';
import { $, $$, el } from './ui.js';

const board = new Board($('#board'));
let engine = null;
const getEngine = () => (engine ||= new Engine());
let data = store.load('games', store.GAMES_DEFAULTS);
let selected = null;
let reviewToken = 0;

const RES = { w: 'Win', l: 'Loss', d: 'Draw' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dateStr = t => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function save() {
  try { localStorage.setItem('chesstrainer.games', JSON.stringify(data)); } catch (e) { /* storage full */ }
}

function renderList() {
  const games = [...data.games].reverse();
  const reviewed = games.filter(g => g.review && g.review.accuracy != null);
  const avg = reviewed.length ? Math.round(reviewed.reduce((s, g) => s + g.review.accuracy, 0) / reviewed.length) : null;
  $('#hist-summary').textContent = games.length
    ? `${games.length} game${games.length > 1 ? 's' : ''} saved${avg != null ? ` · average accuracy ${avg}%` : ''}.`
    : 'No games yet. Play the bot and every finished game is saved here with its review.';
  $('#game-list').replaceChildren(...games.map(g => el('button', {
    class: 'game-row', 'aria-pressed': String(selected && selected.id === g.id), onclick: () => open(g.id),
  },
  el('span', { class: 'res ' + g.result }, g.result === 'w' ? 'W' : g.result === 'l' ? 'L' : '½'),
  el('span', {},
    el('div', {}, `${g.userColor === 'w' ? 'White' : 'Black'} vs bot ${g.elo} · ${RES[g.result]} by ${g.reason}`),
    el('div', { class: 'meta' }, `${dateStr(g.at)} · ${plural(Math.ceil(g.moves.length / 2), 'move')}${g.tc ? ' · ' + g.tc : ''}${g.review ? ` · ${plural(g.review.counts.Blunder, 'blunder')}, ${plural(g.review.counts.Mistake, 'mistake')}` : ' · not reviewed'}`)),
  el('span', { class: 'acc' }, g.review && g.review.accuracy != null ? g.review.accuracy + '%' : '–'))));
}

async function open(id) {
  const t = ++reviewToken;
  selected = data.games.find(g => g.id === id);
  if (!selected) return;
  renderList();
  $('#review').classList.remove('hidden');
  $('#review-title').textContent = `${selected.userColor === 'w' ? 'White' : 'Black'} vs bot ${selected.elo}: ${RES[selected.result]} by ${selected.reason}`;
  await board.setOrientation(selected.userColor);
  if (!selected.review) {
    $('#review-body').replaceChildren(el('p', { class: 'muted' }, 'This game has no review yet (the page was closed before it finished).'),
      el('button', { class: 'btn primary', onclick: () => analyse(selected) }, 'Review it now'));
    const g = new Chess(); selected.moves.forEach(s => g.move(s));
    board.sync(g, false);
  } else {
    $('#review-progress').textContent = '';
    if (t === reviewToken) mountReview($('#review-body'), selected, board, getEngine);
  }
  try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ }
  if (window.matchMedia('(max-width: 900px)').matches) $('.board-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function analyse(record) {
  const t = ++reviewToken;
  const bar = $('#review-bar');
  bar.classList.remove('hidden');
  $('#review-body').replaceChildren();
  const review = await reviewGame(getEngine(), Chess, record, await loadBook(), (i, n) => {
    if (t !== reviewToken) return;
    $('#review-progress').replaceChildren(el('span', { class: 'loader' }), ` Reviewing (depth 15): position ${Math.min(i + 1, n)} of ${n}…`);
    bar.firstElementChild.style.width = (100 * i / n) + '%';
  }, () => t !== reviewToken);
  if (!review || t !== reviewToken) return;
  bar.classList.add('hidden');
  $('#review-progress').textContent = '';
  record.review = review;
  save();
  renderList();
  mountReview($('#review-body'), record, board, getEngine);
}

$('#btn-delete').addEventListener('click', () => {
  if (!selected || !confirm('Delete this game and its review?')) return;
  data.games = data.games.filter(g => g.id !== selected.id);
  save();
  selected = null;
  $('#review').classList.add('hidden');
  board.sync(new Chess(), false);
  renderList();
});

renderList();
const fromHash = data.games.find(g => '#' + g.id === location.hash);
if (fromHash) open(fromHash.id);
else if (data.games.length) open(data.games[data.games.length - 1].id);
