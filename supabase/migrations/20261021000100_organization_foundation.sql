-- Additive foundation. Apply only after reviewing the linked DEVELOPMENT target
-- and migration history. Existing tables/functions with these names cause failure
-- rather than being overwritten. No Auth internals or existing records changed.
begin;

create schema if not exists private;

create table public.profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  avatar_key text check (avatar_key is null or char_length(avatar_key) between 1 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  slug text not null unique check (char_length(slug) <= 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  creation_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_creator_request_key unique (created_by, creation_request_id)
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN', 'MEMBER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint organization_members_organization_user_key unique (organization_id, user_id)
);

create index organization_members_user_active_idx
  on public.organization_members (user_id, organization_id) where status = 'ACTIVE';

create table public.offices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function private.organization_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.organization_touch_updated_at();
create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.organization_touch_updated_at();
create trigger offices_updated_at before update on public.offices
  for each row execute function private.organization_touch_updated_at();

-- Fixed-caller, read-only helpers avoid membership-policy recursion. They do not
-- accept a user_id and live outside the exposed API schema. The migration owner
-- must be the database migration role (postgres), which can inspect RLS tables.
create function private.organization_is_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_members as m
    join public.organizations as o on o.id = m.organization_id
    where m.organization_id = p_organization_id and m.user_id = auth.uid()
      and m.status = 'ACTIVE' and o.status = 'ACTIVE'
  );
$$;

create function private.organization_can_manage(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_members as m
    join public.organizations as o on o.id = m.organization_id
    where m.organization_id = p_organization_id and m.user_id = auth.uid()
      and m.status = 'ACTIVE' and o.status = 'ACTIVE' and m.role in ('OWNER', 'ADMIN')
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.offices enable row level security;

revoke all on public.profiles, public.organizations, public.organization_members, public.offices
  from public, anon, authenticated;
grant select on public.profiles, public.organizations, public.organization_members, public.offices to authenticated;
grant insert (id, display_name, avatar_key) on public.profiles to authenticated;
grant update (display_name, avatar_key) on public.profiles to authenticated;
grant update (name) on public.organizations, public.offices to authenticated;

create policy profiles_read_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy organizations_read_member on public.organizations for select to authenticated
  using (private.organization_is_member(id));
create policy organizations_rename_manager on public.organizations for update to authenticated
  using (private.organization_can_manage(id)) with check (private.organization_can_manage(id));
create policy organization_members_read_member on public.organization_members for select to authenticated
  using (private.organization_is_member(organization_id));
create policy offices_read_member on public.offices for select to authenticated
  using (private.organization_is_member(organization_id));
create policy offices_rename_manager on public.offices for update to authenticated
  using (private.organization_can_manage(organization_id))
  with check (private.organization_can_manage(organization_id));

-- No INSERT/UPDATE/DELETE grants or policies for membership. No organization or
-- office INSERT grant. Roles, status, tenant IDs and timestamps are not writable.
revoke all on function private.organization_touch_updated_at() from public, anon, authenticated;
revoke all on function private.organization_is_member(uuid) from public, anon, authenticated;
revoke all on function private.organization_can_manage(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.organization_is_member(uuid), private.organization_can_manage(uuid) to authenticated;

create function public.create_organization(p_name text, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_base_slug text;
  v_slug text;
  v_organization_id uuid;
  v_existing public.organizations%rowtype;
  v_constraint text;
begin
  if v_user_id is null or auth.role() is distinct from 'authenticated' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users as u where u.id = v_user_id
      and u.email_confirmed_at is not null and u.deleted_at is null
  ) then
    raise exception 'Verified email required' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 or v_name ~ '[[:cntrl:]]' or p_request_id is null then
    raise exception 'Invalid organization input' using errcode = '22023';
  end if;

  -- Serialize retries of this user's request. Hash collisions only serialize
  -- unrelated requests; the actual idempotency key has an exact unique constraint.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.organizations
    where created_by = v_user_id and creation_request_id = p_request_id;
  if found then
    if v_existing.name <> v_name or not private.organization_is_member(v_existing.id) then
      raise exception 'Request cannot be reused' using errcode = '22023';
    end if;
    return v_existing.id;
  end if;

  v_base_slug := btrim(pg_catalog.regexp_replace(pg_catalog.lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  v_base_slug := coalesce(nullif(v_base_slug, ''), 'workspace');
  v_base_slug := left(v_base_slug, 50);
  v_base_slug := rtrim(v_base_slug, '-');

  insert into public.profiles (id) values (v_user_id) on conflict (id) do nothing;
  for attempt in 1..5 loop
    v_slug := v_base_slug || '-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
    begin
      insert into public.organizations (name, slug, created_by, creation_request_id)
      values (v_name, v_slug, v_user_id, p_request_id) returning id into v_organization_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = CONSTRAINT_NAME;
      if v_constraint <> 'organizations_slug_key' then raise; end if;
      if attempt = 5 then raise exception 'Slug allocation failed' using errcode = '23505'; end if;
    end;
  end loop;
  insert into public.organization_members (organization_id, user_id, role)
    values (v_organization_id, v_user_id, 'OWNER');
  insert into public.offices (organization_id, name) values (v_organization_id, 'Main office');
  return v_organization_id;
end;
$$;

revoke all on function public.create_organization(text, uuid) from public, anon, authenticated;
grant execute on function public.create_organization(text, uuid) to authenticated;

comment on function public.create_organization(text, uuid) is
  'Verified caller only. Atomic organization, OWNER and office creation; caller-scoped idempotent request UUID.';

commit;
