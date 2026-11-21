// Source for data/simulator.json (Opening Simulator). Build: node tools/build-simulator.js
//
// YOUR moves are not written here: they always follow the fixed SETUP order below.
// A line lists only the OPPONENT's moves, plus the rare "change of plan" moves:
//   Nf6            an opponent move
//   {! text}       "Watch out!" alert for the opponent move just before it
//   >Bg3{text}     a change of plan: you play Bg3 instead of your next setup move,
//                  because of a real threat (text explains why)
// If a line runs out of opponent moves before your setup is complete, the build
// lets Stockfish choose the opponent's remaining moves.

exports.OPENINGS = {
  london: {
    name: 'London System', side: 'w',
    blurb: 'You play White and always build the same setup: d4, Bf4, e3, Nf3, c3, Nbd2, Bd3, O-O.',
  },
  caro: {
    name: 'Caro-Kann', side: 'b',
    blurb: 'You play Black and always build the same setup: ...c6, ...d5, ...Bf5, ...e6, ...Nf6, ...Nbd7, ...Bd6, ...O-O, against 1.e4 and everything else.',
  },
  ruy: {
    name: 'Ruy Lopez', side: 'w',
    blurb: 'You play White and always build the same setup: e4, Nf3, Bb5, (Ba4 if ...a6), O-O, Re1, (Bb3 if ...b5), c3, h3, d4.',
  },
};

// The fixed move order. `uci` identifies the move; `why` is shown in Learn mode
// and when you play something else.
exports.SETUP = {
  london: [
    { uci: 'd2d4', san: 'd4', why: 'Start with 1.d4: the whole London is built around this pawn.' },
    { uci: 'c1f4', san: 'Bf4', why: 'Develop the dark-squared bishop to f4 BEFORE playing e3, so it isn\'t shut in.' },
    { uci: 'e2e3', san: 'e3', why: 'e3 supports d4 and opens the way for your other bishop.' },
    { uci: 'g1f3', san: 'Nf3', why: 'The knight guards d4 and controls e5.' },
    { uci: 'c2c3', san: 'c3', why: 'c3 completes the pawn triangle c3-d4-e3: d4 is now rock-solid.' },
    { uci: 'b1d2', san: 'Nbd2', why: 'The b1 knight goes to d2, so the c-pawn can stay on c3; it supports e4 later.' },
    { uci: 'f1d3', san: 'Bd3', why: 'The bishop on d3 aims at h7, Black\'s weak spot after castling.' },
    { uci: 'e1g1', san: 'O-O', why: 'Castle: your king is safe and your rook comes into play.' },
  ],
  caro: [
    { uci: 'c7c6', san: 'c6', why: '...c6 prepares ...d5, with the c-pawn ready to recapture on d5.' },
    { uci: 'd7d5', san: 'd5', why: '...d5 claims the centre.' },
    { uci: 'c8f5', san: 'Bf5', why: 'Develop the light-squared bishop to f5 BEFORE ...e6, so it isn\'t shut in.' },
    { uci: 'e7e6', san: 'e6', why: 'Now ...e6 is safe: the bishop is already outside the pawn chain.' },
    { uci: 'g8f6', san: 'Nf6', why: 'The knight develops and fights for e4.' },
    { uci: 'b8d7', san: 'Nbd7', why: 'The b8 knight goes to d7, keeping c6 for the pawn and supporting ...e5 or ...c5.' },
    { uci: 'f8d6', san: 'Bd6', why: 'The bishop on d6 challenges White\'s dark squares and prepares castling.' },
    { uci: 'e8g8', san: 'O-O', why: 'Castle: your king is safe.' },
  ],
};

