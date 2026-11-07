# Hosted administrator identity cutover

Applied on 5 November 2026 after explicit user approval for the private schema, restricted database login, existing administrator identity transfer, and subsequent local URL switch/web restart. No application deployment, branch, commit, push, merge, database reset, or production tenant change was performed.

## Current result

The local web app's `PLATFORM_ADMIN_DATABASE_URL` now targets the existing hosted Supabase project through its IPv4 session pooler on port 5432. Runtime connections authenticate as the new `platform_admin_hosted` restricted LOGIN, inheriting only `platform_admin_runtime`. Administrator password/MFA/session authentication remains independent of Supabase Auth. Docker is no longer an administrator-login dependency.

The existing account UUID, username, Argon2id hash, encrypted MFA record, enrolled timestamp, accepted TOTP step, credential version, failed-attempt/lockout state, and account timestamps were copied with parameterized queries. Source and target records were compared in full without logging records, hashes, ciphertext, seeds, or tokens. The existing MFA encryption key was retained exactly and never decrypted during migration.

Existing sessions and historical audit events were **not** transferred. Fresh password and MFA verification are required; no old token can authenticate to the new empty hosted session store. Source history remains in the retained local store. The hosted append-only audit starts with a new `admin.identity_migrated` event; it does not pretend that historical events were copied. Source throttle windows were checked and all were expired before migration; account failed-attempt and lockout fields were preserved. Source data was retained, not reset or deleted. There is no automatic fallback to it.

## Scope and privileges

`scripts/sql/platform-admin-hosted-identity.sql` creates only the new private identity/session/throttle/audit/settings schema and its restricted group role, RLS policies, root/last-admin safeguards, and immutable-audit trigger. `scripts/sql/platform-admin-hosted-runtime.sql` provisions the dedicated LOGIN with a cryptographically random database credential returned only to a capturing operator script. It never changes the administrator's password.

Actual hosted checks confirmed:

- Restricted runtime role membership, without superuser or BYPASSRLS.
- RLS enabled on every private identity table.
- No private schema usage for `anon`, `authenticated`, or `service_role`.
- No direct runtime SELECT privilege on tenant organizations/offices or managed Auth users.
- No runtime UPDATE or DELETE privilege on audit events.
- Exact transferred account equality before activation.

No tenant tables, tenant policies, tenant triggers, Supabase Auth identities/settings, service-role keys, or existing database passwords were changed. Hosted domain reads continue through the pre-existing separate read-only Supabase Data API/Auth Admin client. Hosted tenant mutations remain disabled.

This identity-only SQL was applied intentionally outside the repository's automatic migration history. Do not blindly push the larger `20261103000100_platform_administration.sql` to this project: it also changes tenant enforcement and would conflict with the already-created private identity schema. The previously documented remote migration-history discrepancy remains outside this approved identity migration.

## TLS and cutover

The initial hosted attempt stopped safely at `SELF_SIGNED_CERT_IN_CHAIN` before copying an account. The strict client was correctly rejecting the pooler's chain without Supabase's CA. The public root certificate was obtained over verified HTTPS from the URL in the [official Supabase dashboard configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json), validated as a self-signed CA, and stored at `apps/web/certs/supabase-prod-ca-2021.crt`. The connection uses `sslmode=verify-full` and its explicit `sslrootcert` path. Certificate-chain and hostname checks remain enabled, following [Supabase's SSL guidance](https://supabase.com/docs/guides/database/psql). No TLS enforcement or hosted database-restart setting was changed.

The one identity-copy transaction initially encountered a UUID/text parameter inference error in the new migration audit insert; it rolled back atomically. Separate parameters corrected the conflict, and the retry succeeded using the same saved runtime credential. No passwords were rotated and no partial account copy remained from that failed transaction.

`scripts/platform-admin-transfer-hosted.mjs --apply-identity-only` captures CLI output privately, rejects existing target identities, briefly locks only the source admin table, copies the approved account, compares complete rows, and appends the migration event. It copies no sessions or historical audits and does not activate the connection. Rerunning it against a nonempty target intentionally refuses to overwrite existing identities.

`scripts/platform-admin-use-hosted.mjs` defaults to read-only pre-cutover checks. `--activate` adds the separately approved reversible local URL switch after those checks. These one-time transfer comparison commands require the retained source and may no longer match mutable fields after normal hosted logins; use `pnpm.cmd admin:check:auth` for ongoing hosted health checks.

The hosted runtime URL and retained source URL are saved only in ignored `apps/web/.env.local`; they must not be pasted or committed. The MFA key and normal user settings are unchanged. The exact verified Next.js dev parent/child processes were restarted on port 3000; no unrelated processes or Docker containers were stopped. The restarted login page returns HTTP 200.

## Automatic approval boundaries

Automatic approval review rejected a broader transfer containing old sessions/audit history. The operation was narrowed to the approved account-only transfer, leaving those records local. Review then separately rejected the local authentication URL cutover as outside the initial approval. Only read-only readiness checks were run until the user explicitly approved the URL switch and local web restart; the approved activation then succeeded. These rejected operations were not bypassed.

## Validation

- Actual hosted PostgreSQL over certificate- and hostname-verified TLS: passed.
- Actual hosted restricted-role/RLS/privilege boundaries and transferred-account equality: passed before cutover.
- Active `admin:check:auth`: remote target, verified TLS mode, private tables present, one active Argon2id administrator, one encrypted/enrolled MFA record; zero prior sessions transferred.
- Existing hosted directory checks: unchanged 2 organizations, 4 Auth accounts, 3 matching profiles, 2 offices, 1 saved environment configuration; telemetry ready with zero current people/rooms/voice observations.
- Focused authentication/security tests: 8 passed.
- Identity-only SQL and runtime provisioning test: passed in isolated PostgreSQL without an Auth schema or tenant tables.

Final verification after cutover:

- Web production build: passed, including TypeScript compilation.
- Explicit web TypeScript check: passed.
- Web lint: passed with zero warnings.
- Focused authentication/security: 8 passed.
- Combined isolated database/RLS/MFA/session and hosted identity/runtime-provisioning SQL tests: 14 passed.
- Production HTTP and isolated browser suite: 13 passed, no skips; actual password/MFA form submissions against test-owned native PostgreSQL, infrastructure categories, outage UI, stop/restart recovery, and client secret scanning all passed.
- Script syntax checks, ignored-env verification, and `git diff --check`: passed (only pre-existing line-ending notices).

**Real-account login confirmed on 5 November 2026.** After initially reporting that login still failed, the user retried and confirmed “okey now its fully working.” A read-only hosted audit check independently observed successful `admin.password_verified` and `admin.login` events, with the account active, unlocked, and zero failed attempts. This confirms actual password/MFA acceptance in the hosted store; the user's confirmation supplies the dashboard-access result. No tools obtained or submitted the user's password/authenticator code, and no MFA seed was decrypted.

The follow-up investigation also verified the actual localhost CSRF/login boundary with one deliberately nonexistent diagnostic username and random password. It correctly returned HTTP 401 `invalid_credentials` and did not alter the real administrator's failed-attempt count. No further product-code, credential, MFA, or database changes were needed during this follow-up. The cause of the user's first post-cutover failed attempt was not established, so it is not attributed to caching, credentials, or infrastructure.
