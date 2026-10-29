import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/features/auth/auth-form";
import { AuthShell } from "@/features/auth/auth-shell";
import { redirectAuthenticatedUser } from "@/features/auth/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Sign in | Virtual Office" };

const notices: Record<string, string> = {
  "verify-email": "Open the verification link in your registration email, then return here to sign in. Check your spam folder if it hasn’t arrived.",
  "invalid-link": "This verification link is invalid, expired, or already used. Try signing in if you have already verified your email, or register again to request verification.",
  "password-reset": "Your password has been updated and sessions have been signed out. Sign in with your new password.",
  "password-reset-local": "Your password has been updated and you’re signed out here. Other sessions could not be revoked; sign in again and review them when the service is available.",
  "signed-out": "You’ve been signed out.",
  "signed-out-local": "You’re signed out on this browser. The service could not revoke the remote session. Existing access tokens may remain valid until they expire.",
  "unavailable": "Authentication is temporarily unavailable. Please try again shortly.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string | string[] }> }) {
  await redirectAuthenticatedUser();
  const { notice } = await searchParams;
  const message = typeof notice === "string" && Object.hasOwn(notices, notice) ? notices[notice] : undefined;
  return (
    <AuthShell title="Welcome back" description="Sign in to your Virtual Office account.">
      {message && <p role="status" className={`ui-notice mb-6 ${notice === "invalid-link" || notice === "unavailable" || notice === "signed-out-local" || notice === "password-reset-local" ? "ui-notice-warning" : ""}`}>{message}</p>}
      <AuthForm mode="login" configured={Boolean(getSupabaseConfig())} />
      <div className="mt-6 flex flex-wrap justify-between gap-4 text-sm">
        <Link href="/forgot-password" className="auth-text-link">Forgot password?</Link>
        <Link href="/register" className="auth-text-link">Create an account</Link>
      </div>
    </AuthShell>
  );
}
