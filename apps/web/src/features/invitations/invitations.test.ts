import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { isInvitationToken, postLoginDestination } from "../../lib/invitation-context.ts";
import { canInvite, canManageMember, validateInvite, pageNumber, invitationState } from "./validation.ts";
import { createInvitationToken, invitationTokenHash } from "./token.ts";
import { deliverInvitationEmail, invitationEmailConfig, invitationEmailContent } from "./email.ts";
import { acceptInvitation, inviteOrganizationMember, resendInvitation, previewInvitation } from "./service.ts";
import { updateMemberRole, transferOwnership } from "../members/service.ts";
import { TeamError, teamErrorMessage } from "./errors.ts";

const org = "250d1968-67d7-4d3c-8846-92f26747d76d";
const inviteId = "16eb799f-5058-4a47-b638-8b8fc4a22f8b";
const config = { key: "unit-test-not-a-real-key", from: "office@example.invalid", origin: "https://office.example.invalid" };
const payload = { id: inviteId, version: 1, email: "recipient@example.invalid", role: "MEMBER", organization_name: "Design & Research", inviter_name: "A colleague", expires_at: "2030-01-01T10:00:00Z" };
function database(fetcher: typeof fetch) {
  return createClient<Database>("https://database.example.invalid", "unit-public-key", { global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false } });
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }); }

