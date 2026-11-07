# Platform administration

**Current hosted-data integration:** See [the integration fix, observed counts, configuration and read-only limits](platform-admin-data-integration.md). Administrator identity/MFA storage and tenant data now have separate, validated sources. The local bootstrap database is not used as an automatic fallback for hosted tenant statistics.

Implemented locally on 3 November 2026. No branch, commit, push, merge, deployment, remote migration, hosted administrator, or real tenant change was made.

## Architecture audit and implementation

The web app uses Next.js App Router, Supabase SSR cookies, `requireUser()`, and fixed-caller organization/team RPCs. Normal identity remains `auth.users`; optional profile fields are in `public.profiles`. Organizations have `ACTIVE`/`SUSPENDED` status, a verified creator and an idempotency UUID. `organization_members` has `OWNER`/`ADMIN`/`MEMBER` roles and `ACTIVE`/`INACTIVE` status. Each organization has one office. Existing invitation hashes, capacity reservations, delivery versions, last-owner triggers, office environment validation, and environment revisions are reused.

Colyseus independently verifies normal Supabase bearer tokens, tenant membership and office access, then revalidates active connections. Existing environment polling and map fingerprints retire changed rooms using `ENVIRONMENT_CHANGED_CODE`; geometry is never replaced under active players. LiveKit retains its existing admission authority and microphone-only grants. Administration never reads audio, recordings, messages, voice content, or private conversation content.

The implementation adds:

- `/superadmin/login`, `/superadmin`, `/superadmin/organizations`, `/superadmin/users`, `/superadmin/offices`, `/superadmin/system`, `/superadmin/audit-logs`, `/superadmin/security`.
- Independent usernames and Argon2id password hashes (64 MiB, three passes, one lane). No Supabase Auth registration or organization membership is required for administrators.
- Password-verified pending sessions, mandatory TOTP enrollment/verification, AES-256-GCM encryption bound to the administrator UUID, a ±1 time-step verification window and atomic replay prevention. Use a correctly synchronized server clock.
- Random 256-bit opaque cookies; only SHA-256 digests are stored in the database. Sessions rotate on MFA and reauthentication. Full sessions expire in eight hours and after thirty idle minutes; pending sessions expire in ten minutes. Password changes revoke every device and increment the credential version. Logout and logout-all revoke server-side sessions.
- Durable per-username and global login throttles, per-account MFA throttles, and a fifteen-minute lockout after five failed password/MFA attempts. Submitted unknown usernames are hashed for throttle buckets. Throttled global requests do not create additional account buckets.
- Strict exact-origin checks, `SameSite=Strict` cookies and an independent HttpOnly double-submit CSRF cookie for every mutation, including login. Cookies are `Secure` and `__Host-` prefixed on HTTPS, with a loopback HTTP development exception. Bodies and strings are bounded. Private pages/API responses are uncached, unframeable and excluded from indexing.
- Server-only database/Auth clients. `requirePlatformAdmin()` ignores Supabase sessions and browser role values. Every data endpoint checks identity; every data mutation rechecks the live session and recent MFA inside its database transaction. A shared administrator row lock serializes changes against session revocation and credential changes.
- An append-only audit table. Successful database changes and their audit record commit together; failures are recorded separately after rollback. External operations write intent first, then result. Audit includes actor, target, action, result, timestamp, request UUID and selected before/after fields. Secrets are excluded. Unknown/unauthenticated actors are null; invalid target input is logged at the route level without copying arbitrary input.

The protected login uses a separate database role, never the migration owner or a client-side RLS exception. Organization owners retain their original permissions and cannot become platform administrators by setting a role or presenting their normal session.

## Migration and database access

New additive migration: `supabase/migrations/20261103000100_platform_administration.sql`.

Private tables are in **`platform_private`**, distinct from the existing helper schema `private`:

| Table | Purpose |
| --- | --- |
| `platform_admins` | Independent administrator identities, credentials, encrypted TOTP and lockout state |
| `platform_admin_sessions` | Hashed, revocable sessions, expiry, activity and MFA verification |
| `platform_admin_throttles` | Shared durable attempt buckets |
| `platform_admin_audit_logs` | Append-only, sanitized security and administration events |
| `platform_settings` | Validated singleton settings with optimistic version checks |
| `organization_features` | Organization-level voice availability |
| `user_restrictions` | Immediate local account suspension, including when Auth provider synchronization fails |

