import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initialize, publicView, transition } from '../supabase/functions/_shared/game/engine.ts';
import { clubs } from '../supabase/functions/_shared/game/data.ts';

const require = createRequire(import.meta.url);
const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? require.resolve('playwright');
const playwrightModule = await import(playwrightPath.startsWith('file:') ? playwrightPath : pathToFileURL(playwrightPath).href);
const { chromium } = playwrightModule.default ?? playwrightModule;
const baseURL = process.env.CAREER_BASE_URL ?? 'http://localhost:3100';
const supabaseURL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://demo.supabase.co';
const evidencePath = 'docs/evidencias/career-resilience.json';
let state = null, version = 0, failReadsRemaining = 2, loseStartOnce = true, staleStartOnce = false;
let nextGameStatus = null, narrativeStatus = 404;
const receipts = new Map(), decisions = [], posts = [], narrativeCalls = [];
const errors = [];
const results = [];
const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_EXECUTABLE ? { executablePath: process.env.EDGE_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
const session = { access_token: 'test-token', refresh_token: 'test-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'resilience-test-user', aud: 'authenticated', role: 'authenticated', email: 'resilience@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: 'sb-' + new URL(supabaseURL).hostname.split('.')[0] + '-auth-token', value: session });
await page.route(`${supabaseURL}/**`, async route => {
  const req = route.request(), url = req.url();
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' };
  const reply = (data, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(data) });
  if (req.method() === 'OPTIONS') return reply({});
  if (url.includes('/functions/v1/careers')) return reply({ careers: [{ id: 'career-test', manager_name: 'Resiliencia', reputation: 20, created_at: '2026-01-01' }] });
  if (url.includes('/functions/v1/game')) {
    if (req.method() === 'GET') {
      if (failReadsRemaining > 0) { return reply({ error: 'synthetic read outage', requestId: 'read-outage' }, 503); }
      return reply({ version, game: state ? publicView(state) : null, clubs, isSynthetic: false });
    }
    const body = req.postDataJSON(); posts.push(body);
    const cmd = body.command;
    if (nextGameStatus !== null) {
      const status = nextGameStatus; nextGameStatus = null;
      return reply({ error: status === 401 ? 'UNAUTHORIZED' : 'RATE_LIMITED', requestId: `synthetic-${status}` }, status);
    }
    if (staleStartOnce && cmd.type === 'start') {
      staleStartOnce = false;
      state = transition(state, cmd); version++;
      return reply({ error: 'STALE_VERSION', requestId: 'synthetic-stale' }, 409);
    }
    decisions.push(body);
    if (receipts.has(body.requestId)) return reply(receipts.get(body.requestId));
    if (body.expectedVersion !== version) return reply({ error: 'STALE_VERSION', requestId: 'synthetic-stale' }, 409);
    state = cmd.type === 'initialize' ? initialize(cmd.clubId, 'browser-resilience') : transition(state, cmd);
    version++;
    const result = { version, game: publicView(state), requestId: body.requestId };
    receipts.set(body.requestId, result);
    if (loseStartOnce && cmd.type === 'start') { loseStartOnce = false; return route.abort('failed'); }
    return reply(result);
  }
  if (url.includes('/functions/v1/narrative')) {
    const input = req.postDataJSON(); narrativeCalls.push(input);
    return reply({ error: `synthetic narrative ${narrativeStatus}`, requestId: `narrative-${narrativeStatus}` }, narrativeStatus);
  }
  return reply(session);
});
const assert = (ok, message) => { if (!ok) throw new Error(message); };

async function openPregame() {
  await page.goto(`${baseURL}/carrera`);
  await page.getByRole('button', { name: 'Cargar mi carrera', exact: true }).click();
  await page.getByRole('button', { name: 'Simular partido', exact: false }).click();
  await page.getByRole('button', { name: 'Empezar partido', exact: true }).waitFor();
}
try {
  await page.goto(`${baseURL}/carrera`);
  await page.getByRole('button', { name: 'Cargar mi carrera', exact: true }).click();
  await page.getByRole('heading', { name: 'La carrera te espera.' }).waitFor();
  failReadsRemaining = 0;
  await page.getByRole('button', { name: 'Volver a intentar', exact: true }).click();
  await page.getByRole('heading', { name: 'Elegí tu club.' }).waitFor();
  results.push({ scenario: 'Initial GET 503 recovers through retry', passed: true });
  await page.getByRole('button', { name: new RegExp(clubs.find(c => c.tier === 'low').name) }).click();
  await page.getByRole('heading', { name: 'Próximo partido' }).waitFor();

  await page.getByRole('button', { name: 'Simular partido', exact: false }).click();
  await page.getByRole('button', { name: 'Empezar partido', exact: true }).click();
  await page.getByRole('button', { name: 'Reintentar inicio', exact: true }).waitFor();
  const firstAttempt = posts.at(-1);
  assert(firstAttempt.command.type === 'start' && version === 2, 'Lost response still commits start once');
  await page.getByRole('button', { name: 'Reintentar inicio', exact: true }).click();
  await page.getByRole('heading', { name: 'Final del encuentro' }).waitFor({ state: 'attached' });
  const retries = posts.filter(p => p.requestId === firstAttempt.requestId);
  assert(retries.length === 2 && JSON.stringify(retries[0]) === JSON.stringify(retries[1]), 'Retry preserves exact request identity and body');
  assert(state.round === 2 && state.results.length === 4, 'Retry does not duplicate result');
  results.push({ scenario: 'Lost start response retried identically and round committed once', passed: true });

  await openPregame();
  staleStartOnce = true;
  const beforeStale = posts.length;
  await page.getByRole('button', { name: 'Empezar partido', exact: true }).click();
  await page.getByText(/La partida cambió o no es compatible/).waitFor();
  assert(posts.length === beforeStale + 1, '409 does not silently replay the action');
  await page.reload();
  await page.getByRole('heading', { name: state.phase === 'playing' ? 'Acontecimientos' : 'Final del encuentro' }).waitFor({ state: 'attached' });
  assert(posts.length === beforeStale + 1, 'Reload recovers authoritative state without POST');
  results.push({ scenario: '409 recovers persisted game on reload without another decision', passed: true });

  // Finish only this fixture in the intercepted server to prepare the error scenarios.
  if (state.phase === 'playing') {
    state = transition(state, { type: 'auto', season: state.season, round: state.round });
    version++;
  }
  for (const status of [401, 429, 503]) {
    await openPregame();
    const before = JSON.stringify({ state, version });
    nextGameStatus = status;
    await page.getByRole('button', { name: 'Empezar partido', exact: true }).click();
    await page.getByText(status === 401 ? /Tu sesión venció/ : /No pudimos confirmar la operación/).waitFor();
    assert(JSON.stringify({ state, version }) === before, `HTTP ${status} must preserve game state`);
    results.push({ scenario: `HTTP ${status} displays error and preserves state`, passed: true });
  }
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  assert(narrativeCalls.length === 0, 'Removed narrative panel must not request narratives');
  mkdirSync('docs/evidencias', { recursive: true });
  writeFileSync(evidencePath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    environment: 'Local Next.js; intercepted Supabase HTTP; real deterministic engine; synthetic session',
    passed: true,
    scenarios: results,
    limits: 'No live database or provider calls. 409 recovery exercised through page reload.',
  }, null, 2) + '\n');
  console.log('PASS career browser resilience (current kickoff and match routes)');
} finally { await browser.close(); }
