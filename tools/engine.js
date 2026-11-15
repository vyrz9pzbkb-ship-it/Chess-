// Minimal UCI wrapper around the vendored Stockfish build, for Node.js tooling.
const { spawn } = require('child_process');
const path = require('path');
const SF = path.join(__dirname, '../vendor/stockfish/stockfish.js');
class Engine {
  constructor() {
    this.p = spawn(process.execPath, [SF], { stdio: 'pipe' });
    this.buf = ''; this.listeners = [];
    this.p.stdout.on('data', d => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        this.listeners.slice().forEach(f => f(line));
      }
    });
    this.send('uci'); this.send('setoption name Hash value 64');
  }
  send(s) { this.p.stdin.write(s + '\n'); }
  waitFor(pred) { return new Promise(res => { const f = l => { if (pred(l)) { this.listeners.splice(this.listeners.indexOf(f), 1); res(l); } }; this.listeners.push(f); }); }
  async ready() { this.send('isready'); await this.waitFor(l => l === 'readyok'); }
  // returns [{move, score:{cp|mate}, pv}] sorted by multipv
  async analyse(fen, depth = 18, multipv = 1) {
    await this.ready();
    this.send('setoption name MultiPV value ' + multipv);
    this.send('ucinewgame'); await this.ready();
    this.send('position fen ' + fen);
    const lines = {};
    const f = l => {
      const m = l.match(/^info .*?depth (\d+) .*?multipv (\d+) score (cp|mate) (-?\d+).*? pv (.*)$/);
      if (m && +m[1] >= 1) lines[m[2]] = { depth: +m[1], score: { [m[3]]: +m[4] }, pv: m[5].split(' '), move: m[5].split(' ')[0] };
    };
    this.listeners.push(f);
    this.send('go depth ' + depth);
    const bm = await this.waitFor(l => l.startsWith('bestmove'));
    this.listeners.splice(this.listeners.indexOf(f), 1);
    const arr = Object.keys(lines).sort((a, b) => a - b).map(k => lines[k]);
    if (!arr.length) return [{ move: null, score: {}, pv: [] }];
    return arr;
  }
  quit() { this.send('quit'); setTimeout(() => this.p.kill(), 200); }
}
const val = s => s.mate !== undefined ? (s.mate > 0 ? 100000 - s.mate : -100000 - s.mate) : s.cp;
module.exports = { Engine, val };
