import { randomUUID } from "node:crypto";
import type { Authorization, Authorize } from "../auth/authorize.ts";
import { VOICE_LEASE_MS, VOICE_TOKEN_SECONDS, type VoiceZoneState } from "../../../../packages/shared/src/voice.ts";
import type { VoiceProvider } from "./provider.ts";

export class VoiceError extends Error {
  constructor(public readonly status: 403 | 409 | 429 | 503, message: string) { super(message); }
}
type Session = { auth: Authorization; zone: string | null; version: number; room?: string; notify(state: VoiceZoneState): void; last?: string };
type Admission = { session: string; auth: Authorization; room: string; identity: string; lease: number; issued: number; seen: boolean; revoked: boolean; refreshing: boolean; removing?: Promise<void> };
export function createVoiceService(authorize: Authorize, provider: VoiceProvider | null, now = Date.now) {
  const sessions = new Map<string, Session>(), active = new Map<string, Admission>(), counts = new Map<string, number>();
  const attempts = new Map<string, number>();
  let ready = false, closed = false, revision = 0, lastPoll = 0;
  let polling: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  const eligible = (record: Admission) => {
    const session = sessions.get(record.session);
    return !!session?.zone && session.auth.userId === record.auth.userId && session.auth.organizationId === record.auth.organizationId &&
      session.auth.officeId === record.auth.officeId && now() < session.auth.expiresAt;
  };
  const notify = (only?: string) => {
    if (closed) return;
    const selected: Iterable<[string,Session]> = only ? sessions.has(only) ? [[only,sessions.get(only)!]] : [] : sessions;
    for (const [id, session] of selected) {
      const room = session.room;
      const state: VoiceZoneState = { sessionId: id, zone: session.zone, configured: !!provider && ready, participants: room && ready ? counts.get(room) ?? 0 : null };
      const key = JSON.stringify(state);
      if (session.last !== key) {
        session.last = key;
        try { session.notify(state); }
        catch {
          sessions.delete(id);
          const record = active.get(session.auth.userId);
          if (record?.session === id) void remove(record);
        }
      }
    }
  };
  const remove = (record: Admission): Promise<void> => {
    record.revoked = true;
    if (!provider) return Promise.resolve();
    if (record.removing) return record.removing;
    const media=provider;
    // Publish the promise before calling the provider. Timer, zone-exit and
    // shutdown callers all await one removal, including one already in flight.
    record.removing=Promise.resolve().then(async()=>{
      try {
        // Explicit future cutoff covers initial/refreshed tokens. New admission
        // gets a new opaque identity and cannot inherit this cutoff.
        await media.remove(record.room,record.identity,BigInt(Math.ceil(now()/1000)+2));
        if (active.get(record.auth.userId) === record) active.delete(record.auth.userId);
      } catch { if (ready) console.warn("Voice revocation unavailable; retrying. New voice access is paused."); ready = false; }
      finally { record.removing = undefined; notify(); }
    });
    return record.removing;
  };
  const refresh = async (record: Admission) => {
    if (record.refreshing || record.revoked) return;
    record.refreshing = true;
    try {
      const session = sessions.get(record.session);
      const fresh = await authorize(session?.auth.token,record.auth.officeId);
      if (record.revoked || !eligible(record) || fresh.userId !== record.auth.userId || fresh.organizationId !== record.auth.organizationId || now() >= fresh.expiresAt) { await remove(record); return; }
      record.auth = fresh; record.lease = fresh.checkedAt+VOICE_LEASE_MS;
    } catch { await remove(record); }
    finally { record.refreshing = false; }
  };
  const poll = (): Promise<void> => {
    if (!provider || closed) return Promise.resolve();
    if (polling) return polling;
    const media = provider;
    polling = (async () => {
    try {
      const rooms = await media.rooms();
      if (closed) return;
      counts.clear();
      for (const room of rooms) {
        const identities = await media.participants(room);
        if (closed) return;
        counts.set(room,identities.length);
        for (const identity of identities) {
          if (closed) return;
          const record = [...active.values()].find((item) => item.room === room && item.identity === identity);
          // Also cleans orphaned media after process restart, without relying on
          // lost in-memory state or short initial join token expiration.
          if (!record || record.revoked || !eligible(record) || now() >= record.lease) {
            await media.remove(room,identity,BigInt(Math.ceil(now()/1000)+2));
          } else record.seen = true;
        }
      }
      ready = ![...active.values()].some((item) => item.revoked);
      lastPoll = now();
    } catch { ready = false; }
    })().finally(() => { polling = undefined; notify(); });
    return polling;
  };
  const check = () => {
    for (const record of active.values()) {
      if (record.revoked || !eligible(record) || now() >= record.lease || !record.seen && now()-record.issued > (VOICE_TOKEN_SECONDS+2)*1000) void remove(record);
    }
  };
  // Security lease checks continue independently of a slow provider list request.
  const leaseTimer = setInterval(check,250); leaseTimer.unref();
  const authTimer = setInterval(() => { for (const record of active.values()) void refresh(record); },2000); authTimer.unref();
  const pollTimer = setInterval(() => { void poll(); },2000); pollTimer.unref();
  void poll();
  return {
    // A recent successful control-plane sweep is an availability indicator,
    // never proof of working audio, valid client admission or Cloud revocation.
    available: () => !!provider && ready && !closed && now() - lastPoll < 6000,
    observe(id: string, auth: Authorization, zone: string | null, send: Session["notify"]) {
      if (closed) return;
      const old = sessions.get(id);
      const room = old?.auth.officeId === auth.officeId && old.auth.organizationId === auth.organizationId ? old.room : provider?.room(auth);
      const version = old && old.zone === zone ? old.version : ++revision;
      sessions.set(id,{ auth, zone, room, version, notify: send, last: old?.last });
      const record = active.get(auth.userId);
      if (record?.session === id && !zone) void remove(record);
      notify(id);
    },
    leave(id: string) {
      sessions.delete(id);
      for (const record of active.values()) if (record.session === id) void remove(record);
      attempts.delete(id);
    },
    async revoke(id: string) {
      const session = sessions.get(id); if (session) session.version = ++revision;
      const record = [...active.values()].find((item) => item.session === id);
      if (record) await remove(record);
    },
    checkpoint(id: string) { return sessions.get(id)?.version; },
    async cancel(auth: Authorization, id: string) {
      const session = sessions.get(id);
      if (!session || session.auth.userId !== auth.userId || session.auth.officeId !== auth.officeId || session.auth.organizationId !== auth.organizationId) return;
      session.version = ++revision;
      const record = active.get(auth.userId);
      if (record?.session === id) await remove(record);
    },
    async join(auth: Authorization, sessionId: string, expectedVersion = sessions.get(sessionId)?.version) {
      if (!provider || !ready || closed) throw new VoiceError(503,"Voice is unavailable. Ask an administrator to check LiveKit configuration and connectivity.");
      const session = sessions.get(sessionId);
      if (!session?.zone || session.version !== expectedVersion || session.auth.userId !== auth.userId || session.auth.organizationId !== auth.organizationId || session.auth.officeId !== auth.officeId || now() >= session.auth.expiresAt || now() >= auth.expiresAt) throw new VoiceError(403,"Enter the meeting room with an active office connection before joining voice.");
      if (now()-(attempts.get(sessionId) ?? 0) < 2000) throw new VoiceError(429,"Wait a moment before joining voice again.");
      attempts.set(sessionId,now());
      if (active.has(auth.userId)) throw new VoiceError(409,"Leave the existing voice session before joining again.");
      if (now()-auth.checkedAt >= VOICE_LEASE_MS) throw new VoiceError(403,"Voice authorization expired. Retry from the meeting room.");
      const record: Admission = { session: sessionId, auth, room: provider.room(auth), identity: randomUUID(), lease: auth.checkedAt+VOICE_LEASE_MS, issued: now(), seen: false, revoked: false, refreshing: false };
      active.set(auth.userId,record); // Reserve before signing; concurrent joins fail.
      try {
        const token = await provider.token(auth,record.room,record.identity);
        if (closed || record.revoked || !eligible(record) || now() >= record.lease) throw new VoiceError(403,"Voice access ended. Re-enter the meeting room and retry.");
        return { url: provider.url, token };
      } catch (error) { await remove(record); if (error instanceof VoiceError) throw error; throw new VoiceError(503,"Voice access could not be created. Retry shortly."); }
    },
    poll, check,
    close() {
      if (closing) return closing;
      closed = true; clearInterval(leaseTimer); clearInterval(authTimer); clearInterval(pollTimer);
      sessions.clear(); attempts.clear();
      closing = Promise.all([...active.values()].map(remove)).then(() => {});
      return closing;
    },
  };
}
export type VoiceService = ReturnType<typeof createVoiceService>;
