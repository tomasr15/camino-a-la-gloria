import { DATASET_CODE, ENGINE_VERSION, GameError, clamp } from "./model.ts";
import type { Command, GameState, Match, Result, Shot } from "./model.ts";
import { clubs, cpuSelection, dataset, getClub, lineupPlayers } from "./data.ts";
import { confidence, offers, reputationDelta, schedule, seasonBonus, table } from "./competition.ts";
import { random } from "./random.ts";
import { resolve, resolveAutomatically, simulateMatch } from "./simulation.ts";

function assertSupportedVersion(state: GameState): void {
  if (state.engineVersion !== ENGINE_VERSION || state.datasetCode !== DATASET_CODE) throw new GameError("UNSUPPORTED_GAME_VERSION");
}

export function initialize(clubId: string, seed: string): GameState {
  if (getClub(clubId).tier !== "low") throw new GameError("INITIAL_CLUB_MUST_BE_LOW", 400);
  return { engineVersion: ENGINE_VERSION, datasetCode: DATASET_CODE, seed, season: 1, round: 1, clubId, reputation: 20, phase: "ready", results: [], offers: [], history: [], pending: null };
}
export function nextShot(state: GameState): Shot | undefined {
  return state.pending?.flatMap(m => m.shots).find(s => s.controlled && !s.resolved);
}
function finishRound(state: GameState): void {
  if (!state.pending || nextShot(state)) return;
  const results: Result[] = state.pending.map(m => ({
    id: m.id, round: m.round, home: m.home, away: m.away,
    homeGoals: m.shots.filter(s => s.clubId === m.home && s.goal).length,
    awayGoals: m.shots.filter(s => s.clubId === m.away && s.goal).length
  }));
  if (results.some(r => state.results.some(old => old.id === r.id))) throw new GameError("ROUND_ALREADY_COMMITTED");
  state.results.push(...results);
  // Keep the user's finished match: pending is cleared below and the client
  // still needs its final score and events.
  state.lastMatch = state.pending.find(m => m.home === state.clubId || m.away === state.clubId)!;
  const own = results.find(r => r.home === state.clubId || r.away === state.clubId)!;
  state.reputation = clamp(state.reputation + reputationDelta(state.clubId, own), 0, 100);
  state.round++; state.pending = null; state.phase = state.round === 15 ? "finished" : "ready";
  if (state.phase === "finished") {
    const standings = table(state.results, state.seed, state.season);
    state.reputation = clamp(state.reputation + seasonBonus(state.clubId, standings.find(r => r.clubId === state.clubId)!.rank), 0, 100);
    state.offers = offers(state.clubId, state.reputation, standings, state.seed, state.season);
  }
}
export function transition(previous: GameState, command: Exclude<Command, { type: "initialize" }>): GameState {
  assertSupportedVersion(previous);
  if (command.season !== previous.season) throw new GameError("STALE_SEASON");
  const state = structuredClone(previous);
  if (command.type === "nextSeason") {
    if (state.phase !== "finished") throw new GameError("SEASON_NOT_FINISHED");
    if (command.offerClubId !== null && !state.offers.includes(command.offerClubId)) throw new GameError("INVALID_OFFER", 400);
    state.history.push({ season: state.season, clubId: state.clubId, reputation: state.reputation, results: state.results, table: table(state.results, state.seed, state.season) });
    state.clubId = command.offerClubId ?? state.clubId;
    state.season++; state.round = 1; state.results = []; state.offers = []; state.pending = null; state.lastMatch = null; state.phase = "ready";
    return state;
  }
  if (command.round !== state.round) throw new GameError("STALE_ROUND");
  if (command.type === "start") {
    if (state.phase !== "ready") throw new GameError("ROUND_NOT_READY");
    const user = getClub(state.clubId);
    lineupPlayers(user, command.formation, command.lineup);
    state.pending = schedule(state.seed, state.season).filter(f => f.round === state.round).map(f => {
      const home = getClub(f.home), away = getClub(f.away);
      const homeSelection = home.id === state.clubId ? { formation: command.formation, tactic: command.tactic, lineup: command.lineup } : cpuSelection(home, away, random(state.seed + ":" + f.id + ":home-selection"));
      const awaySelection = away.id === state.clubId ? { formation: command.formation, tactic: command.tactic, lineup: command.lineup } : cpuSelection(away, home, random(state.seed + ":" + f.id + ":away-selection"));
      return simulateMatch(f, home, away, homeSelection, awaySelection, confidence(home.id, state.results), confidence(away.id, state.results), state.seed, state.clubId);
    });
    state.phase = "playing";
  } else {
    if (state.phase !== "playing") throw new GameError("NO_PENDING_ROUND");
    if (command.type === "auto") {
      for (const match of state.pending!) for (const shot of match.shots) if (!shot.resolved) resolveAutomatically(shot);
    } else {
      const shot = nextShot(state);
      if (!shot || command.eventId !== shot.id) throw new GameError("STALE_EVENT");
      if (!["left", "center", "right"].includes(command.direction) || !Number.isFinite(command.precision) || command.precision < 0 || command.precision > 100) throw new GameError("INVALID_SHOT", 400);
      resolve(shot, command.direction, command.precision);
    }
  }
  finishRound(state);
  return state;
}
function projectMatch(match: Match, visible: Shot[], pendingShot?: Shot) {
  return {
    id: match.id, round: match.round, home: match.home, away: match.away,
    homeSelection: match.homeSelection, awaySelection: match.awaySelection,
    homeGoals: visible.filter(s => s.clubId === match.home && s.goal).length,
    awayGoals: visible.filter(s => s.clubId === match.away && s.goal).length,
    events: visible.map(s => ({ id: s.id, minute: s.minute, clubId: s.clubId, playerId: s.playerId, goal: s.goal })),
    pendingEvent: pendingShot ? { id: pendingShot.id, minute: pendingShot.minute, clubId: pendingShot.clubId, playerId: pendingShot.playerId } : null
  };
}
// Explicit public projection: never return root seed, keeper decision, future
// events, probability roll or automatic execution to a browser.
export function publicView(state: GameState) {
  assertSupportedVersion(state);
  const pendingShot = nextShot(state);
  const match = state.pending?.find(m => m.home === state.clubId || m.away === state.clubId);
  const visible = match?.shots.filter(s => s.resolved && (!pendingShot || match.shots.indexOf(s) < match.shots.indexOf(pendingShot))) ?? [];
  const last = state.lastMatch;
  const standings = table(state.results, state.seed, state.season);
  return {
    engineVersion: state.engineVersion, datasetCode: state.datasetCode, isSynthetic: dataset.isSynthetic,
    season: state.season, round: state.round, phase: state.phase, clubId: state.clubId, reputation: state.reputation,
    confidence: Object.fromEntries(clubs.map(c => [c.id, confidence(c.id, state.results)])),
    calendar: schedule(state.seed, state.season), results: state.results, table: standings,
    tieBreakOrder: table([], state.seed, state.season).map(r => r.clubId),
    offers: state.offers, history: state.history,
    match: match ? projectMatch(match, visible, pendingShot) : null,
    // Finished user match, fully resolved, so every shot is visible.
    lastMatch: last ? projectMatch(last, last.shots) : null
  };
}