test("invitation validation normalizes email, restricts roles and bounds pagination", () => {
  assert.deepEqual(validateInvite(" Teammate@Example.com ", "ADMIN"), { email: "teammate@example.com", role: "ADMIN", valid: true });
  for (const email of ["bad", "a\n@example.com", "a@@example.com", "x".repeat(255)]) assert.equal(validateInvite(email, "MEMBER").valid, false);
  for (const role of ["OWNER", "admin", null]) assert.equal(validateInvite("a@example.com", role).valid, false);
  for (const page of ["-1", "//evil.example", ["2"], "Infinity"]) assert.equal(pageNumber(page), 1);
  assert.equal(pageNumber("9999"), 1000);
});
test("UI permission rules match OWNER/ADMIN/MEMBER hierarchy and reject self-management", () => {
  assert.ok(canInvite("OWNER", "ADMIN") && canInvite("OWNER", "MEMBER") && canInvite("ADMIN", "MEMBER"));
  for (const role of ["OWNER", "ADMIN", "MEMBER"]) assert.equal(canInvite("MEMBER", role), false);
  assert.equal(canInvite("ADMIN", "ADMIN"), false);
  assert.equal(canInvite("ADMIN", "OWNER"), false);
  assert.equal(canManageMember("ADMIN", "ADMIN", false), false);
  assert.equal(canManageMember("OWNER", "OWNER", false), false);
  assert.equal(canManageMember("OWNER", "MEMBER", true), false);
  assert.equal(canManageMember("ADMIN", "MEMBER", false), true);
});
test("tokens have 256 random bits, bounded syntax and deterministic SHA-256 hashes", () => {
  const first = createInvitationToken(), second = createInvitationToken();
  assert.ok(isInvitationToken(first.token));
  assert.match(first.hash, /^[a-f0-9]{64}$/);
  assert.equal(invitationTokenHash(first.token), first.hash);
  assert.notEqual(first.token, second.token);
  for (const token of ["bad", "x".repeat(44), "https://evil.example"]) assert.throws(() => invitationTokenHash(token));
  assert.equal(postLoginDestination(first.token), "/invite");
  assert.equal(postLoginDestination("//evil.example"), "/dashboard");
});
test("invitation states derive from timestamps without mutable conflicting status", () => {
  const pending = { accepted_at: null, revoked_at: null, expires_at: "2030-01-01Z" };
  assert.equal(invitationState(pending, 0), "Pending");
  assert.equal(invitationState(pending, Date.parse("2031-01-01")), "Expired");
  assert.equal(invitationState({ ...pending, accepted_at: "2029-01-01Z" }), "Accepted");
  assert.equal(invitationState({ ...pending, revoked_at: "2029-01-01Z" }), "Revoked");
});
test("email configuration requires server credentials, a sender and a fixed safe origin", () => {
  assert.equal(invitationEmailConfig({}), null);
  for (const APP_URL of ["https://office.invalid/path", "https://user:password@office.invalid", "http://external.invalid", "//evil.invalid", "https://office.invalid/?next=x"]) {
    assert.equal(invitationEmailConfig({ RESEND_API_KEY: "unit", INVITATION_FROM_EMAIL: config.from, APP_URL }), null);
  }
  assert.equal(invitationEmailConfig({ RESEND_API_KEY: "unit", INVITATION_FROM_EMAIL: "sender@example.com\r\nBcc: x@y.com", APP_URL: config.origin }), null);
  assert.ok(invitationEmailConfig({ RESEND_API_KEY: "unit", INVITATION_FROM_EMAIL: config.from, APP_URL: "http://localhost:3000" }));
});
test("HTML email escapes workspace/inviter content and supplies a plain-text alternative", () => {
  const content = invitationEmailContent({ ...payload, organization_name: '<script>alert("x")</script>', inviter_name: "A & B" }, "https://office.example.invalid/invite/unit");
  assert.equal(content.html.includes("<script>"), false);
  assert.ok(content.html.includes("&lt;script&gt;") && content.html.includes("A &amp; B"));
  assert.ok(content.text.includes("Accept invitation:") && content.text.includes("UTC"));
});
test("real email adapter uses Resend JSON, bounded requests and per-generation idempotency", async () => {
  const providerId = await deliverInvitationEmail(config, payload, "synthetic-unit-token", async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(new Headers(options?.headers).get("Idempotency-Key"), `invitation/${inviteId}/1`);
    const body = JSON.parse(String(options?.body));
    assert.equal(body.from, config.from);
    assert.deepEqual(body.to, [payload.email]);
    assert.ok(body.html.includes("/invite/synthetic-unit-token") && body.text.includes("/invite/synthetic-unit-token"));
    return json({ id: "unit-provider-id" });
  });
  assert.equal(providerId, "unit-provider-id");
});
for (const action of ["create", "resend"] as const) {
  test(`${action} sends the server-configured sender to Resend, independently of the inviter and recipient`, async (context) => {
    const previous = Object.fromEntries(["RESEND_API_KEY", "INVITATION_FROM_EMAIL", "APP_URL", "INVITATION_DELIVERY_MODE"].map((key) => [key, process.env[key]]));
    process.env.RESEND_API_KEY = config.key;
    process.env.INVITATION_FROM_EMAIL = "onboarding@resend.dev";
    process.env.APP_URL = config.origin;
    process.env.INVITATION_DELIVERY_MODE = "email";
    try {
      const invite = { ...payload, inviter_name: "inviter@example.invalid", from: "untrusted@example.invalid" };
      const recorded: Record<string, unknown>[] = [];
      const client = database(async (url, options) => {
        if (String(url).endsWith("record_invitation_delivery")) {
          recorded.push(JSON.parse(String(options?.body)));
          return json(true);
        }
        return json(invite);
      });
      // Intercept the real delivery adapter; neither this request nor the RPCs leave the process.
      const fetcher: typeof fetch = async (url, options) => {
        assert.equal(url, "https://api.resend.com/emails");
        const body = JSON.parse(String(options?.body));
        assert.equal(body.from, "onboarding@resend.dev");
        assert.deepEqual(body.to, [invite.email]);
        assert.ok(body.text.includes(invite.inviter_name));
        return json({ id: "unit-provider-id" });
      };
      const provider = context.mock.method(globalThis, "fetch", fetcher);
      if (action === "create") await inviteOrganizationMember(client, org, payload.email, "MEMBER");
      else await resendInvitation(client, org, inviteId);
      assert.equal(provider.mock.callCount(), 1);
      assert.equal(recorded[0]?.p_status, "sent");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}
test("provider rejection, malformed response and timeout never claim successful delivery or expose details", async () => {
  for (const fetcher of [
    async () => json({ secret: "unit-secret" }, 503), async () => json({}),
    async () => { throw new Error("unit-secret synthetic-unit-token"); },
  ]) {
    await assert.rejects(deliverInvitationEmail(config, payload, "synthetic-unit-token", fetcher), (error) => {
      assert.ok(error instanceof TeamError);
      assert.match(error.message, /could not be confirmed/);
      assert.equal(/unit-secret|synthetic-unit-token|unit-test-not-a-real-key/.test(error.message), false);
      return true;
    });
  }
});
test("known Resend rejections surface actionable fixed messages without exposing provider details", async () => {
  for (const [status, name, message, expected] of [
    [403, "validation_error", "You can only send testing emails to your own email address", /testing sender can only send to the email address registered/],
    [403, "validation_error", "Domain not verified: Verify gmail.com or update your from domain", /rejected the sender domain/],
    [403, "validation_error", "The example.invalid domain is not verified. Please add and verify your domain", /rejected the sender domain/],
    [401, "validation_error", "API key is invalid", /rejected authentication or sending permissions/],
    [403, "restricted_api_key", "API key is not active", /rejected authentication or sending permissions/],
    [403, "suspended_api_key", "This API key is suspended", /rejected authentication or sending permissions/],
    [429, "rate_limit_exceeded", "Too many requests", /rate limiting/],
    [403, "unknown", "Unknown rejection", /rejected the request \(HTTP 403\)/],
  ] as const) {
    await assert.rejects(deliverInvitationEmail(config, payload, "synthetic-unit-token", async () => json({
      name, message: `${message}: recipient@example.invalid unit-secret synthetic-unit-token ${config.key}`,
    }, status)), (error) => {
      assert.ok(error instanceof TeamError);
      assert.match(teamErrorMessage(error), expected);
      assert.match(error.message, /still reserves a seat/);
      assert.equal(/recipient@example.invalid|unit-secret|synthetic-unit-token|unit-test-not-a-real-key/.test(error.message), false);
      return true;
    });
  }
});
test("unreadable provider rejections retain safe HTTP status feedback", async () => {
  await assert.rejects(deliverInvitationEmail(config, payload, "synthetic-unit-token", async () => new Response("unit-secret", { status: 403 })), /rejected the request \(HTTP 403\)/);
});
test("a real adapter recipient restriction reaches the UI error boundary and records failed delivery only", async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = database(async (url, options) => {
    bodies.push(JSON.parse(String(options?.body)));
    return json(String(url).endsWith("create_organization_invitation") ? payload : true);
  });
  await assert.rejects(inviteOrganizationMember(client, org, payload.email, "MEMBER", config,
    (settings, invite, token) => deliverInvitationEmail(settings, invite, token, async () => json({
      name: "validation_error", message: "You can only send testing emails to your own email address (recipient@example.invalid).",
    }, 403))), (error) => {
    assert.match(teamErrorMessage(error), /testing sender can only send/);
    assert.equal(teamErrorMessage(error).includes(payload.email), false);
    return true;
  });
  assert.equal(bodies[1]?.p_status, "failed");
  assert.equal(bodies.some((body) => body.p_status === "sent"), false);
});
test("invitation creation sends only token hashes to SQL and records real provider acceptance", async () => {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const client = database(async (url, options) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, body: JSON.parse(String(options?.body)) });
    return json(path.endsWith("create_organization_invitation") ? payload : true);
  });
  let rawToken = "";
  assert.equal(await inviteOrganizationMember(client, org, " RECIPIENT@example.invalid ", "MEMBER", config, async (_config, _invite, token) => { rawToken = token; return "provider-id"; }), undefined);
  assert.equal(calls[0]?.body.p_token_hash, invitationTokenHash(rawToken));
  assert.equal(JSON.stringify(calls).includes(rawToken), false);
  assert.equal(calls[1]?.body.p_status, "sent");
  assert.equal(calls[1]?.body.p_provider_id, "provider-id");
});
test("delivery failure records uncertainty while keeping reservation and surfacing a safe error", async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = database(async (url, options) => { bodies.push(JSON.parse(String(options?.body))); return json(String(url).endsWith("create_organization_invitation") ? payload : true); });
  await assert.rejects(inviteOrganizationMember(client, org, payload.email, "MEMBER", config, async () => { throw new TeamError("Delivery could not be confirmed."); }), /could not be confirmed/);
  assert.equal(bodies[1]?.p_status, "failed");
  assert.equal(bodies.some((body) => body.p_status === "sent"), false);
});
test("stale or failed delivery bookkeeping never becomes a successful invitation message", async () => {
  const client = database(async (url) => json(String(url).endsWith("create_organization_invitation") ? payload : false));
  await assert.rejects(inviteOrganizationMember(client, org, payload.email, "MEMBER", config, async () => "provider-id"), /accepted the email, but/);
});
test("resend generates a fresh token and propagates database rate limits before delivery", async () => {
  const hashes: string[] = [];
  const client = database(async (url, options) => {
    const body = JSON.parse(String(options?.body));
    if (String(url).endsWith("resend_organization_invitation")) { hashes.push(body.p_token_hash); return json({ ...payload, version: 2 }); }
    return json(true);
  });
  for (let n = 0; n < 2; n++) await resendInvitation(client, org, inviteId, config, async () => "provider-id");
  assert.equal(hashes.length, 2);
  assert.notEqual(hashes[0], hashes[1]);
  let sent = false;
  const limited = database(async () => json({ code: "P0410", message: "private" }, 400));
  await assert.rejects(resendInvitation(limited, org, inviteId, config, async () => { sent = true; return "bad"; }), /rate limit/);
  assert.equal(sent, false);
});
test("acceptance and preview pass hashes only; only returned UUIDs become destinations", async () => {
  const secret = createInvitationToken();
  const client = database(async (url, options) => {
    assert.equal(JSON.parse(String(options?.body)).p_token_hash, secret.hash);
    return json(String(url).endsWith("preview_organization_invitation") ? null : org);
  });
  assert.equal(await previewInvitation(client, secret.token), null);
  assert.equal(await acceptInvitation(client, secret.token), org);
  const malicious = database(async () => json("https://evil.example"));
  await assert.rejects(acceptInvitation(malicious, secret.token), /could not be read/);
});
test("member services reject ordinary OWNER assignment and require explicit transfer confirmation", async () => {
  let called = false;
  const client = database(async () => { called = true; return json(null); });
  await assert.rejects(updateMemberRole(client, org, inviteId, "OWNER"), /explicit transfer/);
  await assert.rejects(transferOwnership(client, org, inviteId, ""), /workspace name/);
  assert.equal(called, false);
});
