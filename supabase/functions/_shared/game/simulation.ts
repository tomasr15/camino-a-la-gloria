import { clamp } from "./model.ts";
import type { Club, Direction, Fixture, Match, Selection, Shot } from "./model.ts";
import { lineupPlayers, strength } from "./data.ts";
import { poisson, random } from "./random.ts";
export const directions: Direction[] = ["left", "center", "right"];
export function conversion(attack: number, saves: number, precision: number, sameDirection: boolean): number {
  return clamp(0.3 + 0.004 * precision + 0.003 * (attack - saves) - (sameDirection ? 0.2 : 0), 0.1, 0.9);
}
export function expectedGoals(attack: number, defense: number, home: boolean): number {
  return clamp(1.3 * attack / defense * (home ? 1.1 : 1), 0.2, 3.5);
}
// Mean of the automatic precision law (average of two independent uniforms),
// including goal-probability clamps. Numerical integration is deterministic.
export function automaticConversion(attack: number, saves: number): number {
  let total = 0;
  for (let i = 0; i < 100; i++) {
    const q = i + 0.5;
    const weight = q < 50 ? q / 2500 : (100 - q) / 2500;
    total += weight * (conversion(attack, saves, q, true) / 3 + 2 * conversion(attack, saves, q, false) / 3);
  }
  return total;
}
function opportunities(club: Club, opponent: Club, selection: Selection, other: Selection, meanGoals: number, seed: string): Shot[] {
  const attackers = lineupPlayers(club, selection.formation, selection.lineup).filter(p => p.position === "FWD");
  const keeper = lineupPlayers(opponent, other.formation, other.lineup).find(p => p.position === "GK")!;
  const meanConversion = attackers.reduce((sum, p) => sum + automaticConversion(p.attack, keeper.saves), 0) / attackers.length;
  // Poisson thinning: target E[goals] = E[chances] * mean conversion.
  // Interactive precision can improve this expectation; there is no extra
  // precomputed score to which interactive goals could be added twice.
  const rng = random(seed + ":count");
  const count = poisson(meanGoals / meanConversion, rng);
  return Array.from({ length: count }, (_, i) => {
    const draw = random(seed + ":shot:" + i);
    const player = attackers[Math.floor(draw() * attackers.length)];
    return {
      id: seed.split(":").slice(-2).join("-") + "-" + i, minute: 1 + Math.floor(draw() * 90),
      clubId: club.id, playerId: player.id, attack: player.attack, saves: keeper.saves,
      keeper: directions[Math.floor(draw() * 3)], roll: draw(),
      automaticDirection: directions[Math.floor(draw() * 3)],
      automaticPrecision: (draw() + draw()) * 50,
      controlled: false, resolved: false, goal: null
    };
  });
}
export function resolve(shot: Shot, direction: Direction, precision: number): void {
  shot.direction = direction; shot.precision = precision;
  shot.goal = shot.roll < conversion(shot.attack, shot.saves, precision, direction === shot.keeper);
  shot.resolved = true;
}
export function resolveAutomatically(shot: Shot): void {
  resolve(shot, shot.automaticDirection, shot.automaticPrecision);
}
export function simulateMatch(fixture: Fixture, home: Club, away: Club, homeSelection: Selection, awaySelection: Selection,
  homeConfidence: number, awayConfidence: number, rootSeed: string, controlledClubId: string): Match {
  const hs = strength(home, homeSelection, homeConfidence), as = strength(away, awaySelection, awayConfidence);
  const homeExpected = expectedGoals(hs.attack, as.defense, true), awayExpected = expectedGoals(as.attack, hs.defense, false);
  const seed = rootSeed + ":" + fixture.id;
  const shots = [
    ...opportunities(home, away, homeSelection, awaySelection, homeExpected, seed + ":" + home.id),
    ...opportunities(away, home, awaySelection, homeSelection, awayExpected, seed + ":" + away.id)
  ].sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id));
  let controls = 0;
  for (const shot of shots) {
    if (shot.clubId === controlledClubId && controls < 2) { shot.controlled = true; controls++; }
    else resolveAutomatically(shot);
  }
  return { ...fixture, homeSelection, awaySelection, homeExpected, awayExpected, shots };
}
