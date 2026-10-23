import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { preparePolicySql, validateTestConfiguration } from "./test-organizations.mjs";

// Synthetic UUIDs for local setup tests only; no CLI or network calls.
const users = ["7df17a9c-1c4c-472f-88d5-8d2db93e96a5", "250d1968-67d7-4d3c-8846-92f26747d76d", "16eb799f-5058-4a47-b638-8b8fc4a22f8b"];
const ref = "rofutnholbtdmxccrkbs";
const env = { ORG_TEST_PROJECT_REF: ref, ORG_TEST_CONFIRM_DEVELOPMENT: "yes", ORG_TEST_USER_A: users[0], ORG_TEST_USER_B: users[1], ORG_TEST_USER_C: users[2] };
const source = readFileSync(new URL("../supabase/tests/organization_policies.sql", import.meta.url), "utf8");

test("missing identities report not tested, without choosing real accounts", () => {
  assert.equal(validateTestConfiguration({}, ref, `https://${ref}.supabase.co`).ready, false);
});

test("setup requires three distinct UUIDs and exact development/link/web targets", () => {
  assert.equal(validateTestConfiguration(env, ref, `https://${ref}.supabase.co`).ready, true);
  for (const invalid of [
    { ...env, ORG_TEST_USER_B: users[0] },
    { ...env, ORG_TEST_USER_A: "'; commit; --" },
    { ...env, ORG_TEST_PROJECT_REF: "another-project" },
    { ...env, ORG_TEST_CONFIRM_DEVELOPMENT: "no" },
  ]) assert.throws(() => validateTestConfiguration(invalid, ref, `https://${ref}.supabase.co`));
  assert.throws(() => validateTestConfiguration(env, "another-project", `https://${ref}.supabase.co`));
  assert.throws(() => validateTestConfiguration(env, ref, "https://another-project.supabase.co"));
});

test("CLI suite preserves rollback and verified-user guard, resolving only UUID inputs", () => {
  const sql = preparePolicySql(source, users);
  assert.equal(/^\s*\\/m.test(sql), false);
  assert.equal(sql.includes(":'user_a'"), false);
  assert.ok(sql.includes("u.email_confirmed_at is not null"));
  assert.ok(sql.includes("set local role authenticated"));
  assert.ok(sql.includes("set local lock_timeout = '5s'"));
  assert.match(sql, /rollback;\s*select 'organization-policy-tests-rolled-back'::text as organization_test_result;\s*$/);
});

test("runner refuses commit, missing rollback, extra psql commands and SQL input injection", () => {
  assert.throws(() => preparePolicySql(source.replace("rollback;", "commit;"), users));
  assert.throws(() => preparePolicySql(source.replace("rollback;", ""), users));
  assert.throws(() => preparePolicySql(source + "\n\\include other.sql\n", users));
  assert.throws(() => preparePolicySql(source, ["'; commit; --", users[1], users[2]]));
});
