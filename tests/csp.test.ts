import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function policy(url: string | undefined, mode: "production" | "development" = "production", sentryDsn?: string) {
  vi.stubEnv("NODE_ENV", mode);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", sentryDsn);
  vi.resetModules();
  const { default: config } = await import("../next.config");
  const rules = await config.headers!();
  const csp = rules[0].headers.find(header => header.key === "Content-Security-Policy")!.value;
  return { directives: csp.split("; "), connections: csp.split("; ").find(value => value.startsWith("connect-src "))!.split(" ").slice(1) };
}

describe("browser connections in the production build", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321"])("allows the configured local backend %s without upgrading it", async url => {
    const { directives, connections } = await policy(url);
    expect(connections).toEqual(["'self'", url, url.replace("http:", "ws:")]);
    expect(directives).not.toContain("upgrade-insecure-requests");
    expect(directives).toContain("script-src 'self' 'unsafe-inline'");
  });

  it.each(["https://project.supabase.co", "https://backend.example.com"])("keeps HTTPS protection for %s", async url => {
    const { directives, connections } = await policy(url);
    expect(connections).toEqual(["'self'", url, url.replace("https:", "wss:")]);
    expect(directives).toContain("upgrade-insecure-requests");
  });

  it("works without backend configuration", async () => {
    const { directives, connections } = await policy(undefined);
    expect(connections).toEqual(["'self'"]);
    expect(directives).toContain("upgrade-insecure-requests");
  });

  it("preserves development hot reload", async () => {
    const { directives, connections } = await policy("http://127.0.0.1:54321", "development");
    expect(connections).toContain("ws:");
    expect(directives).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(directives).not.toContain("upgrade-insecure-requests");
  });

  it("allows the Sentry ingest host when error capture is configured", async () => {
    const { connections } = await policy("https://project.supabase.co", "production", "https://key123@o42.ingest.us.sentry.io/77");
    expect(connections).toEqual(["'self'", "https://project.supabase.co", "wss://project.supabase.co", "https://o42.ingest.us.sentry.io"]);
  });

  it("ignores a malformed Sentry DSN", async () => {
    const { connections } = await policy(undefined, "production", "not a dsn");
    expect(connections).toEqual(["'self'"]);
  });
});
