begin;
-- Catalog data below is generated from the shared authored asset allowlist.
create function private.office_editor_catalog() returns jsonb language sql immutable set search_path='' as $$
select '{"desk":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"executiveDesk":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"bench":{"width":128,"height":32,"mode":"blocking","orientations":["down"]},"divider":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"chair":{"width":32,"height":32,"mode":"blocking","orientations":["down","left","up","right"]},"plant":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"ceramic":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"sofa":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"coffee":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"armchair":{"width":32,"height":32,"mode":"blocking","orientations":["down","left","up","right"]},"meeting":{"width":128,"height":64,"mode":"blocking","orientations":["down"]},"books":{"width":96,"height":32,"mode":"blocking","orientations":["down"]},"board":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"reception":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"cabinet":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"lamp":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"notice":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"pantry":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"water":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"printer":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"filing":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"frame":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"sideTable":{"width":32,"height":32,"mode":"blocking","orientations":["down"]},"waiting":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"coffeeStation":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"utilityShelf":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"deskSingle":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"deskDual":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"deskLaptop":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"deskStanding":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"deskCreative":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"deskReturn":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"deskManager":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"benchShared":{"width":128,"height":32,"mode":"blocking","orientations":["down"]},"benchLaptop":{"width":128,"height":32,"mode":"blocking","orientations":["down"]},"deskNotebook":{"width":32,"height":32,"mode":"surface","orientations":["down"]},"deskLamp":{"width":32,"height":32,"mode":"surface","orientations":["down"]},"deskMug":{"width":32,"height":32,"mode":"surface","orientations":["down"]},"deskFiles":{"width":32,"height":32,"mode":"surface","orientations":["down"]},"chairMesh":{"width":32,"height":32,"mode":"blocking","orientations":["down","left","up","right"]},"chairTask":{"width":32,"height":32,"mode":"blocking","orientations":["down","left","up","right"]},"chairVisitor":{"width":32,"height":32,"mode":"blocking","orientations":["down","left","up","right"]},"chairMeeting":{"width":32,"height":32,"mode":"blocking","orientations":["down","left","up","right"]},"chairLounge":{"width":32,"height":32,"mode":"blocking","orientations":["down","left","up","right"]},"chairClassroom":{"width":32,"height":32,"mode":"blocking","orientations":["down","left","up","right"]},"benchWaiting":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"stool":{"width":32,"height":32,"mode":"blocking","orientations":["down","left","up","right"]},"filesTall":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"drawerUnit":{"width":32,"height":32,"mode":"blocking","orientations":["down"]},"bookcase":{"width":96,"height":32,"mode":"blocking","orientations":["down"]},"shelfOpen":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"lockerBank":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"cupboard":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"printerStand":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"copier":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"serverRack":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"storageLow":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"receptionFormal":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"receptionCurve":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"brochureStand":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"welcomeSign":{"width":64,"height":32,"mode":"wall","orientations":["down"]},"brandingFeature":{"width":96,"height":32,"mode":"wall","orientations":["down"]},"tableSmall":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"tableMedium":{"width":128,"height":64,"mode":"blocking","orientations":["down"]},"tableLarge":{"width":160,"height":64,"mode":"blocking","orientations":["down"]},"whiteboard":{"width":64,"height":32,"mode":"wall","orientations":["down"]},"glassBoard":{"width":64,"height":32,"mode":"wall","orientations":["down"]},"wallDisplay":{"width":96,"height":32,"mode":"wall","orientations":["down"]},"presentationDesk":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"conferenceDevice":{"width":32,"height":32,"mode":"surface","orientations":["down"]},"espressoMachine":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"waterDispenser":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"fridgeMini":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"microwave":{"width":32,"height":32,"mode":"surface","orientations":["down"]},"snackShelf":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"diningTable":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"barTable":{"width":96,"height":32,"mode":"blocking","orientations":["down"]},"pantryCounter":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"sofaCompact":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"sofaSectional":{"width":128,"height":64,"mode":"blocking","orientations":["down"]},"coffeeRound":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"sideRound":{"width":32,"height":32,"mode":"blocking","orientations":["down"]},"lampArc":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"magazineStack":{"width":32,"height":32,"mode":"surface","orientations":["down"]},"artDiptych":{"width":64,"height":32,"mode":"wall","orientations":["down"]},"certificate":{"width":32,"height":32,"mode":"wall","orientations":["down"]},"clock":{"width":32,"height":32,"mode":"wall","orientations":["down"]},"pinboard":{"width":64,"height":32,"mode":"wall","orientations":["down"]},"trashBin":{"width":32,"height":32,"mode":"blocking","orientations":["down"]},"tallPalm":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"plantSmall":{"width":32,"height":32,"mode":"blocking","orientations":["down"]},"planterWide":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"deskPlant":{"width":32,"height":32,"mode":"surface","orientations":["down"]},"classroomDesk":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"podium":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"projectorTable":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"collaborationRound":{"width":96,"height":64,"mode":"blocking","orientations":["down"]},"mobileBoard":{"width":64,"height":64,"mode":"blocking","orientations":["down"]},"directionalSign":{"width":64,"height":32,"mode":"wall","orientations":["down"]},"companyPoster":{"width":64,"height":32,"mode":"wall","orientations":["down"]},"wallSconce":{"width":32,"height":32,"mode":"wall","orientations":["down"]},"consoleTable":{"width":64,"height":32,"mode":"blocking","orientations":["down"]},"magazineStand":{"width":32,"height":64,"mode":"blocking","orientations":["down"]},"cornerPlanter":{"width":32,"height":32,"mode":"blocking","orientations":["down"]},"rugRunner":{"width":128,"height":64,"mode":"floor","orientations":["down"]},"rugGrid":{"width":96,"height":64,"mode":"floor","orientations":["down"]}}'::jsonb;
$$;
revoke all on function private.office_editor_catalog() from public,anon,authenticated;
create function private.valid_office_decoration(d jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare o jsonb; a jsonb; ident text; seen text[]:='{}';
begin
 if jsonb_typeof(d) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(d) k) is distinct from array['objects','removed','version']
 or d->'version' is distinct from '1'::jsonb or jsonb_typeof(d->'objects') is distinct from 'array' or jsonb_typeof(d->'removed') is distinct from 'array' then return false; end if;
 if jsonb_array_length(d->'objects')>160 or jsonb_array_length(d->'removed')>512 then return false; end if;
 for o in select value from jsonb_array_elements(d->'objects') loop
  if jsonb_typeof(o) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(o) k) is distinct from array['assetId','id','orientation','x','y'] then return false; end if;
  ident:=o->>'id'; a:=private.office_editor_catalog()->(o->>'assetId');
  if ident is null or ident !~ '^(custom/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|base/[a-zA-Z0-9_/:.-]{1,140})$' or ident=any(seen) or a is null
   or not coalesce(a->'orientations' ? (o->>'orientation'),false) or jsonb_typeof(o->'x') is distinct from 'number' or jsonb_typeof(o->'y') is distinct from 'number'
   or (o->>'x')::numeric not between 0 and 4096 or (o->>'y')::numeric not between 0 and 4096 or mod((o->>'x')::numeric,32)<>0 or mod((o->>'y')::numeric,32)<>0 then return false; end if;
  seen:=array_append(seen,ident);
 end loop;
 for o in select value from jsonb_array_elements(d->'removed') loop
  ident:=o#>>'{}'; if jsonb_typeof(o) is distinct from 'string' or ident !~ '^base/[a-zA-Z0-9_/:.-]{1,140}$' or ident=any(seen) then return false; end if; seen:=array_append(seen,ident);
 end loop; return true;
