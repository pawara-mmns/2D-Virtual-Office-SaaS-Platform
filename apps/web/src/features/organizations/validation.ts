export type OrganizationFormState = {
  status: "idle" | "error";
  message?: string;
  nameError?: string;
};

// PostgreSQL CHECK constraints are generated as string columns, not TS enums.
export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";
export function isOrganizationRole(value: unknown): value is OrganizationRole {
  return value === "OWNER" || value === "ADMIN" || value === "MEMBER";
}

// A route identifier is only syntax, never proof of membership.
export function isOrganizationId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function workspacePath(id: string) {
  if (!isOrganizationId(id)) throw new Error("Invalid organization identifier");
  return `/workspace/${id}`;
}

export function validateOrganizationInput(name: unknown, requestId: unknown) {
  const normalized = typeof name === "string" ? name.trim() : "";
  const nameError = !normalized || [...normalized].length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(normalized)
    ? "Enter a workspace name between 1 and 80 characters, without control characters."
    : undefined;
  return {
    name: normalized,
    requestId: typeof requestId === "string" ? requestId : "",
    nameError,
    valid: !nameError && isOrganizationId(requestId),
  };
}
