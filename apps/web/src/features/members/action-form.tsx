"use client";

import { useActionState } from "react";
import type { TeamFormState } from "@/features/invitations/validation";
import { InvitationLinkResult } from "./invitation-link-result";

export function TeamActionForm({ action, label, children, destructive = false }: {
  action: (previous: TeamFormState, form: FormData) => Promise<TeamFormState>;
  label: string; children?: React.ReactNode; destructive?: boolean;
}) {
  // Never submit a previous one-time secret back as Server Action state.
  const [state, formAction, pending] = useActionState((_previous: TeamFormState, form: FormData) => action({ status: "idle" }, form), { status: "idle" });
  return (
    <form action={formAction} className="space-y-4" aria-busy={pending}>
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        {children}
        <button type="submit" className={destructive ? "team-danger-button" : "auth-button"} aria-disabled={pending}>
          {pending ? "Working…" : label}
        </button>
      </fieldset>
      {!pending && state.message && <p role={state.status === "error" ? "alert" : "status"} className={`ui-notice max-w-xl ${state.status === "error" ? "ui-notice-error" : "ui-notice-success"}`}>{state.message}</p>}
      {!pending && state.status === "success" && state.invitationLink && <InvitationLinkResult key={state.invitationLink.expiresAt} link={state.invitationLink} />}
    </form>
  );
}
