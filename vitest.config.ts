import { defineConfig } from "vitest/config";
export default defineConfig({
  // Las Edge Functions importan el SDK con el especificador de Deno; en Node se resuelve al paquete real.
  resolve: { alias: { "npm:@supabase/supabase-js@2.117.2": "@supabase/supabase-js" } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" }
});
