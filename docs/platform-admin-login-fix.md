# Administrator login outage investigation

Investigated locally on 5 November 2026. No existing database was reset, no existing schema was migrated, no administrator password or MFA enrollment was changed, and no production tenant data was changed. No branches, commits, pushes, merges, or deployments were created. Hosted schema inspection was read-only.

**Subsequent approved work:** the user then approved creating the hosted private identity schema and transferring the existing administrator, and separately approved the local URL switch/web restart required by automatic approval review. That move is complete; the app now uses hosted Supabase for independent administrator authentication. The investigation below records the pre-migration state. See [the cutover report](platform-admin-hosted-cutover.md) for the current configuration and validation.

## Exact root cause and failing operation

`apps/web/.env.local` configures the independent administrator identity database at `127.0.0.1:54322/postgres`. At investigation start that TCP port returned **ECONNREFUSED**, local Supabase API port 54321 also refused connections, and Docker reported its engine pipe was absent. The web process on port 3000 was running. Starting the installed Docker Desktop in the background automatically restored the existing five project containers, including the healthy database. The saved database credentials then worked without edits.

The failure is a stopped local dependency, not a wrong hosted project, bad password, MFA failure, IPv6 pooler problem, or requirement for a Supabase Auth administrator account. No evidence supports rotating credentials or moving the administrator into `auth.users`.

The failing path was `adminLogin()` → `throttle()` → `adminDatabase().query()` → `pg.Pool.connect()`. The first login rate-limit write could not obtain a database connection. Account lookup, Argon2id verification, session creation, and MFA were therefore never reached during the outage.

The previous generic response came from `PlatformDataError('database_unavailable')` in `data-access.ts`. The catch-all API failure handler sent raw PostgreSQL connectivity failures through the **tenant-data** classifier even for `auth/login`. Its combined database/Auth wording incorrectly suggested that normal Supabase Auth might be involved. This labeling regression did not cause the unavailable database. The earlier hosted tenant-read change intentionally preserved the local identity connection, so the working hosted dashboard data source did not remove the local login dependency.

## Complete flow

1. `AdminLogin` / `ActionForm` in `admin-ui.tsx` calls `adminRequest('auth/login', ...)`; it obtains a CSRF token and submits JSON.
2. `POST /api/superadmin/auth/login` in `app/api/superadmin/[...path]/route.ts` validates origin, content type, CSRF, and bounded request body.
3. `adminDatabase()` creates a server-only PostgreSQL pool. Every acquired connection verifies membership in `platform_admin_runtime` and rejects owner, superuser, service-role, or BYPASSRLS connections.
4. `adminLogin()` persists global/account throttles, locks the private account row, and verifies its Argon2id password. Unknown accounts retain dummy-hash verification and the same public denial as wrong passwords.
5. `makeSession()` persists the hashed opaque token for a ten-minute pending session inside the transaction. The API sets the HttpOnly, SameSite=Strict cookie and redirects to `/superadmin/security`.
6. The security page reads the pending private session. Existing enrollment is reused; it is not regenerated.
7. `completeAdminMfa()` decrypts the existing MFA record with the existing server key, verifies a fresh TOTP with replay protection, persists the accepted step, and rotates/revokes the pending session atomically.
8. The verified session grants console access and redirects to `/superadmin`. Tenant reads then use the separate hosted read-only Supabase client. Normal Supabase Auth cookies are never accepted for platform administration.

## Connectivity and configuration findings

Only names, boolean flags, safe categories, and aggregate counts were printed; no connection strings, credentials, password hashes, encrypted MFA data, seeds, or tokens were printed.

| Check | Observed result |
| --- | --- |
| Normal application / hosted data project | `rofutnholbtdmxccrkbs.supabase.co`; linked CLI project matches |
| Independent identity database | Existing loopback PostgreSQL, port 54322; refused connections before Docker start, reachable afterwards |
| Restricted server credential | Saved credential succeeds; role membership valid; neither superuser nor BYPASSRLS |
| Private schema | Admin, session, throttle, and append-only audit tables exist in the local identity store |
| Admin lookup | `admin@example.com` exists, active root account, not locked at inspection |
| Stored credentials | Argon2id hash present; one enrolled encrypted MFA record; server encryption key has valid format |
| Session persistence | Two retained sessions, one previously MFA-verified; the outage did not erase them |
| TLS | Existing loopback connection uses driver default; no SSL downgrade or credential change was made |
| Pooling | Max 4 connections, 4-second connect timeout, 30-second idle timeout, 8-second statement timeout; no named prepared statements |
| Environment loading | Next build reports `.env.local` and `.env`; diagnostic loads the same files with process-env precedence |
| Hosted independent identity schema | Read-only CLI query confirms schema, admin/session tables, and restricted runtime role are all absent |
| Hosted direct database DNS | Windows system resolver returned ENOTFOUND on this machine; raw DNS queries were also refused |
| Linked hosted pooler | System resolver returned two IPv4 addresses; TCP connection succeeds; saved pooler URL contains no database password |

