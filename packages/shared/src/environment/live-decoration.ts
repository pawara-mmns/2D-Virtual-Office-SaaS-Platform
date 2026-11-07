import {parseEnvironment,type EnvironmentConfig} from './catalog.ts';
import {parseDecoration,emptyDecoration,baseDecorationObjects,upsertDecoration,removeDecoration,resolvedObjects,type DecorationDocument,type DecorationObject} from './decoration.ts';
import {mapVersion,isId,type PlayerSnapshot} from '../protocol.ts';
import {interactionRegistry,standPosition} from '../interactions.ts';
import {canStand,advanceMovement} from '../movement.ts';
import type {OfficeMap} from '../map.ts';

export type ObjectChange={id:string;object:DecorationObject|null};
export type LiveSnapshot={officeId:string;epoch:string;structureVersion:string;revision:number;savedRevision:number;publishedRevision:number;baseRevision:number;document:DecorationDocument;published:DecorationDocument};
export type LiveRequest={operationId:string;officeId:string;epoch:string;revision:number;kind:'edit'|'save';changes?:ObjectChange[];savedRevision?:number};
export type LiveReply={operationId:string;ok:boolean;message?:string;snapshot?:LiveSnapshot};
export type LiveDelta=Omit<LiveSnapshot,'document'|'published'> & {operationId:string;previousRevision:number;changes:ObjectChange[];saved:boolean};
export const documentKey=(doc:DecorationDocument)=>JSON.stringify({version:1,objects:doc.objects.map(o=>({id:o.id,assetId:o.assetId,x:o.x,y:o.y,orientation:o.orientation})).sort((a,b)=>a.id.localeCompare(b.id)),removed:[...doc.removed].sort()});
export function diffObjects(before:DecorationDocument,after:DecorationDocument):ObjectChange[]{
 const a=new Map(before.objects.map(o=>[o.id,o])),b=new Map(after.objects.map(o=>[o.id,o]));
 const ids=new Set([...a.keys(),...b.keys(),...before.removed,...after.removed]);
 return [...ids].filter(id=>JSON.stringify(a.get(id))!==JSON.stringify(b.get(id))||before.removed.includes(id)!==after.removed.includes(id)).map(id=>({id,object:b.get(id)??null}));
}
export function applyObjectChanges(config:EnvironmentConfig,doc:DecorationDocument,changes:ObjectChange[]){
 let next=doc;
 for(const c of changes){
  if(c.object)next=upsertDecoration(next,c.object);
  else next=removeDecoration(next,c.id);
 }
 resolvedObjects(config,next);const base=new Map(baseDecorationObjects(config).map(o=>[o.id,o]));
 // Returning a generated object to its authored values removes the override,
 // so Reset really clears customization and unlocks the structural workflow.
 next={...next,objects:next.objects.filter(o=>{const b=base.get(o.id);return !b||b.assetId!==o.assetId||b.x!==o.x||b.y!==o.y||b.orientation!==o.orientation;})};
 return parseDecoration(next);
}
// An explicit base reset must carry its authored object, not an ambiguous null.
export function objectChanges(config:EnvironmentConfig,before:DecorationDocument,after:DecorationDocument){
 const resolved=new Map(resolvedObjects(config,after).map(o=>[o.id,o]));
 return diffObjects(before,after).map(c=>c.id.startsWith('base/')&&!after.removed.includes(c.id)&&!c.object?{id:c.id,object:resolved.get(c.id)!}:c);
}
export function parseLiveRequest(value:unknown):LiveRequest{
 if(!value||typeof value!=='object'||Array.isArray(value)||JSON.stringify(value).length>60000)throw Error('Invalid editing request.');
 const v=value as LiveRequest;
 if(Object.keys(v).some(k=>!['operationId','officeId','epoch','revision','kind','changes','savedRevision'].includes(k))||!isId(v.operationId)||!isId(v.officeId)||!isId(v.epoch)||!Number.isSafeInteger(v.revision)||v.revision<0||!['edit','save'].includes(v.kind))throw Error('Invalid editing request.');
 if(v.kind==='save'){if(!Number.isSafeInteger(v.savedRevision)||v.savedRevision!<0||v.changes!==undefined)throw Error('Invalid save revision.');}
 else{
  if(!Array.isArray(v.changes)||!v.changes.length||v.changes.length>320||new Set(v.changes.map(c=>c?.id)).size!==v.changes.length)throw Error('Invalid object changes.');
  for(const c of v.changes){if(!c||Object.keys(c).sort().join()!=='id,object'||typeof c.id!=='string')throw Error('Invalid object changes.');if(c.object){const d=parseDecoration({version:1,objects:[c.object],removed:[]});if(d.objects[0]!.id!==c.id)throw Error('Object identity mismatch.');}else parseDecoration(c.id.startsWith('base/')?{version:1,objects:[],removed:[c.id]}:{version:1,objects:[{id:c.id,assetId:'chair',x:0,y:0,orientation:'down'}],removed:[]});}
 }
 return v;
}
export function mapConfig(map:OfficeMap){const layer=map.layers.find(l=>l.name==='Environment');return layer?.type==='objectgroup'?parseEnvironment(JSON.parse(layer.objects[0]!.name)):undefined;}
export function structureVersion(map:OfficeMap){return mapVersion({...map,layers:map.layers.filter(l=>!['Furniture','Details','Collision','Placements','Decorations','Rugs','Customization'].includes(l.name))});}
export type LivePlayer=Pick<PlayerSnapshot,'sessionId'|'x'|'y'|'direction'|'isMoving'|'seatId'>;
export function safeFurnitureTransition(before:OfficeMap,after:OfficeMap,players:Iterable<LivePlayer>,inputs:ReadonlyMap<string,{x:number;y:number;run?:boolean}>=new Map()){
 if(structureVersion(before)!==structureVersion(after))throw Error('Structural changes require the office setup workflow.');
 const old=interactionRegistry(before),next=interactionRegistry(after);
 for(const p of players){
  if(p.seatId){const a=old.find(o=>o.slots.some(s=>s.id===p.seatId)),b=next.find(o=>o.instanceId===a?.instanceId),slot=b?.slots.find(s=>s.id===p.seatId);
   if(!a||!b||JSON.stringify(a)!==JSON.stringify(b)||!slot||!standPosition(after,b,slot))throw Error('That seat is occupied. Ask its occupant to stand before editing it or its access.');
  }else{
   if(!canStand(after,p.x,p.y))throw Error('A teammate is standing in that position. Choose a clear space.');
   // Schema fields are prototype accessors; spreading a Colyseus player loses x/y.
   const projected={x:p.x,y:p.y,direction:p.direction,isMoving:p.isMoving,seatId:p.seatId};advanceMovement(before,projected,inputs.get(p.sessionId)??{x:0,y:0});if(!canStand(after,projected.x,projected.y))throw Error('A teammate is moving through that position. Try a clear space.');
  }
 }
}
export const liveEmpty=emptyDecoration;
