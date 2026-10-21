-- Read-only catalog checks. Run remotely only after approved application.
select jsonb_build_object(
 'tables_and_rls',(select count(*)=2 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('chat_channels','chat_messages') and c.relrowsecurity),
 'read_policies',(select count(*)=2 from pg_policies where schemaname='public' and tablename in ('chat_channels','chat_messages') and cmd='SELECT'),
 'no_direct_writes',not has_table_privilege('authenticated','public.chat_messages','INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated','public.chat_channels','INSERT,UPDATE,DELETE'),
 'authenticated_reads',has_table_privilege('authenticated','public.chat_messages','SELECT') and has_table_privilege('authenticated','public.chat_channels','SELECT'),
 'anonymous_denied',not has_table_privilege('anon','public.chat_messages','SELECT') and not has_function_privilege('anon','public.send_office_chat_message(uuid,text,uuid)','EXECUTE') and not has_function_privilege('anon','public.list_office_chat_messages(uuid,text)','EXECUTE'),
 'rpc_grants',has_function_privilege('authenticated','public.send_office_chat_message(uuid,text,uuid)','EXECUTE') and has_function_privilege('authenticated','public.list_office_chat_messages(uuid,text)','EXECUTE'),
 'fixed_function_security',(select count(*)=4 and bool_and(p.prosecdef=(p.proname<>'list_office_chat_messages') and p.proconfig @> array['search_path=""']) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname,p.proname) in (('public','send_office_chat_message'),('public','list_office_chat_messages'),('private','chat_can_read'),('private','chat_provision_office'))),
 'history_and_rate_indexes',to_regclass('public.chat_messages_history_idx') is not null and to_regclass('public.chat_messages_rate_idx') is not null,
 'office_trigger',exists(select 1 from pg_trigger where tgrelid='public.offices'::regclass and tgname='offices_chat_channel' and not tgisinternal),
 'idempotency_constraint',exists(select 1 from pg_constraint where conrelid='public.chat_messages'::regclass and conname='chat_messages_sender_request_key' and contype='u'),
 'validated_constraints',(select count(*)=4 and bool_and(convalidated) from pg_constraint where conrelid in ('public.chat_channels'::regclass,'public.chat_messages'::regclass) and contype='f')
   and exists(select 1 from pg_constraint where conrelid='public.offices'::regclass and conname='offices_id_organization_key' and contype='u' and convalidated),
 'indexes_valid',(select count(*)=2 and bool_and(i.indisvalid and i.indisready) from pg_index i where i.indexrelid in ('public.chat_messages_history_idx'::regclass,'public.chat_messages_rate_idx'::regclass)),
 'no_sequence_access',not has_sequence_privilege('authenticated','public.chat_messages_id_seq','USAGE,SELECT,UPDATE') and not has_sequence_privilege('anon','public.chat_messages_id_seq','USAGE,SELECT,UPDATE'),
 'private_helpers_restricted',not has_function_privilege('anon','private.chat_can_read(uuid)','EXECUTE') and not has_function_privilege('authenticated','private.chat_provision_office()','EXECUTE'),
 'channels_provisioned',not exists(select 1 from public.offices o left join public.chat_channels c on c.office_id=o.id where c.id is null or c.organization_id<>o.organization_id or c.name<>'Office Chat'),
 'existing_foundation_rls',(select count(*)=4 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','organizations','organization_members','offices') and c.relrowsecurity),
 'existing_invitation_rls',exists(select 1 from pg_class where oid='public.organization_invitations'::regclass and relrowsecurity)
) as chat_postflight;
