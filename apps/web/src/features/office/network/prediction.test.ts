import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Reconciler} from '@colyseus/sdk';
import type {InputHandle} from '@colyseus/sdk/input/InputHandle';
import {advanceMovement,canStand,movementRules,type MovingPosition} from '../../../../../../packages/shared/src/movement.ts';
import {composeEnvironment} from '../../../../../../packages/shared/src/environment/compose.ts';
import {defaultEnvironment} from '../../../../../../packages/shared/src/environment/catalog.ts';

type Command={x:number;y:number;run?:boolean;epoch:number};
// Deterministic transport-boundary double for the REAL installed SDK rollback
// controller. Real binary encoding/acks/recovery are tested over WebSockets too.
function channel(){
  const listeners=new Set<(seq:number)=>void>(),history=new Map<number,Command>();
  return{sentCount:0,lastProcessed:0,epoch:0,stepMs:1000/60,stepSeconds:1/60,patchRate:50,replayBufferSize:128,subSteps:1,subStepSeconds:1/60,
    get pendingCount(){return this.sentCount-this.lastProcessed;},
    onSend(fn:(seq:number)=>void){listeners.add(fn);return()=>listeners.delete(fn);},
    at(seq:number){return history.get(seq);},reckonTimeAt(){return 0;},
    send(command:Command){const seq=++this.sentCount;history.set(seq,{...command});for(const listener of listeners)listener(seq);return seq;},
  };
}
const map=composeEnvironment(defaultEnvironment);
function runway(){for(let y=32;y<map.height*32-64;y+=32)for(let x=64;x<map.width*32-220;x+=32)if(Array.from({length:180},(_,n)=>canStand(map,x+n,y)).every(Boolean))return{x,y};throw Error('Missing runway');}
const origin=runway();
const initial=()=>({...origin,direction:'down' as const,isMoving:false,isRunning:false,motionState:'IDLE',seatId:'',movementEpoch:1});

test('installed SDK predicts on send before any authoritative update and replays only unacknowledged input',()=>{
  const input=channel(),truth=initial(),r=new Reconciler(truth,{input:input as unknown as InputHandle<Command>,fields:['x','y','direction','isMoving','isRunning','motionState','seatId','movementEpoch'],step:({dtMs},state,cmd)=>{if(cmd.epoch===state.movementEpoch)advanceMovement(map,state,cmd,dtMs);},smoothMs:40,snap:48,warnOnDivergence:Infinity});
  try{
    r.tick(0);for(let i=0;i<10;i++)input.send({x:1,y:0,epoch:1});
    assert.ok(r.state.x>truth.x+10,'renderable predicted truth advances without a network response');assert.equal(truth.x,origin.x,'decoded authority is never mutated');
    for(let i=0;i<6;i++)advanceMovement(map,truth,{x:1,y:0},1000/60);
    input.lastProcessed=6;r.tick(16);assert.equal(r.pendingCount,4);assert.ok(Math.abs(r.state.x-(origin.x+movementRules.walkSpeed/6))<.001,'exact 6 acknowledged + 4 replayed steps');
    truth.x-=4;input.lastProcessed=7;advanceMovement(map,truth,{x:1,y:0},1000/60);r.tick(32);
    assert.ok(Math.abs(r.state.x-(origin.x+movementRules.walkSpeed/6-4))<.001,'correction restores authority and replays the remaining three steps');assert.ok(Math.abs(r.lastCorrection.x??0)>0);
    r.tick(1000);assert.ok(Math.abs(r.value('x')-r.state.x)<.1,'ordinary correction converges');
  }finally{r.dispose();}
});

test('pose/map lifetime reset discards old replay; seating stays locked; a fresh epoch is required',()=>{
  const input=channel(),truth=initial(),r=new Reconciler(truth,{input:input as unknown as InputHandle<Command>,fields:['x','y','direction','isMoving','isRunning','motionState','seatId','movementEpoch'],step:({dtMs},state,cmd)=>{if(cmd.epoch===state.movementEpoch)advanceMovement(map,state,cmd,dtMs);}});
  try{
    input.send({x:1,y:0,run:true,epoch:1});Object.assign(truth,{x:origin.x+80,movementEpoch:2,seatId:'server-seat',motionState:'SITTING'});r.reset();r.tick(1);
    assert.equal(r.state.x,truth.x);input.send({x:1,y:1,run:true,epoch:1});assert.equal(r.state.x,truth.x,'old-lifetime inputs do not move the new pose');input.send({x:1,y:1,run:true,epoch:2});assert.equal(r.state.x,truth.x,'a valid input cannot walk while seated');
    Object.assign(truth,{seatId:'',movementEpoch:3,motionState:'IDLE'});r.reset();input.send({x:-1,y:0,epoch:3});assert.ok(r.state.x<truth.x,'fresh standing generation resumes');
    const before=r.state.x;input.epoch++;Object.assign(truth,{x:origin.x,movementEpoch:4});r.tick(2);assert.equal(r.state.x,origin.x);assert.notEqual(r.state.x,before,'transport reset restores authority without replay');
  }finally{r.dispose();}
});

test('prediction uses identical normalized run and wall/furniture collision rules at 60Hz',()=>{
  const walk:MovingPosition=initial(),run:MovingPosition=initial(),diagonal:MovingPosition=initial();
  for(let i=0;i<20;i++){advanceMovement(map,walk,{x:1,y:0},1000/60);advanceMovement(map,run,{x:1,y:0,run:true},1000/60);advanceMovement(map,diagonal,{x:1,y:1},1000/60);}
  assert.ok(Math.abs((run.x-origin.x)/(walk.x-origin.x)-1.6)<.001);
  // In an open area, normalization bounds total distance independently of axes.
  assert.ok(Math.hypot(diagonal.x-origin.x,diagonal.y-origin.y)<=movementRules.walkSpeed/3+.001);
  for(let i=0;i<1000;i++)advanceMovement(map,run,{x:1,y:0,run:true},1000/60);assert.ok(canStand(map,run.x,run.y));assert.ok(run.x<map.width*32-8,'cannot cross an authoritative solid boundary');
});
