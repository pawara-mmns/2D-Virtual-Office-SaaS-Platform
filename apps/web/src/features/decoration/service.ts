import type {SupabaseClient} from '@supabase/supabase-js';
import type {DecorationDatabase,DecorationWorkspace} from '../../../../../packages/shared/src/environment/decoration-database.ts';
import {parseDecoration,emptyDecoration,validateDecoration,type PublishedDecoration} from '../../../../../packages/shared/src/environment/decoration.ts';
import {isId} from '../../../../../packages/shared/src/protocol.ts';
import type {EnvironmentConfig} from '../../../../../packages/shared/src/environment/catalog.ts';
export class DecorationError extends Error{}
export function decorationFailure(code:string):never{throw new DecorationError(['42P01','42883','PGRST202','PGRST205'].includes(code)?'Office editing needs the Phase 02 database migration. Your published office is unchanged.':code==='42501'?'Only an active, verified organization owner may edit this office.':code==='40001'?'This office or draft changed. Reload the editor to review the latest revision before saving.':'Office editing is unavailable. Your changes have not been published. Retry shortly.');}
export async function loadPublishedDecoration(client:SupabaseClient<DecorationDatabase>,officeId:string,baseRevision:number):Promise<PublishedDecoration|undefined>{
  const {data,error}=await client.from('office_decoration_settings').select('published,published_revision,base_revision').eq('office_id',officeId).maybeSingle();
  if(error){if(['42P01','PGRST205'].includes(error.code))return;decorationFailure(error.code);}
  if(!data)return;
  const document=parseDecoration(data.published);
  if(!Number.isSafeInteger(data.published_revision)||data.published_revision<0||((document.objects.length||document.removed.length)&&data.base_revision!==baseRevision))throw new DecorationError('Published decoration revision could not be verified.');
  return{document,revision:data.published_revision,baseRevision:data.base_revision};
}
export async function loadDecorationWorkspace(client:SupabaseClient<DecorationDatabase>,officeId:unknown):Promise<DecorationWorkspace>{
  if(!isId(officeId))decorationFailure('42501');
  const {data,error}=await client.rpc('load_office_decoration_draft',{p_office_id:officeId});if(error)decorationFailure(error.code);
  const row=data as DecorationWorkspace;
  if(!row||![row.revision,row.publishedRevision,row.baseRevision,row.draftBaseRevision].every(n=>Number.isSafeInteger(n)&&n>=0))throw new DecorationError('Invalid office revision. Reload before editing.');
  return{...row,draft:parseDecoration(row.draft),published:parseDecoration(row.published),previous:row.previous===null?null:parseDecoration(row.previous)};
}
export async function persistDecoration(source:{owner:SupabaseClient<DecorationDatabase>;writer:()=>SupabaseClient<DecorationDatabase>;actor:string;config:EnvironmentConfig;officeId:unknown;revision:unknown;baseRevision:unknown;operation:unknown;document:unknown}){
  const {officeId,revision,baseRevision,operation}=source;
  if(!isId(officeId)||!isId(source.actor))decorationFailure('42501');
  if(!Number.isSafeInteger(revision)||Number(revision)<0||!Number.isSafeInteger(baseRevision)||Number(baseRevision)<0||!['draft','publish','rollback'].includes(String(operation)))throw new DecorationError('Invalid editor request.');
  const latest=await loadDecorationWorkspace(source.owner,officeId);
  if(latest.revision!==revision||latest.baseRevision!==baseRevision)decorationFailure('40001');
  const document=parseDecoration(operation==='rollback'?latest.previous??emptyDecoration():source.document);
  if(operation==='rollback'&&(!latest.previous||latest.previousBaseRevision!==baseRevision))decorationFailure('40001');
  const valid=validateDecoration(source.config,document);if(!valid.ok)throw new DecorationError(valid.message);
  const {data,error}=await source.writer().rpc('write_office_decoration',{p_actor:source.actor,p_office_id:officeId,p_expected_revision:Number(revision),p_base_revision:Number(baseRevision),p_operation:operation as 'draft'|'publish'|'rollback',p_document:document});
  if(error)decorationFailure(error.code);
  const saved=data as {revision:number;publishedRevision:number};if(!saved||!Number.isSafeInteger(saved.revision)||saved.revision!==Number(revision)+1||!Number.isSafeInteger(saved.publishedRevision))throw new DecorationError('Saved revision could not be verified. Reload the editor.');
  return saved;
}
