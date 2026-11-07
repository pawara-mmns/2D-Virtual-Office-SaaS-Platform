import { interactionRegistry, seatApproach, standPosition, type InteractionRequest } from './interactions.ts';
import type { OfficeMap } from './map.ts';
import type { MovingPosition } from './movement.ts';
type Occupancy = {has(id:string):boolean;get(id:string):string|undefined;set(id:string,owner:string):unknown;delete(id:string):unknown;clear():void};
export function createSeating(map:OfficeMap,occupied:Occupancy) {
  const objects=interactionRegistry(map),byId=new Map(objects.map(o=>[o.instanceId,o]));
  const owners=new Map<string,string>();
  const transitions=new Map<string,number>();
  return {
    objects,
    updateMap(next:OfficeMap){map=next;objects.splice(0,objects.length,...interactionRegistry(next));byId.clear();for(const o of objects)byId.set(o.instanceId,o);},
    act(session:string,player:MovingPosition,request:InteractionRequest,now=Date.now()):'OK'|'OCCUPIED'|'OUT_OF_RANGE'|'INVALID' {
      const object=byId.get(request.objectId),slot=object?.slots.find(s=>s.id===request.slotId);
      if(!object||!slot)return 'INVALID';
      if(request.action==='SIT') {
        if(player.seatId||owners.has(session))return 'INVALID';
        if(occupied.has(slot.id))return 'OCCUPIED';
        if(!seatApproach(map,object,slot,player))return 'OUT_OF_RANGE';
        // Synchronous claim + player update within one room message: no await race.
        occupied.set(slot.id,session);owners.set(session,slot.id);transitions.delete(session);
        Object.assign(player,{x:slot.anchor.x,y:slot.anchor.y,direction:slot.anchor.direction,seatId:slot.id,isMoving:false,isRunning:false,motionState:'SITTING'});
        return 'OK';
      }
      if(owners.get(session)!==slot.id||occupied.get(slot.id)!==session||player.seatId!==slot.id)return 'INVALID';
      const stand=standPosition(map,object,slot);if(!stand)return 'OUT_OF_RANGE';
      const dx=stand.x-slot.anchor.x,dy=stand.y-slot.anchor.y;
      const direction=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down';
      Object.assign(player,{...stand,direction,seatId:'',isMoving:false,isRunning:false,motionState:'STANDING'});
      occupied.delete(slot.id);owners.delete(session);transitions.set(session,now+150);
      return 'OK';
    },
    transitioning(session:string,now=Date.now()){return (transitions.get(session)??0)>now;},
    release(session:string,player?:MovingPosition) {
      const id=owners.get(session);transitions.delete(session);
      if(id) {
        const object=objects.find(o=>o.slots.some(s=>s.id===id)),slot=object?.slots.find(s=>s.id===id),stand=object&&slot?standPosition(map,object,slot):undefined;
        if(player&&stand)Object.assign(player,stand);
        if(occupied.get(id)===session)occupied.delete(id);
      }
      owners.delete(session);
      if(player)Object.assign(player,{seatId:'',isMoving:false,isRunning:false,motionState:'IDLE'});
    },
    clear(){occupied.clear();owners.clear();transitions.clear();},
  };
}
