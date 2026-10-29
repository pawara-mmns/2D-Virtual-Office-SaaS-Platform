import { createClient } from '@supabase/supabase-js';
import { defaultEnvironment, parseEnvironment } from '../../../../packages/shared/src/environment/catalog.ts';
import { composeEnvironment } from '../../../../packages/shared/src/environment/compose.ts';
import type { EnvironmentDatabase } from '../../../../packages/shared/src/environment/database.ts';
import type { OfficeMap } from '../../../../packages/shared/src/map.ts';
import type { Authorization } from '../auth/authorize.ts';
export type EnvironmentMaps = (auth:Authorization,fresh?:boolean)=>Promise<OfficeMap>;
export function supabaseEnvironmentMaps(url:string,key:string,legacy:OfficeMap):EnvironmentMaps {
  // One bounded short-lived cache per office, never per user or frame. Identity
  // and membership are independently authorized before this resolver is called.
  const cache=new Map<string,{until:number;map:OfficeMap}>();
  return async (auth,fresh=false)=>{
    const found=cache.get(auth.officeId);if(!fresh&&found&&found.until>Date.now())return found.map;
    const client=createClient<EnvironmentDatabase>(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${auth.token}`},fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(4000)})}});
    const {data,error}=await client.from('office_environment_settings').select('config,revision').eq('office_id',auth.officeId).maybeSingle();
    if(error&&!['42P01','PGRST205'].includes(error.code))throw new Error('Office environment unavailable');
    const map=error?legacy:composeEnvironment(data?parseEnvironment(data.config):defaultEnvironment);
    for(const [id,value]of cache)if(value.until<Date.now())cache.delete(id);
    if(cache.size>=128)cache.delete(cache.keys().next().value!);
    cache.set(auth.officeId,{until:Date.now()+1000,map});return map;
  };
}
