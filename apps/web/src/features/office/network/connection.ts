import { ENVIRONMENT_CHANGED_CODE } from "../../../../../../packages/shared/src/protocol.ts";
import { Client, type Room, type SeatReservation } from "@colyseus/sdk";
import type { OfficeNetwork, OfficeSnapshot, Presence } from "../../../../../../packages/shared/src/protocol.ts";
import { protectReconnectUrl } from "../../../../../../packages/shared/src/socket-transport.ts";
import { decodeMessage, isAvailability, parseChatSend, type ChatEvent } from "../../../../../../packages/shared/src/chat.ts";
import type { Participant } from "../../../../../../packages/shared/src/protocol.ts";
import { sameVoiceState, type VoiceZoneState } from "../../../../../../packages/shared/src/voice.ts";
import { decodeProximity, validBubbleRef, type ProximityState } from '../../../../../../packages/shared/src/proximity.ts';
import { parseInteraction } from '../../../../../../packages/shared/src/interactions.ts';
import {applyObjectChanges,type LiveSnapshot,type LiveRequest,type LiveReply,type LiveDelta} from '../../../../../../packages/shared/src/environment/live-decoration.ts';
import {parseDecoration} from '../../../../../../packages/shared/src/environment/decoration.ts';
import type {EnvironmentConfig} from '../../../../../../packages/shared/src/environment/catalog.ts';
import {OfficePrediction} from './prediction.ts';

