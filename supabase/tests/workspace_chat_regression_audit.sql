-- Read-only existing-feature catalog checks and aggregate test-account readiness.
-- Never returns emails, UUIDs, invitation tokens, message bodies or Auth records.
select jsonb_build_object(
  'existing_tables_and_rls',(select count(*)=6 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relrowsecurity and (n.nspname,c.relname) in
    (('public','profiles'),('public','organizations'),('public','organization_members'),('public','offices'),('public','organization_invitations'),('private','organization_team_events'))),
  'existing_functions',(select count(*)=11 and bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
    ('create_organization','list_organization_members','create_organization_invitation','resend_organization_invitation','record_invitation_delivery','revoke_organization_invitation','preview_organization_invitation','accept_organization_invitation','update_organization_member_role','remove_organization_member','transfer_organization_ownership')),
  'existing_triggers',(select count(*)=5 and bool_and(tgenabled='O') from pg_trigger where not tgisinternal and (tgrelid,tgname) in
    (('public.profiles'::regclass,'profiles_updated_at'),('public.organizations'::regclass,'organizations_updated_at'),('public.offices'::regclass,'offices_updated_at'),('public.organization_invitations'::regclass,'organization_invitations_updated_at'),('public.organization_members'::regclass,'organization_members_protect_owner'))),
  'existing_policies',(select count(*)=9 from pg_policies where schemaname='public' and policyname in
    ('profiles_read_self','profiles_insert_self','profiles_update_self','organizations_read_member','organizations_rename_manager','organization_members_read_member','offices_read_member','offices_rename_manager','invitations_read_manager')),
  'invitation_hash_hidden',not has_column_privilege('authenticated','public.organization_invitations','token_hash','SELECT') and not has_table_privilege('authenticated','private.organization_team_events','SELECT,INSERT,UPDATE,DELETE'),
  'existing_offices_present',exists(select 1 from public.offices),
  'two_confirmed_members_share_office',exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id join public.offices f on f.organization_id=o.id join auth.users u on u.id=m.user_id where m.status='ACTIVE' and o.status='ACTIVE' and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false) group by o.id having count(distinct m.user_id)>=2)
) as existing_feature_audit;
