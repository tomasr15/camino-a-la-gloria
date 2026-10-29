import { beforeEach, describe, expect, it, vi } from "vitest";

// Ninguno de estos casos llega a la base: el 403 y el 405 cortan antes del cliente de Supabase.
type Handler = (request: Request) => Promise<Response>;
const environment: Record<string, string | undefined> = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key",
  ALLOWED_ORIGINS: "https://app.test"
};
let handler: Handler;
const browserId = "6f1c2b9e-4a7d-4c3e-9b8a-1d2e3f4a5b6c";
let lines: string[];

async function loadHandler() {
  lines = [];
  vi.spyOn(console, "log").mockImplementation(line => void lines.push(String(line)));
  (globalThis as Record<string, unknown>).Deno = {
    env: { get: (key: string) => environment[key] },
    serve: (registered: Handler) => { handler = registered; return { finished: Promise.resolve() }; }
  };
  vi.resetModules();
  await import("../supabase/functions/health/index");
  return handler!;
}
function logged() {
  return lines.map(line => JSON.parse(line) as Record<string, unknown>);
}

beforeEach(async () => { await loadHandler(); });

describe("health rejections leave a log entry", () => {
  it("records the rejected origin with 403", async () => {
    const response = await handler(new Request("https://backend.test/health", { headers: { origin: "https://evil.test" } }));
    expect(response.status).toBe(403);
    expect(logged()).toEqual([{ requestId: expect.any(String), requestIdSource: "server", function: "health", method: "GET", status: 403, durationMs: expect.any(Number) }]);
    expect(response.headers.get("x-request-id")).toBe(logged()[0].requestId);
  });
  it("records the rejected method with 405", async () => {
    const response = await handler(new Request("https://backend.test/health", { method: "POST", headers: { origin: "https://app.test" } }));
    expect(response.status).toBe(405);
    expect(logged()).toEqual([{ requestId: expect.any(String), requestIdSource: "server", function: "health", method: "POST", status: 405, durationMs: expect.any(Number) }]);
    expect(response.headers.get("x-request-id")).toBe(logged()[0].requestId);
  });
  it("records the preflight without a body", async () => {
    const response = await handler(new Request("https://backend.test/health", { method: "OPTIONS", headers: { origin: "https://app.test" } }));
    expect(response.status).toBe(204);
    expect(logged()[0]).toMatchObject({ function: "health", method: "OPTIONS", status: 204 });
  });
});

describe("health correlates the browser requestId", () => {
  it("reuses a valid x-request-id in the log, the header and the body", async () => {
    const response = await handler(new Request("https://backend.test/health", { method: "POST", headers: { origin: "https://app.test", "x-request-id": browserId.toUpperCase() } }));
    expect(response.status).toBe(405);
    expect(logged()).toEqual([{ requestId: browserId, requestIdSource: "client", function: "health", method: "POST", status: 405, durationMs: expect.any(Number) }]);
    expect(response.headers.get("x-request-id")).toBe(browserId);
    expect((await response.json()).requestId).toBe(browserId);
  });
  it("replaces a malformed x-request-id instead of logging it", async () => {
    const response = await handler(new Request("https://backend.test/health", { method: "POST", headers: { origin: "https://app.test", "x-request-id": "evil\",\"status\":200" } }));
    expect(logged()[0]).toMatchObject({ requestIdSource: "server", status: 405 });
    expect(logged()[0].requestId).not.toContain("evil");
    expect(response.headers.get("x-request-id")).toBe(logged()[0].requestId);
  });
});

describe("health sends its errors to Sentry", () => {
  const sentryDsn = "https://publickey123@o42.ingest.us.sentry.io/77";
  function sentryBodies(fetch: ReturnType<typeof vi.fn>) {
    return fetch.mock.calls.filter(call => String(call[0]).includes("ingest.us.sentry.io"))
      .map(call => JSON.parse(String((call[1] as RequestInit).body).split("\n")[2]));
  }
  async function withSentry(extra: Record<string, string>, run: (fetch: ReturnType<typeof vi.fn>) => Promise<void>) {
    Object.assign(environment, { SENTRY_DSN: sentryDsn, ...extra });
    // Database probe fails; Sentry accepts the event.
    const fetch = vi.fn(async (input: unknown) => String(input).includes("sentry.io") ? new Response(null, { status: 200 }) : new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    try { await loadHandler(); await run(fetch); }
    finally { vi.unstubAllGlobals(); delete environment.SENTRY_DSN; delete environment.SENTRY_TEST_EVENTS; }
  }
  it("reports a 503 with the browser requestId", async () => {
    await withSentry({}, async fetch => {
      const response = await handler(new Request("https://backend.test/health", { headers: { origin: "https://app.test", "x-request-id": browserId } }));
      expect(response.status).toBe(503);
      expect(sentryBodies(fetch)).toEqual([expect.objectContaining({
        message: { formatted: "health respondió 503 HEALTH_UNAVAILABLE" },
        tags: expect.objectContaining({ function: "health", status: "503", requestId: browserId, runtime: "edge" })
      })]);
    });
  });
  it("sends the test event only when it is enabled on purpose", async () => {
    await withSentry({}, async fetch => {
      await handler(new Request("https://backend.test/health?sentry-test=1", { method: "POST", headers: { origin: "https://app.test" } }));
      expect(sentryBodies(fetch)).toEqual([]);
    });
    await withSentry({ SENTRY_TEST_EVENTS: "true" }, async fetch => {
      await handler(new Request("https://backend.test/health?sentry-test=1", { headers: { origin: "https://app.test", "x-request-id": browserId } }));
      expect(sentryBodies(fetch)[0]).toMatchObject({ message: { formatted: "Evento de prueba desde la Edge Function health" }, tags: { test: "true", requestId: browserId } });
    });
  });
});
