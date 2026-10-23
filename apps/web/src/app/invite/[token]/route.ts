import { NextResponse } from "next/server";
import { isInvitationToken, invitationCookieName, invitationCookieOptions } from "@/lib/invitation-context";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = isInvitationToken(token);
  const response = new NextResponse(null, { status: 303, headers: {
    Location: valid ? "/invite" : "/invite?notice=invalid", "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "DENY",
  } });
  if (valid) response.cookies.set(invitationCookieName, token, invitationCookieOptions);
  // Only capture proof. No lookup, membership write or token consumption on GET.
  return response;
}
