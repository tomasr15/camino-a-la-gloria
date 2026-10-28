import { corsHeaders } from "../http.ts";
import { HUMOR_THEMES, parseNarrativeContext, type NarrativeContext } from "../narrative.ts";
import { generateNarrative, type NarrativeStore, type SavedNarrative } from "./service.ts";

export interface MatchRequest { season: number; fixtureId: string }
export interface Session {
  read(input: MatchRequest): Promise<{ context: NarrativeContext; entry: SavedNarrative | null }>;
  store(input: MatchRequest): NarrativeStore;
}
export class HttpError extends Error { constructor(message: string, public status: number) { super(message); } }
export function contextFromResult(matchId: string, result: { home: string; away: string; homeGoals: number; awayGoals: number }, name: (id: string) => string): NarrativeContext {
  // Stable theme, chosen on the server. Browser cannot reroll or inject a prompt.
  const hash = Array.from(matchId).reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 0);
  return parseNarrativeContext({ version: 1, confirmed: true, matchId,
    home: { id: result.home, name: name(result.home), goals: result.homeGoals },
    away: { id: result.away, name: name(result.away), goals: result.awayGoals },
    humor: { mode: "fictional", theme: HUMOR_THEMES[hash % HUMOR_THEMES.length] } });
}
export function createNarrativeHandler(deps: {
  origins: string[]; authenticate: (token: string) => Promise<Session | null>;
  provider?: (context: NarrativeContext) => Promise<{ value: unknown; tokens: number | null }>;
  log?: (entry: Record<string, unknown>) => void;
}) {
  return async (request: Request) => {
    const requestId = crypto.randomUUID(), start = performance.now();
    const headers = corsHeaders(request, deps.origins);
    function respond(status: number, body: Record<string, unknown>) {
      const h = headers ?? new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
      h.set("x-request-id", requestId);
      deps.log?.({ requestId, function: "narrative", status, durationMs: Math.round(performance.now() - start),
        source: body.source, reason: body.reason });
      return new Response(status === 204 ? null : JSON.stringify({ ...body, requestId }), { status, headers: h });
    }
    if (!headers) return respond(403, { error: "ORIGIN_NOT_ALLOWED" });
    if (request.method === "OPTIONS") return respond(204, {});
    if (request.method !== "POST") return respond(405, { error: "METHOD_NOT_ALLOWED" });
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) return respond(401, { error: "UNAUTHORIZED" });
    try {
      const session = await deps.authenticate(authorization.replace(/^Bearer\s+/i, ""));
      if (!session) return respond(401, { error: "UNAUTHORIZED" });
      if (!request.headers.get("content-type")?.includes("application/json")) return respond(415, { error: "JSON_REQUIRED" });
      const reader = request.body?.getReader();
      if (!reader) return respond(400, { error: "INVALID_INPUT" });
      const chunks: Uint8Array[] = []; let length = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 1024) { await reader.cancel(); return respond(413, { error: "BODY_TOO_LARGE" }); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let input;
      try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return respond(400, { error: "INVALID_INPUT" }); }
      if (!input || typeof input !== "object" || Object.keys(input).sort().join(",") !== "fixtureId,season" ||
          !Number.isSafeInteger(input.season) || input.season < 1 || input.season > 10000 ||
          typeof input.fixtureId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.fixtureId)) return respond(400, { error: "INVALID_INPUT" });
      const { context, entry } = await session.read(input);
      return respond(200, { ...(entry ?? await generateNarrative(context, session.store(input), deps.provider)) });
    } catch (error) {
      return respond(error instanceof HttpError ? error.status : 503, { error: error instanceof HttpError ? error.message : "SERVICE_UNAVAILABLE" });
    }
  };
}
