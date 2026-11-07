# Platform admin hosted Supabase integration

Fixed locally on 3 November 2026. No hosted migrations, database resets, tenant mutations, deployments, branches, commits, pushes or merges were performed.

## Root cause

Normal web authentication (`apps/web/.env`) and realtime (`apps/realtime/.env`) both target **`rofutnholbtdmxccrkbs.supabase.co`**. The linked CLI project matches that identifier. The separate administrator identity store points to **loopback PostgreSQL on port 54322**, and its Auth admin client points to the local Supabase API on port 54321.

Before this fix, `adminDashboard`, `adminDirectory` and `adminDetail` queried every domain table through `adminDatabase()`. That connection was deliberately configured for the new, empty local development store during bootstrap setup. Its successful health check and successful login proved local identity/database readiness; they did not validate hosted tenant statistics. The displayed zeroes accurately described the empty **wrong database**. There was no count-join multiplication bug or evidence that the existing hosted tenant data was absent.

Telemetry failed for a separate reason: the realtime environment already had `PLATFORM_OPERATIONS_KEY`, but the web environment did not. The endpoint itself was present and reachable. The existing key was copied privately into the web server environment; no replacement key or realtime restart was necessary.

## Observed hosted data

These are actual read-only observations from the configured development project, not synthetic UI statistics. Public-table totals use exact PostgREST HEAD counts. Auth account totals come from the supported Auth Admin listing response's total-count header. No tenant/account values were printed.

| Metric | Observed |
| --- | ---: |
| Organizations | 2 |
| Active organizations (`status = ACTIVE`) | 2 |
| Suspended organizations (`status = SUSPENDED`) | 0 |
| Supabase Auth accounts | 4 |
| Application profiles | 3 |
| Organization memberships, all statuses | 3 |
| Active memberships (`status = ACTIVE`) | 3 |
| Offices | 2 |

`Registered users` in the hosted overview means **Auth account records reported by the Auth Admin API**, including unverified/suspended accounts and any retained soft-deleted records. It is not the profiles count. The provider scopes this listing to the application's Auth audience ([Auth listing implementation](https://github.com/supabase/auth/blob/master/internal/models/user.go)). The separate platform administrator is outside Supabase Auth and is not added to this total. The optional profiles count is displayed separately, which explains the real 4-versus-3 difference. The original combined local SQL mode retains its explicit non-deleted-Auth-record definition, also exposed in the response metadata.

Actual directory checks returned both organizations, all four Auth accounts, three matching profiles, two offices spanning two distinct organization IDs, and one saved office-environment configuration. An Auth account detail lookup succeeded. These checks used the same bounded transport and explicit field selections as the console without printing personal data or requiring a normal Supabase user JWT.

The user refreshed the existing signed-in dashboard and confirmed that **2 organizations, 4 registered users and 2 offices** appeared after this change. This is manual confirmation of the working existing administrator session; it does not claim manual acceptance of tenant editing or provider mutations.

At the read-only telemetry check on 3 November 2026, the running authority reported:

| Live observation | Result |
| --- | ---: |
| Connected people | 0 |
| Active realtime rooms | 0 |
| Observed voice sessions | 0 |
| Readiness | `ready` |

These zeroes are real server observations. If the key, origin, endpoint, network or provider becomes unavailable, the UI preserves `Unavailable` with a fixed diagnostic explanation rather than replacing a failure with zero. Live observations can change independently of database totals.

## Implementation and security

The working username/password/MFA identity database, credentials, encryption key, session cookies and audit history were preserved. No administrator was recreated, enrolled again or registered with Supabase Auth.

The new `platformDataReader()` is a **server-only** entry point after the verified independent administrator session check. It revalidates the live session through the restricted identity database before requesting tenant data from the separate Supabase source. That source uses a dedicated server key and explicit **GET/HEAD-only** Data API/Auth Admin transport. It never imports the cookie-based SSR user client, attaches normal user JWTs, forwards cookies, accepts browser-provided credentials, exposes arbitrary SQL/RPC endpoints or changes public RLS. Ordinary/OWNER-shaped Supabase cookies do not grant access.

