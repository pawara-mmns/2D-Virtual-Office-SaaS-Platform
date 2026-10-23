# Team members and invitations

Phase 1 Step 4. See [actual validation results](team-invitations-validation.md).
The approved migration is applied to development project `rofutnholbtdmxccrkbs`.
Schema/permission checks and available regressions passed. Real authenticated,
email and browser workflows still require the remaining setup and verification.

## Application boundaries

- `/workspace/[organizationId]/members`: bounded member directory, seat usage,
  invitation creation/history, intentional resend/revoke, member removal, role
  changes and explicit ownership transfer. Data is rendered by Server Components.
- `/invite/[token]`: a GET handler captures syntactically valid proof into an
  HttpOnly cookie and redirects to `/invite`. It neither accepts an invitation
  nor creates a membership.
- `/invite`: limited token-scoped preview and an explicit acceptance form.
  Signed-out recipients can register/login normally. A verified matching email
  is required before acceptance. Wrong-account recipients can sign out and switch.

`features/invitations` owns validation, token generation/hashing, RPC access,
provider delivery and acceptance. `features/members` owns membership RPC access,
server authorization, team actions and presentation. All features now consume
`lib/supabase/database.types.ts`, generated through the CLI from the applied public
schema. The temporary pre-application overlay has been removed. Private audit
tables/helpers are deliberately excluded from these public schema types.

Every mutation is a Next.js Server Action with origin checks and a fresh verified
user lookup (deduplicated only within the request). Manager actions also check the
actor's active membership. PostgreSQL independently rechecks actor identity,
verified Auth state, organization, role, target and allowed transition. A hidden
organization/member ID, selected role or cookie is never sufficient permission.

## Database change set

Migration: `20261021000200_team_invitations.sql`.

`public.organization_invitations` stores organization, normalized email, requested
ADMIN/MEMBER role, inviter, SHA-256 token hash, seven-day expiry, acceptance and
revocation timestamps, timestamps and delivery bookkeeping. It stores no raw
tokens. Foreign keys protect relationships; hash uniqueness and a partial unique
index permit only one open invitation per organization/email. Expired open rows
are explicitly superseded when a new invitation for that email is created.

Lifecycle is derived, in order: Revoked, Accepted, Expired, Pending. Delivery
status is independent (`sending`, `sent`, `failed`) and never grants membership
or controls seat counting. `sent` means provider acceptance, not inbox delivery.

`private.organization_team_events` is an append-only application audit boundary
for invitations, resend/revoke/acceptance, role changes, removal and transfer.
It records actor/target IDs, organization, invitation and relevant role changes;
no raw token or email payload. It has RLS and no app-role table privileges.
There is no audit-management UI or retention job in this phase.

The migration adds five private helpers, ten public RPCs, two triggers and their
supporting constraints/indexes. The existing foundation tables are preserved.
The only new behavior attached to an existing table is a last-owner guard trigger
on `organization_members`. No Auth schema changes, data backfill, table recreation,
DROP, DELETE, TRUNCATE or reset occurs in the migration.

## Permissions

| Action | OWNER | ADMIN | MEMBER |
| --- | --- | --- | --- |
| Member directory | Yes | Yes | Yes |
| Other members' email addresses | Yes | Yes | No; own address only |
| Invite ADMIN | Yes | No | No |
| Invite MEMBER | Yes | Yes | No |
| Read/revoke/resend ADMIN invitations | Yes | No | No |
| Read/revoke/resend MEMBER invitations | Yes | Yes | No |
| Change another ADMIN/MEMBER role | Yes | No | No |
| Remove another ADMIN | Yes | No | No |
| Remove another MEMBER | Yes | Yes | No |
| Ordinary OWNER role update/removal | No | No | No |
| Explicit ownership transfer | Yes | No | No |

Users cannot manage their own role/membership through these operations. Ownership
transfer requires the exact workspace name and an eligible active, verified
recipient. One transaction promotes the recipient, demotes the actor to ADMIN,
and appends an audit event. The owner guard prevents removing/deactivating the
last active OWNER, including a membership cascade from a privileged Auth deletion.
The foundation creator FK remains unchanged: it is provenance, not authorization.
Global Auth account deletion and external Auth-admin state changes are outside
the app's membership management and still need a separate lifecycle design.

Authenticated users have only selected safe invitation columns and manager-scoped
RLS SELECT. They cannot select token hashes/provider IDs or directly write any
invitations, memberships or audit records. Private fixed-search-path functions
avoid recursive RLS. Definers belong to the trusted migration owner. Anonymous
users can call only the limited invitation preview with possession of valid
256-bit proof; it returns no email, user IDs or organization ID. Keep `private`
outside the exposed Data API schemas.

