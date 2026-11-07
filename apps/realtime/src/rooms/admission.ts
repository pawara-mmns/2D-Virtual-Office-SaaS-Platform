import { ENVIRONMENT_CHANGED_CODE } from "../../../../packages/shared/src/protocol.ts";
import { mapVersion } from "../../../../packages/shared/src/protocol.ts";
import type { OfficeMap } from "../../../../packages/shared/src/map.ts";
import { matchMaker } from "colyseus";
import type { Authorization } from "../auth/authorize.ts";
import type { OfficeState } from "../state/office-state.ts";
import {structureVersion} from '../../../../packages/shared/src/environment/live-decoration.ts';
// Single persistent process by design. Per-office queues cover creation AND seat
// reservation; a full canonical room never causes another room to be created.
export function createAdmission() {
  const rooms = new Map<string, string>();
  const queues = new Map<string, Promise<unknown>>();
  const claims = new Map<string, { sessionId?: string; until: number }>();
  const key = (officeId: string, userId: string) => `${officeId}/${userId}`;
  return {
    retireOffice(officeId: string) {
      const previous = queues.get(officeId) ?? Promise.resolve();
      const operation = previous.catch(() => {}).then(async () => {
        const roomId = rooms.get(officeId), local = roomId ? matchMaker.getLocalRoomById(roomId) : undefined;
        if (!local) return false;
        await local.disconnect(ENVIRONMENT_CHANGED_CODE);
        for (const id of claims.keys()) if (id.startsWith(officeId + '/')) claims.delete(id);
        return true;
      });
      queues.set(officeId, operation);
      void operation.finally(() => { if (queues.get(officeId) === operation) queues.delete(officeId); }).catch(() => {});
      return operation;
    },
    metrics() {
      let connectedUsers = 0, realtimeRooms = 0;
      for (const roomId of rooms.values()) {
        const room = matchMaker.getLocalRoomById(roomId);
        if (!room) continue;
        realtimeRooms++;
        connectedUsers += [...(room.state as OfficeState).players.values()].filter(p => p.connected).length;
      }
      return { connectedUsers, realtimeRooms };
    },
    claimed(officeId: string, userId: string, sessionId: string) { return claims.get(key(officeId, userId))?.sessionId === sessionId; },
    release(officeId: string, userId: string, sessionId: string) { if (claims.get(key(officeId, userId))?.sessionId === sessionId) claims.delete(key(officeId, userId)); },
    disposed(officeId: string, roomId: string) { if (rooms.get(officeId) === roomId) rooms.delete(officeId); },
    reserve(auth: Authorization, map?: OfficeMap) {
      const officeId = auth.officeId;
      const previous = queues.get(officeId) ?? Promise.resolve();
      const operation = previous.catch(() => {}).then(async () => {
        const claimKey = key(officeId, auth.userId);
        let current = claims.get(claimKey);
        const roomId = rooms.get(officeId);
        let local = roomId ? matchMaker.getLocalRoomById(roomId) : undefined;
        if (local && map && (local.state as OfficeState).mapVersion !== mapVersion(map) && (!(local.state as OfficeState).structureVersion||structureVersion(map)!==(local.state as OfficeState).structureVersion)) {
          await local.disconnect(ENVIRONMENT_CHANGED_CODE); local = undefined; current = undefined;
          for (const id of claims.keys()) if (id.startsWith(officeId+"/")) claims.delete(id);
        }
        const active = local && [...(local.state as OfficeState).players.values()].some((p) => p.userId === auth.userId);
        if (active || current && current.until > Date.now()) throw new Error("This account is already entering or connected. Close the other tab, or wait ten seconds and retry.");
        const listing = local ? await matchMaker.getRoomById(roomId!) : await matchMaker.createRoom("office", { officeId, map });
        rooms.set(officeId, listing.roomId);
        claims.set(claimKey, { until: Date.now() + 10_000 });
        try {
          const seat = await matchMaker.reserveSeatFor(listing, {}, auth);
          claims.set(claimKey, { sessionId: seat.sessionId, until: Date.now() + 10_000 });
          // Bound unused reservations even when a user never opens the socket.
          const timer = setTimeout(() => {
            const claim = claims.get(claimKey);
            const room = matchMaker.getLocalRoomById(listing.roomId);
            if (claim?.sessionId === seat.sessionId && !(room?.state as OfficeState | undefined)?.players.has(seat.sessionId)) claims.delete(claimKey);
          }, 10_100); timer.unref();
          return seat;
        } catch { claims.delete(claimKey); throw new Error("Office is full or temporarily unavailable."); }
      });
      queues.set(officeId, operation);
      void operation.finally(() => { if (queues.get(officeId) === operation) queues.delete(officeId); }).catch(() => {});
      return operation;
    },
  };
}