`public.offices.is_available` is additive. Existing tenant RLS helpers additionally check maintenance, Supabase account bans and local restrictions. Office availability is enforced by a restrictive tenant policy. Existing public RLS grants stay narrow; only the dedicated backend role receives additional policies.

`platform_private.user_directory` is an explicit, private security-barrier view of selected safe Auth fields. The runtime receives no direct read/write privilege on `auth.users`. The projection supports managed Auth tables with RLS enabled without changing their policies, and excludes password hashes, metadata, tokens and MFA configuration. The isolated Auth fixture enables RLS to verify this boundary.

Account suspension locks the target identity, refuses active owners, and commits the local restriction before calling the supported Supabase Auth Admin ban API. Member promotion locks the same identity and rejects suspended accounts. This prevents an ownership/suspension race and blocks old JWTs. If the provider cannot confirm a ban, local platform access remains suspended and the console tells the operator to retry synchronization. Reactivation removes the provider ban before clearing the local restriction. No application code directly updates `auth.users`.

The migration creates **`platform_admin_runtime NOLOGIN`**. An operator must provision a separate restricted LOGIN and grant it only this role. Set `PLATFORM_ADMIN_DATABASE_URL` to that login. The application and bootstrap CLI reject superuser/BYPASSRLS connections. Use inherited membership, verified TLS for remote connections, appropriate connection pooling, and network restrictions. Do not grant this login ownership, CREATE, superuser, BYPASSRLS, `service_role`, or unrelated roles. The runtime can insert/read audit events but cannot update/delete them; a trigger also rejects owner-level update/delete attempts. Database owners remain the trusted offline recovery boundary.

Do not expose `platform_private` through PostgREST/Data API. Anon and authenticated clients have no private-table access. The only public projections are a fixed-caller, membership-bound office feature/version RPC and a restricted registration hook. Neither exposes administrator identities or secrets.

**Migration history gate:** `docs/modular-office-environments.md` records that remote environment objects exist while migration `20261029000100` is absent from remote migration history. That record was reviewed. This task did not connect to the remote database or repair history. Before any future remote application, reconcile the actual object definitions and migration ledger through the normal reviewed process; do not blindly replay existing SQL or use a database reset. This task applied SQL only to disposable local PostgreSQL/PGlite fixtures.

## Management behavior

- **Organizations:** paginated search and status filter; detail sections for owners/members, office environments and open invitations; rename; suspension/reactivation; voice availability; explicit ownership transfer; creation through the existing atomic `create_organization` provisioning function with a selected verified normal user as owner. Admins never become members implicitly. Provisioning respects onboarding limits and existing idempotency keys.
- **Users:** paginated search by email, profile name or exact UUID; safe profile and account projections; membership detail; profile edits; suspension/reactivation; supported recovery emails. Memberships/roles are edited through the organization record with ten-seat and owner constraints. Invitations reuse existing organization invitation creation, token hashing, delivery versions, reserved seats and Resend email delivery. Platform-initiated invitations attribute the request to platform administration in email/audit while preserving the existing domain's required normal-user inviter field. Owners can resend/revoke through the existing interface.
- **Offices:** organization filter, versioned environment/catalog inspection, valid layout/theme/decor/furniture choices, branding overrides, availability, optimistic revision checks and explicit safe room retirement. Environment changes use existing polling; an operational reload uses a serialized retirement queue and the established reconnect code, even if geometry is unchanged.
- **Settings:** maintenance, registration, onboarding, platform voice availability, and a maximum of 1–100 organizations created per user. These do not change the existing ten-seat capacity. Updates require the expected settings version, recent MFA, and typing `APPLY PLATFORM SETTINGS`. Tenant database enforcement is immediate; realtime authorization reads versioned feature flags and revalidates existing leases.
- **Dashboard:** actual database counts separately labeled from live observations. A key-protected server-to-server endpoint reports connected players, active rooms and observed voice admissions from the single existing realtime authority. Voice inventory outages and unconfigured telemetry display **Unavailable**, never zero. Recent admin actions and existing team events are separately shown. No persistent analytics/presence history is invented.
- **Audit/security:** searchable, paginated audit records and sanitized details; authenticator enrollment, reauthentication, password change, active session inspection, logout and logout-all. Every management mutation requires MFA verified in the preceding five minutes. Sensitive operations also require typing the target name or user UUID. Root deactivation/deletion and last-admin removal are blocked; administrator lifecycle is an offline operator responsibility.

