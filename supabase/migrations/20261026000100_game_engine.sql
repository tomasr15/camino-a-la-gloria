-- CP2 engine state is private. Only signed server transitions under the user's
-- JWT can commit. No service_role is needed for game requests.
create schema if not exists game_private;
revoke all on schema game_private from public, anon, authenticated, service_role;
create table game_private.signing_key (
  singleton boolean primary key default true check (singleton),
  secret text not null check (length(secret) >= 64)
);
revoke all on game_private.signing_key from public, anon, authenticated, service_role;
-- Provision the key separately; never put a real key in a migration.

insert into public.dataset_versions (id, code, season, source, is_synthetic)
values ('00000000-0000-4000-8000-000000000007', 'cp2-synthetic-v1', 2026,
        'fictional-demo:144-players:engine-cp2-v1', true)
on conflict (code) do nothing;

create table game_private.sessions (
  career_id uuid primary key references public.careers(id),
  version bigint not null check (version > 0),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create table game_private.receipts (
  career_id uuid not null references public.careers(id),
  request_id uuid not null,
  command_hash text not null,
  command jsonb not null,
  version bigint not null,
  response_view jsonb not null,
  primary key (career_id, request_id)
);
create table game_private.match_results (
  career_id uuid not null references public.careers(id),
  season integer not null check (season > 0),
  fixture_id text not null,
  round integer not null check (round between 1 and 14),
  home_goals integer not null check (home_goals >= 0),
  away_goals integer not null check (away_goals >= 0),
  result jsonb not null,
  primary key (career_id, season, fixture_id)
);
alter table game_private.sessions enable row level security;
alter table game_private.receipts enable row level security;
alter table game_private.match_results enable row level security;
revoke all on all tables in schema game_private from public, anon, authenticated, service_role;

create function game_private.verify(p_payload text, p_signature text, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_secret text; v_body jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode = '42501'; end if;
  select secret into v_secret from game_private.signing_key where singleton;
  if v_secret is null or p_signature is null or p_signature !~ '^[0-9a-f]{64}$'
     or extensions.hmac(p_payload, v_secret, 'sha256') <> decode(p_signature, 'hex') then
    raise exception 'INVALID_SERVER_SIGNATURE' using errcode = '42501';
  end if;
  v_body := p_payload::jsonb;
  if v_body->>'userId' is distinct from auth.uid()::text
     or v_body->>'action' is distinct from p_action
     or v_body->>'issuedAt' is null
     or abs(extract(epoch from clock_timestamp()) * 1000 - (v_body->>'issuedAt')::numeric) > 120000 then
    raise exception 'INVALID_SERVER_ENVELOPE' using errcode = '42501';
  end if;
  return v_body;
end;
$$;
revoke all on function game_private.verify(text,text,text) from public, anon, authenticated, service_role;

create function public.game_read(p_payload text, p_signature text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b jsonb; cid uuid; s game_private.sessions; r game_private.receipts;
begin
  b := game_private.verify(p_payload, p_signature, 'read');
  select id into cid from public.careers where user_id = auth.uid();
  if cid is null then raise exception 'CAREER_REQUIRED'; end if;
  select * into s from game_private.sessions where career_id = cid;
  if b->>'requestId' is not null then
    select * into r from game_private.receipts where career_id = cid and request_id = (b->>'requestId')::uuid;
    if found and r.command_hash is distinct from b->>'commandHash' then raise exception 'REQUEST_ID_REUSED'; end if;
  end if;
  return jsonb_build_object('version', coalesce(s.version, 0), 'state', s.state,
    'receipt', case when r.request_id is null then null else jsonb_build_object('version', r.version, 'view', r.response_view) end);
end;
$$;

create function public.game_commit(p_payload text, p_signature text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b jsonb; cid uuid; current_rep integer; v_version bigint; expected bigint;
  request_uuid uuid; r game_private.receipts; next_state jsonb; item jsonb;
begin
  b := game_private.verify(p_payload, p_signature, 'commit');
  -- Lock the career even before the first session exists: two initializations
  -- cannot both set reputation or create a session.
  select id, reputation into cid, current_rep from public.careers where user_id = auth.uid() for update;
  if cid is null then raise exception 'CAREER_REQUIRED'; end if;
  request_uuid := (b->>'requestId')::uuid;
  select * into r from game_private.receipts where career_id = cid and request_id = request_uuid;
  if found then
    if r.command_hash is distinct from b->>'commandHash' then raise exception 'REQUEST_ID_REUSED'; end if;
    return jsonb_build_object('version', r.version, 'view', r.response_view);
  end if;
  select version into v_version from game_private.sessions where career_id = cid;
  v_version := coalesce(v_version, 0);
  expected := (b->>'expectedVersion')::bigint;
  if expected is null or expected <> v_version then raise exception 'STALE_VERSION'; end if;
  next_state := b->'state';
  if next_state->>'engineVersion' is distinct from 'cp2-v1'
     or next_state->>'datasetCode' is distinct from 'cp2-synthetic-v1'
     or next_state->>'reputation' is null
     or (next_state->>'reputation')::integer not between 0 and 100
     or jsonb_typeof(next_state->'results') is distinct from 'array'
     or jsonb_typeof(b->'view') is distinct from 'object' then
    raise exception 'INVALID_SERVER_STATE';
  end if;
  -- Signed transitions only; reputation shares the existing trusted write path.
  perform public.advance_career_reputation((next_state->>'reputation')::integer - current_rep);
  if v_version = 0 then
    update public.careers set dataset_version_id =
      (select id from public.dataset_versions where code = 'cp2-synthetic-v1') where id = cid;
  end if;
  insert into game_private.sessions(career_id, version, state)
    values (cid, v_version + 1, next_state)
    on conflict (career_id) do update set version = excluded.version, state = excluded.state, updated_at = now();
  for item in select value from jsonb_array_elements(next_state->'results') loop
    insert into game_private.match_results(career_id, season, fixture_id, round, home_goals, away_goals, result)
      values (cid, (next_state->>'season')::integer, item->>'id', (item->>'round')::integer,
        (item->>'homeGoals')::integer, (item->>'awayGoals')::integer, item)
      on conflict (career_id, season, fixture_id) do nothing;
    if exists (
      select 1 from game_private.match_results
      where career_id = cid and season = (next_state->>'season')::integer
        and fixture_id = item->>'id' and result <> item
    ) then
      raise exception 'RESULT_CONFLICT';
    end if;
  end loop;
  insert into game_private.receipts(career_id, request_id, command_hash, command, version, response_view)
    values (cid, request_uuid, b->>'commandHash', b->'command', v_version + 1, b->'view');
  return jsonb_build_object('version', v_version + 1, 'view', b->'view');
end;
$$;
revoke all on function public.game_read(text,text) from public, anon, authenticated, service_role;
revoke all on function public.game_commit(text,text) from public, anon, authenticated, service_role;
grant execute on function public.game_read(text,text) to authenticated;
grant execute on function public.game_commit(text,text) to authenticated;
