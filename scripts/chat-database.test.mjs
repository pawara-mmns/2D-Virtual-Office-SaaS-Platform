import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
test("chat migration, backfill, persistence, pagination and real PostgreSQL RLS with isolated synthetic identities", { timeout: 60_000 }, async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
      create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'$$;
      grant usage on schema auth to anon,authenticated;
      insert into auth.users select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'fixture'||i||'@chat-test.invalid',case when i<4 then now() else null end,null from generate_series(1,4) i;`);
    for (const name of ["20261021000100_organization_foundation.sql", "20261021000200_team_invitations.sql"]) await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    await db.exec(`select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',false); set role authenticated; select public.create_organization('Existing office backfill fixture',gen_random_uuid()); reset role;`);
    await db.exec(readFileSync(new URL("../supabase/migrations/20261022000100_workspace_chat.sql", import.meta.url), "utf8"));
    const audit = await db.query(readFileSync(new URL("../supabase/tests/workspace_chat_postflight.sql", import.meta.url), "utf8"));
    for (const [name, passed] of Object.entries(audit.rows[0].chat_postflight)) assert.equal(passed, true, name);
    assert.equal((await db.query("select count(*)::integer as n from public.chat_channels")).rows[0].n, 1, "existing office backfill");
    const before = (await db.query("select count(*)::integer as n from public.organizations")).rows[0].n;
    const notices = [];
    await db.exec(readFileSync(new URL("../supabase/tests/workspace_chat.sql", import.meta.url), "utf8"), { onNotice: (notice) => { if (notice.message?.startsWith("PASS:")) notices.push(notice.message); } });
    assert.ok(notices.length >= 14);
    assert.equal((await db.query("select count(*)::integer as n from public.organizations")).rows[0].n, before, "SQL suite rolls back organization fixtures");
    assert.equal((await db.query("select count(*)::integer as n from public.chat_messages")).rows[0].n, 0, "all message fixtures rolled back");
    console.info(`Executed ${notices.length} chat assertions plus explicit permission/error denials; local in-memory PostgreSQL only. No live accounts or remote migration.`);
  } finally { await db.close(); }
});
