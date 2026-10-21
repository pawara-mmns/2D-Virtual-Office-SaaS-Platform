import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { preparePolicySql } from "./test-organizations.mjs";

// A disposable, empty in-memory PostgreSQL database. These are synthetic local
// fixture identities, never Supabase Auth accounts or copied production data.
const users = ["7df17a9c-1c4c-472f-88d5-8d2db93e96a5", "250d1968-67d7-4d3c-8846-92f26747d76d", "16eb799f-5058-4a47-b638-8b8fc4a22f8b"];
test("isolated PostgreSQL executes both migrations and rollback-only team/RLS assertions", async () => {
  const notices = [];
  const db = new PGlite();
  try {
    const version = await db.query("select current_setting('server_version') as version");
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    `);
    await db.exec(`create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
      grant usage on schema auth to anon,authenticated;
      insert into auth.users(id,email,email_confirmed_at) values
      ('${users[0]}','a@team-test.invalid',now()),('${users[1]}','b@team-test.invalid',now()),('${users[2]}','c@team-test.invalid',now()),
      ('00000000-0000-4000-8000-000000000004','unverified@team-test.invalid',null);`);
    for (const file of ["20261021000100_organization_foundation.sql", "20261021000200_team_invitations.sql"]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    }
    const sql = preparePolicySql(readFileSync(new URL("../supabase/tests/team_invitations.sql", import.meta.url), "utf8"), users);
    const results = await db.exec(sql, { onNotice: (notice) => { if (notice.message?.startsWith("PASS:")) notices.push(notice.message); } });
    assert.equal(results.at(-1).rows[0].organization_test_result, "organization-policy-tests-rolled-back");
    assert.ok(notices.length >= 35, `Expected executed assertions; got ${notices.length}`);
    const foundationNotices = [];
    const foundation = preparePolicySql(readFileSync(new URL("../supabase/tests/organization_policies.sql", import.meta.url), "utf8"), users);
    const foundationResults = await db.exec(foundation, { onNotice: (notice) => { if (notice.message?.startsWith("PASS:")) foundationNotices.push(notice.message); } });
    assert.equal(foundationResults.at(-1).rows[0].organization_test_result, "organization-policy-tests-rolled-back");
    assert.ok(foundationNotices.length >= 20, "Existing foundation SQL regression assertions must execute.");
    const avatar = preparePolicySql(readFileSync(new URL("../supabase/tests/avatar_profiles.sql", import.meta.url), "utf8"), users);
    const avatarResults = await db.exec(avatar);
    assert.equal(avatarResults.at(-1).rows[0].organization_test_result, "organization-policy-tests-rolled-back");
    const remaining = await db.query("select (select count(*) from public.organizations)+(select count(*) from public.organization_members)+(select count(*) from public.organization_invitations)+(select count(*) from public.profiles)+(select count(*) from private.organization_team_events) as remaining");
    assert.equal(Number(remaining.rows[0].remaining), 0, "All application/audit fixtures must roll back.");
    await db.exec(`begin; select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004"}',true); set local role authenticated;
      do $$ begin
        begin perform public.accept_organization_invitation(repeat('a',64)); raise exception 'Unverified user accepted';
        exception when insufficient_privilege then null; end;
      end $$; reset role; rollback;`);
    console.log(`PostgreSQL ${version.rows[0].version}: executed ${notices.length} team and ${foundationNotices.length} existing foundation assertions, plus avatar self-update/name-preservation/cross-user/anonymous guards; fixtures rolled back. Unverified synthetic local identity rejected. No live Supabase or concurrent sessions tested.`);
  } finally { await db.close(); }
}, { timeout: 60000 });
