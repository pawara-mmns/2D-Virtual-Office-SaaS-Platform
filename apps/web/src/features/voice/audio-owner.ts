import { TrackEvent, type LocalAudioTrack } from 'livekit-client';
import { createVoiceMount } from './lifecycle.ts';
import { VoiceFailure, captureFailure, voiceDiagnostic } from './diagnostics.ts';

export type MicrophonePhase='off'|'pending'|'muted'|'paused'|'active'|'denied'|'failed';
export type MicrophoneState={desired:'off'|'muted'|'on';muted:boolean;permission:'unknown'|'pending'|'granted'|'denied';phase:MicrophonePhase;captured:boolean;published:boolean};
export type AudioPublicationPort={publish(track:LocalAudioTrack):Promise<unknown>;unpublish(track:LocalAudioTrack):Promise<unknown>};
export const initialMicrophoneState:MicrophoneState={desired:'off',muted:false,permission:'unknown',phase:'off',captured:false,published:false};

// One desired state, one capture, one serialized publication binding. Room
// attachment is receive-only until an explicit user action requests capture.
export function createAudioOwner(factory:()=>Promise<LocalAudioTrack>,initialMuted=false,onEnded=()=>{}) {
  let track:LocalAudioTrack|undefined,pending:Promise<LocalAudioTrack>|undefined;
  let generation=0,lease=0,bindingEpoch=0,muted=initialMuted,wanted=false,permission:MicrophoneState['permission']='unknown';
  let failure:'denied'|'failed'|undefined,port:AudioPublicationPort|undefined,published:LocalAudioTrack|undefined,transportReady=false;
  let queue=Promise.resolve(),state:MicrophoneState={...initialMicrophoneState,muted};
  const listeners=new Set<()=>void>();
  const persist=()=>{try{localStorage.setItem('virtual-office:microphone-muted',String(muted));}catch{/* Optional storage. */}};
  const notify=()=>{
    const captured=!!track&&track.mediaStreamTrack.readyState!=='ended';
    const attached=!!published&&published===track&&!!port;
    const phase:MicrophonePhase=failure??(pending?'pending':!wanted||!captured?'off':muted?'muted':attached&&transportReady&&track!.mediaStreamTrack.enabled&&!track!.isMuted?'active':'paused');
    const next:MicrophoneState={desired:wanted?(muted?'muted':'on'):'off',muted,permission,phase,captured,published:attached};
    if(JSON.stringify(next)!==JSON.stringify(state)){state=next;voiceDiagnostic('microphone','reconciled',{desired:next.desired,rawEnabled:track?.mediaStreamTrack.enabled,sdkMuted:track?.isMuted,published:attached});listeners.forEach(callback=>callback());}
  };
  const disableRaw=()=>{if(track)track.mediaStreamTrack.enabled=false;};
  const reconcile=async()=>{
    const binding=port,active=track,current=generation;
    if(!binding){notify();return;}
    if(published&&(!wanted||published!==active)){
      const old=published;published=undefined;await binding.unpublish(old);
    }
    if(!transportReady){disableRaw();notify();return;}
    if(!wanted||!active||active.mediaStreamTrack.readyState==='ended'){notify();return;}
    if(published!==active){
      active.mediaStreamTrack.enabled=false;await active.mute();
      if(binding!==port||active!==track||current!==generation||!wanted)return;
      await binding.publish(active);
      voiceDiagnostic('publication','ready',{sdkMuted:active.isMuted,rawEnabled:active.mediaStreamTrack.enabled,published:true});
      if(binding!==port||active!==track||current!==generation||!wanted){active.mediaStreamTrack.enabled=false;await binding.unpublish(active);return;}
      published=active;
    }
    await (muted?active.mute():active.unmute());
    // LiveKit unmute() is idempotent and may not touch a raw disabled track.
    // Reconcile the physical bit as well as SDK mute/publication state.
    active.mediaStreamTrack.enabled=binding===port&&transportReady&&active===track&&current===generation&&wanted&&!muted&&!active.isMuted;
    if(muted&&active.isMuted===false)await active.mute();
    notify();
  };
  const schedule=()=>{
    const operation=queue.then(reconcile);
    const guarded=operation.catch(()=>{failure='failed';disableRaw();notify();voiceDiagnostic('publication','failed');throw new VoiceFailure('publication','failed','Microphone publication failed. Release the microphone and retry.');});
    queue=guarded.catch(()=>{});
    return guarded;
  };
  const owner={
    mount:createVoiceMount(),
    onEnded(callback:()=>void){onEnded=callback;},
    subscribe(callback:()=>void){listeners.add(callback);return()=>{listeners.delete(callback);};},
    snapshot:()=>state,
    get muted(){return muted;},get granted(){return !!track&&track.mediaStreamTrack.readyState!=='ended';},
    capture():Promise<LocalAudioTrack>{
      wanted=true;failure=undefined;
      if(track&&track.mediaStreamTrack.readyState!=='ended'){notify();return Promise.resolve(track);}
      if(pending)return pending;
      const current=generation;permission='pending';voiceDiagnostic('capture','started');
      const operation=factory().then(async created=>{
        created.mediaStreamTrack.enabled=false;
        try{
          await created.mute();
          if(current!==generation||!wanted){voiceDiagnostic('capture','cancelled');throw new VoiceFailure('capture','cancelled','Microphone request cancelled.');}
          track=created;permission='granted';
          created.once(TrackEvent.Ended,()=>{if(track===created){owner.stop();failure='failed';notify();onEnded();}});
          return created;
        }catch(error){created.stop();throw error;}
      }).catch(error=>{
        const detail=captureFailure(error);
        if(current===generation){wanted=false;failure=detail.category==='denied'?'denied':'failed';permission=failure==='denied'?'denied':'unknown';}
        throw detail;
      });
      pending=operation;notify();
      void operation.finally(()=>{if(pending===operation){pending=undefined;notify();}}).catch(()=>{});
      return operation;
    },
    async enable(unmute=false){if(unmute){muted=false;persist();}await owner.capture();await schedule();notify();},
    pause(){lease++;bindingEpoch=0;port=undefined;published=undefined;transportReady=false;disableRaw();voiceDiagnostic('cleanup','retired');notify();},
    async publish(expected=lease){
      if(expected!==lease)throw Error('Media generation retired');
      const current=generation,active=await owner.capture();
      if(current!==generation||expected!==lease)throw Error('Voice consent ended');
      await (muted?active.mute():active.unmute());
      active.mediaStreamTrack.enabled=wanted&&!muted&&current===generation&&expected===lease&&!active.isMuted;
      if(expected!==lease)throw Error('Media generation retired');return active;
    },
    scope(){
      const current=++lease;
      let attached:AudioPublicationPort|undefined;
      return{
        async capture(){if(current!==lease)throw Error('Media generation retired');const active=await owner.capture();if(current!==lease)throw Error('Media generation retired');return active;},
        publish:()=>owner.publish(current),
        async attach(binding:AudioPublicationPort){if(current!==lease)throw Error('Media generation retired');attached=binding;bindingEpoch=current;port=binding;published=undefined;transportReady=true;await schedule();},
        connected(ready:boolean){if(attached&&port===attached&&bindingEpoch===current){transportReady=ready;if(!ready)disableRaw();notify();if(ready)void schedule().catch(()=>{});}},
        pause(){if(attached?port===attached&&bindingEpoch===current:current===lease)owner.pause();},
      };
    },
    async setMuted(value:boolean){
      muted=value;failure=undefined;persist();if(value)disableRaw();notify();
      if(port)await schedule();
      else if(track){await (muted?track.mute():track.unmute());track.mediaStreamTrack.enabled=false;}
      notify();
    },
    stop(){generation++;lease++;wanted=false;failure=undefined;if(permission==='pending')permission='unknown';const old=track;track=undefined;pending=undefined;old?.stop();notify();void schedule().catch(()=>{});},
  };
  return owner;
}
export type AudioOwner=ReturnType<typeof createAudioOwner>;
export function storedMicrophoneMuted(){try{return localStorage.getItem('virtual-office:microphone-muted')==='true';}catch{return false;}}
