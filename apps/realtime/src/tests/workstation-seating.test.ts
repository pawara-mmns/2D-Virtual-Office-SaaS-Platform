import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {composeEnvironment} from '../../../../packages/shared/src/environment/compose.ts';
import {defaultEnvironment,layouts,themes,furnitureSets} from '../../../../packages/shared/src/environment/catalog.ts';
import {catalogSeats,embeddedWorkstationAssets,isChairAsset} from '../../../../packages/shared/src/environment/seating-metadata.ts';
import {directionalChairRects} from '../../../../packages/shared/src/environment/assets.ts';
import {interactionRegistry,seatApproach,standPosition,closestInteraction,registerSeating,type Point,type InteractionRequest} from '../../../../packages/shared/src/interactions.ts';
import {createSeating} from '../../../../packages/shared/src/seating.ts';
import {canStand,advanceMovement,type MovingPosition} from '../../../../packages/shared/src/movement.ts';
import {tileLayer,type OfficeMap,type Marker} from '../../../../packages/shared/src/map.ts';
import {avatarSittingFrame,avatarDirections,avatarPresets} from '../../../../packages/shared/src/avatars.ts';
import {conversationSpace} from '../voice/space.ts';
const placed=(map:OfficeMap)=>{const l=map.layers.find(l=>l.name==='Placements');return l?.type==='objectgroup'?l.objects:[];};
const player=(p:{x:number;y:number}):MovingPosition=>({...p,direction:'down',isMoving:false,seatId:''});

test('every authored chair including compound desks is registered, usable and stable across all layouts/styles/themes',()=>{
  const directions=new Set<string>(),families=new Set<string>();let checked=0;
  for(const layout of layouts)for(const furniture of furnitureSets)for(const theme of themes){
    const map=composeEnvironment({...defaultEnvironment,layout:layout.id,furniture:furniture.id,theme:theme.id}),objects=interactionRegistry(map),occupied=new Map<string,string>(),service=createSeating(map,occupied);
    assert.deepEqual(objects,interactionRegistry(map));
    for(const p of placed(map)){
      const definitions=catalogSeats(p.name,p.width!,p.height!,p.facing);if(!definitions.length)continue;
      const object=objects.find(o=>o.assetId===p.name&&o.position.x===p.x&&o.position.y===p.y);assert.ok(object,`${layout.id}/${furniture.id}/${p.name} missing`);
      assert.equal(object.slots.length,definitions.length);families.add(p.name);
      for(const slot of object.slots){
        const def=definitions.find(d=>slot.id.endsWith('/seat/'+d.key))!;assert.ok(def);checked++;
        assert.equal(slot.parentObjectId,object.instanceId);assert.equal(slot.anchor.x,p.x+def.anchor.x);assert.equal(slot.anchor.y,p.y+def.anchor.y);assert.equal(slot.facingDirection,def.facing);directions.add(def.facing);
        const approach:Point|undefined=slot.approaches.find(a=>seatApproach(map,object,slot,a));assert.ok(approach,slot.id);
        const actor=player(approach),request:InteractionRequest={objectId:object.instanceId,slotId:slot.id,action:'SIT',seq:0};
        assert.equal(service.act('fixture',actor,request),'OK');assert.equal(actor.direction,def.facing);assert.equal(actor.motionState,'SITTING');
        const before={x:actor.x,y:actor.y};advanceMovement(map,actor,{x:1,y:1,run:true});assert.deepEqual({x:actor.x,y:actor.y},before);
        assert.equal(conversationSpace(map)(actor,approach),true);
        assert.equal(service.act('fixture',actor,{...request,action:'STAND',seq:1}),'OK');assert.ok(canStand(map,actor.x,actor.y));assert.equal(occupied.size,0);
      }
    }
  }
  assert.deepEqual([...directions].sort(),['down','left','right','up']);assert.ok(checked>1000);
  for(const id of ['deskSingle','deskDual','deskLaptop','deskReturn','deskManager','classroomDesk','chairTask','chairMesh','chairVisitor','chairMeeting','chairClassroom','chairLounge','sofaCompact','sofaSectional','benchWaiting'])assert.ok(families.has(id),id);
});

