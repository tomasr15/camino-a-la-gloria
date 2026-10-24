import { beforeEach, describe, expect, it, vi } from "vitest";

// Ninguno de estos casos llega a la base: el 403 y el 405 cortan antes del cliente de Supabase.
type Handler = (request: Request) => Promise<Response>;
const environment: Record<string, string | undefined> = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key",
  ALLOWED_ORIGINS: "https://app.test"
};
let handler: Handler;
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
    expect(logged()).toEqual([{ requestId: expect.any(String), function: "health", method: "GET", status: 403, durationMs: expect.any(Number) }]);
    expect(response.headers.get("x-request-id")).toBe(logged()[0].requestId);
  });
  it("records the rejected method with 405", async () => {
    const response = await handler(new Request("https://backend.test/health", { method: "POST", headers: { origin: "https://app.test" } }));
    expect(response.status).toBe(405);
    expect(logged()).toEqual([{ requestId: expect.any(String), function: "health", method: "POST", status: 405, durationMs: expect.any(Number) }]);
    expect(response.headers.get("x-request-id")).toBe(logged()[0].requestId);
  });
  it("records the preflight without a body", async () => {
    const response = await handler(new Request("https://backend.test/health", { method: "OPTIONS", headers: { origin: "https://app.test" } }));
    expect(response.status).toBe(204);
    expect(logged()[0]).toMatchObject({ function: "health", method: "OPTIONS", status: 204 });
  });
});
