import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { sign } from "../_shared/game/contracts.ts";
import { createGameHandler } from "../_shared/game/handler.ts";
import { GameError } from "../_shared/game/model.ts";
import { reportServerError } from "../_shared/edge-report.ts";

Deno.serve(createGameHandler({
  origins: (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map(x => x.trim()).filter(Boolean),
  log: entry => console.log(JSON.stringify(entry)),
  report: input => reportServerError(input),
  authenticate: async token => {
    const secret = Deno.env.get("GAME_SIGNING_KEY");
    if (!secret || secret.length < 64) throw new GameError("GAME_NOT_CONFIGURED", 503);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + token }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) }
    });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return null;
    async function rpc(name: string, action: string, values: Record<string, unknown>) {
      const payload = JSON.stringify({ ...values, action, userId: user!.id, issuedAt: Date.now() });
      const { data, error } = await client.rpc(name, { p_payload: payload, p_signature: await sign(payload, secret!) });
      if (error) {
        const known = ["CAREER_REQUIRED", "STALE_VERSION", "REQUEST_ID_REUSED"];
        if (known.includes(error.message)) throw new GameError(error.message);
        throw new GameError("STORAGE_UNAVAILABLE", 503);
      }
      return data;
    }
    return {
      read: (requestId, commandHash) => rpc("game_read", "read", { requestId: requestId ?? null, commandHash: commandHash ?? null }),
      commit: input => rpc("game_commit", "commit", input)
    };
  }
}));
