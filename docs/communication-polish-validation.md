# Phase 4 Step 2 — Communication polish validation

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
