# Phase 1 Step 4 migration and validation

Validation date: 2026-10-21 (Asia/Colombo).
Target: `rofutnholbtdmxccrkbs` — **2D-Virtual-Office-SaaS-Platform**, development.
No Git commands were run during this approval/application turn. No Phase 2 work
was started. Existing authentication and organization functionality is preserved.

Latest implementation follow-up: [development invitation link mode](#development-invitation-link-mode--2026-10-21).

## Final status

**APPLIED AND VERIFIED:** the user-approved migration
`20261021000200_team_invitations.sql` was applied using exactly
`pnpm exec supabase db push --linked`. Only that migration ran, exit 0, with no
seeds or role files. No reset, history repair, existing-data deletion/overwrite,
Auth-user modification, manual Dashboard SQL or new project was used.

Step 4 implementation, approved migration and all available account-independent
checks are complete. **Full live workflow/merge sign-off remains pending** real
email, dedicated authenticated accounts, concurrent requests and browser checks.
These checks are explicitly NOT TESTED; their absence is not presented as success.

| Verification | Actual result |
| --- | --- |
| Immediate linked target/web configuration/history checks | PASSED |
| Reviewed checksum and fresh conflict audit/dry-run | PASSED: exactly the approved migration pending |
| Approved remote application | PASSED: only `20261021000200_team_invitations.sql`, exit 0 |
| Post-application history | PASSED: both foundation and team versions match locally/remotely |
| Final dry-run | PASSED: up to date; no pending migrations/seeds/roles |
| Live invitation/audit schema, indexes, functions, triggers and RLS | PASSED |
| New table/column privilege assertions | PASSED: 10; function EXECUTE grants also match |
| Original foundation definitions and application-row fingerprints | PASSED: unchanged, apart from separately approved new owner trigger |
| Existing foundation privilege assertions | PASSED: all 13 |
| Live audit-record aggregate integrity | PASSED; no recipient, actor, token or hash values read |
| Public schema type generation | PASSED: real CLI output installed; temporary overlay removed |
| Frozen lockfile install | PASSED: up to date |
| Lint | PASSED: no warnings |
| Strict typecheck/route generation | PASSED |
| Production build | PASSED |
| Unit tests | PASSED: 36, including 14 invitation/member tests |
| Runner safety/configuration tests | PASSED: 4 |
| Isolated PostgreSQL role/RLS suites | PASSED: 54 team + 26 existing foundation assertions, plus unverified local identity and zero-fixture checks |
| Production HTTP smoke integration | PASSED: 8 |
| Existing live Auth negative-path tests | PASSED: 8 |
| Existing live anonymous organization API checks | PASSED: 5 |
| New live anonymous team API checks | PASSED: 11 |
| Live rollback-only missing-identity/anonymous SQL guards | PASSED: final rollback marker returned |
| Live authenticated organization/team suites | NOT TESTED: three dedicated verified account UUIDs absent |
| Real invitation provider/inbox delivery | NOT TESTED: agent sent no email; current sender configuration follow-up below |
| Successful authenticated member/ownership workflows | NOT TESTED |
| Real concurrent acceptance/capacity requests | NOT TESTED |
| Interactive desktop/mobile/keyboard browser testing | NOT TESTED: connected UI inventory has no apps or browsers |
| Outstanding failed checks | NONE |

## Approval, target and application evidence

Immediately before application, the CLI inventory identified the exact approved
project/ref/name, linked true, ACTIVE_HEALTHY, region ap-south-1. The local link and
current web Supabase origin matched without printing env values. The development
classification comes from the user's explicit confirmation of this target.

CLI migration history showed `20261021000100` applied and `20261021000200` pending.
The read-only schema audit found no proposed object conflicts, no over-capacity
organizations and no active organization missing an OWNER. A fresh dry-run listed
only the approved file; no seeds/role files or destructive operations appeared.

Approved migration SHA-256 before application and after verification:

```text
0D3A9146BFC30B2A8BCD1F6A975BF513126FF42166320ADD12CDC75DD32381AA
```

The push returned `dryRun: false`, migrations exactly
`[20261021000200_team_invitations.sql]`, seeds/roles empty, and
`Finished supabase db push.` The approved migration was not edited during this
application turn. Final history records both `20261021000100` and
`20261021000200` locally/remotely. Final dry-run returned `upToDate: true` and
empty pending migration/seed/role lists. CLI commands were executed sequentially.

## Live post-application catalog audit

`supabase/tests/team_schema_audit.sql` verified actual definitions and effective
privileges through the CLI, using catalog/aggregate SELECTs:

- Two tables owned by postgres with RLS enabled:
  `public.organization_invitations` and `private.organization_team_events`.
- 21 new constraints: PKs/FKs, normalized email, role/hash/delivery checks,
  expiry/lifecycle consistency, and audit event/role checks.
- Six valid indexes, including unique token hash, partial unique open
  organization/email, bounded invitation-list lookup and audit rate lookup.
- Fifteen functions (ten public RPCs, five private helpers), all owned by
  postgres, fixed empty search paths and the reviewed definer configuration.
- Function EXECUTE checks: no PUBLIC execution; anonymous execution only for the
  limited preview; authenticated public RPC access; only `team_role` among the
  new private helpers is executable by authenticated callers for the RLS policy.
- Two enabled triggers: invitation updated-at and membership last-owner guard.
- One authenticated invitation SELECT policy: OWNER or ADMIN for MEMBER invites.
  Private audit has zero direct policies and no app-role read/write privileges.
- Ten effective privilege assertions all true: safe invitation column access,
  token hash/provider-ID protection, no anonymous reads, and no direct invitation
  or audit writes by authenticated/anonymous roles.

Both owner/capacity invariant aggregates remained zero. The catalog audit was
also checked programmatically against expected counts, grants and definitions.
Installed privileges are distinct from row-level behavior for real signed-in users.

Aggregate record observation during verification: **2 invitation rows and 3 audit
rows** (2 invited, 1 revoked). Every invitation had its corresponding creation
audit event. No synthetic `no-send@example.invalid` fixture existed. These records
were not created/revoked by this agent's verification suites and were left
untouched. They are not counted as successful email, authenticated authorization,
or browser tests; no recipients, actors, token hashes or raw tokens were selected.

## Foundation preservation

A private local baseline captured original table/RLS/owner metadata, 21 constraints,
9 indexes, 8 policies, 4 complete function definitions and 3 original triggers.
It also captured opaque server-computed fingerprints of the four application
tables, never individual records or Auth rows. Post-application comparison and a
second comparison after verification matched every baseline field. The new owner
trigger was explicitly excluded from this comparison and audited separately as
part of the approved change set.

The final foundation catalog check also confirmed all 13 original privilege
assertions, four tables, 21 constraints, nine indexes, eight policies, four
functions and three original triggers remain correct.

The original migration file also retains SHA-256:

```text
6F088AE94277B13E7347DC520C19414162AFB3AD8406EE6E1842C4CDE9BA0693
```

Existing Auth negative-path, anonymous organization API and protected-route tests
passed against the applied project. Successful Auth/organization workflows still
need dedicated accounts; no existing real user was selected as a test fixture.

## What the tests prove

The in-memory PGlite PostgreSQL 18.6 suite executes the exact migrations and
assertions under real non-superuser authenticated/anon database roles, with a
minimal synthetic local Auth identity/claims contract. It verifies the hierarchy,
seat accounting, retries, expiry/revoke/rotation, directory privacy, cross-tenant
reads/edits, last-owner guard, atomic audited transfer, acceptance rollback and
actual-role audit accuracy. All application/audit fixtures roll back to zero.
It is not live Supabase Auth/PostgREST or true multi-connection testing. The remote
project remains PostgreSQL 17.11; its installed objects/negative paths were checked
separately. No production-data copy or local Supabase project was created.

The new live Data API suite denies invitation reads and all nine privileged RPCs
with insufficient privilege, and returns null for invalid preview proof. It uses
only the configured public key, synthetic invalid identifiers/proof, and no user
session. No emails or records are created. The rollback-only live SQL guard suite
additionally verifies that an authenticated database role without an Auth subject
cannot call those nine RPCs; anonymous denial/invalid preview also pass. It returns
`team-access-guards-rolled-back` only after ROLLBACK. These are negative identity
checks, not an authenticated membership workflow or a verification bypass.

Unit tests use isolated HTTP/provider adapters. Their provider acceptance/failure
results establish application error handling, not real delivery. Production HTTP
smoke tests establish actual private redirects, cookie/URL/referrer/cache guards
and malformed-proof behavior, not an interactive layout review. Existing live Auth
checks establish negative paths and confirmation-required settings only.

## Generated types and verification changes

Regenerated `apps/web/src/lib/supabase/database.types.ts` from the linked applied
public schema, reviewed it and changed all team consumers to use it. Removed
`application.types.ts`, which was only a pre-application overlay. All five public
tables and eleven public functions are represented; private audit tables/helpers
remain excluded. Typecheck, unit tests and build passed with the actual types.

Added `apps/web/tests/team-live.test.mjs`, `test:team:anonymous` scripts and
`supabase/tests/team_access_guards.sql` for reproducible account-free live checks.
Expanded the schema audit with indexes, policies and effective execution/column
privileges. Updated README, architecture and team setup documentation to reflect
application and the generated types. No business behavior or approved SQL changed.

One read-only postflight query initially used DELETE as a column privilege;
PostgreSQL correctly rejected the query. DELETE is now checked at table scope,
the audit reran successfully and all assertions passed. This was an inspection
query defect, not a migration failure. No failed checks remain unresolved.

## Remaining environment setup

The original migration verification found APP_URL present and Resend settings
absent. The subsequent sender investigation below supersedes that presence
snapshot: **APP_URL and RESEND_API_KEY are now present**, and
**INVITATION_FROM_EMAIL resolves to the approved testing sender**. No secret
values were printed or inserted. Configuration belongs in the existing ignored
`apps/web/.env` (or a deliberately managed higher-precedence source):

```dotenv
APP_URL=http://localhost:3000
RESEND_API_KEY=
INVITATION_FROM_EMAIL=onboarding@resend.dev
```

Keep APP_URL equal to the trusted application origin; use HTTPS when deployed.
Use a Resend-verified sender domain and a plain sender address, and disable
invitation link/open tracking. Restart development or rebuild/restart production
when configuring. Supabase signup/recovery delivery is separately configured in
Auth SMTP/email templates; preserve Confirm email and the existing exact local
redirect/template settings. Unconfigured sends fail accurately before reserving
seats; no fake email fallback exists. See the
[email guide](team-invitations.md#real-email-configuration).

Three authorized, normally registered and email-confirmed test UUIDs remain absent.
Prepare dedicated controlled inboxes through the normal signup/confirmation flow;
do not auto-confirm accounts or reuse unrelated real users. Store A/B/C UUIDs in
ignored `supabase/.env.organization-tests.local`, following the existing example.
Both organization/team readiness commands reported NOT TESTED (runner exit 2).
After preparation run `pnpm test:organizations` and `pnpm test:team:live`; their
fixtures roll back and no Auth records/emails are changed by those SQL suites.

## Manual verification checklist

1. Register and confirm dedicated test accounts normally; verify existing login,
   dashboard, refresh, logout and recovery without bypassing email verification.
2. As OWNER, invite MEMBER and ADMIN recipients and inspect actual controlled
   inboxes. Test missing/provider-failure feedback without claiming delivery.
3. Review a link signed out, then test existing-user login and new-user signup
   continuation. Require the matching verified address and explicit acceptance.
4. Test wrong account, invalid/expired/revoked/accepted proof, resend cooldown and
   old-link invalidation; repeated/concurrent acceptance must create one membership.
5. Verify role-specific UI and direct RPC denials, cross-tenant isolation, email
   visibility, ten-seat reservations, removal and lost access on new requests.
6. Verify explicit exact-name ownership transfer, resulting roles, audit records
   and last-owner protection. Scope any persistent/concurrent browser fixtures
   and cleanup before execution; rollback SQL cannot share fixtures across requests.
7. Check desktop/mobile widths, table overflow, native disclosures, keyboard focus,
   labels, pending controls and error feedback. No browser was connected here.

Full details: [team manual checklist](team-invitations.md#manual-browser-verification-after-approval-and-setup).
Deployment log redaction for bearer paths/cookies and future realtime/media
revocation remain documented responsibilities; no infrastructure or Phase 2
service was introduced. Step 4 verification stops here with the stated manual
and authenticated/email/concurrency limitations.

## Sender configuration investigation — 2026-10-21

Reported failure: Resend HTTP 403 with a gmail.com domain-verification error.
That error is consistent with an unverified Gmail FROM sender in the reported
request. It does not establish that the application used the logged-in user's
email automatically. Inspection found no such sender assignment or fallback.

Exact code path: `features/invitations/email.ts` reads the server-only
`env.INVITATION_FROM_EMAIL`, validates it and returns `config.from`;
`deliverInvitationEmail` populates the Resend JSON field with `from: config.from`.
Both create/resend services obtain this configuration by default. Server Actions
pass no actor-derived sender. The inviter name is used only in email content.
`next.config.ts` does not inject or expose environment settings.

The current local configuration already contains the approved value. It was
preserved, not overwritten. There was no sender-routing defect to rewrite. Added
an explicit configuration comment, regression coverage and setup/troubleshooting
documentation. No sender address or API key was hardcoded in application logic.

| Check | Actual result |
| --- | --- |
| `apps/web/.env` | PASSED: one sender declaration; approved `onboarding@resend.dev`; key/origin present |
| Higher-priority env files | PASSED: `.env.local`, `.env.development.local`, `.env.development`, `.env.production.local`, `.env.production` absent |
| Current inherited process sender | PASSED: absent; no override of the file |
| Windows User/Machine sender settings | PASSED: absent |
| Next's installed env loader, isolated fresh development process | PASSED: loaded `.env`; effective sender equals approved testing value |
| Next's installed env loader, isolated fresh production process | PASSED: loaded `.env`; effective sender equals approved testing value |
| Create and resend default configuration through the real delivery adapter | PASSED: two new regression tests inspect intercepted Resend HTTP bodies; configured sender wins over distinct inviter/recipient and untrusted payload fields |
| Resend 403 sender-domain and testing-recipient responses | PASSED with mocked responses: safe delivery failure, no success claim or raw provider error disclosure |
| Lint / strict typecheck / production build | PASSED |
| Unit tests | PASSED: 38 total, including 16 invitation/member tests |
| Production HTTP smoke integration | PASSED: 8 |
| Actual earlier process/deployment environment and historical override source | NOT VERIFIED: unavailable to this inspection |
| Real Resend API send, inbox delivery and selected-recipient eligibility | NOT TESTED: no real send authorized or performed; account address not inspected |
| Outstanding failed automated checks | NONE |

The original Gmail request cannot be reproduced from the present files and a
fresh Next environment. A stale running process, an override in the terminal
that launched it, or another deployment is a possible explanation, not a proven
root cause. No unrelated running server was stopped. To apply the current correct
configuration to the affected app, stop it, clear any terminal sender override,
and restart with `pnpm dev` from the workspace root; deployed apps need their
server environment corrected and a restart/redeploy. The exact safe PowerShell
commands and precedence are in the [email configuration guide](team-invitations.md#real-email-configuration).

For any later user-initiated delivery check, choose only the Resend account's
registered address with the resend.dev sender. Other real recipients are
unsupported until a domain you control is verified and FROM uses that domain.
Do not change the recipient automatically or bypass this restriction. See
[Resend's 403 testing-domain guidance](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
The reported Gmail-domain rejection and a resend.dev recipient restriction are
different configuration failures even though both can return HTTP 403.

Keep existing failed invitations visible and their seats reserved until an
intentional revoke, expiry or resend. An HTTP rejection, timeout or malformed
provider result still cannot mark delivery successful; only provider acceptance
followed by successful bookkeeping can do so. The tests use synthetic values
and intercepted HTTP/RPC calls; no email, remote data or Auth records were changed.
No migrations, Supabase Auth configuration, Git operations or later-phase work
were performed during this sender investigation.

### Follow-up: generic delivery error reported again

The user supplied a screenshot showing the generic delivery-uncertainty message.
When asked for the latest provider reason, the supplied text was again the app's
generic message. **At that point, the live provider failure remained unconfirmed**; the
screenshot does not distinguish a recipient restriction, sender rejection,
credential problem, transport failure or malformed provider response. The earlier
sender checks and mocked tests did not establish successful real delivery.

Found and fixed an application diagnostics defect: `deliverInvitationEmail`
discarded every non-2xx provider response and collapsed all causes into the same
message. It now reads error responses privately and maps recognized Resend 403
testing-recipient/sender-domain categories, authentication/permission failures and
429 rate limits to fixed actionable text. Unknown 4xx responses expose only their
HTTP status. No raw provider message, recipient, API key or invitation proof is
interpolated into output or logged. Ambiguous 5xx, network/timeout and invalid
success responses still report uncertainty, preserving failed reservation state
and never claiming successful delivery. Sender selection is unchanged and still
uses only server configuration.

Fresh checks in this follow-up:

- PASSED: local `.env` and a fresh Next development loader still select the
  approved testing sender; no inherited sender override is present.
- PASSED: Resend HTTPS is reachable from an unrestricted CLI check. An
  **unauthenticated GET**, without any API key, returned the expected 401.
  This proves reachability only, not validity of configured credentials or send
  permissions. The first sandboxed probe was blocked with EACCES; repeating the
  same read-only probe with network access succeeded. No POST/email occurred.
- PASSED: lint, strict typecheck and production build.
- PASSED: 8 production HTTP smoke tests after rebuilding the changed handler.
- PASSED: 41 unit tests, including 19 invitation/member tests. Added regression
  coverage for safe error categories, unreadable 403 responses, and a full
  service/adapter rejection that reaches the UI error formatter and records only
  failed delivery. Existing configured-sender create/resend regressions still pass.
- NOT TESTED: real email sending, recipient eligibility and resolution of the
  reported live delivery failure. No live delivery success is claimed.

Manual continuation: restart the affected app to load the changed handler. Check
the recipient against the Resend account's registered address before using
`onboarding@resend.dev`. Unsupported real recipients need a verified domain.
After correcting configuration, intentionally resend the existing invitation
after the cooldown, rather than creating duplicates. Inspect the new safe error
message or Resend request log if it still fails; do not share keys or email links.
No Auth/migration or Git changes were made.

### User-confirmed testing recipient restriction — 2026-10-21

The user confirmed that the invitation recipient differs from the Resend account's
registered email, while FROM is `onboarding@resend.dev`. This is an unsupported
real recipient for the testing sender and establishes a configuration blocker.
It does not retroactively verify the earlier Gmail FROM request or demonstrate
successful provider/inbox delivery.

- CONFIRMED BY USER: the selected recipient is outside the resend.dev testing
  allowance. Waiting, restarting or resending to that address will not remove
  this restriction.
- PRESERVED: the existing testing sender configuration. No custom domain,
  account email, credentials or recipient allowlist was added or changed.
- PASSED previously: the focused mocked regression verifies that this Resend
  rejection reaches the UI as a safe, specific explanation, records failed
  delivery only and preserves the reservation. No automatic resend, recipient
  substitution or success fallback is implemented.
- NOT TESTED: successful delivery to the registered Resend address or through
  a future verified custom domain. No new email or provider request was made
  after this clarification. The preceding automated results remain unchanged;
  this clarification updates documentation only.

Keep the unsupported invitation unsent. If its seat is no longer needed, revoke
it intentionally in the UI. For a different permitted test address, create a
separate invitation to the registered Resend email through the normal UI; the
existing invitation recipient is not rewritten. If that address is already an
active member, use a separate test workspace where it is not an active member,
or defer delivery testing until a custom sender domain is verified. Do not change
Auth identities or bypass membership checks to make the test pass.

The user will choose the registered address for testing or configure a verified
custom domain later. No sends, data changes, Git operations or next-phase work
were performed in response to this clarification.

## Development invitation link mode — 2026-10-21

**IMPLEMENTED.** The local ignored `apps/web/.env` now sets
`INVITATION_DELIVERY_MODE=link`; all other values, including the existing Resend
testing sender/key, were preserved. A fresh installed Next env loader confirmed
the effective development mode and sender without displaying credentials. Restart
the existing app with `pnpm dev` to load the changed code/configuration.

### Implementation and migration review

- Server configuration defaults to email mode. Link mode requires exactly
  development/test NODE_ENV. Production, missing/unknown NODE_ENV with link mode,
  unknown modes and invalid APP_URL fail before create/rotation RPCs. There is
  no production fallback that returns links or sends mail instead.
- The Team page offers authorized **Create invitation link** and **Regenerate
  invitation link** actions. It displays a private read-only URL, **Copy link**,
  copy feedback/manual fallback and explicit UTC expiry. No email provider is
  called or credential required in link mode; email delivery remains available
  in email mode. Stale email buttons cannot send while configured for link mode.
- New links use the existing secure token generator and validated APP_URL origin.
  Only SHA-256 hashes enter RPCs. Only the verified authorized manager receives
  the raw result once. It is not persisted server-side, logged, listed, written
  to browser storage, or resubmitted as previous action state. Fresh page loads
  cannot retrieve it. Lost results require authorized rotation after cooldown.
- Reviewed the applied `20261021000200_team_invitations.sql`: existing
  create/resend RPCs already enforce verified identity, active tenant/role,
  capacity, expiry, duplicate checks, rate limits and atomic hash/version
  rotation. They store no plaintext tokens. **No new migration is necessary**;
  no migration, remote schema or application data was changed for this task.
- Link issuance leaves existing provider-delivery bookkeeping unconfirmed; it
  never fabricates provider acceptance. The Email column says **Not confirmed**
  for non-accepted delivery. The existing DB default `sending` is not used as an
  authorization/lifecycle signal and does not imply a queued email in link mode.
  Audit events retain their existing `invited`/`resent` names.
- The acceptance routes and security model are unchanged: GET only captures
  proof; the exact verified recipient must explicitly accept. The existing
  HttpOnly continuation cookie, no-store/no-referrer headers and SQL RLS remain.

### Actual automated results

| Check | Result |
| --- | --- |
| Lint | PASSED, no warnings |
| Strict typecheck | PASSED |
| Production build | PASSED; dynamic runtime link-mode guards remain enforced |
| Unit/service tests | PASSED: 47, including six new direct-link tests |
| Provider-independent creation | PASSED with mocked RPC/provider adapters: hash-only RPC, trusted URL, expiry, zero provider calls/credentials |
| Regeneration | PASSED: existing rotation RPC, fresh proof/hash per result; only invitation ID/hash sent |
| Production/disabled modes and unsafe origins | PASSED: create/rotate reject with zero database calls |
| Permission, role, rate and capacity failures | PASSED: service denials return errors without a raw link |
| Clipboard success/denial/unavailable | PASSED: isolated clipboard adapter test; success only after completion, fallback on denial |
| Isolated PostgreSQL role/RLS suite | PASSED: 54 team + 26 foundation assertions, unverified local identity denial, all fixtures rolled back |
| Existing acceptance boundaries | PASSED in isolated SQL: matching verified email, wrong-email denial, expiry, revocation, old-proof invalidation, explicit acceptance/membership and role/seat checks |
| Production HTTP smoke | PASSED: 8; existing auth, workspace and invitation route/cookie/cache behavior preserved |
| Live authenticated creation/acceptance | NOT TESTED: dedicated authorized verified account IDs/credentials unavailable |
| Interactive Copy link, separate browser session and real Auth confirmation | NOT TESTED; manual checklist below |
| Real provider delivery | NOT TESTED; no email sent or provider request made for this task |
| Failed checks/blockers | No failed automated checks; full live/browser verification awaits dedicated accounts |

The SQL suite uses an isolated disposable PGlite PostgreSQL 18.6 database with
synthetic local identities, not privileged live Auth shortcuts. It does not prove
live Supabase/PostgREST or concurrent browser behavior. No dependencies were added.
Production build success is a compilation result; link issuance is denied at
runtime in production even if the local file retains link mode.

### Manual verification checklist

1. Restart `pnpm dev`. Use dedicated test accounts registered and confirmed through
   normal Supabase authentication. Link mode does not replace Auth email
   confirmation or weaken that requirement.
2. As OWNER create a MEMBER/ADMIN link; as ADMIN create only MEMBER. Check the
   recipient, success state, UTC expiry and Copy link feedback. If clipboard
   permission is denied, manually copy the selected input. Do not paste real
   invitation URLs into chat, logs or shared screenshots.
3. Open the private URL in a separate browser profile. Confirm it redirects to
   clean `/invite` and creates no membership merely by opening. Sign in/register
   with the invited email and complete normal email confirmation. Reopen the
   original invitation link if confirmation happened in another browser.
4. Click explicit acceptance and verify one active membership in the correct
   organization/role. A different verified email or unverified account must fail.
5. Regenerate an existing pending/failed-email invitation after 60 seconds; copy
   the new link. Check that the old link fails, expiry renews and immediate
   repeat rotation is rate limited. A fresh page load must not recover the link.
6. Revoke a controlled invitation; check its link no longer accepts. Expired-link
   behavior is covered by the isolated SQL suite; use a naturally expired fixture
   for browser confirmation without editing/deleting existing remote data.
7. Confirm MEMBER/nonmember/cross-tenant users cannot generate or regenerate and
   ADMIN cannot issue ADMIN invitations. Confirm seat limits remain enforced.
8. Production must use email mode: link mode must reject before issuing proof or
   writing invitations. This boundary passes automated service/config tests;
   authenticated production UI verification is still manual.

No live test accounts were created or reused, no emails sent, no Git operations
performed and no Phase 2 work started. Step 4 direct-link implementation stops
here with the explicit live/browser limitations above.
