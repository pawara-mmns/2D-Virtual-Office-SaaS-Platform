// Explicit opt-in live negative-path checks. No signup, real password change,
// email submission, privileged key, or verification bypass is used here.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { before, after, test } from "node:test";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "../src/lib/supabase/config.ts";
import { startProductionApp } from "./helpers/production-app.mjs";

// Same precedence as a production Next.js start; loadEnvFile preserves existing
// process values. Values, provider response bodies, and cookies are never logged.
for (const path of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  if (existsSync(path)) loadEnvFile(path);
}
const config = getSupabaseConfig();
let app;

before(async () => {
  assert.ok(config, "Configure the Supabase URL and publishable key before live tests.");
  app = await startProductionApp();
}, { timeout: 15000 });
after(() => { app?.stop(); });

async function authRequest(path, options = {}) {
  try {
    return await fetch(config.url + "/auth/v1/" + path, {
      ...options,
      headers: { apikey: config.key, "Content-Type": "application/json", ...options.headers },
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    // A raw fetch exception can include the project hostname. Keep it private.
    throw new Error("The configured Supabase request could not be completed.");
  }
}

function formDataFromHtml(html) {
  const data = new FormData();
  const decode = (value) => value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const form = html.match(/<form\b[^>]*>([\s\S]*?)<\/form>/)?.[1];
  assert.ok(form, "Expected the server-rendered form.");
  for (const input of form.matchAll(/<input\b[^>]*>/g)) {
    const name = input[0].match(/\bname="([^"]*)"/)?.[1];
    if (name?.startsWith("$ACTION_")) {
      data.append(decode(name), decode(input[0].match(/\bvalue="([^"]*)"/)?.[1] ?? ""));
    }
  }
  assert.ok([...data.keys()].some((name) => name.startsWith("$ACTION_REF_")), "Expected Server Action form metadata.");
  return data;
}

test("configured browser and SSR clients initialize; no session authorizes no user", async () => {
  const browser = createBrowserClient(config.url, config.key, { isSingleton: false });
  const server = createServerClient(config.url, config.key, { cookies: { getAll: () => [], setAll: () => {} } });
  assert.ok(browser.auth);
  const { data } = await server.auth.getUser();
  assert.equal(Boolean(data.user), false);
});

test("live Auth health and settings accept the publishable key and require email verification", async () => {
  assert.equal((await authRequest("health")).status, 200);
  const response = await authRequest("settings");
  assert.equal(response.status, 200);
  const settings = await response.json();
  assert.equal(settings.external?.email, true);
  assert.equal(settings.disable_signup, false);
  assert.equal(settings.mailer_autoconfirm, false);
});

test("live user endpoint rejects a request without a user access token", async () => {
  assert.equal((await authRequest("user")).status, 401);
});

test("live provider rejects synthetic confirmation and recovery proof without issuing sessions", async () => {
  for (const type of ["email", "recovery"]) {
    const response = await authRequest("verify", {
      method: "POST",
      body: JSON.stringify({ token_hash: randomBytes(28).toString("hex"), type }),
    });
    assert.equal(response.status, 403);
    const result = await response.json();
    assert.equal(result.error_code, "otp_expired");
    assert.equal(Boolean(result.access_token || result.refresh_token), false);
  }
});

test("configured app enables auth forms and rejects invalid registration fields on POST", async () => {
  const response = await fetch(app.base + "/register");
  const html = await response.text();
  assert.equal(html.includes("Authentication is not configured"), false);
  assert.equal(/<fieldset[^>]*\sdisabled(?:=|[\s>])/.test(html), false);
  const form = formDataFromHtml(html);
  form.set("email", "invalid");
  form.set("password", "short");
  form.set("confirmPassword", "different");
  const result = await fetch(app.base + "/register", { method: "POST", body: form, headers: { Origin: app.base }, redirect: "manual" });
  assert.equal(result.status, 200);
  const page = await result.text();
  assert.ok(page.includes("Enter a valid email address."));
  assert.ok(page.includes("Passwords do not match."));
});

test("real email verification rejects invalid proof and external redirect destinations", async () => {
  const query = new URLSearchParams({ type: "email", token_hash: randomBytes(28).toString("hex"), next: "https://evil.example" });
  const response = await fetch(app.base + "/auth/confirm?" + query, { redirect: "manual" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/login?notice=invalid-link");
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("recovery cookie stays HttpOnly and scoped; invalid proof fails through the real reset action", async () => {
  const invalidHash = randomBytes(28).toString("hex");
  const query = new URLSearchParams({ type: "recovery", token_hash: invalidHash, next: "//evil.example" });
  const callback = await fetch(app.base + "/auth/confirm?" + query, { redirect: "manual" });
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get("location"), "/reset-password");
  const cookie = callback.headers.getSetCookie().find((value) => value.startsWith("vo-recovery-token="));
  assert.ok(cookie);
  for (const flag of [/HttpOnly/i, /Secure/i, /SameSite=Lax/i, /Path=\/reset-password/i, /Max-Age=600/i]) {
    assert.equal(flag.test(cookie), true, "Expected the recovery cookie security options.");
  }
  const cookieHeader = cookie.split(";")[0];
  const page = await fetch(app.base + "/reset-password", { headers: { Cookie: cookieHeader } });
  const html = await page.text();
  assert.equal(html.includes(invalidHash), false);
  const form = formDataFromHtml(html);
  // This is a non-account fixture; a password update must never be reached.
  form.set("password", "Invalid-proof-test-only-2026");
  form.set("confirmPassword", "Invalid-proof-test-only-2026");
  const response = await fetch(app.base + "/reset-password", {
    method: "POST", body: form, headers: { Origin: app.base, Cookie: cookieHeader }, redirect: "manual",
  });
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes("This reset link is invalid, expired, or already used."));
  assert.ok(response.headers.getSetCookie().some((value) => value.startsWith("vo-recovery-token=") && /Max-Age=0/i.test(value)));
  const dashboard = await fetch(app.base + "/dashboard", { redirect: "manual" });
  assert.equal(dashboard.status, 307);
});

test("forged expired session cookies cannot authorize dashboard access", async () => {
  const name = `sb-${new URL(config.url).hostname.split(".")[0]}-auth-token`;
  const fixture = { access_token: "invalid", refresh_token: "invalid", expires_at: 1, expires_in: 0, token_type: "bearer", user: { id: "untrusted", email: "untrusted@example.com" } };
  const value = "base64-" + Buffer.from(JSON.stringify(fixture)).toString("base64url");
  const response = await fetch(app.base + "/dashboard", { headers: { Cookie: `${name}=${value}` }, redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), app.base).pathname, "/login");
  assert.equal((await response.text()).includes("No workspace yet"), false);
  assert.match(response.headers.get("cache-control"), /no-store/);
});
