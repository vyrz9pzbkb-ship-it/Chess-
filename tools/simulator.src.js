// Source for data/simulator.json (Opening Simulator). Build: node tools/build-simulator.js
//
// Each line is a move string. Annotations attach to the move just before them:
//   {? text}  explanation for one of YOUR moves (shown when you play something else)
//   {! text}  "Watch out!" alert for an OPPONENT move (shown before you reply)
// Your moves without {? } fall back to the DEFAULT notes below.
// `w` is how often the computer picks the line (main lines are more common).

exports.OPENINGS = {
  london: {
    name: 'London System', side: 'w',
    blurb: 'You play White: d4, Bf4, e3, Nf3, c3, Nbd2, Bd3 and O-O against almost anything.',
  },
  caro: {
    name: 'Caro-Kann + ...d5 setup', side: 'b',
    blurb: 'You play Black: the Caro-Kann (1...c6, 2...d5) against 1.e4, and a London-style setup (d5, Bf5, e6, Nf6, c6, Nbd7, Bd6, O-O) against everything else.',
  },
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
  blacklondon: [
    { title: 'Mirror the London plan', text: 'Knight to e4 (backed by ...f5 if needed), then ...Qf6 or ...Qh4 and ...g5 against a kingside-castled king.' },
    { title: 'Central break ...e5 or ...c5', text: 'Once you have castled and connected rooks, break with ...c5 or prepare ...e5 to free your position.' },
    { title: 'Queenside space', text: 'Against c4 setups, keep d5 solid with ...c6 and ...e6, then expand with ...b5 or trade on c4 at the right moment.' },
  ],
};

exports.DEFAULT = {
  w: {
    d4: 'Start with 1.d4: the London is built around the d4 pawn.',
    Bf4: 'Develop the dark-squared bishop to f4 BEFORE playing e3, so it isn\'t locked in.',
    e3: 'Play e3 to support d4 and open the way for your f1 bishop.',
    Nf3: 'Develop the king\'s knight to f3, guarding d4 and e5.',
    c3: 'Play c3 to complete the pawn triangle (c3-d4-e3) so d4 is rock-solid.',
    Nbd2: 'Bring the b1 knight to d2, keeping c3 for the pawn.',
    Nd2: 'Bring the b1 knight to d2, keeping c3 for the pawn.',
    Bd3: 'Put the bishop on d3, where it aims at h7.',
    'O-O': 'Castle to get your king safe before starting any action.',
    Bg3: 'Your bishop is being challenged: retreat it to g3 so you can recapture with the h-pawn.',
    h3: 'Play h3 to give your bishop a safe retreat square on h2.',
    Qb3: 'Defend b2 with Qb3, and offer a queen trade.',
    Ne5: 'Jump into e5 with the knight: it is a great outpost supported by d4.',
    Be2: 'Develop the bishop to e2 here: on d3 it could be traded or attacked.',
    Qe2: 'Qe2 connects your rooks and supports a later e3-e4 push.',
  },
  b: {
    c6: 'Play ...c6 first: it prepares ...d5 with the c-pawn ready to recapture.',
    d5: 'Take the centre with ...d5.',
    Bf5: 'Develop the light-squared bishop to f5 BEFORE playing ...e6.',
    e6: 'Now ...e6 is fine: your bishop is already outside the pawn chain.',
    Nf6: 'Develop the knight to f6, fighting for e4.',
    Nbd7: 'Bring the b8 knight to d7, keeping c6 for the pawn.',
    Nd7: 'Bring the knight to d7: it controls e5 and keeps the c-pawn free.',
    Bd6: 'Develop the bishop to d6 to challenge White\'s pieces on the dark squares.',
    'O-O': 'Castle to get your king safe.',
    Bg6: 'Your bishop is attacked: drop it back to g6, still on the same diagonal.',
    Ngf6: 'Develop the other knight to f6.',
    Be7: 'Develop the bishop to e7 and get ready to castle.',
    h6: 'Play ...h6 to stop Bg5 or Ng5 ideas and give your bishop room.',
    dxe4: 'Take on e4: you will win time by developing with tempo.',
    cxd5: 'Recapture with the c-pawn: you keep a central pawn and get the half-open c-file.',
    Nc6: 'Develop the knight to c6, adding pressure on d4.',
    Qb6: 'Meet the attack with ...Qb6: it defends b7 and offers a queen trade.',
    c5: 'Strike at White\'s centre with ...c5.',
  },
};