exception when others then return false;
end; $$;
revoke all on function private.valid_office_decoration(jsonb) from public,anon,authenticated;
create table public.office_decoration_settings(
 office_id uuid primary key references public.offices(id) on delete cascade,
 published jsonb not null default '{"version":1,"objects":[],"removed":[]}' check(private.valid_office_decoration(published)),
 revision integer not null default 0 check(revision>=0), published_revision integer not null default 0 check(published_revision>=0),base_revision integer not null default 0,
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id) on delete set null
);
create table private.office_decoration_drafts(
 office_id uuid primary key references public.office_decoration_settings(office_id) on delete cascade,
 document jsonb not null check(private.valid_office_decoration(document)),base_revision integer not null,
 previous jsonb check(previous is null or private.valid_office_decoration(previous)),previous_base_revision integer
);
alter table public.office_decoration_settings enable row level security;
alter table private.office_decoration_drafts enable row level security;
revoke all on public.office_decoration_settings,private.office_decoration_drafts from public,anon,authenticated;
grant select on public.office_decoration_settings to authenticated;
create policy decoration_read_member on public.office_decoration_settings for select to authenticated using(exists(select 1 from public.offices o where o.id=office_id and private.organization_is_member(o.organization_id)));

create function private.lock_decoration_owner(p_office uuid,p_user uuid) returns void language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and deleted_at is null) then raise exception 'Verified owner required' using errcode='42501'; end if;
 perform o.id from public.offices o join public.organizations g on g.id=o.organization_id join public.organization_members m on m.organization_id=g.id and m.user_id=p_user
 where o.id=p_office and g.status='ACTIVE' and m.status='ACTIVE' and m.role='OWNER' for update of o,g,m;
 if not found then raise exception 'Active office owner required' using errcode='42501'; end if;
end; $$;
revoke all on function private.lock_decoration_owner(uuid,uuid) from public,anon,authenticated;

