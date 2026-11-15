/*
 * Bot levels. Stockfish's own "Skill Level" bottoms out around 1300 Elo, so the
 * lowest levels also play a share of completely random moves and search very
 * shallowly, which produces the hanging pieces and missed mates of a real beginner.
 */
export const LEVELS = {
  1:  { elo: 200,  skill: 0,  depth: 1,  movetime: 50,   random: 0.55, desc: 'Moves almost at random and hangs pieces constantly.' },
  2:  { elo: 400,  skill: 0,  depth: 1,  movetime: 80,   random: 0.35, desc: 'Knows how pieces move, but blunders very often.' },
  3:  { elo: 600,  skill: 1,  depth: 2,  movetime: 100,  random: 0.22, desc: 'Takes free material, still drops pieces regularly.' },
  4:  { elo: 800,  skill: 3,  depth: 3,  movetime: 150,  random: 0.12, desc: 'A casual player. Will punish some obvious blunders.' },
  5:  { elo: 1000, skill: 5,  depth: 4,  movetime: 200,  random: 0.06, desc: 'Sees simple tactics, makes occasional mistakes.' },
  6:  { elo: 1200, skill: 7,  depth: 5,  movetime: 300,  random: 0.02, desc: 'A solid club beginner.' },
  7:  { elo: 1500, skill: 10, depth: 7,  movetime: 500,  random: 0,    desc: 'An average club player.' },
  8:  { elo: 1800, skill: 13, depth: 9,  movetime: 800,  random: 0,    desc: 'A strong club player.' },
  9:  { elo: 2100, skill: 16, depth: 12, movetime: 1200, random: 0,    desc: 'Expert level. Punishes nearly every mistake.' },
  10: { elo: 2500, skill: 20, depth: 18, movetime: 2500, random: 0,    desc: 'Full-strength Stockfish (lite network, depth-limited).' },
};
