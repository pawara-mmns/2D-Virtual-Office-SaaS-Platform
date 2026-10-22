"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, createLocalAudioTrack, supportsAudioOutputSelection, setLogLevel, LogLevel, type LocalAudioTrack, type Participant } from "livekit-client";
import { RoomContext, RoomAudioRenderer, StartAudio, TrackToggle, useConnectionState, useParticipants, useMediaDeviceSelect, useIsSpeaking, useParticipantInfo, useLocalParticipant } from "@livekit/components-react";
import type { VoiceAdmission } from "../../../../../packages/shared/src/voice.ts";
import { avatarBaseFrame, safeAvatarKey, avatarDisplayName } from "../avatars/presets";
import { createVoiceMount, startVoice, voiceError, type VoiceStage } from "./lifecycle";

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
    <div className="min-w-0"><p className="truncate text-xs font-medium">{displayName === "You" ? "Member" : displayName}{person.isLocal ? " (you)" : ""}</p><p className="text-xs text-muted">{reconnecting ? "Reconnecting" : "Connected"} · {publication && !publication.isMuted ? "Mic on" : "Mic muted"}{speaking ? " · Speaking" : ""}</p></div>
  </li>;
}
export function Controls({ leave, error }: { leave(): void; error(message: string): void }) {
  const connection = useConnectionState();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const onDeviceError = useCallback((failure: Error) => error(voiceError(failure)),[error]);
  const people = useParticipants({ updateOnlyOn:[RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.TrackPublished,RoomEvent.TrackUnpublished,RoomEvent.ParticipantMetadataChanged] });
  return <>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span role="status" className="mr-2 text-xs">{connection === "connected" ? "Voice connected" : connection === "reconnecting" || connection === "signalReconnecting" ? "Voice reconnecting…" : "Voice connecting…"}</span>
      <span className="text-xs text-muted">{isMicrophoneEnabled ? "Mic on" : "Mic muted"}</span>
      <TrackToggle source={Track.Source.Microphone} showIcon={false} className="office-control" disabled={connection !== "connected"} onDeviceError={onDeviceError}>{isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}</TrackToggle>
      <button className="office-control" onClick={leave}>Leave Voice</button>
      <StartAudio className="office-control" label="Enable audio playback" />
    </div>
    <details className="mt-3"><summary className="cursor-pointer text-xs font-medium">Voice participants ({people.length}) and audio devices</summary>
      <ul className="my-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{people.map((person) => <VoicePerson key={person.identity} person={person} reconnecting={connection !== "connected"} />)}</ul>
      <div className="flex flex-wrap gap-3"><Devices kind="audioinput" error={error} />{supportsAudioOutputSelection() ? <Devices kind="audiooutput" error={error} /> : <p className="text-xs text-muted">Output device selection is managed by this browser or operating system.</p>}</div>
    </details>
  </>;
}
export default function VoiceSession({ admission,leave,failed }: { admission: VoiceAdmission; leave(): void; failed(message: string): void }) {
  const [room] = useState(() => new Room({ disconnectOnPageLeave:true,stopLocalTrackOnUnpublish:true }));
  const [mount] = useState(createVoiceMount);
  const [connected,setConnected] = useState(false), [notice,setNotice] = useState("");
  const [stage,setStage] = useState<VoiceStage>("microphone");
  const { url,token } = admission;
  const callbacks = useRef({ leave,failed });
  useEffect(() => { callbacks.current = { leave,failed }; },[leave,failed]);
  useEffect(() => {
    // SDK error objects can include signaling details. Use fixed UI categories.
    setLogLevel(LogLevel.silent);
    let active = true, established = false;
    // Initial connection failure is reported by the rejected connect promise with
    // its exact stage/reason; don't overwrite it with a generic disconnect notice.
    const onDisconnect = () => { if (active && established) callbacks.current.failed("Voice disconnected or access was revoked. Re-enter the meeting room and join again."); };
    const onDevicesError = (error: Error) => { if (active) setNotice(voiceError(error)); };
    const onSubscriptionError = () => { if (active) { setNotice("Remote audio subscription failed. Check the connection and retry voice."); console.warn("Voice connection failed.",{stage:"remote_audio_subscription",category:"subscription"}); } };
    room.on(RoomEvent.Disconnected,onDisconnect); room.on(RoomEvent.MediaDevicesError,onDevicesError);
    room.on(RoomEvent.TrackSubscriptionFailed,onSubscriptionError);
    const mounting = mount(() => startVoice({
      async capture() {
        const track = await createLocalAudioTrack({ echoCancellation:true,noiseSuppression:true,autoGainControl:true });
        track.mediaStreamTrack.addEventListener("ended",() => { if (active) setNotice("Microphone disconnected. Select another input, or leave and rejoin."); },{ once:true });
        return track;
      },
      async connect(signalConnected) {
        room.on(RoomEvent.SignalConnected,signalConnected);
        try { await room.connect(url,token,{ autoSubscribe:true,websocketTimeout:8000,peerConnectionTimeout:8000 }); }
        finally { room.off(RoomEvent.SignalConnected,signalConnected); }
      },
      async publish(track) { await room.localParticipant.publishTrack(track as LocalAudioTrack,{ source:Track.Source.Microphone }); },
      disconnect: () => room.disconnect(true),
    },() => { established = true; if (active) setConnected(true); },(message) => { if (active) callbacks.current.failed(message); },{onStage(next) { if (active) { setStage(next); console.info("Voice connection stage.",{stage:next}); } }}));
    return () => { active = false; room.off(RoomEvent.Disconnected,onDisconnect); room.off(RoomEvent.MediaDevicesError,onDevicesError); room.off(RoomEvent.TrackSubscriptionFailed,onSubscriptionError); void mounting.dispose(); };
  },[room,url,token,mount]);
  return <RoomContext.Provider value={room}>
    <RoomAudioRenderer />
    {connected ? <Controls leave={leave} error={setNotice} /> : <div className="mt-3 flex items-center gap-3"><p role="status" className="text-xs">{stage === "microphone" ? "Waiting for microphone permission…" : stage === "signaling" ? "Connecting LiveKit signaling…" : stage === "media" ? "Establishing WebRTC media…" : "Publishing microphone audio…"}</p><button className="office-control" onClick={leave}>Cancel voice</button></div>}
    {notice && <p role="alert" className="mt-2 text-xs text-red-800">{notice}</p>}
  </RoomContext.Provider>;
}
