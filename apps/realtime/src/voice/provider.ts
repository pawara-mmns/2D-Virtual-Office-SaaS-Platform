import { createHmac } from "node:crypto";
import { AccessToken, RoomServiceClient, TrackSource, ParticipantInfo_State } from "livekit-server-sdk";
import type { Authorization } from "../auth/authorize.ts";
import { VOICE_TOKEN_SECONDS } from "../../../../packages/shared/src/voice.ts";

export type VoiceProvider = {
  url: string; prefix: string;
  room(auth: Authorization): string;
  token(auth: Authorization, room: string, identity: string): Promise<string>;
  rooms(): Promise<string[]>;
  participants(room: string): Promise<string[]>;
  remove(room: string, identity: string, cutoff: bigint): Promise<void>;
};
export function voiceConfig(env: NodeJS.ProcessEnv) {
  if (![env.LIVEKIT_URL,env.LIVEKIT_API_KEY,env.LIVEKIT_API_SECRET].some(Boolean)) return null;
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) throw new Error("Complete server-only LiveKit configuration.");
  const url = new URL(env.LIVEKIT_URL);
  // This step deliberately supports Cloud only: strict token revocation is required.
  if (url.protocol !== "wss:" || !url.hostname.endsWith(".livekit.cloud") || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Configure a LiveKit Cloud WSS origin.");
  return { url: url.origin, key: env.LIVEKIT_API_KEY, secret: env.LIVEKIT_API_SECRET };
}
export function livekitProvider(config: NonNullable<ReturnType<typeof voiceConfig>>): VoiceProvider {
  const hash = (value: string) => createHmac("sha256",config.secret).update(value).digest("hex");
  const prefix = `vo1_${hash("virtual-office-voice").slice(0,12)}_`;
  const client = new RoomServiceClient(config.url.replace("wss:","https:"),config.key,config.secret,{ requestTimeout: 2, failover: false });
  return {
    url: config.url, prefix,
    room: (auth) => prefix+hash(`${auth.organizationId}/${auth.officeId}/Meeting Room`).slice(0,40),
    async token(auth, room, identity) {
      const token = new AccessToken(config.key,config.secret,{ identity, ttl: VOICE_TOKEN_SECONDS, name: auth.displayName, metadata: JSON.stringify({ avatarKey: auth.avatarKey }) });
      token.addGrant({ room, roomJoin: true, canSubscribe: true, canPublish: true, canPublishSources: [TrackSource.MICROPHONE],
        canPublishData: false, canUpdateOwnMetadata: false, roomAdmin: false, roomCreate: false, roomList: false, roomRecord: false });
      return token.toJwt();
    },
    async rooms() { return (await client.listRooms()).map((room) => room.name).filter((name) => name.startsWith(prefix)); },
    async participants(room) { return (await client.listParticipants(room)).filter((p) => p.state === ParticipantInfo_State.ACTIVE).map((p) => p.identity); },
    async remove(room, identity, cutoff) { await client.removeParticipant(room,identity,{ revokeTokenTs: cutoff }); },
  };
}
