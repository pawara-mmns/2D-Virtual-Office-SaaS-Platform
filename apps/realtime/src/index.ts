import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateOfficeMap } from "../../../packages/shared/src/map.ts";
import { realtimeConfig } from "./config/environment.ts";
import { supabaseAuthorizer } from "./auth/authorize.ts";
import { createRealtimeServer } from "./server.ts";
import { supabaseChatStore } from "./chat/store.ts";
import { voiceConfig, livekitProvider } from "./voice/provider.ts";
import { createVoiceService } from "./voice/service.ts";
import { createReadinessCheck, supabaseReadiness } from "../../../packages/shared/src/readiness.ts";

try {
  process.env.NODE_ENV ??= "production";
  const config = realtimeConfig(process.env);
  // The same asset served to Phaser. Default CWD is apps/realtime in both the
  // workspace and hosted start commands; override explicitly if relocating it.
  const mapFile = process.env.OFFICE_MAP_PATH ?? resolve("../web/public/office/studio.json");
  const map = validateOfficeMap(JSON.parse(readFileSync(resolve(mapFile), "utf8")));
  const authorize = supabaseAuthorizer(config.url,config.key);
  let provider = null;
  try { const media = voiceConfig(process.env); if (media) provider = livekitProvider(media); }
  catch { console.warn("Voice configuration is invalid; office movement and chat remain available."); }
  const voice = createVoiceService(authorize,provider);
  const readiness = createReadinessCheck({
    configuration: () => true, // Startup has validated required config and map.
    ...supabaseReadiness(config),
    voice: () => voice.available(),
  });
  const server = createRealtimeServer({ authorize, chat: supabaseChatStore(config.url, config.key), map, origins: config.origins, voice, readiness });
  await server.listen(config.port, "0.0.0.0");
  console.info(`Realtime office server listening on port ${config.port}.`);
} catch {
  console.error("Realtime server could not start. Check environment configuration, map path and port availability.");
  process.exitCode = 1;
}
