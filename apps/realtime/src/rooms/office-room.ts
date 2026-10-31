import { ENVIRONMENT_CHANGED_CODE } from "../../../../packages/shared/src/protocol.ts";
import type { EnvironmentMaps } from "../environment/maps.ts";
import { Room, ServerError, ClientState, type Client } from "colyseus";
import { OfficeState, PlayerState } from "../state/office-state.ts";
import { canStand, simulate } from "../movement/simulation.ts";
import { mapMarkers, type OfficeMap } from "../../../../packages/shared/src/map.ts";
import { AUTH_CHECK_MS, AUTH_LEASE_MS, RECONNECT_SECONDS, TICK_MS, mapVersion, validInput, type MoveInput } from "../../../../packages/shared/src/protocol.ts";
import type { Authorize, Authorization } from "../auth/authorize.ts";
import { ChatFailure, type ChatStore } from "../chat/store.ts";
import { isAvailability, parseChatSend, type ChatErrorCode } from "../../../../packages/shared/src/chat.ts";
import { meetingZone } from "../../../../packages/shared/src/voice.ts";
import type { VoiceService } from "../voice/service.ts";
import { createProximity } from '../voice/proximity.ts';
import { conversationSpace } from '../voice/space.ts';
import type { ProximitySettings } from '../../../../packages/shared/src/proximity.ts';

