"use server";
import { requireUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import { decodePage, validCursor, type ChatPage } from "../../../../../packages/shared/src/chat.ts";
import { isId } from "../../../../../packages/shared/src/protocol.ts";
import type { ChatDatabase } from "../../../../../packages/shared/src/chat-database.ts";
export async function loadOfficeChat(officeId: string, before: string | null = null): Promise<{ ok: true; page: ChatPage } | { ok: false; error: string }> {
  await requireUser();
  if (!isId(officeId) || before !== null && !validCursor(before)) return { ok: false, error: "Invalid chat history request." };
  try {
    const client = await createClient<ChatDatabase>();
    const { data, error } = await client.rpc("list_office_chat_messages", { p_office: officeId, p_before: before });
    if (error) return { ok: false, error: error.code === "42501" ? "You no longer have access to this chat." : "Chat history is unavailable. Check the connection and chat database setup, then retry." };
    return { ok: true, page: decodePage(data) };
  } catch { return { ok: false, error: "Chat history could not load. Try again shortly." }; }
}
