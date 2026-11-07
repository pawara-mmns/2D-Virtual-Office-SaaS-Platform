import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {advanceMovement,canStand,movementRules,type MovingPosition} from '../../../../packages/shared/src/movement.ts';
import {interactionRegistry,seatApproach,closestInteraction,parseInteraction,standPosition} from '../../../../packages/shared/src/interactions.ts';
import {createSeating} from '../../../../packages/shared/src/seating.ts';
import {tileLayer,validateOfficeMap,type OfficeMap} from '../../../../packages/shared/src/map.ts';
import {composeEnvironment} from '../../../../packages/shared/src/environment/compose.ts';
import {defaultEnvironment,layouts,themes,furnitureSets} from '../../../../packages/shared/src/environment/catalog.ts';
import {validInput} from '../../../../packages/shared/src/protocol.ts';
import {avatarMotion,avatarSittingFrame,avatarIdleFrame,avatarPresets,avatarDirections} from '../../../../packages/shared/src/avatars.ts';
import {conversationSpace} from '../voice/space.ts';
const legacy=validateOfficeMap(JSON.parse(readFileSync(new URL('../../../web/public/office/studio.json',import.meta.url),'utf8')));
function position(x=600,y=450):MovingPosition{return{x,y,direction:'down',isMoving:false,seatId:''};}
const request=(o:{instanceId:string},s:{id:string},action:'SIT'|'STAND'='SIT')=>({objectId:o.instanceId,slotId:s.id,action,seq:0});

