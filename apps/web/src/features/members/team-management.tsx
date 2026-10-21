import Link from "next/link";
import { teamAction } from "./actions";
import { TeamActionForm } from "./action-form";
import type { Member } from "@/features/invitations/service";
import { canManageMember, invitationState } from "@/features/invitations/validation";
import type { OrganizationRole } from "@/features/organizations/validation";

function Context({ org, operation, member, invitation }: { org: string; operation: string; member?: string; invitation?: string }) {
  return <><input type="hidden" name="organizationId" value={org} /><input type="hidden" name="operation" value={operation} />
    {member && <input type="hidden" name="memberId" value={member} />}{invitation && <input type="hidden" name="invitationId" value={invitation} />}</>;
}
export function InviteMember({ org, role, deliveryMode }: { org: string; role: OrganizationRole; deliveryMode: "email" | "link" }) {
  if (role === "MEMBER") return null;
  return <details id="invite-member" className="team-panel mt-8">
    <summary className="cursor-pointer font-semibold">Invite member</summary>
    <div className="mt-6 max-w-lg">
      <p className="mb-5 text-sm leading-6 text-muted">Invitations reserve one seat for seven days. Only the invited, verified email address can accept.</p>
      {deliveryMode === "link" && <p className="mb-5 text-sm leading-6 text-muted">Local development link mode. No invitation email will be sent.</p>}
      <TeamActionForm action={teamAction} label={deliveryMode === "link" ? "Create invitation link" : "Send invitation"}>
        <Context org={org} operation={deliveryMode === "link" ? "create-link" : "invite"} />
        <label className="block text-sm font-medium">Email address<input name="email" type="email" autoComplete="email" required maxLength={254} className="auth-input mt-2" /></label>
        <label className="block text-sm font-medium">Role<select name="role" defaultValue="MEMBER" className="auth-input mt-2"><option value="MEMBER">Member</option>{role === "OWNER" && <option value="ADMIN">Admin</option>}</select></label>
      </TeamActionForm>
    </div>
  </details>;
}
export function MemberActions({ member, actorId, actorRole, org, orgName }: { member: Member; actorId: string; actorRole: OrganizationRole; org: string; orgName: string }) {
  if (!canManageMember(actorRole, member.role, member.user_id === actorId) || member.status !== "ACTIVE") return <span className="text-muted">—</span>;
  return <details className="min-w-44"><summary className="cursor-pointer font-medium text-forest">Manage member</summary><div className="mt-4 space-y-6">
    {actorRole === "OWNER" && <TeamActionForm action={teamAction} label="Update role">
      <Context org={org} operation="role" member={member.id} />
      <label className="block text-sm">Role for {member.display_name}<select name="role" defaultValue={member.role} className="auth-input mt-2"><option value="MEMBER">Member</option><option value="ADMIN">Admin</option></select></label>
    </TeamActionForm>}
    <TeamActionForm action={teamAction} label="Remove member" destructive>
      <Context org={org} operation="remove" member={member.id} />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" required className="mt-1" /><span>Remove this workspace membership. Their account will remain.</span></label>
    </TeamActionForm>
    {actorRole === "OWNER" && <details className="border-t border-line pt-4"><summary className="cursor-pointer text-sm font-medium">Transfer ownership</summary><div className="mt-4">
      <TeamActionForm action={teamAction} label="Confirm ownership transfer" destructive>
        <Context org={org} operation="transfer" member={member.id} />
        <p className="text-sm leading-6">This person becomes OWNER. You become ADMIN. This changes who controls the workspace.</p>
        <label className="block text-sm">Type <strong>{orgName}</strong> to confirm<input name="confirmation" required maxLength={80} autoComplete="off" className="auth-input mt-2" /></label>
      </TeamActionForm>
    </div></details>}
  </div></details>;
}
export type ListedInvitation = { id: string; email: string; invited_role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; delivery_status: string; last_delivery_at: string; created_at: string };
export function InvitationsTable({ invitations, org, deliveryMode }: { invitations: ListedInvitation[]; org: string; deliveryMode: "email" | "link" }) {
  return invitations.length === 0 ? <p className="team-panel text-sm text-muted">No invitations yet.</p> : <div className="team-table-wrap"><table className="team-table">
    <caption className="sr-only">Workspace invitations and delivery status</caption>
    <thead><tr><th scope="col">Recipient</th><th scope="col">Role</th><th scope="col">Invitation</th><th scope="col">Email</th><th scope="col">Actions</th></tr></thead>
    <tbody>{invitations.map((invite) => {
      const state = invitationState(invite);
      return <tr key={invite.id}><td><span className="break-all">{invite.email}</span><span className="mt-1 block text-xs text-muted">Expires {new Date(invite.expires_at).toLocaleDateString("en-GB", { timeZone: "UTC" })} UTC</span></td>
        <td>{invite.invited_role}</td><td>{state}</td><td>{invite.delivery_status === "sent" ? "Provider accepted" : "Not confirmed"}</td>
        <td>{["Pending", "Expired"].includes(state) ? <details><summary className="cursor-pointer font-medium text-forest">Manage invitation</summary><div className="mt-4 min-w-48 space-y-5">
          <p className="text-xs leading-5 text-muted">{deliveryMode === "link" ? "Regenerating invalidates all earlier links. Copy the new link immediately. No email is sent." : "Resending replaces the link."} Wait at least one minute between attempts.</p>
          <TeamActionForm action={teamAction} label={deliveryMode === "link" ? "Regenerate invitation link" : "Resend invitation"}><Context org={org} operation={deliveryMode === "link" ? "regenerate-link" : "resend"} invitation={invite.id} /></TeamActionForm>
          <TeamActionForm action={teamAction} label="Revoke invitation" destructive><Context org={org} operation="revoke" invitation={invite.id} /></TeamActionForm>
        </div></details> : <span className="text-muted">—</span>}</td></tr>;
    })}</tbody>
  </table></div>;
}
export function TeamPagination({ org, page, invitationPage, membersNext, invitesNext }: { org: string; page: number; invitationPage: number; membersNext: boolean; invitesNext: boolean }) {
  const path = `/workspace/${org}/members`;
  return <nav aria-label="Team pagination" className="mt-6 flex flex-wrap gap-5 text-sm">
    {page > 1 && <Link className="auth-text-link" href={`${path}?page=${page - 1}&invitations=${invitationPage}`}>Previous members</Link>}
    {membersNext && <Link className="auth-text-link" href={`${path}?page=${page + 1}&invitations=${invitationPage}`}>Next members</Link>}
    {invitationPage > 1 && <Link className="auth-text-link" href={`${path}?page=${page}&invitations=${invitationPage - 1}`}>Previous invitations</Link>}
    {invitesNext && <Link className="auth-text-link" href={`${path}?page=${page}&invitations=${invitationPage + 1}`}>Next invitations</Link>}
  </nav>;
}
