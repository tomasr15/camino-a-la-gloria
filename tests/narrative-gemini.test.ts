import { describe, expect, it, vi } from "vitest";
import { parseNarrativeContext, buildFallbackNarrative } from "../supabase/functions/_shared/narrative";
import { createGeminiProvider, expectedFacts, validateGeminiNarrative } from "../supabase/functions/_shared/narrative/gemini";
import { generateNarrative, type SavedNarrative, type NarrativeStore } from "../supabase/functions/_shared/narrative/service";

const context = parseNarrativeContext({ version: 1, confirmed: true, matchId: "career/1/match",
  home: { id: "a", name: "Club Local", goals: 2 }, away: { id: "b", name: "Club Visitante", goals: 0 },
  humor: { mode: "fictional", theme: "barra" } });
const scene = "«¡Den dos pases seguidos, la concha de su madre!», gritó uno. «¡Cobran como profesionales y se tropiezan con la raya de cal!»";
const valid = () => ({ ...expectedFacts(context), scene });
const envelope = (value: unknown = valid()) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { totalTokenCount: 123 } });

describe("Gemini factual boundary", () => {
  it("keeps spicy fiction and renders score exclusively from confirmed context", () => {
    const result = validateGeminiNarrative(valid(), context);
    expect(result.body).toContain("Club Local (local) 2 - 0 Club Visitante (visitante)");
    expect(result.body).toContain(scene);
    expect(result.title).toBe(buildFallbackNarrative(context).title);
  });
  it.each([
    { ...valid(), homeGoals: 9 }, { ...valid(), outcome: "away_win" }, { ...valid(), matchId: "other" },
    { ...valid(), injury: "invented" }, { ...valid(), scene: "<script>alert('oops')</script>" },
    ...["El partido terminó tres a cero y la tribuna no lo podía creer.", "El delantero metió dos goles y se fue silbado.",
      "Messi marcó el 3-0 y la barra lo festejó toda la noche.", "Ganaron con un penal en el último minuto.",
      "Club Local compró al árbitro para arreglar todo el encuentro."].map(scene => ({ ...valid(), scene })),
    null, [], { ...valid(), scene: "x".repeat(1001) },
  ])("rejects contradictions, unsupported events and malformed output: %j", value => {
    expect(() => validateGeminiNarrative(value, context)).toThrow();
  });
});

describe("Gemini HTTP adapter", () => {
  it("sends only minimum facts with schema, bounded tokens and secret header", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope()));
    const result = await createGeminiProvider({ apiKey: "test-secret", model: "gemini-test", fetch: fetcher })(context);
    expect(result.tokens).toBe(123);
    expect(result.value).toEqual(valid());
    const [url, init] = fetcher.mock.calls[0];
    expect(url).not.toContain("test-secret");
    expect(init?.headers).toHaveProperty("x-goog-api-key", "test-secret");
    const body = JSON.parse(init!.body as string);
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({ ...expectedFacts(context), theme: "barra" });
    expect(body.generationConfig.maxOutputTokens).toBe(768);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.systemInstruction.parts[0].text).toContain("No suavices las puteadas");
  });
  it.each([429, 500, 403])("does not retry HTTP %s", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("failure", { status }));
    await expect(createGeminiProvider({ apiKey: "k", model: "gemini-test", fetch: fetcher })(context)).rejects.toThrow(status === 429 ? "provider_quota" : "provider_error");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { candidates: [] }, { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "MAX_TOKENS" }] },
    { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not json" }] } }] },
  ])("rejects blocked, empty or invalid provider responses", async value => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(value));
    await expect(createGeminiProvider({ apiKey: "k", model: "gemini-test", fetch: fetcher })(context)).rejects.toThrow();
  });
  it("aborts slow requests", async () => {
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
    });
    await expect(createGeminiProvider({ apiKey: "k", model: "gemini-test", fetch: fetcher, timeoutMs: 10 })(context)).rejects.toThrow("timeout");
  });
  it("bounds the response body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("x".repeat(32769)));
    await expect(createGeminiProvider({ apiKey: "k", model: "gemini-test", fetch: fetcher })(context)).rejects.toThrow("response_too_large");
  });
});

describe("reservation and fallback orchestration", () => {
  function store(reason = "pending", ticket: string | null = "ticket"): NarrativeStore {
    return {
      reserve: vi.fn(async fallback => ({ entry: { ...fallback, reason }, ticket })),
      finish: vi.fn(async () => {}),
    };
  }
  it("persists accepted output and usage", async () => {
    const storage = store();
    const output = await generateNarrative(context, storage, async () => ({ value: valid(), tokens: 123 }));
    expect(output.source).toBe("gemini");
    expect(storage.finish).toHaveBeenCalledWith("ticket", output, 123);
  });
  it("retains consumed tokens when facts are rejected", async () => {
    const storage = store();
    const output = await generateNarrative(context, storage, async () => ({ value: { ...valid(), awayGoals: 9 }, tokens: 123 }));
    expect(output.reason).toBe("fact_mismatch");
    expect(output.narrative).toEqual(buildFallbackNarrative(context));
    expect(storage.finish).toHaveBeenCalledWith("ticket", output, 123);
  });
  it.each(["quota_exhausted", "pending", "disabled"])("never calls provider without a ticket (%s)", async reason => {
    const provider = vi.fn(); const storage = store(reason, null);
    expect((await generateNarrative(context, storage, provider)).reason).toBe(reason);
    expect(provider).not.toHaveBeenCalled();
  });
  it("fails closed when reservation storage fails", async () => {
    const storage = store(); storage.reserve = vi.fn().mockRejectedValue(new Error("offline"));
    const provider = vi.fn();
    expect((await generateNarrative(context, storage, provider)).reason).toBe("storage_unavailable");
    expect(provider).not.toHaveBeenCalled();
  });
  it("falls back when the provider throws and records unknown usage", async () => {
    const storage = store(); const provider = vi.fn().mockRejectedValue(new Error("offline"));
    const output = await generateNarrative(context, storage, provider);
    expect(output.source).toBe("fallback");
    expect(storage.finish).toHaveBeenCalledWith("ticket", output, null);
  });
  it("returns the saved fallback if final persistence fails", async () => {
    const storage = store(); storage.finish = vi.fn().mockRejectedValue(new Error("offline"));
    const output = await generateNarrative(context, storage, async () => ({ value: valid(), tokens: 123 }));
    expect(output.narrative).toEqual(buildFallbackNarrative(context));
    expect(output.reason).toBe("storage_unavailable");
  });
  it("does not spend quota when not configured", async () => {
    const storage = store("not_configured", null);
    await generateNarrative(context, storage);
    expect(storage.reserve).toHaveBeenCalledWith(expect.anything(), false);
  });
  it("reuses an existing saved narrative", async () => {
    const entry: SavedNarrative = { narrative: validateGeminiNarrative(valid(), context), source: "gemini", reason: null };
    const storage = store(); storage.reserve = vi.fn(async () => ({ entry, ticket: null }));
    const provider = vi.fn();
    expect(await generateNarrative(context, storage, provider)).toEqual(entry);
    expect(provider).not.toHaveBeenCalled();
  });
});
