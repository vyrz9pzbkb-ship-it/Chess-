// Wrapper around cm-chessboard + chess.js: legal-move input (drag or tap),
// promotion dialog, last-move / check highlights and arrows.
import { Chessboard, COLOR, INPUT_EVENT_TYPE, BORDER_TYPE, FEN } from '../vendor/cm-chessboard/src/Chessboard.js';
import { Markers, MARKER_TYPE } from '../vendor/cm-chessboard/src/extensions/markers/Markers.js';
import { Arrows } from '../vendor/cm-chessboard/src/extensions/arrows/Arrows.js';
import { PromotionDialog, PROMOTION_DIALOG_RESULT_TYPE } from '../vendor/cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js';

export { COLOR };

export const MARK = {
  last: { class: 'marker-last', slice: 'markerSquare' },
  check: { class: 'marker-check', slice: 'markerSquare' },
  hint: { class: 'marker-hint', slice: 'markerFrame' },
  good: { class: 'marker-good', slice: 'markerSquare' },
  bad: { class: 'marker-bad', slice: 'markerSquare' },
};
export const ARROW = {
  hint: { class: 'arrow-hint', slice: 'arrowDefault', headSize: 7 },
  good: { class: 'arrow-good', slice: 'arrowDefault', headSize: 7 },
  bad: { class: 'arrow-bad', slice: 'arrowDefault', headSize: 7 },
};

export class Board {
  /**
   * @param {HTMLElement} el container
   * @param {object} opts {orientation:'w'|'b', fen}
   */
  constructor(el, opts = {}) {
    this.el = el;
    this.cb = new Chessboard(el, {
      position: opts.fen || FEN.start,
      orientation: opts.orientation === 'b' ? COLOR.black : COLOR.white,
      assetsUrl: new URL('../vendor/cm-chessboard/assets/', import.meta.url).href,
      style: { cssClass: 'trainer', borderType: BORDER_TYPE.none, showCoordinates: true, animationDuration: 220 },
      extensions: [{ class: Markers }, { class: Arrows }, { class: PromotionDialog }],
    });
    this.game = null;
    this.onMove = null;
  }

  setOrientation(color) {
    const c = color === 'b' ? COLOR.black : COLOR.white;
    if (this.cb.getOrientation() !== c) return this.cb.setOrientation(c);
  }

  /** Redraw from a chess.js game, highlighting the last move and any check. */
  async sync(game, animated = true) {
    this.clearArrows();
    this.cb.removeMarkers(MARK.last);
    this.cb.removeMarkers(MARK.check);
    this.cb.removeMarkers(MARK.hint);
    const hist = game.history({ verbose: true });
    const last = hist[hist.length - 1];
    if (last) { this.cb.addMarker(MARK.last, last.from); this.cb.addMarker(MARK.last, last.to); }
    if (game.in_check()) {
      const k = findKing(game, game.turn());
      if (k) this.cb.addMarker(MARK.check, k);
    }
    await this.cb.setPosition(game.fen(), animated);
  }

  /**
   * Let the user move pieces of `color` in `game`. `onMove(move)` receives the
   * chess.js move object after it has been played on `game`; return false to
   * reject (the move is undone and the board reset).
   */
  enableInput(game, color, onMove) {
    this.game = game;
    this.onMove = onMove;
    const handler = (event) => {
      if (event.type === INPUT_EVENT_TYPE.movingOverSquare) return;
      if (event.type !== INPUT_EVENT_TYPE.moveInputFinished) this.cb.removeLegalMovesMarkers();
      if (event.type === INPUT_EVENT_TYPE.moveInputStarted) {
        const moves = this.game.moves({ square: event.squareFrom, verbose: true });
        this.cb.addLegalMovesMarkers(moves);
        return moves.length > 0;
      }
      if (event.type === INPUT_EVENT_TYPE.validateMoveInput) {
        const legal = this.game.moves({ square: event.squareFrom, verbose: true }).filter(m => m.to === event.squareTo);
        if (!legal.length) return false;
        if (legal[0].promotion) {
          const pcolor = this.game.turn() === 'w' ? COLOR.white : COLOR.black;
          this.cb.showPromotionDialog(event.squareTo, pcolor, (res) => {
            if (res.type === PROMOTION_DIALOG_RESULT_TYPE.pieceSelected) {
              this._play({ from: event.squareFrom, to: event.squareTo, promotion: res.piece.charAt(1) });
            } else {
              this.sync(this.game, false);
            }
          });
          return true;
        }
        event.chessboard.state.moveInputProcess.then(() =>
          this._play({ from: event.squareFrom, to: event.squareTo }));
        return true;
      }
    };
    this.cb.enableMoveInput(handler, color === 'b' ? COLOR.black : COLOR.white);
  }

  async _play(mv) {
    const move = this.game.move(mv);
    if (!move) { this.sync(this.game, false); return; }
    await this.sync(this.game, false);
    const r = this.onMove ? await this.onMove(move) : true;
    if (r === false) {
      this.game.undo();
      await this.sync(this.game, true);
    }
  }

  disableInput() { this.cb.disableMoveInput(); }

  arrow(type, from, to) { this.cb.addArrow(type, from, to); }
  clearArrows() { this.cb.removeArrows(); }
  mark(type, sq) { this.cb.addMarker(type, sq); }
  unmark(type) { this.cb.removeMarkers(type); }
}

export function findKing(game, color) {
  const b = game.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = b[r][f];
    if (p && p.type === 'k' && p.color === color) return 'abcdefgh'[f] + (8 - r);
  }
  return null;
}

/** Parse a UCI move string into a chess.js move object. */
export function uciToMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}
export const moveToUci = m => m.from + m.to + (m.promotion || '');

/** SAN of a UCI move in a given position (without changing it). */
export function uciToSan(fen, uci) {
  const g = new Chess(fen);
  const m = g.move(uciToMove(uci));
  return m ? m.san : uci;
}
