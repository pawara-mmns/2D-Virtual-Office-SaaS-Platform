// Opt-in live PostgREST denials. No sign-in, user selection, email or data writes.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { test } from "node:test";
import { getSupabaseConfig } from "../src/lib/supabase/config.ts";

for (const path of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  if (existsSync(path)) loadEnvFile(path);
}
const config = getSupabaseConfig();
const office = "00000000-0000-4000-8000-000000000000";
async function request(path, body, invalidToken = false) {
  assert.ok(config, "Configure the existing Supabase public environment first.");
  assert.equal(new URL(config.url).hostname, "rofutnholbtdmxccrkbs.supabase.co", "Expected approved development target.");
  try {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(12000),
      headers: { apikey: config.key, "Content-Type": "application/json", ...(invalidToken ? { Authorization: "Bearer deliberately-invalid-chat-proof" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  } catch { throw new Error("Live chat API request could not be completed; raw provider output suppressed."); }
}

for (const table of ["chat_channels", "chat_messages"]) {
  test(`live anonymous PostgREST cannot read ${table}`, async () => {
    const result = await request(`${table}?select=id&limit=1`);
    assert.ok([401, 403].includes(result.status), "Expected permission denial.");
    assert.equal(result.data.code, "42501", "Expected permission denial rather than missing schema.");
  });
}
for (const [name, body] of [
  ["list_office_chat_messages", { p_office: office }],
  ["send_office_chat_message", { p_office: office, p_body: "", p_client_message_id: office }],
]) {
  test(`live anonymous PostgREST cannot execute ${name}`, async () => {
    const result = await request(`rpc/${name}`, body);
    assert.ok([401, 403].includes(result.status), "Expected permission denial.");
    assert.equal(result.data.code, "42501", "Expected revoked RPC privilege rather than missing schema.");
  });
  test(`live invalid bearer cannot execute ${name}`, async () => {
    const result = await request(`rpc/${name}`, body, true);
    assert.equal(result.status, 401, "Invalid authentication must be rejected.");
    assert.equal(Array.isArray(result.data), false, "No history may be returned.");
    assert.equal(Boolean(result.data?.message?.id), false, "No committed message may be returned.");
  });
}
