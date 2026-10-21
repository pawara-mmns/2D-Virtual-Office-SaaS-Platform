"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/server";
import { createOrganization } from "./server";
import { OrganizationError } from "./service";
import { validateOrganizationInput, workspacePath, type OrganizationFormState } from "./validation";

export async function createOrganizationAction(_state: OrganizationFormState, form: FormData): Promise<OrganizationFormState> {
  // Authentication precedes validation and is outside catch (redirect throws).
  await requireUser();
  const input = validateOrganizationInput(form.get("name"), form.get("requestId"));
  if (!input.valid) return { status: "error", message: "Check your workspace name, or refresh the form if it has expired.", nameError: input.nameError };
  let id: string;
  try {
    id = await createOrganization(input.name, input.requestId);
  } catch (error) {
    return { status: "error", message: error instanceof OrganizationError ? error.message : "We couldn’t create your workspace. Please try again. Your request can be retried safely." };
  }
  redirect(workspacePath(id));
}
