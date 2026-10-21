export function realtimeConfig(env: NodeJS.ProcessEnv) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_PUBLISHABLE_KEY;
  const origins = (env.REALTIME_ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map((value) => value.trim());
  const port = Number(env.PORT ?? 2567);
  if (!url || !key || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Configure realtime Supabase URL, publishable key and port.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) throw new Error("Supabase must use HTTPS.");
  for (const origin of origins) {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.origin !== origin || !["https:", "http:"].includes(parsedOrigin.protocol) || env.NODE_ENV === "production" && parsedOrigin.protocol !== "https:") throw new Error("Configure exact trusted realtime origins; HTTPS in production.");
  }
  if (key.startsWith("sb_secret_")) throw new Error("Use only the Supabase publishable key.");
  if (!key.startsWith("sb_publishable_")) {
    try { if (JSON.parse(Buffer.from(key.split(".")[1]!, "base64url").toString()).role !== "anon") throw new Error(); }
    catch { throw new Error("Use only a Supabase publishable or legacy anon key."); }
  }
  return { url, key, port, origins };
}
