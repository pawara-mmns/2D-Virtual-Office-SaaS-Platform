-- Live negative database checks only. No Auth edits or existing-user selection.
-- A read-only transaction prevents application writes even if a guard regresses.
-- These SQL role contexts are NOT signed-in users or positive chat delivery tests.
begin read only;
set local statement_timeout='15s';
set local lock_timeout='3s';
do $$
declare unknown_user uuid := gen_random_uuid(); target_office uuid;
begin
  if exists(select 1 from auth.users where id=unknown_user) then
    raise exception 'Synthetic missing identity unexpectedly exists';
  end if;
  select id into target_office from public.offices limit 1;
  if target_office is null then raise exception 'An existing office is required for live denial checks'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',unknown_user,'role','authenticated')::text,true);
  set local role authenticated;
  if exists(select 1 from public.chat_channels) or exists(select 1 from public.chat_messages) then
    raise exception 'Missing verified identity obtained chat rows';
  end if;
  begin
    perform public.list_office_chat_messages(target_office);
    raise exception 'Missing verified identity obtained chat history';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.send_office_chat_message(target_office,'Denied live probe',gen_random_uuid());
    raise exception 'Missing verified identity sent a message';
  exception when insufficient_privilege then null;
  end;
  -- Read-only transactions reject UPDATE before privilege checks. Inspect grants
  -- here; the disposable SQL suite separately exercises direct write attempts.
  if has_table_privilege(current_user,'public.chat_messages','INSERT,UPDATE,DELETE') then
    raise exception 'Direct authenticated write unexpectedly granted';
  end if;
  reset role;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  set local role anon;
  begin
    perform 1 from public.chat_channels;
    raise exception 'Anonymous channel read unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.chat_messages;
    raise exception 'Anonymous message read unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_office_chat_messages(target_office);
    raise exception 'Anonymous history RPC unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.send_office_chat_message(target_office,'Denied anonymous probe',gen_random_uuid());
    raise exception 'Anonymous send RPC unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;
rollback;
select true as live_chat_denials_rolled_back;
