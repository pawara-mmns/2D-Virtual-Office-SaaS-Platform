import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/features/auth/auth-form";
import { AuthShell } from "@/features/auth/auth-shell";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Forgot password | Virtual Office" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" description="Enter your account email and we’ll send instructions to choose a new password.">
      <AuthForm mode="forgot-password" configured={Boolean(getSupabaseConfig())} />
      <p className="mt-6 text-sm"><Link href="/login" className="auth-text-link">Back to sign in</Link></p>
    </AuthShell>
  );
}
