"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { AvatarError, saveAvatarPreference, validateDisplayName, type AvatarSaveState } from "./service";
import { encodeCustomization } from '../../../../../packages/shared/src/avatar-customization';

export async function saveAvatarAction(_previous: AvatarSaveState, form: FormData): Promise<AvatarSaveState> {
  await requireUser();
  try {
    const displayName = validateDisplayName(form.get("displayName"));
    const raw = form.get('appearance');
    if (raw !== null && (typeof raw !== 'string' || raw.length > 2048)) throw new AvatarError('Choose a valid appearance.');
    let customization;
    try { customization = raw === null ? undefined : JSON.parse(raw as string); } catch { throw new AvatarError('Choose a valid appearance.'); }
    const appearance = customization == null ? undefined : encodeCustomization(customization);
    const avatarKey = await saveAvatarPreference(await createClient<Database>(), form.get("avatarKey"), displayName, customization);
    revalidatePath("/workspace", "layout");
    return { status: "success", message: "Appearance saved. Your office profile is updated.", avatarKey, displayName, appearance };
  } catch (error) {
    return { status: "error", message: error instanceof AvatarError ? error.message : "Your avatar could not be saved. Please try again shortly." };
  }
}
