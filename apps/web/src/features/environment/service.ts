import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnvironmentDatabase } from '../../../../../packages/shared/src/environment/database.ts';
import { defaultEnvironment, parseEnvironment, type EnvironmentConfig } from '../../../../../packages/shared/src/environment/catalog.ts';
import { composeEnvironment } from '../../../../../packages/shared/src/environment/compose.ts';
import { isId } from '../../../../../packages/shared/src/protocol.ts';
export class EnvironmentError extends Error {
  readonly kind: 'setup'|'unavailable'|'forbidden'|'conflict'|'input';
  constructor(kind: EnvironmentError['kind']) {
    super({setup:'Office customization needs the environment database migration. Ask your administrator to finish setup.',unavailable:'Office settings could not be loaded or saved. Try again shortly.',forbidden:'Only an active workspace owner can change the office environment.',conflict:'Another owner changed this office. Reload the page to review their setup before saving.',input:'Choose valid office options and a company sign of up to 32 characters.'}[kind]);
    this.kind=kind;
  }
}
export type EnvironmentRecord = { config?: EnvironmentConfig; revision: number; available: boolean };
const setupCodes=['42P01','42883','PGRST202','PGRST205'];
function failure(code:string):never {throw new EnvironmentError(setupCodes.includes(code)?'setup':code==='42501'?'forbidden':code==='40001'?'conflict':code==='22023'?'input':'unavailable');}
export async function loadEnvironment(client:SupabaseClient<EnvironmentDatabase>,officeId:string):Promise<EnvironmentRecord> {
  if(!isId(officeId))throw new EnvironmentError('forbidden');
  const {data,error}=await client.from('office_environment_settings').select('config,revision').eq('office_id',officeId).maybeSingle();
  // Rollout compatibility: a genuinely missing migration keeps the existing map.
  // A dependency outage, invalid row or permission error never becomes a default.
  if(error){if(setupCodes.includes(error.code))return{revision:0,available:false};failure(error.code);}
  if(!data)return{config:parseEnvironment(defaultEnvironment),revision:0,available:true};
  try {if(!Number.isSafeInteger(data.revision)||data.revision<1)throw Error();return{config:parseEnvironment(data.config),revision:data.revision,available:true};}catch{throw new EnvironmentError('unavailable');}
}
export async function saveEnvironment(client:SupabaseClient<EnvironmentDatabase>,officeId:unknown,revision:unknown,input:unknown) {
  if(!isId(officeId))throw new EnvironmentError('forbidden');
  if(typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0)throw new EnvironmentError('input');
  let config:EnvironmentConfig;try{config=parseEnvironment(input);composeEnvironment(config);}catch{throw new EnvironmentError('input');}
  const {data,error}=await client.rpc('save_office_environment',{p_office_id:officeId,p_expected_revision:revision,p_config:config});
  if(error)failure(error.code);
  if(!data||typeof data!=='object'||!('config'in data)||!('revision'in data)||!Number.isSafeInteger(data.revision)||Number(data.revision)<1)throw new EnvironmentError('unavailable');
  return{config:parseEnvironment(data.config),revision:Number(data.revision)};
}
