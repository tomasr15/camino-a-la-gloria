import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { sign } from "../_shared/game/contracts.ts";
import { getClub } from "../_shared/game/data.ts";
import { contextFromResult, createNarrativeHandler, HttpError } from "../_shared/narrative/handler.ts";
import { createGeminiProvider, PROMPT_VERSION } from "../_shared/narrative/gemini.ts";

const model = Deno.env.get("GEMINI_MODEL") ?? "";
const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
let provider;
try { if (Deno.env.get("NARRATIVE_ENABLED") === "true") provider = createGeminiProvider({ apiKey, model }); }
catch { /* Configuration errors fall back without spending quota. */ }
Deno.serve(createNarrativeHandler({
  origins: (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map(s => s.trim()).filter(Boolean),
  provider, log: entry => console.log(JSON.stringify(entry)),
  authenticate: async token => {
    const secret = Deno.env.get("GAME_SIGNING_KEY");
    if (!secret || secret.length < 64) throw new HttpError("SERVICE_NOT_CONFIGURED", 503);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) },
    });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return null;
    async function rpc(action: string, values: Record<string, unknown>) {
      const payload = JSON.stringify({ ...values, action, userId: user!.id, issuedAt: Date.now() });
      const { data, error } = await client.rpc(action, { p_payload: payload, p_signature: await sign(payload, secret!) });
      if (error) throw new HttpError(error.message === "RESULT_NOT_FOUND" ? "RESULT_NOT_FOUND" : "STORAGE_UNAVAILABLE", error.message === "RESULT_NOT_FOUND" ? 404 : 503);
      return data;
    }
    return {
      read: async input => {
        const data = await rpc("narrative_read", { ...input });
        return { context: contextFromResult(data.matchId, data.result, id => getClub(id).name), entry: data.entry };
      },
      store: input => ({
        reserve: (fallback, enabled) => rpc("narrative_reserve", { ...input, fallback, enabled, model, promptVersion: PROMPT_VERSION }),
        finish: async (ticket, entry, tokens) => { await rpc("narrative_finish", { ticket, entry, tokens }); },
      }),
    };
  },
}));
