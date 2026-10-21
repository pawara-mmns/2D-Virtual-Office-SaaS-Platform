"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/server";
import { teamContext } from "./server";
import { updateMemberRole, removeMember, transferOwnership } from "./service";
import { inviteOrganizationMember, revokeInvitation, resendInvitation, createDirectInvitationLink, regenerateDirectInvitationLink } from "@/features/invitations/service";
import { invitationDeliveryMode } from "@/features/invitations/delivery-config";
import { canInvite, requireIdentifier, type TeamFormState } from "@/features/invitations/validation";
import { TeamError, teamErrorMessage } from "@/features/invitations/errors";

export async function teamAction(_previous: TeamFormState, form: FormData): Promise<TeamFormState> {
  await requireUser();
  try {
    const org = requireIdentifier(form.get("organizationId"));
    const { client, role } = await teamContext(org, true);
    const operation = form.get("operation");
    let message: string;
    let invitationLink: TeamFormState["invitationLink"];
    if (operation === "create-link") {
      if (!canInvite(role, String(form.get("role")))) throw new TeamError("You do not have permission to invite this role.");
      invitationLink = await createDirectInvitationLink(client, org, form.get("email"), form.get("role"));
      message = "Invitation link created. Copy it now and share it privately with the invited person. No email was sent.";
    } else if (operation === "regenerate-link") {
      invitationLink = await regenerateDirectInvitationLink(client, org, requireIdentifier(form.get("invitationId")));
      message = "Invitation link regenerated. All earlier links are invalid. Copy this link now. No email was sent.";
    } else if (operation === "invite") {
      if (invitationDeliveryMode() !== "email") throw new TeamError("Email delivery is disabled in link mode. Create an invitation link instead.");
      if (!canInvite(role, String(form.get("role")))) throw new TeamError("You do not have permission to invite this role.");
      await inviteOrganizationMember(client, org, form.get("email"), form.get("role"));
      message = "The email provider accepted the invitation email. Inbox delivery is not guaranteed.";
    } else if (operation === "revoke") {
      await revokeInvitation(client, org, requireIdentifier(form.get("invitationId")));
      message = "Invitation revoked. Its link can no longer be accepted.";
    } else if (operation === "resend") {
      if (invitationDeliveryMode() !== "email") throw new TeamError("Email delivery is disabled in link mode. Regenerate the invitation link instead.");
      await resendInvitation(client, org, requireIdentifier(form.get("invitationId")));
      message = "The email provider accepted the new invitation email. Earlier links no longer work.";
    } else if (operation === "remove") {
      if (form.get("confirm") !== "yes") throw new TeamError("Confirm removal before continuing.");
      await removeMember(client, org, requireIdentifier(form.get("memberId")));
      message = "Membership removed. New authorized requests no longer have workspace access.";
    } else if (operation === "role") {
      await updateMemberRole(client, org, requireIdentifier(form.get("memberId")), form.get("role"));
      message = "Member role updated.";
    } else if (operation === "transfer") {
      await transferOwnership(client, org, requireIdentifier(form.get("memberId")), form.get("confirmation"));
      message = "Ownership transferred. Your role is now ADMIN.";
    } else throw new TeamError("Unknown team action.");
    revalidatePath(`/workspace/${org}`, "layout");
    revalidatePath("/dashboard");
    return { status: "success", message, ...(invitationLink ? { invitationLink } : {}) };
  } catch (error) { return { status: "error", message: teamErrorMessage(error) }; }
}
