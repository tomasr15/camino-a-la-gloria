import { describe, expect, it } from "vitest";
import { parseCareerInput, validateNarrative } from "../supabase/functions/_shared/contracts";
import { corsHeaders } from "../supabase/functions/_shared/http";

describe("career boundary", () => {
  it("normalizes names without excluding accents", () => expect(parseCareerInput({ managerName: "  José Pérez  " })).toEqual({ managerName: "José Pérez" }));
  it.each([null, [], {}, { managerName: "A" }, { managerName: "x".repeat(61) }, { managerName: "Ana\nPerez" }, { managerName: "Ana", user_id: "another-user" }, { managerName: "Ana", reputation: 100 }])("rejects invalid input or ownership/stat injection: %j", value => expect(() => parseCareerInput(value)).toThrow());
});
describe("narrative boundary for CP2", () => {
  it("accepts the expected match and only narrative fields", () => expect(validateNarrative({ title: "Debut", body: "Una nueva etapa.", matchId: "match-1" }, "match-1")).toEqual({ title: "Debut", body: "Una nueva etapa.", matchId: "match-1" }));
  it("rejects an invented result field", () => expect(() => validateNarrative({ title: "Debut", body: "Texto", matchId: "match-1", score: "5-0" }, "match-1")).toThrow());
  it("rejects cross-match context", () => expect(() => validateNarrative({ title: "Debut", body: "Texto", matchId: "match-2" }, "match-1")).toThrow());
});
describe("CORS", () => {
  it("rejects an untrusted browser origin", () => expect(corsHeaders(new Request("https://backend.test", { headers: { origin: "https://evil.test" } }), ["https://app.test"])).toBeNull());
  it("returns the exact allowed origin, not a wildcard", () => expect(corsHeaders(new Request("https://backend.test", { headers: { origin: "https://app.test" } }), ["https://app.test"])?.get("Access-Control-Allow-Origin")).toBe("https://app.test"));
  it("permits server requests without treating CORS as authentication", () => expect(corsHeaders(new Request("https://backend.test"), [])?.get("Access-Control-Allow-Origin")).toBeNull());
});
