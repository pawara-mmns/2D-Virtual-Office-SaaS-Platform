-- Read-only catalog/aggregate audit: no emails, user rows, hashes or tokens.
select jsonb_build_object(
  'migration_versions',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
  'relations',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'owner',pg_get_userbyid(c.relowner))),'[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='public' and c.relname='organization_invitations')
      or (n.nspname='private' and c.relname='organization_team_events')),
  'functions',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
      'definer',p.prosecdef,'config',p.proconfig,'owner',pg_get_userbyid(p.proowner),
      'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'public_execute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'))),'[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='private' and p.proname in ('team_role','team_lock','team_rate_limit','team_seats','team_protect_owner')) or
    (n.nspname='public' and p.proname in ('list_organization_members','create_organization_invitation','resend_organization_invitation',
      'record_invitation_delivery','revoke_organization_invitation','preview_organization_invitation','accept_organization_invitation',
      'update_organization_member_role','remove_organization_member','transfer_organization_ownership'))),
  'constraints',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid))),'[]'::jsonb)
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' and c.relname='organization_invitations') or (n.nspname='private' and c.relname='organization_team_events')),
  'policies',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from pg_policies p where schemaname='public' and tablename='organization_invitations'),
  'indexes',(select coalesce(jsonb_agg(jsonb_build_object('table',t.relname,'name',c.relname,'valid',i.indisvalid,'unique',i.indisunique,'definition',pg_get_indexdef(c.oid))),'[]'::jsonb)
    from pg_index i join pg_class c on c.oid=i.indexrelid join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace
    where (n.nspname='public' and t.relname='organization_invitations') or (n.nspname='private' and t.relname='organization_team_events')),
  'privilege_assertions',case when to_regclass('public.organization_invitations') is null then null else jsonb_build_object(
    'anon_cannot_read_invitations',not has_any_column_privilege('anon','public.organization_invitations','SELECT'),
    'authenticated_can_read_safe_columns',has_column_privilege('authenticated','public.organization_invitations','id','SELECT') and has_column_privilege('authenticated','public.organization_invitations','email','SELECT'),
    'authenticated_cannot_read_token_hash',not has_column_privilege('authenticated','public.organization_invitations','token_hash','SELECT'),
    'authenticated_cannot_read_provider_id',not has_column_privilege('authenticated','public.organization_invitations','provider_message_id','SELECT'),
    'authenticated_cannot_write_invitations',not (has_any_column_privilege('authenticated','public.organization_invitations','INSERT,UPDATE') or has_table_privilege('authenticated','public.organization_invitations','DELETE')),
    'anon_cannot_write_invitations',not (has_any_column_privilege('anon','public.organization_invitations','INSERT,UPDATE') or has_table_privilege('anon','public.organization_invitations','DELETE')),
    'authenticated_cannot_read_audit',not has_any_column_privilege('authenticated','private.organization_team_events','SELECT'),
    'anon_cannot_read_audit',not has_any_column_privilege('anon','private.organization_team_events','SELECT'),
    'authenticated_cannot_write_audit',not (has_any_column_privilege('authenticated','private.organization_team_events','INSERT,UPDATE') or has_table_privilege('authenticated','private.organization_team_events','DELETE')),
    'anon_cannot_write_audit',not (has_any_column_privilege('anon','private.organization_team_events','INSERT,UPDATE') or has_table_privilege('anon','private.organization_team_events','DELETE'))
  ) end,
  'triggers',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled)),'[]'::jsonb)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal
      and t.tgname in ('organization_members_protect_owner','organization_invitations_updated_at')),
  'audit_direct_policies',(select count(*) from pg_policies where schemaname='private' and tablename='organization_team_events'),
  'existing_over_capacity_organizations',(select count(*) from (select organization_id from public.organization_members where status='ACTIVE' group by organization_id having count(*)>10) x),
  'existing_active_organizations_without_owner',(select count(*) from public.organizations o where o.status='ACTIVE' and not exists
    (select 1 from public.organization_members m where m.organization_id=o.id and m.status='ACTIVE' and m.role='OWNER'))
) as team_schema_audit;
