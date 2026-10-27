import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { bestLineup, clubs } from '../supabase/functions/_shared/game/data.ts';

// Requires local functions serve with Gemini disabled. Exercises actual Auth,
// engine persistence, signed RPCs and narrative fallback without AI consumption.
const local = JSON.parse(execFileSync(process.execPath,
  ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8' }));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname));
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function user() {
  const email = `narrative-http-${randomUUID()}@example.invalid`, password = randomUUID() + '!Test8';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(created.error);
  const client = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password }); assert.ifError(login.error);
  return login.data.session.access_token;
}
async function call(path, token, body) {
  const response = await fetch(`${local.API_URL}/functions/v1/${path}`, {
    method: body ? 'POST' : 'GET', headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json(), requestId: response.headers.get('x-request-id') };
}
const token = await user(), other = await user();
assert.equal((await call('careers', token, { managerName: 'Prueba narrativa' })).status, 201);
const init = await call('game', token, { requestId: randomUUID(), expectedVersion: 0, command: { type: 'initialize', clubId: clubs[0].id } });
assert.equal(init.status, 200, JSON.stringify(init.body));
const started = await call('game', token, { requestId: randomUUID(), expectedVersion: init.body.version,
  command: { type: 'start', season: 1, round: 1, formation: '4-4-2', tactic: 'balanced', lineup: bestLineup(clubs[0], '4-4-2') } });
assert.equal(started.status, 200, JSON.stringify(started.body));
const finished = await call('game', token, { requestId: randomUUID(), expectedVersion: started.body.version, command: { type: 'auto', season: 1, round: 1 } });
assert.equal(finished.status, 200, JSON.stringify(finished.body));
const result = finished.body.game.results[0], input = { season: 1, fixtureId: result.id };
const narrative = await call('narrative', token, input);
assert.equal(narrative.status, 200, JSON.stringify(narrative.body));
assert.equal(narrative.body.source, 'fallback');
assert.ok(['not_configured', 'disabled'].includes(narrative.body.reason));
assert.equal(narrative.body.requestId, narrative.requestId);
assert.ok(narrative.body.narrative.body.includes(`(local) ${result.homeGoals} - ${result.awayGoals}`));
assert.ok(narrative.body.narrative.body.includes('Folclore de tribuna (ficción):'));
const repeated = await call('narrative', token, input);
assert.deepEqual(repeated.body.narrative, narrative.body.narrative);
assert.equal((await call('narrative', other, input)).status, 404);
assert.equal((await call('narrative', token, { ...input, homeGoals: 99 })).status, 400);
assert.equal((await call('narrative', token, { ...input, fixtureId: 'missing' })).status, 404);
assert.equal((await call('narrative', 'invalid', input)).status, 401);
const after = await call('game', token);
assert.deepEqual(after.body.game.results, finished.body.game.results);
assert.equal(after.body.version, finished.body.version);
const report = { generatedAt: new Date().toISOString(), environment: 'local', providerCalls: 0,
  checks: ['Auth and engine through HTTP', 'confirmed score preserved', 'spicy fallback persisted and reused',
    'requestId propagated', 'cross-user isolation', 'forged score rejected', 'missing result rejected', 'invalid JWT rejected', 'engine state unchanged'] };
writeFileSync('docs/evidencias/narrative-http.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
