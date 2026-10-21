import assert from "node:assert/strict";
import { test } from "node:test";
import { supabaseChatStore, ChatFailure } from "../chat/store.ts";
import type { Authorization } from "../auth/authorize.ts";
const id = "00000000-0000-4000-8000-000000000001";
const auth: Authorization = { userId: id, officeId: id, organizationId: id, avatarKey: "fern", displayName: "Member", token: "fixture-bearer", checkedAt: Date.now(), expiresAt: Date.now()+60_000 };
const message = { id: "1", channelId: id, senderId: id, senderName: "Member", body: "hello", clientMessageId: id, createdAt: new Date().toISOString() };
test("chat persistence RPC uses only the verified caller bearer and bound office, never caller-supplied identity", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/rest/v1/rpc/send_office_chat_message"));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-bearer");
    assert.deepEqual(JSON.parse(String(init?.body)), { p_office: id, p_body: "hello", p_client_message_id: id });
    return Response.json({ inserted: true, message });
  };
  try { const saved = await supabaseChatStore("https://example.supabase.co", "sb_publishable_fixture").send(auth, { body: "hello", clientMessageId: id }); assert.equal(saved.inserted, true); assert.equal(saved.message.id, "1"); }
  finally { globalThis.fetch = original; }
});
test("permission, rate, invalid and persistence failures remain failures rather than successful sends", async () => {
  const original = globalThis.fetch;
  try {
    for (const [code, expected] of [["42501", "DENIED"], ["P0310", "RATE_LIMIT"], ["22023", "INVALID"], ["PGRST202", "UNAVAILABLE"]]) {
      globalThis.fetch = async () => Response.json({ code, message: "fixture failure" }, { status: 400 });
      await assert.rejects(supabaseChatStore("https://example.supabase.co", "sb_publishable_fixture").send(auth, { body: "hello", clientMessageId: id }), (error) => error instanceof ChatFailure && error.code === expected);
    }
    globalThis.fetch = async () => Response.json({ inserted: true, message: { ...message, senderId: "00000000-0000-4000-8000-000000000002" } });
    await assert.rejects(supabaseChatStore("https://example.supabase.co", "sb_publishable_fixture").send(auth, { body: "hello", clientMessageId: id }));
  } finally { globalThis.fetch = original; }
});
