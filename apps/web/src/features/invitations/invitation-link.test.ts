import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { invitationDeliveryMode } from "./delivery-config.ts";
import { requireInvitationEmailConfig } from "./email.ts";
import { createDirectInvitationLink, regenerateDirectInvitationLink } from "./service.ts";
import { invitationTokenHash } from "./token.ts";
import { copyInvitationLink } from "./clipboard.ts";

const org = "250d1968-67d7-4d3c-8846-92f26747d76d";
const id = "16eb799f-5058-4a47-b638-8b8fc4a22f8b";
const payload = { id, version: 1, email: "recipient@example.invalid", role: "MEMBER", organization_name: "Office", inviter_name: null, expires_at: "2030-01-01T10:00:00Z" };
function database(fetcher: typeof fetch) {
  return createClient<Database>("https://database.example.invalid", "unit-public-key", { global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false } });
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }); }
async function withEnvironment(env: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
const development = { NODE_ENV: "development", INVITATION_DELIVERY_MODE: "link", APP_URL: "http://localhost:3000", RESEND_API_KEY: undefined, INVITATION_FROM_EMAIL: undefined };

test("delivery defaults to email and permits links exclusively in development/test", () => {
  assert.equal(invitationDeliveryMode({}), "email");
  assert.equal(invitationDeliveryMode({ NODE_ENV: "production", INVITATION_DELIVERY_MODE: "email" }), "email");
  for (const NODE_ENV of ["development", "test"]) assert.equal(invitationDeliveryMode({ NODE_ENV, INVITATION_DELIVERY_MODE: "link" }), "link");
  for (const NODE_ENV of ["production", "preview", "", undefined]) assert.throws(() => invitationDeliveryMode({ NODE_ENV, INVITATION_DELIVERY_MODE: "link" }), /only in development or test/);
  assert.throws(() => invitationDeliveryMode({ NODE_ENV: "development", INVITATION_DELIVERY_MODE: "unknown" }), /configuration is invalid/);
});

test("create link needs no email credentials, stores only a hash and makes no provider request", async (context) => {
  await withEnvironment(development, async () => {
    const provider = context.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network request"); });
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const client = database(async (url, options) => {
      calls.push({ path: new URL(String(url)).pathname, body: JSON.parse(String(options?.body)) });
      return json(payload);
    });
    const link = await createDirectInvitationLink(client, org, " RECIPIENT@example.invalid ", "MEMBER");
    assert.match(link.url, /^http:\/\/localhost:3000\/invite\/[\w-]{43}$/);
    const token = new URL(link.url).pathname.split("/").at(-1)!;
    assert.deepEqual(calls, [{ path: "/rest/v1/rpc/create_organization_invitation", body: { p_org: org, p_email: payload.email, p_role: "MEMBER", p_token_hash: invitationTokenHash(token) } }]);
    assert.equal(JSON.stringify(calls).includes(token), false);
    assert.deepEqual(Object.keys(link).sort(), ["expiresAt", "url"]);
    assert.equal(link.expiresAt, "2030-01-01T10:00:00.000Z");
    assert.equal(provider.mock.callCount(), 0);
    assert.throws(() => requireInvitationEmailConfig(), /Email delivery is disabled/);
  });
});

test("regeneration uses the existing atomic rotation RPC, fresh hashes, and trusted APP_URL", async () => {
  await withEnvironment({ ...development, APP_URL: "https://office.example.invalid" }, async () => {
    const hashes: string[] = [];
    const client = database(async (url, options) => {
      assert.equal(new URL(String(url)).pathname, "/rest/v1/rpc/resend_organization_invitation");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.p_invitation, id);
      assert.deepEqual(Object.keys(body).sort(), ["p_invitation", "p_org", "p_token_hash"]);
      hashes.push(body.p_token_hash);
      return json({ ...payload, version: 2 });
    });
    const first = await regenerateDirectInvitationLink(client, org, id);
    const second = await regenerateDirectInvitationLink(client, org, id);
    assert.equal(new URL(first.url).origin, "https://office.example.invalid");
    assert.notEqual(first.url, second.url);
    assert.notEqual(hashes[0], hashes[1]);
    assert.equal(hashes[0], invitationTokenHash(new URL(first.url).pathname.split("/").at(-1)));
  });
});

test("production, disabled mode and invalid trusted origins fail before any create/rotation RPC", async () => {
  let calls = 0;
  const client = database(async () => { calls++; return json(payload); });
  for (const overrides of [
    { NODE_ENV: "production" }, { NODE_ENV: undefined }, { INVITATION_DELIVERY_MODE: "email" },
    ...["", "//evil.invalid", "http://external.invalid", "https://user:pass@office.invalid", "https://office.invalid/path", "https://office.invalid/?next=x"].map((APP_URL) => ({ APP_URL })),
  ]) {
    await withEnvironment({ ...development, ...overrides }, async () => {
      await assert.rejects(createDirectInvitationLink(client, org, payload.email, "MEMBER"));
      await assert.rejects(regenerateDirectInvitationLink(client, org, id));
    });
  }
  assert.equal(calls, 0);
});

test("link creation validates roles and propagates database authorization, capacity, and rate denials", async () => {
  await withEnvironment(development, async () => {
    let calls = 0;
    const client = database(async () => { calls++; return json(payload); });
    await assert.rejects(createDirectInvitationLink(client, org, payload.email, "OWNER"), /allowed role/);
    assert.equal(calls, 0);
    for (const [code, message] of [["42501", /permission/], ["P0403", /10 seats/], ["P0410", /rate limit/], ["P0404", /unavailable/]] as const) {
      const denied = database(async () => json({ code, message: "private provider detail" }, 400));
      await assert.rejects(createDirectInvitationLink(denied, org, payload.email, "MEMBER"), message);
      await assert.rejects(regenerateDirectInvitationLink(denied, org, id), message);
    }
  });
});

test("copy reports success only after clipboard completion and permits manual copy when blocked", async () => {
  const url = "http://localhost:3000/invite/synthetic-copy-test";
  let resolveWrite!: () => void;
  let settled = false;
  const result = copyInvitationLink(url, { writeText: async (value) => { assert.equal(value, url); await new Promise<void>((resolve) => { resolveWrite = resolve; }); } }).then((copied) => { settled = true; return copied; });
  assert.equal(settled, false);
  resolveWrite();
  assert.equal(await result, true);
  assert.equal(await copyInvitationLink(url, undefined), false);
  assert.equal(await copyInvitationLink(url, { writeText: async () => { throw new Error("Clipboard denied"); } }), false);
});
