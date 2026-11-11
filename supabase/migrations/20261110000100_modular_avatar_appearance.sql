-- Phase 04: additive only. Review and apply manually; no data backfill or RLS changes.
begin;
create function private.valid_avatar_appearance(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  catalog constant jsonb := '{"body":["classic","slim","broad"],"hair":["short","waves","curls","long","crop","bob","bun","bald"],"eyes":["round","soft","bright"],"eyebrows":["natural","straight","arched"],"expression":["calm","smile","cheerful"],"top":["tshirt","shirt","hoodie","jacket","dress"],"bottom":["pants","jeans","skirt","none"],"shoes":["formal","sneakers","casual"],"glasses":["none","round","square"],"headphones":["none","overear"],"hat":["none","cap","beanie"],"office":["none","badge"]}';
  colors constant text[] := array['skinColor','hairColor','topColor','bottomColor','shoeColor','accessoryColor'];
  item record; color_key text;
begin
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  if value->'version' is distinct from '1'::jsonb or (select count(*) from jsonb_object_keys(value)) <> 19 then return false; end if;
  for item in select * from jsonb_each(catalog) loop
    if jsonb_typeof(value->item.key) is distinct from 'string' or not (item.value ? (value->>item.key)) then return false; end if;
  end loop;
  foreach color_key in array colors loop
    if jsonb_typeof(value->color_key) is distinct from 'string' or (value->>color_key) !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
  end loop;
  return (value->>'top' = 'dress') = (value->>'bottom' = 'none');
end;
$$;
alter table public.profiles add column avatar_appearance jsonb;
alter table public.profiles add constraint profiles_avatar_appearance_valid check (avatar_appearance is null or private.valid_avatar_appearance(avatar_appearance));
comment on column public.profiles.avatar_appearance is 'Nullable v1 modular avatar metadata; NULL preserves avatar_key exactly. IDs and hex colors only.';
revoke all on function private.valid_avatar_appearance(jsonb) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.valid_avatar_appearance(jsonb) to authenticated;
grant select (avatar_appearance), insert (avatar_appearance), update (avatar_appearance) on public.profiles to authenticated;
commit;
