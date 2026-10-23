-- Rollback-only. Three explicitly authorized, normally confirmed Auth accounts.
-- No Auth writes or email delivery. Also used by the isolated PostgreSQL suite.
\set ON_ERROR_STOP on
begin;
select set_config('virtual_office.test_development', :'confirm_development', true);
do $$ begin
  if current_setting('virtual_office.test_development')<>'yes' then raise exception 'Development approval required'; end if;
  if to_regclass('public.organization_invitations') is null then raise exception 'Apply the approved Step 4 migration first'; end if;
end $$;
create temporary table team_test_context(user_a uuid,user_b uuid,user_c uuid,email_a text,email_b text,email_c text,
  org_a uuid,org_b uuid,org_existing uuid,invite_a uuid,invite_b uuid,member_a uuid,member_b uuid,member_c uuid);
insert into team_test_context(user_a,user_b,user_c) values(:'user_a'::uuid,:'user_b'::uuid,:'user_c'::uuid);
update team_test_context c set email_a=lower(a.email),email_b=lower(b.email),email_c=lower(d.email)
  from auth.users a,auth.users b,auth.users d where a.id=c.user_a and b.id=c.user_b and d.id=c.user_c
  and a.email_confirmed_at is not null and b.email_confirmed_at is not null and d.email_confirmed_at is not null
  and a.deleted_at is null and b.deleted_at is null and d.deleted_at is null;
do $$ begin
  if exists(select 1 from team_test_context where email_a is null or email_b is null or email_c is null
    or user_a=user_b or user_a=user_c or user_b=user_c or email_a=email_b or email_a=email_c or email_b=email_c) then
    raise exception 'Three distinct authorized verified test users/emails required'; end if;
