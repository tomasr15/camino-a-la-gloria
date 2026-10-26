export const ENGINE_VERSION = "cp2-v1";
export const DATASET_CODE = "cp2-synthetic-v1";
export type Position = "GK" | "DEF" | "MID" | "FWD";
export type Formation = "4-4-2" | "4-3-3";
export type Tactic = "defensive" | "balanced" | "offensive";
export type Direction = "left" | "center" | "right";
export type Tier = "low" | "medium" | "high";
export interface Player { id: string; name: string; position: Position; attack: number; defense: number; saves: number }
export interface Club { id: string; name: string; tier: Tier; players: Player[]; reference: number; target: number }
export interface Selection { formation: Formation; tactic: Tactic; lineup: string[] }
export interface Fixture { id: string; round: number; home: string; away: string }
export interface Shot {
  id: string; minute: number; clubId: string; playerId: string;
  attack: number; saves: number; keeper: Direction; roll: number;
  automaticDirection: Direction; automaticPrecision: number;
  controlled: boolean; resolved: boolean; goal: boolean | null;
  direction?: Direction; precision?: number;
}
export interface Match extends Fixture {
  homeSelection: Selection; awaySelection: Selection;
  homeExpected: number; awayExpected: number; shots: Shot[];
}
export interface Result extends Fixture { homeGoals: number; awayGoals: number }
export interface Standing { clubId: string; played: number; won: number; drawn: number; lost: number; for: number; against: number; points: number; rank: number }
export interface SeasonArchive { season: number; clubId: string; reputation: number; results: Result[]; table: Standing[] }
export interface GameState {
  engineVersion: string; datasetCode: string; seed: string;
  season: number; round: number; clubId: string; reputation: number;
  phase: "ready" | "playing" | "finished";
  results: Result[]; offers: string[]; history: SeasonArchive[];
  pending: Match[] | null;
}
export type Command =
  | { type: "initialize"; clubId: string }
  | ({ type: "start" } & Selection & { season: number; round: number })
  | { type: "shoot"; season: number; round: number; eventId: string; direction: Direction; precision: number }
  | { type: "auto"; season: number; round: number }
  | { type: "nextSeason"; season: number; offerClubId: string | null };
export class GameError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
