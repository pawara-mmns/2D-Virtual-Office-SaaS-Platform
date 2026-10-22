# Phase 4 Step 1 — voice runtime fix

2026-10-22, `feature/p4-s01-livekit-voice`, verified by reading `.git/HEAD`.
Render/lifecycle fixes and automated verification are complete. Real authenticated
Cloud media and two-browser audio remain **NOT TESTED**. No branches, Git commands,
migrations, Supabase schema changes, new packages or provider changes were used.

## Findings and fixes

**Error 1: Devices / maximum update depth.** The installed
`useMediaDeviceSelect` memoizes its device observer using `onError` as a dependency.
Our inline callback changed on every render. The resulting observable subscription
reset device-list state to a fresh array, causing another render and another
observer. This occurs even without an actual device error. Both input and output
controls used that pattern. The connected-controls Chrome fixture failed its
observer-stability assertion before the fix and passed afterward.

`Devices` now uses `useCallback` with the real `error` dependency; Controls receives
React's stable notice setter. Microphone-toggle error handling and VoiceBar's
leave/failure callbacks are also stable. Device enumeration retains
requestPermissions=false. Selecting a device does not recreate the Room. Hooks
remain unconditional within their components; unsupported output selection still
shows the browser/OS fallback. Strict Mode and hook lint rules remain enabled.

**Error 2: OfficeCanvas onVoice.** Inspection found no recursive server event,
repeated connection effect or reconnect listener registration. The setter line is
an external update boundary, not proof that it caused the inner hook loop. It did
accept equivalent snapshots as fresh objects, allowing avoidable parent renders
to reach the problematic controls. Network delivery now validates/copies the four
public snapshot fields and compares them before notification; OfficeCanvas also
returns its previous React state for equal snapshots. Drop/close clear the cache;
reconnect can deliver its first valid snapshot again. Existing connection effect
dependencies and tenant/session validation are preserved.

**Timeout handling.** One 12-second timer previously covered microphone consent,
signaling, WebRTC establishment and publication together. A slow permission dialog
or sequential SDK stages could exhaust it without a distinct network failure.
Initial Room.Disconnected events could also replace the useful SDK rejection with
a generic failure. This was a confirmed diagnostic/lifecycle defect; it does not
prove which browser network stage failed in the user's historical attempt.

Permission now waits for explicit consent/cancellation without a network watchdog.
The existing SDK signaling and peer-connection budgets stay at eight seconds.
The 12-second fallback is scoped to the current signaling/media/publication stage
and resets on the SDK SignalConnected event; it is not one permission-inclusive
deadline. Invalid Cloud authorization, unreachable signaling, ICE/media failure,
publication failure and remote subscription failure have separate safe messages.
Initial connection errors are reported from the rejected connection promise;
disconnect feedback takes over only after an established session.

The 30-second initial token TTL is unchanged. If consent takes long enough for
authorization to expire, the user must explicitly join again for a fresh token;
the application does not bypass token expiry or silently reconnect.

Effects now depend on scalar URL/token values, not admission-object identity.
A cleanup queue prevents a discarded Strict Mode setup from starting capture and
waits for the real previous disconnect before restarting. Late permissions,
connections and publications still stop their tracks. No arbitrary delay or
dependency-rule suppression was added. A failed voice attempt does not close the
office/chat connection.

## Cloud/configuration checks actually executed

- **PASSED:** realtime URL, API key and secret are present under the existing
  Node `--env-file-if-exists=.env` loading convention; URL/config validation passed.
  Credential values were neither printed nor changed.
- **PASSED:** authenticated read-only Cloud room-list API, approximately 589ms
  for one request. No application voice rooms were present at that observation.
- **PASSED:** Node WebSocket transport reached the configured `/rtc` endpoint and
  received HTTP 401 for deliberately invalid, non-secret proof. This tests endpoint
  reachability/rejection, **not a valid signaling join or browser WebRTC path**.
- **NOT TESTED:** an actual user's fresh token endpoint response, authenticated
  Cloud signaling, ICE/media establishment, publication, remote subscription and
  two-way audio. Connected browser inventory was empty and dedicated test login
  configuration was absent. No users were selected, impersonated or created.

There is no confirmed URL/key/secret defect from these checks. Browser-specific
VPN/firewall/ICE restrictions remain unverified. Zero voice participants is a
count, not an error diagnosis: it can follow a failed/ended session. The Controls
code path is reached only after the SDK connect/publish promises complete, so the
reported device-loop stack can also explain a subsequent teardown; that is a code
path inference, not a newly observed real Cloud audio success.

