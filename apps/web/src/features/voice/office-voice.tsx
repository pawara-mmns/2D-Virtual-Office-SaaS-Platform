"use client";
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { HudIcon } from '@/components/hud-icon';
import { createAudioOwner, initialMicrophoneState, storedMicrophoneMuted, type AudioOwner } from './audio-owner';
import { createBubbleSounds } from './bubble-sounds';
import { voiceError } from './lifecycle';
import { VoiceBar } from './voice-bar';
import { VoicePopover } from './voice-popover';
import { VoiceFailure, authorizationFailure, voiceDiagnostic } from './diagnostics';
import type { VoiceAdmission, VoiceZoneState } from '../../../../../packages/shared/src/voice.ts';
import type { ProximityState, VoiceBubble } from '../../../../../packages/shared/src/proximity.ts';
const VoiceSession=dynamic(()=>import('./voice-session'),{ssr:false,loading:()=> <p className="sr-only" role="status">Preparing audio.</p>});

function ConversationMedia({officeId,state,owner,failed,ready,options}:{officeId:string;state:VoiceZoneState;owner:AudioOwner;failed(message:string):void;ready():void;options:ReactNode}) {
  const [admission,setAdmission]=useState<VoiceAdmission|null>(null);
  const callbacks=useRef({failed,ready}),confirmed=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const target=JSON.stringify({officeId,sessionId:state.sessionId,...state.bubble});
  useEffect(()=>{callbacks.current={failed,ready};},[failed,ready]);
  useEffect(()=>{
    let active=true;const controller=new AbortController();
    queueMicrotask(()=>{if(!active)return;void(async()=>{
      try{const reference=JSON.parse(target);voiceDiagnostic('generation','started',{generation:reference.generation,revision:reference.revision});voiceDiagnostic('authorization','started');const response=await fetch('/api/v1/voice/token',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:target,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10_000)])});const data=await response.json();if(!active)return;if(!response.ok)throw authorizationFailure(response.status);if(typeof data.token!=='string'||typeof data.url!=='string')throw authorizationFailure(503);voiceDiagnostic('authorization','ready');setAdmission({token:data.token,url:data.url});}
      catch(error){if(active)callbacks.current.failed(error instanceof VoiceFailure?error.message:'Voice server unavailable. Check the connection and retry audio in settings.');}
    })();});
    return()=>{active=false;controller.abort();clearTimeout(timer.current);owner.pause();};
  },[target,owner]);
  const connected=useCallback(()=>{confirmed.current=true;ready();},[ready]);
  const failure=useCallback((message:string)=>{owner.pause();if(confirmed.current){clearTimeout(timer.current);timer.current=setTimeout(()=>failed(message),1500);}else failed(message);},[owner,failed]);
  const leave=useCallback(()=>failed('Audio session ended. Retry audio in settings.'),[failed]);
  return admission?<VoiceSession admission={admission} owner={owner} leave={leave} failed={failure} ready={connected} conversation options={options}/>:<p className="sr-only" role="status">Authorizing receive-only audio. Microphone stays under your control.</p>;
}

