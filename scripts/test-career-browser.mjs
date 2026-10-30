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
let state = null, version = 0;
const receipts = new Map(), decisions = [], narrativeCalls = [];
let narrativeMode = 'success';
const errors = [];
const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_EXECUTABLE ? { executablePath: process.env.EDGE_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', e => errors.push(e.message));
const session = { access_token: 'test-token', refresh_token: 'test-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'dashboard-test-user', aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
await page.addInitScript(s => localStorage.setItem('sb-demo-auth-token', JSON.stringify(s)), session);
await page.route(`${supabaseURL}/**`, async route => {
  const req = route.request(), url = req.url();
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' };
  const reply = (data, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(data) });
  if (req.method() === 'OPTIONS') return reply({});
  if (url.includes('/functions/v1/careers')) return reply({ careers: [{ id: 'career-test', manager_name: 'Tomás', reputation: 20, created_at: '2026-01-01' }] });
  if (url.includes('/functions/v1/game')) {
    if (req.method() === 'GET') return reply({ version, game: state ? publicView(state) : null, clubs, isSynthetic: false });
    const body = req.postDataJSON(); decisions.push(body);
    if (receipts.has(body.requestId)) return reply(receipts.get(body.requestId));
    if (body.expectedVersion !== version) return reply({ error: 'STALE_VERSION' }, 409);
    state = body.command.type === 'initialize' ? initialize(body.command.clubId, 'browser-check') : transition(state, body.command);
    version++;
    const result = { version, game: publicView(state) }; receipts.set(body.requestId, result); return reply(result);
  }
  if (url.includes('/functions/v1/narrative')) {
    const input = req.postDataJSON(); narrativeCalls.push(input);
    if (narrativeMode === 'failure') return reply({ error: 'synthetic narrative outage' }, 503);
    const fixtureId = input.fixtureId;
    return reply({ source: 'fallback', reason: 'test_fixture', narrative: { matchId: `career-test/${input.season}/${fixtureId}`, title: 'Crónica de prueba', body: 'Respuesta simulada de narrativa; el resultado del motor ya está confirmado.' } });
  }
  return reply(session);
});
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const screenshotDir = 'docs/evidencias'; mkdirSync(screenshotDir, { recursive: true });
try {
  await page.goto(`${baseURL}/carrera`);
  await page.getByRole('button', { name: 'Cargar mi carrera', exact: true }).click();
  await page.getByRole('heading', { name: 'Elegí tu club.' }).waitFor();
  await page.getByRole('button', { name: new RegExp(clubs.find(c => c.tier === 'low').name) }).click();
  await page.getByRole('heading', { name: 'La próxima oportunidad.' }).waitFor();

  await page.getByRole('button', { name: 'Equipo', exact: true }).click();
  const formation = page.locator('select').nth(0);
  await formation.selectOption('4-3-3');
  await page.locator('select').nth(1).selectOption('offensive');
  const selected = page.locator('input[type=checkbox]:checked').first();
  await selected.uncheck();
  await page.getByRole('button', { name: 'Central', exact: true }).click();
  assert(await page.getByRole('button', { name: 'Jugar partido', exact: false }).isDisabled(), 'Invalid lineup must disable start');
  await page.reload();
  await page.getByRole('button', { name: 'Cargar mi carrera', exact: true }).click();
  await page.getByRole('button', { name: 'Equipo', exact: true }).click();
  assert((await page.getByRole('status').allTextContents()).join(' ').includes('10 / 11 titulares'), 'Incomplete draft survives reload');
  await page.getByRole('button', { name: 'Once recomendado' }).click();
  await page.getByRole('button', { name: 'Central', exact: true }).click();
  assert(await page.getByRole('button', { name: 'Jugar partido', exact: false }).isEnabled(), 'Restored valid lineup enables start');
  await page.reload();
  await page.getByRole('button', { name: 'Cargar mi carrera', exact: true }).click();
  await page.getByRole('button', { name: 'Equipo', exact: true }).click();
  assert(await page.locator('select').nth(0).inputValue() === '4-3-3', 'Formation draft reload persistence');
  assert(await page.locator('select').nth(1).inputValue() === 'offensive', 'Tactic draft reload persistence');
  await page.getByRole('button', { name: 'Central', exact: true }).click();
  await page.getByRole('button', { name: 'Jugar partido', exact: false }).click();
  await page.getByRole('heading', { name: 'El partido sigue.' }).waitFor();
  const start = decisions.find(d => d.command.type === 'start')?.command;
  assert(start?.formation === '4-3-3' && start.tactic === 'offensive' && start.lineup.length === 11, 'POST start must include the selected valid selection');

  // Resolve the first round through the actual engine; narrative is intercepted and never reaches a provider.
  await page.getByRole('button', { name: 'Resolver automáticamente', exact: true }).click();
  await page.getByRole('heading', { name: 'Crónica de prueba' }).waitFor({ timeout: 10000 });
  assert(narrativeCalls[0]?.fixtureId === state.lastMatch.id && narrativeCalls[0]?.season === state.season, 'Narrative request must reference confirmed fixture');
  assert(state.phase === 'ready' && state.results.length === 4, 'Narrative cannot alter confirmed engine result');
  narrativeMode = 'failure';
  await page.getByRole('button', { name: 'Central', exact: true }).click();
  await page.getByRole('button', { name: 'Simular partido', exact: false }).click();
  await page.getByText('La crónica no está disponible. El resultado y tu progreso están guardados; podés continuar.').waitFor({ timeout: 10000 });
  assert(state.round === 3 && state.results.length === 8, 'Narrative failure must not block career progress');

  // Reach a controllable chance with a bounded number of deterministic rounds, then verify the shot receipt and arena.
  await page.reload(); await page.getByRole('button', { name: 'Cargar mi carrera', exact: true }).click();
  await page.getByRole('heading', { name: 'La próxima oportunidad.' }).waitFor();
  for (let i = 0; i < 12 && state.phase !== 'playing'; i++) {
    await page.getByRole('button', { name: 'Jugar partido', exact: false }).click();
    await page.waitForTimeout(100);
    if (state.phase === 'playing' && !state.pending?.flatMap(m => m.shots).some(s => s.controlled && !s.resolved)) {
      await page.getByRole('button', { name: 'Resolver automáticamente', exact: true }).click();
      await page.waitForTimeout(100);
    }
  }
  if (state.phase === 'playing' && state.pending?.flatMap(m => m.shots).some(s => s.controlled && !s.resolved)) {
    await page.getByRole('button', { name: 'Iniciar barra', exact: true }).click();
    await page.waitForTimeout(600);
    const meter = page.locator('[aria-label^="Precisión"] span');
    const first = await meter.getAttribute('style'); await page.waitForTimeout(250); const second = await meter.getAttribute('style');
    assert(first !== second, 'Meter should animate after starting');
    await page.getByRole('button', { name: 'Patear', exact: true }).click();
    await page.getByText(/Confirmado/).waitFor();
    const shot = decisions.filter(d => d.command.type === 'shoot').at(-1)?.command;
    assert(shot && shot.eventId && shot.precision >= 0 && shot.precision <= 100, 'Confirmed shot command fields');
  } else {
    throw new Error('Deterministic seed did not expose a controllable chance within 12 rounds');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['Central', 'Equipo', 'Tabla', 'Calendario']) {
    await page.getByRole('button', { name, exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Mobile overflow in ${name}`);
    if (name === 'Equipo') assert(await page.getByRole('heading', { name: 'Tu once. Tu idea.' }).isVisible(), 'Team editor should render on mobile');
  }
  await page.getByRole('button', { name: 'Central', exact: true }).click();
  await page.screenshot({ path: `${screenshotDir}/career-editor-mobile.png`, fullPage: true });
  assert(errors.length === 0, `Browser exceptions: ${errors.join('; ')}`);
  writeFileSync(`${screenshotDir}/career-browser.json`, JSON.stringify({ date: new Date().toISOString(), environment: 'Local Next.js; all Supabase HTTP intercepted; real deterministic game engine; synthetic session; narrative success and outage responses stubbed; no Gemini/live Supabase calls', passed: true, checks: ['editor formation and tactic', 'invalid lineup disables start', 'recommended lineup valid', 'draft survives reload', 'start command carries selected formation/tactic/11 players', 'confirmed fixture narrative success', 'narrative outage does not block next match', 'manual shot uses animated meter and confirmed engine event', 'mobile 390px navigation/editor without horizontal overflow', 'no page errors'] }, null, 2));
  console.log('PASS career browser flow (intercepted API, real local engine)');
} finally { await browser.close(); }
