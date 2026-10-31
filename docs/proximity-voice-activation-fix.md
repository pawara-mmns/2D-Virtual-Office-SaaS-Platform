# Proximity membership, microphone initialization and activation fixes

Implemented locally on the current working tree, October 30, 2026. No Git operations, deployment configuration changes, production writes, or migrations were performed.

## Root causes and reproduction evidence

Two independent client bugs were present.

1. The former `OfficeVoice` activation path first captured a microphone, sent `proximity.set({enabled:true})`, and waited up to 12 seconds for `proximity.enabled`. Its timeout generated **“Proximity voice could not be enabled. Check voice availability and retry.”** This was an application acknowledgement watchdog, not a LiveKit error or evidence of microphone denial. That contract also coupled visual membership to capture. Once membership is independent and the server reports eligibility/audio authorization instead, waiting on this obsolete microphone acknowledgement cannot succeed. The replacement path has no server mic-enable message or acknowledgement timer. The browser regression explicitly asserts zero legacy opt-in commands.
2. `audio-owner.ts` set `MediaStreamTrack.enabled=false` after capture, but later called `LocalAudioTrack.unmute()`. The installed SDK's `LocalAudioTrack.unmute()` returns immediately when `isMuted` is already false. That left the physical track disabled even though desired mute state was false. Checking and unchecking mute changed the SDK's internal flag and happened to restore the physical bit. A regression reproducing the installed SDK's idempotent behavior failed before the fix (`false !== true` on first raw-track publication) and passes afterward. The browser suite also exercises the installed SDK with a real generated MediaStreamTrack and verifies the first published track is enabled and SDK-unmuted without any checkbox toggle.

The former coordinator independently required `Entry.enabled` before creating a group. A regression expecting two nearby authenticated off-mic pairs to form bubbles failed with zero groups before the fix and now passes. This membership gate has been removed.

The generic timeout alone could not identify a device, configuration or provider failure. Those failures now have separate categories; the successful local acceptance reported below does not imply a measured Cloud revocation delay.

## State and authorization architecture

The responsibilities are now explicit:

| Concern | Owner / representation |
|---|---|
| Visual proximity membership | Colyseus coordinator; authenticated active sessions, position, wall policy, locks, dwell/hysteresis/grace and Meeting Room precedence |
| Audio-session authorization | Current server bubble generation/revision and `audioAllowed`; Next.js proxy and VoiceService independently validate current membership |
| Microphone capture permission | Browser permission plus the audio owner's `permission` state; capture only starts from explicit microphone/checkbox interaction |
| Desired microphone state | One audio owner (`off`, `muted`, `on`) and persisted mute preference |
| Actual publication state | Bound SDK publication, raw enabled bit, SDK mute state and active Room binding; UI phases off/pending/muted/paused/active/denied/failed |
| Remote playback availability | Existing LiveKit SDK playback state and contextual speaker unlock action |

Visual bubbles form without any audio provider or publishers. With an available provider, authorized members can connect receive-only without `getUserMedia`. A microphone that is off, denied, muted, released, or temporarily failed does not remove visual membership. Listener audio authorization remains scoped to the actual roster and locked room generation.

Legacy `proximity.set` messages remain accepted for compatibility, but never alter membership, microphone consent or listener authorization. Current microphone controls do not send them.

## Publication reconciliation

`createAudioOwner()` remains the one capture owner. Receive-only Room attachment never requests capture. Explicit capture is coalesced, initially disables and SDK-mutes the acquired track, and stops late permission results after cancellation.

Room attachment publishes an existing explicitly requested track in a muted/disabled state. After publication acknowledgement, reconciliation applies the **current** desired mute preference and explicitly reconciles the raw enabled bit. Active is reported only when the current publication/binding, SDK state and raw track agree. Muting disables the physical track immediately, and a serialized queue reconciles subsequent SDK work. Generation leases prevent old cleanup or delayed publication from pausing/replacing the current binding.

Mic icon and checkbox write this same owner. Off starts explicit capture; a held muted microphone unmutes on the icon, and an on microphone mutes on the icon. The checkbox directly requests the corresponding desired state. A saved muted preference is retained during activation/rotation; it is never silently unmuted by proximity. **Release microphone** in settings stops capture while retaining the receive-only conversation. Reconnecting transport pauses raw publication and reconciles it on SDK connection recovery without another capture.

Stopping capture, muting, normal separation and generation rotation do not create independent microphone managers. Normal separation pauses the held track and permits automatic reattachment when eligible. Office/session loss, permission termination and Meeting Room entry still stop capture. Meeting Room retains its explicit Join Voice action.

## Actionable diagnostics and recovery

New diagnostics in `diagnostics.ts` execute only in development. They use a fixed prefix **Voice development.** and whitelisted fields:

- Stages: permission, capture, authorization, connection, publication, generation, cleanup, microphone.
- Categories include started, ready, cancelled, denied, missing_device, device_busy, unavailable, conflict, rate_limited, failed, retired and reconciled.
- Safe evidence includes browser permission state, allowlisted error **names**, desired state, raw enabled/SDK muted/publication booleans, and numerical generation/revision.

No tokens, cookies, API keys, raw audio, personal names, office/session IDs, provider URLs, room names, or SDK error messages are passed to these diagnostic records. Unknown fields are dropped; unknown error names are replaced. Tests verify that forged extra fields/provider text do not appear and production mode emits no new development diagnostic.

