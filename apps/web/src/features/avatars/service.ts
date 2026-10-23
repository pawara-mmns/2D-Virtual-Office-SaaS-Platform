import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { lookupVerifiedUser } from "../auth/service.ts";
import { avatarDisplayName, isAvatarKey, safeAvatarKey, type AvatarAppearance, type AvatarKey } from "./presets.ts";

type Client = SupabaseClient<Database>;
export class AvatarError extends Error {}
export type AvatarSaveState = { status: "idle" | "error" | "success"; message?: string; avatarKey?: AvatarKey; displayName?: string };
export function validateDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new AvatarError("Enter a display name of 1–18 characters.");
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!name || [...name].length > 18 || /[@\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name)) throw new AvatarError("Use 1–18 characters without an email address or hidden control characters.");
  return name;
}
export async function loadAvatarProfile(client: Client, authenticatedId: string): Promise<AvatarAppearance> {
  const { data, error } = await client.from("profiles").select("avatar_key,display_name").eq("id", authenticatedId).maybeSingle();
  if (error) throw new AvatarError("Your saved avatar could not be loaded. A default avatar is shown; try again shortly.");
  return { avatarKey: safeAvatarKey(data?.avatar_key), displayName: avatarDisplayName(data?.display_name) };
}
export async function saveAvatarPreference(client: Client, key: unknown, displayName?: unknown): Promise<AvatarKey> {
  if (!isAvatarKey(key)) throw new AvatarError("Choose one of the supported avatar presets.");
  const changes = displayName === undefined ? { avatar_key: key } : { avatar_key: key, display_name: validateDisplayName(displayName) };
  // Identity comes from a fresh Auth lookup, never from a form/user-id parameter.
  const identity = await lookupVerifiedUser(client.auth);
  if (identity.status !== "authenticated") throw new AvatarError("Sign in with a verified account before saving your avatar.");
  const id = identity.user.id;
  const update = () => client.from("profiles").update(changes).eq("id", id).select("avatar_key");
  const result = await update();
  if (result.error) throw new AvatarError("Your avatar could not be saved. Please try again shortly.");
  if (result.data.length === 1 && result.data[0]?.avatar_key === key) return key;
  if (result.data.length !== 0) throw new AvatarError("Your saved avatar could not be confirmed. Refresh before trying again.");
  // Newly invited users may have no profile yet. Insert only explicitly edited fields;
  // a concurrent profile creation is retried as a narrow update, never an upsert
  // that could overwrite display_name with its default value.
  const inserted = await client.from("profiles").insert({ id, ...changes }).select("avatar_key").single();
  if (!inserted.error && inserted.data?.avatar_key === key) return key;
  if (inserted.error?.code === "23505") {
    const retried = await update();
    if (!retried.error && retried.data.length === 1 && retried.data[0]?.avatar_key === key) return key;
  }
  throw new AvatarError("Your avatar could not be saved. Please try again shortly.");
}
