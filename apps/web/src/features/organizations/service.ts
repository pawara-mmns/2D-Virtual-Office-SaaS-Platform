import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { isOrganizationId, isOrganizationRole, validateOrganizationInput, type OrganizationRole } from "./validation.ts";

export type OrganizationClient = SupabaseClient<Database>;
export type UserOrganization = { id: string; name: string; slug: string; role: OrganizationRole };

export class OrganizationError extends Error {
  readonly kind: "setup" | "unavailable" | "input" | "forbidden" | "conflict";

  constructor(kind: OrganizationError["kind"]) {
    const messages = {
      setup: "Workspace setup is unavailable. Ask your workspace administrator for help.",
      unavailable: "The workspace service is unavailable. Please try again shortly.",
      input: "Check your workspace name and refresh the form before trying again.",
      forbidden: "You don’t have permission to perform this workspace action.",
      conflict: "We couldn’t allocate this workspace. Try again with a fresh form.",
    };
    super(messages[kind]);
    this.kind = kind;
  }
}

export function throwOrganizationDataError(error: Pick<PostgrestError, "code">): never {
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code)) throw new OrganizationError("setup");
  if (error.code === "42501") throw new OrganizationError("forbidden");
  if (error.code === "22023") throw new OrganizationError("input");
  if (error.code === "23505") throw new OrganizationError("conflict");
  throw new OrganizationError("unavailable");
}

export async function listUserOrganizations(client: OrganizationClient, verifiedUserId: string): Promise<UserOrganization[]> {
  const memberships = await client.from("organization_members")
    .select("organization_id,role").eq("user_id", verifiedUserId).eq("status", "ACTIVE");
  if (memberships.error) throwOrganizationDataError(memberships.error);
  if (!memberships.data.length) return [];
  const organizations = await client.from("organizations").select("id,name,slug")
    .in("id", memberships.data.map((member) => member.organization_id)).eq("status", "ACTIVE")
    .order("name").order("id");
  if (organizations.error) throwOrganizationDataError(organizations.error);
  const roles = new Map(memberships.data.map((member) => [member.organization_id, member.role]));
  return organizations.data.flatMap((organization) => {
    const role = roles.get(organization.id);
    if (role === undefined) return [];
    if (!isOrganizationRole(role)) throw new OrganizationError("unavailable");
    return [{ ...organization, role }];
  });
}

export async function provisionOrganization(client: OrganizationClient, name: unknown, requestId: unknown) {
  const input = validateOrganizationInput(name, requestId);
  if (!input.valid) throw new OrganizationError("input");
  // No user_id, role, slug or office payload is accepted from the browser.
  const { data, error } = await client.rpc("create_organization", { p_name: input.name, p_request_id: input.requestId });
  if (error) throwOrganizationDataError(error);
  if (!isOrganizationId(data)) throw new OrganizationError("unavailable");
  return data;
}
