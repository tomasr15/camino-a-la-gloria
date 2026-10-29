import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { bestLineup, clubs } from '../supabase/functions/_shared/game/data.ts';

// Run with node --experimental-transform-types. Local Supabase only.
const local = JSON.parse(execFileSync(process.execPath,
  ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8' }));
const base = local.API_URL;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const admin = createClient(base, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID();
async function user(label) {
  const email = `cp2-${label}-${suffix}@example.invalid`, password = randomUUID() + '!Test8';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const client = createClient(base, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  return { token: login.data.session.access_token, client };
}
async function call(path, token, body) {
  const response = await fetch(`${base}/functions/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, body: await response.json() };
}
const a = await user('a'), b = await user('b');
assert.equal((await call('careers', a.token, { managerName: 'Prueba motor' })).status, 201);
assert.equal((await call('careers', b.token, { managerName: 'Prueba aislamiento' })).status, 201);
assert.equal((await call('game', a.token)).body.game, null);
const init = { requestId: randomUUID(), expectedVersion: 0, command: { type: 'initialize', clubId: clubs[0].id } };
const initialized = await call('game', a.token, init);
assert.equal(initialized.status, 200, JSON.stringify(initialized.body));
assert.equal(initialized.body.version, 1);
assert.equal(initialized.body.game.reputation, 20);
assert.equal((await call('game', a.token, init)).body.replayed, true);
assert.equal((await call('game', b.token)).body.game, null);
const start = { requestId: randomUUID(), expectedVersion: 1,
  command: { type: 'start', season: 1, round: 1, formation: '4-4-2', tactic: 'balanced', lineup: bestLineup(clubs[0], '4-4-2') } };
const started = await call('game', a.token, start);
assert.equal(started.status, 200, JSON.stringify(started.body));
assert.equal(started.body.version, 2);
// A round without a controllable chance closes on start; otherwise finish it.
let auto = started;
if (started.body.game.phase === 'playing') {
  assert.ok(started.body.game.match);
  auto = await call('game', a.token, { requestId: randomUUID(), expectedVersion: 2, command: { type: 'auto', season: 1, round: 1 } });
  assert.equal(auto.status, 200, JSON.stringify(auto.body));
}
assert.equal(auto.body.game.results.length, 4);
assert.equal(auto.body.game.match, null);
assert.equal(auto.body.game.lastMatch.round, 1);
assert.equal(auto.body.game.phase, 'ready');
assert.equal(auto.body.game.round, 2);
const raceCommand = { type: 'start', season: 1, round: 2, formation: '4-4-2', tactic: 'balanced', lineup: bestLineup(clubs[0], '4-4-2') };
const race = await Promise.all([randomUUID(), randomUUID()].map(requestId =>
  call('game', a.token, { requestId, expectedVersion: auto.body.version, command: raceCommand })));
assert.deepEqual(race.map(r => r.status).sort(), [200, 409], JSON.stringify(race));
const after = await call('game', a.token);
assert.equal(after.body.version, auto.body.version + 1);
let current = after.body;
for (let round = 2; round <= 14; round++) {
  if (round > 2) {
    const next = await call('game', a.token, { requestId: randomUUID(), expectedVersion: current.version,
      command: { ...raceCommand, round } });
    assert.equal(next.status, 200, JSON.stringify(next.body));
    current = next.body;
  }
  if (current.game.match?.pendingEvent) {
    const eventId = current.game.match.pendingEvent.id;
    const shot = await call('game', a.token, { requestId: randomUUID(), expectedVersion: current.version,
      command: { type: 'shoot', season: 1, round, eventId, direction: 'left', precision: 50 } });
    assert.equal(shot.status, 200, JSON.stringify(shot.body));
    current = shot.body;
  }
  if (current.game.phase === 'playing') {
    const finish = await call('game', a.token, { requestId: randomUUID(), expectedVersion: current.version,
      command: { type: 'auto', season: 1, round } });
    assert.equal(finish.status, 200, JSON.stringify(finish.body));
    current = finish.body;
  }
  assert.equal(current.game.results.length, round * 4);
  const own = current.game.results.find(r => r.round === round && (r.home === clubs[0].id || r.away === clubs[0].id));
  assert.equal(current.game.lastMatch.id, own.id);
  assert.deepEqual([current.game.lastMatch.homeGoals, current.game.lastMatch.awayGoals], [own.homeGoals, own.awayGoals]);
}
assert.equal(current.game.phase, 'finished');
assert.equal(current.game.results.length, 56);
assert.equal(current.game.table.reduce((n, row) => n + row.played, 0), 112);
const nextSeason = await call('game', a.token, { requestId: randomUUID(), expectedVersion: current.version,
  command: { type: 'nextSeason', season: 1, offerClubId: null } });
assert.equal(nextSeason.status, 200, JSON.stringify(nextSeason.body));
assert.equal(nextSeason.body.game.season, 2);
assert.equal(nextSeason.body.game.history[0].results.length, 56);
assert.equal(nextSeason.body.game.results.length, 0);
assert.equal(nextSeason.body.game.clubId, clubs[0].id);
const direct = await b.client.from('careers').select('reputation');
assert.ifError(direct.error);
assert.equal(direct.data.length, 1);
assert.equal(direct.data[0].reputation, 0);
console.log('PASS: local game API initialization, replay, isolation, 14 rounds, 56 fixtures, season advance and concurrent version check.');
