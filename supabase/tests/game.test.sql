begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('20000000-0000-4000-8000-000000000001', 'game-a@example.invalid'),
  ('20000000-0000-4000-8000-000000000002', 'game-b@example.invalid');

-- Test-only signing key and envelopes. The real key is provisioned outside Git.
insert into game_private.signing_key(singleton, secret)
values (true, repeat('a', 64))
on conflict (singleton) do update set secret = excluded.secret;
create temp table game_envelopes (name text primary key, payload text not null, signature text not null);
grant select on game_envelopes to authenticated;

insert into game_envelopes(name, payload, signature)
select name, payload, encode(extensions.hmac(payload, repeat('a', 64), 'sha256'), 'hex')
from (
  select 'initialize' as name,
    json_build_object(
      'action', 'commit', 'userId', '20000000-0000-4000-8000-000000000001',
      'issuedAt', floor(extract(epoch from clock_timestamp()) * 1000),
      'requestId', '20000000-0000-4000-8000-000000000010',
      'commandHash', 'initial-command', 'expectedVersion', 0,
      'command', json_build_object('type', 'initialize', 'clubId', 'apf-474'),
      'state', json_build_object('engineVersion', 'cp2-v1', 'datasetCode', 'cp2-real-v1',
        'seed', 'test-seed', 'season', 1, 'round', 1, 'reputation', 20, 'results', json_build_array()),
      'view', json_build_object('phase', 'ready'))::text as payload
  union all
  select 'stale',
    json_build_object(
      'action', 'commit', 'userId', '20000000-0000-4000-8000-000000000001',
      'issuedAt', floor(extract(epoch from clock_timestamp()) * 1000),
      'requestId', '20000000-0000-4000-8000-000000000011',
      'commandHash', 'stale-command', 'expectedVersion', 0,
      'command', json_build_object('type', 'initialize', 'clubId', 'apf-474'),
      'state', json_build_object('engineVersion', 'cp2-v1', 'datasetCode', 'cp2-real-v1',
        'seed', 'test-seed', 'season', 1, 'round', 1, 'reputation', 20, 'results', json_build_array()),
      'view', json_build_object('phase', 'ready'))::text
  union all
  select 'synthetic',
    json_build_object(
      'action', 'commit', 'userId', '20000000-0000-4000-8000-000000000001',
      'issuedAt', floor(extract(epoch from clock_timestamp()) * 1000),
      'requestId', '20000000-0000-4000-8000-000000000012',
      'commandHash', 'synthetic-command', 'expectedVersion', 1,
      'command', json_build_object('type', 'auto', 'season', 1, 'round', 1),
      'state', json_build_object('engineVersion', 'cp2-v1', 'datasetCode', 'cp2-synthetic-v1',
        'seed', 'test-seed', 'season', 1, 'round', 1, 'reputation', 20, 'results', json_build_array()),
      'view', json_build_object('phase', 'ready'))::text
) entries;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
insert into public.careers(user_id, dataset_version_id, manager_name)
values ('20000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001', 'Game Tester');

select throws_ok(
  $$select public.game_commit('{}', repeat('0',64))$$,
  '42501', 'INVALID_SERVER_SIGNATURE', 'Reject an unsigned client mutation');
select throws_ok(
  $$select * from game_private.sessions$$,
  '42501', null, 'Authenticated client cannot read private game state');
select lives_ok(
  $$select public.game_commit(payload,signature) from game_envelopes where name='initialize'$$,
  'Trusted request creates a game');
select is(
  (select (public.game_commit(payload,signature)->>'version')::integer from game_envelopes where name='initialize'),
  1, 'Exact retry returns the original version');
select throws_ok(
  $$select public.game_commit(payload,signature) from game_envelopes where name='stale'$$,
  'P0001', 'STALE_VERSION', 'Competing request with stale version cannot commit');
select throws_ok(
  $$select public.game_commit(payload,signature) from game_envelopes where name='synthetic'$$,
  'P0001', 'INVALID_SERVER_STATE', 'Only the real dataset can be committed');
select throws_ok(
  $$select public.game_commit(payload,repeat('0',64)) from game_envelopes where name='initialize'$$,
  '42501', 'INVALID_SERVER_SIGNATURE', 'Changing the signature invalidates the request');
select throws_ok(
  $$select public.advance_career_reputation(50)$$,
  '42501', null, 'Client cannot alter reputation directly');
select throws_ok(
  $$select * from game_private.receipts$$,
  '42501', null, 'Client cannot read idempotency receipts');
select throws_ok(
  $$select * from game_private.match_results$$,
  '42501', null, 'Client cannot write or read match records directly');
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
insert into public.careers(user_id, dataset_version_id, manager_name)
values ('20000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000001', 'Other Tester');
select throws_ok(
  $$select public.game_commit(payload,signature) from game_envelopes where name='initialize'$$,
  '42501', 'INVALID_SERVER_ENVELOPE', 'Signed envelope cannot act as a different user');
reset role;

select is((select reputation from public.careers where user_id='20000000-0000-4000-8000-000000000001'),
  20, 'Trusted initialization updates only the owner reputation');
select is((select count(*)::integer from game_private.sessions
  where career_id = (select id from public.careers where user_id='20000000-0000-4000-8000-000000000001')), 1,
  'Only the authorized game session exists');
select is((select count(*)::integer from game_private.receipts
  where career_id = (select id from public.careers where user_id='20000000-0000-4000-8000-000000000001')), 1,
  'Retry and stale request created no second receipt');
select * from finish();
rollback;
