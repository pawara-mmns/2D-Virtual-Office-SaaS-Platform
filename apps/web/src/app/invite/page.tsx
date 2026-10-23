import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { currentUser } from "@/features/auth/server";
import { signOutAction } from "@/features/auth/actions";
import { AuthShell } from "@/features/auth/auth-shell";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { invitationCookieName, isInvitationToken } from "@/lib/invitation-context";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { previewInvitation, type InvitationPreview } from "@/features/invitations/service";
import { teamErrorMessage } from "@/features/invitations/errors";
import { acceptInvitationAction, dismissInvitationAction } from "@/features/invitations/actions";
import { TeamActionForm } from "@/features/members/action-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invitation | Virtual Office", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const token = (await cookies()).get(invitationCookieName)?.value;
  const notice = (await searchParams).notice;
  let invitation: InvitationPreview | null = null;
  let message = "Open the invitation link from your email to continue.";
  if (notice === "invalid") message = "This invitation link is invalid. Ask the sender for a new invitation.";
  else if (isInvitationToken(token)) {
    try { invitation = await previewInvitation(await createClient<Database>(), token); }
    catch (error) { message = teamErrorMessage(error); }
    if (!invitation && message.startsWith("Open")) message = "This invitation is unavailable. Ask the sender to check or resend it.";
  }
  const identity = await currentUser();
  return (
    <AuthShell title="Workspace invitation" description="Review the workspace and choose whether to join.">
      {!invitation ? <p role="status" className="text-sm leading-7 text-muted">{message}</p> : <>
        <dl className="mb-8 space-y-5 border-y border-line py-6 text-sm">
          <div><dt className="text-muted">Workspace</dt><dd className="mt-1 break-words text-lg font-semibold">{invitation.organizationName}</dd></div>
          <div><dt className="text-muted">Invited role</dt><dd className="mt-1">{invitation.role}</dd></div>
          <div><dt className="text-muted">Status</dt><dd className="mt-1">{invitation.state}</dd></div>
          <div><dt className="text-muted">Expires (UTC)</dt><dd className="mt-1">{new Date(invitation.expiresAt).toLocaleString("en-GB", { timeZone: "UTC" })}</dd></div>
        </dl>
        {["Expired", "Revoked"].includes(invitation.state) ? <p role="status" className="text-sm leading-7">This invitation cannot be accepted. Ask the sender for a new link.</p>
          : identity.status !== "authenticated" ? <div className="space-y-4 text-sm leading-7">
            <p>Sign in with the invited email address, or register and verify that address. Your invitation will be kept while you sign in.</p>
            {identity.status === "unverified" && <p role="status">Open your signup email to verify your address first.</p>}
            {identity.status === "unavailable" && <p role="alert">Authentication is unavailable. Try again shortly.</p>}
            <div className="flex flex-wrap gap-5"><Link href="/login" className="auth-button">Sign in</Link><Link href="/register" className="auth-text-link self-center">Create account</Link></div>
          </div> : !invitation.emailMatches ? <div className="space-y-5 text-sm leading-7">
            <p role="alert">You are signed in as {identity.user.email}. Sign out and use the verified address that received this invitation.</p>
            <form action={signOutAction}><SignOutButton /></form>
          </div> : <div className="space-y-5">
            <p className="text-sm leading-7 text-muted">Joining as {identity.user.email}. Membership is created only when you confirm below.</p>
            <TeamActionForm action={acceptInvitationAction} label={invitation.state === "Accepted" ? "Continue to workspace" : "Accept invitation"} />
          </div>}
      </>}
      <Link href="/dashboard" className="auth-text-link mt-8 inline-block">Back to workspaces</Link>
      <form action={dismissInvitationAction} className="mt-5"><button type="submit" className="auth-text-link">Dismiss invitation</button></form>
    </AuthShell>
  );
}
