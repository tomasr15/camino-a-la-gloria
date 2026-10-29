import { describe, expect, it, vi } from "vitest";
import { invokeFunction, withReference } from "../src/lib/functions";

const browserId = "0b6f3c1e-8d2a-4f5b-a9c7-3e1d2f4a6b8c";

describe("frontend invokeFunction", () => {
  it("sends a fresh x-request-id and returns it with the data", async () => {
    const invoke = vi.fn(async () => ({ data: { status: "ok" }, error: null }));
    const result = await invokeFunction({ functions: { invoke } }, "health", { method: "GET" });
    const sent = (invoke.mock.calls[0] as unknown[])[1] as { method: string; headers: Record<string, string> };
    expect(sent.method).toBe("GET");
    expect(sent.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).toEqual({ data: { status: "ok" }, error: null, requestId: sent.headers["x-request-id"] });
  });
  it("keeps the requestId when the call fails or throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = vi.fn(async () => ({ data: null, error: Object.assign(new Error("boom"), { context: new Response(null, { status: 503 }) }) }));
    const failed = await invokeFunction({ functions: { invoke: failing } }, "careers");
    expect(failed.error).toBeTruthy();
    expect(failed.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(consoleError.mock.calls[0][0]))).toEqual({ event: "function_error", function: "careers", requestId: failed.requestId, status: 503 });
    const thrown = await invokeFunction({ functions: { invoke: vi.fn(async () => { throw new Error("offline"); }) } }, "careers");
    expect(thrown.error).toBeInstanceOf(Error);
    expect(thrown.requestId).toMatch(/^[0-9a-f-]{36}$/);
    consoleError.mockRestore();
  });
  it("adds the reference to user-facing messages only when it exists", () => {
    expect(withReference("No pudimos cargar tu carrera.", browserId)).toBe(`No pudimos cargar tu carrera. Referencia: ${browserId}`);
    expect(withReference("No pudimos cargar tu carrera.", null)).toBe("No pudimos cargar tu carrera.");
  });
});
