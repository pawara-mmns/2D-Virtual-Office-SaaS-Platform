import type { IncomingMessage } from "node:http";
import { WebSocketTransport, WebSocketClient } from "@colyseus/ws-transport";
import { matchMaker, connectClientToRoom, createAuthContext, type AuthContext } from "colyseus";

// Use current exported transport extension points; no Room internals or patches.
export class OfficeTransport extends WebSocketTransport {
  protected async onConnection(raw: WebSocketClient["ref"] & { pingCount: number }, req: IncomingMessage, upgrade?: { url: URL; context: AuthContext }) {
    const protocol = req.headers["sec-websocket-protocol"];
    if (typeof protocol !== "string" || !protocol.startsWith("office-resume.")) return super.onConnection(raw, req, upgrade);
    const proof = protocol.slice("office-resume.".length);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(proof)) { raw.close(4000); return; }
    const url = upgrade?.url ?? new URL(req.url ?? "/", "http://localhost");
    const roomId = url.pathname.split("/").at(-1)!;
    const sessionId = url.searchParams.get("sessionId") ?? "";
    raw.pingCount = 0;
    raw.on("pong", () => { raw.pingCount = 0; });
    raw.on("error", () => {});
    const client = new WebSocketClient(sessionId, raw);
    try {
      await connectClientToRoom(matchMaker.getLocalRoomById(roomId), client,
        upgrade?.context ?? createAuthContext({ headers: req.headers as Record<string, string | undefined> }),
        { reconnectionToken: proof, skipHandshake: url.searchParams.has("skipHandshake") });
    } catch { client.error(403, "Office reconnection denied.", () => raw.close(4000)); }
  }
}
