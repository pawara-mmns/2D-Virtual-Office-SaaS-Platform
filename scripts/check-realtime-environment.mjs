// Safe, read-only diagnostics: never print configuration values or credentials.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const root = resolve(import.meta.dirname, "..");
const web = resolve(root, "apps/web");
const require = createRequire(resolve(web, "package.json"));
const requireNext = createRequire(require.resolve("next/package.json"));
const { loadEnvConfig } = requireNext("@next/env");
const loaded = loadEnvConfig(web, true, { info() {}, error() {} });
const env = loaded.combinedEnv;
console.info(JSON.stringify({
  webEnvFiles: loaded.loadedEnvFiles.map((file) => file.path),
  supabaseUrlPresent: !!env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKeyPresent: !!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  expectedDevelopmentProject: env.NEXT_PUBLIC_SUPABASE_URL ? new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname === "rofutnholbtdmxccrkbs.supabase.co" : false,
  realtimeUrlPresent: !!env.NEXT_PUBLIC_REALTIME_URL,
  dedicatedTestLoginPresent: !!env.AUTH_TEST_EMAIL && !!env.AUTH_TEST_PASSWORD,
  dedicatedTestUserTrioPresent: !!env.ORG_TEST_USER_A && !!env.ORG_TEST_USER_B && !!env.ORG_TEST_USER_C,
}));
const file = resolve(root, "apps/realtime/.env");
const realtime = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
console.info(JSON.stringify({ realtimeEnvFilePresent: existsSync(file), supabaseUrlPresent: !!realtime.SUPABASE_URL,
  publishableKeyPresent: !!realtime.SUPABASE_PUBLISHABLE_KEY,
  matchesWebProject: !!realtime.SUPABASE_URL && realtime.SUPABASE_URL === env.NEXT_PUBLIC_SUPABASE_URL,
}));
