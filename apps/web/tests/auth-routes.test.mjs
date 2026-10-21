import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startProductionApp } from "./helpers/production-app.mjs";

let server;
let base;

before(async () => {
  server = await startProductionApp();
  base = server.base;
}, { timeout: 15000 });

after(() => { server?.stop(); });

test("foundation homepage and health endpoint remain available", async () => {
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes("Office concept"));
  const health = await fetch(base + "/api/health");
  assert.deepEqual(await health.json(), { status: "ok", service: "web" });
});

test("auth pages render accessible form controls without public caching", async () => {
  for (const path of ["/login", "/register", "/forgot-password"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const html = await response.text();
    assert.ok(html.includes('for="email"'));
    assert.ok(html.includes('name="email"'));
  }
});

test("unauthenticated dashboard requests redirect and never return protected content", async () => {
  const response = await fetch(base + "/dashboard?next=https://evil.example", { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal((await response.text()).includes("No workspace yet"), false);
});

test("malformed callback inputs stay local and discard token query parameters", async () => {
  for (const query of ["", "?type=invite&token_hash=bad", "?type=email&type=recovery&token_hash=bad", "?next=https://evil.example"]) {
    const response = await fetch(base + "/auth/confirm" + query, { redirect: "manual" });
    assert.equal(response.status, 303);
    const target = new URL(response.headers.get("location"), base);
    assert.equal(target.origin, base);
    assert.equal(target.pathname, "/login");
    assert.equal(target.searchParams.get("notice"), "invalid-link");
    assert.equal(target.searchParams.has("token_hash"), false);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  }
});

test("reset password without recovery proof only offers a new link", async () => {
  const response = await fetch(base + "/reset-password?type=recovery&next=//evil.example");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.ok(html.includes("Open the reset link"));
  assert.equal(html.includes('name="password"'), false);
});

test("organization creation and workspace routes reject unauthenticated requests", async () => {
  for (const path of ["/organizations/new", "/workspace/not-a-uuid", "/workspace/250d1968-67d7-4d3c-8846-92f26747d76d", "/workspace/250d1968-67d7-4d3c-8846-92f26747d76d/members"]) {
    const response = await fetch(base + path, { redirect: "manual" });
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal((await response.text()).includes("Your role:"), false);
  }
});

test("invitation links exchange proof for an HttpOnly cookie and a fixed clean URL without consuming it", async () => {
  // Synthetic syntax-valid proof only; no account or real invitation is used.
  const token = "test_invitation_proof_".padEnd(43, "a");
  const response = await fetch(`${base}/invite/${token}?next=https://evil.example`, { redirect: "manual" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/invite");
  assert.match(response.headers.get("set-cookie"), /vo-invitation=/);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(response.headers.get("set-cookie"), /Secure/i);
  assert.match(response.headers.get("set-cookie"), /SameSite=lax/i);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal((await response.text()).includes(token), false);
});

test("malformed invitations and token-free preview never expose secret fields", async () => {
  const malformed = await fetch(base + "/invite/malformed", { redirect: "manual" });
  assert.equal(malformed.status, 303);
  assert.equal(malformed.headers.get("location"), "/invite?notice=invalid");
  assert.equal(Boolean(malformed.headers.get("set-cookie")?.includes("vo-invitation=")), false);
  const preview = await fetch(base + "/invite");
  assert.equal(preview.status, 200);
  const html = await preview.text();
  assert.ok(html.includes("Open the invitation link"));
  assert.equal(html.includes('name="token"'), false);
  assert.equal(html.includes("Accept invitation</button>"), false);
  assert.match(preview.headers.get("cache-control"), /no-store/);
});
