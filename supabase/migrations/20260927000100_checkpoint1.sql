-- Additive initial schema. No existing resources are modified or removed.
create table public.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  season integer not null check (season between 1900 and 2200),
  source text not null,
  is_synthetic boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.careers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  dataset_version_id uuid not null references public.dataset_versions(id),
  manager_name text not null check (char_length(btrim(manager_name)) between 2 and 60),
  reputation integer not null default 0 check (reputation between 0 and 100),
  created_at timestamptz not null default now(),
  constraint one_career_per_user unique (user_id)
);

alter table public.dataset_versions enable row level security;
alter table public.careers enable row level security;
revoke all on public.dataset_versions from anon, authenticated;
revoke all on public.careers from anon, authenticated;
grant select on public.dataset_versions to anon, authenticated;
grant select on public.careers to authenticated;
-- Column-level privilege prevents clients from assigning reputation or ids.
grant insert (user_id, dataset_version_id, manager_name) on public.careers to authenticated;

create policy dataset_read on public.dataset_versions for select to anon, authenticated using (true);
create policy career_read_own on public.careers for select to authenticated
  using ((select auth.uid()) = user_id);
create policy career_create_own on public.careers for insert to authenticated
  with check ((select auth.uid()) = user_id);

comment on table public.dataset_versions is 'Immutable dataset metadata; CP1 includes synthetic infrastructure fixture only.';
comment on table public.careers is 'One private career per user. Gameplay mutations are not exposed in CP1.';

insert into public.dataset_versions (id, code, season, source, is_synthetic)
values ('00000000-0000-4000-8000-000000000001', 'cp1-infrastructure-fixture-v1', 2026, 'synthetic-infrastructure-test', true);
