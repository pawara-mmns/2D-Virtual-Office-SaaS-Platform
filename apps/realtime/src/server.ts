import { defineServer, defineRoom, matchMaker } from "colyseus";
import { OfficeTransport } from "./transport.ts";
import type { OfficeMap } from "../../../packages/shared/src/map.ts";
import { mapVersion } from "../../../packages/shared/src/protocol.ts";
import { AccessDenied, type Authorize } from "./auth/authorize.ts";
import { createAdmission } from "./rooms/admission.ts";
import { officeRoomClass } from "./rooms/office-room.ts";
import type { Request, Response } from "express";
import type { ChatStore } from "./chat/store.ts";
import { VoiceError, type VoiceService } from "./voice/service.ts";
import { validVoiceRequest } from "../../../packages/shared/src/voice.ts";

export function createRealtimeServer(options: { authorize: Authorize; map: OfficeMap; origins: string[]; chat?: ChatStore; voice?: VoiceService }) {
  const admission = createAdmission();
  const OfficeRoom = officeRoomClass({ ...admission, authorize: options.authorize, map: options.map, chat: options.chat, voice: options.voice });
  const origins = new Set(options.origins);
  matchMaker.controller.exposedMethods = [];
  matchMaker.controller.DEFAULT_CORS_HEADERS = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Credentials": "false", "Access-Control-Allow-Origin": "null", "Access-Control-Max-Age": "600",
  };
  matchMaker.controller.getCorsHeaders = (headers): Record<string, string> => {
    const origin = headers.get("origin");
    return origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {};
  };
  // Only bounded counters, no tokens/IP logs; don't trust forwarded IP headers.
  const requests = new Map<string, { count: number; at: number }>();
  const server = defineServer({
    greet: false, devMode: false, auth: false,
    // Library error objects can include request data: never forward them to logs.
    logger: { debug() {}, trace() {}, info() {}, warn() { console.warn("Realtime library warning."); }, error() { console.error("Realtime library error."); } },
    transport: new OfficeTransport({
      maxPayload: 12_288, pingInterval: 3000, pingMaxRetries: 2,
      beforeUpgrade(request) {
        if (!origins.has(request.headers.get("origin") ?? "")) return new Response(null, { status: 403 });
        const query = new URL(request.url).searchParams;
        if (query.has("_authToken") || query.has("reconnectionToken")) return new Response(null, { status: 403 });
      },
    }),
    rooms: { office: defineRoom(OfficeRoom) },
    express(app) {
      app.disable("x-powered-by");
      app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok" }));
      // Authenticated server-to-server validation from the web route. The caller
      // supplies identity proof, never trusted coordinates or zone assertions.
      app.post("/voice/token", async (req: Request, res: Response) => {
        res.setHeader("Cache-Control","private, no-store"); res.setHeader("Referrer-Policy","no-referrer");
        if (!origins.has(req.get("origin") ?? "")) { res.status(403).json({ error: "Voice origin denied." }); return; }
        const address = `voice:${req.socket.remoteAddress ?? "unknown"}`, now = Date.now();
        for (const [id,item] of requests) if (now-item.at>=60_000) requests.delete(id);
        const rate = requests.get(address) ?? {count:0,at:now};
        if (requests.size>=1000 && !requests.has(address) || ++rate.count>30) { res.status(429).json({error:"Wait a minute before retrying voice."}); return; }
        requests.set(address,rate);
        try {
          if (!req.is("application/json")) { res.status(415).json({ error: "JSON required." }); return; }
          let text = "", bytes = 0;
          for await (const chunk of req) { bytes += Buffer.byteLength(chunk); if (bytes > 1024) { res.status(413).json({ error: "Request too large." }); return; } text += chunk.toString(); }
          const body: unknown = JSON.parse(text);
          if (!validVoiceRequest(body)) { res.status(400).json({ error: "Invalid voice request." }); return; }
          const version = options.voice?.checkpoint(body.sessionId);
          const header = req.get("authorization");
          const auth = await options.authorize(header?.startsWith("Bearer ") ? header.slice(7) : undefined,body.officeId);
          if (res.destroyed) return;
          if (!options.voice) throw new VoiceError(503,"Voice is not configured.");
          const voice = options.voice;
          const cancelled = () => { if (!res.writableEnded) void voice.cancel(auth,body.sessionId); };
          res.once("close",cancelled);
          const admission = await voice.join(auth,body.sessionId,version);
          if (res.destroyed) { await voice.cancel(auth,body.sessionId); return; }
          res.json(admission);
        } catch (error) {
          if (error instanceof VoiceError) res.status(error.status).json({ error: error.message });
          else if (error instanceof SyntaxError) res.status(400).json({ error: "Invalid voice request." });
          else res.status(403).json({ error: "Voice access denied. Verify your session and active membership." });
        }
      });
      app.post("/office/join", async (req: Request, res: Response) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Vary", "Origin");
        if (!origins.has(req.get("origin") ?? "")) { res.status(403).json({ error: "Origin denied." }); return; }
        const now = Date.now(), address = req.socket.remoteAddress ?? "unknown";
        for (const [id, item] of requests) if (now - item.at >= 60_000) requests.delete(id);
        const rate = requests.get(address) ?? { count: 0, at: now };
        if (requests.size >= 1000 && !requests.has(address) || ++rate.count > 30) { res.status(429).json({ error: "Wait a minute before retrying." }); return; }
        requests.set(address, rate);
        try {
          if (!req.is("application/json")) { res.status(415).json({ error: "JSON required." }); return; }
          let text = "", bytes = 0;
          for await (const chunk of req) {
            bytes += Buffer.byteLength(chunk);
            if (bytes > 1024) { res.status(413).json({ error: "Request too large." }); return; }
            text += chunk.toString();
          }
          const body: unknown = JSON.parse(text);
          if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["officeId", "mapVersion"].includes(key))) { res.status(400).json({ error: "Invalid office request." }); return; }
          const input = body as { officeId?: unknown; mapVersion?: unknown };
          if (input.mapVersion !== mapVersion(options.map)) { res.status(409).json({ error: "Office map changed. Reload this page." }); return; }
          const header = req.get("authorization");
          const auth = await options.authorize(header?.startsWith("Bearer ") ? header.slice(7) : undefined, input.officeId);
          const seat = await admission.reserve(auth);
          res.json(seat);
        } catch (error) {
          if (error instanceof AccessDenied) res.status(403).json({ error: error.message });
          else if (error instanceof SyntaxError) res.status(400).json({ error: "Invalid office request." });
          else res.status(409).json({ error: "Unable to enter. This account may already be connected, the office may be full, or access could not be verified. Close other office tabs, wait ten seconds and retry." });
        }
      });
    },
  });
  return server;
}
