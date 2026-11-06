begin;
-- Only the trusted realtime writer can commit a validated live room revision.
create table private.office_decoration_commits(
 office_id uuid not null references public.offices(id) on delete cascade,
 operation_id uuid not null, actor uuid not null references auth.users(id),
 expected_revision integer not null, base_revision integer not null,
 document jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(office_id,operation_id)
);
alter table private.office_decoration_commits enable row level security;
revoke all on private.office_decoration_commits from public,anon,authenticated;
create function public.commit_live_office_decoration(p_office_id uuid,p_actor uuid,p_operation_id uuid,p_expected_revision integer,p_base_revision integer,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt private.office_decoration_commits; draft_result jsonb; result jsonb;
begin
 perform private.lock_decoration_owner(p_office_id,p_actor);
 select * into receipt from private.office_decoration_commits where office_id=p_office_id and operation_id=p_operation_id;
 if found then
  if receipt.actor is distinct from p_actor or receipt.expected_revision is distinct from p_expected_revision or receipt.base_revision is distinct from p_base_revision or receipt.document is distinct from p_document then raise exception 'Commit ID conflict' using errcode='40001'; end if;
  return receipt.result;
 end if;
 -- Both writes are one transaction. A failed publication cannot leave a partial draft.
 draft_result:=public.write_office_decoration(p_office_id,p_actor,p_expected_revision,p_base_revision,'draft',p_document);
 result:=public.write_office_decoration(p_office_id,p_actor,(draft_result->>'revision')::integer,p_base_revision,'publish',p_document);
 insert into private.office_decoration_commits(office_id,operation_id,actor,expected_revision,base_revision,document,result)
 values(p_office_id,p_operation_id,p_actor,p_expected_revision,p_base_revision,p_document,result);
 -- Bounded idempotency receipts. Older retries still fail the monotonic CAS check.
 delete from private.office_decoration_commits where office_id=p_office_id and operation_id in
 (select operation_id from private.office_decoration_commits where office_id=p_office_id order by created_at desc,operation_id offset 256);
 return result;
end; $$;
revoke all on function public.commit_live_office_decoration(uuid,uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.commit_live_office_decoration(uuid,uuid,uuid,integer,integer,jsonb) to service_role;
commit;
