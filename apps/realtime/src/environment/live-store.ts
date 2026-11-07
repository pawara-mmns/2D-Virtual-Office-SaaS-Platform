import {createClient} from '@supabase/supabase-js';
import {defaultEnvironment,parseEnvironment} from '../../../../packages/shared/src/environment/catalog.ts';
import {emptyDecoration,parseDecoration} from '../../../../packages/shared/src/environment/decoration.ts';
import type {DecorationWorkspace} from '../../../../packages/shared/src/environment/decoration-database.ts';
import {UnconfirmedSave,type LiveStore} from './live.ts';
import type {Authorization} from '../auth/authorize.ts';
export function supabaseLiveStore(url:string,key:string,writerKey?:string):LiveStore{
 const client=(auth:Authorization)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${auth.token}`},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(5000)})}});
 const owner=async(auth:Authorization)=>{const {data,error}=await client(auth).rpc('load_office_decoration_draft',{p_office_id:auth.officeId});if(error||!data)throw Error('Only an active verified organization owner may edit this office.');const row=data as DecorationWorkspace;return{...row,draft:parseDecoration(row.draft),published:parseDecoration(row.published),previous:row.previous?parseDecoration(row.previous):null};};
 return{
  owner,
  async read(auth){
   const c=client(auth),[{data:base,error:be},{data:row,error:de}]=await Promise.all([c.from('office_environment_settings').select('config,revision').eq('office_id',auth.officeId).maybeSingle(),c.from('office_decoration_settings').select('published,revision,published_revision,base_revision').eq('office_id',auth.officeId).maybeSingle()]);
   if(be||de)throw Error('Live office storage is unavailable.');
   const doc=row?parseDecoration(row.published):emptyDecoration();
   return{config:base?parseEnvironment(base.config):defaultEnvironment,workspace:{revision:row?.revision??0,publishedRevision:row?.published_revision??0,baseRevision:base?.revision??0,draftBaseRevision:base?.revision??0,draft:doc,published:doc,previous:null,previousBaseRevision:null,updatedAt:null,updatedBy:null}};
  },
  async save(auth,request,document,baseRevision){
   if(!writerKey)throw Error('Live saving needs the workspace Supabase writer key on the realtime server. Your live edits are not saved yet.');
   const writer=createClient(url,writerKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})}});
   let result;for(let attempt=0;attempt<2;attempt++){
    result=await writer.rpc('commit_live_office_decoration',{p_office_id:auth.officeId,p_actor:auth.userId,p_operation_id:request.operationId,p_expected_revision:request.savedRevision,p_base_revision:baseRevision,p_document:document});
    if(!result.error)break;
    if(['40001','42501','22023','PGRST202','42883'].includes(result.error.code))throw Error(result.error.code==='40001'?'The saved draft changed. Reload the draft before saving.':result.error.code==='42501'?'Owner permission was denied.':result.error.code==='22023'?'The layout could not be saved.':'Live saving needs the local live-office SQL migration applied to this project.');
   }
   if(result?.error||!result?.data)throw new UnconfirmedSave('Save could not be confirmed. Retry Save to reconcile the same operation.');
   const row=await owner(auth).catch(()=>{throw new UnconfirmedSave('Save could not be confirmed. Retry Save to reconcile the same operation.');});
   return row;
  }
 };
}
