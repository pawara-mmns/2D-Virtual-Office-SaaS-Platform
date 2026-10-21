import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateOfficeMap } from "../../../packages/shared/src/map.ts";
import { realtimeConfig } from "./config/environment.ts";
import { supabaseAuthorizer } from "./auth/authorize.ts";
import { createRealtimeServer } from "./server.ts";

try {
  process.env.NODE_ENV ??= "production";
  const config = realtimeConfig(process.env);
  // Explicit cwd-independent path: the very same asset served to Phaser.
  const mapFile = process.env.OFFICE_MAP_PATH ?? resolve("../web/public/office/studio.json");
  const map = validateOfficeMap(JSON.parse(readFileSync(resolve(mapFile), "utf8")));
  const server = createRealtimeServer({ authorize: supabaseAuthorizer(config.url, config.key), map, origins: config.origins });
  await server.listen(config.port, "0.0.0.0");
  console.info(`Realtime office server listening on port ${config.port}.`);
} catch {
  console.error("Realtime server could not start. Check environment configuration, map path and port availability.");
  process.exitCode = 1;
}
