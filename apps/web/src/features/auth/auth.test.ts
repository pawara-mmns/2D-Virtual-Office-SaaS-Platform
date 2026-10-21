import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthApiError, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { isTokenHash, parseConfirmation, safeAuthDestination } from "./links.ts";
import { applyRecoveryPassword, lookupVerifiedUser } from "./service.ts";
import { validateAuthForm, type AuthMode } from "./validation.ts";

const user: User = {
  id: "test-user", email: "person@example.com", email_confirmed_at: "2026-10-21T00:00:00Z",
  app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-10-21T00:00:00Z",
};
const session: Session = { access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user };
type AuthApi = Pick<SupabaseClient["auth"], "getUser" | "verifyOtp" | "updateUser" | "signOut">;

function authMock(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    getUser: async () => ({ data: { user }, error: null }),
    verifyOtp: async () => ({ data: { user, session }, error: null }),
    updateUser: async () => ({ data: { user }, error: null }),
    signOut: async () => ({ error: null }),
    ...overrides,
  };
}

function validate(mode: AuthMode, values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return validateAuthForm(mode, data);
}

test("registration validates email, password bounds, and confirmation on the server", () => {
  const invalid = validate("register", { email: "bad", password: "short", confirmPassword: "different" });
  assert.equal(invalid.valid, false);
  assert.deepEqual(Object.keys(invalid.fields).sort(), ["confirmPassword", "email", "password"]);
  const valid = validate("register", { email: "  person@example.com ", password: "a good passphrase", confirmPassword: "a good passphrase" });
  assert.equal(valid.valid, true);
  assert.equal(valid.email, "person@example.com");
  assert.equal(validate("register", { email: user.email!, password: "a".repeat(129), confirmPassword: "a".repeat(129) }).valid, false);
});

test("login allows existing short passwords and preserves password whitespace", () => {
  assert.equal(validate("login", { email: user.email!, password: "short" }).valid, true);
  assert.equal(validate("login", { email: user.email!, password: "  secret  " }).password, "  secret  ");
  assert.equal(validate("login", { email: user.email!, password: "" }).valid, false);
});

test("recovery only requires email; password reset requires matching new passwords", () => {
  assert.equal(validate("forgot-password", { email: user.email! }).valid, true);
  assert.equal(validate("forgot-password", { email: "a".repeat(255) + "@example.com" }).valid, false);
  assert.equal(validate("reset-password", { password: "a good passphrase", confirmPassword: "wrong" }).valid, false);
  assert.equal(validate("reset-password", { password: "a good passphrase", confirmPassword: "a good passphrase" }).valid, true);
});

test("redirects accept only the dashboard destination", () => {
  for (const input of ["https://evil.example", "//evil.example", "/\\evil.example", "%2f%2fevil.example", "/dashboard/../login", "/dashboard?next=https://evil.example", "/dashboard\r\nLocation: evil", null, ["/dashboard"]]) {
    assert.equal(safeAuthDestination(input), "/dashboard");
  }
  assert.equal(safeAuthDestination("/dashboard"), "/dashboard");
});

test("confirmation parser rejects missing, duplicate, unsupported and malformed inputs", () => {
  const hash = "a".repeat(56);
  for (const query of ["", "type=email", `token_hash=${hash}`, `type=invite&token_hash=${hash}`, "type=email&token_hash=bad", `type=email&type=recovery&token_hash=${hash}`, `type=email&token_hash=${hash}&token_hash=${hash}`, `type=email&token_hash=${hash}&next=/dashboard&next=//evil.example`]) {
    assert.equal(parseConfirmation(new URLSearchParams(query)), null);
  }
  assert.deepEqual(parseConfirmation(new URLSearchParams(`type=email&token_hash=${hash}&next=//evil.example`)), { tokenHash: hash, type: "email", next: "/dashboard" });
  assert.equal(isTokenHash("pkce_" + hash), true);
  assert.equal(isTokenHash("x".repeat(257)), false);
  assert.equal(isTokenHash("<script>".repeat(8)), false);
});

test("verified user lookup denies missing, unverified, anonymous, and revoked users", async () => {
  assert.deepEqual(await lookupVerifiedUser(authMock()), { status: "authenticated", user: { id: user.id, email: user.email } });
  assert.deepEqual(await lookupVerifiedUser(authMock({ getUser: async () => ({ data: { user: null }, error: new AuthApiError("missing", 400, "session_not_found") }) })), { status: "anonymous" });
  for (const invalid of [{ ...user, email_confirmed_at: undefined }, { ...user, email: undefined }, { ...user, is_anonymous: true }]) {
    assert.deepEqual(await lookupVerifiedUser(authMock({ getUser: async () => ({ data: { user: invalid }, error: null }) })), { status: "unverified" });
  }
  assert.deepEqual(await lookupVerifiedUser(authMock({ getUser: async () => ({ data: { user: null }, error: new AuthApiError("revoked", 401, "session_not_found") }) })), { status: "anonymous" });
});

test("verified user lookup fails closed on Auth outages", async () => {
  assert.deepEqual(await lookupVerifiedUser(authMock({ getUser: async () => { throw new Error("offline"); } })), { status: "unavailable" });
  assert.deepEqual(await lookupVerifiedUser(authMock({ getUser: async () => ({ data: { user: null }, error: new AuthApiError("offline", 503, "unexpected_failure") }) })), { status: "unavailable" });
});

test("password reset never updates a password without verified recovery proof", async () => {
  let updates = 0;
  const auth = authMock({
    verifyOtp: async () => ({ data: { user: null, session: null }, error: new AuthApiError("expired", 403, "otp_expired") }),
    updateUser: async () => { updates++; return { data: { user }, error: null }; },
  });
  assert.equal(await applyRecoveryPassword(auth, undefined, "a good passphrase"), "invalid-link");
  assert.equal(await applyRecoveryPassword(auth, "a".repeat(56), "a good passphrase"), "invalid-link");
  assert.equal(updates, 0);
});

test("recovery verifies the expected OTP type before updating, then signs out globally", async () => {
  const calls: string[] = [];
  const hash = "pkce_" + "a".repeat(56);
  const auth = authMock({
    verifyOtp: async (input) => { assert.deepEqual(input, { token_hash: hash, type: "recovery" }); calls.push("verify"); return { data: { user, session }, error: null }; },
    updateUser: async (input) => { assert.equal(input.password, "a good passphrase"); calls.push("update"); return { data: { user }, error: null }; },
    signOut: async (input) => { assert.equal(input?.scope, "global"); calls.push("signout"); return { error: null }; },
  });
  assert.equal(await applyRecoveryPassword(auth, hash, "a good passphrase"), "updated");
  assert.deepEqual(calls, ["verify", "update", "signout"]);
});

test("recovery handles update failures, Auth outages, and failed session revocation", async () => {
  const hash = "a".repeat(56);
  assert.equal(await applyRecoveryPassword(authMock({ updateUser: async () => ({ data: { user: null }, error: new AuthApiError("same", 422, "same_password") }) }), hash, "a good passphrase"), "same-password");
  assert.equal(await applyRecoveryPassword(authMock({ verifyOtp: async () => { throw new Error("offline"); } }), hash, "a good passphrase"), "unavailable");
  assert.equal(await applyRecoveryPassword(authMock({ signOut: async () => ({ error: new AuthApiError("offline", 503, "unexpected_failure") }) }), hash, "a good passphrase"), "updated-signout-failed");
  assert.equal(await applyRecoveryPassword(authMock({ signOut: async () => { throw new Error("offline"); } }), hash, "a good passphrase"), "updated-signout-failed");
});
