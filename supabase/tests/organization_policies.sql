-- Run ONLY on an approved isolated development database AFTER the migration.
-- Uses three existing, independently registered/confirmed Auth users; never
-- inserts/updates auth.users. All application fixtures and test DDL roll back.
-- psql variables: confirm_development=yes, user_a, user_b, user_c.
\set ON_ERROR_STOP on
begin;

select pg_catalog.set_config('virtual_office.test_development', :'confirm_development', true);
do $$ begin
  if current_setting('virtual_office.test_development') <> 'yes' then
    raise exception 'Explicit development test approval required';
  end if;
end $$;

create temporary table organization_test_context (
  user_a uuid, user_b uuid, user_c uuid,
  request_a uuid default gen_random_uuid(), request_b uuid default gen_random_uuid(),
  request_extra uuid default gen_random_uuid(), request_rollback uuid default gen_random_uuid(),
  organization_a uuid, organization_b uuid, organization_extra uuid,
  members_before integer, profiles_before integer
);
insert into organization_test_context (user_a, user_b, user_c)
  values (:'user_a'::uuid, :'user_b'::uuid, :'user_c'::uuid);
grant select, update on organization_test_context to authenticated;

do $$ begin
  if (select count(distinct u.id) from auth.users as u, pg_temp.organization_test_context as c
      where u.id in (c.user_a, c.user_b, c.user_c) and u.email_confirmed_at is not null and u.deleted_at is null) <> 3 then
    raise exception 'Three distinct existing verified test users are required';
  end if;
end $$;

create function pg_temp.assert_true(ok boolean, description text)
returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %', description; end if;
  raise notice 'PASS: %', description;
end $$;
grant execute on function pg_temp.assert_true(boolean, text) to authenticated, anon;

-- User A: caller identity, OWNER assignment, office, duplicate requests and names.
select set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true)
  from organization_test_context;
set local role authenticated;
update pg_temp.organization_test_context set organization_a = public.create_organization('Policy test workspace', request_a);
select pg_temp.assert_true(
  public.create_organization('Policy test workspace', request_a) = organization_a,
  'retry returns the same organization') from pg_temp.organization_test_context;
select pg_temp.assert_true(
  (select count(*) from public.organization_members where organization_id = c.organization_a and user_id = c.user_a and role = 'OWNER') = 1,
  'creator is exactly one OWNER') from pg_temp.organization_test_context c;
select pg_temp.assert_true(
  (select count(*) from public.offices where organization_id = c.organization_a) = 1,
  'exactly one default office') from pg_temp.organization_test_context c;
select pg_temp.assert_true(
  (select count(*) from public.organizations where created_by = c.user_a and creation_request_id = c.request_a) = 1,
  'retry creates no duplicate') from pg_temp.organization_test_context c;
update pg_temp.organization_test_context set organization_extra = public.create_organization('Policy test workspace', request_extra);
select pg_temp.assert_true(
  (select count(distinct slug) from public.organizations where id in (c.organization_a, c.organization_extra)) = 2,
  'duplicate names receive unique slugs') from pg_temp.organization_test_context c;
do $$ begin
  begin
    perform public.create_organization('Changed request name', (select request_a from pg_temp.organization_test_context));
    raise exception 'FAIL: a request key was reused with different input';
  exception when invalid_parameter_value then raise notice 'PASS: changed idempotent request rejected'; end;
end $$;
reset role;
do $$ declare failed_constraint text; begin
  begin
    insert into public.organizations (name, slug, created_by, creation_request_id)
      select 'Slug constraint test', o.slug, c.user_a, gen_random_uuid()
      from public.organizations o, pg_temp.organization_test_context c where o.id = c.organization_a;
    raise exception 'FAIL: duplicate slug permitted';
  exception when unique_violation then
    get stacked diagnostics failed_constraint = CONSTRAINT_NAME;
    perform pg_temp.assert_true(failed_constraint = 'organizations_slug_key', 'duplicate slug rejected by unique constraint');
  end;
end $$;

-- User B: unrelated organization is not visible.
reset role;
select set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true)
  from organization_test_context;
set local role authenticated;
update pg_temp.organization_test_context set organization_b = public.create_organization('Policy test workspace', request_b);
select pg_temp.assert_true(not exists (select 1 from public.organizations where id = c.organization_a), 'B cannot read organization A') from pg_temp.organization_test_context c;
select pg_temp.assert_true(not exists (select 1 from public.offices where organization_id = c.organization_a), 'B cannot read A offices') from pg_temp.organization_test_context c;
select pg_temp.assert_true(not exists (select 1 from public.organization_members where organization_id = c.organization_a), 'B cannot read A members') from pg_temp.organization_test_context c;
select pg_temp.assert_true(not exists (select 1 from public.profiles where id = c.user_a), 'B cannot read A profile') from pg_temp.organization_test_context c;
do $$ declare changed integer; begin
  update public.organizations set name = 'Cross-tenant rename' where id = (select organization_a from pg_temp.organization_test_context);
  get diagnostics changed = row_count;
  perform pg_temp.assert_true(changed = 0, 'cross-tenant rename denied');
  update public.organizations set name = 'Owner rename' where id = (select organization_b from pg_temp.organization_test_context);
  get diagnostics changed = row_count;
  perform pg_temp.assert_true(changed = 1, 'OWNER can rename its own organization');
