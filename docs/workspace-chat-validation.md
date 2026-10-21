# Phase 3 Step 2 — Office Chat and availability

Date: 2026-10-22. Branch confirmed by reading `.git/HEAD`:
`feature/p3-s02-workspace-chat`. No Git commands, account creation, email sends,
database resets, existing-row overwrites or deletions were performed. The one
explicitly approved chat migration was applied through the linked CLI.

## Current status and migration approval

**Remote migration: APPLIED successfully on 2026-10-22 with explicit user approval.**
Only `20261022000100_workspace_chat.sql` was applied to the confirmed development
project. Schema verification and all executed regression checks passed. Positive
authenticated chat persistence, live quota/idempotency and cross-tenant workflows
remain **NOT TESTED**; the user chose to keep authenticated browser checks manual.

Target identity was checked using the linked CLI and project inventory:

- Ref: `rofutnholbtdmxccrkbs`.
- Name: `2D-Virtual-Office-SaaS-Platform`, ACTIVE_HEALTHY; the existing user-confirmed
  development target. Web and realtime configuration match it.
- Immediately before application, remote history contained `20261021000100` and
  `20261021000200`, matching local foundation/team history; chat was local-only.
  The four RLS-protected foundation tables and team authorization helpers existed.
- The repeated read-only preflight found zero chat table/function name conflicts.
- The final pre-application dry-run listed exactly
  `20261022000100_workspace_chat.sql`, with no seeds/roles.
  A CLI dry-run lists pending work; SQL execution/semantics were separately tested
  in disposable PostgreSQL. No reset/delete/replacement operations are in this SQL.

Final reviewed migration SHA-256:
`5F5382145D0614B895389E8C1122F22F98F49831FA36BF83C39402B87FE382FF`.
The checksum matched immediately before application. Remote history now matches
all three local versions, including `20261022000100`.
The final post-application dry-run returned `upToDate: true`, `migrations: []`,
and no roles/seeds. The migration checksum was unchanged after verification.

The applied additive migration:

| Change | Purpose |
| --- | --- |
| `offices UNIQUE(id, organization_id)` | Allows a composite FK proving channel/office tenant identity; existing IDs are already unique |
| `chat_channels` | One fixed `Office Chat` per organization and office, RLS and SELECT-only grants |
| `chat_messages` | Append-only body, authoritative sender/name snapshot, client request UUID, server time and bigint identity |
| Two message indexes | `(channel_id,id DESC)` history; `(sender_id,created_at DESC)` rate checks |
| Sender/request unique constraint | Global caller-scoped idempotency, including retries across offices |
| Office INSERT trigger and backfill | Idempotently provision channels for future and existing offices; no existing records are overwritten |
| Two RPCs and private helpers | Authorized atomic sending and bounded history; no direct client table writes |

All four functions pin an empty search path and qualify relations. The send RPC
uses SECURITY DEFINER solely to permit the guarded atomic append while denying
direct inserts/updates/deletes. It derives `auth.uid()` itself, uses the existing
verified ACTIVE-member `private.team_lock`, and takes a per-user transaction lock
for atomic rate/idempotency checks across offices. It checks membership before
returning even an idempotent retry. Changed payload/office reuse is rejected.
The history RPC is SECURITY INVOKER with explicit authorization and table RLS.
Private policy helpers avoid recursive membership RLS. Public/anon EXECUTE is
revoked; only the necessary authenticated functions are granted. No service-role
or secret key is used by the application.

Executed after explicit approval, identity/history checks, checksum confirmation
and the final one-migration dry-run:

```sh
pnpm exec supabase db push --linked
pnpm exec supabase db query --linked --file supabase/tests/workspace_chat_postflight.sql
```

The push reported exactly the approved migration applied, no seeds or roles.
The ten initial postflight checks passed remotely. The expanded postflight has
**17 passing live checks**, adding validated foreign keys/composite uniqueness,
valid indexes, sequence restrictions, helper restrictions, existing-feature RLS
and matching default channels for every existing office.

Additional executed read-only checks:

```sh
pnpm exec supabase db query --linked --file supabase/tests/workspace_chat_live_denials.sql
pnpm exec supabase db query --linked --file supabase/tests/workspace_chat_regression_audit.sql
pnpm test:chat:anonymous
```

The SQL denial probe runs in a read-only transaction, verifies anonymous and
nonexistent-user role contexts cannot obtain/send chat, and returns its completion
marker only after ROLLBACK. It never selects an existing user's identity or changes
Auth records. This is database authorization testing, **not an authenticated login**.
Six PostgREST tests independently verify anonymous table/RPC denial and invalid
bearer rejection through the real Supabase HTTP API. No raw provider responses,
credentials, invitation tokens or user identifiers are logged.
The existing `supabase/tests/team_access_guards.sql` was also rerun against the
linked database and returned its rollback completion marker successfully.

