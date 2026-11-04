import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { clubs } from '../supabase/functions/_shared/game/data.ts';

// Bounded, local-only smoke/load check. Creates two new synthetic users and never deletes data.
const limit = 40, concurrency = 2, targetP95Ms = 2000, targetErrorRatePercent = 1;
const evidenceDir = 'docs/evidencias';
const generatedAt = new Date().toISOString();
const report = {
  generatedAt, environment: 'Supabase local only; two new synthetic accounts; no narrative/provider requests',
  status: 'not_run', limits: { getRequests: limit, concurrency, targetP95Ms, targetErrorRatePercent },
  setup: { accountsCreated: 0, careersCreated: 0, gamesInitialized: 0 }, samples: [],
  metrics: null, outcome: null
};
function save() {
  mkdirSync(evidenceDir, { recursive: true });
  const day = generatedAt.slice(0, 10);
  const json = JSON.stringify(report, null, 2) + '\n';
  writeFileSync(`${evidenceDir}/career-load-${day}.json`, json);
  writeFileSync(`${evidenceDir}/career-load-latest.json`, json);
}
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
function runStatus() {
  const output = execFileSync(process.execPath,
    ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const local = JSON.parse(output);
  const hostname = new URL(local.API_URL).hostname;
  assert.ok(['127.0.0.1', 'localhost'].includes(hostname), 'Refusing non-local Supabase URL');
  assert.ok(local.ANON_KEY && local.SERVICE_ROLE_KEY, 'Local Supabase credentials are unavailable');
  return local;
}
async function main() {
  const local = runStatus();
  const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = [];
  for (let i = 0; i < 2; i++) {
    const suffix = randomUUID();
    const email = `career-load-${suffix}@example.invalid`, password = `${randomUUID()}!Load8`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ok(!created.error && created.data.user, 'Could not create a synthetic local account');
    report.setup.accountsCreated++;
    const client = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    assert.ok(!login.error && login.data.session?.access_token, 'Could not authenticate a synthetic local account');
    users.push({ token: login.data.session.access_token, label: `synthetic-${i + 1}` });
  }

  for (let i = 0; i < users.length; i++) {
    const created = await fetch(`${local.API_URL}/functions/v1/careers`, {
      method: 'POST', headers: { apikey: local.ANON_KEY, authorization: `Bearer ${users[i].token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ managerName: `Load check ${randomUUID().slice(0, 8)}` })
    });
    assert.equal(created.status, 201, 'Career creation did not return HTTP 201');
    report.setup.careersCreated++;
    const response = await fetch(`${local.API_URL}/functions/v1/game`, {
      method: 'POST', headers: { apikey: local.ANON_KEY, authorization: `Bearer ${users[i].token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: randomUUID(), expectedVersion: 0, command: { type: 'initialize', clubId: clubs.find(club => club.tier === 'low').id } })
    });
    assert.equal(response.status, 200, 'Game initialization did not return HTTP 200');
    report.setup.gamesInitialized++;
  }

  // Exactly 20 authenticated GETs per function, distributed across both new accounts.
  const jobs = Array.from({ length: limit }, (_, i) => ({
    endpoint: i % 2 ? 'game' : 'careers', user: users[i % users.length], requestId: randomUUID()
  }));
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= jobs.length) return;
      const job = jobs[index], started = performance.now();
      let status = null, echoedRequestId = null, error = null;
      try {
        const response = await fetch(`${local.API_URL}/functions/v1/${job.endpoint}`, {
          headers: { apikey: local.ANON_KEY, authorization: `Bearer ${job.user.token}`, 'x-request-id': job.requestId }
        });
        status = response.status;
        const body = await response.json();
        echoedRequestId = body?.requestId ?? response.headers.get('x-request-id');
        if (status !== 200) error = 'http_status';
        else if (echoedRequestId !== job.requestId) error = 'request_id_mismatch';
        else if (job.endpoint === 'game' && !body.game) error = 'game_not_initialized';
        else if (job.endpoint === 'careers' && !Array.isArray(body.careers)) error = 'invalid_careers_payload';
      } catch {
        error = 'network_or_json_error';
      }
      report.samples.push({ endpoint: job.endpoint, requestId: job.requestId, status, durationMs: Number((performance.now() - started).toFixed(2)), ok: error === null, ...(error ? { error } : {}) });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const durations = report.samples.map(sample => sample.durationMs);
  const errors = report.samples.filter(sample => !sample.ok).length;
  const byEndpoint = Object.fromEntries(['careers', 'game'].map(endpoint => {
    const samples = report.samples.filter(sample => sample.endpoint === endpoint);
    return [endpoint, { count: samples.length, p95Ms: percentile(samples.map(s => s.durationMs), .95), errors: samples.filter(s => !s.ok).length }];
  }));
  report.metrics = {
    requestCount: report.samples.length, concurrency,
    p50Ms: percentile(durations, .50), p95Ms: percentile(durations, .95), maxMs: Math.max(...durations),
    errorCount: errors, errorRatePercent: Number((100 * errors / report.samples.length).toFixed(2)), byEndpoint
  };
  report.status = 'completed';
  report.outcome = { p95Pass: report.metrics.p95Ms < targetP95Ms, errorRatePass: report.metrics.errorRatePercent < targetErrorRatePercent };
  save();
  console.log(JSON.stringify({ status: report.status, requestCount: report.metrics.requestCount, p95Ms: report.metrics.p95Ms, errorRatePercent: report.metrics.errorRatePercent, outcome: report.outcome }));
  if (!report.outcome.p95Pass || !report.outcome.errorRatePass) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  report.status = 'setup_failed';
  report.failure = error?.message === 'Refusing non-local Supabase URL' ? 'non_local_environment_refused' : 'local_services_unavailable_or_setup_failed';
  save();
  console.log(JSON.stringify({ status: report.status, failure: report.failure, setup: report.setup }));
  process.exitCode = 2;
}
