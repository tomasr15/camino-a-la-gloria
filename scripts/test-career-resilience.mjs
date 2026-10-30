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
await page.addInitScript(s => localStorage.setItem('sb-demo-auth-token', JSON.stringify(s)), session);
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

try {
  await page.goto(`${baseURL}/carrera`);
  await page.getByRole('button', { name: 'Cargar mi carrera', exact: true }).click();
  await page.getByRole('heading', { name: 'La carrera te espera.' }).waitFor();
  failReadsRemaining = 0;
  await page.getByRole('button', { name: 'Volver a intentar', exact: true }).click();
  await page.getByRole('heading', { name: 'Elegí tu club.' }).waitFor();
  results.push({ scenario: 'initial game GET 503 shows recovery; retry loads state', passed: true, observedStatus: 503 });
  await page.getByRole('button', { name: new RegExp(clubs.find(c => c.tier === 'low').name) }).click();
  await page.getByRole('heading', { name: 'La próxima oportunidad.' }).waitFor();

  narrativeStatus = 404;
  await page.getByRole('button', { name: 'Jugar partido', exact: false }).click();
  await page.getByRole('button', { name: 'Reintentar acción', exact: true }).waitFor();
  const firstAttempt = posts.at(-1);
  assert(firstAttempt.command.type === 'start' && version === 2 && (state.phase === 'playing' || state.round === 2), 'Lost start response must commit once on server');
  await page.getByRole('button', { name: 'Reintentar acción', exact: true }).click();
  await page.getByText(state.phase === 'playing' ? 'El partido está en curso.' : 'Tu progreso quedó guardado.', { exact: true }).waitFor();
  const retryPair = posts.slice(-2);
  assert(retryPair.length === 2 && JSON.stringify(retryPair[0]) === JSON.stringify(retryPair[1]), 'Retry must send byte-equivalent decision payload');
  assert(retryPair[0].requestId === retryPair[1].requestId && version === 2, 'Retry must reuse request ID and avoid duplicate engine transition');
  results.push({ scenario: 'POST start lost response retries same body/requestId; engine transition occurs once', passed: true, requestId: firstAttempt.requestId, committedVersion: version });

  if (state.phase === 'playing') await page.getByRole('button', { name: 'Resolver automáticamente', exact: true }).click();
  await page.getByText('La crónica no está disponible. El resultado y tu progreso están guardados; podés continuar.').waitFor({ timeout: 10000 });
  assert(state.results.length === 4 && narrativeCalls.at(-1)?.fixtureId === state.lastMatch.id, 'Narrative 404 must preserve confirmed engine result');
  results.push({ scenario: 'narrative 404 does not block confirmed result or progress', passed: true, observedStatus: 404, round: state.round });

  narrativeStatus = 503;
  const failedNarrative = page.waitForResponse(r => r.url().includes('/functions/v1/narrative') && r.status() === 503);
  await page.getByRole('button', { name: 'Simular partido', exact: false }).click();
  await failedNarrative;
  await page.getByText('La crónica no está disponible. El resultado y tu progreso están guardados; podés continuar.').waitFor({ timeout: 10000 });
  assert(state.results.length === 8, 'Narrative 503 must not block round completion');
  results.push({ scenario: 'narrative 503 does not block confirmed result or progress', passed: true, observedStatus: 503, round: state.round });

  const beforeStalePosts = posts.length;
  staleStartOnce = true;
  if (state.phase === 'playing') await page.getByRole('button', { name: 'Resolver automáticamente', exact: true }).click();
  if (state.phase === 'ready') await page.getByRole('button', { name: 'Jugar partido', exact: false }).click();
  await page.getByText('La partida cambió o no es compatible. Actualizá para consultar su estado.').waitFor();
  const staleBody = posts.at(-1);
  assert(staleBody.command.type === 'start' && posts.length === beforeStalePosts + 1, 'Stale response should not replay the decision');
  const beforeRefreshPosts = posts.length;
  await page.getByRole('button', { name: 'Actualizar ↻', exact: true }).click();
  await page.getByRole('heading', { name: state.phase === 'playing' ? 'El partido sigue.' : 'La próxima oportunidad.' }).waitFor();
  assert(posts.length === beforeRefreshPosts && version >= 4, 'Refresh after STALE_VERSION must read authoritative state without POST');
  results.push({ scenario: 'STALE_VERSION 409 offers refresh and does not repeat decision', passed: true, requestId: staleBody.requestId, authoritativeVersion: version });

  if (state.phase === 'playing') {
    await page.getByRole('button', { name: 'Resolver automáticamente', exact: true }).click();
    await page.getByText('Tu progreso quedó guardado.', { exact: true }).waitFor();
  }
  assert(state.phase === 'ready', 'Prepare ready state for authorization/rate-limit responses');
  const stateBeforeAuthErrors = JSON.stringify({ state, version });
  nextGameStatus = 401;
  await page.getByRole('button', { name: 'Jugar partido', exact: false }).click();
  await page.getByText(/Tu sesión venció/).waitFor();
  assert(JSON.stringify({ state, version }) === stateBeforeAuthErrors, '401 must leave game unchanged');
  results.push({ scenario: '401 displays session message and leaves engine state unchanged', passed: true, observedStatus: 401 });

  nextGameStatus = 429;
  await page.getByRole('button', { name: 'Jugar partido', exact: false }).click();
  await page.getByText(/No pudimos confirmar la operación/).waitFor();
  assert(JSON.stringify({ state, version }) === stateBeforeAuthErrors, '429 must leave game unchanged');
  results.push({ scenario: '429 displays safe action error and leaves engine state unchanged', passed: true, observedStatus: 429 });
  assert(errors.length === 0, `Unexpected browser runtime errors: ${errors.join('; ')}`);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: 'Local Next.js; all Supabase HTTP calls intercepted; real deterministic game engine; synthetic session; no Gemini/live Supabase calls',
    passed: true, scenarios: results,
    assertions: { totalPosts: posts.length, distinctDecisionIds: new Set(posts.map(p => p.requestId)).size, narrativeCalls: narrativeCalls.length, pageErrors: errors.length },
    limits: 'Each injected error is exercised once; one career and bounded rounds only.'
  };
  mkdirSync('docs/evidencias', { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS career browser resilience flow (intercepted API, real local engine)');
} finally { await browser.close(); }
