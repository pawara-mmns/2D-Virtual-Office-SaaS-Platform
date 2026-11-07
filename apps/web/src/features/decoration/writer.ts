import 'server-only';
import {createClient} from '@supabase/supabase-js';
import type {DecorationDatabase} from '../../../../../packages/shared/src/environment/decoration-database';
import {getSupabaseConfig} from '@/lib/supabase/config';
import {DecorationError} from './service';
import {decorationWriterConfig} from './writer-config';
// Used only after cookie-backed getUser and owner RPC authorization. Never
// reuse the platform administrator identity connection or expose this client.
export function decorationWriter(){
  const config=getSupabaseConfig();if(!config)throw new DecorationError('Office project configuration is unavailable.');
  const {url,key}=decorationWriterConfig(process.env,config.url);
  return createClient<DecorationDatabase>(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})}});
}
