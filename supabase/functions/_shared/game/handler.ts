import { corsHeaders } from "../http.ts";
import { requestIdFrom } from "../request-id.ts";
import type { ServerErrorInput } from "../edge-report.ts";
import { clubs, dataset } from "./data.ts";
import { initialize, publicView, transition } from "./engine.ts";
import { digest, parseRequest } from "./contracts.ts";
import { GameError } from "./model.ts";
import type { Command, GameState } from "./model.ts";
export type View = ReturnType<typeof publicView>;
export interface Receipt { version: number; view: View }
export interface Store {
  read(requestId?: string, commandHash?: string): Promise<{ version: number; state: GameState | null; receipt?: Receipt | null }>;
  commit(input: { requestId: string; commandHash: string; expectedVersion: number; command: Command; state: GameState; view: View }): Promise<Receipt>;
}
export function createGameHandler(deps: {
  origins: string[];
  authenticate: (token: string) => Promise<Store | null>;
  seed?: () => string;
  log?: (entry: Record<string, unknown>) => void;
  report?: (input: ServerErrorInput) => void;
}) {
  return async (request: Request): Promise<Response> => {
    // Trace id from the x-request-id header; unrelated to parsed.requestId, the idempotency key in the body.
    const started = performance.now(), { requestId, requestIdSource } = requestIdFrom(request);
    const headers = corsHeaders(request, deps.origins);
    function respond(status: number, body: unknown, cause?: unknown) {
      const responseHeaders = headers ?? new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
      responseHeaders.set("x-request-id", requestId);
      deps.log?.({ requestId, requestIdSource, function: "game", method: request.method, status, durationMs: Math.round(performance.now() - started) });
      if (status >= 500) deps.report?.({ function: "game", status, requestId, method: request.method, code: (body as { error?: unknown } | null)?.error, cause });
      return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: responseHeaders });
    }
    if (!headers) return respond(403, { error: "ORIGIN_NOT_ALLOWED", requestId });
    if (request.method === "OPTIONS") return respond(204, null);
    if (!["GET", "POST"].includes(request.method)) return respond(405, { error: "METHOD_NOT_ALLOWED", requestId });
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) return respond(401, { error: "UNAUTHORIZED", requestId });
    try {
      const store = await deps.authenticate(authorization.replace(/^Bearer\s+/i, ""));
      if (!store) return respond(401, { error: "UNAUTHORIZED", requestId });
      if (request.method === "GET") {
        const snapshot = await store.read();
        return respond(200, { version: snapshot.version, game: snapshot.state ? publicView(snapshot.state) : null, clubs, isSynthetic: dataset.isSynthetic, requestId });
      }
      if (!request.headers.get("content-type")?.includes("application/json")) return respond(415, { error: "JSON_REQUIRED", requestId });
      const reader = request.body?.getReader();
      if (!reader) throw new GameError("INVALID_INPUT", 400);
      const chunks: Uint8Array[] = []; let count = 0;
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        count += value.byteLength;
        if (count > 8192) { await reader.cancel(); return respond(413, { error: "BODY_TOO_LARGE", requestId }); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(count); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new GameError("INVALID_INPUT", 400); }
      const parsed = parseRequest(body);
      const commandHash = await digest(JSON.stringify({ expectedVersion: parsed.expectedVersion, command: parsed.command }));
      const snapshot = await store.read(parsed.requestId, commandHash);
      if (snapshot.receipt) return respond(200, { version: snapshot.receipt.version, game: snapshot.receipt.view, replayed: true, requestId });
      if (snapshot.version !== parsed.expectedVersion) throw new GameError("STALE_VERSION");
      let state: GameState;
      if (parsed.command.type === "initialize") {
        if (snapshot.state) throw new GameError("GAME_ALREADY_INITIALIZED");
        state = initialize(parsed.command.clubId, (deps.seed ?? (() => crypto.randomUUID()))());
      } else {
        if (!snapshot.state) throw new GameError("GAME_NOT_INITIALIZED");
        state = transition(snapshot.state, parsed.command);
      }
      const result = await store.commit({ ...parsed, commandHash, state, view: publicView(state) });
      return respond(200, { version: result.version, game: result.view, requestId });
    } catch (error) {
      return respond(error instanceof GameError ? error.status : 503, { error: error instanceof GameError ? error.code : "SERVICE_UNAVAILABLE", requestId }, error);
    }
  };
}
