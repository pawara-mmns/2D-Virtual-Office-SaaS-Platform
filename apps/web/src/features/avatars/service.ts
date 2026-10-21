import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { lookupVerifiedUser } from "../auth/service.ts";
import { avatarDisplayName, isAvatarKey, safeAvatarKey, type AvatarAppearance, type AvatarKey } from "./presets.ts";

type Client = SupabaseClient<Database>;
export class AvatarError extends Error {}
export type AvatarSaveState = { status: "idle" | "error" | "success"; message?: string; avatarKey?: AvatarKey };
export async function loadAvatarProfile(client: Client, authenticatedId: string): Promise<AvatarAppearance> {
  const { data, error } = await client.from("profiles").select("avatar_key,display_name").eq("id", authenticatedId).maybeSingle();
  if (error) throw new AvatarError("Your saved avatar could not be loaded. A default avatar is shown; try again shortly.");
  return { avatarKey: safeAvatarKey(data?.avatar_key), displayName: avatarDisplayName(data?.display_name) };
}
export async function saveAvatarPreference(client: Client, key: unknown): Promise<AvatarKey> {
  if (!isAvatarKey(key)) throw new AvatarError("Choose one of the supported avatar presets.");
  // Identity comes from a fresh Auth lookup, never from a form/user-id parameter.
  const identity = await lookupVerifiedUser(client.auth);
  if (identity.status !== "authenticated") throw new AvatarError("Sign in with a verified account before saving your avatar.");
  const id = identity.user.id;
  const update = () => client.from("profiles").update({ avatar_key: key }).eq("id", id).select("avatar_key");
  const result = await update();
  if (result.error) throw new AvatarError("Your avatar could not be saved. Please try again shortly.");
  if (result.data.length === 1 && result.data[0]?.avatar_key === key) return key;
  if (result.data.length !== 0) throw new AvatarError("Your saved avatar could not be confirmed. Refresh before trying again.");
  // Newly invited users may have no profile yet. Insert only id/avatar_key;
  // a concurrent profile creation is retried as a narrow update, never an upsert
  // that could overwrite display_name with its default value.
  const inserted = await client.from("profiles").insert({ id, avatar_key: key }).select("avatar_key").single();
  if (!inserted.error && inserted.data?.avatar_key === key) return key;
  if (inserted.error?.code === "23505") {
    const retried = await update();
    if (!retried.error && retried.data.length === 1 && retried.data[0]?.avatar_key === key) return key;
  }
  throw new AvatarError("Your avatar could not be saved. Please try again shortly.");
}
