// Kept dependency-free so Auth can preserve only this fixed local destination.
export const invitationCookieName = "vo-invitation";
export function isInvitationToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
export const invitationCookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const,
  path: "/", maxAge: 7 * 24 * 60 * 60,
};
export function postLoginDestination(pendingToken: unknown) {
  return isInvitationToken(pendingToken) ? "/invite" : "/dashboard";
}
