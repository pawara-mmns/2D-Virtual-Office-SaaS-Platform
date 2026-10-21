-- Catalog-only inspection: no profile/Auth rows or writes.
select jsonb_build_object(
  'rls_enabled', (select relrowsecurity from pg_class where oid='public.profiles'::regclass),
  'avatar_column_exists', exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar_key' and data_type='text'),
  'authenticated_select', has_column_privilege('authenticated','public.profiles','avatar_key','SELECT'),
  'authenticated_update_avatar', has_column_privilege('authenticated','public.profiles','avatar_key','UPDATE'),
  'authenticated_insert_id', has_column_privilege('authenticated','public.profiles','id','INSERT'),
  'authenticated_insert_avatar', has_column_privilege('authenticated','public.profiles','avatar_key','INSERT'),
  'id_update_denied', not has_column_privilege('authenticated','public.profiles','id','UPDATE'),
  'anonymous_update_denied', not has_column_privilege('anon','public.profiles','avatar_key','UPDATE'),
  'policies', (select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check) order by policyname) from pg_policies where schemaname='public' and tablename='profiles')
) as avatar_schema_audit;
