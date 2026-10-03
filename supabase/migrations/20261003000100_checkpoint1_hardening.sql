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
