"use client";
import { HudIcon } from "@/components/hud-icon";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Room, RoomEvent, Track, createLocalAudioTrack, supportsAudioOutputSelection, setLogLevel, LogLevel, type LocalAudioTrack, type Participant } from "livekit-client";
import { RoomContext, RoomAudioRenderer, StartAudio, TrackToggle, useConnectionState, useParticipants, useMediaDeviceSelect, useIsSpeaking, useParticipantInfo, useLocalParticipant, useStartAudio } from "@livekit/components-react";
import type { VoiceAdmission } from "../../../../../packages/shared/src/voice.ts";
import { avatarBaseFrame, safeAvatarKey, avatarDisplayName } from "../avatars/presets";
import { createVoiceMount, startVoice, voiceError, type VoiceStage } from "./lifecycle";
import { voiceDisconnect } from "./disconnect";
import type { AudioOwner } from "./audio-owner";
import { VoicePopover } from './voice-popover';

function ProximityPlayback() {
  const { mergedProps } = useStartAudio({ props: { className:'office-control', title:'Enable audio playback', 'aria-label':'Enable audio playback' } });
  return <button {...mergedProps}><HudIcon name="audio"/></button>;
}

function Devices({ kind, error }: { kind: "audioinput" | "audiooutput"; error(message: string): void }) {
  const onError = useCallback(() => error("Device selection failed. Check browser permissions and reconnect the device."),[error]);
  const { devices,activeDeviceId,setActiveMediaDevice } = useMediaDeviceSelect({ kind,requestPermissions: false,onError });
  return <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">{kind === "audioinput" ? "Microphone" : "Speaker"}<select className="office-control max-w-64" aria-label={kind === "audioinput" ? "Microphone input device" : "Audio output device"} value={activeDeviceId} onChange={(event) => { void setActiveMediaDevice(event.target.value).catch(() => error("Device selection failed. Check the connected device and retry.")); }}>
    {!devices.length && <option value="">System default</option>}{devices.map((device,index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Device ${index+1}`}</option>)}
  </select></label>;
}
function VoicePerson({ person, reconnecting }: { person: Participant; reconnecting: boolean }) {
  const { name,metadata } = useParticipantInfo({ participant: person });
  const speaking = useIsSpeaking(person);
  let key = safeAvatarKey(null);
  try { key = safeAvatarKey(JSON.parse(metadata || "{}").avatarKey); } catch { /* Existing safe preset. */ }
  const publication = person.getTrackPublication(Track.Source.Microphone);
  const displayName = avatarDisplayName(name);
  return <li className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="pixel-art shrink-0" style={{ width:32,height:32,backgroundImage:"url('/office/avatar.png')",backgroundPosition:`0 -${Math.floor(avatarBaseFrame(key)/3)*32}px` }} />
    <div className="min-w-0"><p className="truncate text-xs font-medium">{displayName}{person.isLocal ? " (you)" : ""}</p><p className="text-xs text-muted">{reconnecting ? "Reconnecting" : "Connected"} · {publication && !publication.isMuted ? "Mic on" : "Mic muted"}{speaking ? " · Speaking" : ""}</p></div>
  </li>;
}
export function Controls({ leave, error, owner, conversation=false, options }: { leave(): void; error(message: string): void; owner?: AudioOwner; conversation?:boolean; options?:ReactNode }) {
  const connection = useConnectionState();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const onDeviceError = useCallback((failure: Error) => error(voiceError(failure)),[error]);
  const people = useParticipants({ updateOnlyOn:[RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.TrackPublished,RoomEvent.TrackUnpublished,RoomEvent.ParticipantMetadataChanged] });
  return <>
    <div className="voice-session-controls" data-conversation={conversation}>
      <div className="voice-session-summary" title={connection === "connected" ? "Voice connected" : connection === "disconnected" ? "Voice disconnected" : "Voice connecting or reconnecting"}>
      <span role="status" data-connection={connection} className="voice-connection-label">{conversation ? <><span className="sr-only">Voice </span>{connection==='connected'?'Connected':connection==='disconnected'?'Disconnected':'Reconnecting'}</> : connection === "connected" ? "Voice connected" : connection === "disconnected" ? "Voice disconnected" : connection === "reconnecting" || connection === "signalReconnecting" ? "Voice reconnecting…" : "Voice connecting…"}</span>
      <span className="text-xs text-muted">{isMicrophoneEnabled ? "Mic on" : "Mic muted"}</span>
      </div>
      <div className="voice-session-actions">
      {/* This SDK version replaces the button's disabled prop with its own
          pending state. A native fieldset also enforces connection readiness. */}
      {!conversation&&<fieldset disabled={connection !== "connected"} className="m-0 min-w-0 border-0 p-0"><legend className="sr-only">Microphone control</legend>{owner?<button className="office-control voice-mic-control" data-muted={!isMicrophoneEnabled} aria-label={isMicrophoneEnabled?'Mute microphone':'Unmute microphone'} title={isMicrophoneEnabled?'Mute microphone':'Unmute microphone'} onClick={()=>{void owner.setMuted(isMicrophoneEnabled).catch(()=>error('Microphone change failed. Leave and enable voice again.'));}}><HudIcon name={isMicrophoneEnabled?'microphone':'muted'}/><span className="sr-only">{isMicrophoneEnabled?'Mute microphone':'Unmute microphone'}</span></button>:<TrackToggle source={Track.Source.Microphone} showIcon={false} className="office-control" title={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"} aria-label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"} onDeviceError={onDeviceError}><HudIcon name={isMicrophoneEnabled ? "microphone" : "muted"} /><span className="sr-only">{isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}</span></TrackToggle>}</fieldset>}
      {!conversation&&<button className="office-control" aria-label="Leave Voice" title="Leave Voice" onClick={leave}><HudIcon name="exit" /><span className="sr-only">Leave Voice</span></button>}
      {conversation ? <ProximityPlayback/> : <StartAudio className="office-control" label="Enable audio playback" />}
      </div>
    </div>
    <VoicePopover label={conversation?'Voice settings':'Voice participants and audio devices'} icon={conversation?'settings':'audio'} className="voice-details">
      {options}
      <h3 className="voice-section-label">Participants · {people.length}</h3>
      <ul className="voice-people">{people.map((person) => <VoicePerson key={person.identity} person={person} reconnecting={connection !== "connected"} />)}</ul>
      <div className="flex flex-wrap gap-3"><Devices kind="audioinput" error={error} />{supportsAudioOutputSelection() ? <Devices kind="audiooutput" error={error} /> : <p className="text-xs text-muted">Output device selection is managed by this browser or operating system.</p>}</div>
    </VoicePopover>
  </>;
}
export default function VoiceSession({ admission,leave,failed,owner,ready,conversation=false,options }: { admission: VoiceAdmission; leave(): void; failed(message: string): void;owner?:AudioOwner;ready?():void;conversation?:boolean;options?:ReactNode }) {
  const [room] = useState(() => new Room({ disconnectOnPageLeave:true,stopLocalTrackOnUnpublish:!owner }));
  const [mount] = useState(()=>owner?.mount??createVoiceMount());
  const [connected,setConnected] = useState(false), [notice,setNotice] = useState("");
  const [stage,setStage] = useState<VoiceStage>("microphone");
  const { url,token } = admission;
  const callbacks = useRef({ leave,failed,ready });
  useEffect(() => { callbacks.current = { leave,failed,ready }; },[leave,failed,ready]);
  useEffect(() => {
    // SDK error objects can include signaling details. Use fixed UI categories.
    setLogLevel(LogLevel.silent);
    let active = true, established = false;
    const began = performance.now();
    let participantId: string | undefined;
    let captured: LocalAudioTrack | undefined;
    const onTrackEnded=()=>{if(active)setNotice('Microphone disconnected. Select another input, or leave and rejoin.');};
    const diagnostic = (event: string, detail: { reason?: string; state?: string } = {}) => {
      console.info("Voice lifecycle.",{ event,at:new Date().toISOString(),elapsedMs:Math.round(performance.now()-began),participantId,...detail });
    };
    // Initial connection failure is reported by the rejected connect promise with
    // its exact stage/reason; don't overwrite it with a generic disconnect notice.
    const onDisconnect = (reason?: number) => {
      if (!active) return;
      const detail = voiceDisconnect(reason);
      diagnostic("disconnected",{ reason:detail.reason });
      if (established) callbacks.current.failed(detail.message);
    };
    const onConnectionState = (state: string) => {
      if (active && ["connected","connecting","disconnected","reconnecting","signalReconnecting"].includes(state)) diagnostic("connection_state",{state});
    };
    const onDevicesError = (error: Error) => { if (active) setNotice(voiceError(error)); };
    const onSubscriptionError = () => { if (active) { setNotice("Remote audio subscription failed. Check the connection and retry voice."); console.warn("Voice connection failed.",{stage:"remote_audio_subscription",category:"subscription"}); } };
    room.on(RoomEvent.Disconnected,onDisconnect); room.on(RoomEvent.MediaDevicesError,onDevicesError);
    room.on(RoomEvent.TrackSubscriptionFailed,onSubscriptionError);
    room.on(RoomEvent.ConnectionStateChanged,onConnectionState);
    const mounting = mount(() => {const scope=owner?.scope();return startVoice({
      async capture() {
        if(scope){if(!conversation)await scope.capture();return {stop:()=>scope.pause()};}
        const track = await createLocalAudioTrack({ echoCancellation:true,noiseSuppression:true,autoGainControl:true });
        captured=track;track.mediaStreamTrack.addEventListener('ended',onTrackEnded,{once:true});
        return track;
      },
      async connect(signalConnected) {
        room.on(RoomEvent.SignalConnected,signalConnected);
        try { await room.connect(url,token,{ autoSubscribe:true,websocketTimeout:8000,peerConnectionTimeout:8000 }); }
        finally { room.off(RoomEvent.SignalConnected,signalConnected); }
      },
      async publish(track) {
        if(scope){await scope.attach({async publish(active){return room.localParticipant.publishTrack(active,{source:Track.Source.Microphone});},async unpublish(active){return room.localParticipant.unpublishTrack(active,false);}});}
        else await room.localParticipant.publishTrack(track as LocalAudioTrack,{ source:Track.Source.Microphone });
      },
      disconnect: () => room.disconnect(!owner),
    },() => {
      established = true;
      // The server mints a random UUID identity, unrelated to a user's ID/email.
      const identity = room.localParticipant.identity;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identity)) participantId = identity;
      if (active) { diagnostic("connected"); setConnected(true);callbacks.current.ready?.(); }
    },(message) => { if (active) callbacks.current.failed(message); },{onStage(next) { if (active) { setStage(next); console.info("Voice connection stage.",{stage:next,at:new Date().toISOString()}); } }});});
    return () => { diagnostic("client_cleanup"); active = false; captured?.mediaStreamTrack.removeEventListener('ended',onTrackEnded);room.off(RoomEvent.Disconnected,onDisconnect); room.off(RoomEvent.MediaDevicesError,onDevicesError); room.off(RoomEvent.TrackSubscriptionFailed,onSubscriptionError); room.off(RoomEvent.ConnectionStateChanged,onConnectionState); void mounting.dispose(); };
  },[room,url,token,mount,owner,conversation]);
  return <RoomContext.Provider value={room}>
    <RoomAudioRenderer />
    {connected ? <Controls leave={leave} error={setNotice} owner={owner} conversation={conversation} options={options} /> : conversation ? <p role="status" className="sr-only">{stage === 'microphone' ? 'Waiting for microphone permission.' : 'Connecting proximity voice automatically.'}</p> : <div className="mt-3 flex flex-wrap items-center gap-3"><p role="status" className="text-xs">{stage === "microphone" ? "Waiting for microphone permission…" : stage === "signaling" ? "Connecting to the voice service…" : stage === "media" ? "Establishing the audio connection…" : "Starting your microphone…"}</p><button className="office-control" onClick={leave}>Cancel voice</button></div>}
    {notice && <p role="alert" className="ui-notice ui-notice-error mt-2">{notice}</p>}
  </RoomContext.Provider>;
}
