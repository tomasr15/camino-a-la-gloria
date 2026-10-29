import { describe, expect, it, vi } from "vitest";
import { buildEnvelope, createReporter, isServerError, parseDsn } from "../supabase/functions/_shared/error-report";
import { createGameHandler, type Store } from "../supabase/functions/_shared/game/handler";
import { GameError } from "../supabase/functions/_shared/game/model";
import { createNarrativeHandler, HttpError } from "../supabase/functions/_shared/narrative/handler";

const dsn = "https://publickey123@o42.ingest.us.sentry.io/77";
const browserId = "0b6f3c1e-8d2a-4f5b-a9c7-3e1d2f4a6b8c";
const okFetch = () => vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 200 }));

describe("Sentry DSN", () => {
  it("builds the envelope endpoint with the public key", () => {
    expect(parseDsn(dsn)?.endpoint).toBe("https://o42.ingest.us.sentry.io/api/77/envelope/?sentry_key=publickey123&sentry_version=7&sentry_client=camino-a-la-gloria%2F1");
  });
  it.each([undefined, "", "not a url", "http://key@o1.ingest.sentry.io/1", "https://o1.ingest.sentry.io/1", "https://key@o1.ingest.sentry.io/abc"])("rejects %j", value => {
    expect(parseDsn(value)).toBeNull();
  });
});

describe("Sentry envelope", () => {
  it("carries only the message, type and tags, grouped by function and status", () => {
    const [header, item, body] = buildEnvelope(dsn, {
      message: "careers respondió 503 STORAGE_UNAVAILABLE", exceptionType: "HttpError",
      tags: { function: "careers", status: 503, requestId: browserId, empty: undefined }
    }, { runtime: "edge", environment: "production", timestamp: 1_761_750_000_000, eventId: "a".repeat(32) }).split("\n").map(line => JSON.parse(line));
    expect(header).toEqual({ event_id: "a".repeat(32), sent_at: new Date(1_761_750_000_000).toISOString(), dsn });
    expect(item).toEqual({ type: "event" });
    expect(body).toMatchObject({
      event_id: "a".repeat(32), level: "error", environment: "production", platform: "javascript",
      exception: { values: [{ type: "HttpError", value: "careers respondió 503 STORAGE_UNAVAILABLE" }] },
      tags: { function: "careers", status: "503", requestId: browserId, runtime: "edge" },
      fingerprint: ["edge", "careers", "503"]
    });
    expect(body.tags).not.toHaveProperty("empty");
  });
  it("bounds long messages", () => {
    const body = JSON.parse(buildEnvelope(dsn, { message: "x".repeat(5000) }, { runtime: "browser", timestamp: 0, eventId: "b".repeat(32) }).split("\n")[2]);
    expect(body.message.formatted).toHaveLength(500);
  });
});

describe("reporter", () => {
  it("does nothing without a DSN", async () => {
    const fetch = okFetch();
    expect(await createReporter({ dsn: "", runtime: "edge", fetch })({ message: "x" })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("posts a simple text/plain request to the ingest endpoint", async () => {
    const fetch = okFetch();
    expect(await createReporter({ dsn, runtime: "browser", fetch })({ message: "boom" })).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(parseDsn(dsn)!.endpoint);
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, keepalive: true });
  });
  it("never throws when Sentry is unreachable", async () => {
    const fetch = vi.fn(async () => { throw new Error("offline"); });
    await expect(createReporter({ dsn, runtime: "edge", fetch })({ message: "boom" })).resolves.toBe(false);
  });
  it("caps the events per minute and per instance", async () => {
    let time = 0;
    const fetch = okFetch();
    const report = createReporter({ dsn, runtime: "edge", fetch, maxPerMinute: 2, now: () => time });
    for (let i = 0; i < 5; i++) await report({ message: "storm" });
    expect(fetch).toHaveBeenCalledTimes(2);
    time = 60_000;
    await report({ message: "next minute" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("treats only 5xx as server errors", () => {
    expect([499, 500, 503, 599, 600].map(isServerError)).toEqual([false, true, true, true, false]);
  });
});

describe("Edge Functions report their 5xx", () => {
  async function loadEdgeReport() {
    (globalThis as Record<string, unknown>).Deno = { env: { get: () => undefined } };
    return import("../supabase/functions/_shared/edge-report");
  }
  it("turns a 5xx into one event tagged with the requestId and ignores the rest", async () => {
    const { reportServerError } = await loadEdgeReport();
    const send = vi.fn();
    reportServerError({ function: "careers", status: 409, requestId: browserId, method: "POST", code: "CAREER_ALREADY_EXISTS" }, send);
    expect(send).not.toHaveBeenCalled();
    reportServerError({ function: "careers", status: 503, requestId: browserId, method: "GET", code: "STORAGE_UNAVAILABLE", cause: new TypeError("fetch failed") }, send);
    expect(send).toHaveBeenCalledWith({
      message: "careers respondió 503 STORAGE_UNAVAILABLE", exceptionType: "TypeError",
      tags: { function: "careers", status: 503, requestId: browserId, method: "GET", code: "STORAGE_UNAVAILABLE" }
    });
  });
  it("game reports storage failures but not expected client errors", async () => {
    const report = vi.fn();
    const failing: Store = { read: vi.fn(async () => { throw new Error("db down"); }), commit: vi.fn() };
    const handler = createGameHandler({ origins: ["https://app.test"], authenticate: async () => failing, report });
    const request = () => new Request("https://api.test/game", { headers: { origin: "https://app.test", authorization: "Bearer ok", "x-request-id": browserId } });
    expect((await handler(request())).status).toBe(503);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ function: "game", status: 503, requestId: browserId, code: "SERVICE_UNAVAILABLE" }));
    report.mockClear();
    failing.read = vi.fn(async () => { throw new GameError("STALE_VERSION"); });
    expect((await handler(request())).status).toBe(409);
    expect(report).not.toHaveBeenCalled();
  });
  it("narrative reports a 503 with its requestId", async () => {
    const report = vi.fn();
    const handler = createNarrativeHandler({ origins: ["https://app.test"], authenticate: async () => { throw new HttpError("SERVICE_NOT_CONFIGURED", 503); }, report });
    const response = await handler(new Request("https://api.test/narrative", { method: "POST", headers: { origin: "https://app.test", authorization: "Bearer ok", "x-request-id": browserId } }));
    expect(response.status).toBe(503);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ function: "narrative", status: 503, requestId: browserId, code: "SERVICE_NOT_CONFIGURED" }));
  });
});
