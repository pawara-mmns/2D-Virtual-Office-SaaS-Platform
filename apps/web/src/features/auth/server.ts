import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { lookupVerifiedUser } from "./service";

export async function currentUser() {
  if (!getSupabaseConfig()) return { status: "unconfigured" } as const;
  const supabase = await createClient();
  return lookupVerifiedUser(supabase.auth);
}

export async function requireUser() {
  const result = await currentUser();
  if (result.status === "authenticated") return result.user;
  if (result.status === "unverified") redirect("/login?notice=verify-email");
  if (result.status === "unconfigured") redirect("/login?notice=setup");
  if (result.status === "unavailable") redirect("/login?notice=unavailable");
  redirect("/login");
}

export async function redirectAuthenticatedUser() {
  const result = await currentUser();
  if (result.status === "authenticated") redirect("/dashboard");
}