type OfficeClient = Client<{ auth: Authorization }>;
type Control = { input: MoveInput; lastInput: number; window: number; messages: number; refreshing: boolean; nextCheck: number };
export type RoomServices = {
  authorize: Authorize; map: OfficeMap;
  chat?: ChatStore;
  voice?: VoiceService;
  proximity?:Partial<ProximitySettings>;
  loadMap?: EnvironmentMaps;
  claimed(officeId: string, userId: string, sessionId: string): boolean;
  release(officeId: string, userId: string, sessionId: string): void;
  disposed(officeId: string, roomId: string): void;
};
export function officeRoomClass(services: RoomServices) {
  return class OfficeRoom extends Room<{ state: OfficeState; client: OfficeClient }> {
    state = new OfficeState();
    maxClients = 10;
    maxMessagesPerSecond = 45;
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
    // All default matchmaking paths fail closed. Only our authorized endpoint
    // can reserve seats with trusted authData. Never inherit bundle JWT defaults.
    static async onAuth(): Promise<never> { throw new ServerError(403, "Use authorized office admission."); }
    onCreate(options: { officeId: string; map?: OfficeMap }) {
      this.officeMap = options.map ?? services.map;
      this.state.officeId = options.officeId;
      this.proximity=createProximity(options.officeId,services.voice,services.proximity,Date.now,conversationSpace(this.officeMap));
      this.state.mapVersion = mapVersion(this.officeMap);
      this.seatReservationTimeout = 10;
      this.patchRate = TICK_MS;
      if (services.loadMap) this.clock.setInterval(() => void this.checkEnvironment(), 5000);
      this.setFixedTimestep(() => this.tick(), 1000 / TICK_MS);
      this.onMessage("input", (client, value: unknown) => {
        const control = this.controls.get(client.sessionId), now = Date.now();
        if (!control) return;
        if (now - control.window >= 1000) { control.window = now; control.messages = 0; }
        if (++control.messages > 35 || !validInput(value)) { this.deny(client); return; }
        if (value.seq <= control.input.seq) return;
        control.input = value; control.lastInput = now;
      });
      this.onMessage("credential", (client, value: unknown) => {
        const control = this.controls.get(client.sessionId);
        if (!control || control.refreshing || typeof value !== "string" || value.length > 8192) return;
        // Credential/profile refresh is bounded separately from movement messages.
        if (Date.now() < control.nextCheck - AUTH_CHECK_MS + 1000) return;
        void this.revalidate(client, value);
      });
      this.onMessage("chat.send", (client, value: unknown) => { void this.sendChat(client, value); });
      this.onMessage("availability.set", (client, value: unknown) => { void this.setAvailability(client, value); });
      this.onMessage("voice.leave", (client) => { void this.proximityAction(client,{enabled:false});void services.voice?.revoke(client.sessionId); });
      this.onMessage('proximity.set',(client,value:unknown)=>{void this.proximityAction(client,value);});
      this.onMessage('proximity.lock',(client,value:unknown)=>{void this.proximityAction(client,value);});
      this.onMessage("*", (client) => this.deny(client));
    }
    private async checkEnvironment() {
      const auth = this.clients.find(client => this.state.players.get(client.sessionId)?.connected)?.auth;
      if (!services.loadMap || !auth || this.checkingEnvironment) return;
      this.checkingEnvironment = true;
      try {
        const fresh = await services.authorize(auth.token, this.state.officeId);
        const current = await services.loadMap(fresh);
        if (this.clients.length && mapVersion(current) !== this.state.mapVersion) await this.disconnect(ENVIRONMENT_CHANGED_CODE);
      } catch { /* Never substitute geometry on an outage; normal auth leases still apply. */ }
      finally { this.checkingEnvironment = false; }
    }
    private async actionIdentity(client: OfficeClient) {
      const auth = client.auth;
      if (!auth || !this.state.players.get(client.sessionId)?.connected || Date.now() >= auth.expiresAt || Date.now()-auth.checkedAt >= AUTH_LEASE_MS) throw new ChatFailure("DENIED");
      const fresh = await services.authorize(auth.token, this.state.officeId);
      if (fresh.userId !== auth.userId || fresh.organizationId !== auth.organizationId || fresh.officeId !== this.state.officeId || Date.now() >= fresh.expiresAt || !this.state.players.get(client.sessionId)?.connected) throw new ChatFailure("DENIED");
      return fresh;
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
        const spawn = mapMarkers(this.officeMap).find((m) => m.type === "spawn")!;
        let spawnX = spawn.x;
        for (let i = 0; i < 20; i++) {
          const x = spawn.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 24;
          if (canStand(this.officeMap, x, spawn.y) && [...this.state.players.values()].every((p) => Math.hypot(p.x - x, p.y - spawn.y) >= 20)) { spawnX = x; break; }
        }
        const player = new PlayerState();
        Object.assign(player, { sessionId: client.sessionId, userId: fresh.userId, avatarKey: fresh.avatarKey, displayName: fresh.displayName, x: spawnX, y: spawn.y });
        this.state.players.set(client.sessionId, player);
        this.controls.set(client.sessionId, { input: { seq: -1, x: 0, y: 0 }, lastInput: 0, window: Date.now(), messages: 0, refreshing: false, nextCheck: Date.now() + AUTH_CHECK_MS });
      } catch {
        if (client.auth) services.release(this.state.officeId, client.auth.userId, client.sessionId);
        throw new ServerError(403, "Office access denied.");
      }
    }
    private deny(client: OfficeClient) {
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
      control.refreshing = true;
      try {
        const fresh = await services.authorize(token, this.state.officeId);
        if (!this.controls.has(client.sessionId) || this.revoked.has(client.sessionId)) return;
        if (fresh.userId !== client.auth?.userId || fresh.organizationId !== client.auth?.organizationId) throw new Error();
        client.auth = fresh;
        const player = this.state.players.get(client.sessionId);
        if (player) { player.avatarKey = fresh.avatarKey; player.displayName = fresh.displayName; }
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
        if (now >= control.nextCheck && !control.refreshing) void this.revalidate(client);
        simulate(this.officeMap, player, now - control.lastInput < 250 && player.connected ? control.input : { x: 0, y: 0 });
      }
      this.proximity.sync(this.clients.flatMap(client=>{const p=this.state.players.get(client.sessionId);return p?.connected&&client.auth?[{sessionId:client.sessionId,auth:client.auth,x:p.x,y:p.y,meeting:!!meetingZone(this.officeMap,p.x,p.y)}]:[];}),
        (id,value)=>this.clients.find(c=>c.sessionId===id)?.send('proximity.state',value),(id,value)=>this.clients.find(c=>c.sessionId===id)?.send('voice.state',value));
      this.simulationWorkMs += performance.now() - began;
    }
    onDrop(client: OfficeClient) {
      this.proximityRevision.set(client.sessionId,(this.proximityRevision.get(client.sessionId)??0)+1);
      this.proximity.leave(client.sessionId);
      services.voice?.leave(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!player || this.revoked.has(client.sessionId)) return;
      player.connected = false; player.isMoving = false;
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
      const control = this.controls.get(client.sessionId)!;
      control.input = { seq: control.input.seq, x: 0, y: 0 }; control.lastInput = 0; control.nextCheck = Date.now() + AUTH_CHECK_MS;
    }
    onLeave(client: OfficeClient) {
      this.proximityRevision.delete(client.sessionId);
      this.proximity.leave(client.sessionId);this.proximityAt.delete(client.sessionId);
      services.voice?.leave(client.sessionId);
      this.chatPending.delete(client.sessionId); this.statusPending.delete(client.sessionId); this.statusAt.delete(client.sessionId);
      this.state.players.delete(client.sessionId); this.controls.delete(client.sessionId); this.revoked.delete(client.sessionId);
      if (client.auth) services.release(this.state.officeId, client.auth.userId, client.sessionId);
    }
    onDispose() { this.proximity.close();this.proximityAt.clear();for (const id of this.state.players.keys()) services.voice?.leave(id); this.controls.clear(); this.revoked.clear(); this.chatPending.clear(); this.statusPending.clear(); this.statusAt.clear(); services.disposed(this.state.officeId, this.roomId); }
  };
}