exports.SETUP.ruy = [
  { uci: 'e2e4', san: 'e4', why: 'Take the centre and open lines for your queen and bishop.' },
  { uci: 'g1f3', san: 'Nf3', why: 'Develop the knight and attack Black\'s e5 pawn.' },
  { uci: 'f1b5', san: 'Bb5', why: 'The Spanish bishop puts pressure on the knight that defends e5.' },
  { uci: 'b5a4', san: 'Ba4', piece: 'b', when: 'attacked', why: 'Only if Black plays ...a6: keep the bishop and the pressure by stepping back to a4.' },
  { uci: 'e1g1', san: 'O-O', why: 'Castle early: your king is safe and the rook joins the game.' },
  { uci: 'f1e1', san: 'Re1', piece: 'r', why: 'The rook defends e4 and supports the d4 push later.' },
  { uci: 'a4b3', san: 'Bb3', piece: 'b', when: 'attacked', why: 'Only if Black plays ...b5: drop the bishop to b3, where it aims at f7.' },
  { uci: 'c2c3', san: 'c3', why: 'c3 prepares d4 and gives your bishop a retreat square on c2.' },
  { uci: 'h2h3', san: 'h3', why: 'h3 stops ...Bg4 pinning your knight, so d4 can come safely.' },
  { uci: 'd2d4', san: 'd4', why: 'Now push d4: your centre is built and the setup is complete.' },
];

// Short warnings shown in Learn mode.
exports.TIPS = {
  ruy: [
    'Pawn grab: after 3...a6, Bxc6 dxc6 Nxe5? does NOT win a pawn, because ...Qd4 hits the knight and e4 and Black takes the pawn back.',
    'Noah\'s Ark trap: after ...b5, Black can play ...c5 and ...c4 to trap a bishop on b3. Play c3 in time so it can drop back to c2.',
    'Berlin: if Black takes on e4 with ...Nxe4, Re1 attacks the knight and you win the pawn back.',
  ],
};

exports.PLANS = {
  london: [
    { title: 'Knight to e5, then attack', text: 'Put a knight on e5 (supported by d4 and often f4), then bring the queen to f3 or h5 and push g4-g5 against the black king.' },
    { title: 'Bd3 and Qe2/Qc2 aiming at h7', text: 'Your bishop on d3 and a queen on c2 or e2 make a battery on h7. If Black castles kingside, look for Bxh7+ or Ne5 with Qh5.' },
    { title: 'e3-e4 central break', text: 'With Qe2, Rfe1 and Rad1, push e4 to open the centre when your pieces are ready. Trade on d5 or c5 first if it helps.' },
  ],
  caro: [
    { title: 'Break with ...c5', text: 'Your pawn chain points to the queenside. Hit White\'s centre with ...c5 (supported by ...Nc6 and ...Qb6) to attack d4.' },
    { title: 'Minority attack or ...b5-b4', text: 'If White castles queenside or plays c3, roll your b-pawn forward to open lines on the queenside.' },
    { title: 'Good bishop, safe king', text: 'Your light-squared bishop is outside the pawn chain. Keep the position closed, castle short, and trade into an endgame where your structure is better.' },
  ],
  ruy: [
    { title: 'Hold the centre with d4', text: 'With c3 and d4 you get two pawns in the middle. Keep them there: if Black hits e4 or d4, defend rather than trade.' },
    { title: 'Knight tour Nbd2-f1-g3', text: 'Your b1 knight goes d2, f1 and g3 (or e3), then to f5 or h5 to attack the black king. Your bishop on b3 or c2 helps.' },
    { title: 'Queenside play with a4', text: 'If Black has played ...b5, a4 attacks that pawn and opens the a-file for your rook.' },
  ],
  blacklondon: [
    { title: 'Knight to e4', text: 'Your setup mirrors the London. Put a knight on e4 (backed by ...f5 if needed), then ...Qf6 or ...Qh4 and ...g5 against a kingside-castled king.' },
    { title: 'Central break ...e5 or ...c5', text: 'Once you have castled and connected rooks, break with ...c5 or prepare ...e5 to free your position.' },
    { title: 'Queenside space', text: 'Against c4 setups, keep d5 solid with ...c6 and ...e6, then expand with ...b5 or trade on c4 at the right moment.' },
  ],
};