The hosted project is validated against `NEXT_PUBLIC_SUPABASE_URL` and the expected project reference. Legacy server keys must identify `service_role` and, when present, the matching project reference. Missing/mismatched hosted configuration fails visibly. It never falls back to the local identity database, an anonymous client or fabricated sample data.

All public-table queries use fixed field selections and known table names; directory queries use bounded pages, validated IDs/statuses, encoded filter values and explicit profile/account search modes. Auth responses are projected to a small safe shape: ID, email, account timestamps and account status. Metadata, identities, factors, password hashes, tokens and secrets are omitted. Counts are independent exact queries, so joins cannot multiply organizations, offices or account totals. There is no successful-zero fallback on error. Responses and upstream requests are uncached.

The API/UI distinguish invalid configuration, an unreachable dependency, permission denial, missing table/column, query failure and malformed responses. Missing count headers are errors, including when an SDK would otherwise default a missing total to zero. Server diagnostics contain only an error category, fixed operation name and request UUID. Audit access remains available from the identity store even if hosted configuration is unavailable.

The existing hosted schema has not received the platform-administration migration. Its new office-availability field and private organization-feature/settings structures therefore must not be assumed to exist. Office availability is shown as **Not configured**, private tenant events are explicitly unavailable, and hosted settings are not represented by unrelated local values.

**Hosted data access is read-only.** API guards reject tenant edits, account recovery/suspension, invitations, memberships, settings changes and operational room retirement in this mode. The UI offers inspection instead of editing. This prevents hosted target IDs from accidentally reaching old local mutation services and avoids incomplete cross-database mutation/audit transactions. Existing combined local CRUD remains available only through an explicit, loopback-bound `PLATFORM_DATA_MODE=database`. Normal owners/members continue using their existing application permissions and flows. A separate local identity store no longer controls hosted normal-user registration.

## Configuration and commands

The following server-only values were saved in ignored `apps/web/.env.local` without printing them:

- `PLATFORM_DATA_MODE=supabase`
- `PLATFORM_DATA_PROJECT_REF` matching the existing application project
- `PLATFORM_DATA_SUPABASE_URL` matching the existing application origin
- `PLATFORM_DATA_SUPABASE_SECRET_KEY`, retrieved through the already connected CLI
- The existing realtime `PLATFORM_OPERATIONS_KEY`

The existing `PLATFORM_ADMIN_DATABASE_URL`, `PLATFORM_ADMIN_MFA_KEY`, independent administrator accounts/sessions, and normal web/realtime Supabase configuration were preserved. No service key was placed in a `NEXT_PUBLIC_` value or source file.

`pnpm.cmd admin:connect:data` checks the existing application/linked project, obtains the existing server credential privately if needed, validates actual count queries, and saves only the separate read configuration. It does not create keys, migrate, reset, seed or write tenant data. `pnpm.cmd admin:check:data` performs bounded read-only directory/environment/detail and telemetry diagnostics and prints aggregate results only. Neither command is a public endpoint or an authentication bypass; they are local operator processes with access to the existing server configuration.

## Files changed for this integration

| File | Change |
| --- | --- |
| `apps/web/src/features/platform-admin/data-access.ts` | Validated source configuration, read-only privileged transport, safe Auth projections, strict counts and error categories |
| `apps/web/src/features/platform-admin/tenant-reads.ts` | Verified cross-tenant overview, directory, search/filter, pagination and detail reads |
| `apps/web/src/features/platform-admin/data-server.ts` | Server-only construction, hosted mutation guard and sanitized diagnostics |
| `apps/web/src/app/api/superadmin/[...path]/route.ts` | Connect reads to tenant source while preserving independent authentication/audit storage and rejecting unsupported writes |
| `apps/web/src/features/platform-admin/admin-ui.tsx` | Source indicators, Auth/profile count definition, inspection views, query errors/retry and explicit unavailable states |
| `apps/web/src/features/platform-admin/telemetry.ts`, `operations.ts` | Separate telemetry diagnostics and real observed counters |
| `apps/web/src/features/platform-admin/platform-gates.ts` | Prevent local identity settings from controlling hosted registration |
| `scripts/platform-admin-connect-data.mjs`, `platform-admin-check-data.mjs` | Safe local configuration and aggregate read-only diagnostics |
| `apps/web/.env.example`, `package.json` | New server-only settings and operator commands |
| `data-access.test.ts`, `data-fixture.test-helper.ts`, `scripts/platform-admin-http.test.mjs` | Separate-store, failure, auth, security and UI regression coverage |

