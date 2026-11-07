import {randomUUID} from 'node:crypto';
import {composeDecoratedEnvironment,composeOfficeEnvironment} from '../../../../packages/shared/src/environment/decoration.ts';
import {applyObjectChanges,documentKey,objectChanges,parseLiveRequest,safeFurnitureTransition,structureVersion,type LiveSnapshot,type LiveRequest,type LiveDelta} from '../../../../packages/shared/src/environment/live-decoration.ts';
import type {EnvironmentConfig} from '../../../../packages/shared/src/environment/catalog.ts';
import type {DecorationWorkspace} from '../../../../packages/shared/src/environment/decoration-database.ts';
import type {OfficeMap} from '../../../../packages/shared/src/map.ts';
import type {LivePlayer} from '../../../../packages/shared/src/environment/live-decoration.ts';
import type {Authorization} from '../auth/authorize.ts';
export type LiveSeed={config:EnvironmentConfig;workspace:DecorationWorkspace};
export type LiveStore={read(auth:Authorization):Promise<LiveSeed>;owner(auth:Authorization):Promise<DecorationWorkspace>;save(auth:Authorization,request:LiveRequest,document:LiveSnapshot['document'],baseRevision:number):Promise<DecorationWorkspace>};
export class UnconfirmedSave extends Error{}
export class LiveOffice{
 snapshot:LiveSnapshot;
 map:OfficeMap;
 private receipts=new Map<string,{request:string;delta:LiveDelta}>();
 private tail:Promise<unknown>=Promise.resolve();
 private pendingSave:string|null=null;
 private pending?:{userId:string;request:LiveRequest};
 pendingFor(userId:string){return this.pending?.userId===userId?this.pending.request:undefined;}
 constructor(readonly config:EnvironmentConfig,workspace:DecorationWorkspace,officeId:string){
  this.map=composeOfficeEnvironment(config,{document:workspace.published,revision:workspace.publishedRevision,baseRevision:workspace.baseRevision});
  this.snapshot={officeId,epoch:randomUUID(),structureVersion:structureVersion(this.map),revision:0,savedRevision:workspace.revision,publishedRevision:workspace.publishedRevision,baseRevision:workspace.baseRevision,document:workspace.published,published:workspace.published};
 }
 run(value:unknown,auth:Authorization,store:LiveStore,players:()=>Iterable<LivePlayer>,inputs:()=>ReadonlyMap<string,{x:number;y:number;run?:boolean}>,apply:(map:OfficeMap,delta:LiveDelta)=>void){
  const work=this.tail.catch(()=>{}).then(async()=>{
   const request=parseLiveRequest(value),s=this.snapshot;
   if(request.officeId!==auth.officeId||auth.officeId!==s.officeId||request.epoch!==s.epoch)throw Error('The editing session changed. Reopen the editor.');
   // Authorization is fresh for retries too. No client role/actor is accepted.
   const owner=await store.owner(auth),receipt=this.receipts.get(request.operationId),key=JSON.stringify([auth.userId,request]);
   if(receipt){if(receipt.request!==key)throw Error('Operation ID was reused. Reopen the editor.');return {snapshot:this.snapshot,delta:receipt.delta,replayed:true};}
   if(request.revision!==s.revision)throw Error('Another owner changed the office. Review the latest layout and retry.');
   if(this.pendingSave&&this.pendingSave!==key)throw Error('A save is unconfirmed. Retry that save before making more changes.');
   if(owner.baseRevision!==s.baseRevision||(!this.pendingSave&&owner.publishedRevision!==s.publishedRevision))throw Error('The saved office changed outside this session. Reconnect before editing.');
   const next=request.kind==='edit'?applyObjectChanges(this.config,s.document,request.changes!):s.document;
   let map=composeDecoratedEnvironment(this.config,next,s.publishedRevision);
   // This safety check and the geometry swap run synchronously, after every await.
   if(request.kind==='edit')safeFurnitureTransition(this.map,map,players(),inputs());
   let saved:DecorationWorkspace|undefined;
   if(request.kind==='save'){
    if(!this.pendingSave&&request.savedRevision!==owner.revision)throw Error('The draft changed. Reload the draft before saving.');
    this.pendingSave=key;
    this.pending={userId:auth.userId,request};
    try{saved=await store.save(auth,request,next,s.baseRevision);}catch(error){if(!(error instanceof UnconfirmedSave)){this.pendingSave=null;this.pending=undefined;}throw error;}
    if(documentKey(saved.published)!==documentKey(next)||saved.baseRevision!==s.baseRevision)throw Error('Save could not be verified. Retry the same save.');
   }
   const delta:LiveDelta={...s,operationId:request.operationId,previousRevision:s.revision,revision:s.revision+1,changes:objectChanges(this.config,s.document,next),saved:!!saved};
   // Delta contains metadata + affected instances, never full documents/tilemaps.
   delete (delta as Partial<LiveSnapshot>).document;delete (delta as Partial<LiveSnapshot>).published;
   if(saved){delta.savedRevision=saved.revision;delta.publishedRevision=saved.publishedRevision;}
   this.snapshot={...s,revision:delta.revision,savedRevision:delta.savedRevision,publishedRevision:delta.publishedRevision,document:next,published:saved?next:s.published};
   if(saved)map=composeDecoratedEnvironment(this.config,next,saved.publishedRevision);
   this.map=map;this.pendingSave=null;this.pending=undefined;apply(map,delta);
   this.receipts.set(request.operationId,{request:key,delta});if(this.receipts.size>256)this.receipts.delete(this.receipts.keys().next().value!);
   return{snapshot:this.snapshot,delta,replayed:false};
  });this.tail=work;return work;
 }
}
