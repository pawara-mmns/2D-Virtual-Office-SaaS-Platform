import { randomUUID } from "node:crypto";
import type { Authorization, Authorize } from "../auth/authorize.ts";
import { VOICE_LEASE_MS, VOICE_TOKEN_SECONDS, type VoiceZoneState } from "../../../../packages/shared/src/voice.ts";
import type { VoiceProvider } from "./provider.ts";

export class VoiceError extends Error {
  constructor(public readonly status: 403 | 409 | 429 | 503, message: string) { super(message); }
}
type Session = { auth: Authorization; zone: string | null; version: number; room?: string; notify(state: VoiceZoneState): void; last?: string };
type RemovalReason = "notification_failed" | "authorization_changed" | "authorization_failed" | "lease_expired" | "session_ineligible" | "join_not_observed" | "zone_exit" | "office_left" | "client_leave" | "request_cancelled" | "admission_failed" | "shutdown";
type Admission = { session: string; auth: Authorization; room: string; identity: string; lease: number; issued: number; seen: boolean; revoked: boolean; refreshing: boolean; removing?: Promise<void>; removalReason?: RemovalReason };
export type VoiceDiagnostic = { event: string; at: string; authorityId: string; namespace?: string; participantId?: string; reason?: string; elapsedMs?: number; authorizationAgeMs?: number; leaseRemainingMs?: number; refreshing?: boolean };
export function createVoiceService(authorize: Authorize, provider: VoiceProvider | null, now = Date.now, report: (event: VoiceDiagnostic) => void = (event) => console.info("Voice authority.",JSON.stringify(event))) {
  const sessions = new Map<string, Session>(), active = new Map<string, Admission>(), counts = new Map<string, number>();
  const attempts = new Map<string, number>();
  let ready = false, closed = false, revision = 0, lastPoll = 0;
  let polling: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  const authorityId = randomUUID();
  const diagnostic = (event: string, record?: Admission, reason?: string, elapsedMs?: number, identity = record?.identity) => {
    // Only our random opaque participant identities are safe for cross-system
    // correlation. Never log Auth IDs/proofs, provider errors, names or emails.
    const participantId = identity && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identity) ? identity : undefined;
    try { report({event,at:new Date(now()).toISOString(),authorityId,participantId,reason,elapsedMs,
      ...(record ? {authorizationAgeMs:now()-record.auth.checkedAt,leaseRemainingMs:record.lease-now(),refreshing:record.refreshing} : {})}); } catch { /* Logging must never change authorization/cleanup. */ }
  };
  try { report({event:"authority_started",at:new Date(now()).toISOString(),authorityId,namespace:provider?.prefix}); } catch { /* Diagnostics only. */ }
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
          if (record?.session === id) void remove(record,"notification_failed");
        }
      }
    }
  };
  const remove = (record: Admission, reason: RemovalReason): Promise<void> => {
    if (!record.revoked) { record.removalReason = reason; diagnostic("removal_requested",record,reason); }
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
        diagnostic("removal_completed",record,record.removalReason);
        if (active.get(record.auth.userId) === record) active.delete(record.auth.userId);
      } catch { diagnostic("removal_failed",record,record.removalReason); if (ready) console.warn("Voice revocation unavailable; retrying. New voice access is paused."); ready = false; }
      finally { record.removing = undefined; notify(); }
    });
    return record.removing;
  };
  const refresh = async (record: Admission) => {
    if (record.refreshing || record.revoked) return;
    record.refreshing = true;
    const began = now();
    try {
      const session = sessions.get(record.session);
      const fresh = await authorize(session?.auth.token,record.auth.officeId);
      if (record.revoked || !eligible(record) || fresh.userId !== record.auth.userId || fresh.organizationId !== record.auth.organizationId || now() >= fresh.expiresAt) { await remove(record,"authorization_changed"); return; }
      record.auth = fresh; record.lease = fresh.checkedAt+VOICE_LEASE_MS;
      diagnostic("authorization_renewed",record,undefined,now()-began);
    } catch { diagnostic("authorization_failed",record,undefined,now()-began); await remove(record,"authorization_failed"); }
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
            if (record) await remove(record,now() >= record.lease ? "lease_expired" : "session_ineligible");
            else {
              diagnostic("orphan_removal_requested",undefined,"unknown_admission",undefined,identity);
              await media.remove(room,identity,BigInt(Math.ceil(now()/1000)+2));
              diagnostic("orphan_removal_completed",undefined,"unknown_admission",undefined,identity);
            }
          } else record.seen = true;
        }
      }
      ready = ![...active.values()].some((item) => item.revoked);
      lastPoll = now();
    } catch { diagnostic("inventory_failed"); ready = false; }
    })().finally(() => { polling = undefined; notify(); });
    return polling;
  };
  const check = () => {
    for (const record of active.values()) {
      if (record.revoked || !eligible(record) || now() >= record.lease || !record.seen && now()-record.issued > (VOICE_TOKEN_SECONDS+2)*1000) void remove(record,!eligible(record) ? "session_ineligible" : now() >= record.lease ? "lease_expired" : "join_not_observed");
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
      if (record?.session === id && !zone) void remove(record,"zone_exit");
      notify(id);
    },
    leave(id: string) {
      sessions.delete(id);
      for (const record of active.values()) if (record.session === id) void remove(record,"office_left");
      attempts.delete(id);
    },
    async revoke(id: string) {
      const session = sessions.get(id); if (session) session.version = ++revision;
      const record = [...active.values()].find((item) => item.session === id);
      if (record) await remove(record,"client_leave");
    },
    checkpoint(id: string) { return sessions.get(id)?.version; },
    async cancel(auth: Authorization, id: string) {
      const session = sessions.get(id);
      if (!session || session.auth.userId !== auth.userId || session.auth.officeId !== auth.officeId || session.auth.organizationId !== auth.organizationId) return;
      session.version = ++revision;
      const record = active.get(auth.userId);
      if (record?.session === id) await remove(record,"request_cancelled");
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
        diagnostic("admission_issued",record);
        return { url: provider.url, token };
      } catch (error) { await remove(record,"admission_failed"); if (error instanceof VoiceError) throw error; throw new VoiceError(503,"Voice access could not be created. Retry shortly."); }
    },
    poll, check,
    close() {
      if (closing) return closing;
      closed = true; clearInterval(leaseTimer); clearInterval(authTimer); clearInterval(pollTimer);
      sessions.clear(); attempts.clear();
      diagnostic("authority_stopping");
      closing = Promise.all([...active.values()].map(record => remove(record,"shutdown"))).then(() => {});
      return closing;
    },
  };
}
export type VoiceService = ReturnType<typeof createVoiceService>;
