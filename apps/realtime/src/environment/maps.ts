import { createClient } from '@supabase/supabase-js';
import { defaultEnvironment, parseEnvironment } from '../../../../packages/shared/src/environment/catalog.ts';
import type { EnvironmentDatabase } from '../../../../packages/shared/src/environment/database.ts';
import type { OfficeMap } from '../../../../packages/shared/src/map.ts';
import type { Authorization } from '../auth/authorize.ts';
import type {DecorationDatabase} from '../../../../packages/shared/src/environment/decoration-database.ts';
import {composeOfficeEnvironment,parseDecoration,type PublishedDecoration} from '../../../../packages/shared/src/environment/decoration.ts';
export type EnvironmentMaps = (auth:Authorization,fresh?:boolean)=>Promise<OfficeMap>;
export function supabaseEnvironmentMaps(url:string,key:string,legacy:OfficeMap):EnvironmentMaps {
  // One bounded short-lived cache per office, never per user or frame. Identity
  // and membership are independently authorized before this resolver is called.
  const cache=new Map<string,{until:number;map:OfficeMap}>();
  return async (auth,fresh=false)=>{
    const found=cache.get(auth.officeId);if(!fresh&&found&&found.until>Date.now())return found.map;
    const client=createClient<EnvironmentDatabase&DecorationDatabase>(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${auth.token}`},fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(4000)})}});
    const {data,error}=await client.from('office_environment_settings').select('config,revision').eq('office_id',auth.officeId).maybeSingle();
    if(error&&!['42P01','PGRST205'].includes(error.code))throw new Error('Office environment unavailable');
    let published:PublishedDecoration|undefined;
    if(!error){const result=await client.from('office_decoration_settings').select('published,published_revision,base_revision').eq('office_id',auth.officeId).maybeSingle();
      if(result.error&&!['42P01','PGRST205'].includes(result.error.code))throw Error('Office decorations unavailable');
      if(result.data){const row=result.data,document=parseDecoration(row.published);
        if(!Number.isSafeInteger(row.published_revision)||row.published_revision<0||((document.objects.length||document.removed.length)&&row.base_revision!==(data?.revision??0)))throw Error('Office decoration revision mismatch');
        published={document,revision:row.published_revision,baseRevision:row.base_revision};}
    }
    const map=error?legacy:composeOfficeEnvironment(data?parseEnvironment(data.config):defaultEnvironment,published);
    for(const [id,value]of cache)if(value.until<Date.now())cache.delete(id);
    if(cache.size>=128)cache.delete(cache.keys().next().value!);
    cache.set(auth.officeId,{until:Date.now()+1000,map});return map;
  };
}
