'use server';
import {requireUser} from '@/features/auth/server';
import {createClient} from '@/lib/supabase/server';
import {loadEnvironment} from '@/features/environment/service';
import type {EnvironmentDatabase} from '../../../../../packages/shared/src/environment/database';
import type {DecorationDatabase} from '../../../../../packages/shared/src/environment/decoration-database';
import {DecorationError,loadDecorationWorkspace,persistDecoration} from './service';
import {decorationWriter} from './writer';
export async function loadDecorationAction(officeId:string){
  await requireUser();try{return{ok:true as const,workspace:await loadDecorationWorkspace(await createClient<DecorationDatabase>(),officeId)};}catch(error){return{ok:false as const,message:error instanceof DecorationError?error.message:'Office editing could not load. Retry shortly.'};}
}
export async function saveDecorationAction(input:{officeId:string;revision:number;baseRevision:number;operation:'draft'|'publish'|'rollback';document:unknown}){
  const user=await requireUser();
  try{
    if(!input||JSON.stringify(input).length>65000)throw new DecorationError('Editor request exceeds the office budget.');
    const owner=await createClient<DecorationDatabase>();
    // Reject non-owners before reading configuration or creating a secret client.
    await loadDecorationWorkspace(owner,input.officeId);
    const environment=await loadEnvironment(await createClient<EnvironmentDatabase>(),input.officeId);
    if(!environment.available||!environment.config)throw new DecorationError('Office environment setup is incomplete.');
    if(environment.revision!==input.baseRevision)throw new DecorationError('The base environment changed. Reload the editor.');
    const result=await persistDecoration({...input,actor:user.id,owner,writer:decorationWriter,config:environment.config});
    return{ok:true as const,...result};
  }catch(error){return{ok:false as const,message:error instanceof DecorationError?error.message:'Office changes could not be saved. Retry shortly.'};}
}