create function public.load_office_decoration_draft(p_office_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.office_decoration_settings; d private.office_decoration_drafts; b integer; empty_doc jsonb:='{"version":1,"objects":[],"removed":[]}';
begin
 if auth.role() is distinct from 'authenticated' then raise exception 'Owner required' using errcode='42501'; end if;
 perform private.lock_decoration_owner(p_office_id,auth.uid());
 select coalesce(revision,0) into b from public.office_environment_settings where office_id=p_office_id; b:=coalesce(b,0);
 select * into s from public.office_decoration_settings where office_id=p_office_id; select * into d from private.office_decoration_drafts where office_id=p_office_id;
 return jsonb_build_object('revision',coalesce(s.revision,0),'publishedRevision',coalesce(s.published_revision,0),'baseRevision',b,'draftBaseRevision',coalesce(d.base_revision,b),'draft',coalesce(d.document,s.published,empty_doc),'published',coalesce(s.published,empty_doc),'previous',d.previous,'previousBaseRevision',d.previous_base_revision,'updatedAt',s.updated_at,'updatedBy',s.updated_by);
end; $$;
revoke all on function public.load_office_decoration_draft(uuid) from public,anon,authenticated;
grant execute on function public.load_office_decoration_draft(uuid) to authenticated;

-- Only the server's secret-key client can invoke writes after the shared
-- composer validates geometry. Browser JWTs cannot bypass that validation.
create function public.write_office_decoration(p_office_id uuid,p_actor uuid,p_expected_revision integer,p_base_revision integer,p_operation text,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.office_decoration_settings; d private.office_decoration_drafts; b integer; empty_doc jsonb:='{"version":1,"objects":[],"removed":[]}';
begin
 perform private.lock_decoration_owner(p_office_id,p_actor);
 select coalesce(revision,0) into b from public.office_environment_settings where office_id=p_office_id; b:=coalesce(b,0);
 select * into s from public.office_decoration_settings where office_id=p_office_id; select * into d from private.office_decoration_drafts where office_id=p_office_id;
 if p_expected_revision is null or p_expected_revision<>coalesce(s.revision,0) or p_base_revision is distinct from b then raise exception 'Office revision conflict' using errcode='40001'; end if;
 if p_operation not in ('draft','publish','rollback') or p_operation is null or not private.valid_office_decoration(p_document) then raise exception 'Invalid decoration' using errcode='22023'; end if;
 if p_operation='rollback' and (d.previous is null or d.previous is distinct from p_document or d.previous_base_revision is distinct from b) then raise exception 'Recovery revision conflict' using errcode='40001'; end if;
 if p_operation='publish' and (d.document is null or d.document is distinct from p_document or d.base_revision is distinct from b) then raise exception 'Save this draft before publishing' using errcode='40001'; end if;
 insert into public.office_decoration_settings(office_id,revision,published_revision,base_revision,published,updated_by)
 values(p_office_id,coalesce(s.revision,0)+1,case when p_operation='draft' then coalesce(s.published_revision,0) else coalesce(s.published_revision,0)+1 end,b,case when p_operation='draft' then coalesce(s.published,empty_doc) else p_document end,p_actor)
 on conflict(office_id) do update set revision=excluded.revision,published_revision=excluded.published_revision,base_revision=excluded.base_revision,published=excluded.published,updated_by=excluded.updated_by,updated_at=now();
 insert into private.office_decoration_drafts(office_id,document,base_revision,previous,previous_base_revision)
 values(p_office_id,p_document,b,case when p_operation='draft' then d.previous else coalesce(s.published,empty_doc) end,case when p_operation='draft' then d.previous_base_revision else b end)
 on conflict(office_id) do update set document=excluded.document,base_revision=excluded.base_revision,previous=excluded.previous,previous_base_revision=excluded.previous_base_revision;
 return jsonb_build_object('revision',coalesce(s.revision,0)+1,'publishedRevision',case when p_operation='draft' then coalesce(s.published_revision,0) else coalesce(s.published_revision,0)+1 end);
end; $$;
revoke all on function public.write_office_decoration(uuid,uuid,integer,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.write_office_decoration(uuid,uuid,integer,integer,text,jsonb) to service_role;

-- Changing the modular base requires explicitly publishing Reset decorations
-- first. This preserves recoverable revisions instead of silently discarding edits.
create function private.guard_decorated_environment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (tg_op='INSERT' or new.config is distinct from old.config) and exists(select 1 from public.office_decoration_settings s where s.office_id=new.office_id and (jsonb_array_length(s.published->'objects')>0 or jsonb_array_length(s.published->'removed')>0)) then
 raise exception 'Reset and publish office decorations before changing the base environment' using errcode='40001'; end if; return new;
end; $$;
revoke all on function private.guard_decorated_environment() from public,anon,authenticated;
create trigger decorated_environment_guard before insert or update on public.office_environment_settings for each row execute function private.guard_decorated_environment();
commit;
