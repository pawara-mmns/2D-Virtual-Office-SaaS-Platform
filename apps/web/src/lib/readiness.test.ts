import assert from "node:assert/strict";
import { test } from "node:test";
import { createReadinessCheck, supabaseReadiness } from "../../../../packages/shared/src/readiness.ts";
import { createWebReadiness } from "./readiness.ts";

const config = { url: "https://fixture.supabase.co", key: "sb_publishable_fixture" };
const development = { NODE_ENV: "development", APP_URL: "http://localhost:3000", NEXT_PUBLIC_REALTIME_URL: "http://localhost:2567", INVITATION_DELIVERY_MODE: "link" };
const production = { ...development, NODE_ENV: "production", APP_URL: "https://office.example.test", NEXT_PUBLIC_REALTIME_URL: "https://realtime.example.test", INVITATION_DELIVERY_MODE: "email", RESEND_API_KEY: "fixture-private-key", INVITATION_FROM_EMAIL: "invites@example.test" };
const healthy: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
  assert.equal(new Headers(init?.headers).has("authorization"), false, "No user or privileged bearer in probes");
  if (url.pathname === "/ready") return Response.json({ status: "ready" });
  assert.equal(new Headers(init?.headers).get("apikey"), config.key);
  if (url.pathname === "/auth/v1/health") return Response.json({});
  assert.equal(url.pathname, "/rest/v1/profiles"); assert.equal(url.searchParams.get("limit"), "0");
  assert.equal(init?.method ?? "GET", "GET");
  return Response.json({ code: "42501", message: "private provider diagnostic" }, { status: 401 });
};

test("readiness uses anonymous zero-row permission checks and exposes fixed statuses only", async () => {
  const report = await createWebReadiness(development, config, healthy)();
  assert.equal(report.status, "ready");
  assert.deepEqual(Object.keys(report.checks), ["configuration", "authentication", "database", "realtime"]);
  assert.equal(JSON.stringify(report).includes("fixture"), false);
  assert.equal(JSON.stringify(report).includes("provider"), false);
  assert.equal(JSON.stringify(report).includes("http"), false);
  assert.equal((await createWebReadiness(production, config, healthy)()).status, "ready");
});

test("production readiness rejects development link mode, HTTP public origins, missing email config and secret-like targets", async () => {
  for (const change of [
    { INVITATION_DELIVERY_MODE: "link" }, { APP_URL: "http://localhost:3000" }, { RESEND_API_KEY: "" },
    { NEXT_PUBLIC_REALTIME_URL: "http://localhost:2567" }, { REALTIME_INTERNAL_URL: "http://remote.example.test" },
    { REALTIME_INTERNAL_URL: "https://user:private@realtime.example.test" }, { NEXT_PUBLIC_REALTIME_URL: "https://realtime.example.test/path" },
  ]) {
    const report = await createWebReadiness({ ...production, ...change }, config, healthy)();
    assert.equal(report.status, "not_ready"); assert.equal(report.checks.configuration, "unavailable");
  }
  assert.equal((await createWebReadiness(production, null, healthy)()).checks.authentication, "unavailable");
  assert.equal((await createWebReadiness({ ...production, REALTIME_INTERNAL_URL: "http://127.0.0.1:2567" }, config, healthy)()).status, "ready", "TLS may terminate at a trusted proxy; server-only loopback is permitted");
});

test("a healthy web process never masks a dependency outage, redirect, missing schema or unexpected public table grant", async () => {
  for (const response of [
    () => Response.json({ code: "PGRST205" }, { status: 404 }),
    () => Response.json({ code: "invalid_api_key" }, { status: 401 }),
    () => Response.json([], { status: 200 }),
    () => new Response(null, { status: 302, headers: { Location: "https://untrusted.example" } }),
  ]) {
    const probe = createReadinessCheck(supabaseReadiness(config, async () => response()));
    assert.equal((await probe()).checks.database, "unavailable");
  }
  const report = await createWebReadiness(development, config, async () => { throw new Error("private endpoint and credentials"); })();
  assert.equal(report.status, "not_ready"); assert.equal(report.checks.configuration, "ready");
  assert.equal(JSON.stringify(report).includes("private"), false);
});

test("concurrent probes coalesce, cache briefly, and recover after dependency failure without an automatic retry loop", async () => {
  let time = 1000, calls = 0, online = false;
  const probe = createReadinessCheck({ dependency: async () => { calls++; await new Promise(resolve => setImmediate(resolve)); return online; } }, () => time);
  const results = await Promise.all(Array.from({ length: 100 }, () => probe()));
  assert.equal(calls, 1); assert.ok(results.every(result => result.status === "not_ready"));
  online = true; time += 4999; assert.equal((await probe()).status, "not_ready"); assert.equal(calls, 1);
  time += 2; assert.equal((await probe()).status, "ready"); assert.equal(calls, 2);
});

test("a stalled dependency is aborted within the bounded readiness deadline and does not reveal exceptions", { timeout: 5000 }, async () => {
  let signal: AbortSignal | undefined;
  const probe = createReadinessCheck({ dependency: value => { signal = value; return new Promise<boolean>(() => {}); } });
  const started = performance.now();
  const report = await probe();
  assert.equal(report.status, "not_ready"); assert.equal(signal?.aborted, true);
  assert.ok(performance.now() - started < 4500);
});
