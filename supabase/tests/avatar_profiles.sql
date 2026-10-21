-- Run only with authorized test fixtures. No Auth writes; all records roll back.
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claims',json_build_object('sub',:'user_a'::uuid,'role','authenticated')::text,true);
set local role authenticated;
insert into public.profiles(id,display_name,avatar_key) values(:'user_a'::uuid,'Avatar test name','fern')
  on conflict(id) do update set display_name='Avatar test name',avatar_key='fern';
update public.profiles set avatar_key='harbor' where id=:'user_a'::uuid;
do $$ begin
  if not exists(select 1 from public.profiles where id=auth.uid() and avatar_key='harbor' and display_name='Avatar test name') then raise exception 'Self update did not preserve name'; end if;
  begin update public.profiles set id=gen_random_uuid() where id=auth.uid(); raise exception 'ID update allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',:'user_b'::uuid,'role','authenticated')::text,true);
set local role authenticated;
insert into public.profiles(id,display_name,avatar_key) values(:'user_b'::uuid,'Other test name','slate')
  on conflict(id) do update set avatar_key='slate';
do $$ declare changed integer; begin
  update public.profiles set avatar_key='clay' where id<>auth.uid(); get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Cross-user update allowed'; end if;
  if exists(select 1 from public.profiles where id<>auth.uid()) then raise exception 'Cross-user profile read allowed'; end if;
  begin insert into public.profiles(id,avatar_key) values(gen_random_uuid(),'fern'); raise exception 'Other-id insert allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin update public.profiles set avatar_key='plum'; raise exception 'Anonymous update allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',:'user_a'::uuid,'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.profiles where id=auth.uid() and avatar_key='harbor' and display_name='Avatar test name') then raise exception 'Other actor changed profile'; end if;
end $$;
reset role;
rollback;
