// Stockfish (WASM, single-threaded) in a Web Worker, with a promise-based queue.
const WORKER_URL = new URL('../vendor/stockfish/stockfish.js', import.meta.url);

export class Engine {
  constructor() {
    this.worker = new Worker(WORKER_URL);
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.worker.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      for (const fn of [...this.listeners]) fn(line);
    };
    this.worker.onerror = (e) => { console.error('Stockfish worker error', e); };
    this.ready = this._init();
  }

  send(cmd) { this.worker.postMessage(cmd); }

  _waitFor(pred) {
    return new Promise((resolve) => {
      const fn = (line) => { if (pred(line)) { this.listeners.delete(fn); resolve(line); } };
      this.listeners.add(fn);
    });
  }

  async _init() {
    this.send('uci');
    await this._waitFor(l => l === 'uciok');
    this.send('setoption name Hash value 16');
    await this.isReady();
  }

  async isReady() { this.send('isready'); await this._waitFor(l => l === 'readyok'); }

  /**
   * Analyse a position. Jobs are serialised so callers never interleave.
   * opts: {depth, movetime, multipv, skill}
   * resolves {bestmove, lines:[{move, score:{cp}|{mate}, pv:[], depth}]}
   * Scores are from the side to move's point of view.
   */
  analyse(fen, opts = {}) {
    const job = this.queue.then(() => this._analyse(fen, opts));
    this.queue = job.catch(() => {});
    return job;
  }

  async _analyse(fen, { depth = 12, movetime = 0, multipv = 1, skill = 20 } = {}) {
    await this.ready;
    this.send('setoption name MultiPV value ' + multipv);
    this.send('setoption name Skill Level value ' + skill);
    await this.isReady();
    this.send('position fen ' + fen);
    const lines = [];
    const onInfo = (l) => {
      if (!l.startsWith('info') || l.indexOf(' pv ') < 0) return;
      const m = l.match(/ depth (\d+).*? multipv (\d+) score (cp|mate) (-?\d+).*? pv (.+)$/);
      if (!m) return;
      const pv = m[5].trim().split(/\s+/);
      lines[+m[2] - 1] = { depth: +m[1], score: { [m[3]]: +m[4] }, pv, move: pv[0] };
    };
    this.listeners.add(onInfo);
    let go = 'go depth ' + depth;
    if (movetime) go += ' movetime ' + movetime;
    this.send(go);
    const bm = await this._waitFor(l => l.startsWith('bestmove'));
    this.listeners.delete(onInfo);
    const bestmove = bm.split(/\s+/)[1];
    return { bestmove: bestmove === '(none)' ? null : bestmove, lines: lines.filter(Boolean) };
  }

  stop() { this.send('stop'); }
  newGame() { this.queue = this.queue.then(async () => { this.send('ucinewgame'); await this.isReady(); }); return this.queue; }
}

/** Convert a score to centipawns (mate -> large value), clamped. */
export function scoreToCp(score, clamp = 1000) {
  if (!score) return 0;
  if (score.mate !== undefined) {
    if (score.mate === 0) return -clamp; // side to move is mated
    return score.mate > 0 ? clamp : -clamp;
  }
  return Math.max(-clamp, Math.min(clamp, score.cp));
}

export function formatScore(score, flip = false) {
  if (!score) return '';
  if (score.mate !== undefined) {
    const m = flip ? -score.mate : score.mate;
    return (m > 0 ? '+M' : '-M') + Math.abs(m);
  }
  const cp = (flip ? -score.cp : score.cp) / 100;
  return (cp > 0 ? '+' : '') + cp.toFixed(1);
}
