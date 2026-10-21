"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadOfficeChat } from "./actions";
import type { ChatEvents } from "./events";
import { mergeMessages, normalizeBody, type ChatMessage } from "../../../../../packages/shared/src/chat.ts";

type Pending = { id: string; body: string; senderId: string };
export function ChatPanel({ officeId, open, onClose, events, userId, send }: {
  officeId: string; open: boolean; onClose(): void; events: ChatEvents; userId?: string;
  send(body: string, id: string): boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [sendError, setSendError] = useState("");
  const [hasNew, setHasNew] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft), nearBottom = useRef(true), historical = useRef(false);
  const pending = useRef<Pending | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const revision = useRef(0), duringLoad = useRef<ChatMessage[] | null>(null);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const messageRef = useRef<ChatMessage[]>([]);
  const publish = useCallback((next: ChatMessage[]) => { messageRef.current = next; setMessages(next); }, []);
  const confirm = useCallback((message: ChatMessage) => {
    const request = pending.current;
    if (request && message.clientMessageId === request.id && message.senderId === request.senderId && message.body === request.body) {
      clearTimeout(timer.current); pending.current = null; setSending(false); setSendError("");
      if (normalizeBody(draftRef.current) === request.body) { draftRef.current = ""; setDraft(""); }
    }
  }, []);
  const load = useCallback(async (before: string | null = null) => {
    const request = ++revision.current;
    setLoading(true); setHistoryError(""); duringLoad.current = [];
    if (before && list.current) {
      const top = list.current.getBoundingClientRect().top;
      const first = [...list.current.querySelectorAll<HTMLElement>("[data-message-id]")].find((node) => node.getBoundingClientRect().bottom > top);
      anchor.current = first ? { id: first.dataset.messageId!, top: first.getBoundingClientRect().top } : null;
      nearBottom.current = false;
    }
    try {
      const result = await loadOfficeChat(officeId, before);
      if (request !== revision.current) return;
      if (!result.ok) { setHistoryError(result.error); return; }
      const incoming = duringLoad.current ?? [];
      if (!before) {
        historical.current = false; nearBottom.current = true; setHasNew(false);
        publish(mergeMessages(result.page.messages, incoming));
      } else {
        if (messageRef.current.length + result.page.messages.length > 150) historical.current = true;
        publish(mergeMessages(messageRef.current, result.page.messages, false));
      }
      setCursor(result.page.olderCursor);
      for (const message of result.page.messages) confirm(message);
    } catch { if (request === revision.current) setHistoryError("Chat history could not load. Try again."); }
    finally { if (request === revision.current) { duringLoad.current = null; setLoading(false); } }
  }, [officeId, confirm, publish]);
  useEffect(() => {
    return events.subscribe((event) => {
      if (event.type === "connection") {
        setOnline(event.online);
        if (event.online && open) {
          if (messageRef.current.length && (!nearBottom.current || historical.current)) setHasNew(true);
          else void load();
        }
        else if (!event.online) { clearTimeout(timer.current); setSending(false); if (pending.current) setSendError("Delivery is unconfirmed. Your draft is kept; retry after reconnecting."); }
      } else if (event.type === "message") {
        confirm(event.message);
        if (duringLoad.current) duringLoad.current = mergeMessages(duringLoad.current, [event.message]);
        if (nearBottom.current && !historical.current) {
          const next = mergeMessages(messageRef.current, [event.message]);
          if (messageRef.current.length === 150 && next[0]?.id !== messageRef.current[0]?.id) setCursor(next[0]!.id);
          publish(next);
        }
        else setHasNew(true);
      } else {
        if (!pending.current || event.clientMessageId !== null && event.clientMessageId !== pending.current.id) return;
        clearTimeout(timer.current); setSending(false);
        setSendError(event.code === "RATE_LIMIT" ? "Wait ten seconds before retrying. Chat allows five messages per ten seconds." : event.code === "INVALID" ? "Use a non-empty plain-text message of at most 2,000 characters." : event.code === "DENIED" ? "You no longer have permission to send to this chat." : "Delivery could not be confirmed. Keep this draft and retry with the same request.");
      }
    });
  }, [events, confirm, load, publish, open]);
  useEffect(() => { if (open) document.getElementById("office-chat-draft")?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => () => { revision.current++; clearTimeout(timer.current); }, []);
  useLayoutEffect(() => {
    if (!list.current) return;
    if (anchor.current) {
      const node = [...list.current.querySelectorAll<HTMLElement>("[data-message-id]")].find((node) => node.dataset.messageId === anchor.current!.id);
      if (node) list.current.scrollTop += node.getBoundingClientRect().top - anchor.current.top;
      anchor.current = null;
    } else if (nearBottom.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages]);
  const submit = () => {
    const body = normalizeBody(draftRef.current);
    if (!body || !online || !userId || sending) return;
    const request = pending.current?.body === body && pending.current.senderId === userId ? pending.current : { id: crypto.randomUUID(), body, senderId: userId };
    pending.current = request; setSendError("");
    if (!send(body, request.id)) { setSendError("Chat is disconnected. Your draft is kept."); return; }
    setSending(true);
    timer.current = setTimeout(() => { setSending(false); setSendError("Delivery could not be confirmed. Retry this draft to check without duplicating it."); }, 12_000);
  };
  return <aside id="office-chat" aria-label="Office Chat" hidden={!open} className="office-chat border-line bg-white">
    <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Office Chat</h2><button className="office-control" onClick={onClose}>Close chat</button></header>
    {!online && <p role="status" className="border-b border-line bg-surface px-4 py-2 text-xs leading-5 text-muted">Chat disconnected. Reconnect to send; your draft is kept.</p>}
    <div ref={list} tabIndex={0} aria-label="Chat messages" aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 focus-visible:outline-2 focus-visible:outline-forest" onScroll={() => { const node = list.current!; nearBottom.current = node.scrollHeight-node.scrollTop-node.clientHeight < 70; }}>
      {cursor && <button className="auth-text-link mb-4" disabled={loading} onClick={() => void load(cursor)}>Load older messages</button>}
      {loading && <p role="status" className="mb-3 text-xs text-muted">Loading messages…</p>}
      {!messages.length && !loading && !historyError && <p className="py-8 text-sm leading-6 text-muted">{online ? "No messages yet. Start a conversation with your team." : "Reconnect to retrieve recent messages."}</p>}
      <ol className="space-y-4">{messages.map((message) => <li key={message.id} data-message-id={message.id}>
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs"><span className="font-semibold">{message.senderName}</span><time className="text-muted" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
        <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm leading-6">{message.body}</p>
      </li>)}</ol>
    </div>
    {hasNew && <button className="border-t border-line bg-surface px-4 py-2 text-sm font-medium text-forest" onClick={() => void load()}>Show latest messages</button>}
    {historyError && <div className="border-t border-line px-4 py-2"><p role="alert" className="text-xs leading-5 text-red-800">{historyError}</p><button className="auth-text-link mt-1" disabled={loading} onClick={() => void load()}>Retry history</button></div>}
    <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="border-t border-line p-4">
      <label htmlFor="office-chat-draft" className="text-xs font-medium">Message your office</label>
      <textarea id="office-chat-draft" value={draft} maxLength={4000} rows={3} aria-describedby="office-chat-help" className="auth-input mt-2 resize-y text-sm" onChange={(event) => { draftRef.current = event.target.value; setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
      <p id="office-chat-help" className="mt-1 text-xs leading-5 text-muted">{[...draft].length}/2,000 characters. Shift+Enter for a new line.</p>
      {sendError && <p role="alert" className="mt-2 text-xs leading-5 text-red-800">{sendError}</p>}
      <button className="auth-button mt-3 w-full" disabled={!online || !userId || !normalizeBody(draft) || sending}>{sending ? "Sending…" : "Send message"}</button>
    </form>
  </aside>;
}
