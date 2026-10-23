import { DisconnectReason } from "livekit-client";

// A removal is evidence of a RoomService action, not proof that membership was
// revoked. Never render arbitrary SDK/provider text (it may contain credentials).
export function voiceDisconnect(reason: unknown) {
  const name = typeof reason === "number" && typeof DisconnectReason[reason] === "string" ? DisconnectReason[reason] : "UNKNOWN_REASON";
  let message = "Voice connection was lost unexpectedly. Check your connection and join voice again.";
  switch (reason) {
    case DisconnectReason.PARTICIPANT_REMOVED:
      message = "The voice service removed this session. Re-enter the meeting room and join again. If this continues, ask an administrator to check the voice authorization logs."; break;
    case DisconnectReason.CLIENT_INITIATED:
      message = "Voice session ended on this device. Join voice again when ready."; break;
    case DisconnectReason.DUPLICATE_IDENTITY:
      message = "Another connection replaced this voice session. Leave other voice sessions and join again."; break;
    case DisconnectReason.CONNECTION_TIMEOUT:
    case DisconnectReason.JOIN_FAILURE:
    case DisconnectReason.MEDIA_FAILURE:
      message = "Voice could not maintain its network connection. Check your network, VPN or firewall and join again."; break;
    case DisconnectReason.SERVER_SHUTDOWN:
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      message = "The voice room or service closed. Wait a moment, then join voice again."; break;
  }
  return { reason: name, message };
}
