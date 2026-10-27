"use client";

import { useActionState, useState } from "react";
import { createOrganizationAction } from "./actions";
import type { OrganizationFormState } from "./validation";

const initialState: OrganizationFormState = { status: "idle" };

export function OrganizationForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(createOrganizationAction, initialState);
  const [name, setName] = useState("");
  return (
    <form action={action} aria-busy={pending} className="mt-8 space-y-6">
      <input type="hidden" name="requestId" value={requestId} />
      {state.message && <p role="alert" className="ui-notice ui-notice-error">{state.message}</p>}
      <div>
        <label htmlFor="workspace-name" className="mb-2 block text-sm font-medium">Workspace name</label>
        <input id="workspace-name" name="name" value={name} onChange={(event) => setName(event.target.value)}
          required maxLength={160} autoComplete="organization" disabled={pending}
          aria-invalid={Boolean(state.nameError)} aria-describedby={state.nameError ? "workspace-name-hint workspace-name-error" : "workspace-name-hint"}
          className="auth-input" />
        <p id="workspace-name-hint" className="mt-2 text-xs leading-6 text-muted">Use your company or team name. Up to 80 characters.</p>
        {state.nameError && <p id="workspace-name-error" className="mt-2 text-sm text-danger">{state.nameError}</p>}
      </div>
      <p className="text-sm leading-7 text-muted">You’ll be the owner. Your workspace includes a main office. After creating it, enter the office or invite your teammates.</p>
      <button type="submit" disabled={pending} className="auth-button w-full sm:w-auto">{pending ? "Creating workspace…" : "Create workspace"}</button>
      <p aria-live="polite" className="text-xs text-muted">{pending ? "Setting up your workspace and default office." : ""}</p>
    </form>
  );
}
