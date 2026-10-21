-- Phase 3 Step 2. Additive; remote application requires explicit approval.
begin;

-- Existing office IDs are already primary keys; this additive unique key permits
-- a composite FK proving channel and office have the same organization.
alter table public.offices add constraint offices_id_organization_key unique (id,organization_id);
create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  office_id uuid not null unique,
  name text not null default 'Office Chat' check (name='Office Chat'),
  created_at timestamptz not null default now(),
  foreign key (office_id,organization_id) references public.offices(id,organization_id) on delete cascade
);
create table public.chat_messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  sender_name text not null check (char_length(sender_name) between 1 and 100),
  body text not null check (char_length(body) between 1 and 2000 and octet_length(body)<=8000 and body ~ '[^[:space:]]'),
  client_message_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint chat_messages_sender_request_key unique(sender_id,client_message_id)
);
create index chat_messages_history_idx on public.chat_messages(channel_id,id desc);
create index chat_messages_rate_idx on public.chat_messages(sender_id,created_at desc);

create function private.chat_provision_office() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.chat_channels(organization_id,office_id) values(new.organization_id,new.id)
    on conflict(office_id) do nothing;
  return new;
end $$;
create trigger offices_chat_channel after insert on public.offices
  for each row execute function private.chat_provision_office();
-- Only new chat rows are backfilled. Existing application records are untouched.
insert into public.chat_channels(organization_id,office_id)
  select organization_id,id from public.offices on conflict(office_id) do nothing;

create function private.chat_can_read(p_channel uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.chat_channels c where c.id=p_channel and private.team_role(c.organization_id) is not null);
$$;
alter table public.chat_channels enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_channels,public.chat_messages from public,anon,authenticated;
revoke all on sequence public.chat_messages_id_seq from public,anon,authenticated;
grant select on public.chat_channels,public.chat_messages to authenticated;
create policy chat_channels_read_member on public.chat_channels for select to authenticated
  using(private.team_role(organization_id) is not null);
create policy chat_messages_read_member on public.chat_messages for select to authenticated
  using(private.chat_can_read(channel_id));

create function public.send_office_chat_message(p_office uuid,p_body text,p_client_message_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare channel public.chat_channels%rowtype; message public.chat_messages%rowtype; clean_body text; display_name text; inserted boolean := false;
begin
  select * into channel from public.chat_channels where office_id=p_office;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  -- Uses the same org lock as member removal. Rechecks verified ACTIVE membership.
  perform private.team_lock(channel.organization_id);
  -- Also serialize this sender across offices: retries and rate counters are atomic.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('office-chat:'||auth.uid()::text,0));
  -- Match JavaScript trim() at the edges without rewriting interior text.
  clean_body := btrim(replace(replace(p_body,E'\r\n',E'\n'),E'\r',E'\n'),
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  if p_client_message_id is null or clean_body is null or char_length(clean_body) not between 1 and 2000
    or octet_length(clean_body)>8000 or clean_body !~ '[^[:space:]]'
    or clean_body ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise exception 'Invalid chat input' using errcode='22023';
  end if;
  select * into message from public.chat_messages where sender_id=auth.uid() and client_message_id=p_client_message_id;
  if found then
    if message.channel_id<>channel.id or message.body<>clean_body then raise exception 'Request cannot be reused' using errcode='22023'; end if;
  else
    if (select count(*) from public.chat_messages where sender_id=auth.uid() and created_at>clock_timestamp()-interval '10 seconds')>=5 then
      raise exception 'Chat rate limit' using errcode='P0310';
    end if;
    select case when p.display_name='' or position('@' in p.display_name)>0 then 'Member' else left(p.display_name,100) end
      into display_name from public.profiles p where p.id=auth.uid();
    insert into public.chat_messages(channel_id,sender_id,sender_name,body,client_message_id)
      values(channel.id,auth.uid(),coalesce(nullif(display_name,''),'Member'),clean_body,p_client_message_id) returning * into message;
    inserted := true;
  end if;
  return jsonb_build_object('inserted',inserted,'message',jsonb_build_object('id',message.id::text,'channelId',message.channel_id,
    'senderId',message.sender_id,'senderName',message.sender_name,'body',message.body,'clientMessageId',message.client_message_id,'createdAt',message.created_at));
end $$;

create function public.list_office_chat_messages(p_office uuid,p_before text default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare channel public.chat_channels%rowtype; before_id bigint; result jsonb;
begin
  select * into channel from public.chat_channels where office_id=p_office;
  if not found or private.team_role(channel.organization_id) is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_before is not null then
    if p_before !~ '^[1-9][0-9]{0,18}$' then raise exception 'Invalid cursor' using errcode='22023'; end if;
    begin before_id := p_before::bigint; exception when numeric_value_out_of_range then raise exception 'Invalid cursor' using errcode='22023'; end;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'channelId',m.channel_id,'senderId',m.sender_id,'senderName',m.sender_name,
    'body',m.body,'clientMessageId',m.client_message_id,'createdAt',m.created_at) order by m.id desc),'[]'::jsonb) into result
    from (select * from public.chat_messages where channel_id=channel.id and (before_id is null or id<before_id) order by id desc limit 31) m;
  return result;
end $$;
revoke all on function private.chat_provision_office(),private.chat_can_read(uuid),public.send_office_chat_message(uuid,text,uuid),public.list_office_chat_messages(uuid,text) from public,anon,authenticated;
grant execute on function private.chat_can_read(uuid),public.send_office_chat_message(uuid,text,uuid),public.list_office_chat_messages(uuid,text) to authenticated;
commit;
