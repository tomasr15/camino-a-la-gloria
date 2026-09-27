import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Local fixtures only. This script never touches a cloud database or deletes data.
const local = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8' }));
const base = local.API_URL;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Integration fixtures are restricted to localhost');
const admin = createClient(base, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const key = local.ANON_KEY;
const suffix = randomUUID();
async function user(label) {
  const email = `cp1-${label}-${suffix}@example.invalid`;
  const password = randomUUID() + '!Test8';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const client = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return { client, token: login.data.session.access_token };
}
async function call(path, token, method = 'GET', body) {
  return fetch(`${base}/functions/v1/${path}`, {
    method, headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}
const a = await user('a'); const b = await user('b');
assert.equal((await call('health')).status, 200);
assert.equal((await call('careers')).status, 401);
assert.equal((await call('careers', 'invalid-token')).status, 401);
assert.equal((await call('careers', a.token, 'POST', { managerName: 'Ana', reputation: 100 })).status, 400);
const created = await call('careers', a.token, 'POST', { managerName: 'Directora de prueba' });
assert.equal(created.status, 201, await created.clone().text());
assert.equal((await created.json()).career.reputation, 0);
assert.equal((await call('careers', a.token, 'POST', { managerName: 'Duplicada' })).status, 409);
assert.equal((await (await call('careers', a.token)).json()).careers.length, 1);
assert.equal((await (await call('careers', b.token)).json()).careers.length, 0);
const direct = await b.client.from('careers').select('*');
assert.ifError(direct.error); assert.equal(direct.data.length, 0);
const oversize = await fetch(`${base}/functions/v1/careers`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ managerName: 'x'.repeat(3000) }) });
assert.equal(oversize.status, 413);
console.log('PASS: 10 integration assertions (health, JWT, validation, creation, duplicate, isolation, direct REST, body limit).');
console.log('Two synthetic local users and one local career retained; no data deleted.');
