import type { ChatEvent } from "../../../../../packages/shared/src/chat.ts";
export function createChatEvents() {
  const listeners = new Set<(event: ChatEvent) => void>();
  let online = false;
  return {
    emit(event: ChatEvent) { if (event.type === "connection") online = event.online; for (const listener of listeners) listener(event); },
    subscribe(listener: (event: ChatEvent) => void) { listeners.add(listener); listener({ type: "connection", online }); return () => { listeners.delete(listener); }; },
  };
}
export type ChatEvents = ReturnType<typeof createChatEvents>;
