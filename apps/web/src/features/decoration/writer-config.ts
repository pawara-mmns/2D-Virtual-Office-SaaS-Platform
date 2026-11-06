import {DecorationError} from './service.ts';
// Prefer an explicit editor credential, otherwise the existing tenant-data
// integration. The independent administrator identity project is never assumed
// to be the workspace database. Returned credentials must remain server-only.
export function decorationWriterConfig(env:Record<string,string|undefined>,publicUrl:string){
  const explicit=env.OFFICE_DECORATION_SUPABASE_SECRET_KEY?.trim();
  if(explicit){const url=env.OFFICE_DECORATION_SUPABASE_URL?.trim()||publicUrl;if(url!==publicUrl)throw new DecorationError('The office editor server key must belong to this workspace Supabase project.');return{url,key:explicit};}
  const pairs=[{url:env.PLATFORM_DATA_SUPABASE_URL?.trim(),key:env.PLATFORM_DATA_SUPABASE_SECRET_KEY?.trim()},{url:env.SUPABASE_ADMIN_URL?.trim()||publicUrl,key:env.SUPABASE_SECRET_KEY?.trim()}];
  const match=pairs.find(p=>p.url===publicUrl&&p.key);
  if(!match)throw new DecorationError('Office editing requires a server-side Supabase key for this workspace project. Contact your administrator.');
  return{url:publicUrl,key:match.key!};
}
