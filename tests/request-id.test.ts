import { describe, expect, it, vi } from "vitest";
import { corsHeaders } from "../supabase/functions/_shared/http";
import { requestIdFrom } from "../supabase/functions/_shared/request-id";
import { createGameHandler, type Store } from "../supabase/functions/_shared/game/handler";
import { createNarrativeHandler } from "../supabase/functions/_shared/narrative/handler";

const browserId = "0b6f3c1e-8d2a-4f5b-a9c7-3e1d2f4a6b8c";
const withHeader = (value?: string, init: RequestInit = {}) =>
  new Request("https://api.test/fn", { ...init, headers: { ...(init.headers as Record<string, string>), ...(value === undefined ? {} : { "x-request-id": value }) } });

describe("requestIdFrom", () => {
  it("adopts a canonical UUID from the browser, normalized to lowercase", () => {
    expect(requestIdFrom(withHeader(browserId.toUpperCase()))).toEqual({ requestId: browserId, requestIdSource: "client" });
  });
  it.each(["", "not-a-uuid", `${browserId}, ${browserId}`, `${browserId} extra`, "x".repeat(500)])("generates a server id for %j", value => {
    const result = requestIdFrom(withHeader(value));
    expect(result.requestIdSource).toBe("server");
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.requestId).not.toBe(value);
  });
  it("generates a server id when the header is missing", () => {
    expect(requestIdFrom(withHeader()).requestIdSource).toBe("server");
  });
});

describe("CORS lets the browser send the correlation header", () => {
  it("allows and exposes x-request-id", () => {
    const headers = corsHeaders(new Request("https://api.test", { headers: { origin: "https://app.test" } }), ["https://app.test"])!;
    expect(headers.get("Access-Control-Allow-Headers")).toContain("x-request-id");
    expect(headers.get("Access-Control-Expose-Headers")).toContain("x-request-id");
  });
});

describe("handlers log the browser requestId", () => {
  it("game keeps the trace id apart from the idempotency key", async () => {
    const log = vi.fn();
    const store: Store = { read: vi.fn(async () => ({ version: 0, state: null })), commit: vi.fn() };
    const handler = createGameHandler({ origins: ["https://app.test"], authenticate: async () => store, log, seed: () => "seed" });
    const response = await handler(withHeader(browserId, { headers: { origin: "https://app.test", authorization: "Bearer ok" } }));
    expect(response.headers.get("x-request-id")).toBe(browserId);
    expect((await response.json()).requestId).toBe(browserId);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: browserId, requestIdSource: "client", function: "game" }));
  });
  it("narrative uses the same id in the log, the header and the body", async () => {
    const log = vi.fn();
    const handler = createNarrativeHandler({ origins: ["https://app.test"], authenticate: async () => null, log });
    const response = await handler(withHeader(browserId, { method: "POST", headers: { origin: "https://app.test", authorization: "Bearer bad" } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBe(browserId);
    expect((await response.json()).requestId).toBe(browserId);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ requestId: browserId, requestIdSource: "client", status: 401 }));
  });
});
