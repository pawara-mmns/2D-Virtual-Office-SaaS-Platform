import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/server";
import { getOrganizationById, getOrganizationMembership } from "@/features/organizations/server";
import { isOrganizationId, isOrganizationRole } from "@/features/organizations/validation";
import { WorkspaceShell } from "@/features/organizations/workspace-shell";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { listOrganizationMembers, listPendingInvitations } from "@/features/invitations/service";
import { teamErrorMessage } from "@/features/invitations/errors";
import { invitationDeliveryMode } from "@/features/invitations/delivery-config";
import { pageNumber } from "@/features/invitations/validation";
import { InviteMember, MemberActions, InvitationsTable, TeamPagination } from "@/features/members/team-management";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team members | Virtual Office", robots: { index: false, follow: false } };
export default async function MembersPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ page?: string; invitations?: string }> }) {
  const user = await requireUser();
  const { organizationId: org } = await params;
  if (!isOrganizationId(org)) notFound();
  const [organization, membership] = await Promise.all([getOrganizationById(org), getOrganizationMembership(org)]);
  if (!organization || !membership || !isOrganizationRole(membership.role)) notFound();
  const role = membership.role;
  const query = await searchParams;
  const page = pageNumber(query.page);
  const invitationPage = pageNumber(query.invitations);
  let result;
  try {
    const deliveryMode = invitationDeliveryMode();
    const client = await createClient<Database>();
    const [members, invites] = await Promise.all([
      listOrganizationMembers(client, org, page), role !== "MEMBER" ? listPendingInvitations(client, org, invitationPage) : Promise.resolve({ invitations: [], hasNext: false }),
    ]);
    result = { deliveryMode, members: members.members, activeCount: members.activeCount, reservedCount: members.reservedCount,
      membersNext: members.hasNext, invitations: invites.invitations, invitesNext: invites.hasNext };
  } catch (error) {
    return <WorkspaceShell email={user.email}><Link href={`/workspace/${org}`} className="auth-text-link">Back to workspace</Link><h1 className="mt-7 text-3xl font-semibold">Team unavailable</h1><p role="alert" className="ui-notice ui-notice-error mt-4 max-w-xl">{teamErrorMessage(error)}</p></WorkspaceShell>;
  }
  return <WorkspaceShell email={user.email}>
    <Link href={`/workspace/${org}`} className="auth-text-link">Back to workspace</Link>
    <div className="mt-7 flex flex-wrap items-start justify-between gap-5"><div><p className="text-sm text-muted">{organization.name}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Team members</h1><p className="mt-3 text-sm text-muted">{result.activeCount} active · {result.reservedCount} invited · 10 seats</p></div>
      {role !== "MEMBER" && <a href="#invite-member" className="auth-text-link">Invite member</a>}
    </div>
    <InviteMember org={org} role={role} deliveryMode={result.deliveryMode} />
    <section aria-labelledby="members-heading" className="mt-10"><h2 id="members-heading" className="mb-4 text-lg font-semibold">Members</h2>
      <p className="mb-5 text-sm leading-6 text-muted">Changes apply to new workspace requests immediately. Member email addresses are visible to owners and admins.</p>
      {result.members.length === 0 ? <p className="team-panel text-sm text-muted">No members on this page.</p> : <div className="team-table-wrap"><table className="team-table"><caption className="sr-only">Workspace member directory</caption>
        <thead><tr><th scope="col">Member</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Joined (UTC)</th><th scope="col">Actions</th></tr></thead>
        <tbody>{result.members.map((member) => <tr key={member.id}><td><span className="block font-medium">{member.display_name}{member.user_id === user.id ? " (you)" : ""}</span>{member.email && <span className="mt-1 block break-all text-xs text-muted">{member.email}</span>}</td><td>{member.role}</td><td>{member.status === "ACTIVE" ? "Active" : "Inactive"}</td><td>{new Date(member.joined_at).toLocaleDateString("en-GB", { timeZone: "UTC" })}</td><td><MemberActions member={member} actorId={user.id} actorRole={role} org={org} orgName={organization.name} /></td></tr>)}</tbody>
      </table></div>}
    </section>
    {role !== "MEMBER" && <section aria-labelledby="invitations-heading" className="mt-10"><h2 id="invitations-heading" className="mb-4 text-lg font-semibold">Invitations</h2><p className="mb-5 text-sm leading-6 text-muted">Pending invitations reserve a seat until accepted, revoked, or expired. Admins see MEMBER invitations only.{result.deliveryMode === "link" && " Link mode sends no email; the Email column records provider acceptance only."}</p><InvitationsTable invitations={result.invitations} org={org} deliveryMode={result.deliveryMode} /></section>}
    <TeamPagination org={org} page={page} invitationPage={invitationPage} membersNext={result.membersNext} invitesNext={result.invitesNext} />
  </WorkspaceShell>;
}
