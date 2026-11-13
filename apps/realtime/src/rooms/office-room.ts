import { ENVIRONMENT_CHANGED_CODE } from "../../../../packages/shared/src/protocol.ts";
import type { EnvironmentMaps } from "../environment/maps.ts";
import { Room, ServerError, ClientState, type Client } from "colyseus";
import { OfficeState, PlayerState,MovementCommand } from "../state/office-state.ts";
import { canStand, simulate } from "../movement/simulation.ts";
import { mapMarkers, type OfficeMap } from "../../../../packages/shared/src/map.ts";
import { AUTH_CHECK_MS, AUTH_LEASE_MS, RECONNECT_SECONDS, TICK_MS,MOVEMENT_HZ, mapVersion, validInput, type MoveInput } from "../../../../packages/shared/src/protocol.ts";
import type { Authorize, Authorization } from "../auth/authorize.ts";
import { ChatFailure, type ChatStore } from "../chat/store.ts";
import { isAvailability, parseChatSend, type ChatErrorCode } from "../../../../packages/shared/src/chat.ts";
import { meetingZone } from "../../../../packages/shared/src/voice.ts";
import type { VoiceService } from "../voice/service.ts";
import { createProximity } from '../voice/proximity.ts';
import { conversationSpace } from '../voice/space.ts';
import type { ProximitySettings } from '../../../../packages/shared/src/proximity.ts';
import { parseInteraction } from '../../../../packages/shared/src/interactions.ts';
import { createSeating } from '../interactions/seating.ts';
import {LiveOffice,type LiveStore} from '../environment/live.ts';
import {structureVersion,type LiveDelta} from '../../../../packages/shared/src/environment/live-decoration.ts';
import { GameSessions, type GameActor } from '../games/sessions.ts';
import { parseGameRequest } from '../../../../packages/shared/src/games/protocol.ts';

