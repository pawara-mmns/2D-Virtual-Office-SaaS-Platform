import {Predict,type Reconciler,type Room} from '@colyseus/sdk';
import type {InputHandle} from '@colyseus/sdk/input/InputHandle';
import {advanceMovement,canStand} from '../../../../../../packages/shared/src/movement.ts';
import type {OfficeMap} from '../../../../../../packages/shared/src/map.ts';
import type {OfficeSnapshot,PlayerSnapshot,MovementDiagnostics} from '../../../../../../packages/shared/src/protocol.ts';

type Command={x:number;y:number;run:boolean;epoch:number;revision:number};
type Intent={x:number;y:number;run:boolean};
// Only presentation is predicted. The decoded Schema, interaction requests,
// proximity membership and all collision/permission authority remain untouched.
export class OfficePrediction{
  readonly input:InputHandle<Command>;
  private predict:ReturnType<typeof Predict.get>;
  private local?:Reconciler<PlayerSnapshot,Command>;
  private own?:PlayerSnapshot;
  private map?:OfficeMap;
  private key='';
  private remotes=new Map<string,{source:PlayerSnapshot;epoch:number|undefined;detach():void}>();
  private lastAck=0;
  private ackAt=performance.now();
  private lastFrame=0;
  private blockedUntil=0;
  private diagnostics:MovementDiagnostics={rttMs:0,jitterMs:0,pendingInputs:0,correctionPx:0,serverMovementMs:null,prediction:true};
  private room:Room<object,OfficeSnapshot>;
  constructor(room:Room<object,OfficeSnapshot>){
    this.room=room;
    this.input=room.input<Command>({mode:'reliable'});
    // A single 50ms remote buffer replaces the old extra exponential lerp.
    // Local rollback is independent and runs at the server-advertised 60Hz.
    // The app's OfficeSnapshot interface intentionally hides Schema internals;
    // native input reflection guarantees this is the SDK-decoded Schema room.
    this.predict=Predict.get(room as unknown as Parameters<typeof Predict.get>[0],{mode:'lerp',delay:50,tickInterval:50,snap:64,smoothMs:0});
  }
  holdInteraction(){this.blockedUntil=performance.now()+750;}
  releaseInteraction(){this.blockedUntil=0;}
  metrics(){return {...this.diagnostics};}
  frame(map:OfficeMap,intent:Intent,now:number,snapshot:OfficeSnapshot,sessionId:string):Map<string,PlayerSnapshot>{
    const own=snapshot.players.get(sessionId),result=new Map<string,PlayerSnapshot>();if(!own)return result;
    this.map=map;
    const key=`${this.input.epoch}/${own.movementEpoch}/${snapshot.environmentEpoch??''}/${snapshot.environmentRevision??0}/${snapshot.mapVersion}`;
    if(this.own!==own||key!==this.key){
      this.local?.dispose();this.key=key;this.own=own;this.blockedUntil=0;this.ackAt=now;this.lastAck=this.input.lastProcessed;
      this.local=this.predict.reconciler(own,{input:this.input,
        fields:['x','y','direction','isMoving','isRunning','motionState','seatId','movementEpoch'],smoothMs:40,snap:48,
        // Enable SDK correction bookkeeping in development without console spam.
        warnOnDivergence:process.env.NODE_ENV==='production'?undefined:Infinity,
        step:(ctx,state,command)=>{
          if(command.epoch!==state.movementEpoch||command.revision!==(snapshot.environmentRevision??0))return;
          advanceMovement(this.map!,state,command,ctx.dtMs);
        },
      });
      // Existing in-flight inputs belong to the previous pose/map lifetime.
      this.local.reset();
    }
    if(this.input.lastProcessed!==this.lastAck){this.lastAck=this.input.lastProcessed;this.ackAt=now;}
    const discontinuity=now-this.lastFrame>250&&this.lastFrame>0;
    if(discontinuity)this.local!.reset();this.lastFrame=now;
    const steps=this.predict.tick(now),stalled=now-this.ackAt>750;
    const held=stalled||discontinuity||now<this.blockedUntil||!own.connected||!!own.seatId||own.motionState==='STANDING';
    for(let i=0;i<Math.min(steps,4);i++){
      // Never manufacture a position, speed, elapsed time or ack on the wire.
      Object.assign(this.input.data,{x:held?0:intent.x,y:held?0:intent.y,run:!held&&intent.run,epoch:own.movementEpoch??0,revision:snapshot.environmentRevision??0});
      if(this.input.pendingCount<90)this.input.send();
    }
    if(stalled)this.local!.reset();
    // Appearance is authoritative metadata, outside the movement rollback state.
    const local=this.local!,pose={...own,...local.state,avatarKey:own.avatarKey,displayName:own.displayName,appearance:own.appearance,x:local.value('x'),y:local.value('y')};
    // Corrections must not visually ease THROUGH a newly moved wall/furniture.
    // A seat's authored footprint is intentionally solid and uses raw authority.
    if(own.seatId||held&&own.motionState==='STANDING'){Object.assign(pose,own);}
    else if(!canStand(map,pose.x,pose.y)){pose.x=local.state.x;pose.y=local.state.y;if(!canStand(map,pose.x,pose.y))Object.assign(pose,own);}
    result.set(sessionId,pose);
    for(const [id,player]of snapshot.players){
      if(id===sessionId)continue;
      let tracked=this.remotes.get(id);
      if(!tracked||tracked.source!==player||tracked.epoch!==player.movementEpoch){tracked?.detach();tracked={source:player,epoch:player.movementEpoch,detach:this.predict.attach(player,{fields:['x','y'],mode:'lerp',snap:64,smoothMs:0})};this.remotes.set(id,tracked);}
      result.set(id,player.seatId?player:{...player,x:this.predict.value(player,'x'),y:this.predict.value(player,'y')});
    }
    for(const [id,tracked]of this.remotes)if(!snapshot.players.has(id)){tracked.detach();this.remotes.delete(id);}
    if(process.env.NODE_ENV!=='production')this.diagnostics={...this.diagnostics,rttMs:this.room.clock.smoothedRtt(),jitterMs:this.room.clock.jitter(),pendingInputs:this.input.pendingCount,correctionPx:Math.hypot(local.lastCorrection.x??0,local.lastCorrection.y??0)};
    return result;
  }
  dispose(){this.local?.dispose();for(const r of this.remotes.values())r.detach();this.remotes.clear();this.predict.dispose();}
}
