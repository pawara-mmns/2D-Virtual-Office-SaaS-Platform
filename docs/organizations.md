# Organization foundation

Phase 1 — Step 3 adds authenticated workspaces backed by Supabase PostgreSQL.
The approved migration is applied to the confirmed development project. See
[validation status](organization-validation.md): authenticated provisioning and
cross-tenant execution still await dedicated verified test accounts.

## Application flow

- `/dashboard` lists the user's active organizations and current role, with a
  genuine empty state and Create workspace action when the list is empty.
- `/organizations/new` collects a name and a per-form idempotency request UUID.
  The authenticated Server Action validates both, invokes one SQL RPC, and
  redirects to the new workspace only after the transaction succeeds.
- `/workspace/[organizationId]` shows organization information, the verified
  caller's membership/role, and the default office. The workspace switcher lists
  only organizations returned for that user.

The URL selects the active organization. There is no client-stored tenant or role
used for authorization. Switching a URL triggers authorization again; a guessed
UUID does not grant access. No workspace HTTP JSON API is introduced. Mutations
use Next.js Server Actions with same-origin checks and explicit verified-user
authorization, including when the action is called directly.

Pages and data helpers call the existing `requireUser()` (fresh Supabase
`getUser()`, confirmed email). React `cache()` deduplicates identity checks only
within a server request, not across users/requests. Protected layouts authenticate
before route loading boundaries can stream a response. Pages and data helpers
still check authorization independently. Proxy handles session refresh and marks
organization/workspace responses private/no-store; it is not the access boundary.

## Schema

Migration: `supabase/migrations/20261021000100_organization_foundation.sql`.

| Table | Identity and relationships | Constraints |
| --- | --- | --- |
| `profiles` | `id` is `auth.users.id` | Own profile only; optional avatar key; no duplicate auth identity |
| `organizations` | UUID ID; `created_by` references Auth | Unique safe slug; ACTIVE/SUSPENDED; unique creator + request UUID |
| `organization_members` | UUID ID; organization FK and Auth user FK | Unique organization/user pair; OWNER/ADMIN/MEMBER; ACTIVE/INACTIVE |
| `offices` | UUID ID; organization FK | Unique organization ID: at most one office per organization |

All primary keys, foreign keys, timestamps, bounds, and status/role checks are
defined in the migration. Foreign/unique indexes cover organization membership,
office lookup, slugs, and provisioning retries. A partial index covers active
memberships by user. Updated timestamps are maintained by triggers. No map data,
map version tables, auth-user copy, or invitation tables are added. Future map
versions can reference the stable office UUID.

Profiles are provisioned lazily during first organization creation; no trigger is
attached to `auth.users`, and no existing Auth rows are changed or backfilled.
Display name defaults to empty and is not used as an authorization attribute.

## Atomic provisioning and retries

`public.create_organization(p_name text, p_request_id uuid)`:

1. Derives the caller from `auth.uid()` and requires the authenticated role and a
   non-deleted Auth user with `email_confirmed_at`.
2. Validates the name (1–80 characters, trimmed, no controls) and request UUID.
3. Takes a transaction-scoped advisory lock for the user/request pair. An exact
   unique constraint, not the hash, is the idempotency identity.
4. Returns the existing organization for an unchanged retry if the user still
   has active access; rejects reuse with changed input or removed access.
5. Creates a profile if needed, organization, OWNER membership, and Main office.
   PostgreSQL commits all changes together or rolls them all back.

The slug contains a normalized ASCII prefix and a random UUID suffix generated
inside PostgreSQL. Non-Latin-only names use a `workspace` prefix. Unique slug
collisions are retried up to five times; other constraint failures propagate and
roll back the transaction. Duplicate names are allowed and get distinct slugs.
The same form request can be safely retried after a lost response. A new form or
reload generates a new intent; it may create another workspace with the same name.

No browser-provided user ID, role, organization status, slug, or office payload is
accepted. Independent Supabase HTTP inserts are not treated as a transaction.

## Tenant isolation and roles

All four tables have RLS and explicit least-privilege grants. Anonymous users
have no data access or provisioning RPC execution. The application uses only its
publishable key and the caller's session; no service-role credential is needed.

| Capability | OWNER | ADMIN | MEMBER |
| --- | --- | --- | --- |
| Read active organization, membership rows, office | Yes | Yes | Yes |
| Rename own active organization/office through permitted SQL columns | Yes | Yes | No |
| Add members, change roles/status, transfer ownership, delete organization | Not exposed | Not exposed | Not exposed |

Only the controlled creation RPC can create organizations, memberships, and
offices. Membership writes have no authenticated grants or policies, so users
cannot grant themselves roles, forge membership, or reassign tenant IDs. Managers
receive only `UPDATE(name)` privileges, not unrestricted table updates. Rename UI
is not part of this step. Account/organization deletion and owner transfer require
a later design; the creator FK deliberately restricts deleting an owning Auth user.

