-- Hardening of the CP1 schema. Additive only: no column, row, policy or grant is removed.
-- dataset_versions is no longer selectable by anon.
revoke select on public.dataset_versions from anon;

-- Public availability probe. Replaces the anon read: the function returns only a
-- boolean and never exposes dataset rows to an unauthenticated caller.
create or replace function public.dataset_probe()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.dataset_versions where code = 'cp1-infrastructure-fixture-v1');
$$;
revoke all on function public.dataset_probe() from public;
grant execute on function public.dataset_probe() to anon, authenticated;
comment on function public.dataset_probe() is 'Boolean availability probe for health checks; returns no dataset row.';

-- 3. Single write path for careers.reputation. Owner-scoped by the verified JWT, clamped to
--    the check constraint and not granted to any client role: a client could otherwise inflate
--    its own reputation. Reached only from another SECURITY DEFINER function, the CP2 engine.
create or replace function public.advance_career_reputation(p_delta integer)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_reputation integer;
begin
  if p_delta is null then
    raise exception 'reputation delta is required' using errcode = '22023';
  end if;
  if auth.uid() is null then
    raise exception 'reputation change requires an authenticated user' using errcode = '42501';
  end if;
  update public.careers
     set reputation = greatest(0, least(100, reputation + p_delta))
   where user_id = auth.uid()
  returning reputation into v_reputation;
  if v_reputation is null then
    raise exception 'no career for the authenticated user' using errcode = 'P0002';
  end if;
  return v_reputation;
end;
$$;
revoke all on function public.advance_career_reputation(integer) from public;
comment on function public.advance_career_reputation(integer) is 'Adjusts the caller reputation within 0..100; executable only by a SECURITY DEFINER function, never by a client role.';
