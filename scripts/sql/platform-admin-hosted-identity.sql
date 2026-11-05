-- Identity-only setup. Applied to the linked hosted project with user approval on 2026-11-05.
-- Contains no tenant-table grants/policies/triggers and no Supabase Auth dependency.
-- Requires explicit authorization for any other hosted project; not an automatic migration.
-- Provision a dedicated restricted LOGIN separately; preserve the MFA encryption key.
begin;
create schema platform_private;
revoke all on schema platform_private from public, anon, authenticated;
-- A separate DB login must be provisioned out of band and granted this role.
-- No passwords, LOGIN roles or service_role grants are shipped in migrations.
create role platform_admin_runtime nologin;
grant usage on schema platform_private to platform_admin_runtime;

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
-- Explicit runtime policies; no anon/authenticated/service-role path into identities.
create policy admin_runtime on platform_private.platform_admins to platform_admin_runtime using(true) with check(true);
create policy session_runtime on platform_private.platform_admin_sessions to platform_admin_runtime using(true) with check(true);
create policy throttle_runtime on platform_private.platform_admin_throttles to platform_admin_runtime using(true) with check(true);
create policy audit_runtime on platform_private.platform_admin_audit_logs to platform_admin_runtime using(true) with check(true);
create policy settings_runtime on platform_private.platform_settings to platform_admin_runtime using(true) with check(true);
revoke all on all tables in schema platform_private from public,anon,authenticated;
revoke all on all functions in schema platform_private from public,anon,authenticated;
grant select,insert,update on platform_private.platform_admins,platform_private.platform_admin_sessions,
  platform_private.platform_admin_throttles,platform_private.platform_settings to platform_admin_runtime;
grant select,insert on platform_private.platform_admin_audit_logs to platform_admin_runtime;
grant usage on all sequences in schema platform_private to platform_admin_runtime;
grant execute on all functions in schema platform_private to platform_admin_runtime;

commit;
