import { clamp } from "./model.ts";
import type { Fixture, Result, Standing } from "./model.ts";
import { clubs, getClub } from "./data.ts";
import { random, shuffle } from "./random.ts";

export function schedule(seed: string, season: number): Fixture[] {
  const rotation = shuffle(clubs.map(c => c.id), random(seed + ":calendar:" + season));
  const first: Fixture[] = [];
  for (let r = 0; r < 7; r++) {
    for (let i = 0; i < 4; i++) {
      const pair = [rotation[i], rotation[7 - i]];
      if ((r + i) % 2) pair.reverse();
      first.push({ id: "s" + season + "-r" + (r + 1) + "-m" + i, round: r + 1, home: pair[0], away: pair[1] });
    }
    rotation.splice(1, 0, rotation.pop()!);
  }
  return [...first, ...first.map((f, i) => ({ id: "s" + season + "-r" + (f.round + 7) + "-m" + (i % 4), round: f.round + 7, home: f.away, away: f.home }))];
}
export function table(results: Result[], seed: string, season: number): Standing[] {
  const lottery = shuffle(clubs.map(c => c.id), random(seed + ":ties:" + season));
  const rows: Standing[] = clubs.map(c => ({ clubId: c.id, played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0, points: 0, rank: 0 }));
  for (const r of results) {
    for (const [id, scored, conceded] of [[r.home, r.homeGoals, r.awayGoals], [r.away, r.awayGoals, r.homeGoals]] as const) {
      const row = rows.find(x => x.clubId === id)!;
      row.played++; row.for += scored; row.against += conceded;
      if (scored > conceded) { row.won++; row.points += 3; }
      else if (scored === conceded) { row.drawn++; row.points++; }
      else row.lost++;
    }
  }
  rows.sort((a, b) => b.points - a.points || (b.for - b.against) - (a.for - a.against) || b.for - a.for || b.won - a.won || lottery.indexOf(a.clubId) - lottery.indexOf(b.clubId));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
export function confidence(clubId: string, results: Result[]): number {
  const recent = results.filter(r => r.home === clubId || r.away === clubId).slice(-5);
  return clamp(recent.reduce((sum, r) => {
    const diff = r.home === clubId ? r.homeGoals - r.awayGoals : r.awayGoals - r.homeGoals;
    return sum + Math.sign(diff) * 0.02;
  }, 0), -0.06, 0.06);
}
export function reputationDelta(clubId: string, r: Result): number {
  const home = r.home === clubId, opponent = getClub(home ? r.away : r.home);
  const difference = opponent.reference - getClub(clubId).reference;
  const goals = home ? r.homeGoals - r.awayGoals : r.awayGoals - r.homeGoals;
  const deltas = difference >= 10 ? [3, 1, -1] : difference <= -10 ? [1, -1, -2] : [2, 0, -1];
  return deltas[goals > 0 ? 0 : goals === 0 ? 1 : 2];
}
export function seasonBonus(clubId: string, rank: number): number {
  const target = getClub(clubId).target;
  return rank <= target - 2 ? 5 : rank <= target ? 3 : -2;
}
export function offers(clubId: string, reputation: number, standings: Standing[], seed: string, season: number): string[] {
  const minimum = { low: 15, medium: 30, high: 50 };
  const available = clubs.filter(c => c.id !== clubId && reputation >= minimum[c.tier] && standings.find(r => r.clubId === c.id)!.rank > c.target);
  return shuffle(available.map(c => c.id), random(seed + ":offers:" + season)).slice(0, 2);
}
