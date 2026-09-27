import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { corsHeaders } from "../_shared/http.ts";

Deno.serve(async (request: Request) => {
  const start = performance.now();
  const requestId = crypto.randomUUID();
  const headers = corsHeaders(request, (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map(x => x.trim()).filter(Boolean));
  if (!headers) return new Response(JSON.stringify({ status: "unavailable", requestId }), { status: 403, headers: { "Content-Type": "application/json" } });
  headers.set("x-request-id", requestId);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED", requestId }), { status: 405, headers });
  let status = 503;
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) }
    });
    const { data, error } = await client.from("dataset_versions").select("id").eq("code", "cp1-infrastructure-fixture-v1").maybeSingle();
    if (!error && data) status = 200;
  } catch { /* Only a generic health result is exposed publicly. */ }
  const durationMs = Math.round(performance.now() - start);
  console.log(JSON.stringify({ requestId, function: "health", status, durationMs }));
  return new Response(JSON.stringify({ status: status === 200 ? "ok" : "unavailable", requestId }), { status, headers });
});
