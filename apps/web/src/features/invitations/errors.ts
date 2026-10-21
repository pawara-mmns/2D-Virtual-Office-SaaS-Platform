export class TeamError extends Error {
  constructor(message: string) { super(message); }
}
export function teamDataError(code: string): never {
  const messages: Record<string, string> = {
    PGRST202: "Team setup is not available yet. An administrator must apply the reviewed invitation migration.",
    PGRST205: "Team setup is not available yet. An administrator must apply the reviewed invitation migration.",
    "42P01": "Team setup is not available yet. An administrator must apply the reviewed invitation migration.",
    "42501": "You do not have permission for this team action, or the confirmation did not match.",
    "22023": "Check the invitation fields and try again.",
    P0401: "This person is already an active member.",
    P0402: "A pending invitation already exists. Resend or revoke it below.",
    P0403: "All 10 seats are in use or reserved. Revoke an unused invitation or remove an authorized member first.",
    P0404: "This invitation is unavailable, expired, revoked, or already accepted.",
    P0405: "This invitation is not available for your verified email address. Sign in with the invited address.",
    P0409: "Transfer ownership before removing the last owner.",
    P0410: "Invitation rate limit reached. Wait at least a minute before resending; hourly limits also apply.",
    "23505": "An invitation already exists or this action conflicted. Refresh before retrying.",
  };
  throw new TeamError(messages[code] ?? "The team service is unavailable. Please try again shortly.");
}
export function teamErrorMessage(error: unknown) {
  return error instanceof TeamError ? error.message : "The team action could not be completed. Refresh and try again.";
}
