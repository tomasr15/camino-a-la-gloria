-- CP2 real dataset: Liga Profesional Argentina 2024 squads from API-Football,
-- built by scripts/import-dataset.mjs. Additive: the synthetic row stays for
-- history, but new transitions must use the real dataset.
insert into public.dataset_versions (id, code, season, source, is_synthetic)
values ('00000000-0000-4000-8000-000000000008', 'cp2-real-v1', 2024,
        'api-football:league-128:season-2024:fce9dc52fa6a7892', false)
on conflict (code) do nothing;

create or replace function public.game_commit(p_payload text, p_signature text)
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
     or next_state->>'datasetCode' is distinct from 'cp2-real-v1'
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
      (select id from public.dataset_versions where code = 'cp2-real-v1') where id = cid;
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
