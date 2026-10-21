import type { SupabaseClient } from "@supabase/supabase-js";
import { isTokenHash } from "./links.ts";

type AuthApi = SupabaseClient["auth"];
type UserAuth = Pick<AuthApi, "getUser">;

export type UserLookup =
  | { status: "authenticated"; user: { id: string; email: string } }
  | { status: "anonymous" | "unverified" | "unavailable" };

// getUser contacts Supabase Auth. Never authorize from cookie getSession data.
export async function lookupVerifiedUser(auth: UserAuth): Promise<UserLookup> {
  try {
    const { data, error } = await auth.getUser();
    if (error) {
      return { status: !error.status || error.status >= 500 ? "unavailable" : "anonymous" };
    }
    if (!data.user) return { status: "anonymous" };
    if (!data.user.email_confirmed_at || !data.user.email || data.user.is_anonymous) {
      return { status: "unverified" };
    }
    return { status: "authenticated", user: { id: data.user.id, email: data.user.email } };
  } catch {
    return { status: "unavailable" };
  }
}

export async function applyRecoveryPassword(
  auth: Pick<AuthApi, "verifyOtp" | "updateUser" | "signOut">,
  tokenHash: unknown,
  password: string,
) {
  if (!isTokenHash(tokenHash)) return "invalid-link" as const;

  try {
    // Deliberately verify only on POST: email scanners cannot consume the token.
    // An existing login session never substitutes for valid recovery proof.
    const { data, error } = await auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (error || !data.session || !data.user?.email_confirmed_at) return "invalid-link" as const;

    const result = await auth.updateUser({ password });
    // A failed update has already consumed the one-time token; require a new link.
    if (result.error) {
      await auth.signOut({ scope: "local" });
      return result.error.code === "same_password" ? "same-password" as const : "update-failed" as const;
    }
    try {
      const { error: signOutError } = await auth.signOut({ scope: "global" });
      return signOutError ? "updated-signout-failed" as const : "updated" as const;
    } catch {
      return "updated-signout-failed" as const;
    }
  } catch {
    return "unavailable" as const;
  }
}
