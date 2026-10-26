import { GameError, clamp } from "./model.ts";
import type { Club, Formation, Player, Selection, Tactic } from "./model.ts";
import { random } from "./random.ts";

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
const definitions = [
  ["Barrio del Sol", "low", 48, 6], ["Union del Arroyo", "low", 50, -6], ["Deportivo Horizonte", "low", 52, 0],
  ["Atletico Cumbre", "medium", 58, 3], ["Estrella del Sur", "medium", 60, -3], ["Sporting del Valle", "medium", 62, 0],
  ["Real del Puerto", "high", 69, 4], ["Club Aurora", "high", 72, -4]
] as const;
export const clubs: Club[] = definitions.map(([name, tier, target, profile], index) => {
  const rng = random("synthetic-v1-" + index);
  const club: Club = { id: "club-" + index, name, tier, reference: 0, target: tier === "low" ? 6 : tier === "medium" ? 4 : 2, players: [] };
  const positions = ["GK", "GK", ...Array(6).fill("DEF"), ...Array(6).fill("MID"), ...Array(4).fill("FWD")] as Player["position"][];
  club.players = positions.map((position, i) => ({
    id: club.id + "-p" + i, name: "Jugador ficticio " + (index + 1) + "-" + (i + 1), position,
    attack: clamp(target + profile + Math.floor(rng() * 17) - 8, 1, 100),
    defense: clamp(target - profile + Math.floor(rng() * 17) - 8, 1, 100),
    saves: clamp((position === "GK" ? target - profile : 10) + Math.floor(rng() * 17) - 8, 1, 100)
  }));
  // Normalize team reference, not individual attributes. Synthetic ratings are
  // game parameters, never claims about real footballers.
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
