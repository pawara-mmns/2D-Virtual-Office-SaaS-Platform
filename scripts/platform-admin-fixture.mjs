// Shared isolated SQL fixture. No hosted Supabase service or actual tenant data.
import { readFileSync, readdirSync } from 'node:fs';
export const fixtureId = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const fixtureSql = `
 create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
 create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,
   banned_until timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz);
 alter table auth.users enable row level security;
 create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
 grant usage on schema auth to anon,authenticated;
 insert into auth.users(id,email,email_confirmed_at) values
 ('${fixtureId(1)}','owner@fixture.invalid',now()),('${fixtureId(2)}','member@fixture.invalid',now()),
 ('${fixtureId(3)}','other@fixture.invalid',now()),('${fixtureId(4)}','unverified@fixture.invalid',null);
`;
export async function installFixture(db) {
  await db.exec(fixtureSql);
  for (const name of readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
}