test('workstation footprints allow only the drawn chair area and never authorize a snap through the desktop',()=>{
  for(const furniture of furnitureSets){
    const map=composeEnvironment({...defaultEnvironment,furniture:furniture.id}),service=createSeating(map,new Map()),objects=service.objects;
    const object=objects.find(o=>furniture.id==='collaborative'?isChairAsset(o.assetId)&&o.slots[0]?.facingDirection==='up':embeddedWorkstationAssets.includes(o.assetId));assert.ok(object);
    const slot=object.slots[0]!,entry=slot.approaches.find(p=>seatApproach(map,object,slot,p))!;assert.ok(entry);assert.equal(slot.anchor.direction,'up');
    if(embeddedWorkstationAssets.includes(object.assetId)){
      assert.ok(slot.collisionFootprint.height<object.footprint.height);assert.ok(object.foreground.length>0);
      const r=slot.collisionFootprint;assert.ok(slot.anchor.x>=r.x&&slot.anchor.x<r.x+r.width);
      // A valid free point north of the desk cannot shortcut across its desktop.
      const north={x:slot.anchor.x,y:object.position.y-20};if(canStand(map,north.x,north.y))assert.equal(seatApproach(map,object,slot,north),undefined);
    }
    assert.equal(service.act('workstation',player(entry),{action:'SIT',objectId:object.instanceId,slotId:slot.id,seq:0}),'OK');
  }
});

test('legacy rendered computer chairs are discovered inside desk artwork and meeting seats face the table',()=>{
  const map=JSON.parse(readFileSync(new URL('../../../web/public/office/studio.json',import.meta.url),'utf8')) as OfficeMap,objects=interactionRegistry(map);
  assert.equal(objects.filter(o=>o.assetId==='desk').length,6);
  for(const object of objects.filter(o=>o.assetId==='desk')){assert.equal(object.slots[0]!.anchor.direction,'up');assert.ok(standPosition(map,object,object.slots[0]!));}
  assert.ok(objects.some(o=>o.assetId==='chair'&&o.slots[0]!.anchor.direction==='down'));assert.ok(objects.some(o=>o.assetId==='chair'&&o.slots[0]!.anchor.direction==='up'));
});

test('directional chair metadata chooses authored atlas art, and every avatar has four distinct native seated frames',()=>{
  const map=composeEnvironment(defaultEnvironment),furniture=tileLayer(map,'Furniture');
  for(const p of placed(map))if(isChairAsset(p.name)){
    const [sx,sy]=directionalChairRects[p.name][p.facing??'down'];assert.equal(furniture.data[p.y/32*map.width+p.x/32],1+sy/32*16+sx/32);
  }
  for(const preset of avatarPresets){const frames=avatarDirections.map(direction=>avatarSittingFrame(preset.key,direction));assert.equal(new Set(frames).size,4);for(const frame of frames)assert.ok(frame>=72&&frame<144);}
});

test('a blocked preferred stand anchor selects another collision-validated exit; occupancy remains atomic',()=>{
  const map=composeEnvironment(defaultEnvironment),objects=interactionRegistry(map),object=objects.find(o=>isChairAsset(o.assetId)&&o.slots[0]!.approaches.length>1)!;
  assert.ok(object);const slot=object.slots[0]!,entry=slot.approaches.find(a=>seatApproach(map,object,slot,a))!,occupied=new Map<string,string>(),service=createSeating(map,occupied),a=player(entry),b=player(entry),request={action:'SIT' as const,objectId:object.instanceId,slotId:slot.id,seq:0};
  assert.equal(service.act('a',a,request),'OK');assert.equal(service.act('b',b,request),'OCCUPIED');
  const preferred=standPosition(map,object,slot)!;for(const [x,y]of [[preferred.x-7,preferred.y+6],[preferred.x+6,preferred.y+15]])tileLayer(map,'Collision').data[Math.floor(y!/32)*map.width+Math.floor(x!/32)]=1;
  const alternative=standPosition(map,object,slot);assert.ok(alternative);assert.notDeepEqual(alternative,preferred);
  assert.equal(service.act('a',a,{...request,action:'STAND',seq:1}),'OK');assert.ok(canStand(map,a.x,a.y));assert.equal(occupied.size,0);
});

test('occupied feedback is explicit and stable IDs survive independent composition',()=>{
  const map=composeEnvironment(defaultEnvironment),objects=interactionRegistry(map),o=objects.find(o=>o.slots.some(s=>s.approaches.some(a=>seatApproach(map,o,s,a))))!,s=o.slots[0]!,a=s.approaches.find(a=>seatApproach(map,o,s,a))!,occupied=new Map([[s.id,'other']]);
  assert.equal(closestInteraction(map,[o],a,occupied)?.available,false);assert.equal(closestInteraction(map,[o],a,occupied)?.label,'Seat occupied');
  assert.equal(closestInteraction(map,[o],a,new Map())?.label,'Sit');assert.equal(closestInteraction(map,[o],s.anchor,occupied,s.id)?.label,'Stand');
  const original=placed(map).find(p=>isChairAsset(p.name))!;
  const future:Marker={...original,instanceId:'persistent-owner-object',facing:'left'};
  const registered=registerSeating(map,future);assert.ok(registered);assert.equal(registered.instanceId,future.instanceId);assert.equal(registered.slots[0]!.facingDirection,'left');assert.equal(registered.slots[0]!.parentObjectId,future.instanceId);
});
