// Ambient declarations so `npm run lint` and `npm run typecheck` cover the Edge
// Functions without installing the Deno toolchain. Only the API surface used by
// this repository is declared; anything else must be added deliberately.
declare namespace Deno {
  const env: { get(key: string): string | undefined };
  function serve(handler: (request: Request) => Response | Promise<Response>): { finished: Promise<void> };
}

declare module "npm:@supabase/supabase-js@2.117.2" {
  export * from "@supabase/supabase-js";
}
