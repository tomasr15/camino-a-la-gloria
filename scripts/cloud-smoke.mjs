import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

// Dedicated synthetic accounts must be supplied in ignored tmp/cloud-fixtures.json.
// Never provisions users, uses a service key, or deletes data.
const env = Object.fromEntries(readFileSync('.env.cloud', 'utf8').split(/\r?\n/).filter(x => x.includes('=')).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
const base = env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(base, 'https://gmpjtvxpolmxtqvdxdit.supabase.co');
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const origin = 'https://camino-a-la-gloria-dusky.vercel.app';
const fixtures = JSON.parse(readFileSync('tmp/cloud-fixtures.json', 'utf8'));
const results = [];
function pass(name) { results.push({ name, status: 'PASS' }); console.log(`PASS: ${name}`); }
async function user(fixture) {
  const client = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email: fixture.email, password: fixture.password });
  assert.ifError(login.error);
  return { client, token: login.data.session.access_token };
}
async function call(path, token, method = 'GET', body, requestOrigin = origin) {
  return fetch(`${base}/functions/v1/${path}`, {
    method, headers: { Origin: requestOrigin, apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}
const a = await user(fixtures[0]); const b = await user(fixtures[1]); pass('Password login for two confirmed synthetic users');
const health = await call('health'); assert.equal(health.status, 200); assert.equal(health.headers.get('access-control-allow-origin'), origin); pass('Public health and allowed CORS');
assert.equal((await call('careers')).status, 401); assert.equal((await call('careers', 'invalid-token')).status, 401); pass('Missing and invalid JWT rejected');
assert.equal((await call('careers', a.token, 'POST', { managerName: 'Ana', reputation: 100 })).status, 400); pass('Extra protected attributes rejected');
let own = await (await call('careers', a.token)).json();
if (!own.careers.length) {
  const created = await call('careers', a.token, 'POST', { managerName: 'DT de prueba CP1' });
  assert.equal(created.status, 201, await created.clone().text());
  assert.equal((await created.json()).career.reputation, 0);
  pass('Career persisted with default reputation (HTTP 201)');
}
assert.equal((await call('careers', a.token, 'POST', { managerName: 'Duplicada' })).status, 409); pass('Duplicate career rejected');
own = await (await call('careers', a.token)).json(); assert.equal(own.careers.length, 1); pass('Owner retrieves persistent career');
const other = await call('careers', b.token); assert.equal(other.status, 200); assert.equal((await other.json()).careers.length, 0); pass('Other user cannot retrieve career');
const direct = await b.client.from('careers').select('*'); assert.ifError(direct.error); assert.equal(direct.data.length, 0); pass('Direct REST enforces RLS isolation');
assert.equal((await call('careers', a.token, 'POST', { managerName: 'x'.repeat(3000) })).status, 413); pass('Oversize body rejected');
assert.equal((await call('careers', a.token, 'GET', undefined, 'https://unapproved.example')).status, 403); pass('Unapproved origin rejected');
assert.ok(other.headers.get('x-request-id')); pass('Request identifier returned for traceability');
const publicApp = await fetch(origin); assert.equal(publicApp.status, 200); assert.ok((await publicApp.text()).includes('Camino a la Gloria')); pass('Public Vercel frontend responds');
writeFileSync('docs/evidencias/cloud-smoke.json', JSON.stringify({ tested_at: new Date().toISOString(), project_ref: 'gmpjtvxpolmxtqvdxdit', frontend_url: origin, results, limitation: 'Accounts were confirmed as synthetic fixtures; public signup email delivery is not asserted. No data deleted.' }, null, 2) + '\n');