## Validation and screenshots

The focused regression suite uses a separate seeded source with **2 organizations, 1 active/1 suspended organization, 4 Auth accounts, 3 profiles, 5 total/3 active memberships and 2 offices**. Those values intentionally differ from the real project's status distribution. It proves that an authenticated admin can read across tenants while the identity store refuses domain queries, and verifies pagination across 32 organizations, account/profile search, missing profiles, safe Auth projections, genuine empty data, all failure categories and telemetry failure modes.

The production HTTP suite runs a disposable native PostgreSQL identity/domain fixture plus a second independent, seeded Data API/Auth server. It signs in and verifies MFA through the actual production app, then proves that the hosted-read mode uses the separate source. It checks directory/detail reads, denied unauthenticated/ordinary sessions before any upstream privileged request, every disabled mutation path, query-error responses without a counts object, retry recovery and secret-free browser chunks. The original local CRUD, ownership/suspension race and authentication checks remain covered. SQL migrations in database tests are executed only in disposable test fixtures; no migration was run against either the existing hosted project or the user's existing local administrator database during this task.

Automated screenshots use **isolated synthetic data**, not personal hosted records:

- [Separate-store overview](assets/platform-admin-data/01-separate-store-overview-fixture.png)
- [Organizations](assets/platform-admin-data/02-organizations-fixture.png)
- [People](assets/platform-admin-data/03-people-fixture.png)
- [Offices](assets/platform-admin-data/04-offices-fixture.png)
- [Query failure without fake zeroes](assets/platform-admin-data/05-query-error-fixture.png)
- [Mobile overview](assets/platform-admin-data/06-mobile-overview-fixture.png)

Computer Use stopped because it could not verify the current Windows browser URL. No further manual UI-control actions were issued and no screenshot of the user's authenticated browser was captured. The user's explicit confirmation of the real dashboard counts and the actual read-only hosted diagnostics are recorded separately from the synthetic browser screenshots.

| Final executed check | Result |
| --- | --- |
| Workspace ESLint | PASS, zero warnings |
| Workspace TypeScript and route generation | PASS |
| Web and realtime production builds | PASS |
| Web unit/regression suite | PASS, 147 tests |
| Realtime unit/regression suite | PASS, 43 tests |
| Focused final data/telemetry suite | PASS, 8 tests (included in the web suite) |
| Isolated admin database and post-migration RLS regression suite | PASS, 13 tests |
| Production admin HTTP/browser suite | PASS, 11 tests, no skips |
| Existing normal-auth/voice production route suite | PASS, 13 tests |
| Existing team/chat/environment isolated database suites | PASS, 3 suites, including 54 team and 26 foundation assertions |
| Secret exposure scan and hosted mutation rejection | PASS, included in production HTTP tests |
| Read-only hosted count/directory/detail/environment checks | PASS, aggregate results above |
| Existing signed-in real dashboard | User confirmed the expected 2/4/2 organization/account/office totals |

One browser test initially encountered a page-navigation race while `document.body` was briefly absent. The polling helper was corrected to wait for the document; the complete production suite then passed. This was a test harness timing correction, not a waived product failure.

The only functional activation limitation is intentional hosted read-only access: coordinated hosted mutation support would require a separately reviewed backend/migration plan. This task did not deploy or modify real tenant data.

Primary API references: [Supabase Auth Admin listUsers](https://supabase.com/docs/reference/javascript/auth-admin-listusers), [Auth API listing implementation](https://github.com/supabase/auth/blob/master/internal/api/admin.go), [Auth model pagination/filter implementation](https://github.com/supabase/auth/blob/master/internal/models/user.go). The installed Auth SDK's default-zero pagination behavior was inspected locally; the transport requires an actual total-count header instead.
