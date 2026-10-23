import { isOrganizationId, type OrganizationRole } from "../organizations/validation.ts";

export type InvitedRole = "ADMIN" | "MEMBER";
export type InvitationLink = { url: string; expiresAt: string };
export type TeamFormState = { status: "idle" | "error" | "success"; message?: string; invitationLink?: InvitationLink };
export const pageSize = 25;
export function canInvite(actor: OrganizationRole, role: string): role is InvitedRole {
  return (actor === "OWNER" && (role === "ADMIN" || role === "MEMBER")) || (actor === "ADMIN" && role === "MEMBER");
}
export function canManageMember(actor: OrganizationRole, target: OrganizationRole, self: boolean) {
  return !self && target !== "OWNER" && (actor === "OWNER" || (actor === "ADMIN" && target === "MEMBER"));
}
export function validateInvite(email: unknown, role: unknown) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  return {
    email: normalized, role: role === "ADMIN" ? "ADMIN" as const : "MEMBER" as const,
    valid: normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && (role === "ADMIN" || role === "MEMBER"),
  };
}
export function requireIdentifier(value: unknown): string {
  if (!isOrganizationId(value)) throw new Error("Invalid team action identifier.");
  return value;
}
export function pageNumber(value: unknown) {
  return typeof value === "string" && /^\d{1,4}$/.test(value) ? Math.max(1, Math.min(1000, Number(value))) : 1;
}
export function invitationState(invitation: { accepted_at: string | null; revoked_at: string | null; expires_at: string }, now = Date.now()) {
  if (invitation.revoked_at) return "Revoked";
  if (invitation.accepted_at) return "Accepted";
  return Date.parse(invitation.expires_at) <= now ? "Expired" : "Pending";
}
