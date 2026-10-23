import { requireUser } from "@/features/auth/server";
import { getOrganizationMembership } from "@/features/organizations/server";
import { isOrganizationRole } from "@/features/organizations/validation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { TeamError } from "@/features/invitations/errors";

export async function teamContext(org: string, managerOnly = false) {
  const user = await requireUser();
  const membership = await getOrganizationMembership(org);
  if (!membership || !isOrganizationRole(membership.role) || (managerOnly && membership.role === "MEMBER")) {
    throw new TeamError("You do not have permission to access this team action.");
  }
  return { user, membership, role: membership.role, client: await createClient<Database>() };
}
