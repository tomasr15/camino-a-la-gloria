// Minimal Sentry client shared by the Edge Functions, the browser and the health monitor. It sends
// one event per error through Sentry's public envelope endpoint with fetch, so
// it needs no SDK, works the same in Deno and in the browser and is testable.
// Events carry only codes and tags (function, requestId, status): no payloads,
// tokens, emails or exception messages, matching the JSON log policy.

export type Runtime = "edge" | "browser" | "monitor";
export interface ErrorEvent {
  message: string;
  level?: "error" | "warning";
  tags?: Record<string, string | number | undefined>;
  exceptionType?: string;
}
export interface ReporterOptions {
  dsn: string | undefined;
  runtime: Runtime;
  environment?: string;
  fetch?: typeof fetch;
  maxPerMinute?: number;
  now?: () => number;
}
export type Report = (event: ErrorEvent) => Promise<boolean>;

interface Dsn { endpoint: string; dsn: string }

export function parseDsn(value: string | undefined): Dsn | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
    if (url.protocol !== "https:" || !url.username || !/^\d+$/.test(projectId)) return null;
    const endpoint = `https://${url.host}/api/${projectId}/envelope/?sentry_key=${encodeURIComponent(url.username)}&sentry_version=7&sentry_client=camino-a-la-gloria%2F1`;
    return { endpoint, dsn: value };
  } catch {
    return null;
  }
}

function cleanTags(tags: ErrorEvent["tags"] = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || value === "") continue;
    result[key.slice(0, 32)] = String(value).slice(0, 200);
  }
  return result;
}

export function buildEnvelope(dsn: string, event: ErrorEvent, options: { runtime: Runtime; environment?: string; timestamp: number; eventId: string }): string {
  const tags = cleanTags({ ...event.tags, runtime: options.runtime });
  const payload = {
    event_id: options.eventId,
    timestamp: options.timestamp / 1000,
    platform: "javascript",
    level: event.level ?? "error",
    environment: options.environment ?? "production",
    logger: options.runtime,
    message: { formatted: event.message.slice(0, 500) },
    exception: { values: [{ type: (event.exceptionType ?? "Error").slice(0, 80), value: event.message.slice(0, 500) }] },
    tags,
    // Same message for the same function and status: Sentry groups them as one issue.
    fingerprint: [options.runtime, tags.function ?? "app", tags.status ?? tags.check ?? event.message]
  };
  return [
    JSON.stringify({ event_id: options.eventId, sent_at: new Date(options.timestamp).toISOString(), dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(payload)
  ].join("\n");
}

// Never throws and never blocks the caller for more than 3 s. Without a DSN it
// does nothing, so local development and CI keep working unconfigured. A cap
// per instance keeps a 5xx storm from exhausting the free monthly quota.
export function createReporter(options: ReporterOptions): Report {
  const target = parseDsn(options.dsn);
  const send = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const limit = options.maxPerMinute ?? 20;
  let windowStart = 0, sent = 0;
  return async event => {
    if (!target) return false;
    const time = now();
    if (time - windowStart >= 60_000) { windowStart = time; sent = 0; }
    if (sent >= limit) return false;
    sent++;
    const eventId = crypto.randomUUID().replace(/-/g, "");
    try {
      const response = await send(target.endpoint, {
        method: "POST",
        // text/plain keeps the browser request "simple" (no CORS preflight).
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: buildEnvelope(target.dsn, event, { runtime: options.runtime, environment: options.environment, timestamp: time, eventId }),
        keepalive: true,
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      return false;
    }
  };
}

// HTTP responses that count as server errors and must reach Sentry.
export function isServerError(status: number): boolean {
  return status >= 500 && status <= 599;
}
