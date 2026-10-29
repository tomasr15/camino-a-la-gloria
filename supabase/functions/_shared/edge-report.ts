import { createReporter, isServerError, type ErrorEvent, type Report } from "./error-report.ts";

// One reporter per Edge Function instance, configured from server secrets:
// SENTRY_DSN (empty disables reporting) and SENTRY_ENVIRONMENT. It is created on
// first use, so the secrets are read when the function serves, not at import.
let cached: { key: string; report: Report } | null = null;
function report(event: ErrorEvent): Promise<boolean> {
  const dsn = Deno.env.get("SENTRY_DSN"), environment = Deno.env.get("SENTRY_ENVIRONMENT") ?? "production";
  const key = `${dsn ?? ""}|${environment}`;
  if (cached?.key !== key) cached = { key, report: createReporter({ dsn, runtime: "edge", environment }) };
  return cached.report(event);
}

// The response is not delayed: the runtime keeps the instance alive until the
// event is sent (EdgeRuntime.waitUntil in Supabase), otherwise it runs in the background.
export function reportInBackground(event: ErrorEvent): void {
  const pending = report(event);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(pending);
}

export interface ServerErrorInput {
  function: string;
  status: number;
  requestId: string;
  method: string;
  code?: unknown;
  cause?: unknown;
}

// Every 5xx a function returns becomes one Sentry event tagged with its requestId.
export function reportServerError(input: ServerErrorInput, send: (event: ErrorEvent) => void = reportInBackground): void {
  if (!isServerError(input.status)) return;
  const code = typeof input.code === "string" ? input.code : undefined;
  send({
    message: `${input.function} respondió ${input.status}${code ? ` ${code}` : ""}`,
    exceptionType: input.cause instanceof Error ? input.cause.name : code ?? "HttpError",
    tags: { function: input.function, status: input.status, requestId: input.requestId, method: input.method, code }
  });
}
