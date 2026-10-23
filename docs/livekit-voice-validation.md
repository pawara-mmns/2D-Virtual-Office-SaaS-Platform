# Phase 4 Step 1 — LiveKit Voice Rooms

Verified 2026-10-22 on `feature/p4-s01-livekit-voice` by reading `.git/HEAD`.
Implementation and account-independent verification are complete. **Current runtime
follow-up: LiveKit credentials are present, and read-only Cloud API/WebSocket
reachability checks pass. Authenticated media is still NOT TESTED.** See the
[runtime fixes and current verification results](livekit-voice-runtime-fix.md).
The implementation-phase results below are retained as a historical baseline;
the runtime follow-up supersedes its missing-credentials status and test counts.
This branch is not merge-ready until the Cloud/manual security gates pass.
No Git commands, account creation, emails, microphone recording, migrations
or existing database-data changes were performed.

## Setup

Official stable versions were checked against npm and installed with exact pins:

| Workspace | Package | Version |
| --- | --- | --- |
| web | `livekit-client` | 2.23.0 |
| web | `@livekit/components-react` | 2.9.24 |
| realtime, server only | `livekit-server-sdk` | 2.19.1 |

The React package supports React >=18 and livekit-client ^2.20.1. Existing React
19 is compatible. Existing application styles are reused; no LiveKit stylesheet,
new email provider, infrastructure or additional database package is needed.