## Safe local setup

**Current configured environment (5 November 2026):** the existing administrator identity was migrated with approval to the hosted Supabase project's private schema. The app now uses a restricted login through the IPv4 session pooler with verified TLS. Docker is no longer required for administrator login. Run `pnpm.cmd admin:check:auth` for a read-only check of the active hosted connection. Existing password and MFA enrollment were retained; sign in afresh because old local sessions were not copied. See [the hosted identity cutover report](platform-admin-hosted-cutover.md). Do not run local setup/bootstrap/recovery to troubleshoot this hosted identity.

For an **existing** local administrator whose login suddenly reports a database outage, first start Docker Desktop and its existing `supabase_db_virtual-office` container, then run `pnpm.cmd admin:check:auth`. This command uses the application's saved restricted credentials and read-only SQL to check the private identity tables and account/MFA flags. It never attempts a password login or decrypts MFA. An outage does not require setup, migrations, bootstrap, password recovery, or new keys. See [the login outage investigation](platform-admin-login-fix.md) for the verified cause and the separately reviewed hosted identity option.

For a new isolated local environment with Docker Desktop running, run `pnpm.cmd admin:setup:local` from the repository root. This starts the project's genuine local Supabase database/Auth/API services, applies pending migrations **locally only**, provisions a restricted database login, and writes the server-only connection, MFA encryption key and local Auth admin configuration into ignored `apps/web/.env.local`. CLI key output is captured rather than printed. Re-running preserves the existing runtime password and encryption key. Existing normal-user Supabase settings are preserved; this console operates on separate local development data and will not list hosted tenants. It does not create the administrator account: run `pnpm.cmd admin:bootstrap` afterwards and choose your credentials interactively. No database reset, seed, hosted migration, or real tenant change is performed.

1. Prepare an **isolated local development Supabase/PostgreSQL database**. Apply the repository's versioned migrations in order to this database only. The Auth schema and `anon`, `authenticated`, `supabase_auth_admin` roles must already exist in a real Supabase instance. The test harness creates synthetic equivalents in its disposable database.
2. Provision a dedicated restricted database LOGIN using your normal secure database administration process. Grant `platform_admin_runtime`, with inherited privileges. Keep its credentials in your local secret store. Do not put credentials into source code, command arguments, logs, screenshots, or shell history.
3. Configure the server-only values described in `apps/web/.env.example`: `PLATFORM_ADMIN_DATABASE_URL`, `PLATFORM_ADMIN_ORIGIN` (exact origin, e.g. your local loopback URL), and `PLATFORM_ADMIN_MFA_KEY` (32 cryptographically random bytes encoded as 64 hex characters). Inject the encryption key through your secret manager. Back it up securely; loss requires offline MFA recovery. All web instances must use the same key. Normal Supabase public configuration remains unchanged.
4. For account administration, provide the separate server-only `SUPABASE_SECRET_KEY`; optionally set `SUPABASE_ADMIN_URL` for a self-hosted Auth service. Never prefix these with `NEXT_PUBLIC_`. For invitation delivery use the existing Resend/verified-sender configuration and email delivery mode. For operations set a shared random `PLATFORM_OPERATIONS_KEY` of at least 43 characters on both services and a trusted `REALTIME_INTERNAL_URL` (HTTPS remotely; loopback HTTP locally).
5. In an interactive local terminal run `pnpm admin:bootstrap` (Windows PowerShell may require `pnpm.cmd admin:bootstrap`). It loads local web env files, prompts for the username and **hidden** password twice, and creates exactly one initial root identity. Lowercase login names of 3–64 characters may include email-style names such as `admin@example.com`; this is an independent administrator identifier, with no Supabase signup or email verification implied. Passwords require 15–128 characters and at least eight distinct characters. No credentials are accepted in CLI arguments. No temporary bootstrap credential is written to disk or left in environment variables. Concurrent/repeated bootstrap attempts are serialized and rejected after the initial identity exists.
6. Start the local web app. Visit `/superadmin/login`, enter the interactive credentials and enroll an authenticator. The setup key is displayed only after password verification in the pending session; enter the first six-digit code to activate privileged access. No public admin signup exists.
7. In the local Supabase dashboard configure **Before User Created** to use `public.platform_before_user_created`. This is necessary to enforce registration settings against direct Supabase signup API calls as well as the web form. The function is executable only by `supabase_auth_admin`. Verify the hook locally before activation. Without it the normal registration UI is gated but direct Auth signup remains governed by the provider configuration.