Active membership in an active organization is checked from database rows on
each query. Inactive memberships and suspended organizations cannot read tenant
data. Membership SELECT is limited to rows within the same permitted organization;
other users' profiles/emails are not exposed. Profiles are readable/writable only
by their own user, with column grants protecting timestamps/identity updates.

Read-only helpers in `private` avoid circular membership RLS recursion. They have
fixed empty search paths, fully qualified table references, no caller-supplied
user ID, and EXECUTE only for authenticated users. They are owned by the trusted
migration role, which can inspect the RLS tables without recursive policy calls.
Keep `private` out of Supabase's exposed API schemas. The provisioning definer is
the only elevated public RPC; it validates the caller itself. Editable
`user_metadata` is never used for authorization.

## Migration workflow and required configuration

The web environment remains the two existing public Supabase variables in
`apps/web/.env` or `.env.local`. No service-role key or database password belongs
in a `NEXT_PUBLIC_*` variable. No local database, Docker stack, or new Supabase
project is required to prepare this migration.

Use `pnpm exec supabase` from the repository root for the CLI commands below
(verified CLI version: 2.121.0).
`supabase/config.toml` only names the CLI workspace; it does not link a project.
Store access/database credentials in secure CLI/OS configuration or ignored local
environment configuration, not in documentation or command history. Do not use
debug logging when sharing CLI output.

Before applying anything:

1. Authenticate the CLI, identify the existing project by ID/name, and explicitly
   confirm that it is DEVELOPMENT. Compare the linked project ID to the web URL's
   project reference. A `dev` label or this repository branch alone is not proof.
2. Link the confirmed project using `supabase link --project-ref <confirmed-ref>`.
   Do not choose an arbitrary project from the account inventory.
3. Run `supabase migration list --linked`. Review the existing remote history;
   do not repair history or blindly baseline an existing database.
4. Use read-only CLI schema inspection (`supabase db dump --linked --schema
   public,private --file <ignored-local-snapshot>`, or read-only `db query`) to
   inspect existing objects, owner/grants, and naming conflicts. Do not overwrite
   existing profiles or organizations tables with this foundation.
5. Run `supabase db push --linked --dry-run`. This shows pending migrations but
   does not execute/semantically validate SQL; combine it with schema inspection,
   syntax review, and the policy tests.
6. Review the concrete changes: four new public tables; indexes/constraints;
   updated-at triggers; RLS/grants; two private membership helpers; one public
   creation RPC. No DROP/TRUNCATE/DELETE, Auth-table modifications, or row reset
   is part of the migration. Existing name conflicts must stop application.
7. Obtain the user's explicit approval for this confirmed target/change set.
   Only then run `supabase db push --linked`, and recheck migration history.

Do not run `db reset`, create a new project, start a local database, use manual
Dashboard SQL, or apply to an unverified target. Missing CLI credentials/link,
unknown environment, divergent history, or existing conflicting objects block
application. Keep the migration ready rather than bypassing these checks.

After approval/application, regenerate public types with
`supabase gen types typescript --linked --schema public`, review the output, and
replace `apps/web/src/lib/supabase/database.types.ts`. Current types are explicitly
generated from the applied development public schema using that command.
SQL CHECK-constrained text columns generate as strings; the organization service
validates role values before exposing the domain role union to the UI.
Enable the standard public schema Data API as needed and keep `private` unexposed.

## Testing

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
pnpm test:live
pnpm test:organization-setup
pnpm test:organizations:anonymous
```

Unit tests use an isolated in-memory Supabase HTTP adapter to check validation,
RPC payloads, retry keys, safe errors, listing, and workspace links. They do not
prove SQL transaction or RLS behavior. Smoke tests check real production HTTP
redirects for anonymous dashboard/create/workspace access. The existing live suite
checks auth negative paths, not organization creation.

`test:organization-setup` checks the rollback runner's input/target guards locally.
`test:organizations:anonymous` makes five live public-key-only Data API requests:
all four table reads and provisioning must fail with insufficient privilege.
Neither command registers users or creates organization records.

`supabase/tests/organization_policies.sql` is a plain psql assertion suite, not
pgTAP. Run only on an explicitly approved isolated development database after the
migration, with three existing verified users registered normally. It switches
PostgreSQL authenticated-role claim contexts for A/B/C (not forged browser JWTs):
A owns A, B owns B, C is a MEMBER of A and ADMIN of B. It tests separate/shared
access, profiles, OWNER assignment, default office, retries/duplicate slugs,
renames, escalation/forgery rejection, inactive membership, anonymous access, and
rollback after intentionally failing office insertion. All application fixtures
and test DDL are enclosed in a rollback-only transaction. No Auth rows are edited.

Use a secure psql connection service, then supply only the three test user UUIDs:

```sh
psql "service=virtual-office-dev" -X -v ON_ERROR_STOP=1 -v confirm_development=yes -v user_a=<uuid> -v user_b=<uuid> -v user_c=<uuid> -f supabase/tests/organization_policies.sql
```

No database password is passed on the command line. Do not mistake successful
syntax parsing or mocked service tests for an executed policy suite. Also check
concurrent RPC requests with the same caller/request UUID on two connections:
both must return the same organization with one owner and office.

### Dedicated test accounts

No accounts were selected or created during verification. The owner must prepare
three dedicated accounts A, B and C before the live suite can run:

1. Confirm the existing development project is `rofutnholbtdmxccrkbs` and retain
   email/password signup and **Confirm email**. Check the exact Site URL, redirect
   allowlist and SSR confirmation email template in the
   [README configuration instructions](../README.md#supabase-dashboard-configuration).
2. Choose three distinct test inboxes you control. Start `pnpm dev`; use
   `http://localhost:3000/register` normally for each account, using separate
   browser profiles or signing out between accounts. Keep passwords private.
