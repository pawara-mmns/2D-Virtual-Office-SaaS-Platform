import { isOrganizationId } from "../organizations/validation.ts";

type Organization = { id: string; name: string; status: string };
type Membership = { organization_id: string; status: string; role: string };
type Office = { id: string; organization_id: string; name: string };
export type OfficeAccessSource = {
  organization(id: string): Promise<Organization | null>;
  membership(id: string): Promise<Membership | null>;
  office(id: string): Promise<Office | null>;
};
// The production adapter uses requireUser-backed, RLS-scoped server queries.
// Fetch office data only after both tenant and active membership checks succeed.
export async function resolveOfficeAccess(id: string, source: OfficeAccessSource) {
  if (!isOrganizationId(id)) return { status: "denied" } as const;
  const [organization, membership] = await Promise.all([source.organization(id), source.membership(id)]);
  if (!organization || organization.id !== id || organization.status !== "ACTIVE" || !membership || membership.organization_id !== id || membership.status !== "ACTIVE" || !["OWNER", "ADMIN", "MEMBER"].includes(membership.role)) return { status: "denied" } as const;
  const office = await source.office(id);
  if (!office || office.organization_id !== id || !isOrganizationId(office.id)) return { status: "unavailable" } as const;
  return { status: "allowed", organization, office } as const;
}
