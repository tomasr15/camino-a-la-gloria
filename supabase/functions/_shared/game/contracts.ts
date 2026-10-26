import { GameError } from "./model.ts";
import type { Command, Direction, Formation, Tactic } from "./model.ts";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GameError("INVALID_INPUT", 400);
  return value as Record<string, unknown>;
}
function exactKeys(obj: Record<string, unknown>, keys: string[]) {
  if (Object.keys(obj).sort().join(",") !== keys.sort().join(",")) throw new GameError("INVALID_INPUT", 400);
}
function text(value: unknown, max = 120): string {
  if (typeof value !== "string" || !value.length || value.length > max || /[\u0000-\u001f]/.test(value)) throw new GameError("INVALID_INPUT", 400);
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new GameError("INVALID_INPUT", 400);
  return value;
}
export function parseCommand(input: unknown): Command {
  const c = object(input);
  if (c.type === "initialize") {
    exactKeys(c, ["type", "clubId"]); return { type: c.type, clubId: text(c.clubId) };
  }
  if (c.type === "start") {
    exactKeys(c, ["type", "season", "round", "formation", "tactic", "lineup"]);
    if (!["4-4-2", "4-3-3"].includes(String(c.formation)) || !["defensive", "balanced", "offensive"].includes(String(c.tactic)) || !Array.isArray(c.lineup) || c.lineup.length !== 11) throw new GameError("INVALID_INPUT", 400);
    return { type: c.type, season: integer(c.season, 1, 10000), round: integer(c.round, 1, 14), formation: c.formation as Formation, tactic: c.tactic as Tactic, lineup: c.lineup.map(id => text(id)) };
  }
  if (c.type === "shoot") {
    exactKeys(c, ["type", "season", "round", "eventId", "direction", "precision"]);
    if (!["left", "center", "right"].includes(String(c.direction)) || typeof c.precision !== "number" || !Number.isFinite(c.precision) || c.precision < 0 || c.precision > 100) throw new GameError("INVALID_INPUT", 400);
    return { type: c.type, season: integer(c.season, 1, 10000), round: integer(c.round, 1, 14), eventId: text(c.eventId), direction: c.direction as Direction, precision: c.precision };
  }
  if (c.type === "auto") {
    exactKeys(c, ["type", "season", "round"]); return { type: c.type, season: integer(c.season, 1, 10000), round: integer(c.round, 1, 14) };
  }
  if (c.type === "nextSeason") {
    exactKeys(c, ["type", "season", "offerClubId"]); return { type: c.type, season: integer(c.season, 1, 9999), offerClubId: c.offerClubId === null ? null : text(c.offerClubId) };
  }
  throw new GameError("INVALID_INPUT", 400);
}
export function parseRequest(input: unknown) {
  const x = object(input);
  exactKeys(x, ["requestId", "expectedVersion", "command"]);
  const requestId = text(x.requestId, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new GameError("INVALID_INPUT", 400);
  return { requestId, expectedVersion: integer(x.expectedVersion, 0, Number.MAX_SAFE_INTEGER), command: parseCommand(x.command) };
}
export async function digest(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function sign(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