### Offline root recovery

Use the trusted local operator environment with the restricted database login and run `pnpm admin:bootstrap --recover`. Enter the existing root username, type `RECOVER ROOT`, and provide the new hidden password twice. Recovery changes the password, increments the credential version, revokes all sessions, clears the enrolled authenticator, and writes `admin.offline_recovery`. It does not create another root or disable MFA: the next login must enroll a new authenticator before any platform access. There are no web recovery codes, default passwords, secret login URLs, or fallback authentication bypasses.

If the root was disabled by an out-of-band database owner, the same owner must restore the intended active root before using recovery. Keep database and encryption-key recovery access separately protected. Additional administrator identities, when needed, must be provisioned by an audited offline operator process; there is no public or in-console administrator creation/deletion screen.

### Operational retention

Expire/revoke sessions through database maintenance and archive audit events through a separately authorized operator/retention process. Runtime audit records intentionally cannot be deleted or rewritten. Throttle buckets may be cleaned after their window by a separate maintenance identity. Define backup, retention, database log redaction, monitoring and key rotation before production activation. Do not log admin request bodies or cookie/authorization headers in reverse proxies, error tracking or database query capture. Existing Next request/function logging is restricted accordingly.

## Validation and evidence

All credentials used by automated tests are randomly generated **synthetic local values**, kept in process memory. Screenshots contain only local fixture data. The native PostgreSQL harness initializes a new loopback-only cluster under ignored `.cache/admin-acceptance-*`, uses a restricted runtime login, and shuts it down in `finally`. It never uses the project's configured tenant database. Its local Auth Admin HTTP stub represents provider behavior; it does not establish real Supabase provider acceptance. `ADMIN_TEST_PG_BIN` selects an installed native PostgreSQL bin directory; `OFFICE_TEST_BROWSER` selects Chrome/Edge/Brave. Tests skip the native/browser portion if the executable is absent, which must not be mistaken for a pass.

| Check | Scope |
| --- | --- |
| `pnpm lint` | Web and realtime ESLint |
| `pnpm typecheck` | App route types and TypeScript, including tests |
| `pnpm build` | Production Next.js and realtime builds |
| `pnpm test` | Normal auth, organization, rendering, proximity, chat, voice and new security/operations unit tests |
| `pnpm test:admin:database` | Real isolated PostgreSQL execution via PGlite, private grants/RLS, bootstrap, MFA, replay, session expiry/revocation, cross-tenant CRUD, ownership, settings, suspension and audits; existing foundation/team/profile SQL suites after the new migration |
| `pnpm test:admin:http` | Production Next.js with native disposable PostgreSQL; real login/MFA cookies and CSRF, account Auth API stub, management HTTP, secret bundle scan and actual responsive browser navigation/forms |
| Existing `test:smoke`, `test:voice:routes` | Regular auth redirects, invitation cookies, unauthenticated route protection, voice origin/input checks and deferred/secret-free browser bundles |

Final execution results are recorded in `docs/platform-admin-validation.md`. Authenticated manual acceptance using real Supabase/LiveKit/Resend accounts was **not performed**. No real email, recovery link or voice call was triggered.