export function OfficeVoice({officeId,state,proximity,online,lock,leave,error,denied=false}:{officeId:string;state:VoiceZoneState|null;proximity:ProximityState|null;online:boolean;lock(bubble:VoiceBubble,locked:boolean):boolean;leave():void;error?:string;denied?:boolean}) {
  const [owner]=useState(()=>createAudioOwner(async()=>{if(process.env.NODE_ENV==='development'&&navigator.permissions)void navigator.permissions.query({name:'microphone' as PermissionName}).then(result=>voiceDiagnostic('permission','ready',{permission:result.state})).catch(()=>voiceDiagnostic('permission','unknown',{permission:'unknown'}));const {createLocalAudioTrack}=await import('livekit-client');return createLocalAudioTrack({echoCancellation:true,noiseSuppression:true,autoGainControl:true});},storedMicrophoneMuted()));
  const mic=useSyncExternalStore(owner.subscribe,owner.snapshot,()=>initialMicrophoneState);
  const [sounds]=useState(createBubbleSounds),[soundMuted,setSoundMuted]=useState(sounds.muted),[volume,setVolume]=useState(sounds.volume);
  const [notice,setNotice]=useState(''),[failedTarget,setFailedTarget]=useState('');
  const confirmed=useRef(new Map<string,{revision:number;locked:boolean;count:number}>()),previous=useRef<string|undefined>(undefined);
  const own=proximity?.bubbles.find(b=>b.memberIds.includes(proximity.sessionId)&&b.lifecycleState!=='DISSOLVED');
  const target=state?.bubble?`${state.bubble.bubbleId}:${state.bubble.generation}:${state.bubble.revision}`:'';
  const meeting=state?.zone==='Meeting Room';
  useEffect(()=>{owner.onEnded(()=>setNotice('Microphone disconnected. Listening and visual membership are preserved; enable the microphone again when ready.'));},[owner]);
  useEffect(()=>()=>{owner.stop();sounds.close();},[owner,sounds]);
  useEffect(()=>{if(!online||meeting)owner.stop();},[online,meeting,owner]);
  useEffect(()=>{
    const last=previous.current;
    if(last&&last!==own?.bubbleId){const before=confirmed.current.get(last);if(before)sounds.play('ended',last+':ended:'+before.revision);confirmed.current.delete(last);}
    previous.current=own?.bubbleId;
  },[own,sounds]);
  const ready=useCallback(()=>{
    if(!own)return;const before=confirmed.current.get(own.bubbleId);
    if(!before)sounds.play('connected',own.bubbleId+':connected:'+own.generation);
    if(before&&before.locked!==own.locked)sounds.play(own.locked?'locked':'unlocked',own.bubbleId+':privacy:'+own.revision);
    if(before&&before.count>own.memberIds.length)sounds.play('ended',own.bubbleId+':departure:'+own.revision);
    confirmed.current.set(own.bubbleId,{revision:own.revision,locked:own.locked,count:own.memberIds.length});
  },[own,sounds]);
  const failed=useCallback((message:string)=>{owner.stop();leave();setFailedTarget(target);setNotice(message);},[owner,leave,target]);
  const requestMicrophone=async(unmute=false)=>{setNotice('');void sounds.unlock();try{await owner.enable(unmute);}catch(failure){if(failure instanceof VoiceFailure&&failure.category==='cancelled')return;setNotice(failure instanceof VoiceFailure?failure.message:voiceError(failure));}};
  const changeMute=async(value:boolean)=>{
    setNotice('');void sounds.unlock();
    try{if(!value&&!mic.captured)await owner.enable(true);else await owner.setMuted(value);}catch(failure){if(failure instanceof VoiceFailure&&failure.category==='cancelled')return;setNotice(failure instanceof VoiceFailure?failure.message:voiceError(failure));}
  };
  const toggleMicrophone=()=>{
    if(mic.phase==='pending'){owner.stop();return;}
    if(mic.phase==='failed'||mic.phase==='denied'){void requestMicrophone();return;}
    if(mic.desired==='on'){void changeMute(true);return;}
    if(mic.captured){void changeMute(false);return;}
    void requestMicrophone();
  };
  if(meeting&&state)return <VoiceBar officeId={officeId} state={state} leave={leave} owner={owner}/>;
  const controller=own?.controllerId===proximity?.sessionId,retiring=own?.lifecycleState==='DISCONNECTING'||own?.lifecycleState==='FORMING';
  const micAction=mic.phase==='pending'?'Cancel microphone':mic.phase==='failed'||mic.phase==='denied'?'Retry microphone':mic.desired==='on'?'Mute microphone':mic.captured?'Unmute microphone':'Enable microphone';
  const status=!online?denied?'Voice authorization ended':'Voice offline':own?`${own.locked?'Private':'Open'} conversation · ${own.memberIds.length} people`:'Waiting for nearby teammates';
  const media=online&&state?.zone==='Proximity conversation'&&state.configured&&proximity?.audioAllowed&&!!target&&target!==failedTarget;
  const options=<div className="voice-sound-options">
    <p className="voice-help" role="status">{status}. Microphone: {mic.phase}. Listening does not require microphone capture.</p>
    <label className="voice-sound-mute"><input type="checkbox" aria-label="Mute microphone" checked={mic.desired!=='on'} onChange={event=>{void changeMute(event.target.checked);}} disabled={!online||!proximity?.configured}/> Mute microphone</label>
    {mic.captured&&<button className="office-control" onClick={()=>owner.stop()}>Release microphone</button>}
    {own&&<button className="office-control" disabled={!controller||retiring} aria-label={own.locked?'Unlock conversation':'Lock conversation'} title={controller?'Change conversation privacy':'Only the controller can change privacy'} onClick={()=>lock(own,!own.locked)}><HudIcon name={own.locked?'lock':'unlock'}/><span>{own.locked?'Unlock conversation':'Lock conversation'}</span></button>}
    {failedTarget===target&&!!target&&<button className="office-control" onClick={()=>{setFailedTarget('');setNotice('');}}>Retry audio</button>}
    <label className="voice-sound-mute"><input type="checkbox" aria-label="Mute conversation sounds" checked={soundMuted} onChange={event=>{setSoundMuted(event.target.checked);sounds.configure({muted:event.target.checked,volume});void sounds.unlock();}}/> Mute conversation sounds</label>
    <label className="voice-sound-volume"><span>Sound effects volume <output>{Math.round(volume*250)}%</output></span><input aria-label="Conversation sound volume" type="range" min="0" max="0.4" step="0.02" value={volume} onChange={event=>{const next=Number(event.target.value);setVolume(next);sounds.configure({muted:soundMuted,volume:next});void sounds.unlock();}}/></label>
    <p className="voice-help">Microphone permission always requires your action. Sounds and playback follow browser activation preferences.</p>
  </div>;
  return <section aria-label="Office voice" className="office-voice proximity-voice proximity-voice-minimal">
    <div className="proximity-context">
      <p className="sr-only" role="status">{status}. Microphone {mic.phase}.</p>
      <button type="button" className="office-control proximity-mic-toggle" data-mic-state={mic.phase} data-error={!!notice||mic.phase==='denied'||mic.phase==='failed'} aria-label={micAction} aria-pressed={mic.desired==='on'} title={`${micAction}. Microphone ${mic.phase}. ${status}.`} disabled={mic.desired==='off'&&mic.phase!=='pending'&&(!online||!proximity?.configured)} onClick={toggleMicrophone}><HudIcon name={mic.desired==='on'?'microphone':'muted'}/></button>
    </div>
    {media&&state?<ConversationMedia key={target} officeId={officeId} state={state} owner={owner} failed={failed} ready={ready} options={options}/>:<VoicePopover label="Voice settings">{options}</VoicePopover>}
    {(notice||error)&&<p role="alert" className="ui-notice ui-notice-error">{notice||error}</p>}
  </section>;
}