type OfficeRoom = Room<object, OfficeSnapshot>;
export function realtimeUrl(value: string | undefined, production = process.env.NODE_ENV === "production") {
  if (!value) throw new Error("Realtime is not configured. Set NEXT_PUBLIC_REALTIME_URL and start the realtime server.");
  const url = new URL(value);
  if (url.origin !== value || !["http:", "https:"].includes(url.protocol) || url.username || url.password || production && url.protocol !== "https:") throw new Error("Use an exact realtime HTTP origin; HTTPS in production.");
  return url.origin;
}
export function connectOffice(options: {
  url: string; officeId: string; mapVersion: string;
  environment?:EnvironmentConfig;structureVersion?:string;onEnvironment?(value:LiveSnapshot):void;
  getToken(): Promise<string | null>; onPresence(presence: Presence): void;
  onChat?(event: ChatEvent): void;
  onParticipants?(participants: Participant[]): void;
  onAvailabilityError?(message: string): void;
  onVoice?(state: VoiceZoneState | null): void;
  onProximity?(state:ProximityState|null):void;
  onProximityError?(message:string):void;
  onInteractionError?(message:string):void;
}): OfficeNetwork {
  let room: OfficeRoom | undefined, state: OfficeSnapshot | undefined;
  let closed = false, denied = false, online = false, seq = 0, previousCount = 0;
  let lastX = 0, lastY = 0, lastSent = 0, lastRun=false, interactionSeq=0;
  let disposeTransport: (() => void) | undefined;
  let participantKey = "", chatReady = false;
  let voiceState: VoiceZoneState | null = null;
  let proximity:ProximityState|null=null;
  let environment:LiveSnapshot|undefined,syncAt=-Infinity;
  let prediction:OfficePrediction|undefined;
  let intent={x:0,y:0,run:false},native=false;
  let diagnosticPingAt=0,diagnosticNonce=0,diagnosticSentAt=0,websocketRtt=0,serverMovementMs:number|null=null;
  let syncTimer:ReturnType<typeof setTimeout>|undefined;
  const pending=new Map<string,{resolve(value:LiveSnapshot):void;reject(error:Error):void;timer:ReturnType<typeof setTimeout>}>();
  const syncEnvironment=()=>{if(!room||!online||closed)return;clearTimeout(syncTimer);const elapsed=performance.now()-syncAt;if(elapsed<350){syncTimer=setTimeout(syncEnvironment,350-elapsed);return;}syncAt=performance.now();room.send('environment.sync');syncTimer=setTimeout(()=>{if(state?.environmentEpoch&&(!environment||environment.epoch!==state.environmentEpoch||environment.revision!==(state.environmentRevision??0)))syncEnvironment();},750);};
  const acceptSnapshot=(value:LiveSnapshot)=>{
    if(closed||!online)return false;
    if(!value||value.officeId!==options.officeId||typeof value.epoch!=='string'||value.structureVersion!==options.structureVersion||![value.revision,value.savedRevision,value.publishedRevision,value.baseRevision].every(n=>Number.isSafeInteger(n)&&n>=0)||JSON.stringify(value).length>180000)return false;
    if(environment&&value.epoch===environment.epoch&&value.revision<environment.revision)return false;
    environment={...value,document:parseDecoration(value.document),published:parseDecoration(value.published)};options.onEnvironment?.(environment);return true;
  };
  const publishVoice = (value: VoiceZoneState | null) => {
    if (sameVoiceState(voiceState,value)) return;
    voiceState = value ? { sessionId:value.sessionId,zone:value.zone,configured:value.configured,participants:value.participants,...(value.bubble?{bubble:{...value.bubble}}:{}) } : null;
    options.onVoice?.(voiceState);
  };
  const disconnected = () => { prediction?.dispose();prediction=undefined;native=false;intent={x:0,y:0,run:false};for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Connection lost. The operation is unconfirmed. Reconnect and retry Save.'));}pending.clear();clearTimeout(syncTimer);chatReady = false; options.onChat?.({ type: "connection", online: false }); options.onParticipants?.([]); publishVoice(null);proximity=null;options.onProximity?.(null); participantKey = ""; };
  const controller = new AbortController();
  const presence = (status: Presence["status"], notice: string) => {
    if (!closed) options.onPresence({ status, notice, count: online && state ? [...state.players.values()].filter((p) => p.connected).length : 0 });
  };
  const credential = async () => {
    if (closed || denied) return;
    const token = await options.getToken();
    if (!closed && online && room && token) room.send("credential", token);
    else if (!token && !closed) { denied = true; online = false; clearInterval(refresh); if (room) room.reconnection.enabled = false; void room?.leave(); state = undefined; disconnected(); presence("denied", "Your session ended. Return to the workspace and sign in again."); }
  };
  const open = async () => {
    try {
      presence("connecting", "Connecting to your office…");
      const token = await options.getToken();
      if (closed) return;
      if (!token) { denied = true; clearInterval(refresh); presence("denied", "Sign in with a verified account before entering the office."); return; }
      // Never set SDK auth.token: it appends the bearer to WebSocket URLs.
      const response = await fetch(`${options.url}/office/join`, {
        method: "POST", credentials: "omit", cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ officeId: options.officeId, mapVersion: options.mapVersion }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) {
        const failure: unknown = await response.json().catch(() => null);
        if (response.status === 409 && failure && typeof failure === "object" && "code" in failure && failure.code === "MAP_CHANGED") { close(); options.onPresence({ status: "offline", count: 0, notice: "Office setup changed. Reload to enter the updated office.", reload: true }); return; }
        denied = response.status === 401 || response.status === 403;
        clearInterval(refresh);
        const notice = denied ? "Office access denied. Sign in and check your active membership." : response.status === 429 ? "Too many connection attempts. Wait a minute and retry." : "Unable to enter. Close other office tabs, wait ten seconds and retry. If it continues, contact your workspace administrator.";
        presence(denied ? "denied" : "offline", notice); return;
      }
      const reservation: SeatReservation = await response.json();
      if (closed) return;
      const client = new Client(options.url, { urlBuilder(url) {
        // Also discard a cached SDK-auth credential from an unrelated prior use
        // of this browser origin. Supabase exclusively owns authentication here.
        url.searchParams.delete("_authToken"); url.searchParams.delete("reconnectionToken");
        return url.toString();
      } });
      const joined = await client.consumeSeatReservation<OfficeSnapshot>(reservation);
      if (closed) { void joined.leave(); return; }
      room = joined;
      disposeTransport = protectReconnectUrl(room.connection);
      room.reconnection.minUptime = 0;
      room.reconnection.maxRetries = 6;
      room.reconnection.maxDelay = 2000;
      room.reconnection.maxEnqueuedMessages = 0;
      online = true;
      room.onStateChange((next) => {
        if (closed || denied || !online) return;
        if (next.officeId !== options.officeId || next.mapVersion !== options.mapVersion&&(!options.structureVersion||next.structureVersion!==options.structureVersion)) { close(); options.onPresence({ status: "offline", count: 0, notice: "Office map changed. Reload this page.",reload:true }); return; }
        state = next;
        if(next.environmentEpoch&&(!environment||environment.epoch!==next.environmentEpoch||environment.revision<(next.environmentRevision??0)))syncEnvironment();
        if (!chatReady && online) { chatReady = true; options.onChat?.({ type: "connection", online: true }); }
        const participants = [...next.players.values()];
        // Positions never enter React. Notify only when participant presentation
        // changes, not on the high-frequency movement patches.
        const key = JSON.stringify(participants.map((p) => [p.sessionId,p.userId,p.displayName,p.avatarKey,p.connected,p.availability]));
        if (key !== participantKey) { participantKey = key; options.onParticipants?.(participants.map((p) => ({ sessionId: p.sessionId, userId: p.userId, displayName: p.displayName, avatarKey: p.avatarKey, connected: p.connected, availability: isAvailability(p.availability) ? p.availability : "AVAILABLE", isSelf: p.sessionId === room?.sessionId }))); }
        const count = [...next.players.values()].filter((p) => p.connected).length;
        if (count !== previousCount) { const before = previousCount; previousCount = count; presence("online", count > before ? "A participant joined." : "A participant left."); }
      });
      room.onMessage('environment.snapshot',(value:LiveSnapshot)=>{try{acceptSnapshot(value);}catch{syncEnvironment();}});
      room.onMessage('environment.delta',(value:LiveDelta)=>{
        if(closed||!online||!options.environment)return;
        try{
          if(!environment||value.officeId!==options.officeId||value.epoch!==environment.epoch||value.structureVersion!==options.structureVersion){syncEnvironment();return;}
          if(value.revision<=environment.revision)return;
          if(value.previousRevision!==environment.revision||value.revision!==value.previousRevision+1){syncEnvironment();return;}
          const document=applyObjectChanges(options.environment,environment.document,value.changes);
          acceptSnapshot({...environment,revision:value.revision,savedRevision:value.savedRevision,publishedRevision:value.publishedRevision,document,published:value.saved?document:environment.published});
        }catch{syncEnvironment();}
      });
      room.onMessage('environment.reply',(value:LiveReply)=>{const item=pending.get(value?.operationId);if(!item)return;clearTimeout(item.timer);pending.delete(value.operationId);try{if(value.snapshot)acceptSnapshot(value.snapshot);}catch{syncEnvironment();}if(value.ok&&environment)item.resolve(environment);else item.reject(Object.assign(Error(value.message||'The edit was not accepted.'),{snapshot:environment}));});
      syncEnvironment();
      room.onMessage("chat.message", (value: unknown) => { if (!closed && online) try { options.onChat?.({ type: "message", message: decodeMessage(value) }); } catch { options.onChat?.({ type: "error", clientMessageId: null, code: "UNAVAILABLE" }); } });
      room.onMessage("chat.error", (value: { code?: unknown; clientMessageId?: unknown }) => {
        if (closed) return;
        const code = value?.code === "INVALID" || value?.code === "RATE_LIMIT" || value?.code === "DENIED" ? value.code : "UNAVAILABLE";
        options.onChat?.({ type: "error", code, clientMessageId: typeof value?.clientMessageId === "string" ? value.clientMessageId : null });
      });
      room.onMessage("availability.error", () => options.onAvailabilityError?.("Availability could not change. Wait a moment, check access and retry."));
      room.onMessage('object.error',(value:{code?:string})=>{prediction?.releaseInteraction();if(!closed&&online)options.onInteractionError?.(value?.code==='OCCUPIED'?'That seat was just taken. Choose another seat.':value?.code==='RATE_LIMIT'?'Wait a moment before interacting again.':'Move closer to an open seat with a clear approach and try again.');});
      if(process.env.NODE_ENV!=='production')room.onMessage('movement.pong',(value:{nonce:number;workMs:number})=>{if(value?.nonce!==diagnosticNonce)return;websocketRtt=performance.now()-diagnosticSentAt;serverMovementMs=Number.isFinite(value.workMs)?Math.max(0,value.workMs):null;});
      room.onMessage("voice.state", (value: VoiceZoneState) => {
        if (!closed && online && value?.sessionId === room?.sessionId && (value.zone === null || value.zone === "Meeting Room" || value.zone==='Proximity conversation'&&validBubbleRef(value.bubble)) && typeof value.configured === "boolean" &&
          (value.participants === null || Number.isInteger(value.participants) && value.participants >= 0 && value.participants <= 10)) publishVoice(value);
      });
      room.onMessage('proximity.state',(value:unknown)=>{if(closed||!online||!room)return;const decoded=decodeProximity(value,options.officeId,room.sessionId);if(decoded){proximity=decoded;options.onProximity?.(decoded);}});
      room.onMessage('proximity.error',()=>{if(!closed&&online)options.onProximityError?.('Conversation change denied. Check current membership or wait a moment and retry.');});
      room.onDrop(() => { if (closed || denied) return; online = false; disconnected(); presence("reconnecting", "Connection lost. Reconnecting…"); });
      room.onReconnect(() => { if (closed || denied) return; online = true; lastSent = 0;syncAt=0;syncEnvironment(); presence("online", "Reconnected."); void credential(); });
      room.onLeave((code) => { if (closed) return; if (code === ENVIRONMENT_CHANGED_CODE) { close(); options.onPresence({ status: "offline", count: 0, notice: "Your owner applied a new office setup. Reload to enter it.", reload: true }); return; } denied ||= code === 4000; online = false; state = undefined; disconnected(); clearInterval(refresh); if (denied && room) room.reconnection.enabled = false; presence(denied ? "denied" : "offline", denied ? "Office access ended. Return to the workspace and check your membership." : "Disconnected. Verify your session and membership, then retry."); });
      room.onError((code) => { if (closed) return; denied ||= code === 401 || code === 403; online = false; disconnected(); if (denied) { clearInterval(refresh); if (room) room.reconnection.enabled = false; } presence(denied ? "denied" : "offline", denied ? "Office access denied. Return to the workspace and check your membership." : "Office connection failed. Check access and retry."); });
      presence("online", "Connected.");
    } catch { if (!closed) presence("offline", "Could not connect to the office. Check your network connection and retry."); }
  };
  const close = () => {
    if (closed) return;
    closed = true; online = false; state = undefined; controller.abort(); clearInterval(refresh);
    clearTimeout(syncTimer);
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Office connection ended. Reopen the editor after reconnecting.'));}pending.clear();
    disconnected();
    if (room) { room.reconnection.enabled = false; void room.leave(); disposeTransport?.(); room.removeAllListeners(); }
  };
  // getSession refreshes expired browser tokens; authorization remains server-side.
  const refresh = setInterval(() => { void credential().catch(() => {}); }, 10_000);
  void open();
  return {
    renderFrame(map,now){
      if(!online||!room||!state||closed||state.movementProtocol!==1)return undefined;
      if(state.environmentEpoch&&(!environment||state.environmentEpoch!==environment.epoch||state.environmentRevision!==environment.revision))return undefined;
      if(!prediction){prediction=new OfficePrediction(room);native=true;}
      if(process.env.NODE_ENV!=='production'&&now-diagnosticPingAt>=1000){diagnosticPingAt=now;diagnosticSentAt=performance.now();room.send('movement.ping',++diagnosticNonce);}
      return prediction.frame(map,intent,now,state,room.sessionId);
    },
    movementDiagnostics:process.env.NODE_ENV==='production'?undefined:()=>prediction?{...prediction.metrics(),rttMs:websocketRtt||prediction.metrics().rttMs,serverMovementMs}:undefined,
    environment:()=>environment,
    syncEnvironment,
    editEnvironment(request:LiveRequest){return new Promise((resolve,reject)=>{if(closed||!online||!room){reject(Error('Reconnect to the office before editing.'));return;}if(pending.has(request.operationId)){reject(Error('That operation is still pending.'));return;}const timer=setTimeout(()=>{pending.delete(request.operationId);syncEnvironment();reject(Error(request.kind==='save'?'Save is unconfirmed. Retry Save to reconcile it.':'Edit acknowledgement was lost. Review the current layout before retrying.'));},25000);pending.set(request.operationId,{resolve,reject,timer});room.send('environment.edit',request);});},
    proximity:()=>proximity,
    enableProximity(enabled){if(closed||!online||!room)return false;room.send('proximity.set',{enabled});return true;},
    lockBubble(ref,locked){if(closed||!online||!room||!validBubbleRef(ref))return false;room.send('proximity.lock',{bubbleId:ref.bubbleId,generation:ref.generation,revision:ref.revision,locked});return true;},
    snapshot: () => online ? state : undefined,
    sessionId: () => room?.sessionId,
    input(x, y, run=false) {
      if (!online || !room || closed) return;
      intent={x:Math.sign(x),y:Math.sign(y),run:run===true};
      if(native||state?.movementProtocol===1)return;
      if(state?.environmentEpoch&&(!environment||environment.epoch!==state.environmentEpoch||environment.revision!==(state.environmentRevision??0)))return;
      const now = performance.now();
      if (now - lastSent < 50 || x === lastX && y === lastY && run===lastRun && now - lastSent < 100) return;
      lastX = x; lastY = y; lastRun=run; lastSent = now;
      room.send("input", { seq: seq++, x: Math.sign(x), y: Math.sign(y), run:run===true });
    },
    interact(request){const value={...request,seq:interactionSeq++};if(!online||!room||closed||!parseInteraction(value))return false;prediction?.holdInteraction();intent={x:0,y:0,run:false};room.send('object.interact',value);return true;},
    appearanceChanged() { void credential().catch(() => {}); },
    close,
    sendChat(body, clientMessageId) { if (closed || !online || !chatReady || !room || !parseChatSend({ body, clientMessageId })) return false; room.send("chat.send", { body, clientMessageId }); return true; },
    setAvailability(status) { if (closed || !online || !room || !isAvailability(status)) return false; room.send("availability.set", { status }); return true; },
    leaveVoice() { if (!closed && online) room?.send("voice.leave"); },
  };
}
