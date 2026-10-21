import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { parseConfirmation, recoveryCookieName, recoveryCookieOptions } from "@/features/auth/links";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  function go(path: string) {
    // All callers supply fixed local paths. Discard the original token query.
    // A relative Location preserves the browser's exact origin, including local
    // host aliases. Never construct email callback destinations from Host headers.
    const response = new NextResponse(null, { status: 303, headers: { Location: path } });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  const input = parseConfirmation(request.nextUrl.searchParams);
  if (!input) return go("/login?notice=invalid-link");
  if (!getSupabaseConfig()) return go("/login?notice=setup");

  if (input.type === "recovery") {
    // Do not consume recovery tokens on GET. Email security scanners often
    // prefetch links. Verification happens on the password submission instead.
    const response = go("/reset-password");
    response.cookies.set(recoveryCookieName, input.tokenHash, recoveryCookieOptions);
    return response;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: input.tokenHash, type: "email" });
    if (error || !data.user?.email_confirmed_at || !data.session) return go("/login?notice=invalid-link");
  } catch {
    return go("/login?notice=unavailable");
  }
  return go(input.next);
}