Removal marks the membership INACTIVE, preserving the global Auth account. The
existing RLS helpers deny subsequent authorized workspace/data requests. Responses
already received cannot be recalled. Future Colyseus/LiveKit services must validate
membership and disconnect revoked users; no realtime or media disconnection is
implemented here.

## Capacity, rate limits and transaction boundaries

All invitation/member mutations acquire the same organization row lock, then
recheck permissions. Capacity is ten ACTIVE memberships plus unaccepted,
unrevoked, unexpired invitation reservations. Failed or uncertain email delivery
keeps its reservation until revoke/expiry, which is visible in the UI.

Acceptance revalidates the hash after taking the lock, verifies the current Auth
email and expiry, consumes the reservation and upserts/reactivates one membership
using the stored invited role in the same transaction. Existing active membership
keeps its current role. A repeated acceptance by the original recipient returns
the workspace only while membership remains active; an accepted link cannot
restore removed access. The unique organization/user constraint prevents duplicates.

The database limits create/resend to 20 per organization/hour and 10 per
actor/organization/hour. Resend also requires 60 seconds since the prior attempt.
Revoking/recreating does not erase rate-limit events. Expired reservations do not
consume seats. A resend after expiry must reacquire capacity. Locking and uniqueness
provide concurrency controls; real concurrent remote sessions remain untested.

## Real email configuration

No existing transactional provider was found. Delivery uses the Resend HTTP API
through one dedicated server function, using built-in fetch; no email SDK or new
browser dependency is installed. Add these server-only values to the existing
ignored `apps/web/.env` (or higher-precedence `.env.local`):

```dotenv
APP_URL=http://localhost:3000
INVITATION_DELIVERY_MODE=email
RESEND_API_KEY=
INVITATION_FROM_EMAIL=
```

Use a plain sender email address on a verified Resend domain, and a restricted
server API key. `APP_URL` is an exact trusted origin: HTTPS for deployed apps,
HTTP allowed only for localhost/127.0.0.1. It must agree with the origin used for
normal Supabase Auth and its existing Site URL/SSR email templates. The app never
builds invitation links from Host, Origin, Referer or an arbitrary next parameter.
Restart development or rebuild/restart production after changes. Never prefix
these variables with `NEXT_PUBLIC_`, paste their values into docs, or commit them.

