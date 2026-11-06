import 'server-only';
import {createClient} from '@supabase/supabase-js';
import type {DecorationDatabase} from '../../../../../packages/shared/src/environment/decoration-database';
import {getSupabaseConfig} from '@/lib/supabase/config';
import {DecorationError} from './service';
// Used only after cookie-backed getUser and owner RPC authorization. Never
// reuse the platform administrator identity connection or expose this client.
export function decorationWriter(){
  const config=getSupabaseConfig(),url=process.env.SUPABASE_ADMIN_URL?.trim()||config?.url,key=process.env.SUPABASE_SECRET_KEY?.trim();
  if(!config||url!==config.url||!key)throw new DecorationError('Office editing requires a server-side Supabase key for this project. Contact your administrator.');
  return createClient<DecorationDatabase>(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})}});
}
