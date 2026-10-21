-- Safe live negative checks: no existing Auth identity, account creation,
-- application fixtures or email API. Temporary helper rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';
create function pg_temp.expect_team_denial(statement text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when insufficient_privilege then return; end;
  raise exception 'Expected insufficient privilege for team operation';
end $$;
grant execute on function pg_temp.expect_team_denial(text) to authenticated,anon;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
set local role authenticated;
-- Claiming the role without any Auth subject cannot authorize a user.
select pg_temp.expect_team_denial('select public.list_organization_members(''00000000-0000-4000-8000-000000000000'')');
select pg_temp.expect_team_denial('select public.create_organization_invitation(''00000000-0000-4000-8000-000000000000'',''no-send@example.invalid'',''MEMBER'',repeat(''0'',64))');
select pg_temp.expect_team_denial('select public.resend_organization_invitation(''00000000-0000-4000-8000-000000000000'',''00000000-0000-4000-8000-000000000001'',repeat(''0'',64))');
select pg_temp.expect_team_denial('select public.record_invitation_delivery(''00000000-0000-4000-8000-000000000000'',''00000000-0000-4000-8000-000000000001'',1,''failed'')');
select pg_temp.expect_team_denial('select public.revoke_organization_invitation(''00000000-0000-4000-8000-000000000000'',''00000000-0000-4000-8000-000000000001'')');
select pg_temp.expect_team_denial('select public.accept_organization_invitation(repeat(''0'',64))');
select pg_temp.expect_team_denial('select public.update_organization_member_role(''00000000-0000-4000-8000-000000000000'',''00000000-0000-4000-8000-000000000001'',''ADMIN'')');
select pg_temp.expect_team_denial('select public.remove_organization_member(''00000000-0000-4000-8000-000000000000'',''00000000-0000-4000-8000-000000000001'')');
select pg_temp.expect_team_denial('select public.transfer_organization_ownership(''00000000-0000-4000-8000-000000000000'',''00000000-0000-4000-8000-000000000001'',''invalid'')');
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select pg_temp.expect_team_denial('select id from public.organization_invitations');
select pg_temp.expect_team_denial('select public.accept_organization_invitation(repeat(''0'',64))');
do $$ begin
  if public.preview_organization_invitation(repeat('0',64)) is not null then raise exception 'Invalid proof exposed an invitation'; end if;
end $$;
reset role;
rollback;
select 'team-access-guards-rolled-back'::text as team_guard_result;
