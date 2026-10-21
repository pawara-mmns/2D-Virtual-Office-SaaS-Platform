import { createHash, randomBytes } from "node:crypto";
import { isInvitationToken } from "../../lib/invitation-context.ts";

export function invitationTokenHash(token: unknown) {
  if (!isInvitationToken(token)) throw new Error("Invalid invitation link.");
  return createHash("sha256").update(token).digest("hex");
}
export function createInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: invitationTokenHash(token) };
}
