import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/features/auth/auth-form";
import { AuthShell } from "@/features/auth/auth-shell";
import { redirectAuthenticatedUser } from "@/features/auth/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Create account | Virtual Office" };

export default async function RegisterPage() {
  await redirectAuthenticatedUser();
  return (
    <AuthShell title="Create your account" description="Use your work email and a unique password. Verify your email, then sign in to create a workspace or accept your invitation.">
      <AuthForm mode="register" configured={Boolean(getSupabaseConfig())} />
      <p className="mt-6 text-sm text-muted">Already have an account? <Link href="/login" className="auth-text-link">Sign in</Link></p>
    </AuthShell>
  );
}
