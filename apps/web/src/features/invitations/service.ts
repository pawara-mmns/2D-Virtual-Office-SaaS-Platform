import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import type { Json } from "../../lib/supabase/database.types.ts";
import { isOrganizationId, isOrganizationRole, type OrganizationRole } from "../organizations/validation.ts";
import { TeamError, teamDataError } from "./errors.ts";
import { createInvitationToken, invitationTokenHash } from "./token.ts";
import { deliverInvitationEmail, requireInvitationEmailConfig, type InvitationEmail } from "./email.ts";
import { pageSize, requireIdentifier, validateInvite, type InvitationLink } from "./validation.ts";
import { requireInvitationLinkOrigin } from "./delivery-config.ts";

export type TeamClient = SupabaseClient<Database>;
export function object(value: Json | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TeamError("The team service returned an unexpected response.");
  return value;
}
export function text(value: Json | undefined): string {
  if (typeof value !== "string") throw new TeamError("The team service returned an unexpected response.");
  return value;
}
export type Member = { id: string; user_id: string; role: OrganizationRole; status: string; joined_at: string; display_name: string; email: string | null };
export async function listOrganizationMembers(client: TeamClient, org: string, page: number) {
  const { data, error } = await client.rpc("list_organization_members", { p_org: requireIdentifier(org), p_offset: (page - 1) * pageSize });
  if (error) teamDataError(error.code);
  const result = object(data);
  if (!Array.isArray(result.members) || typeof result.active_count !== "number" || typeof result.reserved_count !== "number") throw new TeamError("The team service returned an unexpected response.");
  const members: Member[] = result.members.map((value) => {
    const member = object(value);
    if (!isOrganizationRole(member.role)) throw new TeamError("The team service returned an unexpected role.");
    return { id: text(member.id), user_id: text(member.user_id), role: member.role, status: text(member.status),
      joined_at: text(member.joined_at), display_name: text(member.display_name), email: member.email === null ? null : text(member.email) };
  });
  return { members: members.slice(0, pageSize), hasNext: members.length > pageSize, activeCount: result.active_count, reservedCount: result.reserved_count };
}
export async function listPendingInvitations(client: TeamClient, org: string, page: number) {
  const { data, error } = await client.from("organization_invitations")
    .select("id,email,invited_role,expires_at,accepted_at,revoked_at,delivery_status,last_delivery_at,created_at")
    .eq("organization_id", requireIdentifier(org)).order("created_at", { ascending: false }).order("id")
    .range((page - 1) * pageSize, page * pageSize);
  if (error) teamDataError(error.code);
  return { invitations: data.slice(0, pageSize), hasNext: data.length > pageSize };
}
function deliveryPayload(data: Json): InvitationEmail {
  const row = object(data);
  if (!isOrganizationId(row.id) || typeof row.version !== "number" || !["ADMIN", "MEMBER"].includes(text(row.role))) throw new TeamError("The invitation response could not be read. Refresh before retrying.");
  return { id: row.id, version: row.version, email: text(row.email), organization_name: text(row.organization_name),
    role: text(row.role), expires_at: text(row.expires_at), inviter_name: row.inviter_name === null ? null : text(row.inviter_name) };
}
async function sendAndRecord(client: TeamClient, org: string, data: Json, token: string, config: ReturnType<typeof requireInvitationEmailConfig>, deliver = deliverInvitationEmail) {
  const invite = deliveryPayload(data);
  let providerId: string;
  try { providerId = await deliver(config, invite, token); }
  catch (error) {
    // A lost response may already have been accepted by the provider. Never
    // claim no delivery or retry blindly. A manual resend rotates the token.
    try { await client.rpc("record_invitation_delivery", { p_org: org, p_invitation: invite.id, p_version: invite.version, p_status: "failed" }); } catch { /* Preserve the accurate delivery failure. */ }
    throw error;
  }
  const recorded = await client.rpc("record_invitation_delivery", { p_org: org, p_invitation: invite.id, p_version: invite.version, p_status: "sent", p_provider_id: providerId });
  if (recorded.error || !recorded.data) throw new TeamError("The email provider accepted the email, but its invitation status could not be confirmed. Refresh before resending; the link may have changed.");
}
async function createInvitation(client: TeamClient, org: string, email: unknown, role: unknown) {
  const input = validateInvite(email, role);
  if (!input.valid) throw new TeamError("Enter a valid email address and an allowed role.");
  const secret = createInvitationToken();
  const { data, error } = await client.rpc("create_organization_invitation", { p_org: requireIdentifier(org), p_email: input.email, p_role: input.role, p_token_hash: secret.hash });
  if (error) teamDataError(error.code);
  return { data, token: secret.token };
}
async function rotateInvitation(client: TeamClient, org: string, id: string) {
  const secret = createInvitationToken();
  const { data, error } = await client.rpc("resend_organization_invitation", { p_org: requireIdentifier(org), p_invitation: requireIdentifier(id), p_token_hash: secret.hash });
  if (error) teamDataError(error.code);
  return { data, token: secret.token };
}
// Dependency parameters exercise email failure boundaries without external calls.
// Production callers always use real defaults. Tokens never enter RPC payloads.
export async function inviteOrganizationMember(client: TeamClient, org: string, email: unknown, role: unknown,
  config = requireInvitationEmailConfig(), deliver = deliverInvitationEmail) {
  const invitation = await createInvitation(client, org, email, role);
  await sendAndRecord(client, org, invitation.data, invitation.token, config, deliver);
}
export async function resendInvitation(client: TeamClient, org: string, id: string, config = requireInvitationEmailConfig(), deliver = deliverInvitationEmail) {
  const invitation = await rotateInvitation(client, org, id);
  await sendAndRecord(client, org, invitation.data, invitation.token, config, deliver);
}
function directLink(origin: string, invitation: { data: Json; token: string }): InvitationLink {
  const invite = deliveryPayload(invitation.data);
  const expiry = new Date(invite.expires_at);
  if (!Number.isFinite(expiry.getTime())) throw new TeamError("The invitation expiry could not be read. Refresh before regenerating its link.");
  return { url: `${origin}/invite/${invitation.token}`, expiresAt: expiry.toISOString() };
}
export async function createDirectInvitationLink(client: TeamClient, org: string, email: unknown, role: unknown) {
  const origin = requireInvitationLinkOrigin(); // Must fail before any database write, including in production.
  return directLink(origin, await createInvitation(client, org, email, role));
}
export async function regenerateDirectInvitationLink(client: TeamClient, org: string, id: string) {
  const origin = requireInvitationLinkOrigin();
  return directLink(origin, await rotateInvitation(client, org, id));
}
export async function revokeInvitation(client: TeamClient, org: string, id: string) {
  const { error } = await client.rpc("revoke_organization_invitation", { p_org: requireIdentifier(org), p_invitation: requireIdentifier(id) });
  if (error) teamDataError(error.code);
}
export type InvitationPreview = { organizationName: string; role: string; expiresAt: string; state: string; emailMatches: boolean };
export async function previewInvitation(client: TeamClient, token: unknown): Promise<InvitationPreview | null> {
  const { data, error } = await client.rpc("preview_organization_invitation", { p_token_hash: invitationTokenHash(token) });
  if (error) teamDataError(error.code);
  if (data === null) return null;
  const row = object(data);
  return { organizationName: text(row.organization_name), role: text(row.role), expiresAt: text(row.expires_at), state: text(row.state), emailMatches: row.email_matches === true };
}
export async function acceptInvitation(client: TeamClient, token: unknown) {
  const { data, error } = await client.rpc("accept_organization_invitation", { p_token_hash: invitationTokenHash(token) });
  if (error) teamDataError(error.code);
  if (!isOrganizationId(data)) throw new TeamError("The invitation response could not be read. Refresh before retrying.");
  return data;
}