Browser logs now contain fixed stage/category/status fields only:
`token_request`, `token_authorized`/`token_authorization`, `microphone`, `signaling`,
`media`, `publication`, `connected`, and `remote_audio_subscription` on subscription
failure. No JWT, API credential, room identity, user email, SDP or ICE candidate is
logged. Do not share raw network requests containing tokens.

## Executed regression results

| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASSED for web and realtime |
| `pnpm test` | PASSED: 82 web + 18 realtime tests; includes existing voice authorization/grants/revocation tests |
| Focused voice/network unit rerun | PASSED: 11 tests |
| `pnpm test:voice:browser` | PASSED: real React 19/LiveKit controls, Strict Mode, SDK-simulated connection/participants and synthetic tracks; no real audio |
| `pnpm test:voice:routes` | PASSED: 3 production API/bundle security tests |
| `pnpm test:chat:browser` | PASSED: paging, draft/retry, focus, mobile and engine coexistence |
| `pnpm test:office:browser` | PASSED: movement, collision, avatars, rendering and lifecycle |
| `pnpm test:smoke` | PASSED: 9 production public/protected/Auth/invitation route checks |
| `pnpm test:realtime:live` | PASSED: built server/real Supabase negative admission; no media claim |
| Real two-member Cloud voice and <=10-second live revocation | NOT TESTED |

Added coverage includes 1,000 equivalent voice messages producing one delivery,
changed snapshots, mutable input isolation, invalid session/count rejection,
reconnect without extra message subscriptions, close/unmount and stale handlers;
Strict Mode capture/disconnect serialization; delayed consent without false network
timeout; distinct signaling/media/publication failure stages; connected device
observers/error callbacks across repeated renders; no enumeration permission
prompts; input/output capability handling; listener cleanup; explicit join/leave,
mute/unmute, invalid token and denied microphone with actual SDK UI in a fixture.
Runtime exceptions and React update-depth warnings fail the browser suite.

The initial connected-state test failure reproduced the original observer churn.
A later broad synthetic navigator-enumeration failure also affected independent
SDK simulation device-switch listeners. Its callback test now injects failure at
the hooks' public Room.getLocalDevices(kind) boundary; it does not suppress errors
or claim that every possible SDK/browser enumeration failure is handled.
All final executed checks pass; no runtime warning was ignored to obtain a pass.

The built realtime negative-test child explicitly blanks only its own LiveKit
configuration. This prevents an isolated test process from sweeping real media
sessions belonging to the user's running development authority. The real env and
production server security settings are unchanged.

## Files changed

| File | Change |
| --- | --- |
| shared `voice.ts` | Snapshot equality helper |
| `office/network/connection.ts` | Validated, copied, deduplicated voice delivery |
| `office/components/office-canvas.tsx` | Equal-state React bailout |
| `voice/voice-session.tsx` | Stable device callbacks, precise stages/events, serialized cleanup and scalar effect dependencies |
| `voice/voice-bar.tsx` | Stable leave/failure callbacks; safe token-request diagnostics |
| `voice/lifecycle.ts` | Stage-specific failures/watchdogs, consent handling and Strict Mode cleanup queue |
| `voice/voice.test.ts`, `office/network/network.test.ts` | Focused lifecycle/transport regressions |
| `scripts/test-voice-browser.mjs` | Connected controls, Strict Mode and runtime-warning regression fixture |
| `scripts/test-realtime-live.mjs` | Prevent negative-test Cloud orphan sweeps |
| README and voice validation documents | Current configuration and actual results |

OfficeExperience, the token API/authorization service, Colyseus membership/zone
checks, RLS, invitations, Phaser and media grants were inspected and preserved.

## Remaining manual gate

1. Restart the local app with `pnpm dev:all` if needed, then reload both authorized
   browser profiles to clear the old failing component/session state. Log in
   normally and enter Meeting Room as the two intended verified members.
2. Click Join Voice explicitly and allow microphone access. Confirm the progress
   reaches connected, no update-depth warnings appear, and both users hear each
   other using headphones.
3. Test mute/unmute, input/output selection, denied permission, leave/rejoin and
   refresh/reconnect. Confirm one active session and released microphone tracks.
4. Move outside the zone, leave the office and test authorized member removal;
   verify server removal/token replay rejection within the intended security window.
   Check tenant isolation, chat and movement independently of media success.
5. If joining fails, record only the last safe stage/category/status. For example,
   `signaling/authorization` differs from a `media/timeout` after signaling connects.
   Do not expose credentials or JWTs. Test network policy only for the identified
   stage; do not disable authorization or blindly increase timeouts.

**Merge status: not ready until the authenticated Cloud/manual gate passes.**
Stop after this Phase 4 Step 1 fix; no later feature is started.
