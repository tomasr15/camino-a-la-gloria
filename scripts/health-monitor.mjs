import { pathToFileURL } from 'node:url';
import { createReporter } from '../supabase/functions/_shared/error-report.ts';

// Uptime check for the public health function. Run on a schedule by
// .github/workflows/health-monitor.yml. A single failed request may be a
// transient blip, so it only alerts after every attempt failed: then it sends
// one event to Sentry (if SENTRY_DSN is set) and exits 1, which also makes the
// GitHub job fail and e-mail the workflow owner. No credentials are needed:
// health is public (verify_jwt=false) and exposes only ok/unavailable.
//   HEALTH_URL=https://<ref>.supabase.co/functions/v1/health npm run monitor:health
export async function checkHealth({ url, attempts = 3, delayMs = 20_000, timeoutMs = 10_000, fetch: send = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  const results = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    let status = null, error = null;
    try {
      const response = await send(url, { headers: { 'x-request-id': requestId }, signal: AbortSignal.timeout(timeoutMs) });
      status = response.status;
      const body = await response.json().catch(() => null);
      if (status === 200 && body?.status === 'ok') {
        results.push({ attempt, requestId, status, durationMs: Date.now() - started });
        return { healthy: true, results };
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.name : 'Error';
    }
    results.push({ attempt, requestId, status, error, durationMs: Date.now() - started });
    if (attempt < attempts) await sleep(delayMs);
  }
  return { healthy: false, results };
}

export function alertEvent(url, outcome) {
  const last = outcome.results.at(-1);
  return {
    message: `health no responde: ${outcome.results.length} intentos fallidos (último: ${last?.status ?? last?.error ?? 'sin respuesta'})`,
    exceptionType: 'HealthCheckFailed',
    tags: { function: 'health', check: 'health-monitor', status: last?.status ?? undefined, requestId: last?.requestId, host: new URL(url).host }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.HEALTH_URL;
  if (!url) {
    console.log(JSON.stringify({ check: 'health-monitor', skipped: 'HEALTH_URL no configurada' }));
    process.exit(0);
  }
  const outcome = await checkHealth({ url });
  console.log(JSON.stringify({ check: 'health-monitor', host: new URL(url).host, ...outcome }));
  if (!outcome.healthy) {
    const report = createReporter({ dsn: process.env.SENTRY_DSN, runtime: 'monitor', environment: process.env.SENTRY_ENVIRONMENT ?? 'production' });
    const sent = await report(alertEvent(url, outcome));
    console.log(JSON.stringify({ check: 'health-monitor', sentryEvent: sent }));
    process.exit(1);
  }
}
