import { blocked, tileLayer, TILE_SIZE, type OfficeMap, type Marker } from './map.ts';
import { bodyCorners, canStand } from './movement.ts';
import { fixtures, type Fixture } from './environment/rooms.ts';
import type { AvatarDirection } from './avatars.ts';
import {catalogSeats,chairFamilies,embeddedWorkstationAssets,isChairAsset,seatExits,type SeatRect} from './environment/seating-metadata.ts';
import {directionalChairRects} from './environment/assets.ts';

export type InteractionAction = 'SIT'|'STAND'|'USE'|'OPEN'|'PLAY_GAME'|'SHARE_SCREEN';
export type Point = {x:number;y:number};
export type InteractionAnchor = {id:string;position:Point;direction:AvatarDirection;actions:readonly InteractionAction[]};
export type OfficeObject = {instanceId:string;assetId:string;objectType:string;position:Point;interactionRadius:number;anchors:readonly InteractionAnchor[];
  footprint:Point & {width:number;height:number};actions:readonly InteractionAction[];occupancy:{capacity:number;onePerSlot:boolean}};
export type SeatSlot = { id:string;parentObjectId:string;worldPosition:Point;anchor:Point & {direction:AvatarDirection};collisionFootprint:SeatRect;approaches:Point[];approachAnchor:Point;standAnchor:Point;facingDirection:AvatarDirection };
export type ForegroundRect=SeatRect&{sourceX:number;sourceY:number};
export type Interactable = OfficeObject & {objectType:'chair'|'sofa'|'bench';occupancy:{capacity:number;onePerSlot:true};slots:SeatSlot[];foreground:ForegroundRect[]};
// Only seating artwork gets functional actions. Future action names confer no capability.
export const seatingCatalog=Object.fromEntries([...Object.keys(chairFamilies),...embeddedWorkstationAssets,'waiting','benchWaiting','sofa','sofaCompact','sofaSectional','beanBag'].map(id=>{const rect=fixtures[id as Fixture],seats=catalogSeats(id,rect[2],rect[3]);return[id,{type:seats[0]!.type,slots:seats.length}];})) as Partial<Record<Fixture,{type:Interactable['objectType'];slots:number}>>;
function placements(map:OfficeMap):Marker[] {
  const layer=map.layers.find(l=>l.name==='Placements'&&l.type==='objectgroup');
  if(layer?.type==='objectgroup')return layer.objects;
  // Legacy maps have the same content-owned atlas, but predate placement metadata.
  // Match complete artwork rectangles, never infer seats from arbitrary solid tiles.
  const data=tileLayer(map,'Furniture').data,result:Marker[]=[];
  for(const name of [...Object.keys(seatingCatalog),'meeting'] as Fixture[]) {
    const [sx,sy,w,h]=fixtures[name];
    for(let y=0;y<=map.height-h/32;y++)for(let x=0;x<=map.width-w/32;x++) {
      let matches=true;
      for(let j=0;j<h/32&&matches;j++)for(let i=0;i<w/32;i++)if(data[(y+j)*map.width+x+i]!==1+(sy/32+j)*16+sx/32+i){matches=false;break;}
      if(matches)result.push({name,type:'legacy',x:x*32,y:y*32,width:w,height:h});
    }
  }
  const table=result.filter(p=>p.name==='meeting');
  return result.filter(p=>p.name!=='meeting').map(p=>{
    if(p.name!=='chair')return p;
    const nearest=table.map(t=>({t,d:Math.hypot(p.x+16-t.x-t.width!/2,p.y+16-t.y-t.height!/2)})).sort((a,b)=>a.d-b.d)[0]?.t;
    if(!nearest||Math.hypot(p.x+16-nearest.x-nearest.width!/2,p.y+16-nearest.y-nearest.height!/2)>128)return p;
    const facing:AvatarDirection=p.x+16<nearest.x?'right':p.x+16>nearest.x+nearest.width!?'left':p.y+16<nearest.y?'down':'up';
    return{...p,facing};
  });
}
export function registerSeating(map:OfficeMap, placement:Marker & {instanceId?:string}):Interactable|null {
  if(!seatingCatalog[placement.name as Fixture]||![placement.x,placement.y,placement.width,placement.height].every(Number.isFinite))return null;
  const {x,y}=placement,width=placement.width!,height=placement.height!;
  if(width<=0||height<=0||x<0||y<0||x+width>map.width*32||y+height>map.height*32)return null;
  const instanceId=placement.instanceId??`${map.layers.some(l=>l.name==='Environment')?'base/':''}${placement.type}/${placement.name}/${x}:${y}`;
  const definitions=catalogSeats(placement.name,width,height,placement.facing);
  const slots=definitions.map(seat=>{
    const anchor={x:x+seat.anchor.x,y:y+seat.anchor.y,direction:seat.facing},r={...seat.footprint,x:x+seat.footprint.x,y:y+seat.footprint.y};
    const approaches=seatExits(r,anchor,seat.exit).filter(p=>canStand(map,p.x,p.y));
    return {id:`${instanceId}/seat/${seat.key}`,parentObjectId:instanceId,worldPosition:{x:r.x+r.width/2,y:r.y+r.height/2},anchor,collisionFootprint:r,approaches,approachAnchor:approaches[0]!,standAnchor:approaches[0]!,facingDirection:seat.facing};
  }).filter(slot=>slot.approaches.length>0);
  const [sx,sy]=isChairAsset(placement.name)?directionalChairRects[placement.name][placement.facing??'down']:fixtures[placement.name as Fixture];
  const foreground:ForegroundRect[]=embeddedWorkstationAssets.includes(placement.name)?[{x:x+3,y:y+30,width:width-6,height:5,sourceX:sx+3,sourceY:sy+30}]:[];
  return slots.length?{instanceId,assetId:placement.name,objectType:definitions[0]!.type,position:{x,y},interactionRadius:64,footprint:{x,y,width,height},actions:['SIT','STAND'],anchors:slots.map(s=>({id:s.id,position:{x:s.anchor.x,y:s.anchor.y},direction:s.anchor.direction,actions:['SIT','STAND']})),occupancy:{capacity:slots.length,onePerSlot:true},slots,foreground}:null;
}
export function interactionRegistry(map:OfficeMap) {
  const objects=placements(map).map(p=>registerSeating(map,p)).filter((p):p is Interactable=>!!p);
  const ids=new Set<string>();
  for(const o of objects){if(ids.has(o.instanceId))throw Error('Duplicate interactable identity');ids.add(o.instanceId);}
  return objects.sort((a,b)=>a.instanceId.localeCompare(b.instanceId));
}
function pathClear(map:OfficeMap,a:Point,b:Point,allow?:Interactable['footprint']) {
  const architecture=tileLayer(map,'Architecture').data,steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
  for(let n=0;n<=steps;n++)for(const [x,y]of bodyCorners(a.x+(b.x-a.x)*n/steps,a.y+(b.y-a.y)*n/steps)) {
    const tx=Math.floor(x/TILE_SIZE),ty=Math.floor(y/TILE_SIZE);
    if(tx<0||ty<0||tx>=map.width||ty>=map.height||architecture[ty*map.width+tx])return false;
    const within=allow&&x>=allow.x&&y>=allow.y&&x<allow.x+allow.width&&y<allow.y+allow.height;
    if(!within&&blocked(map,tx,ty))return false;
  }
  return true;
}
export function seatApproach(map:OfficeMap,object:Interactable,slot:SeatSlot,from:Point) {
  if(!canStand(map,from.x,from.y)||Math.hypot(from.x-slot.anchor.x,from.y-slot.anchor.y)>object.interactionRadius)return undefined;
  return slot.approaches.filter(p=>Math.hypot(p.x-from.x,p.y-from.y)<=object.interactionRadius&&pathClear(map,from,p)&&pathClear(map,p,slot.anchor,slot.collisionFootprint))
    .sort((a,b)=>Math.hypot(a.x-from.x,a.y-from.y)-Math.hypot(b.x-from.x,b.y-from.y)||a.y-b.y||a.x-b.x)[0];
}
export function standPosition(map:OfficeMap,object:Interactable,slot:SeatSlot) {
  return slot.approaches.find(p=>canStand(map,p.x,p.y)&&pathClear(map,slot.anchor,p,slot.collisionFootprint));
}
export type PrimaryInteraction = {action:'SIT'|'STAND';objectId:string;slotId:string;label:string;available?:boolean};
export function closestInteraction(map:OfficeMap,objects:readonly Interactable[],from:Point,occupied:ReadonlyMap<string,string>,seatId=''):PrimaryInteraction|null {
  if(seatId){const object=objects.find(o=>o.slots.some(s=>s.id===seatId));return object?{action:'STAND',objectId:object.instanceId,slotId:seatId,label:'Stand',available:true}:null;}
  const candidates=objects.flatMap(o=>o.slots.filter(s=>seatApproach(map,o,s,from)).map(s=>({o,s,d:Math.hypot(from.x-s.anchor.x,from.y-s.anchor.y),available:!occupied.has(s.id)})))
    .sort((a,b)=>a.d-b.d||a.s.id.localeCompare(b.s.id));
  const chosen=candidates.find(c=>c.available)??candidates[0];return chosen?{action:'SIT',objectId:chosen.o.instanceId,slotId:chosen.s.id,label:chosen.available?'Sit':'Seat occupied',available:chosen.available} : null;
}
export type InteractionRequest = {action:'SIT'|'STAND';objectId:string;slotId:string;seq:number};
export function parseInteraction(value:unknown):InteractionRequest|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as InteractionRequest;
  return Object.keys(v).length===4&&['SIT','STAND'].includes(v.action)&&typeof v.objectId==='string'&&v.objectId.length>0&&v.objectId.length<=160&&typeof v.slotId==='string'&&v.slotId.startsWith(v.objectId+'/seat/')&&v.slotId.length<=180&&Number.isSafeInteger(v.seq)&&v.seq>=0?v:null;
}
