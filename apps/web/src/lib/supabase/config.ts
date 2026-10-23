export const authSetupMessage =
  "Authentication is not configured. Add the Supabase URL and publishable key to apps/web/.env.local, then restart the web application.";

export function getSupabaseConfig() {
  // Direct references allow Next.js to inline these public values in the browser.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key || !key.startsWith("sb_publishable_")) return null;

  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (
      (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname !== "/"
    ) return null;

    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}