test('walking/running use fixed authoritative speeds, diagonals normalize, extra speed/time/position payloads fail',()=>{
  const walk=position(),run=position(),diagonal=position(),over=position();
  advanceMovement(legacy,walk,{x:1,y:0});advanceMovement(legacy,run,{x:1,y:0,run:true});advanceMovement(legacy,diagonal,{x:1,y:1,run:true});advanceMovement(legacy,over,{x:9999,y:0,run:true},999999);
  assert.ok(Math.abs(walk.x-600-6)<1e-9);assert.ok(Math.abs(run.x-600-9.6)<1e-9);assert.ok(Math.abs(Math.hypot(diagonal.x-600,diagonal.y-450)-9.6)<1e-9);assert.equal(over.x,run.x);
  assert.equal(run.motionState,'RUNNING');assert.equal(run.isRunning,true);
  advanceMovement(legacy,run,{x:1,y:0,run:false});assert.equal(run.motionState,'WALKING');assert.equal(run.isRunning,false);
  advanceMovement(legacy,run,{x:0,y:0,run:true});assert.equal(run.motionState,'IDLE');
  assert.equal(movementRules.runMultiplier,1.6);assert.ok(validInput({seq:1,x:1,y:0,run:true}));
  for(const patch of [{run:1},{run:'true'},{speed:999},{dt:999},{x:2},{position:{x:999,y:999}}])assert.equal(validInput({seq:1,x:1,y:0,run:true,...patch}),false);
});
test('running cannot tunnel through a one-tile wall or furniture even across repeated ticks',()=>{
  for(const [x,y,dx,dy]of [[48,496,-1,0],[512,272,0,-1]]){
    const p=position(x,y);for(let i=0;i<200;i++){advanceMovement(legacy,p,{x:dx!,y:dy!,run:true});assert.equal(canStand(legacy,p.x,p.y),true);}
    assert.equal(p.isMoving,false);assert.equal(p.motionState,'IDLE');
  }
});
test('legacy and every supported layout/theme/furniture combination have stable, usable content-owned seats',()=>{
  assert.ok(interactionRegistry(legacy).length>0);
  for(const layout of layouts)for(const theme of themes)for(const furniture of furnitureSets){
    const map=composeEnvironment({...defaultEnvironment,layout:layout.id,theme:theme.id,furniture:furniture.id}),objects=interactionRegistry(map);
    assert.ok(objects.length>0,layout.id);assert.deepEqual(objects,interactionRegistry(map));
    let usable=0;for(const o of objects)for(const s of o.slots){assert.equal(o.occupancy.capacity,o.slots.length);const p=s.approaches.find(p=>seatApproach(map,o,s,p));if(p){usable++;assert.ok(standPosition(map,o,s));}}
    assert.ok(usable>0,`${layout.id}/${theme.id}/${furniture.id}`);
  }
});
test('seat/stand is authoritative, one seat per player, contested claims are atomic and multiple sofa slots are independent',()=>{
  const map=composeEnvironment(defaultEnvironment),occupied=new Map<string,string>(),seats=createSeating(map,occupied);
  const sofa=seats.objects.find(o=>o.objectType==='sofa'&&o.slots.filter(s=>s.approaches.some(p=>seatApproach(map,o,s,p))).length>=2)!;
  assert.ok(sofa);const usable=sofa.slots.filter(s=>s.approaches.some(p=>seatApproach(map,sofa,s,p))),s=usable[0]!,s2=usable[1]!;
  const approach=s.approaches.find(p=>seatApproach(map,sofa,s,p))!,p=position(approach.x,approach.y),p2={...p};
  assert.equal(seats.act('a',p,request(sofa,s)),'OK');assert.equal(seats.act('b',p2,request(sofa,s)),'OCCUPIED');
  assert.equal(p.motionState,'SITTING');assert.equal(occupied.get(s.id),'a');assert.equal(seats.act('a',p,request(sofa,s2)),'INVALID');
  const ap2=s2.approaches.find(a=>seatApproach(map,sofa,s2,a))!;Object.assign(p2,ap2);
  assert.equal(seats.act('b',p2,request(sofa,s2)),'OK');assert.equal(occupied.size,2);
  const seated={x:p.x,y:p.y};advanceMovement(map,p,{x:1,y:1,run:true});assert.deepEqual({x:p.x,y:p.y},seated);assert.equal(p.isMoving,false);
  assert.equal(seats.act('b',p2,request(sofa,s,'STAND')),'INVALID');
  assert.equal(seats.act('a',p,request(sofa,s,'STAND'),1000),'OK');assert.ok(canStand(map,p.x,p.y));assert.equal(p.seatId,'');assert.equal(p.motionState,'STANDING');assert.ok(seats.transitioning('a',1100));assert.equal(seats.transitioning('a',1151),false);
  seats.release('b',p2);assert.equal(occupied.size,0);assert.equal(p2.seatId,'');assert.ok(canStand(map,p2.x,p2.y));seats.release('b',p2);seats.clear();
});
test('range and geometry reject wall-crossing/blocked approaches; nearest primary is stable and hides when occupied or distant',()=>{
  const map=composeEnvironment(defaultEnvironment),objects=interactionRegistry(map),o=objects.find(o=>o.slots.some(s=>s.approaches.some(a=>seatApproach(map,o,s,a))))!,s=o.slots.find(s=>s.approaches.some(a=>seatApproach(map,o,s,a)))!,a=s.approaches.find(a=>seatApproach(map,o,s,a))!;
  const occupied=new Map<string,string>();assert.ok(closestInteraction(map,objects,a,occupied));assert.equal(closestInteraction(map,[o],{x:-500,y:-500},occupied),null);
  for(const seat of o.slots)occupied.set(seat.id,'other');assert.equal(closestInteraction(map,[o],a,occupied)?.available,false);
  assert.equal(closestInteraction(map,[o],s.anchor,occupied,s.id)?.action,'STAND');
  const blockedMap=structuredClone(map) as OfficeMap;
  for(const p of s.approaches){const tx=Math.floor(p.x/32),ty=Math.floor((p.y+11)/32);tileLayer(blockedMap,'Architecture').data[ty*map.width+tx]=9;tileLayer(blockedMap,'Collision').data[ty*map.width+tx]=1;}
  assert.equal(seatApproach(blockedMap,o,s,a),undefined);
  const far=position();const service=createSeating(map,new Map());assert.notEqual(service.act('far',far,request(o,s)),'OK');
  for(const value of [null,{},request(o,s,'SIT')&&{...request(o,s),action:'PLAY_GAME'}, {...request(o,s),x:100}, {...request(o,s),seq:-1},{...request(o,s),slotId:'other/seat/0'}])assert.equal(parseInteraction(value),null);
  assert.ok(parseInteraction(request(o,s)));
});
test('seated anchors preserve architectural proximity visibility and deterministic avatar motion states',()=>{
  const map=composeEnvironment(defaultEnvironment),objects=interactionRegistry(map),o=objects.find(o=>o.slots.some(s=>s.approaches.some(a=>seatApproach(map,o,s,a))))!,s=o.slots.find(s=>s.approaches.some(a=>seatApproach(map,o,s,a)))!,a=s.approaches.find(a=>seatApproach(map,o,s,a))!;
  assert.equal(conversationSpace(map)(s.anchor,a),true,'Furniture does not change the existing voice eligibility geometry');
  const frames=new Set<number>();for(const preset of avatarPresets)for(const direction of avatarDirections){const frame=avatarSittingFrame(preset.key,direction);frames.add(frame);assert.ok(frame>=72&&frame<144);assert.equal(frame-avatarIdleFrame(preset.key,direction),72);}assert.equal(frames.size,24);
  assert.equal(avatarMotion({isMoving:true,isRunning:true,connected:true}),'RUNNING');assert.equal(avatarMotion({isMoving:false,seatId:s.id,connected:true}),'SITTING');assert.equal(avatarMotion({isMoving:true,isRunning:true,connected:false}),'IDLE');
});

test('a valid nearby avatar cannot sit across a solid partition even when the seat and approach are free',()=>{
  const width=12,height=10,count=width*height,floor=Array<number>(count).fill(1),walls=Array<number>(count).fill(0),collision=Array<number>(count).fill(0),furniture=Array<number>(count).fill(0);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!x||!y||x===width-1||y===height-1||x===5){walls[y*width+x]=9;collision[y*width+x]=1;}
  furniture[3*width+6]=35;collision[3*width+6]=1;
  const layer=(name:string,data:number[])=>({name,type:'tilelayer' as const,width,height,data});
  const map:OfficeMap={width,height,tilewidth:32,tileheight:32,layers:[layer('Floor',floor),layer('Architecture',walls),layer('Furniture',furniture),layer('Collision',collision),{name:'Placements',type:'objectgroup',objects:[{name:'chair',type:'fixture',x:192,y:96,width:32,height:32}]}]};
  const o=interactionRegistry(map)[0]!,s=o.slots[0]!,from=position(148,106);
  assert.equal(canStand(map,from.x,from.y),true);assert.ok(Math.hypot(from.x-s.anchor.x,from.y-s.anchor.y)<=64);
  assert.ok(s.approaches.some(p=>canStand(map,p.x,p.y)));assert.equal(seatApproach(map,o,s,from),undefined);
  assert.equal(createSeating(map,new Map()).act('wall',from,request(o,s)),'OUT_OF_RANGE');
});
