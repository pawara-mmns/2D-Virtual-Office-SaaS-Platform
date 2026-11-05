-- Additive only. Reconcile the documented 20261029000100 remote history
-- discrepancy before any remote application. This task uses isolated tests only.
begin;
create schema platform_private;
revoke all on schema platform_private from public, anon, authenticated;
-- A separate DB login must be provisioned out of band and granted this role.
-- No passwords, LOGIN roles or service_role grants are shipped in migrations.
create role platform_admin_runtime nologin;
grant usage on schema platform_private, public, auth, private to platform_admin_runtime;

create table platform_private.platform_admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._@+-]{2,63}$'),
  password_hash text not null check (password_hash like '$argon2id$%'),
  is_active boolean not null default true,
  is_root boolean not null default false,
  mfa_secret_encrypted text,
  mfa_enrolled_at timestamptz,
  last_totp_step bigint not null default -1,
  credential_version integer not null default 1,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index platform_single_root on platform_private.platform_admins(is_root) where is_root;
create table platform_private.platform_admin_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  admin_id uuid not null references platform_private.platform_admins(id),
  credential_version integer not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  mfa_verified_at timestamptz,
  revoked_at timestamptz
);
create index platform_sessions_admin on platform_private.platform_admin_sessions(admin_id, expires_at);
create table platform_private.platform_admin_throttles (
  bucket_hash text primary key,
  window_at timestamptz not null,
  attempts integer not null
);
create table platform_private.platform_admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references platform_private.platform_admins(id),
  action text not null,
  target_type text not null,
  target_id text,
  result text not null check (result in ('success','denied','failed','pending')),
  request_id uuid not null,
  changes jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index platform_audit_recent on platform_private.platform_admin_audit_logs(created_at desc,id desc);
