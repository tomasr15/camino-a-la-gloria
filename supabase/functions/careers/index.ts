import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { parseCareerInput } from "../_shared/contracts.ts";
import { corsHeaders } from "../_shared/http.ts";

Deno.serve(async (request: Request) => {
  const started = performance.now();
  const requestId = crypto.randomUUID();
  const headers = corsHeaders(request, (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map(x => x.trim()).filter(Boolean));
  function respond(status: number, body: unknown) {
    console.log(JSON.stringify({ requestId, function: "careers", method: request.method, status, durationMs: Math.round(performance.now() - started) }));
    const responseHeaders = headers ?? new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    responseHeaders.set("x-request-id", requestId);
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: responseHeaders });
  }
  if (!headers) return respond(403, { error: "ORIGIN_NOT_ALLOWED", requestId });
  if (request.method === "OPTIONS") return respond(204, null);
  if (!["GET", "POST"].includes(request.method)) return respond(405, { error: "METHOD_NOT_ALLOWED", requestId });
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return respond(401, { error: "UNAUTHORIZED", requestId });
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) }
    });
    const { data: { user }, error: authError } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
    if (authError || !user) return respond(401, { error: "UNAUTHORIZED", requestId });
    if (request.method === "GET") {
      const { data, error } = await client.from("careers").select("id,manager_name,reputation,created_at,dataset_version_id").eq("user_id", user.id).limit(1);
      if (error) return respond(503, { error: "STORAGE_UNAVAILABLE", requestId });
      return respond(200, { careers: data, requestId });
    }
    if (!request.headers.get("content-type")?.includes("application/json")) return respond(415, { error: "JSON_REQUIRED", requestId });
    // Bound the stream, rather than trusting Content-Length from an untrusted caller.
    const reader = request.body?.getReader();
    if (!reader) return respond(400, { error: "INVALID_INPUT", requestId });
    let bytes = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); return respond(413, { error: "BODY_TOO_LARGE", requestId }); }
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    let input;
    try { input = parseCareerInput(JSON.parse(new TextDecoder().decode(buffer))); }
    catch { return respond(400, { error: "INVALID_INPUT", requestId }); }
    const { data: version, error: datasetError } = await client.from("dataset_versions").select("id").eq("code", "cp1-infrastructure-fixture-v1").single();
    if (datasetError || !version) return respond(503, { error: "DATASET_UNAVAILABLE", requestId });
    const { data, error } = await client.from("careers").insert({ user_id: user.id, dataset_version_id: version.id, manager_name: input.managerName }).select("id,manager_name,reputation,created_at,dataset_version_id").single();
    if (error?.code === "23505") return respond(409, { error: "CAREER_ALREADY_EXISTS", requestId });
    if (error) return respond(503, { error: "STORAGE_UNAVAILABLE", requestId });
    return respond(201, { career: data, requestId });
  } catch {
    return respond(503, { error: "SERVICE_UNAVAILABLE", requestId });
  }
});
