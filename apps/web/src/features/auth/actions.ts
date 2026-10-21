"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authSetupMessage, getSupabaseConfig } from "@/lib/supabase/config";
import { recoveryCookieName, recoveryCookieOptions } from "./links";
import { applyRecoveryPassword, lookupVerifiedUser } from "./service";
import { validateAuthForm, type AuthMode, type AuthState } from "./validation";

const recoveryMessage =
  "If an account exists for this email, you’ll receive a password reset link. Check your inbox and spam folder.";
const verificationMessage =
  "If this address can be registered, you’ll receive a verification email. Open its link to verify your address before signing in. Check your spam folder too.";
const unavailableMessage = "We couldn’t reach the authentication service. Please try again shortly.";

function errorState(message: string): AuthState {
  return { status: "error", message };
}

async function clearLocalSession() {
  const config = getSupabaseConfig();
  const store = await cookies();
  if (config) {
    // Default storage key used by supabase-js. Match only this project's cookies,
    // including SSR chunks and the PKCE verifier; preserve unrelated cookies.
    const key = `sb-${new URL(config.url).hostname.split(".")[0]}-auth-token`;
    for (const { name } of store.getAll()) {
      if (name === key || name.startsWith(`${key}.`) || name === `${key}-code-verifier`) {
        store.set(name, "", { path: "/", maxAge: 0 });
      }
    }
  }
  store.set(recoveryCookieName, "", { ...recoveryCookieOptions, maxAge: 0 });
}

async function submit(mode: AuthMode, form: FormData): Promise<AuthState> {
  const input = validateAuthForm(mode, form);
  if (!input.valid) return { status: "error", message: "Check the highlighted fields.", fields: input.fields };
  if (!getSupabaseConfig()) return errorState(authSetupMessage);

  let destination: string | undefined;
  try {
    const supabase = await createClient();

    if (mode === "forgot-password") {
      // Site URL and email templates are configured in Supabase. Do not derive
      // email destinations from request Host, Origin, or arbitrary next URLs.
      const { error } = await supabase.auth.resetPasswordForEmail(input.email);
      if (error && error.status && error.status >= 500) return errorState(unavailableMessage);
      // Account-specific rejection and rate limits use the same safe response.
      return { status: "success", message: recoveryMessage };
    }

    if (mode === "register") {
      const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password });
      if (error && error.code !== "user_already_exists") {
        if (error.code === "weak_password") return errorState("Choose a stronger password and try again.");
        if (error.status === 429) return errorState("Too many requests. Please wait a few minutes before trying again.");
        return errorState("We couldn’t create your account. Please try again shortly.");
      }
      if (data.session) {
        await supabase.auth.signOut({ scope: "local" });
        await clearLocalSession();
        return errorState("Email confirmation must be enabled in the Supabase project before registration can be used.");
      }
      return { status: "success", message: verificationMessage };
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
      if (error) {
        if (error.code === "email_not_confirmed") return errorState("Verify your email using the registration email before signing in.");
        if (error.status === 429) return errorState("Too many attempts. Please wait a few minutes and try again.");
        if (!error.status || error.status >= 500) return errorState(unavailableMessage);
        return errorState("The email or password is incorrect. Please try again.");
      }
      const user = await lookupVerifiedUser(supabase.auth);
      if (user.status !== "authenticated") {
        await supabase.auth.signOut({ scope: "local" });
        await clearLocalSession();
        return errorState(user.status === "unavailable" ? unavailableMessage : "Verify your email before signing in.");
      }
      destination = "/dashboard";
    }

    if (mode === "reset-password") {
      const store = await cookies();
      const tokenHash = store.get(recoveryCookieName)?.value;
      const result = await applyRecoveryPassword(supabase.auth, tokenHash, input.password);
      store.set(recoveryCookieName, "", { ...recoveryCookieOptions, maxAge: 0 });
      await clearLocalSession();
      if (result === "updated" || result === "updated-signout-failed") {
        destination = result === "updated" ? "/login?notice=password-reset" : "/login?notice=password-reset-local";
      } else {
        if (result === "same-password") return errorState("Choose a password different from your current password. Request a new reset link to try again.");
        if (result === "invalid-link") return errorState("This reset link is invalid, expired, or already used. Request a new link below.");
        return errorState("The password reset could not be completed. Request a new link before trying again.");
      }
    }
  } catch {
    return errorState(unavailableMessage);
  }

  // Keep redirects outside catch: Next.js implements them by throwing.
  if (destination) redirect(destination);
  return errorState(unavailableMessage);
}

export async function loginAction(_previous: AuthState, form: FormData) {
  return submit("login", form);
}

export async function registerAction(_previous: AuthState, form: FormData) {
  return submit("register", form);
}

export async function forgotPasswordAction(_previous: AuthState, form: FormData) {
  return submit("forgot-password", form);
}

export async function resetPasswordAction(_previous: AuthState, form: FormData) {
  return submit("reset-password", form);
}

export async function signOutAction() {
  let failed = false;
  try {
    if (getSupabaseConfig()) {
      const supabase = await createClient();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      failed = Boolean(error);
    }
  } catch {
    failed = true;
  }
  await clearLocalSession();
  redirect(failed ? "/login?notice=signed-out-local" : "/login?notice=signed-out");
}