end $$;
grant select,update on team_test_context to authenticated;
create function pg_temp.team_hash(label text) returns text language sql immutable as $$ select encode(sha256(convert_to(label,'UTF8')),'hex') $$;
create function pg_temp.team_assert(ok boolean,description text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %',description; end if;
  raise notice 'PASS: %',description;
end $$;
create function pg_temp.team_expect(statement text,expected text,description text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual<>expected then raise exception 'FAIL: % (expected %, received %)',description,expected,actual; end if;
    raise notice 'PASS: %',description; return;
  end;
  raise exception 'FAIL: % did not reject',description;
end $$;
grant execute on function pg_temp.team_hash(text),pg_temp.team_assert(boolean,text),pg_temp.team_expect(text,text,text) to authenticated,anon;

select set_config('request.jwt.claims',json_build_object('sub',user_a,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
update pg_temp.team_test_context set org_a=public.create_organization('Invitation policy test A',gen_random_uuid());
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_b,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
update pg_temp.team_test_context set org_b=public.create_organization('Invitation policy test B',gen_random_uuid());
-- B invites A in B, giving an actual row for cross-tenant read tests.
select public.create_organization_invitation(org_b,email_a,'MEMBER',pg_temp.team_hash('b-invites-a')) from pg_temp.team_test_context;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_a,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
update pg_temp.team_test_context set invite_a=(public.create_organization_invitation(org_a,email_c,'MEMBER',pg_temp.team_hash('member-c'))->>'id')::uuid;
select pg_temp.team_assert((select count(*) from public.organization_invitations where organization_id=c.org_a)=1,'OWNER invites MEMBER') from pg_temp.team_test_context c;
select pg_temp.team_assert((select expires_at-created_at from public.organization_invitations where id=c.invite_a)=interval '7 days','default invitation lifetime is seven days') from pg_temp.team_test_context c;
select pg_temp.team_expect(format('select public.create_organization_invitation(%L,%L,''MEMBER'',%L)',org_a,email_c,pg_temp.team_hash('duplicate')),'P0402','duplicate pending invitation rejected') from pg_temp.team_test_context;
select pg_temp.team_expect('select token_hash from public.organization_invitations','42501','managers cannot read token hashes');
select pg_temp.team_assert(not exists(select 1 from public.organization_invitations where organization_id=c.org_b),'cross-tenant invitation reads blocked') from pg_temp.team_test_context c;
select pg_temp.team_expect(format('select public.create_organization_invitation(%L,''outside@example.invalid'',''MEMBER'',%L)',org_b,pg_temp.team_hash('outside')),'42501','A cannot manage organization B') from pg_temp.team_test_context;
select pg_temp.team_assert(public.preview_organization_invitation(pg_temp.team_hash('member-c'))->>'state'='Pending','preview reads pending invitation without accepting');
select pg_temp.team_assert((select accepted_at is null from public.organization_invitations where id=c.invite_a),'preview does not consume token') from pg_temp.team_test_context c;
reset role;
update public.organization_invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 day',last_delivery_at=now()-interval '2 minutes'
  where id=(select invite_a from team_test_context);
select set_config('request.jwt.claims',json_build_object('sub',user_c,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select pg_temp.team_expect(format('select public.accept_organization_invitation(%L)',pg_temp.team_hash('member-c')),'P0404','expired invitation rejected');
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_a,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select public.resend_organization_invitation(org_a,invite_a,pg_temp.team_hash('member-c-rotated')) from pg_temp.team_test_context;
select pg_temp.team_assert(public.preview_organization_invitation(pg_temp.team_hash('member-c')) is null,'resend invalidates previous token');
select pg_temp.team_expect(format('select public.resend_organization_invitation(%L,%L,%L)',org_a,invite_a,pg_temp.team_hash('too-soon')),'P0410','resend cooldown enforced') from pg_temp.team_test_context;
select pg_temp.team_assert(not public.record_invitation_delivery(org_a,invite_a,1,'sent','stale'),'stale delivery generation cannot overwrite new status') from pg_temp.team_test_context;
select public.revoke_organization_invitation(org_a,invite_a) from pg_temp.team_test_context;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_c,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select pg_temp.team_expect(format('select public.accept_organization_invitation(%L)',pg_temp.team_hash('member-c-rotated')),'P0404','revoked invitation rejected');
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_a,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
update pg_temp.team_test_context set invite_a=(public.create_organization_invitation(org_a,email_c,'ADMIN',pg_temp.team_hash('admin-c'))->>'id')::uuid;
select pg_temp.team_assert((select invited_role from public.organization_invitations where id=c.invite_a)='ADMIN','OWNER invites ADMIN') from pg_temp.team_test_context c;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_b,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select pg_temp.team_expect(format('select public.accept_organization_invitation(%L)',pg_temp.team_hash('admin-c')),'P0405','wrong verified email rejected');
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_c,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select pg_temp.team_assert(public.accept_organization_invitation(pg_temp.team_hash('admin-c'))=org_a,'valid invitation accepted') from pg_temp.team_test_context;
select pg_temp.team_assert(public.accept_organization_invitation(pg_temp.team_hash('admin-c'))=org_a,'accepted retry returns same organization') from pg_temp.team_test_context;
select pg_temp.team_assert((select count(*) from public.organization_members where organization_id=c.org_a and user_id=c.user_c)=1,'accepted retry creates one membership') from pg_temp.team_test_context c;
select pg_temp.team_assert(not exists(select 1 from public.organization_invitations where id=c.invite_a),'ADMIN cannot read ADMIN invitation') from pg_temp.team_test_context c;
select pg_temp.team_expect(format('select public.create_organization_invitation(%L,''denied@example.invalid'',''ADMIN'',%L)',org_a,pg_temp.team_hash('admin-denied')),'42501','ADMIN cannot invite ADMIN') from pg_temp.team_test_context;
select pg_temp.team_expect(format('select public.create_organization_invitation(%L,''denied@example.invalid'',''OWNER'',%L)',org_a,pg_temp.team_hash('owner-denied')),'42501','ADMIN cannot invite OWNER') from pg_temp.team_test_context;
update pg_temp.team_test_context set invite_b=(public.create_organization_invitation(org_a,email_b,'MEMBER',pg_temp.team_hash('member-b'))->>'id')::uuid;
select pg_temp.team_assert((select invited_role from public.organization_invitations where id=c.invite_b)='MEMBER','ADMIN invites MEMBER') from pg_temp.team_test_context c;

-- Inject an audit failure to prove acceptance/membership changes are atomic.
reset role;
create function pg_temp.team_fail_audit() returns trigger language plpgsql as $$ begin
  if new.event_type='accepted' then raise exception 'Intentional test failure' using errcode='23514'; end if;
  return new;
end $$;
create trigger team_test_failure before insert on private.organization_team_events for each row execute function pg_temp.team_fail_audit();
select set_config('request.jwt.claims',json_build_object('sub',user_b,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select pg_temp.team_expect(format('select public.accept_organization_invitation(%L)',pg_temp.team_hash('member-b')),'23514','audit failure aborts acceptance');
reset role;
select pg_temp.team_assert(not exists(select 1 from public.organization_members where organization_id=c.org_a and user_id=c.user_b),'failed acceptance rolls back membership') from team_test_context c;
select pg_temp.team_assert((select accepted_at is null from public.organization_invitations where id=c.invite_b),'failed acceptance rolls back token consumption') from team_test_context c;
drop trigger team_test_failure on private.organization_team_events;
set local role authenticated;
select public.accept_organization_invitation(pg_temp.team_hash('member-b'));
select pg_temp.team_expect(format('select public.create_organization_invitation(%L,''denied@example.invalid'',''MEMBER'',%L)',org_a,pg_temp.team_hash('member-denied')),'42501','MEMBER cannot invite') from pg_temp.team_test_context;
select pg_temp.team_assert(not exists(select 1 from public.organization_invitations where organization_id=c.org_a),'MEMBER cannot read invitations') from pg_temp.team_test_context c;
select pg_temp.team_assert(not exists(select 1 from jsonb_array_elements(public.list_organization_members(c.org_a)->'members') m where m->>'user_id'<>c.user_b::text and m->>'email' is not null),'MEMBER cannot read other member emails') from pg_temp.team_test_context c;
reset role;
update team_test_context c set member_a=a.id,member_b=b.id,member_c=d.id from public.organization_members a,public.organization_members b,public.organization_members d
  where a.organization_id=c.org_a and a.user_id=c.user_a and b.organization_id=c.org_a and b.user_id=c.user_b and d.organization_id=c.org_a and d.user_id=c.user_c;
set local role authenticated;
select pg_temp.team_expect(format('select public.remove_organization_member(%L,%L)',org_a,member_c),'42501','MEMBER cannot remove members') from pg_temp.team_test_context;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_a,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select pg_temp.team_expect(format('select public.create_organization_invitation(%L,%L,''MEMBER'',%L)',org_a,email_c,pg_temp.team_hash('existing')),'P0401','active member cannot be invited again') from pg_temp.team_test_context;
select pg_temp.team_expect(format('select public.update_organization_member_role(%L,%L,''ADMIN'')',org_b,member_b),'42501','cross-tenant membership edits rejected') from pg_temp.team_test_context;
select public.update_organization_member_role(org_a,member_c,'MEMBER') from pg_temp.team_test_context;
select public.update_organization_member_role(org_a,member_c,'ADMIN') from pg_temp.team_test_context;
select public.update_organization_member_role(org_a,member_b,'ADMIN') from pg_temp.team_test_context;
select pg_temp.team_expect(format('select public.update_organization_member_role(%L,%L,''OWNER'')',org_a,member_c),'42501','ordinary role update cannot grant OWNER') from pg_temp.team_test_context;
select pg_temp.team_expect(format('select public.remove_organization_member(%L,%L)',org_a,member_a),'42501','OWNER cannot remove itself') from pg_temp.team_test_context;
reset role;
select pg_temp.team_expect(format('update public.organization_members set status=''INACTIVE'' where id=%L',member_a),'P0409','database trigger protects last active OWNER') from team_test_context;
select set_config('request.jwt.claims',json_build_object('sub',user_c,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select pg_temp.team_expect(format('select public.remove_organization_member(%L,%L)',org_a,member_a),'42501','ADMIN cannot remove OWNER') from pg_temp.team_test_context;
select pg_temp.team_expect(format('select public.remove_organization_member(%L,%L)',org_a,member_b),'42501','ADMIN cannot remove another ADMIN') from pg_temp.team_test_context;
select pg_temp.team_expect(format('select public.update_organization_member_role(%L,%L,''ADMIN'')',org_a,member_b),'42501','ADMIN cannot change ADMIN roles') from pg_temp.team_test_context;
select pg_temp.team_expect(format('select public.update_organization_member_role(%L,%L,''ADMIN'')',org_a,member_c),'42501','self role escalation rejected') from pg_temp.team_test_context;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_a,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select public.update_organization_member_role(org_a,member_b,'MEMBER') from pg_temp.team_test_context;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_c,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select pg_temp.team_expect(format('select public.update_organization_member_role(%L,%L,''ADMIN'')',org_a,member_b),'42501','ADMIN cannot promote MEMBER') from pg_temp.team_test_context;
select public.remove_organization_member(org_a,member_b) from pg_temp.team_test_context;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_b,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select pg_temp.team_assert(not exists(select 1 from public.organizations where id=c.org_a),'removed member loses organization access') from pg_temp.team_test_context c;
select pg_temp.team_expect(format('select public.list_organization_members(%L)',org_a),'42501','removed member loses directory access') from pg_temp.team_test_context;
select pg_temp.team_expect(format('select public.accept_organization_invitation(%L)',pg_temp.team_hash('member-b')),'P0404','accepted link cannot restore removed membership');
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_a,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select pg_temp.team_expect(format('select public.transfer_organization_ownership(%L,%L,''wrong confirmation'')',org_a,member_c),'42501','ownership transfer requires exact confirmation') from pg_temp.team_test_context;
select public.transfer_organization_ownership(org_a,member_c,'Invitation policy test A') from pg_temp.team_test_context;
select pg_temp.team_assert((select role from public.organization_members where id=c.member_c)='OWNER' and (select role from public.organization_members where id=c.member_a)='ADMIN','ownership transfer promotes recipient and demotes actor atomically') from pg_temp.team_test_context c;
reset role;
select pg_temp.team_assert((select count(*) from private.organization_team_events where organization_id=c.org_a and event_type='ownership_transferred')=1,'ownership transfer audited') from team_test_context c;
select set_config('request.jwt.claims',json_build_object('sub',user_c,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
update pg_temp.team_test_context set invite_b=(public.create_organization_invitation(org_a,email_b,'MEMBER',pg_temp.team_hash('reserved-b'))->>'id')::uuid;
do $$ declare org uuid := (select org_a from pg_temp.team_test_context); begin
  for n in 1..7 loop perform public.create_organization_invitation(org,'reserved-'||n||'@example.invalid','MEMBER',pg_temp.team_hash('reserved-'||n)); end loop;
end $$;
select pg_temp.team_expect(format('select public.create_organization_invitation(%L,''over-capacity@example.invalid'',''MEMBER'',%L)',org_a,pg_temp.team_hash('over-capacity')),'P0403','active members plus pending reservations cannot exceed 10') from pg_temp.team_test_context;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_b,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select public.accept_organization_invitation(pg_temp.team_hash('reserved-b'));
select pg_temp.team_assert((public.list_organization_members(org_a)->>'active_count')::integer=3 and (public.list_organization_members(org_a)->>'reserved_count')::integer=7,'acceptance consumes its reserved seat without double-counting') from pg_temp.team_test_context;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',user_c,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select public.revoke_organization_invitation(c.org_a,i.id) from pg_temp.team_test_context c join public.organization_invitations i
  on i.organization_id=c.org_a and i.email='reserved-1@example.invalid';
select public.create_organization_invitation(org_a,'reclaimed-seat@example.invalid','MEMBER',pg_temp.team_hash('reclaimed-seat')) from pg_temp.team_test_context;
select pg_temp.team_assert((public.list_organization_members(org_a)->>'reserved_count')::integer=7,'revocation releases a seat for a new invitation') from pg_temp.team_test_context;
select pg_temp.team_expect(format('select public.create_organization_invitation(%L,''rate-limit@example.invalid'',''MEMBER'',%L)',org_a,pg_temp.team_hash('rate-limit')),'P0410','hourly invitation rate limit enforced') from pg_temp.team_test_context;
reset role;
-- If membership becomes active after an invitation was issued, acceptance
-- consumes the invitation without promoting that existing member.
select set_config('request.jwt.claims',json_build_object('sub',user_a,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
update pg_temp.team_test_context set org_existing=public.create_organization('Existing role preservation test',gen_random_uuid());
select public.create_organization_invitation(org_existing,email_b,'ADMIN',pg_temp.team_hash('preserve-existing-role')) from pg_temp.team_test_context;
reset role;
insert into public.organization_members(organization_id,user_id,role) select org_existing,user_b,'MEMBER' from team_test_context;
select set_config('request.jwt.claims',json_build_object('sub',user_b,'role','authenticated')::text,true) from team_test_context;
set local role authenticated;
select public.accept_organization_invitation(pg_temp.team_hash('preserve-existing-role'));
select pg_temp.team_assert((select role from public.organization_members where organization_id=c.org_existing and user_id=c.user_b)='MEMBER','acceptance never elevates an existing active membership') from pg_temp.team_test_context c;
reset role;
select pg_temp.team_assert((select next_role from private.organization_team_events where organization_id=c.org_existing and event_type='accepted')='MEMBER','acceptance audit records actual retained role') from team_test_context c;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select pg_temp.team_expect('select id from public.organization_invitations','42501','anonymous invitation reads rejected');
select pg_temp.team_expect(format('select public.accept_organization_invitation(%L)',pg_temp.team_hash('reserved-b')),'42501','anonymous privileged request rejected');
select pg_temp.team_assert(public.preview_organization_invitation(pg_temp.team_hash('not-a-token')) is null,'invalid preview returns no organization data');
reset role;
rollback;
\echo 'Rollback-only invitation suite finished; no Auth writes or emails.'
