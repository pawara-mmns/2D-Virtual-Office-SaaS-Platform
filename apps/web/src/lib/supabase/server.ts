import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authSetupMessage, getSupabaseConfig } from "./config";

export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error(authSetupMessage);
  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies; Proxy handles refresh.
          // Auth actions and confirmation handlers run in writable contexts.
        }
      },
    },
  });
}
