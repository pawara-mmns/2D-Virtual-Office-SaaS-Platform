"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { AvatarError, saveAvatarPreference, type AvatarSaveState } from "./service";

export async function saveAvatarAction(_previous: AvatarSaveState, form: FormData): Promise<AvatarSaveState> {
  await requireUser();
  try {
    const avatarKey = await saveAvatarPreference(await createClient<Database>(), form.get("avatarKey"));
    revalidatePath("/workspace", "layout");
    return { status: "success", message: "Avatar saved. Your office appearance is updated.", avatarKey };
  } catch (error) {
    return { status: "error", message: error instanceof AvatarError ? error.message : "Your avatar could not be saved. Please try again shortly." };
  }
}
