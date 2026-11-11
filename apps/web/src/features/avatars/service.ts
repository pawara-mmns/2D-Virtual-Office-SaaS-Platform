import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { lookupVerifiedUser } from "../auth/service.ts";
import { avatarDisplayName, isAvatarKey, safeAvatarKey, type AvatarAppearance, type AvatarKey } from "./presets.ts";
import { decodeCustomization, encodeCustomization, parseCustomization } from '../../../../../packages/shared/src/avatar-customization.ts';

type Client = SupabaseClient<Database>;
export class AvatarError extends Error {}
export type AvatarSaveState = { status: "idle" | "error" | "success"; message?: string; avatarKey?: AvatarKey; displayName?: string; appearance?: string };
export function validateDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new AvatarError("Enter a display name of 1–18 characters.");
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!name || [...name].length > 18 || /[@\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name)) throw new AvatarError("Use 1–18 characters without an email address or hidden control characters.");
  return name;
}
export async function loadAvatarProfile(client: Client, authenticatedId: string): Promise<AvatarAppearance> {
  let result = await client.from("profiles").select("avatar_key,display_name,avatar_appearance").eq("id", authenticatedId).maybeSingle();
  // Local-first rollout: old installations keep working until the additive migration is reviewed.
  if (result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
    const legacy = await client.from("profiles").select("avatar_key,display_name").eq("id", authenticatedId).maybeSingle();
    result = legacy.error ? { ...legacy, data: null } : { ...legacy, data: legacy.data ? { ...legacy.data, avatar_appearance: null } : null };
  }
  const { data, error } = result;
  if (error) throw new AvatarError("Your saved avatar could not be loaded. A default avatar is shown; try again shortly.");
  const config = decodeCustomization(data?.avatar_appearance);
  return { avatarKey: safeAvatarKey(data?.avatar_key), displayName: avatarDisplayName(data?.display_name), ...(config ? { appearance: encodeCustomization(config) } : {}) };
}
export async function saveAvatarPreference(client: Client, key: unknown, displayName?: unknown, customization?: unknown): Promise<AvatarKey> {
  if (!isAvatarKey(key)) throw new AvatarError("Choose one of the supported avatar presets.");
  let config;
  try { config = customization === undefined || customization === null ? customization : parseCustomization(customization); }
  catch (error) { throw new AvatarError(error instanceof Error ? error.message : 'Choose a valid appearance.'); }
  const changes = { avatar_key: key, ...(displayName === undefined ? {} : { display_name: validateDisplayName(displayName) }), ...(config === undefined ? {} : { avatar_appearance: config }) };
  // Identity comes from a fresh Auth lookup, never from a form/user-id parameter.
  const identity = await lookupVerifiedUser(client.auth);
  if (identity.status !== "authenticated") throw new AvatarError("Sign in with a verified account before saving your avatar.");
  const id = identity.user.id;
  const confirmed = (row: { avatar_key: string | null; avatar_appearance?: unknown } | undefined | null) => {
    if (!row || row.avatar_key !== key) return false;
    if (config === undefined) return true;
    if (config === null) return row.avatar_appearance === null;
    const saved = decodeCustomization(row.avatar_appearance);
    return !!saved && encodeCustomization(config) === encodeCustomization(saved);
  };
  const update = () => {
    const query = client.from('profiles').update(changes).eq('id', id);
    return config === undefined ? query.select('avatar_key') : query.select('avatar_key,avatar_appearance');
  };
  const result = await update();
  if (result.error && config === null && ['42703', 'PGRST204'].includes(result.error.code)) return saveAvatarPreference(client, key, displayName);
  if (result.error) throw new AvatarError(['42703', 'PGRST204'].includes(result.error.code) ? 'Avatar customization needs the local database migration. Your saved appearance has not changed.' : "Your avatar could not be saved. Please try again shortly.");
  if (result.data.length === 1 && confirmed(result.data[0])) return key;
  if (result.data.length !== 0) throw new AvatarError("Your saved avatar could not be confirmed. Refresh before trying again.");
  // Newly invited users may have no profile yet. Insert only explicitly edited fields;
  // a concurrent profile creation is retried as a narrow update, never an upsert
  // that could overwrite display_name with its default value.
  const insert = client.from('profiles').insert({ id, ...changes });
  const inserted = config === undefined ? await insert.select('avatar_key').single() : await insert.select('avatar_key,avatar_appearance').single();
  if (!inserted.error && confirmed(inserted.data)) return key;
  if (inserted.error?.code === "23505") {
    const retried = await update();
    if (!retried.error && retried.data.length === 1 && confirmed(retried.data[0])) return key;
  }
  throw new AvatarError("Your avatar could not be saved. Please try again shortly.");
}
