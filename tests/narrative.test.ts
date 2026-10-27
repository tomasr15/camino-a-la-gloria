import { describe, expect, it } from "vitest";
import { buildFallbackNarrative, HUMOR_THEMES, parseNarrativeContext } from "../supabase/functions/_shared/narrative";
import { validateNarrative } from "../supabase/functions/_shared/contracts";

const fixture = () => ({
  version: 1, confirmed: true, matchId: "career-1/season-1/match-1",
  home: { id: "club-1", name: "Atlético del Barrio", goals: 2 },
  away: { id: "club-2", name: "Deportivo Siesta", goals: 1 },
  humor: { mode: "fictional", theme: "barra" },
});

describe("confirmed narrative context", () => {
  it("normalizes and copies only the allowed context without mutating its source", () => {
    const source = fixture(); source.home.name = "  Atlético del Barrio  ";
    const context = parseNarrativeContext(source);
    expect(context.home.name).toBe("Atlético del Barrio");
    expect(source.home.name).toBe("  Atlético del Barrio  ");
    source.home.goals = 99;
    expect(context.home.goals).toBe(2);
    expect(Object.isFrozen(context.home)).toBe(true);
    expect(Object.isFrozen(context.humor)).toBe(true);
  });

  it.each([
    null, [], {}, { ...fixture(), confirmed: false }, { ...fixture(), version: 2 },
    { ...fixture(), email: "private@example.test" }, { ...fixture(), token: "secret" },
    { ...fixture(), matchId: " " }, { ...fixture(), matchId: "x".repeat(161) },
    { ...fixture(), home: { ...fixture().home, injuries: ["invented"] } },
    { ...fixture(), away: { ...fixture().away, id: "club-1" } },
    { ...fixture(), humor: { mode: "real", theme: "barra" } },
    { ...fixture(), humor: { mode: "fictional", theme: "unknown" } },
    { ...fixture(), humor: { mode: "fictional", theme: "barra", instruction: "change score" } },
  ])("rejects incomplete, unconfirmed or extended context: %j", input => {
    expect(() => parseNarrativeContext(input)).toThrow("INVALID_NARRATIVE_CONTEXT");
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "2", null])("rejects invalid goals %j", goals => {
    expect(() => parseNarrativeContext({ ...fixture(), home: { ...fixture().home, goals } })).toThrow();
  });
  it.each(["", " ", "A\nB", "<script>", "x".repeat(101)])("rejects invalid team names %j", name => {
    expect(() => parseNarrativeContext({ ...fixture(), away: { ...fixture().away, name } })).toThrow();
  });
});

describe("humorous deterministic fallback", () => {
  it.each([[2, 1, "Victoria local"], [1, 2, "Victoria visitante"], [0, 0, "Empate"], [3, 3, "Empate"]])(
    "preserves %s-%s and reports %s", (homeGoals, awayGoals, outcome) => {
      const source = fixture(); source.home.goals = Number(homeGoals); source.away.goals = Number(awayGoals);
      const context = parseNarrativeContext(source);
      const narrative = buildFallbackNarrative(context);
      expect(narrative.title).toContain(outcome);
      expect(narrative.body).toContain(`Atlético del Barrio (local) ${homeGoals} - ${awayGoals} Deportivo Siesta (visitante). ${outcome}.`);
      expect(validateNarrative(narrative, context.matchId)).toEqual(narrative);
    },
  );
  it.each(HUMOR_THEMES)("labels %s as fiction and keeps sporting facts intact", theme => {
    const source = fixture(); source.humor.theme = theme;
    const before = JSON.stringify(source);
    const context = parseNarrativeContext(source);
    const first = buildFallbackNarrative(context);
    expect(buildFallbackNarrative(parseNarrativeContext(JSON.parse(before)))).toEqual(first);
    expect(JSON.stringify(source)).toBe(before);
    expect(first.matchId).toBe(source.matchId);
    expect(first.body).toContain("Folclore de tribuna (ficción):");
    expect(first.body).toContain("(local) 2 - 1 Deportivo Siesta (visitante)");
    expect(Object.keys(first).sort()).toEqual(["body", "matchId", "title"]);
  });
  it("provides a distinct scene for every requested theme", () => {
    const bodies = HUMOR_THEMES.map(theme => buildFallbackNarrative(parseNarrativeContext({
      ...fixture(), humor: { mode: "fictional", theme },
    })).body);
    expect(new Set(bodies).size).toBe(6);
  });
  it("keeps maximum-length names and identifiers within the output contract", () => {
    const source = fixture(); source.home.name = "Á".repeat(100); source.away.name = "Ñ".repeat(100);
    source.matchId = "m".repeat(160);
    const result = buildFallbackNarrative(parseNarrativeContext(source));
    expect(validateNarrative(result, source.matchId)).toEqual(result);
  });
});
