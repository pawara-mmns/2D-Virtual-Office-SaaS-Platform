-- Read-only metadata checks; does not read or modify tenant records.
select
  to_regclass('public.office_environment_settings') is not null as environment_table_exists,
  to_regprocedure('public.save_office_environment(uuid,integer,jsonb)') is not null as save_rpc_exists,
  (select relrowsecurity from pg_class where oid=to_regclass('public.office_environment_settings')) as row_security_enabled,
  exists(select 1 from pg_policies where schemaname='public' and tablename='office_environment_settings' and policyname='office_environment_read_member') as member_read_policy_exists,
  (select prosecdef from pg_proc where oid=to_regprocedure('public.save_office_environment(uuid,integer,jsonb)')) as rpc_security_definer,
  (select position('OWNER' in pg_get_functiondef(oid))>0 from pg_proc where oid=to_regprocedure('public.save_office_environment(uuid,integer,jsonb)')) as rpc_contains_owner_check,
  has_function_privilege('authenticated','public.save_office_environment(uuid,integer,jsonb)','EXECUTE') as authenticated_rpc_grant,
  not has_function_privilege('anon','public.save_office_environment(uuid,integer,jsonb)','EXECUTE') as anonymous_rpc_denied,
  not has_table_privilege('authenticated','public.office_environment_settings','INSERT,UPDATE,DELETE') as direct_writes_denied;
