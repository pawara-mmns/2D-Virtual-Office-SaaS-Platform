-- Step 4. Review/dry-run and obtain explicit approval before remote application.
-- No existing row backfill, deletion or recreation. No Auth schema changes.
begin;

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  invited_role text not null check (invited_role in ('ADMIN','MEMBER')),
  invited_by uuid references auth.users(id) on delete set null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  delivery_status text not null default 'sending' check (delivery_status in ('sending','sent','failed')),
  delivery_version integer not null default 1 check (delivery_version > 0),
  last_delivery_at timestamptz not null default now(),
  provider_message_id text check (char_length(provider_message_id) <= 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);
-- Expired open rows are superseded explicitly under the organization lock.
create unique index organization_invitations_open_email_key on public.organization_invitations(organization_id,email)
  where accepted_at is null and revoked_at is null;
create index organization_invitations_list_idx on public.organization_invitations(organization_id,created_at desc,id);
create trigger organization_invitations_updated_at before update on public.organization_invitations
  for each row execute function private.organization_touch_updated_at();

create table private.organization_team_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  invitation_id uuid references public.organization_invitations(id) on delete set null,
  event_type text not null check (event_type in ('invited','resent','revoked','accepted','role_changed','removed','ownership_transferred')),
  previous_role text check (previous_role in ('OWNER','ADMIN','MEMBER')),
  next_role text check (next_role in ('OWNER','ADMIN','MEMBER')),
  created_at timestamptz not null default now()
);
create index organization_team_events_rate_idx on private.organization_team_events(organization_id,created_at desc);
alter table private.organization_team_events enable row level security;
revoke all on private.organization_team_events from public,anon,authenticated;

create function private.team_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  join auth.users u on u.id=m.user_id
  where m.organization_id=p_org and m.user_id=auth.uid() and m.status='ACTIVE'
    and o.status='ACTIVE' and u.email_confirmed_at is not null and u.deleted_at is null
    and auth.role()='authenticated';