// [opening, family, weight, name, moves]
exports.LINES = [
  /* ===================== London System (you are White) ===================== */
  ['london', 'london', 4, 'Main line: ...e6, ...c5, ...Nc6, ...Bd6',
    `d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6
     {! Black challenges your best bishop with ...Bd6.}
     Bg3 {? Your bishop is challenged: keep it with Bg3, so ...Bxg3 hxg3 opens your h-file.}
     O-O Bd3 b6 O-O Bb7 Ne5 {? Now jump into e5 with the knight: d4 supports it.}`],
  ['london', 'london', 3, '...c5 and ...Qb6 attacking b2',
    `d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nf3 Qb6
     {! Watch out! ...Qb6 attacks your b2 pawn, and nothing defends it.}
     Qb3 {? Defend b2 with Qb3: it also offers a queen trade.}
     c4 {! ...c4 kicks your queen. Keep it close to the kingside.}
     Qc2 {? Retreat to c2, where the queen still watches e4 and h7.}
     Bg4 Nbd2 e6 Be2 {? Develop to e2: on d3 the bishop would be hit by ...cxd3.}
     Be7 O-O O-O h3 {? Ask the g4 bishop what it wants: h3 gains space and gives your king air.}`],
  ['london', 'london', 3, '...Bf5 mirror',
    `d4 d5 Bf4 Bf5 e3 e6 Nf3 Nf6 c3 Bd6
     {! Black challenges your bishop.}
     Bg3 {? Your bishop is attacked: keep it with Bg3.}
     O-O Nbd2 Nbd7 Be2 {? Develop to e2: Bd3 Bxd3 can't be met by Qxd3, because your d2 knight blocks the queen.}
     c5 {! Watch out! Black's bishop on d6 is now undefended: the d7 knight blocks the queen.}
     Bxd6 {? Take the bishop on d6: nothing can recapture, so you win a piece.}
     Re8 O-O {? Castle and enjoy your extra piece.}`],
  ['london', 'london', 3, 'King\'s Indian setup (...g6, ...d6, ...e5)',
    `d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O c3 d6
     h3 {? Play h3 first: your bishop needs the h2 square before Black plays ...Nh5 or ...e5.}
     Nbd7 Be2 {? Develop to e2: against ...e5-e4 ideas the bishop is safer there.}
     e5 {! Watch out! ...e5 attacks your bishop on f4.}
     Bh2 {? Your bishop is attacked: drop it back to h2, the square h3 prepared.}
     Re8 O-O Qe7 Nbd2`],
  ['london', 'london', 2, '...Nh5 hunting the bishop',
    `d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nh5
     {! Watch out! ...Nh5 attacks your bishop on f4.}
     Bg5 {? Your bishop is attacked: Bg5 hits the queen, so Black has no time to chase it again.}
     Be7 Bxe7 {? Trade the bishops: the knight on h5 is now offside.}
     Qxe7 Nbd2 Nf6 Bd3 Nc6 O-O O-O`],
  ['london', 'london', 2, 'Early ...h6 and ...g5',
    `d4 d5 Bf4 Nf6 e3 e6 Nf3 h6 c3 g5
     {! Watch out! ...g5 attacks your bishop on f4.}
     Bg3 {? Your bishop is attacked: move it to g3. Black's ...g5 has weakened his own king.}
     Ne4 {! The knight jumps to e4 to take your bishop.}
     Nbd2 Nxg3 hxg3 {? Recapture with the h-pawn: your rook gets the open h-file against the weak h6 pawn.}
     Bg7 Bd3 Nd7 Qe2`],
  ['london', 'london', 2, 'Early ...e5 break (2...Nc6, 3...e5?!)',
    `d4 d5 Bf4 Nc6 e3 e5
     {! Watch out! ...e5 attacks your bishop and opens the centre.}
     dxe5 {? Take the pawn with dxe5: your bishop stays on f4 defending e5.}
     Bb4+ {! Check! Block it calmly.}
     c3 Bc5 Nf3 Nge7 Bd3 {? Develop and aim at h7: your extra e5 pawn cramps Black.}
     Bg4 Nbd2 Ng6 Bg3 O-O O-O`],
  ['london', 'london', 2, '...Bb4+ check',
    `d4 Nf6 Bf4 e6 e3 Bb4+
     {! Check from the bishop on b4.}
     c3 {? Block with c3: a move you wanted to play anyway, and it attacks the bishop.}
     Be7 Nf3 O-O Nbd2 d5 Bd3 c5 O-O Nc6 Qe2 {? Qe2 connects your rooks and prepares e3-e4.}`],
  ['london', 'london', 2, 'Queen\'s Indian (...b6, ...Bb7)',
    `d4 Nf6 Bf4 e6 e3 b6 Nf3 Bb7 Nbd2 {? Nbd2 controls e4, the square Black's bishop is aiming at.}
     Be7 h3 {? Play h3 to give the bishop h2 and stop ...Nh5.}
     c5 c3 O-O Bd3 d6 O-O Nbd7 Qe2`],
  ['london', 'london', 2, 'Englund Gambit (1...e5?!) trap',
    `d4 e5 dxe5 {? Take the free pawn.}
     Nc6 Nf3 {? Defend e5 with the knight.}
     Qe7 Bf4 {? Defend e5 again, London-style.}
     Qb4+ {! Watch out! ...Qb4+ checks AND attacks your b2 pawn.}
     Bd2 {? Block with Bd2.}
     Qxb2 {! Black grabbed b2. Careful: Bc3?? loses to ...Bb4!, ...Bxc3 and ...Qc1 mate!}
     Nc3 {? Develop with Nc3: your queen still guards a1, and Rb1 next will chase Black's queen.}
     Bb4 Rb1 {? Rb1 attacks the queen, which runs out of safe squares fast.}
     Qa3 Rb3 {? Rb3 chases the queen again and wins time for development.}
     Qa5 a3 {? a3 attacks the b4 bishop and keeps chasing Black's pieces.}`],
  ['london', 'london', 2, '...c5 on move 1',
    `d4 c5 c3 {? Support d4 with c3: your setup still works and ...cxd4 is met by cxd4.}
     cxd4 cxd4 {? Recapture with the c-pawn and keep a pawn on d4.}
     d5 Bf4 {? Develop the bishop to f4, as always.}
     Nc6 e3 Nf6 Nf3 Bf5 Nc3 {? With the c-pawn gone, the knight goes to c3, its best square.}
     e6 Bb5 {? Pin the c6 knight: it pressures Black's queenside.}
     Bd6 Ne5 {? Jump into e5: the pinned c6 knight is now attacked twice.}
     O-O`],
  ['london', 'london', 2, '...Nc6 and ...Nb4 jump',
    `d4 d5 Bf4 Nc6 e3 Nb4
     {! Watch out! ...Nb4 eyes c2: after ...Bf5, Black would attack it twice and threaten ...Nxc2+ forking king and rook.}
     Na3 {? Guard c2 a second time with Na3; the knight can come back to the centre via c2.}
     a6 c3 {? Kick the knight away with c3.}
     Nc6 Nf3 Bf5 Nc2 {? Bring the knight back to the centre via c2.}
     e6 Bd3 {? Offer the trade of light-squared bishops with Bd3.}
     Bxd3 Qxd3 {? Recapture with the queen, which is now well placed.}
     Nf6 O-O`],
  ['london', 'london', 1, 'Dutch Defence (1...f5)',
    `d4 f5 Bf4 Nf6 e3 e6 Nf3 Be7 Bd3 {? Bd3 aims at the f5 pawn and the light squares Black has weakened.}
     O-O Nbd2 d6 h3 {? h3 gives the bishop h2 and prepares g4 to attack f5.}
     Qe8 c3 Nc6 Qc2 {? Qc2 lines up with the bishop against f5 and h7.}`],

  /* ===================== Caro-Kann vs 1.e4 (you are Black) ===================== */
  ['caro', 'caro', 4, 'Advance Variation (3.e5)',
    `e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5
     {? Hit the base of White's pawn chain with ...c5.}
     Be3 Nd7 {? ...Nd7 adds pressure on e5 and prepares ...Ne7.}
     O-O Ne7 {? The knight goes to e7 (f6 is blocked by e5) and heads for c6 or f5.}
     c3 Nc6 Nbd2 Be7 {? Develop the bishop and get ready to castle.}`],
  ['caro', 'caro', 3, 'Advance with 4.g4 hitting the bishop',
    `e4 c6 d4 d5 e5 Bf5 g4
     {! Watch out! g4 attacks your bishop on f5.}
     Bd7 {? Your bishop is attacked: drop it to d7. White's g4 has loosened his own king.}
     c3 e6 Nd2 c5 {? Strike the centre with ...c5 now.}
     f4 Nc6 Ndf3 Qb6 {? ...Qb6 piles up on d4 and hits b2.}`],
  ['caro', 'caro', 4, 'Classical Variation (3.Nc3 dxe4)',
    `e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 {? Develop with tempo: ...Bf5 attacks the knight.}
     Ng3 {! The knight hits your bishop.}
     Bg6 {? Keep the bishop on the diagonal with ...Bg6.}
     h4 {! Watch out! h4-h5 threatens to trap your bishop.}
     h6 {? Give the bishop the h7 square with ...h6.}
     Nf3 Nd7 h5 Bh7 {? Your bishop is attacked again: retreat to h7.}
     Bd3 Bxd3 {? Trade the bishops: White's attacker disappears.}
     Qxd3 e6 Bd2 Ngf6`],
  ['caro', 'caro', 2, 'Classical with 6.Bc4',
    `e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 Bc4
     {! White's bishop aims at f7 and e6.}
     e6 {? Close the diagonal with ...e6: f7 is safe and your bishop is already out.}
     N1e2 Nf6 O-O Bd6 {? Develop the bishop to d6: it eyes g3 and h2.}
     f4 Qc7 {? ...Qc7 adds pressure on f4 and prepares castling.}`],
  ['caro', 'caro', 2, 'Classical with Qf3?!',
    `e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Qf3
     {! Watch out! Qf3 attacks your bishop on f5.}
     Bxe4 {? Take the knight first: then the queen has to recapture and you develop with tempo.}
     Qxe4 Nf6 {? ...Nf6 attacks the queen: develop with tempo.}
     Qd3 e6 Nf3 Be7 Bd2 O-O`],
  ['caro', 'caro', 3, 'Exchange Variation (3.exd5)',
    `e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 {? Develop and pressure d4.}
     c3 Nf6 Bf4 Bg4 {? Develop the bishop actively before ...e6, pinning the knight later.}
     Qb3 {! Watch out! Qb3 attacks b7 and d5.}
     Qd7 {? Defend b7 with ...Qd7; your queen also connects with the c-file.}
     Nd2 e6 Ngf3 Bxf3 {? Trade the knight: it can't jump into e5.}
     Nxf3 Bd6 Bxd6 Qxd6 {? Recapture with the queen; then castle short.}`],
  ['caro', 'caro', 2, 'Panov Attack (4.c4)',
    `e4 c6 d4 d5 exd5 cxd5 c4 Nf6 {? Develop and defend d5.}
     Nc3 e6 Nf3 Be7 cxd5 Nxd5 {? Recapture with the knight: it lands on a strong central square.}
     Bd3 Nc6 O-O O-O Re1 Nf6 {? The knight returns to f6 to defend your king.}`],
  ['caro', 'caro', 2, 'Two Knights (2.Nc3, 3.Nf3)',
    `e4 c6 Nc3 d5 Nf3 Bg4 {? Pin the f3 knight with ...Bg4.}
     h3 Bxf3 {? Take the knight: White gets the bishop pair, but you get a solid centre.}
     Qxf3 e6 d4 Nf6 Bd3 dxe4 Nxe4 Qxd4 {? Grab the d4 pawn: it is safe.}
     c3 Qd8 {? Bring the queen back home safely.}
     O-O Nbd7`],
  ['caro', 'caro', 2, '2.Bc4 aiming at f7',
    `e4 c6 Bc4 d5 {? ...d5 attacks the bishop and the e4 pawn at once.}
     exd5 cxd5 Bb5+ {! Check.}
     Bd7 {? Block with ...Bd7 and offer a trade of bishops.}
     Bxd7+ Qxd7 {? Recapture with the queen.}
     d4 Nc6 Nf3 Nf6 O-O e6`],
  ['caro', 'caro', 2, '2.Bc4 with Bb3 and Qh5',
    `e4 c6 Bc4 d5 Bb3 dxe4 Qh5
     {! Watch out! The queen on h5 and bishop on b3 both aim at f7.}
     e6 {? Close the b3-bishop's diagonal with ...e6. Now f7 is only attacked once.}
     Nc3 Nd7 {? Defend f6 and keep the queen out of e5 with ...Nd7.}
     Nxe4 Ngf6 {? Develop with tempo: ...Ngf6 attacks the queen.}
     Nxf6+ Nxf6 {? Recapture with the knight, developing it.}
     Qe2 Bd6`],
  ['caro', 'caro', 2, '2.Qh5?! early queen',
    `e4 c6 Qh5
     {! Watch out! The queen eyes f7 and e5. Develop and attack it.}
     d5 {? Strike the centre with ...d5: the queen on h5 does nothing against it.}
     exd5 Nf6 {? ...Nf6 attacks the queen and develops.}
     Qf3 cxd5 d4 Nc6 c3 Bg4 {? Develop with tempo: ...Bg4 attacks the queen.}
     Qe3 e6 Nd2 Bd6`],
  ['caro', 'caro', 2, '2.d3 King\'s Indian Attack',
    `e4 c6 d3 d5 Nd2 e5 {? White is slow: take the full centre with ...e5.}
     Ngf3 Bd6 {? Develop the bishop to d6 to protect e5.}
     g3 Nf6 Bg2 O-O O-O Re8 {? The rook supports e5 and the centre.}
     Re1 Nbd7`],
  ['caro', 'caro', 2, '2.Nf3 and 3.exd5',
    `e4 c6 Nf3 d5 exd5 cxd5 d4 Nc6 c3 Nf6 Bf4 Bg4 {? Pin the f3 knight with ...Bg4 before playing ...e6.}
     Nbd2 e6
     Qb3 {! Watch out! Qb3 attacks your b7 pawn.}
     Qc8 {? Defend b7 with ...Qc8. (...Qc7? looks active but runs into tactics on the c-file and b5.)}
     h3 Bh5 {? Keep the pin on the f3 knight with ...Bh5.}
     Bd3 Be7 {? Develop the bishop and get ready to castle.}`],
  ['caro', 'caro', 1, 'Fantasy Variation (3.f3)',
    `e4 c6 d4 d5 f3 e6 {? Solid: ...e6 prepares ...Bb4 and ...c5.}
     Nc3 Bb4 {? Pin the knight and pressure e4.}
     Bd2 dxe4 {? Take on e4 now, while the knight on c3 is pinned.}
     Nxe4 Be7 {? Drop the bishop back to e7: the pin is gone and it guards your kingside.}
     Bd3 Nf6 {? Develop and challenge the e4 knight.}
     Ne2 Nxe4 {? Trade off White's best-placed knight.}`],

  /* ===================== ...d5 / ...Bf5 setup vs everything else (you are Black) ===================== */
  ['caro', 'blacklondon', 4, '1.d4 2.Nf3: London setup for Black',
    `d4 d5 Nf3 Bf5 {? Develop the bishop before ...e6.}
     e3 e6 Bd3 Bg6 {? Keep your bishop: it was attacked, so step back to g6.}
     O-O Nf6 c4 c6 {? ...c6 keeps d5 solid against c4.}
     Nc3 Nbd7 b3 Bd6 Bb2 O-O`],
  ['caro', 'blacklondon', 3, 'Queen\'s Gambit 2.c4: Slav with ...Bf5',
    `d4 d5 c4 c6 {? Defend d5 with ...c6 (the Slav): it keeps the f5 square for your bishop.}
     Nf3 Nf6 e3 Bf5 Nc3 e6
     Nh4 {! Watch out! Nh4 attacks your bishop.}
     Bg6 {? Your bishop is attacked: go back to g6 and recapture towards the centre with ...hxg6 if needed.}
     Nxg6 hxg6 {? Recapture towards the centre: your h-file opens for the rook.}
     Bd3 Nbd7 O-O Bd6`],
  ['caro', 'blacklondon', 3, 'Queen\'s Gambit with Qb3 hitting b7',
    `d4 d5 c4 c6 Nf3 Nf6 e3 Bf5 cxd5 cxd5
     Qb3 {! Watch out! Qb3 attacks b7 and d5.}
     Qb6 {? Meet Qb3 with ...Qb6: b7 is defended and White must think about trading.}
     Nc3 e6 Qxb6 axb6 {? Recapture: your a-file opens for the rook.}
     Nb5 Na6 {? Defend c7 against Nc7+ with ...Na6.}`],
  ['caro', 'blacklondon', 3, 'London vs London',
    `d4 d5 Bf4 Bf5 e3 e6 Nf3 Nf6 c4 c6 Nc3 Nbd7
     Qb3 {! Watch out! Qb3 attacks b7.}
     Qb6 {? Defend b7 and offer a queen trade with ...Qb6.}
     c5 Qxb3 {? Trade queens: White's c5 has released the pressure on d5.}
     axb3 Be7`],
  ['caro', 'blacklondon', 3, 'Réti / King\'s Indian Attack (1.Nf3, g3)',
    `Nf3 d5 g3 Bf5 {? Develop the bishop actively before ...e6.}
     Bg2 e6 O-O Nf6 d3 h6 {? ...h6 keeps a retreat square on h7 for your bishop.}
     Nbd2 Be7 Qe1 O-O e4 Bh7 {? Keep the bishop safe on h7, still on its diagonal.}`],
  ['caro', 'blacklondon', 2, 'English 1.c4',
    `c4 c6 {? Prepare ...d5 with ...c6, Caro-Kann style.}
     Nc3 d5 cxd5 cxd5 d4 Nf6 Bf4 Bf5 e3 e6 Qb3
     {! Watch out! Qb3 attacks b7.}
     Qb6 {? Meet Qb3 with ...Qb6: if Qxb6, ...axb6 opens your a-file.}
     Qxb6 axb6 {? Recapture towards the centre; your rook gets the a-file.}
     Nf3 Nc6 {? Develop the knight and cover b4 and e5.}`],
  ['caro', 'blacklondon', 2, 'Jobava London (2.Nc3, Nb5)',
    `d4 d5 Nc3 Bf5 Bf4 e6
     Nb5 {! Watch out! Nb5 threatens Nxc7+, forking your king and rook.}
     Na6 {? Defend c7 with ...Na6.}
     e3 Nf6 Nf3 c6 Nc3 Qb6 {? Now ...Qb6 hits b2: White's knight wandered and the queenside is loose.}
     Na4 Qa5+ {? Check from a5: the knight on a4 is short of squares.}
     c3`],
  ['caro', 'blacklondon', 2, 'Blackmar-Diemer Gambit (2.e4)',
    `d4 d5 e4 dxe4 {? Accept the gambit pawn.}
     Nc3 Nf6 f3 Bf5 {? Develop and keep the extra pawn for now.}
     fxe4 Nxe4 {? Take back the pawn: you are a pawn up and White's king is airy.}
     Nxe4 Bxe4 {? Recapture with the bishop.}
     Nf3 e6 Bd3 Bxd3 {? Trade White's attacking bishop.}
     Qxd3 Nc6`],
  ['caro', 'blacklondon', 2, 'Bird Opening (1.f4)',
    `f4 d5 Nf3 Bf5 {? Same setup: bishop out first.}
     e3 e6 b3 Nf6 Bb2 Nbd7 Be2 Bd6 {? ...Bd6 eyes f4 and prepares castling.}
     O-O O-O Nh4 {! Watch out! Nh4 attacks your bishop on f5.}
     Re8 {? Let it happen: after Nxf5 exf5 your rook gets the half-open e-file and you control e4.}
     c4`],
  ['caro', 'blacklondon', 2, 'Larsen 1.b3',
    `b3 d5 Bb2 Bf5 {? Develop the bishop to f5 first.}
     e3 e6 Nf3 Nf6 Be2 h6 {? ...h6 gives your bishop h7 and stops Ng5 or Nh4 tricks.}
     O-O Nbd7 c4 c6 d3 Bd6`],
  ['caro', 'blacklondon', 2, '1.d4 2.Nf3 3.c4 with Qb3 trap',
    `d4 d5 Nf3 Bf5 c4 e6
     Qb3 {! Watch out! Qb3 attacks b7.}
     Nc6 {? Defend with ...Nc6: if Qxb7, then ...Nb4! threatens ...Nc2+.}
     Bg5 {! White's bishop left d4 without a defender.}
     Nxd4 {? Grab d4 with ...Nxd4: if Nxd4, then ...Qxg5 takes the bishop back.}
     Nxd4 Qxg5 {? Take back the bishop: you have won a pawn.}
     Nc3 O-O-O {? Castle long: your rook lands on the d-file.}
     cxd5 exd5 {? Recapture with the e-pawn: the e-file opens and your bishop on f5 stays active.}
     e3 Bc5 {? Develop the bishop, hitting the d4 knight.}`],
  ['caro', 'blacklondon', 1, 'Van\'t Kruijs 1.e3',
    `e3 d5 d4 Bf5 c4 e6 Nc3 c6 Nf3 Nd7 Bd3 Bxd3 {? Trade White's best bishop.}
     Qxd3 Ngf6 O-O Bd6`],
];
