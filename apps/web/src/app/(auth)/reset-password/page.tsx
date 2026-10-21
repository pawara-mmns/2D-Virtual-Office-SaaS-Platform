import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AuthForm } from "@/features/auth/auth-form";
import { AuthShell } from "@/features/auth/auth-shell";
import { isTokenHash, recoveryCookieName } from "@/features/auth/links";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Choose a password | Virtual Office" };

export default async function ResetPasswordPage() {
  const store = await cookies();
  // Presence only controls generic form visibility. The server action must
  // verify the one-time token with Supabase before it can change any password.
  const hasLink = isTokenHash(store.get(recoveryCookieName)?.value);
  return (
    <AuthShell title="Choose a new password" description="Use a unique password for your Virtual Office account.">
      {hasLink ? <AuthForm mode="reset-password" configured={Boolean(getSupabaseConfig())} /> : (
        <p role="alert" className="border-l-2 border-amber-700 bg-amber-50 p-3 text-sm leading-6 text-amber-950">Open the reset link in your email first. If it has expired or you’ve already used it, request a new one.</p>
      )}
      <div className="mt-6 flex flex-wrap justify-between gap-4 text-sm">
        <Link href="/forgot-password" className="auth-text-link">Request a new reset link</Link>
        <Link href="/login" className="auth-text-link">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
