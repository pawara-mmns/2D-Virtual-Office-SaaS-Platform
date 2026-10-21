import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBody, parseChatSend, validCursor, decodePage, mergeMessages, isAvailability, type ChatMessage } from "../../../../../packages/shared/src/chat.ts";
import { createChatEvents } from "./events.ts";
const uuid = "00000000-0000-4000-8000-000000000001";
function message(id: number): ChatMessage { return { id: String(id), channelId: uuid, senderId: uuid, senderName: "Teammate", body: `message ${id}`, clientMessageId: uuid, createdAt: "2026-10-22T00:00:00.123456Z" }; }
test("chat validates Unicode character limits, newlines, plain text and exact request identity shape", () => {
  assert.equal(normalizeBody("  Hello\r\nteam  "), "Hello\nteam");
  assert.equal(normalizeBody("🙂".repeat(2000)), "🙂".repeat(2000));
  for (const invalid of ["", " \n\t", "x".repeat(2001), "🙂".repeat(2001), "a\u0001b", null, {}]) assert.equal(normalizeBody(invalid), null);
  assert.ok(parseChatSend({ body: "<script>alert('plain text')</script>", clientMessageId: uuid }));
  for (const extra of [{ senderId: uuid }, { organizationId: uuid }, { channelId: uuid }]) assert.equal(parseChatSend({ body: "text", clientMessageId: uuid, ...extra }), null);
  assert.equal(parseChatSend({ body: "text", clientMessageId: "bad" }), null);
});
test("history uses lossless bigint cursors, bounded pages and deterministic id ordering", () => {
  assert.ok(validCursor("9223372036854775807"));
  for (const invalid of ["9223372036854775808", "01", "0", "-1", "1 or true", 1]) assert.equal(validCursor(invalid), false);
  const page = decodePage(Array.from({ length: 31 }, (_, index) => message(100-index)));
  assert.equal(page.messages.length, 30); assert.equal(page.messages[0]!.id, "71"); assert.equal(page.messages.at(-1)!.id, "100"); assert.equal(page.olderCursor, "71");
  assert.equal(decodePage([message(1)]).olderCursor, null);
  assert.throws(() => decodePage(Array.from({ length: 32 }, () => message(1))));
  assert.equal(decodePage([{ ...message(1), senderName: "private@example.invalid" }]).messages[0]!.senderName, "Member");
});
test("history/live/retry reconciliation removes duplicates and keeps a bounded movable window", () => {
  const current = Array.from({ length: 150 }, (_, index) => message(index+1));
  assert.equal(mergeMessages(current, [message(150)]).length, 150);
  const newest = mergeMessages(current, [message(151)]); assert.equal(newest[0]!.id, "2"); assert.equal(newest.at(-1)!.id, "151");
  const older = mergeMessages(newest, [message(1)], false); assert.equal(older[0]!.id, "1"); assert.equal(older.at(-1)!.id, "150");
});
test("availability is distinct from connectivity and event subscriptions clean up without duplicate delivery", () => {
  for (const status of ["AVAILABLE", "BUSY", "DO_NOT_DISTURB"]) assert.ok(isAvailability(status));
  for (const status of ["OFFLINE", "online", {}, undefined]) assert.equal(isAvailability(status), false);
  const events = createChatEvents(); let received = 0;
  const unsubscribe = events.subscribe(() => received++); assert.equal(received, 1);
  events.emit({ type: "message", message: message(1) }); assert.equal(received, 2);
  unsubscribe(); events.emit({ type: "message", message: message(2) }); assert.equal(received, 2);
  events.emit({ type: "connection", online: true });
  let restored = false; const stop = events.subscribe((event) => { if (event.type === "connection") restored = event.online; }); assert.ok(restored); stop();
});