Network checks do not prove authenticated hosted PostgreSQL access. No restricted hosted database credential currently exists in the application's configuration. The hosted Management API schema query succeeds using the connected CLI; that is distinct from the restricted PostgreSQL connection the web runtime requires.

## Targeted code changes

- `database-runtime.ts`: extracted the existing restricted runtime adapter for both the server and CLI; connection/query stages are classified, clients are released, and failed rollback cannot hide the original error.
- `database.ts`: retains the existing bounded pool, server-only access, and strict role check; adds a sanitized idle-client error handler so stopping a database does not crash the web process through an unhandled pool event.
- `auth-errors.ts`: independent authentication infrastructure and denial categories with fixed safe messages. Diagnostics project only category, stage, allowlisted error code/operation, and request ID; no raw provider error/cause/stack/query or request input is logged.
- `auth-service.ts`: identifies rate-limit, account lookup, password, session insert, and MFA decryption stages; differentiates unknown accounts and invalid passwords only in sanitized server diagnostics. Public response status, message, and category remain identical for both credential denials. MFA errors remain separate from database failures.
- API route: routes authentication failures through the authentication classifier instead of the tenant-data classifier; keeps safe request IDs. When infrastructure is already unavailable it avoids a second futile database attempt solely to audit the failed request. Successful authentication and all normal authentication denials retain existing durable audits; the unavailable audit store cannot record its own outage.
- `scripts/platform-admin-check-auth.mjs` and `admin:check:auth`: repeatable read-only check using saved credentials; schema, restricted role, account hash/MFA flags, and historical session persistence. No password attempts, writes, or MFA decryption.
- Tests: error projection, actual PostgreSQL categories, identical credential responses, UI outage feedback, reconnect after stopping/restarting only a disposable cluster, and unchanged credential/MFA records.

Categories distinguish database unavailable, rejected database credentials, missing schema/table/column/role, insufficient grants, network/query timeout, TLS validation, invalid configuration, missing administrator, bad credentials, MFA verification, MFA key decryption, session insertion, and other query failures. Existing rate limiting and lockouts remain enforced. The authentication path does not invoke Supabase Auth or the privileged tenant HTTP client.

## Requested hosted identity option — prepared, not applied

The user asked why Docker was needed and requested using their hosted Supabase database instead. That architecture is compatible with the existing independent login; the missing private schema prevents a URL-only switch.

`scripts/sql/platform-admin-hosted-identity.sql` is a **review proposal**, outside automatic Supabase migrations. It creates only the private identity/session/throttle/audit/settings tables, restricted NOLOGIN runtime role, RLS policies, append-only audit protection, and root/last-admin protection. It grants no tenant-table permissions and creates no public-table policies, triggers, Auth users, or Supabase Auth dependency. It is deliberately separate from the larger existing platform migration, which also changes tenant enforcement and is unsuitable as an incidental login repair.

The proposed move additionally requires explicit remote-write authorization, provisioning a restricted LOGIN through the reachable IPv4 pooler with verified TLS, securely transferring the existing account UUID/password hash/encrypted MFA record and associated audit history, retaining the exact MFA encryption key, verifying the target's restricted permissions, and switching only the server-side identity URL after successful checks. Throttles/lockout state must be preserved; existing sessions should either be transferred deliberately or invalidated with a fresh MFA login. No password or MFA reset is required. Source data must remain available until a verified cutover. The prepared SQL itself has been tested in an isolated PostgreSQL engine without even an `auth` schema.

Because the original task says **“Work locally only,”** applying this hosted proposal and transferring the account require the user's explicit scope extension. None of those hosted writes have been performed.

## Validation and real login status

- Web lint: passed with zero warnings.
- Web explicit TypeScript check: passed.
- Web production build: passed. An initial TypeScript narrowing error in the new password diagnostic wrapper was corrected before the successful build; no check was waived.
- Full web unit suite: **150 passed**.
- Focused authentication/security suite after the final password-wrapper correction: **8 passed**.
- Isolated database/RLS/MFA/session suite: **13 passed**.
- Production HTTP and isolated browser suite: **13 passed, no skips**, including actual password + MFA form submissions against a disposable native PostgreSQL identity database and an actual outage/restart test. Ordinary/OWNER-shaped sessions remain denied; client secret scanning passes.
- Hosted identity-only SQL proposal: **1 isolated database test passed**, proving independent password/MFA sessions without Supabase Auth tables, tenant tables, or tenant privileges.
- Actual saved admin database read-only check: passed after Docker startup; original account, enrolled MFA flags, and historical sessions intact.

At the original investigation stage, real-account login was unconfirmed: no tools submitted a real password or obtained/decrypted a real MFA secret/code. The user instead requested hosting the identity store in Supabase. The subsequent approved migration and real login confirmation are recorded below, separately from synthetic browser acceptance.

Subsequent result: the user approved the hosted identity migration and local cutover, then confirmed full real-account password/MFA/dashboard access on 5 November 2026. Hosted audit events independently confirm successful password and MFA verification. See the [hosted cutover report](platform-admin-hosted-cutover.md) for the completed migration and current validation. No Supabase Auth account is required.
