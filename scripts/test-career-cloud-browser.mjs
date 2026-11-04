import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const env = Object.fromEntries(readFileSync('.env.cloud', 'utf8').split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const cloud = 'https://gmpjtvxpolmxtqvdxdit.supabase.co';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, cloud);
const fixtures = JSON.parse(readFileSync('tmp/cloud-fixtures.json', 'utf8'));
assert.ok(/^cp2-cloud-0-[a-f0-9-]+@example\.invalid$/.test(fixtures[0]?.email));
const baseURL = process.env.CAREER_BASE_URL ?? 'http://localhost:3101';
const allowedOrigin = 'https://camino-a-la-gloria-dusky.vercel.app';
const localOrigin = new URL(baseURL).origin;
const report = { testedAt: new Date().toISOString(), frontend: 'Local production build of PR #25', backend: cloud, network: 'Playwright forwards requests to live Supabase with the published allowed Origin and adapts response ACAO to the local frontend. Native CORS for the published Origin is checked by test:career-cloud.', checks: [], requests: [], pageErrors: [], networkErrors: [] };
const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_EXECUTABLE ? { executablePath: process.env.EDGE_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('response', response => {
  const url = new URL(response.url());
  if (url.origin === cloud && (url.pathname.startsWith('/functions/v1/') || url.pathname.startsWith('/auth/v1/'))) {
    report.requests.push({ path: url.pathname, method: response.request().method(), status: response.status(), requestId: response.headers()['x-request-id'] ?? null });
  }
});
await page.route(`${cloud}/**`, async route => {
  try {
    const original = route.request().headers();
    const upstream = await route.fetch({ headers: { ...original, origin: allowedOrigin } });
    await route.fulfill({ response: upstream, headers: { ...upstream.headers(), 'access-control-allow-origin': localOrigin, 'access-control-allow-credentials': 'true' } });
  } catch {
    report.networkErrors.push(new URL(route.request().url()).pathname);
    try { await route.abort('failed'); } catch { /* The page may have closed. */ }
  }
});
const check = async (name, run) => { await run(); report.checks.push(name); console.log(`PASS ${name}`); };
try {
  await page.goto(`${baseURL}/carrera`);
  await page.getByLabel('Correo electrónico').fill(fixtures[0].email);
  await page.getByLabel('Contraseña').fill(fixtures[0].password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await check('login with dedicated cloud fixture', async () => { await page.getByRole('button', { name: 'Cargar mi carrera', exact: true }).waitFor({ timeout: 20000 }); });
  await page.getByRole('button', { name: 'Cargar mi carrera', exact: true }).click();
  await check('live dashboard and persisted match', async () => {
    await page.getByRole('heading', { name: /La próxima oportunidad\.|El partido sigue\.|El próximo capítulo\./ }).waitFor({ timeout: 20000 });
    await page.getByRole('heading', { name: 'Tabla de posiciones' }).waitFor();
    await page.getByRole('region', { name: 'Crónica del último partido' }).waitFor({ timeout: 20000 });
  });
  await check('real narrative fallback', async () => {
    await page.getByText('Relato alternativo').waitFor({ timeout: 20000 });
    assert.ok(report.requests.some(request => request.path === '/functions/v1/narrative' && request.status === 200));
  });
  await check('team, standings and calendar render', async () => {
    for (const name of ['Equipo', 'Tabla', 'Calendario']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('heading', { name: name === 'Equipo' ? 'Tu once. Tu idea.' : name === 'Tabla' ? 'La clasificación.' : 'El camino de la temporada.' }).waitFor();
    }
  });
  await page.reload();
  await page.getByRole('button', { name: 'Cargar mi carrera', exact: true }).click();
  await check('session and game survive browser reload', async () => { await page.getByRole('heading', { name: /La próxima oportunidad\.|El partido sigue\.|El próximo capítulo\./ }).waitFor({ timeout: 20000 }); });
  await page.getByText('Relato alternativo').waitFor({ timeout: 20000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await check('mobile navigation has no horizontal overflow', async () => {
    for (const name of ['Central', 'Equipo', 'Tabla', 'Calendario']) {
      await page.getByRole('button', { name, exact: true }).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} has horizontal overflow`);
    }
  });
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.networkErrors, []);
  assert.ok(report.requests.some(request => request.path === '/functions/v1/careers' && request.status === 200));
  assert.ok(report.requests.some(request => request.path === '/functions/v1/game' && request.status === 200));
  console.log('PASS no browser exceptions');
  report.checks.push('no browser exceptions');
  report.passed = true;
} finally {
  await page.unrouteAll({ behavior: 'wait' });
  await browser.close();
  writeFileSync('docs/evidencias/career-cloud-browser.json', JSON.stringify(report, null, 2) + '\n');
}
