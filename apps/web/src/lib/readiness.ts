import { createReadinessCheck, supabaseReadiness } from "../../../../packages/shared/src/readiness.ts";
import { invitationAppOrigin, invitationDeliveryMode } from "../features/invitations/delivery-config.ts";
import { invitationEmailConfig } from "../features/invitations/email.ts";

// Used only by the server route. Public configuration is captured from Next's
// built values; no incoming request may select a probe destination.
export function createWebReadiness(env: Record<string, string | undefined>, supabase: { url: string; key: string } | null, fetcher: typeof fetch = fetch) {
  const production = env.NODE_ENV === "production";
  const origin = (value: string | undefined, local: boolean) => {
    try {
      const url = new URL(value ?? "");
      return url.origin === value && (url.protocol === "https:" || local && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) ? url.origin : null;
    } catch { return null; }
  };
  const publicRealtime = origin(env.NEXT_PUBLIC_REALTIME_URL, !production);
  const internalRealtime = origin(env.REALTIME_INTERNAL_URL || env.NEXT_PUBLIC_REALTIME_URL, true);
  let configured = false;
  try {
    const delivery = invitationDeliveryMode(env);
    configured = !!supabase && !!origin(supabase.url, !production) && !!origin(invitationAppOrigin(env) ?? undefined, !production) &&
      !!publicRealtime && !!internalRealtime && (delivery === "link" || !!invitationEmailConfig(env));
  } catch { /* Invalid production link mode stays unavailable. */ }
  return createReadinessCheck({
    configuration: () => configured,
    ...supabaseReadiness(supabase, fetcher),
    async realtime(signal) {
      if (!internalRealtime) return false;
      const response = await fetcher(`${internalRealtime}/ready`, { cache: "no-store", redirect: "error", signal });
      if (response.status !== 200) { await response.body?.cancel(); return false; }
      const data: unknown = await response.json();
      return !!data && typeof data === "object" && "status" in data && data.status === "ready";
    },
  });
}
