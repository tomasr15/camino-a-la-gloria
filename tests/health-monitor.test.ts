import { describe, expect, it, vi } from "vitest";
import { alertEvent, checkHealth } from "../scripts/health-monitor.mjs";

const url = "https://project.supabase.co/functions/v1/health";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const noSleep = vi.fn(async () => undefined);

describe("health monitor", () => {
  it("is healthy on the first ok answer and sends a requestId", async () => {
    const fetch = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => json(200, { status: "ok" }));
    const outcome = await checkHealth({ url, fetch, sleep: noSleep });
    expect(outcome.healthy).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0][1]?.headers as Record<string, string>)["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("tolerates a transient failure before alerting", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json(503, { status: "unavailable" }))
      .mockResolvedValueOnce(json(200, { status: "ok" }));
    const outcome = await checkHealth({ url, fetch, sleep: noSleep });
    expect(outcome.healthy).toBe(true);
    expect(outcome.results.map(r => r.status)).toEqual([503, 200]);
  });
  it("fails only after every attempt failed, including timeouts and wrong bodies", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetch = vi.fn()
      .mockResolvedValueOnce(json(503, { status: "unavailable" }))
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { name: "TimeoutError" }))
      .mockResolvedValueOnce(json(200, { status: "degraded" }));
    const outcome = await checkHealth({ url, fetch, sleep, attempts: 3, delayMs: 20_000 });
    expect(outcome.healthy).toBe(false);
    expect(outcome.results.map(r => [r.status, r.error ?? null])).toEqual([[503, null], [null, "TimeoutError"], [200, null]]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(20_000);
  });
  it("builds one Sentry event for the alert rule, tagged check=health-monitor", async () => {
    const fetch = vi.fn(async () => json(503, { status: "unavailable" }));
    const outcome = await checkHealth({ url, fetch, sleep: noSleep });
    expect(alertEvent(url, outcome)).toEqual({
      message: "health no responde: 3 intentos fallidos (último: 503)",
      exceptionType: "HealthCheckFailed",
      tags: { function: "health", check: "health-monitor", status: 503, requestId: outcome.results[2].requestId, host: "project.supabase.co" }
    });
  });
});
