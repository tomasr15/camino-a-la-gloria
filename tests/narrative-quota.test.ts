import { describe, expect, it } from "vitest";
import { formatQuota, summarizeQuota } from "../scripts/narrative-quota.mjs";

// Same shape as report:narrative-usage; pg returns bigint and count(*) as strings.
const report = (config: Record<string, unknown>, days: Record<string, unknown>[] = [], outcomes: Record<string, unknown>[] = []) =>
  ({ generatedAt: "2026-10-29T16:00:00.000Z", quotaTimezone: "UTC", config, days, outcomes });
const on = { enabled: true, daily_limit: 10, minute_limit: 1 };
type QuotaDay = { day: string; remaining: number; usedPct: number | null; status: string };

describe("daily AI quota summary", () => {
  it("slices usage by day against the daily limit", () => {
    const s = summarizeQuota(report(on, [
      { day: "2026-10-29", attempts: 8, reported_tokens: "4128", unknown_usage: 1 },
      { day: "2026-10-28", attempts: 10, reported_tokens: "5160", unknown_usage: 0 },
      { day: "2026-10-27", attempts: 2, reported_tokens: "516", unknown_usage: 0 }
    ]));
    expect(s.days.map((d: QuotaDay) => [d.day, d.remaining, d.usedPct, d.status])).toEqual([
      ["2026-10-29", 2, 80, "alerta"], ["2026-10-28", 0, 100, "corte"], ["2026-10-27", 8, 20, "ok"]
    ]);
    expect(s.days[0].reportedTokens).toBe(4128);
    expect(s.today).toMatchObject({ day: "2026-10-29", attempts: 8, status: "alerta" });
  });
  it("reports today with zero attempts when there is no usage row yet", () => {
    expect(summarizeQuota(report(on)).today).toEqual({ day: "2026-10-29", attempts: 0, limit: 10, remaining: 10, usedPct: 0, reportedTokens: 0, unknownUsage: 0, status: "ok" });
  });
  it("treats a zero limit as a cut and a disabled config as the manual kill switch", () => {
    expect(summarizeQuota(report({ ...on, daily_limit: 0 })).today).toMatchObject({ status: "corte", remaining: 0, usedPct: null });
    expect(summarizeQuota(report({ ...on, enabled: false }, [{ day: "2026-10-29", attempts: 3 }])).today.status).toBe("deshabilitada");
  });
  it("adds up rejections by reason", () => {
    const s = summarizeQuota(report(on, [], [
      { source: "fallback", reason: "quota_exhausted", count: "4" },
      { source: "fallback", reason: "disabled", count: "2" },
      { source: "gemini", reason: null, count: "7" }
    ]));
    expect(s.rejected).toEqual({ quotaExhausted: 4, disabled: 2, notConfigured: 0 });
  });
  it.each([{}, { config: on }, { config: { ...on, daily_limit: -1 }, days: [] }, { config: on, days: [{ day: "x", attempts: "abc" }] }])("rejects a malformed report", input => {
    expect(() => summarizeQuota(input)).toThrow(/INVALID_REPORT/);
  });
  it("prints a readable table with the current state", () => {
    const text = formatQuota(summarizeQuota(report(on, [{ day: "2026-10-29", attempts: 10, reported_tokens: "0", unknown_usage: 0 }])));
    expect(text).toContain("IA habilitada · límite diario 10");
    expect(text).toContain("Hoy (2026-10-29): 10/10 intentos · quedan 0 · corte");
    expect(text).toMatch(/2026-10-29\s+10\s+10\s+0\s+100%/);
  });
});