Screenshots: [login](assets/platform-admin/01-login-desktop.png), [dashboard](assets/platform-admin/02-dashboard-desktop.png), [organizations](assets/platform-admin/03-organizations-desktop.png), [details](assets/platform-admin/04-organization-details.png), [users](assets/platform-admin/05-users-desktop.png), [offices](assets/platform-admin/06-offices-desktop.png), [settings](assets/platform-admin/07-settings-desktop.png), [audit](assets/platform-admin/08-audit-desktop.png), [security](assets/platform-admin/09-security-desktop.png), [tablet](assets/platform-admin/10-dashboard-tablet.png), [mobile](assets/platform-admin/11-dashboard-mobile.png), [mobile directory](assets/platform-admin/12-organizations-mobile.png), [empty](assets/platform-admin/13-empty-state-mobile.png), [network error](assets/platform-admin/14-error-state-mobile.png).

## Local manual acceptance checklist

- [ ] In isolated local Supabase, verify normal login, email verification, recovery, owner/member access and invitations still work.
- [ ] Bootstrap through the interactive CLI; confirm duplicate bootstrap refusal and no privileged access before MFA. Try wrong passwords/codes, replayed codes and throttling.
- [ ] Confirm a genuine organization OWNER's Supabase session cannot access any admin page/API. Test forged role/cookie input and cross-origin mutations.
- [ ] Verify HTTPS `__Host-`/Secure/HttpOnly/Strict cookies, logout, idle expiry, full expiry, logout-all, password change and session revocation on a second device.
- [ ] Reauthenticate with a fresh code, create an organization for a verified user, inspect its owner/main office, change its name and manage its membership. Verify invalid/unverified ownership transfers fail.
- [ ] Suspend a synthetic organization with connected users; check web, chat, Colyseus and voice leases revoke access. Reactivate and rejoin normally. Test user suspension and provider synchronization failure; transfer active ownerships first.
- [ ] Edit the office environment with another owner form open; confirm stale revisions fail and geometry changes retire the room safely. Test explicit operational reload without changing the map. Another tenant must remain connected.
- [ ] Verify global/organization voice flags revoke existing admissions and deny new ones, without capturing voice content. Compare telemetry with actual observed clients. Make the provider unavailable and confirm Unavailable is shown.
- [ ] Activate the local registration hook; test UI and direct Auth signup with registration disabled. Test maintenance and onboarding gates, version conflicts and selected limits.
- [ ] Send an invitation/recovery email only to a controlled test mailbox, verify existing acceptance/recovery flows and owner resend/revoke behavior.
- [ ] Inspect audit success/denial/failure and request correlation, including provider outages. Check no passwords/tokens/TOTP secrets or private content is present.
- [ ] Exercise keyboard, narrow/mobile tables, detail focus, loading, empty and offline states. Test offline root recovery and mandatory re-enrollment using a disposable admin identity.

## Activation requirements and limits

Activation remains a separate operator task: reconcile migration history, review/apply the additive migration, provision the restricted login, configure the Auth registration hook and server secrets, validate native Argon2 binaries on the target runtime, arrange verified TLS/network access, and release matching web/realtime versions. No deployment was done here.

The existing domain has no archive status or permanent organization deletion flow; suspension is the available reversible control. There is no silent impersonation, infrastructure-secret editor, shell, arbitrary SQL, uploaded geometry, message-content inspector or voice recording tool. Administration has one authority level; finer administrator privileges and multi-admin lifecycle screens are future work. Audit retention and MFA encryption-key rotation need an operator procedure. Aggregate database counts are queried on demand and can become expensive at very large scale; directories are bounded at 25 rows, and multi-record detail sections are paginated. Live counts cover the existing single realtime authority and observed platform voice admissions, not arbitrary LiveKit rooms or historical analytics.

Provider operations cannot form one ACID transaction with PostgreSQL. Intent and result are durable; ambiguous failures require an operator to inspect and retry safely. Invitations are saved before delivery; a failed/ambiguous email retains its seat and can be managed using the existing owner flow. Core runtime functions tolerate only the genuinely missing additive office-feature RPC during pre-migration rollout; once installed, null/permission/dependency failures fail closed. The deployment review should include abuse controls at the trusted edge in addition to database throttling, connection pooling, operational monitoring and an independent security review.

Primary references used for supported behavior: [Supabase Auth Admin updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [Supabase database function security](https://supabase.com/docs/guides/database/functions), [PostgreSQL secure function definitions](https://www.postgresql.org/docs/16/sql-createfunction.html).