The existing-feature audit passed: six existing RLS-protected tables, eleven
foundation/team RPCs with fixed security settings, five existing triggers, nine
policies, hidden invitation hashes and restricted private audit records. An
aggregate-only check confirmed at least two normally confirmed, non-anonymous,
active members share an active organization/office. It does not identify them or
prove their passwords/sessions are available. No connected browsers or dedicated
test credentials were available; the user explicitly retained manual browser QA.
No Dashboard SQL edits, resets or data deletion were used.

## Architecture and contracts

The existing Colyseus connection and canonical office room are reused. Auth,
movement, collision maps, avatars and reconnection are preserved.

| Direction / event | Contract |
| --- | --- |
| Client `chat.send` | `{body, clientMessageId}` only; no sender, organization or channel identity |
| Server `chat.message` | Committed `{id, channelId, senderId, senderName, body, clientMessageId, createdAt}` |
| Server `chat.error` | Request UUID or null plus fixed INVALID/RATE_LIMIT/DENIED/UNAVAILABLE code; no raw database errors |
| Client `availability.set` | `{status: AVAILABLE \| BUSY \| DO_NOT_DISTURB}`; server updates only the sending session |
| Server `availability.error` | Fixed failure category; never updates another member |

Every send/status change independently revalidates verified Auth, real office and
ACTIVE organization membership. Send persistence uses that user's bearer and the
existing publishable key; PostgreSQL independently checks again under the same
organization lock used by member removal. Only a committed RPC response is
broadcast. Repeated requests acknowledge the original record only to the sender.
Database failure or uncertain transport does not become a successful send.

Bodies allow 1–2,000 Unicode code points, maximum 8,000 UTF-8 bytes. Both runtimes
normalize CRLF/CR to LF and trim outer whitespace, preserving interior text.
Controls other than tab/newline are rejected. SQL enforces five new messages per
ten seconds per sender, including direct RPC calls. Retries do not consume new
quota. The existing 12 KiB socket payload and room message caps remain; one chat
operation per session is in flight. Availability changes are limited to one per
second and require fresh authorization. Client-supplied identity fields are rejected.

The history Server Action follows the existing requireUser/SSR-client pattern.
It requests the latest 30 records plus one pagination sentinel through the
user-scoped history RPC. IDs travel as strings to avoid bigint precision loss;
strict `< beforeId` cursors provide deterministic ordering without timestamp
rounding issues. Saved sender-name snapshots avoid N+1 profile reads. A narrow,
versioned shared RPC type contract covers this SQL. The general
`database.types.ts` remains the earlier foundation/team snapshot; chat uses its
explicit separate contract rather than depending on ungenerated table types.

## UI, recovery and performance boundaries

- A collapsible **Office Chat** panel sits beside the office on desktop. On small
  screens it becomes a dedicated panel instead of covering the avatar. Controls
  are labeled, focus returns to the toggle on close, and messages render as React
  plain text. HTML-like message text never becomes markup.
- Timestamped messages, empty/loading/error states, Send, older-page loading,
  connection feedback and Show latest are implemented. Enter sends; Shift+Enter
  inserts a line break, with IME composition protected.
- Drafts survive panel close and temporary disconnect. Uncertain sends retain
  their UUID/body; retry cannot duplicate a committed message. Acknowledgements
  only clear the matching draft. Unsent content never enters the confirmed list.
- History/live/retry records merge by persisted ID. The active window is bounded
  to 150 records. Older pagination drops newer records when needed; Show latest
  returns to the current tail. Scroll anchors are preserved when prepending.
- Automatic following occurs only near the bottom. Reconnection refreshes the
  latest window in follow mode; readers of older messages get Show latest without
  a forced jump. History is not fetched on avatar/status movement updates.
- Availability extends existing player state and defaults to AVAILABLE. It
  survives a short seat reconnection; a fresh join/process restart may reset it.
  Online/offline is still connection-derived. Participants reuse the real roster,
  showing preset, safe display name, availability and connection text, never email.
- Presentation-only roster changes reach React; position ticks do not. Socket
  listeners and UI subscriptions are cleaned up. User/office keys reset message,
  draft and participant caches across account/workspace changes.
- Existing periodic authorization and the 15-second hard lease still disconnect
  removed members. Sends/status perform an additional fresh check; history RLS
  immediately denies removed users. Already received text cannot be recalled.

## Actual verification results

