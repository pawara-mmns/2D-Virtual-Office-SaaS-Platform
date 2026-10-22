# Communication and MVP stabilization validation

## Phase 5 Step 1 — MVP stabilization and security hardening

Date: 2026-10-22. Branch confirmed by reading `.git/HEAD`:
`feature/p5-s01-mvp-stabilization`. Phase 4 merge status and successful manual
voice use were reported by the user; no Git history operation was performed to
verify that merge. The Phase 4 sections below are historical records. This
section is the current stabilization result.
The latest real-world validation preflight is recorded in the continuation below
at 04:02 UTC; it remains blocked on accessible authenticated test sessions.

**Implementation and available automated validation are complete. Merge-ready:
NO.** Required authenticated multi-user, issued-token replay and measured Cloud
revocation checks remain NOT TESTED. User-reported working voice is useful
feedback, but does not supply those security measurements.

### Audit findings and fixes

| Finding / root cause | Minimal fix and regression evidence |
| --- | --- |
| Pending chat history survived connection loss and later changed the visible message window | Disconnect invalidates the history generation and clears its loading/anchor refs, retaining the draft and existing window. Actual component regression reproduced 60 messages instead of the expected unchanged 30 before the fix; it now passes and reconnect/history/retry remain usable. |
| Late state patches repopulated participants and changed presence to online after drop/final leave | Ignore synchronized state callbacks while the transport is offline. Regression failed with `online` instead of `reconnecting` before the fix; it now also checks final leave keeps an empty roster and no snapshot. |
| Production server shutdown did not await voice-service shutdown; the previous test manually closed it | Register the existing voice close operation with Colyseus `onBeforeShutdown`. The real HTTP/WebSocket fixture now relies on server shutdown and asserts that delayed voice cleanup completes before shutdown resolves. It failed without the hook and passes with it. |
| Shutdown could finish while a different caller was already removing media | Share both the overall close promise and each participant's removal promise. Gated-provider regressions prove overlapping close calls and an already-running zone-exit removal are awaited and issue one removal, instead of shutdown completing early. |
| A Cloud inventory response arriving after close could continue orphan removal against a replacement authority | Stop closed-service notification/observation and check the closed flag after inventory awaits and between identities. Gated room-list and participant-list regressions prove no later inventory/removal operation occurs after shutdown. An already-issued provider request cannot be undone. |
| A slow token signer could return admission after the fresh authorization lease expired, before the timer checked it | Recheck the existing lease immediately after signing; revoke and reject expired/cancelled admission. Regression first returned a token unexpectedly and now rejects it with 403. Consolidated the error path so this rejection does not remove the same admission twice. |
| Voice admission described an Auth service outage as a sign-in problem | Keep HTTP 503 and return a temporary-authentication-unavailability message. Regression proves neither session retrieval nor token forwarding runs after an unavailable Auth result. |

These are narrow lifecycle, freshness and feedback fixes. No new feature, schema,
dependency, map, sprite or authentication architecture was added. No confirmed
cross-company RLS bypass was found in this audit; that is not a claim that the
unexecuted authenticated Cloud cases pass.

### Scope reviewed and retained

- Auth: SSR cookie refresh/no-store behavior, fresh verified `getUser` at protected
  boundaries, expired/unverified/anonymous denial, recovery proof and redirects.
- Multiplayer: authoritative movement/collisions, canonical office admission,
  duplicate-user/seat limits, bounded reconnect, credential checks and hard lease.
- Chat/presence/profile: tenant RLS and database RPCs, committed-only messages,
  idempotency, quotas, bounded history, roster updates, display-name privacy,
  own-profile grants and listener cleanup. Movement remains outside React state.
- Voice: server-authorized meeting zone, office/company/session binding,
  server-only keys, microphone-only grants, explicit join, cancellation races,
  independent lease, Cloud removal cutoff, restart sweep and media cleanup.
- UI: existing compact panels, focus return, keyboard-scoped movement, mobile
  chat, status/error announcements and pixel-art rendering. No redesign was made.

