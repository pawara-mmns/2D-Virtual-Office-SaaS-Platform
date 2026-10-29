"use server";
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/features/auth/server';
import { createClient } from '@/lib/supabase/server';
import type { EnvironmentDatabase } from '../../../../../packages/shared/src/environment/database';
import { isId } from '../../../../../packages/shared/src/protocol';
import { EnvironmentError, saveEnvironment } from './service';
export type EnvironmentSaveState={status:'idle'|'error'|'success';message?:string;revision?:number};
export async function saveEnvironmentAction(_previous:EnvironmentSaveState,form:FormData):Promise<EnvironmentSaveState>{
  await requireUser();
  try{
    const organizationId=form.get('organizationId'),raw=form.get('config');
    if(!isId(organizationId)||typeof raw!=='string'||raw.length>4096)throw new EnvironmentError('input');
    let config:unknown;try{config=JSON.parse(raw);}catch{throw new EnvironmentError('input');}
    const result=await saveEnvironment(await createClient<EnvironmentDatabase>(),form.get('officeId'),Number(form.get('revision')),config);
    revalidatePath(`/workspace/${organizationId}`,'layout');
    return{status:'success',revision:result.revision,message:'Office setup saved and applied. Connected teammates will be asked to reload within a few seconds.'};
  }catch(error){return{status:'error',message:error instanceof EnvironmentError?error.message:'The office setup could not be saved. Try again shortly.'};}
}
