// Narrow, versioned RPC contract for 20261022000100_workspace_chat.sql.
// Separate from the generated foundation/team database snapshot.
export type ChatDatabase = { public: {
  Tables: Record<never, never>; Views: Record<never, never>; Enums: Record<never, never>; CompositeTypes: Record<never, never>;
  Functions: {
    send_office_chat_message: { Args: { p_office: string; p_body: string; p_client_message_id: string }; Returns: unknown };
    list_office_chat_messages: { Args: { p_office: string; p_before?: string | null }; Returns: unknown };
  };
} };