type OfficeClient = Client<{ auth: Authorization }>;
type Control = { input: MoveInput; lastInput: number; window: number; messages: number; refreshing: boolean; nextCheck: number; refreshedAt: number; pendingToken?: string };
export type RoomServices = {
  authorize: Authorize; map: OfficeMap;
  chat?: ChatStore;
  voice?: VoiceService;
  proximity?:Partial<ProximitySettings>;
  loadMap?: EnvironmentMaps;
  liveStore?:LiveStore;
  claimed(officeId: string, userId: string, sessionId: string): boolean;
  release(officeId: string, userId: string, sessionId: string): void;
  disposed(officeId: string, roomId: string): void;
};
export function officeRoomClass(services: RoomServices) {
  return class OfficeRoom extends Room<{ state: OfficeState; client: OfficeClient;input:InstanceType<typeof MovementCommand> }> {
    state = new OfficeState();
    maxClients = 10;
    maxMessagesPerSecond = 100;
    inputs=this.defineInput(MovementCommand,{bufferMaxSize:8,stepMs:1000/MOVEMENT_HZ,sanitize:input=>{if(![-1,0,1].includes(input.x)||![-1,0,1].includes(input.y)){input.x=0;input.y=0;input.run=false;}}});
    // Local diagnostics, deliberately outside synchronized Schema state.
    simulationTicks = 0;
    simulationWorkMs = 0;
    private officeMap = services.map;
    private checkingEnvironment = false;
    private controls = new Map<string, Control>();
    private revoked = new Set<string>();
    private chatPending = new Set<string>();
    private statusPending = new Set<string>();
    private statusAt = new Map<string, number>();
    private proximity!:ReturnType<typeof createProximity>;
    private proximityAt=new Map<string,number>();
    private proximityRevision=new Map<string,number>();
    private proximityNext=0;
    private diagnosticAt=new Map<string,number>();
    private nativeClients=new Set<string>();
    private seating!:ReturnType<typeof createSeating>;
    private interactionAt=new Map<string,number>();
    private interactionSeq=new Map<string,number>();
    private live?:LiveOffice;
    private liveStarting?:Promise<void>;
    private editPending=new Set<string>();
    private editAt=new Map<string,number>();
    private editWindows=new Map<string,{at:number;count:number}>();
    private games!: GameSessions;
    private gamePending = new Set<string>();
    private gameAt = new Map<string, number>();
    // All default matchmaking paths fail closed. Only our authorized endpoint
    // can reserve seats with trusted authData. Never inherit bundle JWT defaults.
    static async onAuth(): Promise<never> { throw new ServerError(403, "Use authorized office admission."); }
    onCreate(options: { officeId: string; map?: OfficeMap }) {
      this.officeMap = options.map ?? services.map;
      this.state.officeId = options.officeId;
      this.games = new GameSessions(options.officeId, this.officeMap, (id, table) => {
        const recipient = this.clients.find(c => c.sessionId === id), auth = recipient?.auth;
        if (recipient && auth && this.state.players.get(id)?.connected && !this.revoked.has(id) && Date.now() < auth.expiresAt && Date.now() - auth.checkedAt < AUTH_LEASE_MS) recipient.send('game.state', table);
      });
      this.clock.setInterval(() => this.games.tick(), 1000);
      this.seating=createSeating(this.officeMap,this.state.seats);
      this.proximity=createProximity(options.officeId,services.voice,services.proximity,Date.now,conversationSpace(this.officeMap));
      this.state.mapVersion = mapVersion(this.officeMap);
      this.seatReservationTimeout = 10;
      this.patchRate = TICK_MS;
      if (services.loadMap) this.clock.setInterval(() => void this.checkEnvironment(), 5000);
      this.setFixedTimestep(() => this.tick(), MOVEMENT_HZ);
      this.onMessage("input", (client, value: unknown) => {
        const control = this.controls.get(client.sessionId), now = Date.now();
        if (!control) return;
        if(this.nativeClients.has(client.sessionId)||this.inputs.get(client.sessionId).size){this.deny(client);return;}
        if (now - control.window >= 1000) { control.window = now; control.messages = 0; }
        if (++control.messages > 35 || !validInput(value)) { this.deny(client); return; }
        if (value.seq <= control.input.seq) return;
        control.input = value; control.lastInput = now;
      });
      this.onMessage('object.interact',(client,value:unknown)=>{
        const now=Date.now(),player=this.state.players.get(client.sessionId),request=parseInteraction(value),auth=client.auth;
        const reject=(code:string)=>client.send('object.error',{code});
        if(!player?.connected||!auth||now>=auth.expiresAt||now-auth.checkedAt>=AUTH_LEASE_MS){reject('DENIED');return;}
        if(!request||request.seq<=(this.interactionSeq.get(client.sessionId)??-1)){reject('INVALID');return;}
        this.interactionSeq.set(client.sessionId,request.seq);
        if(now-(this.interactionAt.get(client.sessionId)??0)<250){reject('RATE_LIMIT');return;}
        this.interactionAt.set(client.sessionId,now);
        const result=this.seating.act(client.sessionId,player,request,now);
        if(result!=='OK'){reject(result);return;}
        player.movementEpoch++;
        this.inputs.get(client.sessionId).drain();
        const control=this.controls.get(client.sessionId);
        // Explicit E/touch stand clears cached input; only fresh intent may walk.
        if(control){control.input={seq:control.input.seq,x:0,y:0};control.lastInput=0;}
      });
      this.onMessage('environment.sync',client=>{const now=Date.now();if(now-(this.editAt.get('sync/'+client.sessionId)??0)<300)return;this.editAt.set('sync/'+client.sessionId,now);if(this.live&&this.state.players.get(client.sessionId)?.connected)client.send('environment.snapshot',this.live.snapshot);});
      this.onMessage('environment.edit',(client,value:unknown)=>{void this.editEnvironment(client,value);});
      this.onMessage('game.request', (client, value: unknown) => { void this.gameAction(client, value); });
      this.onMessage("credential", (client, value: unknown) => {
        const control = this.controls.get(client.sessionId);
        if (!control || typeof value !== "string" || !value || value.length > 8192) return;
        // Keep one latest refresh through an in-flight read or the one-second
        // throttle. A just-saved appearance must not wait for the periodic lease.
        control.pendingToken = value;
      });
      this.onMessage("chat.send", (client, value: unknown) => { void this.sendChat(client, value); });
      this.onMessage("availability.set", (client, value: unknown) => { void this.setAvailability(client, value); });
      this.onMessage("voice.leave", (client) => { void this.proximityAction(client,{enabled:false});void services.voice?.revoke(client.sessionId); });
      this.onMessage('proximity.set',(client,value:unknown)=>{void this.proximityAction(client,value);});
      this.onMessage('proximity.lock',(client,value:unknown)=>{void this.proximityAction(client,value);});
      // Local diagnostics only: no user IDs, positions, credentials or secrets.
      this.onMessage('movement.ping',(client,value:unknown)=>{
        if(process.env.NODE_ENV==='production')return;
        if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||Date.now()-(this.diagnosticAt.get(client.sessionId)??0)<900)return;
        this.diagnosticAt.set(client.sessionId,Date.now());
        client.send('movement.pong',{nonce:value,workMs:this.simulationWorkMs/Math.max(1,this.simulationTicks)});
      });
      this.onMessage("*", (client) => this.deny(client));
    }
    private async checkEnvironment() {
      const auth = this.clients.find(client => this.state.players.get(client.sessionId)?.connected)?.auth;
      if (!services.loadMap || !auth || this.checkingEnvironment) return;
      this.checkingEnvironment = true;
      try {
        const fresh = await services.authorize(auth.token, this.state.officeId);
        const current = await services.loadMap(fresh);
        if (this.clients.length && mapVersion(current) !== this.state.mapVersion && (!this.live||structureVersion(current)!==this.state.structureVersion)) await this.disconnect(ENVIRONMENT_CHANGED_CODE);
      } catch { /* Never substitute geometry on an outage; normal auth leases still apply. */ }
      finally { this.checkingEnvironment = false; }
    }
    private async editEnvironment(client:OfficeClient,value:unknown){
      const operationId=value&&typeof value==='object'&&'operationId'in value&&typeof value.operationId==='string'?value.operationId.slice(0,36):'';
      const fail=(message:string)=>client.send('environment.reply',{operationId,ok:false,message,snapshot:this.live?.snapshot});
      if(!this.live||!services.liveStore){fail('Live editing is unavailable. Check the realtime editor configuration.');return;}
      const now=Date.now(),previous=this.editWindows.get(client.sessionId),window=previous&&now-previous.at<1000?previous:{at:now,count:0};this.editWindows.set(client.sessionId,window);
      if(this.editPending.has(client.sessionId)||++window.count>20){fail('Wait for the previous edit to finish.');return;}
      this.editAt.set(client.sessionId,Date.now());this.editPending.add(client.sessionId);
      try{
        const auth=await this.actionIdentity(client);
        const result=await this.live.run(value,auth,services.liveStore,()=>this.state.players.values(),()=>new Map([...this.controls].map(([id,c])=>[id,Date.now()-c.lastInput<250?c.input:{x:0,y:0}])),(map,delta)=>this.applyLiveMap(map,delta));
        client.send('environment.reply',{operationId,ok:true,snapshot:result.snapshot});
      }catch(error){fail(error instanceof Error?error.message:'The edit could not be accepted.');}
      finally{this.editPending.delete(client.sessionId);}
    }
    private applyLiveMap(map:OfficeMap,delta:LiveDelta){
      this.officeMap=map;this.seating.updateMap(map);
      this.games.updateMap(map);
      for(const [id,player]of this.state.players){player.movementEpoch++;this.inputs.get(id).drain();const control=this.controls.get(id);if(control){control.input={seq:control.input.seq,x:0,y:0};control.lastInput=0;}}
      this.state.environmentRevision=delta.revision;
      if(delta.saved)this.state.mapVersion=mapVersion(map);
      this.broadcast('environment.delta',delta);
    }
    private async startLive(auth:Authorization){
      if(!services.liveStore)return;
      if(!this.liveStarting)this.liveStarting=(async()=>{const seed=await services.liveStore!.read(auth);const live=new LiveOffice(seed.config,seed.workspace,this.state.officeId);if(mapVersion(live.map)!==this.state.mapVersion)throw Error('Office setup changed during admission.');this.live=live;this.state.structureVersion=live.snapshot.structureVersion;this.state.environmentEpoch=live.snapshot.epoch;})();
      try{await this.liveStarting;}catch{this.liveStarting=undefined;/* Movement remains available when editing storage is unavailable. */}
    }
    private async actionIdentity(client: OfficeClient) {
      const auth = client.auth;
      if (!auth || !this.state.players.get(client.sessionId)?.connected || Date.now() >= auth.expiresAt || Date.now()-auth.checkedAt >= AUTH_LEASE_MS) throw new ChatFailure("DENIED");
      const fresh = await services.authorize(auth.token, this.state.officeId);
      if (fresh.userId !== auth.userId || fresh.organizationId !== auth.organizationId || fresh.officeId !== this.state.officeId || Date.now() >= fresh.expiresAt || !this.state.players.get(client.sessionId)?.connected) throw new ChatFailure("DENIED");
      return fresh;
    }
    private gameActor(client: OfficeClient, auth = client.auth): GameActor {
      const player = this.state.players.get(client.sessionId);
      if (!auth || !player?.connected || this.revoked.has(client.sessionId)) throw new ChatFailure('DENIED');
      return { userId: auth.userId, sessionId: client.sessionId, officeId: auth.officeId, organizationId: auth.organizationId, displayName: auth.displayName, connected: true, x: player.x, y: player.y, seatId: player.seatId };
    }
    private async gameAction(client: OfficeClient, value: unknown) {
      const request = parseGameRequest(value);
      const requestId = request?.requestId ?? '';
      const fail = (code: string, message: string) => client.send('game.reply', { requestId, ok: false, code, message });
      if (!request) { fail('INVALID', 'Invalid game request.'); return; }
      // Closing one's own spectator subscription is immediate, including while
      // another request is pending. It grants no new read or play capability.
      if (request.action === 'UNWATCH') {
        const auth = client.auth;
        if (!auth || Date.now() >= auth.expiresAt || Date.now() - auth.checkedAt >= AUTH_LEASE_MS) { fail('DENIED', 'Office access expired.'); return; }
        try { client.send('game.reply', this.games.handle(this.gameActor(client), request)); } catch { fail('DENIED', 'Game access denied.'); }
        return;
      }
      if (this.gamePending.has(client.sessionId) || Date.now() - (this.gameAt.get(client.sessionId) ?? 0) < 80) { fail('RATE_LIMIT', 'Wait for the previous game action to finish.'); return; }
      this.gamePending.add(client.sessionId); this.gameAt.set(client.sessionId, Date.now());
      try {
        const fresh = await this.actionIdentity(client);
        client.send('game.reply', this.games.handle(this.gameActor(client, fresh), request));
      } catch { fail('DENIED', 'Game access could not be verified. Reconnect and check your office membership.'); }
      finally { this.gamePending.delete(client.sessionId); }
    }
    private async proximityAction(client:OfficeClient,value:unknown) {
      const serial=(this.proximityRevision.get(client.sessionId)??0)+1;
      this.proximityRevision.set(client.sessionId,serial);
      if(value&&typeof value==='object'&&Object.keys(value).length===1&&'enabled' in value&&value.enabled===false){this.proximity.action(client.sessionId,value);return;}
      if(Date.now()-(this.proximityAt.get(client.sessionId)??0)<250){client.send('proximity.error',{message:'Wait a moment before changing the conversation.'});return;}
      this.proximityAt.set(client.sessionId,Date.now());
      const eligibility=this.proximity.checkpoint(client.sessionId);
      // Opt-out is always immediate, even during an Auth outage.
      try{await this.actionIdentity(client);if(this.proximityRevision.get(client.sessionId)!==serial||this.proximity.checkpoint(client.sessionId)!==eligibility)return;if(!this.proximity.action(client.sessionId,value))throw Error();}
      catch{client.send('proximity.error',{message:'Conversation change denied. Check current membership and controller permissions.'});}
    }
    private async sendChat(client: OfficeClient, value: unknown) {
      const input = parseChatSend(value);
      const error = (code: ChatErrorCode) => client.send("chat.error", { clientMessageId: input?.clientMessageId ?? null, code });
      if (!input) { error("INVALID"); return; }
      if (this.chatPending.has(client.sessionId)) { error("RATE_LIMIT"); return; }
      if (!services.chat) { error("UNAVAILABLE"); return; }
      this.chatPending.add(client.sessionId);
      try {
        let fresh: Authorization;
        try { fresh = await this.actionIdentity(client); } catch { throw new ChatFailure("DENIED"); }
        const saved = await services.chat.send(fresh, input);
        // Only committed records are acknowledged/broadcast. A retry acknowledges
        // only its sender and does not replay an old message to the whole room.
        for (const recipient of saved.inserted ? this.clients : [client]) {
          const auth = recipient.auth;
          if (auth && this.state.players.get(recipient.sessionId)?.connected && Date.now()<auth.expiresAt && Date.now()-auth.checkedAt<AUTH_LEASE_MS) recipient.send("chat.message", saved.message);
        }
      } catch (failure) {
        const code = failure instanceof ChatFailure ? failure.code : "UNAVAILABLE";
        error(code); if (code === "DENIED") this.deny(client);
      } finally { this.chatPending.delete(client.sessionId); }
    }
    private async setAvailability(client: OfficeClient, value: unknown) {
      if (!value || typeof value !== "object" || Object.keys(value).length !== 1 || !("status" in value) || !isAvailability(value.status)) { client.send("availability.error", { code: "INVALID" }); return; }
      if (this.statusPending.has(client.sessionId) || Date.now()-(this.statusAt.get(client.sessionId) ?? 0)<1000) { client.send("availability.error", { code: "RATE_LIMIT" }); return; }
      this.statusAt.set(client.sessionId, Date.now()); this.statusPending.add(client.sessionId);
      try { await this.actionIdentity(client); const player = this.state.players.get(client.sessionId); if (player) player.availability = value.status; }
      catch { client.send("availability.error", { code: "DENIED" }); this.deny(client); }
      finally { this.statusPending.delete(client.sessionId); }
    }
    async onJoin(client: OfficeClient) {
      try {
        const auth = client.auth;
        if (!auth || auth.officeId !== this.state.officeId || !services.claimed(auth.officeId, auth.userId, client.sessionId)) throw new Error();
        const fresh = await services.authorize(auth.token, this.state.officeId);
        if (client.state === ClientState.LEAVING || client.state === ClientState.CLOSED || fresh.userId !== auth.userId || fresh.organizationId !== auth.organizationId || this.state.players.size >= 10 || [...this.state.players.values()].some((p) => p.userId === fresh.userId)) throw new Error();
        client.auth = fresh;
        await this.startLive(fresh);
        const spawn = mapMarkers(this.officeMap).find((m) => m.type === "spawn")!;
        let spawnX = spawn.x;
        for (let i = 0; i < 20; i++) {
          const x = spawn.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 24;
          if (canStand(this.officeMap, x, spawn.y) && [...this.state.players.values()].every((p) => Math.hypot(p.x - x, p.y - spawn.y) >= 20)) { spawnX = x; break; }
        }
        const player = new PlayerState();
        Object.assign(player, { sessionId: client.sessionId, userId: fresh.userId, avatarKey: fresh.avatarKey, displayName: fresh.displayName, appearance: fresh.appearance ?? '', x: spawnX, y: spawn.y });
        this.state.players.set(client.sessionId, player);
        this.controls.set(client.sessionId, { input: { seq: -1, x: 0, y: 0 }, lastInput: 0, window: Date.now(), messages: 0, refreshing: false, nextCheck: Date.now() + AUTH_CHECK_MS, refreshedAt: Date.now() });
        this.games.connect(this.gameActor(client, fresh));
        const pending=this.live?.pendingFor(fresh.userId);if(pending)void this.editEnvironment(client,pending);
      } catch {
        if (client.auth) services.release(this.state.officeId, client.auth.userId, client.sessionId);
        throw new ServerError(403, "Office access denied.");
      }
    }
    private deny(client: OfficeClient) {
      if (client.auth) this.games.revoke(client.sessionId, client.auth.userId);
      this.seating.release(client.sessionId,this.state.players.get(client.sessionId));
      this.proximity.leave(client.sessionId);
      services.voice?.leave(client.sessionId);
      this.revoked.add(client.sessionId);
      // Remove state before closing, so it cannot continue to move or receive updates.
      this.state.players.delete(client.sessionId); this.controls.delete(client.sessionId);
      if (client.auth) services.release(this.state.officeId, client.auth.userId, client.sessionId);
      client.leave(4000, "Office connection ended. Verify access and retry.");
    }
    private async revalidate(client: OfficeClient, token = client.auth?.token) {
      const control = this.controls.get(client.sessionId);
      if (!control || control.refreshing) return;
      control.refreshing = true; control.refreshedAt = Date.now();
      try {
        const fresh = await services.authorize(token, this.state.officeId);
        if (!this.controls.has(client.sessionId) || this.revoked.has(client.sessionId)) return;
        if (fresh.userId !== client.auth?.userId || fresh.organizationId !== client.auth?.organizationId) throw new Error();
        client.auth = fresh;
        const player = this.state.players.get(client.sessionId);
        if (player) { player.avatarKey = fresh.avatarKey; player.displayName = fresh.displayName; player.appearance = fresh.appearance ?? ''; }
        control.nextCheck = Date.now() + AUTH_CHECK_MS;
      } catch { this.deny(client); }
      finally { control.refreshing = false; }
    }
    private tick() {
      const began = performance.now(); this.simulationTicks++;
      const now = Date.now();
      for (const client of this.clients) {
        const control = this.controls.get(client.sessionId), player = this.state.players.get(client.sessionId);
        if (!control || !player) continue;
        if (!client.auth || now >= client.auth.expiresAt || now - client.auth.checkedAt >= AUTH_LEASE_MS) { this.deny(client); continue; }
        if (control.pendingToken && !control.refreshing && now - control.refreshedAt >= 1000) {
          const token = control.pendingToken; control.pendingToken = undefined; void this.revalidate(client, token);
        } else if (now >= control.nextCheck && !control.refreshing) void this.revalidate(client);
        const channel=this.inputs.get(client.sessionId);if(channel.size)this.nativeClients.add(client.sessionId);
        const native=this.nativeClients.has(client.sessionId);
        // One server-sized step per tick, regardless of how many commands a
        // client sends. Drop old backlog rather than fast-forwarding the player.
        if(native){
          if(channel.size>3)channel.take(channel.size-1);
          const command=channel.next();
          const current=command&&command.epoch===player.movementEpoch&&command.revision===this.state.environmentRevision&&player.connected;
          control.input={seq:channel.consumedCount,x:current?command.x:0,y:current?command.y:0,run:current&&command.run===true};control.lastInput=current?now:0;
        }
        if(!this.seating.transitioning(client.sessionId,now))simulate(this.officeMap,player,now-control.lastInput<250&&player.connected?control.input:{x:0,y:0},1000/MOVEMENT_HZ);
      }
      if(now>=this.proximityNext){this.proximityNext=now+TICK_MS;this.proximity.sync(this.clients.flatMap(client=>{const p=this.state.players.get(client.sessionId);return p?.connected&&client.auth?[{sessionId:client.sessionId,auth:client.auth,x:p.x,y:p.y,meeting:!!meetingZone(this.officeMap,p.x,p.y)}]:[];}),
        (id,value)=>this.clients.find(c=>c.sessionId===id)?.send('proximity.state',value),(id,value)=>this.clients.find(c=>c.sessionId===id)?.send('voice.state',value));
      }
      this.simulationWorkMs += performance.now() - began;
    }
    onDrop(client: OfficeClient) {
      if (client.auth) this.games.disconnect(client.sessionId, client.auth.userId);
      this.seating.release(client.sessionId,this.state.players.get(client.sessionId));
      this.proximityRevision.set(client.sessionId,(this.proximityRevision.get(client.sessionId)??0)+1);
      this.proximity.leave(client.sessionId);
      services.voice?.leave(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!player || this.revoked.has(client.sessionId)) return;
      player.connected = false; player.isMoving = false;
      player.movementEpoch++;
      this.inputs.get(client.sessionId).drain();
      this.nativeClients.delete(client.sessionId);
      const control = this.controls.get(client.sessionId);
      if (control) control.input = { ...control.input, x: 0, y: 0 };
      void this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
    }
    async onReconnect(client: OfficeClient) {
      if (this.revoked.has(client.sessionId)) throw new ServerError(403, "Office access denied.");
      const fresh = await services.authorize(client.auth?.token, this.state.officeId);
      if (client.state === ClientState.LEAVING || client.state === ClientState.CLOSED || !client.auth || fresh.userId !== client.auth.userId || fresh.organizationId !== client.auth.organizationId || !this.state.players.has(client.sessionId)) throw new ServerError(403, "Office access denied.");
      client.auth = fresh;
      this.state.players.get(client.sessionId)!.connected = true;
      this.games.connect(this.gameActor(client, fresh));
      this.state.players.get(client.sessionId)!.movementEpoch++;
      this.inputs.get(client.sessionId).drain();
      const control = this.controls.get(client.sessionId)!;
      control.input = { seq: control.input.seq, x: 0, y: 0 }; control.lastInput = 0; control.nextCheck = Date.now() + AUTH_CHECK_MS;
      if(this.live)client.send('environment.snapshot',this.live.snapshot);
      const pending=this.live?.pendingFor(fresh.userId);if(pending)void this.editEnvironment(client,pending);
    }
    onLeave(client: OfficeClient) {
      if (client.auth) this.games.disconnect(client.sessionId, client.auth.userId);
      this.gamePending.delete(client.sessionId); this.gameAt.delete(client.sessionId);
      this.diagnosticAt.delete(client.sessionId);
      this.nativeClients.delete(client.sessionId);
      this.editAt.delete(client.sessionId);this.editAt.delete('sync/'+client.sessionId);this.editPending.delete(client.sessionId);
      this.editWindows.delete(client.sessionId);
      this.seating.release(client.sessionId,this.state.players.get(client.sessionId));this.interactionAt.delete(client.sessionId);this.interactionSeq.delete(client.sessionId);
      this.proximityRevision.delete(client.sessionId);
      this.proximity.leave(client.sessionId);this.proximityAt.delete(client.sessionId);
      services.voice?.leave(client.sessionId);
      this.chatPending.delete(client.sessionId); this.statusPending.delete(client.sessionId); this.statusAt.delete(client.sessionId);
      this.state.players.delete(client.sessionId); this.controls.delete(client.sessionId); this.revoked.delete(client.sessionId);
      if (client.auth) services.release(this.state.officeId, client.auth.userId, client.sessionId);
    }
    onDispose() { this.games.dispose();this.gamePending.clear();this.gameAt.clear();this.seating.clear();this.interactionAt.clear();this.interactionSeq.clear();this.proximity.close();this.proximityAt.clear();for (const id of this.state.players.keys()) services.voice?.leave(id); this.controls.clear(); this.revoked.clear(); this.chatPending.clear(); this.statusPending.clear(); this.statusAt.clear(); services.disposed(this.state.officeId, this.roomId); }
  };
}
