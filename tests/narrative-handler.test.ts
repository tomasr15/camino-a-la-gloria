import { describe, expect, it, vi } from "vitest";
import { contextFromResult, createNarrativeHandler, HttpError, type Session } from "../supabase/functions/_shared/narrative/handler";

const context = contextFromResult("career/1/match", { home: "a", away: "b", homeGoals: 0, awayGoals: 0 }, id => `Club ${id}`);
const request = (body: unknown = { season: 1, fixtureId: "s1-r1-m0" }, headers: Record<string, string> = {}) => new Request("https://local/narrative", {
  method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});
function setup() {
  const reserve = vi.fn(async fallback => ({ entry: fallback, ticket: null }));
  const session: Session = { read: vi.fn(async () => ({ context, entry: null })), store: () => ({ reserve, finish: vi.fn() }) };
  const authenticate = vi.fn(async () => session);
  const log = vi.fn();
  return { session, reserve, authenticate, log, handler: createNarrativeHandler({ origins: ["https://allowed"], authenticate, log }) };
}
describe("narrative handler", () => {
  it("loads authorized results and returns a usable fallback without configuration", async () => {
    const { handler, session, log } = setup(); const response = await handler(request()); const body = await response.json();
    expect(response.status).toBe(200); expect(body.source).toBe("fallback");
    expect(session.read).toHaveBeenCalledWith({ season: 1, fixtureId: "s1-r1-m0" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Bearer test");
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });
  it.each([{ season: 1, fixtureId: "s1", homeGoals: 9 }, { season: 0, fixtureId: "s1" }, { season: 1, fixtureId: "../other" }, null])("rejects forged context before storage", async input => {
    const { handler, session } = setup(); expect((await handler(request(input))).status).toBe(400);
    expect(session.read).not.toHaveBeenCalled();
  });
  it("denies missing authentication", async () => {
    const { handler, authenticate } = setup(); expect((await handler(request(undefined, { authorization: "" }))).status).toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
  });
  it("does not disclose another user's result", async () => {
    const { handler, session, reserve } = setup(); session.read = vi.fn().mockRejectedValue(new HttpError("RESULT_NOT_FOUND", 404));
    expect((await handler(request())).status).toBe(404); expect(reserve).not.toHaveBeenCalled();
  });
  it("bounds request bytes", async () => {
    const { handler, session } = setup(); expect((await handler(request({ padding: "x".repeat(1025) }))).status).toBe(413);
    expect(session.read).not.toHaveBeenCalled();
  });
  it("enforces origin and method", async () => {
    const { handler } = setup();
    expect((await handler(request(undefined, { origin: "https://evil" }))).status).toBe(403);
    expect((await handler(new Request("https://local/narrative"))).status).toBe(405);
  });
});
