import {writeFileSync} from 'node:fs';
import {editorAssets} from '../packages/shared/src/environment/decoration.ts';
const catalog=Object.fromEntries(editorAssets.map(a=>[a.id,{width:a.width,height:a.height,mode:a.mode,orientations:a.orientations}]));
writeFileSync(new URL('../supabase/migrations/20261106000300_room_polish_catalog.sql',import.meta.url),`-- Add original room-specific sprites to the existing private validation allowlist.
-- No tenant rows, roles, permissions or authentication behavior are changed.
create or replace function private.office_editor_catalog() returns jsonb language sql immutable set search_path='' as $$
  select '${JSON.stringify(catalog)}'::jsonb;
$$;
revoke all on function private.office_editor_catalog() from public,anon,authenticated;
`);