3. Open each real inbox and follow its signup confirmation email on the same
   configured local origin. Complete normal login and verify the dashboard loads.
   Do not use an admin-created/auto-confirmed user, edit `auth.users`, disable
   confirmation, or weaken policies. Account registration itself does not create
   organization fixtures.
4. If email delivery is blocked, resolve the project's SMTP recipient restrictions
   and rate limits. The default sender limits recipients; use permitted inboxes
   or owner-configured SMTP. Wait for rate limits rather than repeatedly retrying.
   Follow [Supabase password signup](https://supabase.com/docs/guides/auth/passwords)
   and [SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).
5. In the project's Authentication users view, copy only these three test users'
   UUIDs and verify confirmation. Do not select unrelated existing users or share
   passwords, access tokens, recovery links, or service-role keys.
6. Copy `supabase/.env.organization-tests.example` to
   `supabase/.env.organization-tests.local` and fill in `ORG_TEST_USER_A`,
   `ORG_TEST_USER_B`, and `ORG_TEST_USER_C`. The local file matches the existing
   `.env*` ignore rule; the example is explicitly allowed. It needs no passwords
   or tokens. Retain the exact project reference and development confirmation.

Run from the repository root with the existing authenticated CLI:

```sh
pnpm test:organizations --check
pnpm test:organizations
```

The first command checks local inputs/link/web target only. It does not establish
that accounts are confirmed. The second reconfirms the linked healthy project
inventory, validates all three identities against existing confirmed Auth users,
and runs the SQL suite via `supabase db query --linked --file`. Run CLI commands
sequentially; concurrent CLI login-role initialization produced a temporary
authentication error during verification and a sequential retry passed.

The runner resolves only validated UUID inputs into an ignored temporary SQL file
and removes it afterward. It preserves `BEGIN`/unconditional `ROLLBACK`, rejects
unexpected psql commands or COMMIT, and applies lock/statement timeouts. Successful
execution requires a result marker returned **after** the final rollback. Missing
accounts produce **NOT TESTED** (exit 2); configuration/SQL failures produce
**FAILED** (exit 1), never a success. Raw CLI output is suppressed to avoid
disclosing local configuration; inspect failures locally without sharing secrets.

Role contexts exercise the real database RLS under `authenticated` and `anon`.
The migration connection creates C's test memberships and a failure-injection
trigger only inside the uncommitted test transaction. These are isolated fixtures,
not application APIs or replacements for real browser sign-in. All organization,
profile, membership, office and test-DDL changes roll back. Auth rows are never
written. Tests on dedicated accounts avoid unrelated users; no existing workspace
rows are intentionally changed. The full account suite is **NOT TESTED** until
these accounts exist; local runner checks and anonymous tests cannot substitute.

Manual browser checklist after the approved migration:

- Confirm/login a test user, visit dashboard, create a workspace, and verify name,
  OWNER role and Main office. Retry one request and check no duplicate records.
- Create a second workspace and switch between both using the menu and URLs.
- In a separate browser profile, use B's account and attempt A's exact URL:
  unavailable response and no tenant data. Check C's two memberships separately.
- Test malformed IDs, signed-out access, inactive membership, suspended tenant,
  and all three roles. Do not weaken RLS or create an invitation API for fixtures.
- Check mobile layouts, keyboard navigation, pending creation, invalid names,
  and network failures. Without the migration, show setup errors rather than a
  fabricated empty organization list.

These authenticated browser checks and concurrent-request checks are still
NOT TESTED. Browser creation commits through separate requests and cannot see
uncommitted SQL fixtures; it is not covered by the rollback runner. No persistent
browser-test organizations were created in this step. Any later browser fixture
setup/cleanup must be explicitly scoped before executing it.

## Current limits

The Step 3 foundation itself excludes invitations and member management; these now
have a separately reviewed migration and implementation in
[Step 4](team-invitations.md). Profile editing, office entry/rendering,
game/realtime/voice, billing and deployment remain outside the implemented scope.
Workspace lists are intended for MVP volumes; pagination belongs with measured
usage growth. Live provisioning and tenant-isolation verification require the
approved migration and test identities. Preserve the distinction in the
[validation report](organization-validation.md).

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[database functions](https://supabase.com/docs/guides/database/functions), and
[migration workflow](https://supabase.com/docs/guides/local-development/database-migrations).
