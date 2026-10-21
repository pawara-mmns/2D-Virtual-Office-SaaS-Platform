import type { TeamClient } from "../invitations/service.ts";
import { requireIdentifier } from "../invitations/validation.ts";
import { TeamError, teamDataError } from "../invitations/errors.ts";

export async function updateMemberRole(client: TeamClient, org: string, member: string, role: unknown) {
  if (role !== "ADMIN" && role !== "MEMBER") throw new TeamError("Choose ADMIN or MEMBER. Ownership requires an explicit transfer.");
  const { error } = await client.rpc("update_organization_member_role", { p_org: requireIdentifier(org), p_member: requireIdentifier(member), p_role: role });
  if (error) teamDataError(error.code);
}
export async function removeMember(client: TeamClient, org: string, member: string) {
  const { error } = await client.rpc("remove_organization_member", { p_org: requireIdentifier(org), p_member: requireIdentifier(member) });
  if (error) teamDataError(error.code);
}
export async function transferOwnership(client: TeamClient, org: string, member: string, confirmation: unknown) {
  if (typeof confirmation !== "string" || !confirmation || confirmation.length > 80) throw new TeamError("Enter the workspace name to confirm ownership transfer.");
  const { error } = await client.rpc("transfer_organization_ownership", { p_org: requireIdentifier(org), p_member: requireIdentifier(member), p_confirmation: confirmation });
  if (error) teamDataError(error.code);
}