| Check | Result |
| --- | --- |
| Branch, linked project, remote history and conflict audit | PASSED |
| Migration review and final pre-application CLI dry-run | PASSED; exactly the approved migration pending |
| Approved linked CLI application and matching three-version history | PASSED; only the approved chat migration applied |
| Live postflight: tables, indexes, constraints, RLS, grants, functions, trigger and existing-office channels | PASSED — 17 checks |
| Existing-feature catalog and aggregate two-member readiness audit | PASSED — all seven booleans true; no identities exposed |
| Live read-only SQL anonymous/missing-identity denials | PASSED; final ROLLBACK completion marker returned |
| Existing live team SQL guards after chat migration | PASSED; final ROLLBACK completion marker returned |
| Live anonymous/invalid-bearer chat PostgREST tests | PASSED — 6 tests; no positive account workflow implied |
| Lint, strict typecheck, web and realtime production builds | PASSED |
| Web unit/service suite | PASSED — 74 tests, including chat validation/window/cursor/subscription cases |
| Realtime tests | PASSED — 9 tests; real HTTP/WebSocket events with synthetic Auth/store |
| Chat SQL suite | PASSED — 14 named assertions, explicit denials, 17 catalog checks; disposable PostgreSQL with synthetic authenticated roles |
| Existing foundation/team/avatar SQL after all three local migrations | PASSED — 54 team + 26 foundation assertions and avatar guards; fixtures roll back |
| Organization runner setup | PASSED — 4 tests |
| Production HTTP regression | PASSED — 9 checks |
| Live negative Auth/team/org and built realtime regression | PASSED — 8 Auth, 5 organization, 11 team and 1 built realtime checks; no positive chat/account claim |
| Actual React/Phaser chat browser fixture | PASSED — plain text, paging/order, scroll, Enter/Shift+Enter, uncertain retry, drafts, mobile, office-switch cache reset, focus and game instance |
| Existing Phaser/multiplayer rendering browser regression | PASSED — movement, collisions, presets, interpolation, presence cleanup and reconnect-header fixture |
| Actual Supabase positive send, persisted reload/history, idempotent retries and five-per-ten-second rate limit | NOT TESTED — no authorized test logins/explicitly configured account UUIDs available; local PostgreSQL coverage passed |
| Live authenticated cross-tenant and removed-member workflows | NOT TESTED — no signed-in test sessions; synthetic PostgreSQL/transport coverage passed |
| Future-office trigger exercised through a live authenticated provisioning RPC | NOT TESTED — deployed trigger/backfill verified; future provisioning passed locally |
| Two verified users chatting/status/reload/removal in actual application | NOT TESTED — user chose manual verification; account availability confirmed only in aggregate |
| Multiple physical PostgreSQL connections / production TLS / representative GPU | NOT TESTED |

SQL tests exercise real PostgreSQL roles/RLS: verified send/read, backfill/trigger,
idempotency, quota, invalid/blank/oversized input, ordering, pagination, forbidden
direct writes, cross-tenant reads/sends, unverified and removed users, and anonymous
access. The transport suite verifies committed delivery/acknowledgement, tenant
separation, retry deduplication, failure feedback, rejected identity/status spoofing,
BUSY/DND propagation, reconnect retention, removal and existing movement/security.
Its persistence provider is synthetic; PostgreSQL persistence is tested separately.
These tests are not claims of live Supabase users or end-to-end account delivery.
All suites above were rerun after applying the migration. No positive live send
was performed; no test chat messages or organizations were persisted remotely.

