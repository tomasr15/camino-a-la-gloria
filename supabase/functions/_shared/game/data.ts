import { GameError, clamp } from "./model.ts";
import type { Club, Formation, Player, Selection, Tactic } from "./model.ts";
import rawDataset from "./datasets/cp2-real-v1.json" with { type: "json" };

const average = (players: Player[], field: "attack" | "defense") =>
  players.reduce((n, p) => n + p[field], 0) / players.length;
export function bestLineup(club: Club, formation: Formation): string[] {
  const counts = { GK: 1, DEF: 4, MID: formation === "4-4-2" ? 4 : 3, FWD: formation === "4-4-2" ? 2 : 3 };
  return (Object.keys(counts) as Array<keyof typeof counts>).flatMap(position =>
    club.players.filter(p => p.position === position).sort((a, b) => {
      const score = (p: Player) => position === "GK" ? p.saves : position === "DEF" ? p.defense : position === "FWD" ? p.attack : (p.attack + p.defense) / 2;
      return score(b) - score(a) || a.id.localeCompare(b.id);
    }).slice(0, counts[position]).map(p => p.id));
}
export function lineupPlayers(club: Club, formation: Formation, ids: string[]): Player[] {
  if (!["4-4-2", "4-3-3"].includes(formation) || ids.length !== 11 || new Set(ids).size !== 11)
    throw new GameError("INVALID_LINEUP", 400);
  const players = ids.map(id => club.players.find(p => p.id === id));
  if (players.some(p => !p)) throw new GameError("INVALID_LINEUP", 400);
  const valid = players as Player[];
  const required = { GK: 1, DEF: 4, MID: formation === "4-4-2" ? 4 : 3, FWD: formation === "4-4-2" ? 2 : 3 };
  for (const [pos, count] of Object.entries(required)) if (valid.filter(p => p.position === pos).length !== count) throw new GameError("INVALID_LINEUP", 400);
  return valid;
}
export function strength(club: Club, selection: Selection, confidence = 0): { attack: number; defense: number } {
  if (!["defensive", "balanced", "offensive"].includes(selection.tactic)) throw new GameError("INVALID_TACTIC", 400);
  const players = lineupPlayers(club, selection.formation, selection.lineup);
  const forwards = players.filter(p => p.position === "FWD"), mids = players.filter(p => p.position === "MID");
  const defenders = players.filter(p => p.position === "DEF"), keeper = players.find(p => p.position === "GK")!;
  const attack = 0.6 * average(forwards, "attack") + 0.3 * average(mids, "attack") + 0.1 * average(defenders, "attack");
  const defense = 0.5 * average(defenders, "defense") + 0.2 * average(mids, "defense") + 0.3 * keeper.saves;
  const tactic = selection.tactic === "defensive" ? [0.85, 1.15] : selection.tactic === "offensive" ? [1.15, 0.85] : [1, 1];
  return {
    attack: attack * (selection.formation === "4-3-3" ? 1.05 : 1) * tactic[0] * (1 + confidence),
    defense: defense * (selection.formation === "4-3-3" ? 0.95 : 1) * tactic[1] * (1 + confidence)
  };
}
// Real 2024 squads built by scripts/import-dataset.mjs; attributes are derived
// from season statistics, listed from low to high tier.
export const dataset = rawDataset as {
  code: string; isSynthetic: boolean;
  clubs: Array<{ id: string; name: string; tier: Club["tier"]; strength: number; players: Player[] }>;
};
export const clubs: Club[] = dataset.clubs.map(({ id, name, tier, strength: target, players }) => {
  const club: Club = { id, name, tier, reference: 0, target: tier === "low" ? 6 : tier === "medium" ? 4 : 2,
    players: players.map(({ id, name, position, attack, defense, saves }) => ({ id, name, position, attack, defense, saves })) };
  // Normalize team reference, not individual attributes: the derived ratings
  // keep each club's internal order and the tier sets its playing strength.
  const ref = () => {
    const s = strength(club, { formation: "4-4-2", tactic: "balanced", lineup: bestLineup(club, "4-4-2") });
    return (s.attack + s.defense) / 2;
  };
  const correction = target - ref();
  for (const p of club.players) {
    p.attack = Math.round(clamp(p.attack + correction, 1, 100));
    p.defense = Math.round(clamp(p.defense + correction, 1, 100));
    if (p.position === "GK") p.saves = Math.round(clamp(p.saves + correction, 1, 100));
  }
  club.reference = ref();
  return club;
});
export function getClub(id: string): Club {
  const club = clubs.find(c => c.id === id);
  if (!club) throw new GameError("UNKNOWN_CLUB", 400);
  return club;
}
export function cpuSelection(club: Club, opponent: Club, rng: () => number): Selection {
  const choices = (["4-4-2", "4-3-3"] as Formation[]).map(formation => ({
    formation, tactic: "balanced" as Tactic, lineup: bestLineup(club, formation)
  }));
  const scores = choices.map(c => { const s = strength(club, c); return s.attack + s.defense; });
  const choice = choices[scores[1] > scores[0] ? 1 : 0];
  const diff = club.reference - opponent.reference, draw = rng();
  const boundaries = diff <= -10 ? [0.5, 0.85] : diff >= 10 ? [0.15, 0.5] : [0.25, 0.75];
  return { ...choice, tactic: draw < boundaries[0] ? "defensive" : draw < boundaries[1] ? "balanced" : "offensive" };
}
