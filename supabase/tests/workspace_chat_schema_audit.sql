-- Read-only catalog inspection; no application rows or Auth identities returned.
select jsonb_build_object(
  'organization_tables', (select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('organizations','organization_members','offices','profiles') and c.relrowsecurity),
  'team_helpers', (select jsonb_agg(p.proname order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('team_role','team_lock')),
  'chat_name_conflicts', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('chat_channels','chat_messages')),
  'chat_function_conflicts', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('send_office_chat_message','list_office_chat_messages','chat_provision_office','chat_can_read')),
  'office_unique_constraints', (select jsonb_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid='public.offices'::regclass and contype in ('p','u'))
) as chat_schema_audit;
