import { TeamError } from "./errors.ts";

export function invitationDeliveryMode(env: Record<string, string | undefined> = process.env): "email" | "link" {
  const mode = env.INVITATION_DELIVERY_MODE?.trim() || "email";
  if (mode === "email") return mode;
  if (mode === "link" && (env.NODE_ENV === "development" || env.NODE_ENV === "test")) return mode;
  throw new TeamError("Invitation delivery configuration is invalid. Link mode is allowed only in development or test; use email mode in production.");
}

export function invitationAppOrigin(env: Record<string, string | undefined> = process.env) {
  try {
    const url = new URL(env.APP_URL?.trim() || "");
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function requireInvitationLinkOrigin() {
  if (invitationDeliveryMode() !== "link") throw new TeamError("Direct invitation links are disabled. Use the configured email invitation action.");
  const origin = invitationAppOrigin();
  if (!origin) throw new TeamError("Configure APP_URL as the trusted application origin before creating invitation links.");
  return origin;
}