The existing [Colyseus reconnect lifecycle](https://docs.colyseus.io/room/reconnection)
is retained. Cloud replay expectations follow the [LiveKit revocation contract](https://docs.livekit.io/frontends/reference/tokens-grants/):
the explicit cutoff covers initial and refreshed proof; token expiry alone is not
evidence of active-session termination. Enforcement still requires real testing.

### Current environment and actual live observations

- PASS: web and realtime configurations match the development Supabase project
  `rofutnholbtdmxccrkbs`. Both already-running health endpoints returned HTTP 200.
- PASS: existing local config scan found `apps/web/.env` and `apps/realtime/.env`;
  no populated dedicated test email/password, session/token or authorized test-user
  UUID settings were available. No such current-process test settings were found.
  Browser inventory returned zero connected browsers/apps, without inventory errors.
  This is a confirmed test prerequisite limitation, not a successful login test.
- PASS: on 2026-10-22 at 03:01:49 UTC, the configured Cloud control API accepted a
  read-only inventory request in **625ms**. It reported zero application rooms.
  The actual Cloud signaling endpoint rejected deliberately invalid proof with
  **HTTP 401**. This was not a valid-token join or a revoked-token replay.
- No real microphone, speaker, listening second endpoint or signed-in account
  was accessible for this pass. Hardware absence was not inferred. No account
  was created or selected from real-user records and no token was admin-minted to
  substitute for application authorization.

### Test results executed in this phase

| Check | Result and scope |
| --- | --- |
| `pnpm lint` | PASS, both applications, no warnings |
| `pnpm typecheck` | PASS, Next route types and strict TypeScript for both applications |
| `pnpm build` | PASS, web and realtime production builds |
| `pnpm test` | PASS, **88 web + 23 realtime = 111 tests**, zero failures/skips in the final run |
| Database security/setup suites | PASS, 6 runner tests; 14 chat, 54 team and 26 foundation SQL assertions plus avatar/name self-write, cross-user and anonymous guards; fixtures rolled back in disposable PostgreSQL |
| Production-route and live-negative Supabase suites | PASS, 42 tests across Auth, organization, invitations, chat and voice; no valid-user writes or emails |
| Built realtime negative-admission suite | PASS, 1 test: anonymous/invalid-proof/foreign-origin denial against configured Supabase; isolated child has Cloud voice disabled |
| Chat browser suite | PASS, extended delayed-history/disconnect regression, drafts, plain text, pagination, idempotent retries, scroll, focus and mobile behavior |
| Office composition browser suite | PASS, native panels, six presets, name/save/remount behavior, one engine, responsive layout and cleanup; synthetic action/identity/transport boundaries |
| Phaser browser suite | PASS, movement, walls/furniture, zoom/resize, six presets, sprite reuse, ten-avatar rendering and renderer teardown |
| Voice browser suite | PASS, actual React/SDK controls, simulated participants/connection and synthetic tracks: explicit capture, denial, names, mute/unmute, reconnect-disabled controls, device observers and cleanup |
| Actual Supabase/Cloud positive authenticated multi-user workflows | NOT TESTED; no authorized accessible sessions |

The new race/security tests first failed against the pre-fix implementation as
described above. A subsequent browser-batch failure was a test assumption: the
fixture expected Show latest after reconnect without putting the reader away
from the bottom. It now explicitly sets that reading position and waits for the
control; the focused rerun passed. Other browser suites passed unchanged.
**FAIL: no unresolved failures in the final executed checks.**

Commands used beyond normal root scripts:

```powershell
node --test scripts/chat-database.test.mjs scripts/team-database.test.mjs scripts/test-organizations.test.mjs
node --test --test-concurrency=1 scripts/test-chat-browser.mjs scripts/test-communication-browser.mjs scripts/test-office-browser.mjs scripts/test-voice-browser.mjs
node --experimental-strip-types --test scripts/test-realtime-live.mjs
```

Production/live-negative suites were run from `apps/web` using:

```powershell
node --test --experimental-strip-types tests/auth-routes.test.mjs tests/voice-routes.test.mjs tests/auth-live.test.mjs tests/organizations-live.test.mjs tests/team-live.test.mjs tests/chat-live.test.mjs
```

The final chat fixture correction was verified with
`node --test scripts/test-chat-browser.mjs`. Tests that use simulated users or
media are not represented as real authenticated/Cloud successes.

### Multi-user and Cloud security gate

| Required real scenario | Status | Available evidence / missing observation |
| --- | --- | --- |
| Two verified users join the same company office and see matching movements/presence/names | NOT TESTED | Local real-transport/synthetic-authorization and render fixtures pass; no two real authenticated sessions |
| Real chat synchronization, no duplicates, reload and persisted history | NOT TESTED | Local PostgreSQL and browser/transport fixtures pass; no authenticated live sends/history performed |
| Real refresh/reconnect/leave restores state and removes presence | NOT TESTED | Transport/component cleanup/reconnect regressions pass; real signed-in tab lifecycle unavailable |
| Real users in different companies remain isolated across office/chat | NOT TESTED | Local tenant fixtures and actual anonymous denials pass; authenticated tenant identities unavailable |
| Only authorized members obtain valid Cloud admission; cross-company requests fail | NOT TESTED | Unsigned/forged-input route denials and service binding tests pass; no positive authenticated token workflow |
| Revoked members cannot obtain new tokens | NOT TESTED | Synthetic membership denial passes; no dedicated live removable test membership |
| Original and refreshed token replay rejected by actual Cloud after revocation | NOT TESTED | Only fresh invalid proof was rejected by Cloud; no issued-token capture/replay executed |
| Active voice revoked within 10 seconds | NOT TESTED | No real removal performed and no elapsed revocation measurement; fake-provider timing is not Cloud evidence |
| Disconnected/zone-exited/revoked users cannot retain real voice participation | NOT TESTED | Lease/cancellation/shutdown regressions pass with fake provider; real Cloud participant not available |
| Two-way audible audio, microphone/device changes, real reconnect and track/listener cleanup | NOT TESTED | User reports working manual voice; no agent-observed two-endpoint audio or real-device checks |
| 6–10 real authenticated concurrent users with voice | NOT TESTED | Ten simulated-authorized transport clients and ten rendered avatars were measured separately |

### Performance and responsive observations

No frame-rate or latency improvement is claimed. Short local samples are not
production capacity, WAN latency or a sustained 60fps benchmark.

- Final full application/realtime run: ten-player transport fixture observed
  **24 simulation ticks over 1.202s (20Hz sample; configured 20Hz)** and mean
  simulation work **0.226ms/tick**. One observer received 1,571 payload bytes
  (1,307 bytes/s, excluding wire framing). Synthetic-store chat was observed in
  21ms and first remote movement in 105ms. No live Supabase commit/audio latency.
- Chromium 155 / i7-1165G7 / SwiftShader: separate Phaser fixture measured
  **44.1fps with one avatar, 46.6fps with ten avatars**, approximately 1.2s each.
  Sprite/texture reuse and destruction assertions passed; real hardware GPU,
  prolonged memory growth and ten-person voice load remain NOT TESTED.
- Final focused chat run: committed synthetic message to DOM observation **7ms**
  including polling. Closed/open panel samples were **55.0/59.6fps** over about
  1.2s. These are workload-dependent fixture observations, not service latency.
- Composition: desktop 1422×804 has a 1388×634 closed-chat canvas; tablet 820×1180
  retains a 446×1010 canvas with chat open. The 390×844 chat and 320×740 settings
  checks pass without horizontal overflow. Real mobile keyboards and assistive
  technology remain manual checks. The map, camera and controls were preserved.
- 1,000 equivalent voice snapshots cause one initial composition commit; roster
  callbacks remain independent of movement-only patches. Listener/canvas cleanup
  assertions pass. No per-frame React state or new texture path was added.

Current screenshots remain under ignored `.cache/` using the existing chat,
communication, office and voice preview filenames. These show isolated fixtures.

### Files modified in Phase 5 Step 1

- `apps/realtime/src/server.ts`: awaited pre-shutdown voice cleanup.
- `apps/realtime/src/voice/service.ts`: closed-poll guards, post-signing freshness,
  shared shutdown/removal promises and one rejection cleanup path.
- `apps/realtime/src/tests/{voice,realtime}.test.ts`: race and actual server-hook
  regression coverage; no Cloud credentials used by the fake provider.
- `apps/web/src/features/chat/chat-panel.tsx`: disconnect invalidation.
- `apps/web/src/features/office/network/{connection,network.test}.ts`: offline
  state guard and regression.
- `apps/web/src/features/voice/{token-service,voice.test}.ts`: temporary Auth outage
  feedback and no-forward regression.
- `scripts/test-chat-browser.mjs`: delayed-history fixture and reconnect reading
  setup; existing browser infrastructure reused.
- This existing validation report; no new documentation file was created.

### Remaining production blockers / decision

**Merge-ready: NO.** Supply access to approved verified test accounts in separate
connected browser profiles, a safe non-production cross-company/removal fixture,
and two real audio endpoints to complete the live gate. Do not paste credentials
or tokens. The existing manual sequence later in this report remains applicable.
Capture actual removal timestamps and original/refreshed replay outcomes in the
authorized private test context before claiming the 10-second security target.

Deployment remains a **single realtime/voice authority per configured namespace**.
Concurrent authorities can orphan-sweep each other's sessions. Graceful shutdown
now awaits cleanup attempts; process crashes, force-kill and Cloud/API outage
still cannot guarantee removal within ten seconds. These limits must remain
explicit until actual failure-path and Cloud enforcement tests supply evidence.

No Git command, branch switch, commit, push, merge, deployment, remote migration,
email delivery, production data reset or tenant-data write was performed. Stop
after Phase 5 Step 1; Phase 5 Step 2 was not started.

### Real-world validation continuation — 2026-10-22, 04:02 UTC

This continuation inspected the current Auth, workspace membership and voice
admission paths, the existing test-account configuration and available browser
connections. Only this report was edited. No new application defect was
established; no code, dependencies, migrations or test accounts were added.
The previous 111 application/realtime tests and 42 route checks are historical
executed results, not newly executed authenticated integration tests. They were
not repeatedly rerun in the absence of authentication prerequisites.

#### Actual prerequisite results

| Prerequisite/check performed now | Result | Observation |
| --- | --- | --- |
| Expected branch | PASS | `.git/HEAD` identifies `feature/p5-s01-mvp-stabilization`; no Git command used |
| Development project configuration | PASS | Web/realtime public configuration matches `rofutnholbtdmxccrkbs` |
| Running web and realtime health | PASS | Both configured health endpoints returned HTTP 200 at 04:02:01 UTC |
| Cloud configuration and control API | PASS | Existing server-only configuration valid; read-only room inventory completed in **466ms** at 04:02:02 UTC; zero application rooms observed |
| Accessible authorized browser sessions | BLOCKED | Inventory: zero connected browsers/apps, zero inventory errors; existing account availability/roles cannot be inferred from this |
| Dedicated login/session configuration | BLOCKED | Recognized local files present: `apps/web/.env`, `apps/realtime/.env`; no populated test email/password/session/token/user-UUID settings found, including in process environment; ignored organization-test config absent |
| Physical audio endpoints | NOT TESTED | No connected signed-in browser/device session through which to inspect permissions or devices; no claim that hardware is absent |

Cloud control-API credentials are available. They do not authenticate a person to
Supabase or establish workspace membership. No account listing/admin Auth bypass
was used to select real users. No tenant records, memberships, profiles or chat
were changed. No media token, original/refreshed replay proof or audio was
captured. The running realtime authority was not restarted or duplicated.

#### Smallest safe account setup to unblock

Reuse approved existing development test users and workspaces if already prepared.
The minimum is **three accounts**, with A also acting as the administrator:

| Test identity | Required company membership | Purpose | Current verification |
| --- | --- | --- | --- |
| A | OWNER of disposable test company X | Company administrator; observes B's movement/audio and removes only B's test membership | NOT TESTED |
| B | Verified ACTIVE MEMBER of X | Second user, audio endpoint and revocation/replay subject; never the last owner | NOT TESTED |
| C | Verified ACTIVE member/owner of separate disposable company Y, with no X membership | Cross-company isolation checks | NOT TESTED |

1. In three separate browser profiles, sign in normally to the configured local
   app's `/login` as A, B and C. Make those profiles/tabs accessible through this
   workspace's browser connection. Merely opening unconnected browser windows or
   providing user UUIDs does not provide authenticated sessions. Do not share
   passwords, session cookies, invitation links or tokens. A and B alone unblock
   the first same-office checks; C is additionally required to complete isolation.
2. If membership setup is needed, use only approved disposable development data.
   As A, open `/dashboard` → **Create workspace**, create test company X, and use
   **Team members** to invite B as MEMBER. B must explicitly accept with the
   invited, verified account. Reuse the existing permitted email or development
   invitation-link mode; do not change sender/security configuration to bypass a
   delivery restriction. As C, reuse or create test company Y and confirm X is
   not among C's memberships. Never reuse a real company's records for removal.
3. If an account is missing, its owner must first register through `/register`,
   complete the real inbox confirmation and sign in normally. Do not auto-confirm
   users, edit Auth tables or disable confirmation. Follow the existing
   [dedicated account instructions](organizations.md#dedicated-test-accounts)
   and [Supabase password-auth guidance](https://supabase.com/docs/guides/auth/passwords).
   No new account was created by the agent during this pass.
4. In each session, set distinguishable non-email display names in **Avatar
   settings**, then use **Enter office**. Confirm A's OWNER role and B/C's expected
   active memberships through normal application views before any destructive
   test action. Remove only the explicitly designated disposable B membership.
5. If using the existing rollback-only SQL suites as additional checks, place
   only the approved test UUIDs in ignored
   `supabase/.env.organization-tests.local`, following its existing example.
   UUID configuration enables those database tests; it does **not** authenticate
   browser, chat or voice sessions and cannot satisfy this integration gate.

No further Cloud key setup is needed to begin. The smallest immediate action is
to connect the already verified A/B browser profiles, then C's separate-company
profile for isolation. If browser connection is unavailable, perform the manual
sequence below and supply sanitized observations; those must be labelled
user-observed, not agent-executed tests.

#### Individual real-world results for this continuation

| Test | Result | Evidence available now |
| --- | --- | --- |
| A and B authenticate and enter X's office | NOT TESTED | No accessible real account session |
| A/B avatar movement synchronizes | NOT TESTED | No authenticated concurrent office users |
| Join/leave presence updates match on both sides | NOT TESTED | No real presence lifecycle observed |
| Chat synchronizes without duplicates; persists after refresh | NOT TESTED | No authenticated send/history request executed |
| Refresh and temporary network reconnect restore state | NOT TESTED | No authenticated tab/socket available |
| C cannot access X's office or see its presence | NOT TESTED | No verified C/X membership context |
| C cannot read/send X's chat | NOT TESTED | No real C-authenticated request |
| Authorized A/B obtain tokens and connect to Cloud | NOT TESTED | No valid application admission issued |
| Unauthenticated admission fails in this continuation | NOT TESTED anew | Earlier actual denial checks remain recorded above; not rerun as a substitute for authentication |
| C cannot obtain admission to X or receive X's audio | NOT TESTED | No authenticated cross-company request or C media endpoint |
| Removed B cannot obtain a new token | NOT TESTED | No live disposable B membership removed |
| Existing B participation ends after membership revocation | NOT TESTED | No established B Cloud participation or removal |
| Original issued-token replay after revocation | NOT TESTED | No legitimately issued original proof, replay attempt or Cloud rejection captured |
| Cloud-refreshed-token replay after revocation | NOT TESTED | No refresh event/proof observed and no replay attempt |
| Effective revocation within 10 seconds | NOT TESTED | **No revocation time measured; no numeric removal latency available** |
| Bidirectional audible audio | NOT TESTED | No two controlled physical audio endpoints/listeners |
| Mic mute/unmute and supported device switching | NOT TESTED | No real microphone/device interaction |
| Leave/rejoin/reconnect, zone exit and media cleanup | NOT TESTED | No actual media session or duplicate-track/listener observation |

**FAIL:** no new executed check failed. Blocked/unexecuted cases remain NOT
TESTED. User-reported basic voice success and the previously passing synthetic
browser/provider tests do not change any of these live results.

#### Controlled integration and audio checklist once accounts are connected

1. Keep exactly one configured realtime/voice authority. A/B enter X concurrently;
   move each avatar, change availability, send uniquely labelled non-sensitive
   chat messages, and observe both sessions. Refresh B, then briefly interrupt
   and restore only B's network. Check one participant per user, synchronized
   presence/names, one copy of each message and restored valid state.
2. As C, attempt X's office route and authenticated chat/admission requests using
   X's test office identifier. Require permission denial and no X data, roster,
   messages, token or audio. C's legitimate Y session must remain isolated.
   An anonymous denial alone does not prove this authenticated isolation check.
3. With two people/devices and headphones, A/B enter the server-authorized
   Meeting Room and explicitly Join Voice. Allow microphone permission normally.
   A speaks a unique test phrase; B confirms hearing it. Reverse direction. Mute
   each side and verify the other stops hearing it, then unmute. A participant
   count or speaking indicator alone is insufficient proof of audibility.
4. Switch real input/output devices where supported; record unsupported output
   switching as a capability limit. Verify Leave, explicit rejoin, temporary
   reconnect and zone exit. Check the browser microphone indicator clears, remote
   audio stops/tracks disappear and no duplicate participant/track remains.
   Do not use fake/synthetic media or recordings as proof of this audio test.

#### Replay and timing evidence required before a security PASS

The original admission is signed by the existing application server after normal
Supabase/member/zone checks and must actually be accepted by Cloud. A refreshed
token must be genuinely delivered by Cloud during that participant session.
Do not replace either with an admin-generated test JWT. The existing browser
scripts simulate media and do not currently constitute a real-token replay
harness. Ordinary UI-only voice use cannot establish either replay result.

An authorized private, memory-only test controller must retain those proofs
without console output, screenshots of token-bearing panels, HAR exports,
clipboard sharing or persistent files. Once genuine admission is available,
instrument that test session rather than adding a token/debug endpoint to the
application. If refresh proof is not observed, leave its check NOT TESTED.
The required [LiveKit token lifecycle and cutoff behavior](https://docs.livekit.io/frontends/reference/tokens-grants/)
is separate from new-token-request authorization.

- Run original-proof and refreshed-proof trials separately if necessary. The
  original admission lifetime is currently 30 seconds. Join, revoke and attempt
  replay while the proof is still unexpired; expiration rejection does not prove
  revocation. Capture only sanitized validity-at-replay and rejection categories.
- As A, remove only B's disposable membership through **Team members** while B
  has an established, active voice session. Do not press Leave Voice or otherwise
  voluntarily end B's session first. Observe B's actual Cloud disconnection and
  A's loss of B's media; rejection of B's next token request is a separate test.
- Using one measurement clock, record removal-request start `Tstart`, successful
  commit acknowledgement `Tack`, and effective observed loss `Tloss`. Record
  both `Tloss - Tstart` (conservative upper bound from commit) and
  `Tloss - Tack` (lower bound). An upper bound <=10s establishes the target; a
  lower bound >10s fails it. If the bounds straddle 10s, obtain more precise
  commit timing instead of inventing a pass. Never subtract unrelated devices'
  unsynchronized clocks. Check both actual disconnection and media loss.
- Attempt reconnect with each saved proof using its original opaque identity;
  require Cloud authorization rejection, not merely a later application sweep,
  duplicate-identity conflict, timeout or expired-proof error. Then test fresh
  application admission denial. Record each result independently.
- Record safe timestamps, durations, token category (`original`/`refreshed`),
  unexpired-at-replay boolean, sanitized Cloud rejection category and active
  media-loss observation. Never record token values, keys or personal addresses.
  Restore B only through a normal authorized invitation and explicit acceptance
  if a second trial is needed; no production membership changes or SQL bypasses.

No such timing or replay evidence exists from this continuation. Current
merge-readiness remains **NO**. Authentication/session access is the immediate
blocker; real audio and genuine replay instrumentation are additional requirements
for their respective checks. No Phase 5 Step 2 work was started.

## Historical record — Phase 4 Step 2

Validation date: 2026-10-22. Expected branch was confirmed by reading `.git/HEAD`:
`feature/p4-s02-communication-polish`. No Git commands, branch changes, commits,
remote migrations, email delivery, Auth user creation or production data changes.

Implementation is complete. **Not merge-ready until the authenticated browser
and LiveKit Cloud security/media checks below have been completed.** Local tests
and synthetic browser fixtures cannot establish those live guarantees.
The validation-only continuation below reconfirmed the available environment and
live denial paths; the authenticated/media gates remain blocked, not passed.

## UX changes and inspection

1. **Office layout — PASSED in isolated browser composition.** The protected
   office page fills the viewport with a compact workspace header, one toolbar,
   flexible canvas, contextual voice controls and a status footer. Avatar and
   participant settings no longer add sections above/below the canvas. The map,
   assets, collision geometry, camera tracking and zoom algorithm are unchanged.
2. **Office Chat — PASSED in isolated browser tests.** A 340px desktop side panel
   leaves the canvas visible; tablets retain side-by-side layout from 768px.
   Smaller screens use a dedicated chat view. Own messages have a border and
   `(you)` label, readable local date/time, plain text and a bounded composer.
   Closing/reopening preserves the draft, loaded history and reading position.
   Reconnect does not interrupt older-history reading; Show latest is explicit.
   The five-per-ten-second quota, database commits, idempotency and authorization
   contracts are unchanged. No new channels, attachments or direct messages.
3. **Appearance and participants — PASSED in isolated browser tests.** Both are
   native, non-modal disclosures closed initially. Only one stays open. Panels
   support outside-pointer dismissal, Close, Escape and focus return. The six
   original presets use the existing spritesheet with integer scaling. Selection
   remains a preview until Save appearance; saving does not recreate the engine.
   A display-name field edits the existing `profiles.display_name` column.
4. **Voice — PASSED in SDK-simulated browser tests; live media NOT TESTED.** Join,
   Leave, microphone status/toggle, participants, permission errors and device
   controls remain compact. The participant/device expansion is height-bounded.
   No automatic microphone capture, new Room creation path or silent forbidden
   retry was introduced. Device observer and Strict Mode cleanup fixes from
   Step 1 are preserved.

Current-run screenshots were saved and visually inspected under ignored `.cache/`:
`communication-before-chat.png`, `communication-before-mobile.png`,
`communication-office-desktop.png`, `communication-chat-desktop.png`,
`communication-tablet.png`, `communication-chat-mobile.png`,
`communication-settings-mobile.png`, plus existing chat/engine/voice previews.
The before image is the existing isolated chat/Phaser harness, not the complete
authenticated office page. These are component/composition checks with synthetic
identities, not an audit of a live signed-in two-user flow.

## Display-name source and privacy

The existing profile defaults `display_name` to an empty string. No previous UI
allowed setting it. The web server and realtime authorizer already read that
profile; blank values therefore propagated as generic labels. Appearance settings
now provide the missing edit without adding a profile system or migration.

The action and service derive the identity from fresh verified Supabase Auth,
then use the existing narrow profile grants and self-only RLS. A single PATCH
saves the explicitly edited name/avatar; missing-profile insertion and creation
races retain both fields. Existing avatar-only callers preserve unrelated names.
Tests cover denied/anonymous/unverified writes and cross-user SQL denial.

Names normalize NFKC/spacing, accept 1–18 Unicode code points for new edits,
reject email-like names and hidden control/bidi characters, and render as text.
Existing longer names are safely truncated for presentation. The shared missing
or private-name fallback is `Member`; a real display name literally `You` is no
longer confused with a missing profile. The local avatar uses its profile name
with a green label instead of spending the name budget on a `You ·` prefix.

Chat uses the already authorized office roster's names where present and the
stored sender-name snapshot otherwise. Historical rows are not rewritten and
other users' private profile rows are not queried. No N+1 lookup was added.
Realtime profile changes arrive through existing credential/authorization refresh;
LiveKit names are the verified profile snapshot at admission. After changing a
name during an existing voice call, leave and explicitly join again to refresh
that call's participant name. Offline/historical senders without a current roster
entry retain their persisted snapshot or private fallback.

## Reliability fixes

- Chat previously resubscribed on every open/close and loaded latest history,
  replacing reading position. Its connection subscription is now stable and
  opening loads only when necessary. Async request invalidation also resets
  in-flight refs for Strict Mode effect replay and initially open remounts.
- Office presence now distinguishes authorization denial from recoverable
  disconnection. Missing/expired credentials and HTTP 401/403 deny access;
  server close code 4000 is terminal. Denied states stop credential polling and
  reconnection recovery handlers cannot restore them. No Retry button is shown
  for denial. Network recovery still uses existing bounded Colyseus reconnects.
- LiveKit components-react 2.9.24 overwrites `TrackToggle.disabled` with its own
  pending state. A native disabled fieldset now enforces connection readiness
  independently. The browser regression verifies `:disabled` during simulated
  reconnect, then normal mute/unmute after connection is restored.
- Chat rows and panel are memoized with stable production callbacks. Participants
  remain presentation-only; movement coordinates never enter React state.
  Existing equivalent voice snapshots still bail out before React updates.

## Accessibility and responsive checks

Native summaries, labeled inputs/selects, radio fieldset/legend, explicit Close
buttons, Escape, focus return, visible focus outlines and error/status roles are
preserved or added. Panels are non-modal and do not trap focus. The canvas still
releases keyboard input with Tab; chat typing does not move the avatar. Mobile
continues to state that office movement requires a keyboard; touch movement was
not added. Very short viewports can scroll rather than hiding essential controls.

Office input/control borders now use `#87958b` (3.13:1 against white); existing
muted text is 5.76:1 and forest text/focus is 8.34:1 against white, calculated from
the CSS colors. Disabled controls are excluded from these contrast claims. This
is targeted checking, not a full WCAG or screen-reader compliance certification.
Real mobile virtual keyboards, assistive technology and browser engines other
than the installed Chromium remain manual checks.

## Security verification and limits

| Check | Actual result |
| --- | --- |
| Configured web/realtime development target | PASSED: both match `rofutnholbtdmxccrkbs`; values/keys suppressed |
| Anonymous Supabase profile/org/team/chat reads and RPCs | PASSED against actual configured project |
| Invalid Auth proof, session cookies, confirmation/recovery and redirects | PASSED against actual configured project/production app |
| Cross-tenant office, removed-member rejoin, reconnect and session expiry | PASSED with real Colyseus transport and synthetic authorization |
| Chat tenant RLS, append-only persistence, idempotency, rate limits | PASSED in disposable PostgreSQL with synthetic identities; live authenticated version NOT TESTED |
| Own profile name/avatar writes, cross-user and anonymous denial | PASSED in service tests and disposable PostgreSQL; live authenticated save NOT TESTED |
| Voice tenant/office/session/zone binding and microphone-only grants | PASSED in server/service and signed synthetic-token tests |
| Voice cancellation races, lease expiry, membership removal and provider failure | PASSED with fake provider; explicit cutoff/removal calls asserted |
| Microphone capture consent, leave/cancel/unmount cleanup | PASSED in lifecycle and actual UI tests using synthetic tracks |
| Browser bundles contain no server LiveKit credential references/admin SDK | PASSED in production bundle checks |
| LiveKit Cloud control API connectivity | PASSED: latest read-only inventory 477ms, zero application rooms at observation; earlier sample 496ms |
| Actual initial/refreshed token replay after revocation | NOT TESTED: requires authorized Cloud sessions |
| Actual active-session revocation within 10 seconds | NOT TESTED: no authorized live sessions; no timing guarantee inferred from fake provider |
| Two-user authenticated office/chat/audio and remote-device playback | NOT TESTED: no dedicated test logins or connected authorized sessions |

The existing server-controlled zone, fresh Auth/RLS membership checks, short
admission, independent voice lease, explicit Cloud revocation cutoff and opaque
identities remain intact. No RLS, token grants, email verification, migrations or
auth architecture were weakened. Cloud removal failure still pauses admission;
provider/API outage prevents promising a hard 10-second removal bound. See the
[LiveKit token revocation contract](https://docs.livekit.io/frontends/reference/tokens-grants/).

## Executed checks (implementation baseline)

| Command/check | Result |
| --- | --- |
| `pnpm lint` | PASSED, web and realtime, zero warnings |
| `pnpm typecheck` | PASSED, Next route generation and both TypeScript projects |
| `pnpm build` | PASSED, production web and realtime builds |
| `pnpm test` | PASSED, 86 web + 19 realtime tests, no failures/skips |
| `node --test scripts/chat-database.test.mjs scripts/team-database.test.mjs scripts/test-organizations.test.mjs` | PASSED, 6 runner tests; 14 chat + 54 team + 26 foundation SQL assertions, profile name/avatar RLS guards and rollback completion |
| Web production-route + live-negative suites | PASSED, 42 tests across Auth smoke/live, organization, invitation, chat and voice suites |
| Final production auth/voice route rerun | PASSED, 12 tests, including public bundle deferral and no server credential/admin SDK references |
| `pnpm test:realtime:live` | PASSED, one built-server anonymous/invalid-proof/foreign-origin test; isolated child has Cloud voice disabled |
| `pnpm test:office:browser` | PASSED, actual Phaser movement/collisions/focus/zoom/resize, six presets, sprite reuse, network fixture and teardown |
| Final chat/composition/voice browser pass | PASSED, 3 suites, Chromium, no runtime exceptions/React loop warnings |
| Node syntax checks on all four browser scripts | PASSED |

Browser fixtures run sequentially with:

```powershell
node --test --test-concurrency=1 scripts/test-chat-browser.mjs scripts/test-communication-browser.mjs scripts/test-voice-browser.mjs
```

The separate engine run uses `pnpm test:office:browser`. The new focused command
is `pnpm test:communication:browser`; build first so generated production CSS is
available. Actual connected Cloud audio and positive authenticated database
workflows are **NOT TESTED**, independently of these passing fixture suites.

Earlier **FAILED** runs were resolved: an isolated fixture lacked the public env
replacement normally supplied by Next; concurrent Chromium teardown caused
Windows cache file locks; the engine test expected the old `You` fallback; and
the new voice reconnect assertion exposed the real ignored-disabled-prop defect
fixed above. Final executed suites pass. The communication harness preserves
the original assertion error if Windows delays cache-profile deletion; it never
treats an application assertion failure as success.

## Measurements

Measurements are short local samples, not a WAN/media benchmark or evidence of
production 60fps. Browser: Chrome 155 on Windows, i7-1165G7, SwiftShader software
WebGL. No representative hardware-GPU or real microphone session was measured.

- Full office at 1422×804: canvas 1388×634 while chat is closed (about 79% of
  viewport height); document width/height exactly match the viewport.
- Tablet at 820×1180 with chat open: canvas 446×1010; no page overflow. Mobile
  at 390×844: dedicated chat and composer fit the viewport, canvas intentionally
  hidden. Additional 320×740 settings/keyboard-focus checks pass without horizontal
  overflow. Actual mobile virtual-keyboard behavior remains manual.
- 1,000 equivalent voice snapshots caused **one** full-composition React commit,
  for the first changed state, not 1,000. A separate transport regression sent
  1,000 movement-only patches and observed one initial roster callback; changing
  the profile name produced the next callback. Ten reconnect notifications did
  not add message subscriptions; teardown discarded stale callbacks/listeners.
- Final chat fixture: committed-message-to-DOM observation 70ms, including test
  polling and synthetic commits. Short closed/open panel samples were 55.5/60.0fps
  over about 1.2 seconds each. Different workload/warmup means this is **not** a
  measured frame-rate improvement or actual database/network latency.
- Separate Phaser fixture: 44.9fps single avatar and 46.6fps ten avatars in short
  software-rendered samples; all renderer/movement correctness checks passed.
- Real local Colyseus transport with synthetic authorization: 24 ticks / 1.201s
  (20Hz), mean simulation work 0.309ms/tick; committed synthetic-store chat observed
  in 21ms, first remote movement 103ms; one observer received 1,571 payload bytes
  (1,308 bytes/s) during the ten-player measurement. Not live Supabase/Cloud timing.
- Read-only Cloud API inventory completed in 496ms; this does not measure voice
  signaling, ICE establishment, sound latency or revocation.

No animation/texture allocation path was added. Existing sprite reuse, deferred
Phaser import, deferred LiveKit import after explicit Join and bounded message
window are retained. Memoization follows the [React memo guidance](https://react.dev/reference/react/memo)
with stable production props; no new library was installed.

No new dependencies or environment variables are required. Existing ignored
`apps/web/.env` and `apps/realtime/.env` remain the configuration sources.
No migration was created or applied; existing grants already support name edits.

## Validation-only continuation — 2026-10-22

Observed at 02:40–02:41 UTC (08:10–08:11 Asia/Colombo). The branch was reconfirmed
by reading `.git/HEAD`; no Git operations were performed. Only this existing
report was edited. No application defect was established, so no code, dependency,
environment or migration changes were made. The baseline checks above were not
relabelled as newly executed authenticated or Cloud media tests.

### Available environment and actual observations

- **PASS:** the effective development web environment loads `apps/web/.env`.
  Web and realtime public configuration both match the approved Supabase project
  `rofutnholbtdmxccrkbs`. Configured web `/api/health` and realtime `/health`
  returned HTTP 200 from the already-running services.
- **PASS:** all required server-side LiveKit configuration is present and passes
  the existing Cloud-only configuration validation. An authenticated, read-only
  Cloud room-list request completed in **477ms** and found **zero application
  rooms**. This was a single control-API sample, not media or revocation latency.
  No room was created and no participant was removed.
- **PASS:** a signaling handshake using deliberately invalid, synthetic proof
  was rejected by the actual configured LiveKit Cloud endpoint with **HTTP 401**.
  No issued application token was used. This proves invalid-proof rejection,
  **not replay rejection of an originally valid or refreshed token**.
- **BLOCKED prerequisite:** browser inventory returned **0 connected browsers,
  0 connected apps, 0 inventory errors**. There are no accessible signed-in
  sessions for either approved test member. The two running services do not
  themselves provide an authenticated user session.
- **BLOCKED prerequisite:** the recognized local env files present were
  `apps/web/.env` and `apps/realtime/.env`; no populated test email/password,
  test session/token or authorized test-user UUID settings were found in those
  files or the current process. The ignored organization-test configuration file
  was absent. No arbitrary real user was selected and no Auth user was created.
- **NOT TESTED prerequisite:** physical input/output devices, browser microphone
  permissions and a listening second user could not be inspected through an
  accessible browser. This does **not** establish that the machine has no audio
  hardware. No real microphone was captured or audio playback claimed.

No credentials, account addresses, participant identities, invitation links or
issued tokens were printed, persisted for testing or requested from the user.
No Cloud administrator token was used to bypass normal application admission.
No production data, membership, profile or chat record was changed. The existing
configured voice authority was left running; no competing Cloud-enabled realtime
process was started.

### Requested scenario results

These rows concern **actual authenticated application/Cloud workflows**. Earlier
synthetic fixtures remain separate evidence and cannot change these results.

| Requested check | Result | Observation / blocker |
| --- | --- | --- |
| Two different authenticated users join the office | NOT TESTED | No accessible authorized sessions or configured test logins |
| Both users observe correct participant presence | NOT TESTED | Requires those two live office sessions |
| Display names match across avatars, chat, office and voice lists | NOT TESTED | Requires authenticated profiles and actual voice admissions |
| Chat synchronizes between users and persists after reload | NOT TESTED | No authorized send/history workflow executed |
| Authenticated authorization and cross-company office/chat isolation | NOT TESTED | No authorized test identities and isolated tenant fixtures available |
| Two users join the same real voice room through normal admission | NOT TESTED | No authenticated office/zone sessions; zero application Cloud rooms observed |
| Real microphone enable/disable | NOT TESTED | No accessible signed-in browser/audio device session |
| Bidirectional audible audio | NOT TESTED | No two real endpoints or listening users; no sound observation |
| Real input/output device switching where supported | NOT TESTED | Browser/device capabilities unavailable for inspection |
| Real voice leave and rejoin | NOT TESTED | No valid Cloud participant session established |
| Real network reconnection | NOT TESTED | No valid Cloud participant session to interrupt/recover |
| Zone exit disconnects voice and stops microphone tracks | NOT TESTED | No authenticated in-zone media session |
| No duplicate tracks or listeners after real join/reconnect/leave | NOT TESTED | No actual media lifecycle to inspect; baseline simulated checks are insufficient |
| Revoked members lose active voice access and cannot rejoin | NOT TESTED | No dedicated authorized removable membership/media session was available |
| Previously issued initial-token replay after revocation | NOT TESTED | No legitimately admitted test participant or original issued token |
| Refreshed-token replay after revocation | NOT TESTED | No established participant/session refresh; invalid-proof 401 is not a substitute |
| Revocation completes within 10 seconds | NOT TESTED | No removal was performed; elapsed revocation time was **not measured** |
| Cross-company voice access is rejected for an authenticated user | NOT TESTED | No authorized cross-company test identity/fixture; anonymous rejection does not prove tenant isolation |
| Unauthenticated users cannot obtain application voice admission | PASS | Running web token endpoint returned 401; running realtime token endpoint returned 403; neither returned a token |
| Missing/foreign Origin cannot obtain web voice admission | PASS | Both returned 403 from the running web service; no token returned |
| Invalid proof cannot join the actual Cloud signaling endpoint | PASS | HTTP 401; fresh deliberately invalid proof only |

All four direct running-service token-denial responses also had `Cache-Control:
no-store`. Requests contained no valid user credentials and created no session.

### Existing test infrastructure rerun

| Executed command | Result / precise scope |
| --- | --- |
| `node scripts/check-realtime-environment.mjs` | PASS: matching development configuration; dedicated test login/trio unavailable; values suppressed |
| `node --test tests/voice-routes.test.mjs` from `apps/web` | PASS: 3 production-build route/bundle checks; unsigned session 401, missing/foreign Origin 403, forged zone/input rejection, no server credential/admin SDK in browser bundles |
| `node --experimental-strip-types --test scripts/test-realtime-live.mjs` | PASS: 1 built-server negative admission test against configured Supabase; anonymous/invalid proof/foreign Origin denied |

The negative realtime child explicitly sets its LiveKit configuration empty and
therefore cannot orphan-sweep or remove participants belonging to the running
development authority. Its result is an office/Auth denial result, not an actual
Cloud voice-session test. No simulated audio suites were rerun to fill the live
testing gaps. Lint/typecheck/build and the broader baseline suites above remain
their previously executed results; application code was unchanged in this pass.

**FAIL:** no failures in checks actually executed during this continuation.
Blocked or unexecuted scenarios are **NOT TESTED**, not successful assertions.

### Remaining blockers and merge decision

**Phase 4 Step 2 is NOT MERGE-READY.** Cloud credentials and connectivity are
available; the blockers are authorized user/browser sessions and real audio
endpoints, not a demonstrated Cloud configuration error.

To finish the gate, make two existing, normally verified, authorized test accounts
accessible in separate connected browser profiles, with real audio input/output
and a listening participant at each end. Tenant/removal checks also need a
dedicated non-production workspace/membership and another-company test context
whose records are explicitly safe to exercise. Continue using normal Auth and
application admission; do not paste passwords/tokens, select unrelated real users,
weaken RLS or use admin-minted participant tokens as an authorization shortcut.
Run the manual sequence below, retaining original/refreshed replay proof only in
the authorized private test context and recording actual removal timestamps.
Until that evidence exists, no 10-second revocation or real audio claim is made.

This validation continuation stops after updating this report. Phase 4 Step 3,
deployment and new feature development were not started.

## Manual verification before merge

1. Start the web and the single configured realtime authority with `pnpm dev:all`.
   Use the existing development Supabase project and LiveKit Cloud configuration.
   Do not start a second configured voice authority; its orphan sweep is designed
   for one process. Use two approved invitation-test members in separate browser
   profiles, signing in normally with verified accounts. Do not bypass email
   confirmation or share passwords, invitation links, access or media tokens.
2. Save a name and each preset. Reload and re-enter the office. Confirm persistence,
   matching names/appearance on the second browser and no extra canvas/socket.
   Rejoin an existing voice call after a name edit to refresh its admission name.
3. Open/close chat, type a draft, read older messages while the other member sends,
   briefly interrupt/recover the network, then use Show latest. Confirm scroll,
   focus, draft/idempotent retry and actual persisted history after reload.
4. Join voice explicitly in the server-authorized meeting zone. Check real browser
   permission allow/deny, two-way audio, mute/unmute, devices, playback restrictions,
   reconnection notices and leave/zone-exit/sign-out/route cleanup. Check the browser
   microphone indicator clears and audio stops.
5. With a dedicated authorized member, test another tenant and forged office/zone
   admission. Remove the member through normal team management, record actual
   wall-clock media removal time and test that active audio ends within 10 seconds.
   Test original and refreshed Cloud-token rejoin rejection through the approved
   private security harness; never print or paste the tokens. Rejoin after removal
   must remain denied. Repeat session expiration and revoked membership scenarios.
6. Check desktop/tablet/mobile with actual browser zoom, a real mobile keyboard and
   assistive technology. Verify controls remain reachable at 200% zoom, the panel
   does not trap focus, status/errors are announced and typing never moves avatars.

## Files changed

- New: `apps/web/src/components/office-disclosure.tsx`,
  `scripts/test-communication-browser.mjs`, this report.
- Office composition: protected office `page.tsx`, `office-experience.tsx`,
  `office-canvas.tsx`, `engine/player-avatar.ts`, `app/globals.css`.
- Profile/name path: shared `avatars.ts`/`chat.ts`, avatar settings/action/service
  and tests, realtime `auth/authorize.ts` and its security tests.
- Communication: `chat-panel.tsx`, `participants.tsx`, `voice-session.tsx`, shared
  `protocol.ts`, office `network/connection.ts` and its tests.
- Regressions/documentation: chat/voice/office browser scripts,
  `supabase/tests/avatar_profiles.sql` (rollback-only test, not a migration),
  root `package.json` and README.

Implementation stops at Phase 4 Step 2. No later feature phase was started.
