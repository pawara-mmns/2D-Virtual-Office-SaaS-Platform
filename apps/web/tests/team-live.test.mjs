// Opt-in live negative checks. No accounts, valid proof, email or fixture writes.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { test } from "node:test";
import { getSupabaseConfig } from "../src/lib/supabase/config.ts";

for (const path of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  if (existsSync(path)) loadEnvFile(path);
}
const config = getSupabaseConfig();
const org = "00000000-0000-4000-8000-000000000000";
const target = "00000000-0000-4000-8000-000000000001";
const invalidProof = "0".repeat(64);
async function request(path, body) {
  assert.ok(config, "Configure the Supabase public environment first.");
  let response;
  try {
    response = await fetch(`${config.url}/rest/v1/${path}`, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(12000),
      headers: { apikey: config.key, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new Error("Live team API request could not be completed."); }
  return { status: response.status, data: await response.json() };
}
test("live anonymous API cannot read invitation records", async () => {
  const result = await request("organization_invitations?select=id&limit=1");
  assert.ok([401, 403].includes(result.status));
  assert.equal(result.data.code, "42501");
});
for (const [name, body] of [
  ["list_organization_members", { p_org: org }],
  ["create_organization_invitation", { p_org: org, p_email: "no-send@example.invalid", p_role: "MEMBER", p_token_hash: invalidProof }],
  ["resend_organization_invitation", { p_org: org, p_invitation: target, p_token_hash: invalidProof }],
  ["record_invitation_delivery", { p_org: org, p_invitation: target, p_version: 1, p_status: "failed" }],
  ["revoke_organization_invitation", { p_org: org, p_invitation: target }],
  ["accept_organization_invitation", { p_token_hash: invalidProof }],
  ["update_organization_member_role", { p_org: org, p_member: target, p_role: "ADMIN" }],
  ["remove_organization_member", { p_org: org, p_member: target }],
  ["transfer_organization_ownership", { p_org: org, p_member: target, p_confirmation: "invalid" }],
]) {
  test(`live anonymous API denies ${name}`, async () => {
    const result = await request(`rpc/${name}`, body);
    assert.ok([401, 403].includes(result.status));
    assert.equal(result.data.code, "42501", "Expected permission denial, not a missing-schema error.");
  });
}
test("live invalid invitation preview returns no workspace information", async () => {
  const result = await request("rpc/preview_organization_invitation", { p_token_hash: invalidProof });
  assert.equal(result.status, 200);
  assert.equal(result.data, null);
});
