import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { corsHeaders } from "../_shared/http.ts";
import { requestIdFrom } from "../_shared/request-id.ts";
import { reportInBackground, reportServerError } from "../_shared/edge-report.ts";

Deno.serve(async (request: Request) => {
  const started = performance.now();
  const { requestId, requestIdSource } = requestIdFrom(request);
  const headers = corsHeaders(request, (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map(x => x.trim()).filter(Boolean));
  // Every exit goes through respond so 403, 405 and 5xx also leave a JSON log entry.
  function respond(status: number, body: unknown) {
    console.log(JSON.stringify({ requestId, requestIdSource, function: "health", method: request.method, status, durationMs: Math.round(performance.now() - started) }));
    reportServerError({ function: "health", status, requestId, method: request.method, code: status === 503 ? "HEALTH_UNAVAILABLE" : undefined });
    const responseHeaders = headers ?? new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    responseHeaders.set("x-request-id", requestId);
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: responseHeaders });
  }
  if (!headers) return respond(403, { status: "unavailable", requestId });
  if (request.method === "OPTIONS") return respond(204, null);
  if (request.method !== "GET") return respond(405, { error: "METHOD_NOT_ALLOWED", requestId });
  // Test event for the acceptance check; only when SENTRY_TEST_EVENTS=true is set on purpose.
  if (Deno.env.get("SENTRY_TEST_EVENTS") === "true" && new URL(request.url).searchParams.get("sentry-test") === "1") {
    reportInBackground({ message: "Evento de prueba desde la Edge Function health", tags: { function: "health", requestId, test: "true" } });
  }
  let status = 503;
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) }
    });
    // Boolean probe instead of reading dataset_versions: anon has no select on it.
    const { data, error } = await client.rpc("dataset_probe");
    if (!error && data === true) status = 200;
  } catch { /* Only a generic health result is exposed publicly. */ }
  return respond(status, { status: status === 200 ? "ok" : "unavailable", requestId });
});
