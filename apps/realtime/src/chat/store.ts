import { createClient } from "@supabase/supabase-js";
import { decodeMessage, type ChatSend, type ChatMessage, type ChatErrorCode } from "../../../../packages/shared/src/chat.ts";
import type { ChatDatabase } from "../../../../packages/shared/src/chat-database.ts";
import type { Authorization } from "../auth/authorize.ts";
export class ChatFailure extends Error { constructor(readonly code: ChatErrorCode) { super("Chat request could not complete."); } }
export type ChatStore = { send(auth: Authorization, input: ChatSend): Promise<{ message: ChatMessage; inserted: boolean }> };
export function supabaseChatStore(url: string, key: string): ChatStore {
  return { async send(auth, input) {
    const client = createClient<ChatDatabase>(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${auth.token}` }, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(4000) }) } });
    const { data, error } = await client.rpc("send_office_chat_message", { p_office: auth.officeId, p_body: input.body, p_client_message_id: input.clientMessageId });
    if (error) throw new ChatFailure(error.code === "42501" ? "DENIED" : error.code === "P0310" ? "RATE_LIMIT" : error.code === "22023" ? "INVALID" : "UNAVAILABLE");
    if (!data || typeof data !== "object" || !("message" in data) || !("inserted" in data) || typeof data.inserted !== "boolean") throw new ChatFailure("UNAVAILABLE");
    const message = decodeMessage(data.message);
    if (message.senderId !== auth.userId || message.clientMessageId !== input.clientMessageId || message.body !== input.body) throw new ChatFailure("UNAVAILABLE");
    return { message, inserted: data.inserted };
  } };
}
