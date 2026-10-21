// Only the current protected destination is accepted. No arbitrary URL parsing,
// percent decoding, host headers, or user-supplied post-auth destinations.
export function safeAuthDestination(value: unknown) {
  return value === "/dashboard" ? value : "/dashboard";
}

export function isTokenHash(value: unknown): value is string {
  // Supabase currently uses SHA-224 hashes with an optional PKCE prefix.
  // Treat the value as opaque, bounded URL-safe input; only verifyOtp validates it.
  return typeof value === "string" && /^[a-zA-Z0-9_-]{32,256}$/.test(value);
}

export function parseConfirmation(params: URLSearchParams) {
  if (["token_hash", "type", "next"].some((key) => params.getAll(key).length > 1)) {
    return null;
  }
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (!isTokenHash(tokenHash) || (type !== "email" && type !== "recovery")) return null;
  return { tokenHash, type, next: safeAuthDestination(params.get("next")) };
}

// The token is opaque proof, not an authorization flag. Supabase must verify it
// again at password submission. Keep it out of the reset URL and client props.
export const recoveryCookieName = "vo-recovery-token";
export const recoveryCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/reset-password",
  maxAge: 600,
};