1. In the [LiveKit Cloud dashboard](https://cloud.livekit.io), select the intended
   development project. Obtain its WSS project URL and API key/secret from the
   project's API key settings. Use Cloud, not a self-hosted endpoint: this step
   relies on Cloud's explicit token-revocation API. Keep recording, Egress,
   transcription and agent integrations unconfigured for this voice-only feature.
2. Add these values locally to **`apps/realtime/.env`**, which is ignored:

   ```dotenv
   LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
   LIVEKIT_API_KEY=YOUR_SERVER_API_KEY
   LIVEKIT_API_SECRET=YOUR_SERVER_API_SECRET
   ```

   Do not paste these values into chat or commit them. Never use `NEXT_PUBLIC_`
   prefixes for API credentials. The realtime process, not Next.js browser code,
   owns the server SDK. All three settings are required; absent/partial/invalid
   settings disable voice while office movement, presence and chat keep running.
3. Keep the web app's existing Supabase configuration and
   `NEXT_PUBLIC_REALTIME_URL=http://localhost:2567`. In **`apps/web/.env`** (the
   existing convention here), set `APP_URL=http://localhost:3000`. Optionally set
   `REALTIME_INTERNAL_URL=http://localhost:2567` for server-to-server requests;
   it otherwise defaults to NEXT_PUBLIC_REALTIME_URL. Only loopback HTTP or HTTPS
   is accepted. Deployed browser/realtime origins require HTTPS/WSS. The existing
   `REALTIME_ALLOWED_ORIGINS` must include the exact APP_URL.
4. Run `pnpm dev:all` and use `http://localhost:3000`. Restart both services after
   configuration changes. The map fingerprint changed, so restart/reload both
   web and realtime together. No Supabase Dashboard SQL or migration is needed.

No credentials were invented or written to the real env files. The initial
implementation checks returned false for all three LiveKit settings. The later
runtime follow-up found all three present and verified read-only Cloud connectivity;
neither check establishes authenticated media success.

## Authorization and zones

The existing Tiled `studio.json` now includes one hidden `VoiceZones` rectangle:
Meeting Room, x=768, y=32, width=352, height=352 (32px grid). It follows the existing
meeting-room floor and excludes its surrounding walls. Floor, furniture,
collision and artwork are preserved. The generator reproduces the zone metadata.
Shared `meetingZone` requires the entire 14x10 foot collision body inside it.

Only Colyseus evaluates the player's authoritative coordinates after simulation.
It sends private `voice.state` events containing eligibility, the connected session
ID, configuration readiness and the last actual Cloud participant count. Zone/count
changes update React; movement-only ticks do not. Opaque room names are HMACs of
organization/office/zone, scoped to this application deployment. A new random
participant identity is created for each admission; neither field includes email,
personal name or a raw tenant/user UUID.

`POST /api/v1/voice/token` accepts **only officeId/sessionId** in a bounded JSON
body. It checks the exact configured Origin, performs Supabase getUser through
the existing verified-user service, then obtains the session bearer for transport.
getSession is never used as the authorization decision. The route forwards the
bearer through an Authorization header to the configured realtime `/voice/token`
endpoint; redirects, caching and raw provider error disclosure are disabled.

The realtime endpoint independently checks Supabase Auth, confirmed non-anonymous
identity, ACTIVE organization/membership and the real office through caller-scoped
RLS reads. It then checks that the connected in-memory Colyseus session matches
that user/organization/office and is currently in the meeting zone. A session ID
alone grants nothing. No browser position, zone assertion or eligibility boolean
is accepted. The Supabase bearer authenticates this server-to-server validation;
no extra shared-secret infrastructure is needed.

Admission reserves one active media slot per user across offices before signing.
Server-side per-session and bounded request-source limits reject repeated joins.
An internal revision invalidates joins cancelled during authorization, zone exit,
disconnect or signing. Request aborts propagate across the web/realtime boundary;
only the matching user can cancel a reservation.

Tokens use the official SDK, a 30-second initial TTL and the specific opaque room.
Grants permit roomJoin, subscribe and microphone publishing only. Camera,
screen-share, data publishing, metadata changes, room administration, listing,
creation and recording privileges are not granted. Tokens stay in memory and
no-store responses; server credentials never enter browser source. Display names
are already sanitized verified profile snapshots; metadata contains only the
allowlisted avatar preset. Browser participant names are sanitized again.

## Media lifecycle and revocation

Inside the zone, the compact bar shows Voice available, actual voice count and
Join Voice. No microphone request or media connection occurs before that click.
After authorization, the dynamically loaded SDK requests microphone audio,
connects one Room and publishes only that audio track. The UI uses official
RoomAudioRenderer, StartAudio, TrackToggle and participant/device hooks. It shows
mute state, leave, actual voice participants/presets, genuine speaking state,
connection progress, input devices and supported output selection. Unsupported
output selection has a clear OS/browser message. Office and voice rosters are
separate. Device permission, missing/in-use/disconnected device, timeout, provider
failure and removal receive fixed actionable messages without SDK error dumps.

Leaving voice, losing the authoritative zone/office connection, switching accounts
or workspaces, unmounting or navigating stops capture/tracks and disconnects media.
Late microphone permissions, connection and publish completions are checked
against cancellation and cleaned up. Temporary media reconnection belongs to the
same Room and still requires current server eligibility; a removed/ended session
requires another explicit Join Voice, not automatic switching or mic activation.

Client cleanup is backed by server enforcement:

- Zone exit, onDrop, leave, deny and room disposal immediately schedule
  RemoveParticipant with an explicit `revokeTokenTs` cutoff. A new admission gets
  a new identity, so old tokens cannot become a newly authorized session.
- Independent fresh Supabase checks run every two seconds for active admissions.
  A six-second authorization lease, anchored to verification start time, is
  checked every 250ms independently of slow network operations. Its expiry
  schedules removal rather than trusting the existing 15-second movement lease.
- The Cloud client has a two-second API timeout with region failover disabled.
  This is designed to fit the ten-second healthy-service revocation target;
  **actual Cloud timing has NOT been verified**. Failures pause new admissions
  and retry removal. They never become successful revocation claims.
- A namespace-scoped Cloud room/participant sweep every two seconds removes
  unauthorized or orphaned identities, including after a process restart. Initial
  admissions remain disabled until the first successful sweep. Participant counts
  are observations from this API and may lag changes by one poll.

Initial JWT expiration does not terminate an established LiveKit session. Cloud
can refresh tokens, so participant removal uses its explicit cutoff instead of
relying on expiration or the default buffered revocation behavior. See
[LiveKit token lifecycle and explicit revocation](https://docs.livekit.io/frontends/reference/tokens-grants/).
Cloud rejection of original/refreshed tokens must be tested before claiming replay
revocation works in this environment.

This is a single persistent realtime-process MVP, matching existing admission.
Do not run competing processes with the same namespace: each would classify the
other's media as orphaned. A stopped realtime process or unreachable Cloud control
plane cannot guarantee removal within ten seconds; cleanup retries/restart sweeps
require healthy services. Client cleanup helps cooperative browsers but is not a
substitute for that server enforcement. Do not claim outage-proof revocation.

## Actual verification

| Check | Result |
| --- | --- |
| Expected branch; no Git mutation or DB migration | PASSED |
| Lint, strict typecheck, web and realtime production builds | PASSED |
| Web unit/service suite | PASSED: 79 tests, including five voice authorization/zone/lifecycle cases |
| Realtime suite | PASSED: 18 tests, including nine voice tests and the extended real HTTP/WS transport test with synthetic Auth/Cloud |
| Token signature, exact room/source/admin grants, TTL, opaque IDs | PASSED: official server SDK with synthetic offline credentials |
| Zone/session binding, forgery, cross-tenant/identity mismatch, duplicate joins and cancellation | PASSED: synthetic authorization with real local transport |
| Removal, lease expiry, member denial, retry/orphan cleanup | PASSED: provider fixture; not actual Cloud enforcement |
| Production voice API/bundle checks | PASSED: 3 tests; unsigned/origin/body denials, no-store headers, server SDK/credential boundaries and deferred public scripts |
| Actual Chrome voice UI | PASSED: explicit join, no automatic capture, one authorization per click, cancel, actual SDK with synthetic microphone denial, mobile 390px and zone cleanup |
| Existing chat/office Chrome fixtures | PASSED: chat paging/drafts/focus, movement/collisions/presets, multiplayer rendering and teardown |
| Local PostgreSQL regressions | PASSED: 14 chat assertions, 54 team + 26 foundation assertions, avatar guards; disposable fixtures roll back |
| Organization runner setup | PASSED: 4 tests |
| Production HTTP regression | PASSED: 9 tests |
| Live existing Supabase negative checks | PASSED: 8 Auth, 5 organization, 11 invitation, 6 chat tests; no positive account workflows implied |
| Built realtime health/negative admission regression | PASSED: 1 test |
| Real Cloud token join, bidirectional audio, mute/unmute, devices/autoplay/reconnect | NOT TESTED: credentials missing |
| Real Cloud token replay rejection and <=10s removal after zone/office/member loss | NOT TESTED: credentials and signed-in test sessions unavailable |
| Real two-browser authenticated office/chat/voice workflows and tenant isolation | NOT TESTED: remains manual; no authorized browser logins supplied |

Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`,
`pnpm test:voice:routes`, `pnpm test:voice:browser`, `pnpm test:chat:database`,
`pnpm test:team:database`, `pnpm test:organization-setup`, `pnpm test:smoke`,
`pnpm test:live`, `pnpm test:organizations:anonymous`, `pnpm test:team:anonymous`,
`pnpm test:chat:anonymous`, `pnpm test:realtime:live`, `pnpm test:chat:browser`,
and `pnpm test:office:browser`. Browser/HTTP suites require a production build.

The initial service tests found a poll-startup race: awaiting an already running
sweep returned too early. Polls now share their in-flight promise and the complete
suite passed on rerun. Cancellation and identity-bound abort checks were added
during review. No unresolved automated failure remains.

The final isolated transport sample measured 24 ticks/1.201s (20.0Hz), 0.309ms mean
simulation work/tick, 22ms chat observation and 1,308 payload bytes/s to one observer.
This uses synthetic Auth/chat/Cloud and loopback, excludes wire framing and is not
a voice/network benchmark. Chrome 155 with SwiftShader measured 46.1 FPS for ten
render-fixture avatars; representative GPU performance and actual voice overhead,
connection latency, jitter/packet loss and ten real media participants are NOT
TESTED. Short samples do not prove sustained production frame rate.

## Remaining manual gate

Use the two previously authorized invitation-test members after normal verified
login, in separate browser profiles. Do not use unrelated real users, bypass email
confirmation, mint Supabase JWTs or select test users automatically. Use headphones.

1. Complete Cloud/env setup, start both services and move A/B into Meeting Room.
   Before Join Voice, verify no microphone indicator or audio connection.
2. Join explicitly as A then B; allow microphone permission and verify real two-way
   audio, actual count/names/presets and no duplicate/local audio playback.
3. Test mute/unmute, denied permission, absent/disconnected input, device changes,
   supported output selection and the Enable audio playback action when blocked.
4. Move B out of the zone. Confirm tracks release and remove B server-side within
   ten seconds. In a controlled local test, disable only voluntary UI disconnect
   to verify the server is enforcing removal; never weaken server checks/RLS.
5. In the local test harness only, retain an old initial and SDK-refreshed token in
   memory. After removal, attempt reconnection with each; require Cloud rejection.
   Never paste tokens into URLs, consoles, docs or chats. Re-enter and obtain a
   fresh admission explicitly; verify new identity and one active session per user.
6. Test socket drop, office navigation, organization switch, refresh, media-only
   network interruption, sign-out/expiry and normal member removal. Verify media
   removal independently of the UI and rejoin authorization after recovery.
7. Use an explicitly authorized member of a different organization to test token,
   session and room isolation. Test provider outages and verify joins fail closed
   with retry feedback. No existing users are automatically chosen for this test.
8. Move/chat while connected, check keyboard focus and mobile layout, and measure
   actual media join/removal latency. Record evidence/results without credentials.

## Files and scope

New: shared `voice.ts`; realtime `voice/{provider,service}.ts` and `tests/voice.test.ts`;
web `features/voice/{token-service,lifecycle,voice-bar,voice-session,voice.test}`;
`app/api/v1/voice/token/route.ts`, `tests/voice-routes.test.mjs`,
`scripts/test-voice-browser.mjs` and this report.

Changed: canonical map/generator and shared Marker/OfficeNetwork types; realtime
bootstrap/server/room and transport regression tests; office connection/canvas;
session-refresh matcher; web/realtime package manifests, lockfile and env examples;
root test scripts, README and architecture notes. Existing auth/membership/chat
logic, RLS, migrations, sprites and collision geometry are preserved.

Stop at Phase 4 Step 1. Video, screen share, recording, transcription, proximity
voice, direct calls and later phases remain outside this implementation.