The passing browser scenario observed all eight stages. It verified a record equivalent to:

```json
{"stage":"microphone","category":"reconciled","desired":"on","rawEnabled":true,"sdkMuted":false,"published":true}
```

That evidence came from an isolated browser with synthetic authorization and silent tracks, not a recording of the authenticated users' audio.

Compact feedback now distinguishes microphone permission denial, no device, unavailable device, acquisition failure, voice authorization failure/expiry, previous-session cleanup conflict, rate limiting, voice-server unavailability, signaling/media failure and publication failure. Mic failures retain visual membership and the receive-only connection. Publication retry reuses the held capture. Authorization/connection failure exposes **Retry audio** in settings; it does not acquire a microphone. Cancellation is not reported as a failure.

## Geometry and wall policy

Phaser supplies each actual interpolated sprite rectangle and its foot-body center through `PlayerAvatar.bubblePosition()`. Pair capsules derive their radii from those full footprints plus padding; stretch never shrinks inside the sprite rectangle. Groups use padded rounded convex enclosures instead of one large bounding rectangle. Fixed-size perimeter samples ease shape retraction, while including the current exact target prevents interpolation from clipping a moving sprite. Labels remain above the outline. Camera projection stays in Phaser; there are no React position updates or physics objects for bubbles.

The rendered envelope is checked against the actual Phaser sprite corners during movement, stretch, and member changes. Dissolve animation is independent of media retirement; reduced motion removes the easing/fade.

The old coordinator used Euclidean distance only and could group users across a wall. `conversationSpace()` now precomputes obstructions from the immutable Architecture and Floor layers. A short segment test at foot-center height rejects architectural partitions and unbuilt void. Doorway tiles are clear and retain proximity across their opening; furniture does not block conversation. The policy is deliberately conservative: solid, glass and half-wall Architecture tiles all obstruct. Existing separation grace also applies when a retained pair becomes obstructed. Tests cover a closed wall and open door plus every doorway in all five modular layouts.

## Privacy and lifecycle verification

The existing isolated LiveKit rooms, short-lived microphone-only grants, fresh token authorization, frozen locked roster, generation rotation, Cloud participant removal, stale token checks, and tenant isolation remain in force. Actual HTTP/WebSocket tests cover cross-tenant/cross-bubble rejection, controller checks, outsiders racing a lock, token signing during rotation, meeting precedence and cleanup. Provider-removal failures keep new media blocked until old admissions settle. Visual membership can continue while media is unavailable.

## Real authenticated acceptance

The tester was asked to reload both authenticated Brave sessions, approach with microphones off, activate each microphone, check both audio directions, and avoid the checkbox workaround. After a general manual-check acknowledgement, the specific confirmation question was:

> Did both mic icons reach Active and did both users hear each other without the checkbox workaround?

The tester replied **“Yes, all passed.”** Record the two-user activation and bidirectional listening result as **user-confirmed passed**. The agent did not independently listen to or record the users' audio.

Three-user private outsider listening, four-user cross-bubble audible isolation, exact audible cue counts, and Cloud revocation timing were not newly confirmed in this run. Automatic privacy/admission tests pass, but they do not substitute for those listening checks. Browser playback may still need an explicit speaker-icon gesture.

## Updated screenshots

Actual isolated React/Phaser renders with synthetic identities and silent media:

- [Bubble with both microphones off](../.cache/voice-fix-muted-members.png)
- [First active publisher, without a checkbox cycle](../.cache/voice-fix-first-publisher.png)
- [Compact voice settings popover](../.cache/voice-fix-settings.png)
- [Private generation](../.cache/voice-fix-private.png)
- [Stretched pair](../.cache/voice-fix-stretched.png)
- [Three-member enclosure](../.cache/voice-fix-group.png)
- [Mobile controls](../.cache/voice-fix-mobile.png)

Regenerate with `pnpm test:proximity:browser` and Brave selected through `OFFICE_TEST_BROWSER`. Artifacts live in ignored `.cache`.

## Local verification commands

Final local validation on October 30, 2026:

| Check | Result |
|---|---|
| Workspace unit/integration tests | Passed: 134 web and 41 realtime; no failures or skips |
| Workspace lint and TypeScript | Passed |
| Next.js production build and realtime build | Passed |
| Production voice-route security checks | Passed: 3 tests |
| Proximity Brave browser suite | Passed, including actual SDK first publication, transport recovery, receive-only consent, generation/mute preservation, retry, geometry and mobile controls |
| Office engine and all-five-layout environment browser suites | Passed |
| Standalone Meeting Room voice browser suite | Passed |
| Full office communication browser suite | Passed on rerun, including mobile/tablet layouts, media ownership, settings persistence and zero runtime errors |

The final communication-browser run initially stopped before loading the application because Brave exposed its debugging port before creating a page. The harness now waits for page discovery; its rerun passed and application assertions were not weakened.

Use the pinned pnpm: workspace tests, lint and typecheck; Next.js production build; realtime TypeScript build; production voice-route tests; and the voice, proximity, office, environment and communication browser suites. No production configuration or data is required for the isolated harnesses.

After a web/realtime voice protocol update, reload both local browser pages before acceptance. The retired `enabled` contract is replaced by explicit `eligible` and `audioAllowed`; microphone intent is local and does not wait for a server opt-in acknowledgement.
