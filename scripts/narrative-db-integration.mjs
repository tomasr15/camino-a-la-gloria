import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import pg from 'pg';

// Local-only integration, including actual concurrent transactions. Keeps its
// synthetic fixtures; restores quota configuration. Never calls an AI provider.
const local = JSON.parse(execFileSync(process.execPath,
  ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8' }));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(local.DB_URL).hostname));
const admin = new pg.Client({ connectionString: local.DB_URL }); await admin.connect();
const connections = []; const checks = [];
const ok = label => checks.push(label);
const userId = randomUUID(), outsider = randomUUID(), careerId = randomUUID();
const fixtureIds = ['a', 'b', 'c', 'd'].map(x => 'narrative-test-' + x + '-' + randomUUID());
let config;
try {
  const key = (await admin.query('select secret from game_private.signing_key where singleton')).rows[0]?.secret;
  assert.ok(key, 'Run node scripts/game-local-setup.mjs first');
  config = (await admin.query('select * from narrative_private.config where singleton')).rows[0];
  await admin.query('insert into auth.users(id,email) values ($1,$2),($3,$4)',
    [userId, `narrative-${userId}@example.invalid`, outsider, `narrative-${outsider}@example.invalid`]);
  await admin.query('insert into public.careers(id,user_id,dataset_version_id,manager_name) values ($1,$2,$3,$4)',
    [careerId, userId, '00000000-0000-4000-8000-000000000007', 'Narrative integration']);
  for (const fixtureId of fixtureIds) {
    const result = { id: fixtureId, round: 1, home: 'club-0', away: 'club-1', homeGoals: 2, awayGoals: 1 };
    await admin.query(`insert into game_private.match_results(career_id,season,fixture_id,round,home_goals,away_goals,result)
      values ($1,1,$2,1,2,1,$3)`, [careerId, fixtureId, result]);
  }
  const before = (await admin.query('select result from game_private.match_results where career_id=$1 order by fixture_id', [careerId])).rows;
  async function connection() {
    const c = new pg.Client({ connectionString: local.DB_URL }); await c.connect(); connections.push(c); return c;
  }
  const a = await connection(), b = await connection();
  async function rpc(c, action, values, uid = userId, corrupt = false) {
    assert.ok(['narrative_read', 'narrative_reserve', 'narrative_finish'].includes(action));
    const payload = JSON.stringify({ ...values, action, userId: uid, issuedAt: Date.now() });
    const signature = corrupt ? '0'.repeat(64) : createHmac('sha256', key).update(payload).digest('hex');
    await c.query('begin');
    try {
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
      const result = await c.query(`select public.${action}($1,$2) as value`, [payload, signature]);
      await c.query('commit'); return result.rows[0].value;
    } catch (error) { await c.query('rollback'); throw error; }
  }
  const input = i => ({ season: 1, fixtureId: fixtureIds[i], enabled: true, model: 'test-no-provider', promptVersion: 'tribuna-v1',
    fallback: { narrative: { matchId: `${careerId}/1/${fixtureIds[i]}`, title: 'Victoria local', body: 'Resultado confirmado de prueba: 2 - 1.' }, source: 'fallback', reason: 'pending' } });
  await assert.rejects(rpc(a, 'narrative_read', input(0), outsider), /RESULT_NOT_FOUND/); ok('cross-user result isolation');
  await assert.rejects(rpc(a, 'narrative_reserve', input(0), userId, true), /INVALID_SERVER_SIGNATURE/); ok('forged signature rejected');
  await a.query('begin'); await a.query('set local role authenticated');
  await assert.rejects(a.query('select * from narrative_private.events'), /permission denied/);
  await a.query('rollback'); ok('direct table access denied');
  const saved = await rpc(a, 'narrative_read', input(0)); assert.equal(saved.result.homeGoals, 2); ok('confirmed result read');
  const today = (await admin.query("select (clock_timestamp() at time zone 'UTC')::date::text as day")).rows[0].day;
  const used = Number((await admin.query('select attempts from narrative_private.usage where day=$1', [today])).rows[0]?.attempts ?? 0);
  await admin.query('update narrative_private.config set enabled=true,daily_limit=$1,minute_limit=1000 where singleton', [used + 1]);
  const race = await Promise.all([rpc(a, 'narrative_reserve', input(0)), rpc(b, 'narrative_reserve', input(1))]);
  assert.equal(race.filter(r => r.ticket).length, 1);
  assert.equal(race.filter(r => r.entry.reason === 'quota_exhausted').length, 1); ok('concurrent requests respect shared daily cap');
  const winner = race.findIndex(r => r.ticket), reserved = race[winner];
  const replay = await rpc(a, 'narrative_reserve', input(winner));
  assert.equal(replay.ticket, null); assert.equal(replay.entry.reason, 'pending'); ok('pending attempt cannot be regenerated');
  const completed = { ...reserved.entry, reason: 'fact_mismatch' };
  await rpc(a, 'narrative_finish', { ticket: reserved.ticket, entry: completed, tokens: 123 });
  await rpc(a, 'narrative_finish', { ticket: reserved.ticket, entry: completed, tokens: 123 });
  const usage = (await admin.query('select * from narrative_private.usage where day=$1', [today])).rows[0];
  assert.equal(usage.attempts, used + 1);
  assert.equal((await rpc(a, 'narrative_read', input(winner))).entry.reason, 'fact_mismatch'); ok('completion idempotent and rejected facts persisted');
  const event = (await admin.query('select tokens from narrative_private.events where ticket=$1', [reserved.ticket])).rows[0];
  assert.equal(Number(event.tokens), 123); ok('consumed tokens recorded even for fallback');
  await admin.query('update narrative_private.config set daily_limit=$1,minute_limit=1 where singleton', [used + 10]);
  const minute = await rpc(a, 'narrative_reserve', input(2));
  assert.equal(minute.entry.reason, 'quota_exhausted'); ok('rolling minute cap enforced');
  await admin.query('update narrative_private.config set enabled=false where singleton');
  assert.equal((await rpc(a, 'narrative_reserve', input(3))).entry.reason, 'disabled'); ok('database kill switch enforced');
  const after = (await admin.query('select result from game_private.match_results where career_id=$1 order by fixture_id', [careerId])).rows;
  assert.deepEqual(after, before); ok('sporting results unchanged');
  const report = { generatedAt: new Date().toISOString(), environment: 'local', providerCalls: 0, checks };
  writeFileSync('docs/evidencias/narrative-db.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (config) await admin.query('update narrative_private.config set enabled=$1,daily_limit=$2,minute_limit=$3 where singleton', [config.enabled, config.daily_limit, config.minute_limit]);
  await Promise.all(connections.map(c => c.end())); await admin.end();
}