For local testing, set `INVITATION_FROM_EMAIL=onboarding@resend.dev`. This sender
can deliver real emails only to the address registered with the Resend account;
other real recipients require your own verified domain and a sender on that
domain. A recipient restriction can still cause HTTP 403 after correcting the
sender. Do not use a personal Gmail address as FROM or try to verify gmail.com.
See [Resend's testing restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

Do not resend an unsupported testing recipient while this sender remains in use.
Revoke that invitation intentionally if its reserved seat is no longer needed,
and create a separate invitation to the permitted test address when appropriate.
The app never substitutes recipients or edits an existing invitation's recipient
to work around provider restrictions. Normal membership checks still apply; an
already active member cannot be invited again to the same workspace.

The FROM value comes exclusively from server configuration: `email.ts` reads
`INVITATION_FROM_EMAIL`, and `deliverInvitationEmail` serializes `config.from`
into the Resend request. Creation and resend use this same path. Actor/recipient
addresses never supply a sender fallback; the inviter display name appears in
the email body only. A missing sender fails configuration validation.

Next.js reads environment values in this order, stopping at the first definition:
`process.env`, `.env.<NODE_ENV>.local`, `.env.local`, `.env.<NODE_ENV>`, `.env`.
Files belong in `apps/web`, the Next.js application root. Development uses
`NODE_ENV=development`; build/start use production. An inherited terminal or
deployment variable takes precedence even if `.env` contains the expected value.
See [Next.js environment loading](https://nextjs.org/docs/pages/guides/environment-variables#environment-variable-load-order).

If a previous request used a different sender, stop the running app with Ctrl+C.
In the PowerShell terminal used to restart it, clear a stale process override
without printing any settings, then start from the workspace root:

```powershell
Remove-Item Env:INVITATION_FROM_EMAIL -ErrorAction SilentlyContinue
pnpm dev
```

Keep the approved value in ignored `apps/web/.env`, and correct any higher-priority
sender definition before restarting. For a deployment, correct its server
environment and restart/redeploy the app. Do not put server secrets in
`next.config.ts`'s `env` object. No automatic send is part of this diagnosis.

These settings configure workspace invitations only. Supabase signup/confirmation
and password recovery mail still use the project's separate Auth email/SMTP
configuration and existing SSR templates. Keep email confirmation enabled.

Missing/invalid configuration fails before creating a reservation or contacting
the provider and clearly states that no email was sent. The email includes the
workspace, inviter display name if available, role, UTC expiry and a review link,
with escaped HTML and a plain-text alternative. Disable click/open tracking for
invitation emails in Resend to avoid routing bearer links through tracking URLs.

Creation commits before the external request. A 12-second bounded request uses
a per-invitation/generation idempotency key. Provider rejection, malformed response
or timeout never yields a delivery-success message. Only a valid successful API
response allows the application to report provider acceptance. Inbox delivery is
not claimed. Status updates are generation/actor-scoped so stale completions
cannot overwrite a later resend. Bookkeeping is best effort, not authorization
or independently trusted evidence of delivery.

Known provider rejections now show fixed, safe explanations for the resend.dev
recipient restriction, an unverified sender domain, API authentication/permission
failures and rate limiting. Other 4xx failures show only the HTTP status and ask
an administrator to inspect the failed Resend request. Raw provider messages are
never rendered or logged. Timeouts, transport errors, 5xx failures and malformed
success responses retain the delivery-uncertainty warning. Correct configuration
before intentionally resending; simply waiting cannot fix a domain restriction.

No durable outbox/background worker is added. A process crash can leave an
unconfirmed/sending row. The intentional resend action rotates the token, extends
expiry, and makes all older links invalid, after the cooldown. If a late email
arrives for an earlier attempt, its old proof cannot accept after rotation. A
provider-accepted email with failed bookkeeping gets a distinct warning. Revoke
releases the reservation; it cannot recall an already delivered email.

References: [Resend sending API](https://resend.com/docs/api-reference/emails/send-email),
[idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
Provider configuration/real inbox delivery are currently NOT TESTED.

## Development invitation links

Use the existing ignored `apps/web/.env` for provider-independent invitation
testing. The local file has been configured for this mode; restart `pnpm dev`:

```dotenv
APP_URL=http://localhost:3000
INVITATION_DELIVERY_MODE=link
```

The default mode is `email`. `link` is permitted only when the server's NODE_ENV
is exactly `development` or `test`. Production and unknown environments reject
link mode before any create/rotate RPC, with no email fallback. Unknown modes
are rejected. Production builds still compile; the runtime guard prevents issuing
links, and the Team page reports the invalid configuration. Use email mode for
production. Never change production NODE_ENV to bypass the guard.

Owners can create MEMBER/ADMIN links; admins can create MEMBER links. On Team
members choose **Create invitation link**, then **Copy link**. The transient result
shows UTC expiry and a manual selection fallback if clipboard permission fails.
The link is returned only in that authorized action result, not restored on a
fresh page load. It is not an anchor/prefetch target, hidden form field, localStorage
entry or list property. Previous action state is discarded before a subsequent
Server Action submission, so the raw link is not posted back as previous state.

For existing pending/expired invitations choose **Regenerate invitation link**.
The original token cannot be recovered. Regeneration calls the existing atomic
`resend_organization_invitation` RPC: it rotates the hash/version, invalidates all
old links and renews the seven-day expiry, respecting the 60-second cooldown,
hourly limits and capacity recheck for expired reservations. Failed permissions
or rate checks return no link. The same SQL audited `invited`/`resent` events are
used. No new migration or permissions are required.

Both modes use the same 32-byte random tokens, hash-only database storage and
fixed trusted APP_URL origin validation. Link mode does not require Resend
credentials, contact a provider, or mark an email `sent`/`failed`. The existing
delivery-status default remains `sending` as provider bookkeeping; the UI calls
unconfirmed email **Not confirmed**, without claiming email was sent or is queued.
The invitation's lifecycle/reserved seat is independent of that field.

Share the copied link privately with the exact invited address. The existing
`/invite/[token]` capture route and explicit acceptance flow are unchanged.
Normal Supabase registration, email confirmation, login and RLS remain required;
this mode removes only invitation-email delivery. A different browser used for
Auth confirmation should reopen the same private invitation link.

Manual checks with dedicated accounts: create/copy a link; open it in a separate
browser profile; register/confirm or sign in as the recipient; explicitly accept;
verify membership. Repeat with a different account, revoke and regenerate links,
and verify old proofs no longer accept. Use the existing rollback-only SQL suite
for expiry/capacity/role boundaries; do not edit real invitation timestamps to
simulate expiry. See the detailed results/checklist in the validation report.

## Secret-link handling

Raw invitation tokens use 32 cryptographically random bytes. In email mode they
appear only in the server delivery request/email link and the recipient's
HttpOnly, SameSite=Lax cookie (Secure in production). In development/test link
mode only, the authorized manager also receives the link in a one-time Server
Action result and its copyable client UI. Neither mode stores raw tokens in
database rows, hidden form fields, browser storage, list props or application logs.
The cookie retains the invitation through normal login/signup confirmation and
is cleared after successful acceptance or dismissal. A different browser used for
confirmation should reopen the original private invitation link; there is no open-redirect
parameter or Auth-token handoff between browsers.

Invitation responses are private/no-store, no-referrer, noindex and frame-denied.
Next development logging ignores invitation paths. No third-party scripts or
tracking pixels were added. Deployment owners must also redact `/invite/*` paths,
Cookie headers and request bodies from reverse-proxy/CDN/APM/error logs, and must
not enable link tracking or cache these routes. The application cannot configure
external logging infrastructure in this phase. See
[Next logging configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/logging).

## Test and migration workflow

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:organization-setup
pnpm test:team:database
pnpm build
pnpm test:smoke
pnpm test:live
pnpm test:organizations:anonymous
pnpm test:team:anonymous
```

`test:team:database` uses development-only `@electric-sql/pglite@0.5.10`, actual
PostgreSQL functions/RLS and non-superuser roles in a disposable empty in-memory
database. Minimal local Auth identity/functions are fixtures, not a Supabase Auth
implementation or production-data copy. It executes the exact two migrations,
the team assertion suite, and the existing foundation SQL regression suite.
All application/audit fixtures roll back; the database is closed/discarded. No
remote project, real user or email is touched. This does not test PostgREST,
real email confirmation, remote grants, or multiple concurrent connections.

`test:team:anonymous` checks the live Data API using only the public key: invitation
reads and all nine privileged RPCs must be denied, and invalid proof must return
no preview data. It sends no email and creates no fixture records. The separate
rollback-only `supabase/tests/team_access_guards.sql` checks those RPCs under an
authenticated database role with no Auth subject, plus anonymous guards. These
negative checks do not replace authenticated tenant workflow tests.

Before remote application, reconfirm linked ref `rofutnholbtdmxccrkbs`, inventory,
web configuration, migration history and catalog using the same CLI workflow as
[Step 3](organizations.md#migration-workflow-and-required-configuration).
`supabase/tests/team_schema_audit.sql` provides a read-only metadata/invariant audit.
Run the dry-run and confirm exactly the reviewed file is pending. **Obtain the
user's explicit approval before `pnpm exec supabase db push --linked`.** Stop for
unexpected files, conflicting objects, divergent history or unsafe changes.
Never reset/repair/delete existing data or use manual Dashboard SQL.

The reviewed Step 4 migration has now been approved/applied, history and catalog
checks passed, and public types were regenerated. With dedicated accounts ready,
run the live rollback suite:

```sh
pnpm test:team:live --check
pnpm test:team:live
```

Use the same three dedicated, normally registered and confirmed A/B/C accounts
and ignored `supabase/.env.organization-tests.local` described in
[account preparation](organizations.md#dedicated-test-accounts). No passwords,
tokens, admin confirmation or Auth-user changes are involved. The full runner
verifies those users and executes via CLI; it never sends email. Missing accounts
exit NOT TESTED rather than silently succeeding. The suite's private failure
trigger and memberships are uncommitted test setup, not weakened product policies.
Real concurrent sessions and end-to-end browser/email workflows need a separately
scoped development fixture workflow because they cannot share uncommitted fixtures.

## Manual browser verification after approval and setup

1. Use dedicated controlled inboxes, complete normal registration/email confirmation,
   and log in as A (OWNER), B (recipient MEMBER) and C (recipient ADMIN) in separate
   profiles. Keep existing Auth URL/templates and email confirmation enabled.
2. As A open Team members, invite B/C with authorized roles, inspect the actual
   inboxes, and verify organization, role, expiry and sender. Missing provider
   configuration/failure must never show a successful send.
3. Open a link signed out. It should land on clean `/invite`, preview limited info,
   and create no membership. Test login and new-user registration/confirmation
   continuation, wrong-email rejection, explicit acceptance and workspace redirect.
4. Verify invalid/expired/revoked/accepted links, resend cooldown, rotation of older
   links and late/failed delivery feedback. Test two sessions accepting the same
   invitation: one active membership, no extra seats, safe repeat result.
5. Verify role-specific controls and direct RPC denials, cross-tenant URLs/reads,
   member email visibility and the ten-seat active-plus-reserved boundary.
6. Remove B without deleting Auth. Refresh B's workspace/directory to confirm
   access is denied. Test role changes, last-owner rejection and exact-name
   ownership transfer; verify A becomes ADMIN and C OWNER.
7. Check desktop and 375px mobile widths, table scrolling, native disclosure
   controls, keyboard focus/labels, pending/disabled buttons and inline feedback.
   Check new requests after revocation and provider/network failures.

No persistent browser fixtures were created during this task. Creation/email or
multi-connection tests commit across requests; scope those dedicated fixtures and
cleanup before executing them. Do not use existing real employees as test targets.
No game, chat, voice, billing or later-phase service was implemented.
