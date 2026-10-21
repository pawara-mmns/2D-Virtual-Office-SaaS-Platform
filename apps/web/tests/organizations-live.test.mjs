// No Auth user, credentials beyond the public key, signup or data writes.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { test } from "node:test";
import { getSupabaseConfig } from "../src/lib/supabase/config.ts";

for (const path of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  if (existsSync(path)) loadEnvFile(path);
}
const config = getSupabaseConfig();

async function request(path, options = {}) {
  assert.ok(config, "Supabase public environment configuration is required.");
  let response;
  try {
    response = await fetch(`${config.url}/rest/v1/${path}`, {
      ...options,
      headers: { apikey: config.key, "Content-Type": "application/json" },
      redirect: "error", signal: AbortSignal.timeout(12000),
    });
  } catch { throw new Error("Live anonymous organization request could not be completed."); }
  const result = await response.json();
  assert.ok([401, 403].includes(response.status), "Anonymous access must be rejected by the database privileges.");
  assert.equal(result.code, "42501", "Expected insufficient_privilege, not a missing-schema or transport error.");
  assert.equal(Boolean(result.access_token || result.refresh_token), false);
}

for (const table of ["profiles", "organizations", "organization_members", "offices"]) {
  test(`live anonymous Data API cannot read ${table}`, async () => {
    await request(`${table}?select=*&limit=1`);
  });
}
test("live anonymous Data API cannot execute organization provisioning", async () => {
  await request("rpc/create_organization", { method: "POST", body: JSON.stringify({ p_name: "Denied anonymous test", p_request_id: "be75441d-dfc4-4b15-9a9c-9d00e64adc62" }) });
});
