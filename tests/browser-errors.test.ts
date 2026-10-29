import { afterEach, describe, expect, it, vi } from "vitest";
import { installGlobalErrorCapture, reportError, resetErrorCaptureForTests } from "../src/lib/errors";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetErrorCaptureForTests(); });

function fakeWindow() {
  const listeners: Record<string, (event: unknown) => void> = {};
  return { listeners, target: { addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener; } } as unknown as Pick<Window, "addEventListener"> };
}

describe("browser error capture", () => {
  it("sends uncaught errors and rejections once installed, without the stack", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://publickey123@o42.ingest.us.sentry.io/77");
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { listeners, target } = fakeWindow();
    installGlobalErrorCapture(target);
    installGlobalErrorCapture(target);
    listeners.error({ error: new TypeError("Prueba de Sentry"), message: "Prueba de Sentry" });
    listeners.unhandledrejection({ reason: "rechazo" });
    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = fetch.mock.calls.map(call => JSON.parse(String(call[1].body).split("\n")[2]));
    expect(bodies[0]).toMatchObject({ message: { formatted: "Prueba de Sentry" }, exception: { values: [{ type: "TypeError" }] }, tags: { source: "window.onerror", runtime: "browser" } });
    expect(bodies[1]).toMatchObject({ message: { formatted: "rechazo" }, tags: { source: "unhandledrejection" } });
    expect(JSON.stringify(bodies)).not.toContain("stack");
  });
  it("stays silent without a DSN", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await reportError({ message: "x" })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
