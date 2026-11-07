import type { AvatarDirection } from '../avatars.ts';
import {collectionChairs,collectionDesks,collectionSofas} from './collection.ts';
export type SeatRect={x:number;y:number;width:number;height:number};
export type CatalogSeat={key:string;type:'chair'|'bench'|'sofa';anchor:{x:number;y:number};footprint:SeatRect;facing:AvatarDirection;exit:AvatarDirection};
export const chairFamilies={chair:'task',armchair:'lounge',chairMesh:'mesh',chairTask:'task',chairVisitor:'visitor',chairMeeting:'meeting',chairLounge:'lounge',chairClassroom:'classroom',stool:'stool',...collectionChairs} as const;
export type ChairAsset=keyof typeof chairFamilies;
export function isChairAsset(id:string):id is ChairAsset{return Object.hasOwn(chairFamilies,id);}
// These describe the actual artwork, including chairs drawn INSIDE desk sprites.
// Stand-up desks and collaboration tables do not invent an embedded seat.
const deskWidths:Record<string,number>={desk:64,executiveDesk:96,deskSingle:64,deskDual:64,deskLaptop:64,deskCreative:64,deskReturn:96,deskManager:96,classroomDesk:64,deskTriple:96,...collectionDesks};
const opposite:Record<AvatarDirection,AvatarDirection>={up:'down',down:'up',left:'right',right:'left'};
export function catalogSeats(id:string,width:number,height:number,facing?:AvatarDirection):CatalogSeat[] {
  if(id==='beanBag')return[{key:'0',type:'sofa',anchor:{x:16,y:13},footprint:{x:0,y:0,width:32,height:32},facing:'down',exit:'down'}];
  if(isChairAsset(id)){
    const direction=facing??'down',lounge=['lounge','wingback','scoop'].includes(chairFamilies[id]);
    const x=direction==='left'?14:direction==='right'?18:16;
    const y=lounge?(direction==='up'?10:14):direction==='up'?7:direction==='down'?10:9;
    return[{key:'0',type:'chair',anchor:{x,y},footprint:{x:0,y:0,width:32,height:32},facing:direction,exit:lounge?direction:opposite[direction]}];
  }
  if(deskWidths[id]===width&&height===64){
    const legacy=id==='desk',chairY=legacy?36:34;
    return[{key:'0',type:'chair',anchor:{x:width/2,y:chairY+10},footprint:{x:width/2-16,y:32,width:32,height:32},facing:'up',exit:'down'}];
  }
  const count=collectionSofas[id as keyof typeof collectionSofas]??(id==='sofa'||id==='sofaCompact'?2:id==='sofaSectional'?3:id==='waiting'||id==='benchWaiting'?2:0);
  return Array.from({length:count},(_,i)=>({key:String(i),type:id.startsWith('sofa')||id==='waitingSettee'||id==='poufKnitted'?'sofa':'bench',anchor:{x:(i+.5)*width/count,y:height-22},footprint:{x:0,y:0,width,height},facing:'down',exit:'down'}));
}
export const embeddedWorkstationAssets=Object.keys(deskWidths);
export function seatExits(r:SeatRect,anchor:{x:number;y:number},preferred:AvatarDirection){
  const exits={down:{x:anchor.x,y:r.y+r.height+4},up:{x:anchor.x,y:r.y-20},left:{x:r.x-10,y:anchor.y},right:{x:r.x+r.width+10,y:anchor.y}};
  return[preferred,...(['down','left','right','up'] as const).filter(d=>d!==preferred)].map(d=>exits[d]);
}
