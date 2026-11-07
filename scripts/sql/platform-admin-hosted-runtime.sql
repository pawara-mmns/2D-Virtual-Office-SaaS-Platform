-- Run only after authorized identity-only setup. The caller MUST capture stdout:
-- the final row contains a newly generated database credential, never a user password.
-- The batch is one implicit transaction; the last SELECT returns the credential.
create function pg_temp.provision_platform_admin_runtime() returns text language plpgsql as $$
declare runtime_password text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  if exists(select 1 from pg_roles where rolname='platform_admin_hosted') then
    raise exception 'Hosted runtime login already exists; recover saved configuration instead of rotating it';
  end if;
  execute format('create role platform_admin_hosted login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 8 password %L',
    runtime_password);
  grant platform_admin_runtime to platform_admin_hosted;
  return runtime_password;
end $$;
select pg_temp.provision_platform_admin_runtime() as runtime_password;