create index platform_audit_action on platform_private.platform_admin_audit_logs(action,created_at desc);
create table platform_private.platform_settings (
  singleton boolean primary key default true check (singleton),
  version integer not null default 1,
  maintenance boolean not null default false,
  registration_enabled boolean not null default true,
  onboarding_enabled boolean not null default true,
  voice_enabled boolean not null default true,
  max_organizations_per_user integer not null default 100 check (max_organizations_per_user between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into platform_private.platform_settings(singleton) values(true);
create table platform_private.organization_features (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  voice_enabled boolean not null default true
);
create table platform_private.user_restrictions (
  user_id uuid primary key references auth.users(id),
  suspended boolean not null default true
);
alter table platform_private.user_restrictions enable row level security;
create policy restriction_runtime on platform_private.user_restrictions to platform_admin_runtime using(true) with check(true);
grant select,insert,update on platform_private.user_restrictions to platform_admin_runtime;
alter table public.offices add column is_available boolean not null default true;

create function platform_private.immutable_audit() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Audit records are append only' using errcode='42501'; end $$;
create trigger platform_audit_immutable before update or delete on platform_private.platform_admin_audit_logs
  for each row execute function platform_private.immutable_audit();
create function platform_private.protect_admin() returns trigger language plpgsql set search_path='' as $$
begin
  -- Serialize ALL administrator lifecycle changes, including concurrent disables.
  perform pg_advisory_xact_lock(90311003);
  if old.is_root and (tg_op='DELETE' or not new.is_active or not new.is_root) then
    raise exception 'Root recovery requires an offline database operator' using errcode='42501';
  end if;
  if old.is_active and (tg_op='DELETE' or not new.is_active) and not exists(
    select 1 from platform_private.platform_admins where id<>old.id and is_active and mfa_enrolled_at is not null
  ) then raise exception 'Cannot remove last administrator' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger platform_admin_protect before update or delete on platform_private.platform_admins
  for each row execute function platform_private.protect_admin();

alter table platform_private.platform_admins enable row level security;
alter table platform_private.platform_admin_sessions enable row level security;
alter table platform_private.platform_admin_throttles enable row level security;
alter table platform_private.platform_admin_audit_logs enable row level security;
alter table platform_private.platform_settings enable row level security;
alter table platform_private.organization_features enable row level security;
-- Explicit runtime policies; no anon/authenticated/service-role path into identities.
create policy admin_runtime on platform_private.platform_admins to platform_admin_runtime using(true) with check(true);
create policy session_runtime on platform_private.platform_admin_sessions to platform_admin_runtime using(true) with check(true);
create policy throttle_runtime on platform_private.platform_admin_throttles to platform_admin_runtime using(true) with check(true);
create policy audit_runtime on platform_private.platform_admin_audit_logs to platform_admin_runtime using(true) with check(true);
create policy settings_runtime on platform_private.platform_settings to platform_admin_runtime using(true) with check(true);
create policy features_runtime on platform_private.organization_features to platform_admin_runtime using(true) with check(true);
revoke all on all tables in schema platform_private from public,anon,authenticated;
revoke all on all functions in schema platform_private from public,anon,authenticated;
grant select,insert,update on platform_private.platform_admins,platform_private.platform_admin_sessions,
  platform_private.platform_admin_throttles,platform_private.platform_settings,platform_private.organization_features to platform_admin_runtime;
grant select,insert on platform_private.platform_admin_audit_logs to platform_admin_runtime;
grant usage on all sequences in schema platform_private to platform_admin_runtime;
grant execute on all functions in schema platform_private to platform_admin_runtime;
create function platform_private.lock_identity(p_user uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=p_user and deleted_at is null for update;
 return found;
end $$;
revoke all on function platform_private.lock_identity(uuid) from public,anon,authenticated;
grant execute on function platform_private.lock_identity(uuid) to platform_admin_runtime;
grant select,insert,update on public.profiles,public.organizations,public.organization_members,public.offices,
  public.office_environment_settings,public.organization_invitations to platform_admin_runtime;
grant select on private.organization_team_events to platform_admin_runtime;
-- The explicit private projection works even when hosted Auth enables RLS on
-- its managed tables. No Auth-table policies/writes or hash access are granted.
create view platform_private.user_directory with (security_barrier=true) as
  select id,email,email_confirmed_at,deleted_at,banned_until,created_at,last_sign_in_at from auth.users;
revoke all on platform_private.user_directory from public,anon,authenticated;
grant select on platform_private.user_directory to platform_admin_runtime;
grant execute on function private.valid_office_environment(jsonb) to platform_admin_runtime;
grant execute on function private.team_seats(uuid) to platform_admin_runtime;
grant execute on function public.create_organization(text,uuid), public.create_organization_invitation(uuid,text,text,text)
  to platform_admin_runtime;
create policy platform_runtime on public.profiles to platform_admin_runtime using(true) with check(true);
create policy platform_runtime on public.organizations to platform_admin_runtime using(true) with check(true);
create policy platform_runtime on public.organization_members to platform_admin_runtime using(true) with check(true);
create policy platform_runtime on public.offices to platform_admin_runtime using(true) with check(true);
create policy platform_runtime on public.office_environment_settings to platform_admin_runtime using(true) with check(true);
create policy platform_runtime on public.organization_invitations to platform_admin_runtime using(true) with check(true);
create policy platform_runtime on private.organization_team_events to platform_admin_runtime using(true);

-- Tenant policies keep their original role model. Suspension, maintenance and
-- account bans are checked even for old JWTs and ongoing realtime revalidation.
create function private.platform_user_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select not (select maintenance from platform_private.platform_settings) and exists (
   select 1 from auth.users where id=auth.uid() and deleted_at is null
     and (banned_until is null or banned_until<=now())
     and not exists(select 1 from platform_private.user_restrictions r where r.user_id=auth.uid() and r.suspended)
 );
$$;
revoke all on function private.platform_user_allowed() from public,anon,authenticated;
create or replace function private.organization_is_member(p_organization_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.platform_user_allowed() and exists(select 1 from public.organization_members m
 join public.organizations o on o.id=m.organization_id where m.organization_id=p_organization_id
 and m.user_id=auth.uid() and m.status='ACTIVE' and o.status='ACTIVE');
$$;
create or replace function private.organization_can_manage(p_organization_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.organization_is_member(p_organization_id) and exists(select 1 from public.organization_members
 where organization_id=p_organization_id and user_id=auth.uid() and status='ACTIVE' and role in ('OWNER','ADMIN'));
$$;
create or replace function private.team_role(p_org uuid) returns text
language sql stable security definer set search_path='' as $$
 select m.role from public.organization_members m join public.organizations o on o.id=m.organization_id
 join auth.users u on u.id=m.user_id where private.platform_user_allowed() and m.organization_id=p_org
 and m.user_id=auth.uid() and m.status='ACTIVE' and o.status='ACTIVE'
 and u.email_confirmed_at is not null and u.deleted_at is null and auth.role()='authenticated';
$$;
create policy office_available on public.offices as restrictive for select to authenticated using(is_available);
-- Also guard existing SECURITY DEFINER provisioning/environment/invitation writes.
create function private.platform_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
   if not private.platform_user_allowed() then raise exception 'Platform access paused' using errcode='42501'; end if;
   if tg_table_name='organizations' and tg_op='INSERT' then
     perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,90311));
     if not (select onboarding_enabled from platform_private.platform_settings)
       or (select count(*) from public.organizations where created_by=auth.uid()) >=
         (select max_organizations_per_user from platform_private.platform_settings) then
       raise exception 'Onboarding unavailable' using errcode='42501'; end if;
   end if;
   if tg_table_name='office_environment_settings' then
     if not exists(select 1 from public.offices o
       where o.id=new.office_id and o.is_available and private.team_role(o.organization_id)='OWNER') then
       raise exception 'Office unavailable' using errcode='42501'; end if;
   end if;
 end if;
 return new;
end $$;
revoke all on function private.platform_write_guard() from public,anon,authenticated;
create trigger platform_org_guard before insert on public.organizations for each row execute function private.platform_write_guard();
create trigger platform_environment_guard before insert or update on public.office_environment_settings for each row execute function private.platform_write_guard();
create trigger platform_invitation_guard before update on public.organization_invitations for each row execute function private.platform_write_guard();
create function private.platform_member_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Lock the identity before promoting it or suspending it. The admin suspension
 -- transaction locks the same row, preserving ownership across both workflows.
 if new.status='ACTIVE' then
   perform 1 from auth.users where id=new.user_id for update;
   if exists(select 1 from platform_private.user_restrictions where user_id=new.user_id and suspended)
     or exists(select 1 from auth.users where id=new.user_id and banned_until>now()) then
     raise exception 'Account suspended' using errcode='42501'; end if;
 end if;
 return new;
end $$;
revoke all on function private.platform_member_guard() from public,anon,authenticated;
create trigger platform_member_guard before insert or update on public.organization_members for each row execute function private.platform_member_guard();

-- Safe, fixed-caller operational projection. No identity secrets or admin status.
create function public.platform_office_access(p_office uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',s.version,'voice_enabled',s.voice_enabled and coalesce(f.voice_enabled,true))
 from public.offices o cross join platform_private.platform_settings s
 left join platform_private.organization_features f on f.organization_id=o.organization_id
 where o.id=p_office and o.is_available and private.team_role(o.organization_id) is not null;
$$;
revoke all on function public.platform_office_access(uuid) from public,anon,authenticated;
grant execute on function public.platform_office_access(uuid) to authenticated;

-- Configure as Supabase Before User Created hook when activating registration
-- controls. The web form also enforces this; direct Auth signup requires this hook.
create function public.platform_before_user_created(event jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select case when registration_enabled and not maintenance then '{}'::jsonb
 else '{"error":{"http_code":403,"message":"Registration is temporarily unavailable."}}'::jsonb end
 from platform_private.platform_settings;
$$;
revoke all on function public.platform_before_user_created(jsonb) from public,anon,authenticated;
-- supabase_auth_admin exists on Supabase; local test creates the same NOLOGIN role.
grant execute on function public.platform_before_user_created(jsonb) to supabase_auth_admin;
commit;
