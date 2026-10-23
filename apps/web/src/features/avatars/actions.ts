"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { AvatarError, saveAvatarPreference, validateDisplayName, type AvatarSaveState } from "./service";

export async function saveAvatarAction(_previous: AvatarSaveState, form: FormData): Promise<AvatarSaveState> {
  await requireUser();
  try {
    const displayName = validateDisplayName(form.get("displayName"));
    const avatarKey = await saveAvatarPreference(await createClient<Database>(), form.get("avatarKey"), displayName);
    revalidatePath("/workspace", "layout");
    return { status: "success", message: "Appearance saved. Your office profile is updated.", avatarKey, displayName };
  } catch (error) {
    return { status: "error", message: error instanceof AvatarError ? error.message : "Your avatar could not be saved. Please try again shortly." };
  }
}