// [opening, family, weight, name, opponent moves + changes of plan]
exports.LINES = [
  /* ======================= London System (you are White) ======================= */
  ['london', 'london', 4, 'Main line: ...d5, ...e6, ...c5', `d5 Nf6 e6 c5 Nc6 Bd6 {! Black offers a trade of dark-squared bishops.} O-O b6`],
  ['london', 'london', 3, '...c5 and ...Qb6 attacking b2',
    `d5 Nf6 c5 Qb6 {! ...Qb6 attacks your b2 pawn, which nothing defends since your bishop left c1.}
     >Qc1{Change of plan: b2 is attacked, so defend it with Qc1 before carrying on with c3.}
     Nc6 Bg4 e6 Be7 O-O`],
  ['london', 'london', 3, '...Bf5 mirror',
    `d5 Bf5 e6 Nf6 Bd6 O-O
     >Be2{Change of plan: Bd3 would let Black play ...Bxd3, and your knight on d2 blocks Qxd3. Develop the bishop to e2 instead.}
     Nbd7`],
  ['london', 'london', 3, 'King\'s Indian setup (...g6)',
    `Nf6 g6 Bg7 O-O d6 Nbd7 e5 {! ...e5 attacks your bishop on f4.}
     >Bg3{Change of plan: your bishop is attacked, so move it to g3 before castling.}
     Re8`],
  ['london', 'london', 2, '...Nh5 hunting the bishop',
    `d5 Nf6 e6 Nh5 {! ...Nh5 attacks your bishop on f4.}
     >Bg5{Change of plan: your bishop is attacked. Move it to g5, where it attacks Black's queen and gains time.}
     Be7 Qxe7 Nf6 Nbd7 c5 b6`],
  ['london', 'london', 2, 'Early ...h6 and ...g5',
    `d5 Nf6 e6 h6 g5 {! ...g5 attacks your bishop on f4.}
     >Bg3{Change of plan: your bishop is attacked, move it to g3. Black's ...g5 has weakened his own king.}
     Ne4 {! The knight wants to take your bishop.} Nxg3 Bg7 Nd7`],
  ['london', 'london', 2, 'Early ...e5 break',
    `d5 Nc6 e5 {! ...e5 attacks your bishop and opens the centre.}
     >dxe5{Change of plan: Black's ...e5 attacks your bishop, so take the pawn. Your bishop on f4 then defends e5.}
     Bf5 Nge7 Ng6 {! ...Ng6 attacks your bishop and the e5 pawn.} Be7 O-O`],
  ['london', 'london', 2, '...Bb4+ check',
    `Nf6 e6 Bb4+ {! Check from the bishop on b4.}
     >c3{Change of plan: you are in check, so block with c3 now (a setup move played one move early).}
     Be7 O-O d5 c5 Nc6`],
  ['london', 'london', 2, 'Queen\'s Indian (...b6, ...Bb7)', `Nf6 e6 b6 Bb7 Be7 c5 O-O Nh5`],
  ['london', 'london', 2, 'Englund Gambit (1...e5?!)',
    `e5 {! Black offers a pawn: ...e5 attacks your d4 pawn.}
     >dxe5{Change of plan: take the free pawn. Your bishop will come to f4 next to defend it.}
     Nc6 Qe7 Qb4+ {! Check! The queen also eyes your b2 pawn.} d6 dxe5 Nf6 Bd6`],
  ['london', 'london', 2, '...c5 on move 1',
    `c5 {! ...c5 attacks your d4 pawn straight away.}
     >c3{Change of plan: support d4 with c3 now (a setup move played early), so ...cxd4 is met by cxd4.}
     e6 Nf6 d5 Nc6 Be7 O-O b6`],
  ['london', 'london', 2, '...Nc6 and ...Nb4 jump',
    `d5 Nc6 Nb4 {! ...Nb4 eyes c2.} Bf5 {! Now c2 is attacked twice (knight and bishop): ...Nxc2+ would fork your king and rook.}
     >Na3{Change of plan: c2 is attacked twice, so defend it again with Na3.}
     e6 Nc6 Bxd3`],
  ['london', 'london', 2, 'Slav setup with early ...Qb6',
    `d5 c6 Qb6 {! ...Qb6 attacks b2.} Bf5
     >Qc1{Change of plan: b2 is attacked, and c3 would let ...Qxb2 win a pawn. Defend it with Qc1.}
     e6 Nd7 Ngf6
     >Be2{Change of plan: Bd3 would let Black play ...Bxd3, and your knight on d2 stops you recapturing with the queen. Develop the bishop to e2.}
     Be7 O-O`],
  ['london', 'london', 1, 'Dutch Defence (1...f5)', `f5 Nf6 e6 Be7 O-O d6 Qe8`],

  /* ======================= Caro-Kann (you are Black) ======================= */
  ['caro', 'caro', 4, 'Advance Variation (3.e5)',
    `e4 d4 e5 {! e5 gains space: the bishop can now come to f5 safely, but f6 is taken away from your knight.}
     Nf3 Be2
     >Ne7{Change of plan: White's e5 pawn would take a knight on f6, so the knight goes to e7 instead.}
     O-O c3
     >Ng6{Change of plan: with your knight on e7 the bishop can't reach d6. Move the knight on to g6, where it hits e5 and frees your bishop.}
     Nbd2`],
  ['caro', 'caro', 4, 'Classical (3.Nc3)',
    `e4 d4 Nc3 {! White defends e4. A bishop on f5 would now just be taken by the e4 pawn.}
     >dxe4{Change of plan: White's e4 pawn would capture a bishop on f5, so first trade it off with ...dxe4.}
     Nxe4 Ng3 {! The knight attacks your bishop on f5.} Nf3 Bd3 Bxg6 O-O c4 Re1`],
  ['caro', 'caro', 3, 'Exchange Variation (3.exd5)',
    `e4 d4 exd5 {! White takes on d5.}
     >cxd5{Change of plan: recapture on d5 with the c-pawn first; your bishop can come out next move.}
     Nf3 Bd3 {! White offers to trade your good bishop.} Qxd3 O-O c3 Re1 Nbd2`],
  ['caro', 'caro', 2, 'Panov Attack (4.c4)',
    `e4 d4 exd5 {! White takes on d5.}
     >cxd5{Change of plan: recapture on d5 with the c-pawn first; your bishop can come out next move.}
     c4 {! c4 attacks your d5 pawn a second time.} Nc3 Nf3 Bd3 Qxd3 Qxc4 O-O Bg5`],
  ['caro', 'caro', 2, 'Two Knights (2.Nc3, 3.Nf3)',
    `e4 Nc3 Nf3 {! White's e4 pawn still controls f5.}
     >dxe4{Change of plan: a bishop on f5 would be taken by the e4 pawn, so trade it off with ...dxe4 first.}
     Nxe4 Ng3 {! The knight attacks your bishop on f5.} d4 Bd3 Bxg6 O-O c4 Re1`],
  ['caro', 'caro', 2, '2.Bc4 aiming at f7',
    `e4 Bc4 {! The bishop aims at f7.} exd5 {! White takes on d5.}
     >cxd5{Change of plan: recapture on d5, which also attacks the bishop on c4.}
     Bb5+ {! Check!} d4 Nf3 O-O c4 Nc3 Bg5`],
  ['caro', 'caro', 2, '2.Qh5?! early queen',
    `e4 Qh5 {! The queen eyes f7, f5 and your d5 square.} exd5 {! White takes on d5.}
     >cxd5{Change of plan: recapture on d5. The queen can't take back: ...Qxd5 would win her.}
     d4 Qe2 Nf3 c3 Bf4
     >Be7{Change of plan: White's bishop on f4 would take a bishop on d6. Develop it to e7 instead.}
     Nbd2`],
  ['caro', 'caro', 2, 'King\'s Indian Attack (2.d3)',
    `e4 d3 Nd2 {! White keeps a pawn on e4, which would take a bishop on f5.}
     >e5{Change of plan: White keeps the e4 pawn, so ...Bf5 would hang. Take the full centre with ...e5 instead.}
     Ngf3
     >Bd6{Change of plan: f5 is still covered by the e4 pawn, so develop the other bishop first.}
     g3
     >Nf6{Change of plan: with the e4 pawn still there, f5 is never safe for your bishop. Carry on with ...Nf6.}
     Bg2 O-O Re1`],
  ['caro', 'caro', 2, '2.Nf3 and 3.e5',
    `e4 Nf3 e5 {! e5 takes f6 away from your knight.} d4 Be2
     >Ne7{Change of plan: White's e5 pawn would take a knight on f6, so the knight goes to e7 instead.}
     O-O c3
     >Ng6{Change of plan: with your knight on e7 the bishop can't reach d6. Move the knight on to g6, where it hits e5 and frees your bishop.}
     Nbd2`],
  ['caro', 'blacklondon', 3, '1.d4 and 2.c4 (Queen\'s Gambit)',
    `d4 c4 {! c4 attacks your d5 pawn.} Nf3 cxd5 {! White takes on d5.}
     >cxd5{Change of plan: recapture on d5 with the c-pawn before carrying on.}
     Nc3 e3 Bd3 Qxd3 O-O Bd2`],
  ['caro', 'blacklondon', 3, 'Colle setup (1.d4, Nf3, e3, Bd3)',
    `d4 Nf3 e3 Bd3 {! White offers to trade your good bishop.} Bxf5 {! White takes your bishop.}
     >exf5{Change of plan: recapture the bishop with the e-pawn.}
     O-O c4 Nc3 b3 Bb2`],
  ['caro', 'blacklondon', 3, 'London vs your setup',
    `d4 Bf4 e3 Nf3 c4 Qb3 {! Qb3 attacks b7, which your bishop no longer defends.}
     >Qb6{Change of plan: b7 is attacked, so defend it with ...Qb6, offering a queen trade.}
     Qxb6 Nc3 Be2
     >Be7{Change of plan: with the queens off, a bishop on d6 would just be taken by Bxd6. Develop it to e7.}
     O-O Rfc1`],
  ['caro', 'blacklondon', 2, 'Réti (1.Nf3, g3)',
    `Nf3 g3 Bg2 O-O d3 Nh4 {! Nh4 attacks your bishop on f5.} Nxf5 Nd2 e4`],
  ['caro', 'blacklondon', 2, 'English (1.c4)',
    `c4 {! c4 fights for d5.} Nc3 cxd5 {! White takes on d5.}
     >cxd5{Change of plan: recapture on d5 with the c-pawn.}
     d4 Bf4 e3 Nf3 Be2 O-O Rc1`],
  ['caro', 'blacklondon', 2, 'Bird Opening (1.f4)', `f4 Nf3 e3 b3 Bb2 Be2 O-O Nh4 Nxf5`],
  ['caro', 'blacklondon', 1, 'Larsen (1.b3)', `b3 Bb2 e3 Nf3 Be2 O-O d3 Nbd2`],
  /* ======================= Ruy Lopez (you are White) ======================= */
  ['ruy', 'ruy', 5, 'Main line (3...a6, ...b5, ...d6)',
    `e5 Nc6 a6 {! ...a6 attacks your bishop. Note: Bxc6 dxc6 Nxe5? does NOT win a pawn, because ...Qd4 hits the knight and e4.}
     Nf6 Be7 b5 {! ...b5 attacks your bishop again.} d6 O-O Na5 {! ...Na5 attacks your bishop on b3. Carry on with d4: if ...Nxb3, recapture with axb3.}`],
  ['ruy', 'ruy', 3, 'Noah\'s Ark danger (...b5 and ...c5)',
    `e5 Nc6 a6 {! ...a6 attacks your bishop. Note: Bxc6 dxc6 Nxe5? does NOT win a pawn, because ...Qd4 hits the knight and e4.}
     d6 b5 {! ...b5 attacks your bishop again.} Na5 {! Noah's Ark alert: ...Na5 hits your bishop, and ...c5-c4 could trap it on b3.}
     >>c3{Change of plan: Noah's Ark danger. Black threatens ...c5 and ...c4 to trap your bishop on b3, so play c3 now: the bishop can then escape to c2.}
     c5 {! ...c5 prepares ...c4. Thanks to c3, your bishop can retreat to c2.}
     c4 {! ...c4 attacks your bishop: it is NOT trapped, because c3 freed the c2 square.}`],
  ['ruy', 'ruy', 3, 'Berlin Defence (3...Nf6)',
    `e5 Nc6 Nf6 {! The Berlin: Black attacks your e4 pawn.}
     Nxe4 {! Black took your e4 pawn. Re1 attacks the knight, and you win the pawn back.}
     Nd6 {! The knight left e4. Now the e5 pawn is weak: win your pawn back.}
     >>Nxe5{Change of plan: this is the point of Re1: take back the pawn with Nxe5. Material is level again.}
     Be7`],
  ['ruy', 'ruy', 2, 'Bird Defence (3...Nd4)',
    `e5 Nc6 Nd4 {! ...Nd4 offers a knight trade.}
     >>Nxd4{Change of plan: against ...Nd4, take the knight with Nxd4. After ...exd4 Black's pawn on d4 is weak and you castle next.}
     exd4 c6 {! ...c6 attacks your bishop.} Nf6`],
  ['ruy', 'ruy', 3, 'Classical Defence (3...Bc5)',
    `e5 Nc6 Bc5 {! The Classical: Black's bishop aims at f2.}
     >>c3{Change of plan: against ...Bc5, play c3 now (a setup move played early) to prepare d4, which will kick the bishop.}
     Nf6 O-O
     >>d4{Change of plan: you are castled, so strike now with d4, hitting the bishop on c5.}
     Bb6`],
  ['ruy', 'ruy', 2, 'Steinitz Defence (3...d6)',
    `e5 Nc6 d6 {! Black defends e5 with a pawn.}
     >>d4{Change of plan: against ...d6, push d4 at once (a setup move played early): Black's position is passive and you take the centre.}
     Bd7 Nf6 Be7`],
  ['ruy', 'ruy', 2, 'Schliemann Gambit (3...f5)',
    `e5 Nc6 f5 {! The Schliemann: Black attacks your e4 pawn with a gambit.}
     >>Nc3{Change of plan: against ...f5, play Nc3 to defend e4 and develop. Don't grab pawns too early.}
     fxe4 d5`],
  ['ruy', 'ruy', 1, 'Beginner move 3...Nge7', `e5 Nc6 Nge7 d6 g6 Bg7`],
  ['ruy', 'ruy', 1, 'Beginner move 3...g6', `e5 Nc6 g6 Bg7 Nge7 O-O`],
  ['ruy', 'ruy', 1, 'Beginner move 3...Qf6', `e5 Nc6 Qf6 {! The queen comes out early. Keep developing: it will be a target.} Nge7 h6`],
  ['ruy', 'ruy', 1, 'Beginner move 3...h6', `e5 Nc6 h6 Nf6 d6 Be7`],
  ['ruy', 'ruy', 2, 'Petrov Defence (2...Nf6)',
    `e5 Nf6 {! The Petrov: Black attacks e4 instead of defending e5.}
     >>Nxe5{Change of plan: against the Petrov, take on e5 first; Bb5 would let Black take your e4 pawn for free.}
     d6 {! ...d6 attacks your knight on e5.}
     >Nf3{Change of plan: your knight is attacked, so drop it back to f3. Don't play Nxf7?, it loses a piece.}
     Nxe4 {! Black took back the pawn on e4.}
     >>d4{Change of plan: take the centre with d4 (a setup move played early), then develop and castle.}`],
  ['ruy', 'ruy', 2, 'Philidor Defence (2...d6)',
    `e5 d6 {! The Philidor: Black defends e5 with a pawn.}
     >>d4{Change of plan: against ...d6, push d4 at once and open the centre.}
     exd4 {! Black took your d4 pawn.}
     >>Nxd4{Change of plan: Black took on d4, so recapture with Nxd4; your knight stands well in the centre.}
     Nf6 {! ...Nf6 attacks your e4 pawn.}
     >>Nc3{Change of plan: ...Nf6 attacks e4, so defend it with Nc3 before anything else.}
     Be7`],
  ['ruy', 'ruy', 2, 'Sicilian (1...c5)',
    `c5 {! Not 1...e5: there is no knight on c6 to pin yet.} Nc6 g6 Bg7`],
  ['ruy', 'ruy', 1, 'Caro-Kann (1...c6)',
    `c6 {! Not 1...e5: Black prepares ...d5.} d5 {! ...d5 attacks your e4 pawn.}
     >>e5{Change of plan: against 1...c6 your bishop has no knight to pin on b5, and ...d5 attacks e4. Push e5 to gain space, then just develop and castle.}
     Bf5 >>d4{Take the centre with d4.} e6 >>Be2{Develop the bishop to e2 so you can castle (on b5 it would run into the c6 pawn).} c5`],
  ['ruy', 'ruy', 1, 'French (1...e6)',
    `e6 {! Not 1...e5: Black prepares ...d5.} d5 {! ...d5 attacks your e4 pawn.}
     >>exd5{Change of plan: against the French your bishop has no knight to pin on b5, and ...d5 attacks e4. Trade on d5 and just develop.}
     exd5 >>d4{Take the centre with d4.} Nf6 >>Bd3{Develop the bishop to d3, aiming at h7; then castle.} Bd6`],
];