$$;
create function private.team_lock(p_org uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare actor_role text;
begin
  -- Check before waiting, then check again after serialization.
  if private.team_role(p_org) is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.organizations where id=p_org for update;
  actor_role := private.team_role(p_org);
  if actor_role is null then raise exception 'Not authorized' using errcode='42501'; end if;
  return actor_role;
end $$;
create function private.team_rate_limit(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from private.organization_team_events where organization_id=p_org
      and event_type in ('invited','resent') and created_at > clock_timestamp()-interval '1 hour') >= 20
    or (select count(*) from private.organization_team_events where organization_id=p_org and actor_id=auth.uid()
      and event_type in ('invited','resent') and created_at > clock_timestamp()-interval '1 hour') >= 10 then
    raise exception 'Invitation rate limit reached' using errcode='P0410';
  end if;
end $$;
create function private.team_seats(p_org uuid) returns bigint
language sql volatile security definer set search_path = '' as $$
  select (select count(*) from public.organization_members where organization_id=p_org and status='ACTIVE')
    + (select count(*) from public.organization_invitations where organization_id=p_org
      and accepted_at is null and revoked_at is null and expires_at > clock_timestamp());
$$;

-- A transfer promotes the recipient BEFORE demoting the previous owner.
-- This also protects the last owner from privileged Auth-user cascade removal.
create function private.team_protect_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role='OWNER' and old.status='ACTIVE' then
    if tg_op='UPDATE' then
      if new.role='OWNER' and new.status='ACTIVE' and new.organization_id=old.organization_id and new.user_id=old.user_id then return new; end if;
    end if;
    perform 1 from public.organizations where id=old.organization_id for update;
    if found and not exists (select 1 from public.organization_members where organization_id=old.organization_id
      and id<>old.id and role='OWNER' and status='ACTIVE') then
      raise exception 'Transfer ownership before removing the last owner' using errcode='P0409';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger organization_members_protect_owner before update or delete on public.organization_members
  for each row execute function private.team_protect_owner();

alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from public,anon,authenticated;
grant select (id,organization_id,email,invited_role,invited_by,expires_at,accepted_at,accepted_by,revoked_at,
  delivery_status,delivery_version,last_delivery_at,created_at,updated_at) on public.organization_invitations to authenticated;
create policy invitations_read_manager on public.organization_invitations for select to authenticated
  using (private.team_role(organization_id)='OWNER' or (private.team_role(organization_id)='ADMIN' and invited_role='MEMBER'));

create function public.list_organization_members(p_org uuid,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.team_role(p_org); result jsonb;
begin
  if actor_role is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) into result from (
    select m.id,m.user_id,m.role,m.status,m.joined_at,coalesce(nullif(p.display_name,''),'Team member') as display_name,
      case when actor_role in ('OWNER','ADMIN') or m.user_id=auth.uid() then u.email else null end as email
    from public.organization_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id
    where m.organization_id=p_org order by m.joined_at,m.id limit 26 offset greatest(0,least(coalesce(p_offset,0),25000))
  ) rows;
  return jsonb_build_object('members',result,'active_count',
    (select count(*) from public.organization_members where organization_id=p_org and status='ACTIVE'),
    'reserved_count',(select count(*) from public.organization_invitations where organization_id=p_org and accepted_at is null
      and revoked_at is null and expires_at>clock_timestamp()));
end $$;

create function public.create_organization_invitation(p_org uuid,p_email text,p_role text,p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.team_lock(p_org); invited public.organization_invitations%rowtype;
begin
  if actor_role not in ('OWNER','ADMIN') or p_role is null or p_role not in ('ADMIN','MEMBER')
    or (actor_role='ADMIN' and p_role<>'MEMBER') then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_email is null or char_length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation input' using errcode='22023'; end if;
  if exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=p_org
    and m.status='ACTIVE' and lower(u.email)=lower(btrim(p_email))) then raise exception 'Already a member' using errcode='P0401'; end if;
  if exists(select 1 from public.organization_invitations where organization_id=p_org and email=lower(btrim(p_email))
    and accepted_at is null and revoked_at is null and expires_at>clock_timestamp()) then raise exception 'Pending invitation exists' using errcode='P0402'; end if;
  perform private.team_rate_limit(p_org);
  if private.team_seats(p_org)>=10 then raise exception 'Organization capacity reached' using errcode='P0403'; end if;
  update public.organization_invitations set revoked_at=clock_timestamp() where organization_id=p_org and email=lower(btrim(p_email))
    and accepted_at is null and revoked_at is null and expires_at<=clock_timestamp();
  insert into public.organization_invitations(organization_id,email,invited_role,invited_by,token_hash)
    values(p_org,lower(btrim(p_email)),p_role,auth.uid(),p_token_hash) returning * into invited;
  insert into private.organization_team_events(organization_id,actor_id,invitation_id,event_type,next_role)
    values(p_org,auth.uid(),invited.id,'invited',p_role);
  return jsonb_build_object('id',invited.id,'email',invited.email,'role',invited.invited_role,'expires_at',invited.expires_at,
    'version',invited.delivery_version,'organization_name',(select name from public.organizations where id=p_org),
    'inviter_name',(select nullif(display_name,'') from public.profiles where id=auth.uid()));
end $$;

create function public.resend_organization_invitation(p_org uuid,p_invitation uuid,p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.team_lock(p_org); invited public.organization_invitations%rowtype;
begin
  select * into invited from public.organization_invitations where id=p_invitation and organization_id=p_org;
  if not found or actor_role not in ('OWNER','ADMIN') or (actor_role='ADMIN' and invited.invited_role<>'MEMBER') then raise exception 'Not authorized' using errcode='42501'; end if;
  if invited.accepted_at is not null or invited.revoked_at is not null then raise exception 'Invitation unavailable' using errcode='P0404'; end if;
  if invited.last_delivery_at>clock_timestamp()-interval '60 seconds' then raise exception 'Wait before resending' using errcode='P0410'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation input' using errcode='22023'; end if;
  if exists(select 1 from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=p_org
    and m.status='ACTIVE' and lower(u.email)=invited.email) then raise exception 'Already a member' using errcode='P0401'; end if;
  perform private.team_rate_limit(p_org);
  if invited.expires_at<=clock_timestamp() and private.team_seats(p_org)>=10 then raise exception 'Organization capacity reached' using errcode='P0403'; end if;
  update public.organization_invitations set token_hash=p_token_hash,expires_at=clock_timestamp()+interval '7 days',invited_by=auth.uid(),
    delivery_version=delivery_version+1,delivery_status='sending',last_delivery_at=clock_timestamp(),provider_message_id=null
    where id=invited.id returning * into invited;
  insert into private.organization_team_events(organization_id,actor_id,invitation_id,event_type,next_role)
    values(p_org,auth.uid(),invited.id,'resent',invited.invited_role);
  return jsonb_build_object('id',invited.id,'email',invited.email,'role',invited.invited_role,'expires_at',invited.expires_at,
    'version',invited.delivery_version,'organization_name',(select name from public.organizations where id=p_org),
    'inviter_name',(select nullif(display_name,'') from public.profiles where id=auth.uid()));
end $$;

create function public.record_invitation_delivery(p_org uuid,p_invitation uuid,p_version integer,p_status text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.team_lock(p_org); changed integer;
begin
  if actor_role not in ('OWNER','ADMIN') or p_status is null or p_status not in ('sent','failed')
    or (p_status='sent' and (p_provider_id is null or char_length(p_provider_id) not between 1 and 256)) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  update public.organization_invitations set delivery_status=p_status,provider_message_id=case when p_status='sent' then p_provider_id else null end
    where id=p_invitation and organization_id=p_org and delivery_version=p_version and delivery_status='sending'
      and invited_by=auth.uid() and accepted_at is null and revoked_at is null
      and (actor_role='OWNER' or invited_role='MEMBER');
  get diagnostics changed=row_count;
  return changed=1;
end $$;

create function public.revoke_organization_invitation(p_org uuid,p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.team_lock(p_org); invited public.organization_invitations%rowtype;
begin
  select * into invited from public.organization_invitations where id=p_invitation and organization_id=p_org;
  if not found or actor_role not in ('OWNER','ADMIN') or (actor_role='ADMIN' and invited.invited_role<>'MEMBER') then raise exception 'Not authorized' using errcode='42501'; end if;
  if invited.accepted_at is not null then raise exception 'Invitation already accepted' using errcode='P0404'; end if;
  if invited.revoked_at is not null then return; end if;
  update public.organization_invitations set revoked_at=clock_timestamp() where id=invited.id;
  insert into private.organization_team_events(organization_id,actor_id,invitation_id,event_type)
    values(p_org,auth.uid(),invited.id,'revoked');
end $$;

create function public.preview_organization_invitation(p_token_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('organization_name',o.name,'role',i.invited_role,'expires_at',i.expires_at,
    'state',case when i.revoked_at is not null or o.status<>'ACTIVE' then 'Revoked'
      when i.accepted_at is not null then 'Accepted' when i.expires_at<=now() then 'Expired' else 'Pending' end,
    'email_matches',exists(select 1 from auth.users u where u.id=auth.uid() and lower(u.email)=i.email
      and u.email_confirmed_at is not null and u.deleted_at is null and auth.role()='authenticated'))
  from public.organization_invitations i join public.organizations o on o.id=i.organization_id
  where i.token_hash=p_token_hash and p_token_hash ~ '^[0-9a-f]{64}$';
$$;

create function public.accept_organization_invitation(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare invited public.organization_invitations%rowtype; caller auth.users%rowtype; org_status text; active_members bigint;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into caller from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null;
  if not found then raise exception 'Verified email required' using errcode='42501'; end if;
  select * into invited from public.organization_invitations where token_hash=p_token_hash;
  if not found then raise exception 'Invitation unavailable' using errcode='P0404'; end if;
  -- Acquire the same organization lock as creation, resend and member operations.
  select status into org_status from public.organizations where id=invited.organization_id for update;
  select * into invited from public.organization_invitations where id=invited.id;
  if invited.token_hash is distinct from p_token_hash or org_status is distinct from 'ACTIVE'
    or lower(caller.email) is distinct from invited.email then raise exception 'Invitation unavailable for this account' using errcode='P0405'; end if;
  if invited.accepted_at is not null then
    if invited.accepted_by=caller.id and exists(select 1 from public.organization_members where organization_id=invited.organization_id
      and user_id=caller.id and status='ACTIVE') then return invited.organization_id; end if;
    raise exception 'Invitation already accepted' using errcode='P0404';
  end if;
  if invited.revoked_at is not null or invited.expires_at<=clock_timestamp() then raise exception 'Invitation unavailable' using errcode='P0404'; end if;
  if exists(select 1 from public.organization_members where organization_id=invited.organization_id and user_id=caller.id and status='ACTIVE') then
    -- Existing membership keeps its role. Never promote through an invitation.
    update public.organization_invitations set accepted_at=clock_timestamp(),accepted_by=caller.id where id=invited.id;
  else
    select count(*) into active_members from public.organization_members where organization_id=invited.organization_id and status='ACTIVE';
    -- Own pending invitation already owns a seat; exclude no other reservations.
    if active_members>=10 or private.team_seats(invited.organization_id)>10 then raise exception 'Organization capacity reached' using errcode='P0403'; end if;
    insert into public.profiles(id) values(caller.id) on conflict(id) do nothing;
    insert into public.organization_members(organization_id,user_id,role,status) values(invited.organization_id,caller.id,invited.invited_role,'ACTIVE')
      on conflict(organization_id,user_id) do update set role=excluded.role,status='ACTIVE',joined_at=clock_timestamp();
    update public.organization_invitations set accepted_at=clock_timestamp(),accepted_by=caller.id where id=invited.id;
  end if;
  insert into private.organization_team_events(organization_id,actor_id,target_user_id,invitation_id,event_type,next_role)
    values(invited.organization_id,caller.id,caller.id,invited.id,'accepted',
      (select role from public.organization_members where organization_id=invited.organization_id and user_id=caller.id));
  return invited.organization_id;
end $$;

create function public.update_organization_member_role(p_org uuid,p_member uuid,p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.team_lock(p_org); target public.organization_members%rowtype;
begin
  select * into target from public.organization_members where id=p_member and organization_id=p_org and status='ACTIVE';
  if not found or actor_role<>'OWNER' or target.role='OWNER' or target.user_id=auth.uid()
    or p_role is null or p_role not in ('ADMIN','MEMBER') then raise exception 'Not authorized' using errcode='42501'; end if;
  if target.role=p_role then return; end if;
  update public.organization_members set role=p_role where id=target.id;
  insert into private.organization_team_events(organization_id,actor_id,target_user_id,event_type,previous_role,next_role)
    values(p_org,auth.uid(),target.user_id,'role_changed',target.role,p_role);
end $$;
create function public.remove_organization_member(p_org uuid,p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.team_lock(p_org); target public.organization_members%rowtype;
begin
  select * into target from public.organization_members where id=p_member and organization_id=p_org and status='ACTIVE';
  if not found or actor_role not in ('OWNER','ADMIN') or target.role='OWNER' or target.user_id=auth.uid()
    or (actor_role='ADMIN' and target.role<>'MEMBER') then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.organization_members set status='INACTIVE' where id=target.id;
  insert into private.organization_team_events(organization_id,actor_id,target_user_id,event_type,previous_role)
    values(p_org,auth.uid(),target.user_id,'removed',target.role);
end $$;
create function public.transfer_organization_ownership(p_org uuid,p_member uuid,p_confirmation text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor_role text := private.team_lock(p_org); target public.organization_members%rowtype;
begin
  select * into target from public.organization_members where id=p_member and organization_id=p_org and status='ACTIVE';
  if not found or actor_role<>'OWNER' or target.user_id=auth.uid() or target.role not in ('ADMIN','MEMBER')
    or p_confirmation is distinct from (select name from public.organizations where id=p_org)
    or not exists(select 1 from auth.users where id=target.user_id and email_confirmed_at is not null and deleted_at is null) then
    raise exception 'Not authorized or confirmation mismatch' using errcode='42501'; end if;
  update public.organization_members set role='OWNER' where id=target.id;
  update public.organization_members set role='ADMIN' where organization_id=p_org and user_id=auth.uid() and status='ACTIVE';
  insert into private.organization_team_events(organization_id,actor_id,target_user_id,event_type,previous_role,next_role)
    values(p_org,auth.uid(),target.user_id,'ownership_transferred',target.role,'OWNER');
end $$;

revoke all on function private.team_role(uuid),private.team_lock(uuid),private.team_rate_limit(uuid),private.team_seats(uuid),private.team_protect_owner()
  from public,anon,authenticated;
grant execute on function private.team_role(uuid) to authenticated;
revoke all on function public.list_organization_members(uuid,integer),public.create_organization_invitation(uuid,text,text,text),
  public.resend_organization_invitation(uuid,uuid,text),public.record_invitation_delivery(uuid,uuid,integer,text,text),
  public.revoke_organization_invitation(uuid,uuid),public.preview_organization_invitation(text),public.accept_organization_invitation(text),
  public.update_organization_member_role(uuid,uuid,text),public.remove_organization_member(uuid,uuid),public.transfer_organization_ownership(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.list_organization_members(uuid,integer),public.create_organization_invitation(uuid,text,text,text),
  public.resend_organization_invitation(uuid,uuid,text),public.record_invitation_delivery(uuid,uuid,integer,text,text),
  public.revoke_organization_invitation(uuid,uuid),public.accept_organization_invitation(text),
  public.update_organization_member_role(uuid,uuid,text),public.remove_organization_member(uuid,uuid),public.transfer_organization_ownership(uuid,uuid,text)
  to authenticated;
grant execute on function public.preview_organization_invitation(text) to anon,authenticated;
commit;
