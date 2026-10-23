"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { invitationCookieName, invitationCookieOptions } from "@/lib/invitation-context";
import { acceptInvitation } from "./service";
import { teamErrorMessage } from "./errors";
import type { TeamFormState } from "./validation";

export async function acceptInvitationAction(_previous: TeamFormState): Promise<TeamFormState> {
  void _previous;
  await requireUser();
  let org: string;
  const store = await cookies();
  try { org = await acceptInvitation(await createClient<Database>(), store.get(invitationCookieName)?.value); }
  catch (error) { return { status: "error", message: teamErrorMessage(error) }; }
  store.set(invitationCookieName, "", { ...invitationCookieOptions, maxAge: 0 });
  revalidatePath("/dashboard");
  redirect(`/workspace/${org}`);
}

export async function dismissInvitationAction() {
  (await cookies()).set(invitationCookieName, "", { ...invitationCookieOptions, maxAge: 0 });
  redirect("/dashboard");
}
