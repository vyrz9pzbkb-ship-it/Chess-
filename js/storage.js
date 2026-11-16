// Small localStorage wrapper. Every access is guarded: private browsing or
// blocked storage must never break the app, it just won't remember anything.
const PREFIX = 'chesstrainer.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return structuredClone(fallback);
    return Object.assign(structuredClone(fallback), JSON.parse(raw));
  } catch (e) {
    return structuredClone(fallback);
  }
}

export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

export function clear(key) {
  try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
}

export const PUZZLE_DEFAULTS = {
  rating: 800,          // starting puzzle rating
  attempts: 0,          // rated attempts
  solved: 0,            // rated attempts solved cleanly
  streak: 0,
  bestStreak: 0,
  history: [800],       // rating after each rated attempt
  results: {},          // puzzleId -> {ok: bool, at: timestamp}
  themes: {},           // theme -> {attempts, solved}
};

export const OPENING_DEFAULTS = {
  lines: {},            // "openingId/lineIndex" -> {studied, quizzes, best, perfect}
};

export const BOT_DEFAULTS = {
  levels: {},           // level -> {w, l, d}
  games: [],            // recent games: {level, color, result, moves, at}
};

export const BESTMOVE_DEFAULTS = {
  rating: 1000,         // Find the Best Move rating
  attempts: 0,          // rated positions
  history: [1000],
  grades: {},           // grade -> count (rated attempts)
  results: {},          // positionId -> {grade, at}
  kinds: {},            // check|capture|quiet -> {seen, missed} (both modes)
  guess: {
    moves: 0,           // guesses made
    points: 0,
    maxPoints: 0,
    master: 0,          // guesses that matched the master
    top3: 0,            // guesses in the engine's top 3 (not the master move)
    games: {},          // gameId -> {best, max, plays}
  },
};

export const SIM_DEFAULTS = {
  session: 0,           // increments every time a line starts (spaced-repetition clock)
  level: 800,           // Stockfish strength after the opening
  openings: {},         // openingId -> {moves, correct, lines}
  lines: {},            // lineId -> {attempts, moves, correct, box, due, perfect, last}
  games: {},            // openingId -> {w, l, d} after the opening
};

export const SETTINGS_DEFAULTS = {
  botLevel: 3,
  botColor: 'w',
  puzzleTheme: 'all',
};
