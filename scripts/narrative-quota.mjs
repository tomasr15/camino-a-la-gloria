import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Daily AI quota view. It consumes the JSON written by report:narrative-usage
// (the record, #8) and slices it by UTC day against the configured limit. It
// never connects to the database or changes the quota: the cut itself is
// enforced by narrative_reserve, and the manual kill switch stays in SQL.
//   npm run -s report:narrative-usage | npm run -s report:narrative-quota
//   npm run -s report:narrative-quota -- uso.json --json
export const WARNING_RATIO = 0.8;

function count(value, field) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error(`INVALID_REPORT: ${field}`);
  return n;
}

export function summarizeQuota(report) {
  if (!report?.config || !Array.isArray(report.days)) throw new Error('INVALID_REPORT: config and days are required');
  const enabled = report.config.enabled === true;
  const dailyLimit = count(report.config.daily_limit, 'daily_limit');
  const minuteLimit = count(report.config.minute_limit, 'minute_limit');
  const status = attempts => !enabled ? 'deshabilitada'
    : attempts >= dailyLimit ? 'corte'
      : attempts >= dailyLimit * WARNING_RATIO ? 'alerta' : 'ok';
  const days = report.days.map(row => {
    const attempts = count(row.attempts, 'attempts');
    return {
      day: String(row.day), attempts, limit: dailyLimit, remaining: Math.max(dailyLimit - attempts, 0),
      usedPct: dailyLimit ? Math.round(attempts * 100 / dailyLimit) : null,
      reportedTokens: count(row.reported_tokens, 'reported_tokens'), unknownUsage: count(row.unknown_usage, 'unknown_usage'),
      status: status(attempts)
    };
  });
  // A day without a usage row had no attempts; it still has a quota status.
  const todayKey = String(report.generatedAt ?? new Date().toISOString()).slice(0, 10);
  const today = days.find(d => d.day === todayKey) ?? {
    day: todayKey, attempts: 0, limit: dailyLimit, remaining: dailyLimit, usedPct: dailyLimit ? 0 : null,
    reportedTokens: 0, unknownUsage: 0, status: status(0)
  };
  const outcomes = Array.isArray(report.outcomes) ? report.outcomes : [];
  const byReason = reason => outcomes.filter(o => o.reason === reason).reduce((n, o) => n + count(o.count, 'count'), 0);
  return {
    generatedAt: report.generatedAt ?? null, quotaTimezone: report.quotaTimezone ?? 'UTC',
    enabled, dailyLimit, minuteLimit, today, days,
    rejected: { quotaExhausted: byReason('quota_exhausted'), disabled: byReason('disabled'), notConfigured: byReason('not_configured') }
  };
}

export function formatQuota(s) {
  const pct = d => d.usedPct === null ? '—' : `${d.usedPct}%`;
  const row = cells => cells.map((c, i) => i === 0 || i === cells.length - 1 ? String(c).padEnd(i ? 0 : 11) : String(c).padStart(9)).join(' ');
  return [
    `Cuota diaria de IA (narrativa) · días en ${s.quotaTimezone} · generado ${s.generatedAt ?? 'sin fecha'}`,
    `IA ${s.enabled ? 'habilitada' : 'deshabilitada (corte manual)'} · límite diario ${s.dailyLimit} · límite por minuto ${s.minuteLimit}`,
    `Hoy (${s.today.day}): ${s.today.attempts}/${s.today.limit} intentos · quedan ${s.today.remaining} · ${s.today.status}`,
    '',
    row(['Día', 'Intentos', 'Límite', 'Quedan', 'Uso', 'Tokens', 'Sin dato', 'Estado']),
    ...s.days.map(d => row([d.day, d.attempts, d.limit, d.remaining, pct(d), d.reportedTokens, d.unknownUsage, d.status])),
    ...(s.days.length ? [] : ['(sin consumo registrado)']),
    '',
    `Rechazos acumulados · cupo agotado: ${s.rejected.quotaExhausted} · IA deshabilitada: ${s.rejected.disabled} · sin configurar: ${s.rejected.notConfigured}`,
    'El límite se compara con la configuración vigente; un día anterior pudo tener otro límite.'
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  const summary = summarizeQuota(JSON.parse(readFileSync(file ?? 0, 'utf8')));
  console.log(args.includes('--json') ? JSON.stringify(summary, null, 2) : formatQuota(summary));
}
