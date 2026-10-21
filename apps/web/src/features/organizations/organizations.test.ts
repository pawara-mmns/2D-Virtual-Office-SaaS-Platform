import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { listUserOrganizations, OrganizationError, provisionOrganization } from "./service.ts";
import { isOrganizationId, validateOrganizationInput, workspacePath } from "./validation.ts";

const organizationA = "250d1968-67d7-4d3c-8846-92f26747d76d";
const organizationB = "16eb799f-5058-4a47-b638-8b8fc4a22f8b";
const requestId = "7888c857-0021-4192-b0a0-97628cb79e09";
const userId = "7df17a9c-1c4c-472f-88d5-8d2db93e96a5";

function database(fetcher: typeof fetch) {
  // In-memory HTTP adapter only. No fixture is sent to an external project.
  return createClient<Database>("https://database.example", "test-public-key", {
    global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false },
  });
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

test("organization names are bounded, normalized, Unicode-aware, and reject controls", () => {
  assert.equal(validateOrganizationInput("  Research & Design  ", requestId).name, "Research & Design");
  assert.equal(validateOrganizationInput("🌱".repeat(80), requestId).valid, true);
  for (const name of [null, "   ", "x".repeat(81), "Bad\nName", "Bad\u0000Name"]) {
    assert.equal(validateOrganizationInput(name, requestId).valid, false);
  }
  assert.equal(validateOrganizationInput("Valid", "//evil.example").valid, false);
});

test("workspace routes accept UUID identifiers and never arbitrary destinations", () => {
  assert.equal(workspacePath(organizationA), `/workspace/${organizationA}`);
  for (const value of ["../../dashboard", "//evil.example", "not-a-uuid", [organizationA], organizationA + "?next=//evil.example"]) {
    assert.equal(isOrganizationId(value), false);
    if (typeof value === "string") assert.throws(() => workspacePath(value));
  }
});

test("organization provisioning makes exactly one RPC with name and request ID only", async () => {
  let calls = 0;
  const client = database(async (url, options) => {
    calls++;
    assert.equal(new URL(String(url)).pathname, "/rest/v1/rpc/create_organization");
    assert.equal(options?.method, "POST");
    assert.deepEqual(JSON.parse(String(options?.body)), { p_name: "Design team", p_request_id: requestId });
    return json(organizationA);
  });
  assert.equal(await provisionOrganization(client, " Design team ", requestId), organizationA);
  assert.equal(calls, 1);
});

test("invalid organization input never reaches the database", async () => {
  let called = false;
  const client = database(async () => { called = true; return json(null); });
  await assert.rejects(provisionOrganization(client, "", requestId), (error) => error instanceof OrganizationError && error.kind === "input");
  assert.equal(called, false);
});

test("provisioning surfaces permission, idempotency/conflict, schema and transport failures safely", async () => {
  for (const [code, kind] of [["42501", "forbidden"], ["22023", "input"], ["23505", "conflict"], ["PGRST202", "setup"], ["XX000", "unavailable"]]) {
    const client = database(async () => json({ code, message: "private database details", details: "", hint: "" }, 400));
    await assert.rejects(provisionOrganization(client, "Workspace", requestId), (error) => {
      assert.ok(error instanceof OrganizationError);
      assert.equal(error.kind, kind);
      assert.equal(error.message.includes("private database details"), false);
      return true;
    });
  }
});

test("retrying a form preserves its idempotency key instead of making independent inserts", async () => {
  const payloads: unknown[] = [];
  const client = database(async (_url, options) => { payloads.push(JSON.parse(String(options?.body))); return json(organizationA); });
  assert.equal(await provisionOrganization(client, "Team", requestId), organizationA);
  assert.equal(await provisionOrganization(client, "Team", requestId), organizationA);
  assert.deepEqual(payloads[0], payloads[1]);
});

test("organization listing uses the verified user and active memberships, retaining each role", async () => {
  const client = database(async (url) => {
    const request = new URL(String(url));
    if (request.pathname.endsWith("organization_members")) {
      assert.equal(request.searchParams.get("user_id"), `eq.${userId}`);
      assert.equal(request.searchParams.get("status"), "eq.ACTIVE");
      return json([{ organization_id: organizationA, role: "OWNER" }, { organization_id: organizationB, role: "MEMBER" }]);
    }
    assert.equal(request.searchParams.get("status"), "eq.ACTIVE");
    assert.ok(request.searchParams.get("id")?.includes(organizationA));
    return json([{ id: organizationA, name: "A", slug: "a" }, { id: organizationB, name: "B", slug: "b" }]);
  });
  const result = await listUserOrganizations(client, userId);
  assert.deepEqual(result.map((organization) => organization.role), ["OWNER", "MEMBER"]);
  assert.deepEqual(result.map((organization) => workspacePath(organization.id)), [`/workspace/${organizationA}`, `/workspace/${organizationB}`]);
});

test("users with no organizations get an actual empty list; missing schema is not an empty state", async () => {
  const client = database(async () => json([]));
  assert.deepEqual(await listUserOrganizations(client, userId), []);
  const missing = database(async () => json({ code: "PGRST205", message: "missing", details: "", hint: "" }, 404));
  await assert.rejects(listUserOrganizations(missing, userId), (error) => error instanceof OrganizationError && error.kind === "setup");
});

test("unexpected database role values fail safely at the service boundary", async () => {
  const client = database(async (url) => new URL(String(url)).pathname.endsWith("organization_members")
    ? json([{ organization_id: organizationA, role: "UNEXPECTED" }])
    : json([{ id: organizationA, name: "A", slug: "a" }]));
  await assert.rejects(listUserOrganizations(client, userId), (error) => error instanceof OrganizationError && error.kind === "unavailable");
});