Executed verification commands (repository root):

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:chat:database
pnpm test:team:database
pnpm test:organization-setup
pnpm test:smoke
pnpm test:live
pnpm test:organizations:anonymous
pnpm test:team:anonymous
pnpm test:chat:anonymous
pnpm test:realtime:live
pnpm test:chat:browser
pnpm test:office:browser
```

All exited successfully. `pnpm test` ran 74 web and 9 realtime tests; browser
suites use isolated synthetic providers and must not be counted as account QA.
The schema audit, SQL denial probe and existing team guards used CLI-linked live
database access; the local `test:chat:database` and `test:team:database` suites did
not. No new dependencies, provider configuration or authentication changes were
needed. Missing test sessions are the remaining verification limitation.

The post-application transport rerun passed with **22 ms** committed-chat
observation, **20.0 Hz** simulation, **0.197 ms** mean simulation work/tick and
**1,248 payload bytes/s** to one observer (synthetic Auth/store, loopback only).
The chat browser fixture rerun passed with a **42 ms** initial UI render, **54.1 FPS**
closed and **60.4 FPS** open; the separate ten-avatar fixture measured **46.5 FPS**.
These remain short software-WebGL observations, not production benchmarks.

Earlier pre-application performance observations: isolated loopback chat was observed after **22 ms**,
including the synthetic store's 15 ms delay and polling. With ten players the
server measured **24 ticks / 1.202 s (20.0 Hz)**, **0.152 ms average simulation
work/tick**, and **1,571 payload bytes to one observer (1,307 bytes/s)**. These
exclude network framing, real database latency and internet conditions. The first
isolated browser UI render sample was **44 ms**, using synthetic committed events.
The final isolated chat UI render observation was **16 ms**. In the same Chrome
155 software-WebGL fixture, closed-chat rendering measured **67 frames / 1.2078 s
(55.5 FPS)**; open chat measured **72 frames / 1.2007 s (60.0 FPS)**. These short
warm-up-sensitive samples are not evidence that chat improves FPS or that a
sustained normal-GPU target is met. The separate ten-avatar engine fixture measured
**46.2 FPS** using SwiftShader. Live database/chat latency and representative-GPU
rendering remain NOT TESTED.

During final browser checks, the harness attempted focus before the mobile
layout committed and Windows retained a profile after forced Chrome shutdown.
The harness now waits for the visible canvas and closes its isolated browser
gracefully. Both suites passed on rerun. During live migration verification, an
initial denial probe attempted a no-row UPDATE in a read-only transaction;
PostgreSQL correctly returned `25006` before checking write permissions. The probe
now checks write grants without attempting UPDATE; it passed on rerun. Direct
write attempts remain covered by the disposable database suite. No application
defect or unresolved automated failure was found during this verification.

## Remaining manual authenticated QA

No new environment variables or provider are required. Use the existing ignored
web/realtime env files; both target the same development project. Start:

```sh
pnpm dev:all
```

The two previously created invitation-test members can be used by the user after
normal login, provided they are the intended dedicated accounts. The database
confirms an eligible same-office pair exists but does not establish which browser
profiles belong to that pair. Use A/B in the same test organization and an
explicitly authorized C in another for cross-tenant QA. Do not choose unrelated
real users or create accounts without authorization. Do not bypass confirmation,
edit Auth records, mint test JWTs, weaken RLS or use a privileged application key.

1. Enter the same office as A/B in separate browser profiles; verify roster and
   saved presets. Open Office Chat and exchange messages in both directions.
2. Refresh A, reconnect B, and verify persisted history, chronological ID order,
   cursor pagination and absence of duplicates. Repeat an uncertain send with
   its existing request, checking exactly one record is visible. A test requires
   a real committed send, a separate subsequent history read and one persisted
   record for the same sender/request; schema constraints alone are insufficient.
3. Check blank/oversized messages and five-per-ten-second limits: five new requests
   succeed, the sixth in the window is denied, and retrying a committed request
   returns its original record without consuming another quota slot. Test a temporary
   database/network failure: no success is shown and drafts remain retryable.
4. Test Enter/Shift+Enter, plain-text HTML-like input, scroll retention while
   reading older messages, Show latest, focus return and small-screen layout.
5. Set Busy and Do Not Disturb as A, confirm B sees changes, then reconnect A and
   verify status retention independently of connection state.
6. Move both avatars while chatting; test walls, zoom and typing focus. Confirm
   one game/connection and no history request on movement patches.
7. Verify C cannot read/send A/B's chat or target their status; switch authorized
   offices/accounts and confirm prior messages/drafts are cleared from the view.
8. Remove a dedicated member through normal team management; verify immediate
   history/send denial and socket closure within the existing 15-second window.
   Test sign-out/expiry and unauthorized/expired-token admission.

## Files and merge readiness

New: `packages/shared/src/{chat,chat-database}.ts`,
`apps/web/src/features/chat/{actions,events,chat-panel,participants,chat.test}`,
`apps/realtime/src/chat/store.ts`, realtime `tests/chat-store.test.ts`, migration,
`supabase/tests/workspace_chat{,_schema_audit,_postflight}.sql`,
`scripts/{chat-database.test,test-chat-browser}.mjs`, and this report.
This migration-verification pass added the live denial/regression SQL files,
`apps/web/tests/chat-live.test.mjs`, a `test:chat:anonymous` command and expanded
read-only postflight checks. It updated migration status in README/architecture
and clarified the RPC contract comment; application behavior and approved SQL
were not changed during the verification pass.
Changed: shared protocol, existing realtime room/state/server/bootstrap/tests,
office network/canvas/page, CSS, root scripts, database regression runner, README
and architecture documentation. No new production dependency was installed.

**Migration and account-independent verification complete. Not ready to merge
until authenticated live persistence/idempotency/rate/security and manual browser
checks above pass.** There are no remaining migration approvals or schema blockers.
Implementation and executed checks can be reviewed now. Stop after Phase 3 Step 2;
LiveKit/voice, direct messages, attachments and later phases remain unimplemented.

Primary guidance: [Colyseus messages](https://docs.colyseus.io/room),
[Supabase function privileges](https://supabase.com/docs/guides/database/functions),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
