-- Depends on CP2-02. Every RPC requires the authenticated user's JWT AND the
-- server signature. Clients cannot reserve quota, invent context or save prose.
create schema narrative_private;
revoke all on schema narrative_private from public, anon, authenticated, service_role;
create table narrative_private.config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  daily_limit integer not null default 0 check (daily_limit between 0 and 10000),
  minute_limit integer not null default 0 check (minute_limit between 0 and 1000)
);
insert into narrative_private.config(singleton) values (true);
create table narrative_private.usage (
  day date primary key,
  attempts integer not null default 0,
  reported_tokens bigint not null default 0,
  unknown_usage integer not null default 0
);
create table narrative_private.events (
  career_id uuid not null,
  season integer not null,
  fixture_id text not null,
  entry jsonb not null,
  ticket uuid unique,
  reserved_at timestamptz,
  completed_at timestamptz,
  model text,
  prompt_version text,
  tokens bigint,
  primary key (career_id, season, fixture_id),
  foreign key (career_id, season, fixture_id) references game_private.match_results(career_id, season, fixture_id)
);
create index narrative_reservations on narrative_private.events(reserved_at) where ticket is not null;
alter table narrative_private.config enable row level security;
alter table narrative_private.usage enable row level security;
alter table narrative_private.events enable row level security;
revoke all on all tables in schema narrative_private from public, anon, authenticated, service_role;

create function public.narrative_read(p_payload text, p_signature text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b jsonb; cid uuid; r game_private.match_results; saved jsonb;
begin
  b := game_private.verify(p_payload, p_signature, 'narrative_read');
  select id into cid from public.careers where user_id = auth.uid();
  select * into r from game_private.match_results
    where career_id = cid and season = (b->>'season')::integer and fixture_id = b->>'fixtureId';
  if not found then raise exception 'RESULT_NOT_FOUND'; end if;
  select entry into saved from narrative_private.events
    where career_id = cid and season = r.season and fixture_id = r.fixture_id;
  return jsonb_build_object('matchId', cid::text || '/' || r.season::text || '/' || r.fixture_id,
    'result', r.result, 'entry', saved);
end;
$$;

create function public.narrative_reserve(p_payload text, p_signature text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b jsonb; cid uuid; cfg narrative_private.config; r game_private.match_results;
  existing jsonb; fallback jsonb; attempt uuid; reason text;
  today date := (clock_timestamp() at time zone 'UTC')::date; used integer; recent integer;
begin
  b := game_private.verify(p_payload, p_signature, 'narrative_reserve');
  select id into cid from public.careers where user_id = auth.uid();
  select * into r from game_private.match_results
    where career_id = cid and season = (b->>'season')::integer and fixture_id = b->>'fixtureId';
  if not found then raise exception 'RESULT_NOT_FOUND'; end if;
  -- Shared lock serializes the check+increment across ALL users and workers.
  select * into cfg from narrative_private.config where singleton for update;
  if not found then raise exception 'QUOTA_NOT_CONFIGURED'; end if;
  select entry into existing from narrative_private.events
    where career_id = cid and season = r.season and fixture_id = r.fixture_id;
  if found then return jsonb_build_object('entry', existing, 'ticket', null); end if;
  fallback := b->'fallback';
  if fallback->>'source' is distinct from 'fallback'
    or fallback->'narrative'->>'matchId' is distinct from cid::text || '/' || r.season::text || '/' || r.fixture_id
    or jsonb_typeof(fallback->'narrative'->'body') is distinct from 'string'
    or length(fallback->'narrative'->>'body') > 2000 then raise exception 'INVALID_NARRATIVE'; end if;
  select attempts into used from narrative_private.usage where day = today;
  select count(*) into recent from narrative_private.events
    where ticket is not null and reserved_at > clock_timestamp() - interval '1 minute';
  if b->>'enabled' is distinct from 'true' then reason := 'not_configured';
  elsif not cfg.enabled then reason := 'disabled';
  elsif coalesce(used, 0) >= cfg.daily_limit or recent >= cfg.minute_limit then reason := 'quota_exhausted';
  else
    reason := 'pending'; attempt := gen_random_uuid();
    insert into narrative_private.usage(day, attempts, unknown_usage) values (today, 1, 1)
      on conflict (day) do update set attempts = narrative_private.usage.attempts + 1,
        unknown_usage = narrative_private.usage.unknown_usage + 1;
  end if;
  fallback := jsonb_set(fallback, '{reason}', to_jsonb(reason));
  insert into narrative_private.events(career_id, season, fixture_id, entry, ticket, reserved_at, model, prompt_version)
    values (cid, r.season, r.fixture_id, fallback, attempt, case when attempt is not null then clock_timestamp() end,
      b->>'model', b->>'promptVersion');
  return jsonb_build_object('entry', fallback, 'ticket', attempt);
end;
$$;

create function public.narrative_finish(p_payload text, p_signature text)
returns void language plpgsql security definer set search_path = '' as $$
declare b jsonb; cid uuid; e narrative_private.events; n bigint; entry jsonb;
begin
  b := game_private.verify(p_payload, p_signature, 'narrative_finish');
  select id into cid from public.careers where user_id = auth.uid();
  select * into e from narrative_private.events
    where career_id = cid and ticket = (b->>'ticket')::uuid for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if e.completed_at is not null then return; end if;
  entry := b->'entry'; n := (b->>'tokens')::bigint;
  if entry->>'source' is null or entry->>'source' not in ('gemini', 'fallback')
     or entry->'narrative'->>'matchId' is distinct from e.entry->'narrative'->>'matchId'
     or jsonb_typeof(entry->'narrative'->'body') is distinct from 'string'
     or length(entry->'narrative'->>'body') > 2000 or n < 0 then raise exception 'INVALID_NARRATIVE'; end if;
  update narrative_private.events set entry = b->'entry', tokens = n, completed_at = clock_timestamp()
    where ticket = e.ticket;
  update narrative_private.usage set reported_tokens = reported_tokens + coalesce(n, 0),
    unknown_usage = unknown_usage - case when n is not null then 1 else 0 end
    where day = (e.reserved_at at time zone 'UTC')::date;
end;
$$;
revoke all on function public.narrative_read(text,text) from public, anon, authenticated, service_role;
revoke all on function public.narrative_reserve(text,text) from public, anon, authenticated, service_role;
revoke all on function public.narrative_finish(text,text) from public, anon, authenticated, service_role;
grant execute on function public.narrative_read(text,text) to authenticated;
grant execute on function public.narrative_reserve(text,text) to authenticated;
grant execute on function public.narrative_finish(text,text) to authenticated;
