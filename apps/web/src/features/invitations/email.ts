import { TeamError } from "./errors.ts";
import { invitationAppOrigin, invitationDeliveryMode } from "./delivery-config.ts";

export type InvitationEmail = { id: string; version: number; email: string; organization_name: string; inviter_name: string | null; role: string; expires_at: string };
export function invitationEmailConfig(env: Record<string, string | undefined> = process.env) {
  const key = env.RESEND_API_KEY?.trim();
  // Next.js loads this server-only setting. Never fall back to an actor or recipient address.
  const from = env.INVITATION_FROM_EMAIL?.trim();
  const origin = invitationAppOrigin(env);
  if (!key || !from || !origin || /[\r\n]/.test(from)) return null;
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) return null;
  return { key, from, origin };
}
export function requireInvitationEmailConfig() {
  if (invitationDeliveryMode() !== "email") throw new TeamError("Email delivery is disabled in link mode. Create or regenerate an invitation link instead.");
  const config = invitationEmailConfig();
  if (!config) throw new TeamError("Invitation email is not configured. Ask an administrator to configure Resend, a verified sender, and APP_URL. No email was sent.");
  return config;
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
export function invitationEmailContent(invite: InvitationEmail, link: string) {
  const inviter = invite.inviter_name || "A workspace administrator";
  const expiry = new Date(invite.expires_at).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  return {
    subject: `Invitation to ${invite.organization_name.replace(/[\r\n]/g, " ")}`,
    text: `${inviter} invited you to ${invite.organization_name} as ${invite.role}.\n\nAccept invitation: ${link}\n\nExpires ${expiry}. Sign in or register with this email address and verify your email. Opening this link does not join the workspace. If this was unexpected, ignore this email.`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f8f9f5;color:#202c27;font:16px Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dce2d8"><p style="font-size:14px;font-weight:bold">Virtual Office</p><h1 style="font-size:24px;line-height:1.3">Join ${escapeHtml(invite.organization_name)}</h1><p style="line-height:1.7">${escapeHtml(inviter)} invited you as ${escapeHtml(invite.role)}.</p><p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#245743;color:#fff;padding:14px 20px;text-decoration:none;border-radius:4px">Review invitation</a></p><p style="font-size:14px;line-height:1.7">Expires ${escapeHtml(expiry)}. Sign in or register with this email address and verify your email. You will join only after choosing Accept invitation.</p><p style="font-size:12px;color:#5c6961">If this was unexpected, you can ignore this email.</p></main></body></html>`,
  };
}
function deliveryRejection(status: number, data: unknown) {
  // Inspect only known error categories; never display the provider's raw message,
  // which can contain recipient addresses, credentials or invitation content.
  const error = data && typeof data === "object" ? data : null;
  const name = error && "name" in error && typeof error.name === "string" ? error.name : "";
  const message = error && "message" in error && typeof error.message === "string" ? error.message.toLowerCase() : "";
  let reason: string;
  if (status === 403 && name === "validation_error" && message.includes("only send testing emails")) {
    reason = "The Resend testing sender can only send to the email address registered with the Resend account. Use that recipient, or ask an administrator to configure a sender on a verified domain.";
  } else if (status === 403 && name === "validation_error" && message.includes("domain") && /not verified|not been verified|verify/.test(message)) {
    reason = "The email provider rejected the sender domain. Ask an administrator to correct the invitation sender configuration and restart the app before resending.";
  } else if (status === 401 || (status === 403 && ["restricted_api_key", "suspended_api_key", "invalid_permission"].includes(name))) {
    reason = "The email provider rejected authentication or sending permissions. Ask an administrator to check the Resend API key and its sender-domain permissions.";
  } else if (status === 429) {
    reason = "The email provider is rate limiting requests. Wait before resending.";
  } else if (status >= 400 && status < 500) {
    reason = `The email provider rejected the request (HTTP ${status}). Ask an administrator to check the failed request in Resend.`;
  } else {
    return null; // Server failures may be ambiguous about whether delivery was accepted.
  }
  return `${reason} The invitation still reserves a seat. After resolving the issue, wait at least a minute and resend the existing invitation, or revoke it to release the seat.`;
}
export async function deliverInvitationEmail(config: NonNullable<ReturnType<typeof invitationEmailConfig>>, invite: InvitationEmail, token: string, fetcher: typeof fetch = fetch) {
  const content = invitationEmailContent(invite, `${config.origin}/invite/${token}`);
  let rejection: string | null = null;
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", "Idempotency-Key": `invitation/${invite.id}/${invite.version}` },
      body: JSON.stringify({ from: config.from, to: [invite.email], ...content }),
    });
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      rejection = deliveryRejection(response.status, error);
      throw new Error("Provider rejected delivery");
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string" || !data.id || data.id.length > 256) throw new Error("Invalid provider response");
    return data.id;
  } catch {
    // Never log provider errors, request bodies, recipients, links or credentials.
    throw new TeamError(rejection ?? "Email delivery could not be confirmed. The invitation reserves a seat. Wait a minute, then resend, or revoke it to release the seat.");
  }
}
