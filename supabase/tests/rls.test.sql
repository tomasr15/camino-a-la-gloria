begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
insert into auth.users (id, email) values
 ('10000000-0000-4000-8000-000000000001', 'cp1-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000002', 'cp1-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok($$insert into public.careers(user_id, dataset_version_id, manager_name) values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Manager A')$$, 'Owner can create career');
select is((select count(*)::integer from public.careers), 1, 'Owner sees own career');
select throws_ok($$insert into public.careers(user_id, dataset_version_id, manager_name) values ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Forged owner')$$, '42501', null, 'Cannot forge owner');
select throws_ok($$insert into public.careers(user_id, dataset_version_id, manager_name) values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Second career')$$, '23505', null, 'One career per user');
select throws_ok($$update public.careers set reputation = 100$$, '42501', null, 'Cannot rewrite game stats');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.careers), 0, 'Another user cannot read first career');
set local role anon;
select throws_ok($$select * from public.careers$$, '42501', null, 'Anonymous access denied');
select * from finish();
rollback;
