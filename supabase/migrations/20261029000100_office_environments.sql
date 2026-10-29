begin;
create function private.valid_office_environment(c jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare o jsonb := c->'overrides';
begin
  if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(o) is distinct from 'object' then return false; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(c) k) is distinct from array['decor','furniture','layout','overrides','theme','version']
    or (select array_agg(k order by k) from jsonb_object_keys(o) k) is distinct from array['accent','branding','planter','rug'] then return false; end if;
  return coalesce(c->'version' = '1'::jsonb
    and c->>'layout' in ('open-office','corporate-hq','startup-office','coworking-space','training-hub')
    and c->>'theme' in ('warm-wood','minimal-light','scandinavian','dark-tech','eco-green')
    and c->>'decor' in ('minimal','balanced','rich') and c->>'furniture' in ('standard','executive','collaborative')
    and o->>'accent' in ('ocean','forest','clay','plum','gold','teal','rose','slate')
    and o->>'rug' in ('none','runner','grid') and o->>'planter' in ('terracotta','ceramic')
    and jsonb_typeof(o->'branding') = 'string' and char_length(o->>'branding') <= 32
    and o->>'branding' = btrim(o->>'branding') and o->>'branding' !~ '[[:cntrl:]<>]', false);
end; $$;
revoke all on function private.valid_office_environment(jsonb) from public, anon, authenticated;

create table public.office_environment_settings (
  office_id uuid primary key references public.offices(id) on delete cascade,
  config jsonb not null check (private.valid_office_environment(config)),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.office_environment_settings enable row level security;
revoke all on public.office_environment_settings from public, anon, authenticated;
grant select (office_id,config,revision,updated_at) on public.office_environment_settings to authenticated;
create policy office_environment_read_member on public.office_environment_settings for select to authenticated
  using (exists (select 1 from public.offices o where o.id = office_id and private.organization_is_member(o.organization_id)));

-- Only this fixed-caller RPC writes. The client cannot assign tenant/author/revision.
-- Lock the office, organization and owner membership before saving; role/status
-- changes and concurrent edits cannot race the permission or expected revision.
create function public.save_office_environment(p_office_id uuid, p_expected_revision integer, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_office uuid; v_revision integer; v_config jsonb;
begin
  if v_user is null or auth.role() is distinct from 'authenticated' or not exists (
    select 1 from auth.users u where u.id = v_user and u.email_confirmed_at is not null and u.deleted_at is null
  ) then raise exception 'Verified owner required' using errcode = '42501'; end if;
  select o.id into v_office from public.offices o
    join public.organizations g on g.id = o.organization_id
    join public.organization_members m on m.organization_id = g.id and m.user_id = v_user
    where o.id = p_office_id and g.status = 'ACTIVE' and m.status = 'ACTIVE' and m.role = 'OWNER'
    for update of o,g,m;
  if v_office is null then raise exception 'Office owner required' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or not private.valid_office_environment(p_config) then
    raise exception 'Invalid environment configuration' using errcode = '22023'; end if;
  select revision, config into v_revision,v_config from public.office_environment_settings where office_id = v_office;
  if coalesce(v_revision,0) <> p_expected_revision then raise exception 'Environment changed; reload before saving' using errcode = '40001'; end if;
  if v_config is not distinct from p_config then return jsonb_build_object('config',v_config,'revision',v_revision); end if;
  v_revision := coalesce(v_revision,0)+1;
  insert into public.office_environment_settings(office_id,config,revision,updated_by)
    values(v_office,p_config,v_revision,v_user)
    on conflict(office_id) do update set config=excluded.config,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('config',p_config,'revision',v_revision);
end; $$;
revoke all on function public.save_office_environment(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.save_office_environment(uuid,integer,jsonb) to authenticated;
commit;