end $$;
do $$ begin
  begin
    update public.organization_members set role = 'OWNER';
    raise exception 'FAIL: role escalation permitted';
  exception when insufficient_privilege then raise notice 'PASS: role escalation denied'; end;
  begin
    insert into public.organization_members (organization_id, user_id, role)
      select organization_a, user_b, 'OWNER' from pg_temp.organization_test_context;
    raise exception 'FAIL: forged membership permitted';
  exception when insufficient_privilege then raise notice 'PASS: forged membership denied'; end;
  begin
    insert into public.offices (organization_id, name) select organization_a, 'Illegal' from pg_temp.organization_test_context;
    raise exception 'FAIL: cross-tenant office insertion permitted';
  exception when insufficient_privilege then raise notice 'PASS: cross-tenant office insertion denied'; end;
end $$;

-- Test fixture administrator adds C to both organizations. This is test-only
-- setup, not an application role-management or invitation API.
reset role;
insert into public.organization_members (organization_id, user_id, role)
  select organization_a, user_c, 'MEMBER' from organization_test_context
  union all select organization_b, user_c, 'ADMIN' from organization_test_context;
select set_config('request.jwt.claims', json_build_object('sub', user_c, 'role', 'authenticated')::text, true)
  from organization_test_context;
set local role authenticated;
select pg_temp.assert_true((select count(*) from public.organizations where id in (c.organization_a, c.organization_b)) = 2,
  'C can access and switch between both organizations') from pg_temp.organization_test_context c;
do $$ declare changed integer; begin
  update public.organizations set name = 'Not allowed' where id = (select organization_a from pg_temp.organization_test_context);
  get diagnostics changed = row_count;
  perform pg_temp.assert_true(changed = 0, 'MEMBER cannot rename an organization');
  update public.organizations set name = 'Admin rename' where id = (select organization_b from pg_temp.organization_test_context);
  get diagnostics changed = row_count;
  perform pg_temp.assert_true(changed = 1, 'ADMIN can rename its own organization');
end $$;

-- Disable C's B membership and ensure access is immediately removed.
reset role;
update public.organization_members set status = 'INACTIVE'
  where organization_id = (select organization_b from organization_test_context)
    and user_id = (select user_c from organization_test_context);
set local role authenticated;
select pg_temp.assert_true(not exists (select 1 from public.organizations where id = c.organization_b), 'inactive membership denies access') from pg_temp.organization_test_context c;

-- Force the final provisioning step to fail and confirm complete rollback.
reset role;
update organization_test_context set members_before = (select count(*) from public.organization_members), profiles_before = (select count(*) from public.profiles);
create function pg_temp.fail_test_office() returns trigger language plpgsql as $$ begin
  if exists (select 1 from public.organizations where id = new.organization_id and name = 'Rollback policy test') then
    raise exception 'Intentional isolated test failure' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger organization_policy_test_office_failure before insert on public.offices
  for each row execute function pg_temp.fail_test_office();
set local role authenticated;
do $$ begin
  begin
    perform public.create_organization('Rollback policy test', (select request_rollback from pg_temp.organization_test_context));
    raise exception 'FAIL: expected office failure';
  exception when check_violation then raise notice 'PASS: failed office insert aborts provisioning'; end;
end $$;
reset role;
select pg_temp.assert_true(not exists (select 1 from public.organizations where creation_request_id = c.request_rollback), 'failed organization insert rolled back') from organization_test_context c;
select pg_temp.assert_true((select count(*) from public.organization_members) = c.members_before, 'failed OWNER insert rolled back') from organization_test_context c;
select pg_temp.assert_true((select count(*) from public.profiles) = c.profiles_before, 'failed profile creation rolled back') from organization_test_context c;

-- Anonymous API role has no tenant data or provisioning privileges.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  begin
    perform * from public.organizations;
    raise exception 'FAIL: anonymous read permitted';
  exception when insufficient_privilege then raise notice 'PASS: anonymous reads denied'; end;
  begin
    perform public.create_organization('Anonymous', gen_random_uuid());
    raise exception 'FAIL: anonymous provisioning permitted';
  exception when insufficient_privilege then raise notice 'PASS: anonymous RPC denied'; end;
end $$;
reset role;
rollback;
\echo 'Organization policy test transaction rolled back. Inspect PASS notices; ON_ERROR_STOP aborts on failure.'
