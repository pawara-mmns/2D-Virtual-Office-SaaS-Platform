# Dynamic proximity voice bubbles

See [icon-only proximity voice](proximity-voice-minimal-ux.md) for the latest controls and screenshots, and [Phase 4 acceptance results](proximity-voice-phase4.md) for the earlier real-user testing status.

Implemented locally in the current working tree. No migration, deployment or tenant-data change is required. Existing architectural maps, collision geometry, camera, owner customization and Liquid Glass HUD remain in use.

## Architecture and behavior

- `packages/shared/src/proximity.ts` defines the bounded bubble messages, lifecycle, generation references and configurable world-coordinate thresholds.
- `apps/realtime/src/voice/proximity.ts` is an ephemeral coordinator owned by each authoritative Colyseus office room. It reads server positions after movement simulation; clients cannot supply positions, membership, media-room names or controller identity.
- `VoiceService` remains the single media authority and enforces one active voice admission per authenticated user. The existing Next.js token proxy independently verifies the signed-in user, then forwards the exact office/session/bubble generation reference to realtime for fresh authorization.
- `OfficeVoice` owns one microphone capture through `audio-owner.ts` and the existing serialized `VoiceSession` lifecycle. Capture requires an explicit user action and normal browser permission. Waiting and retiring generations pause the track. Mute preference survives transitions and is saved locally. Generation leases prevent delayed cleanup from pausing a replacement connection.
- Phaser's `VoiceBubbles` renders rounded capsule/group boundaries using the actual interpolated sprites. It has no physics bodies. DOM lock controls receive imperative camera-relative positions; movement never enters React state. No shader, blur pass or particle system is added.

Defaults are centralized in `proximityDefaults`. Override them with `createRealtimeServer({ proximity: { ... } })` when constructing the authority; the server sends the selected settings to clients.

| Setting | Default | Meaning |
|---|---:|---|
| `connectRadius` | 96 world pixels | Every pair must fit within this distance for entry |
| `disconnectRadius` | 160 world pixels | Larger hysteresis boundary for existing membership |
| `dwellMs` | 700 ms | Continuous proximity before forming/joining |
| `graceMs` | 1,000 ms | Separation must persist before removal |
| `stretchDistance` | 112 world pixels | Visual tension begins |
| `maxMembers` | 10 | Bounded by office capacity; configurable from 2–10 |

The layout's tiles are 32 world pixels. Distances use authoritative avatar centers, not screen pixels or zoom. Radius checks currently do not test wall occlusion.

Eligible unattached people are considered in stable session order. They join the closest eligible open group after dwell, with creation time/ID breaking ties. Otherwise an eligible pair forms a new group. Entry must be close to every member, which avoids unlimited chains. Existing groups never merge automatically, including open groups. Locked groups reject outsiders.

Exit preserves the largest deterministic pairwise-compatible cluster, preferring the controller on ties. A departing member must remain outside the exit radius for the grace interval. At least two remaining members preserve a group; otherwise it dissolves. The lowest remaining session ID becomes controller if the controller leaves. State changes pass through FORMING, CONNECTING, ACTIVE/STRETCHING, DISCONNECTING and DISSOLVED. ACTIVE means the provider control plane has observed current admissions; it is not proof that a person heard audio.

## Privacy boundary

Each bubble generation uses a unique LiveKit room under the existing environment-scoped, HMAC-owned provider namespace. Bubble IDs are random UUIDs; media participant identities are separately generated opaque UUIDs. Tokens keep the existing 30-second initial TTL and microphone-only room grants. API secrets remain server-side.

Every lock, unlock or roster change synchronously advances the logical revision and clears the media target. The authority removes/revokes all old admissions, then publishes a fresh generation only after removals settle and the provider is available. A failed removal leaves the conversation DISCONNECTING and blocks new media grants while cleanup retries. Requests with old references, nonmember sessions, wrong offices/tenants or stale authorization fail. An HTTP request that was signing a token during rotation also fails its final eligibility check. A stale HTTP cancellation cannot revoke a newer generation.

This uses LiveKit Cloud's server-side participant removal and token revocation, not client volume/subscription flags. The existing provider supplies an explicit revocation cutoff, and fresh generations never reuse retired media-room names. LiveKit documents participant removal/token revocation in its [participant management guide](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/) and [token/grant reference](https://docs.livekit.io/frontends/reference/tokens-grants/). Provider/network outages can delay removal; new conversations remain blocked instead of granting access through a partially retired generation. Actual Cloud revocation latency still needs authenticated acceptance testing.

Visible office members receive bubble session rosters and privacy state so Phaser can draw the boundary; no conversation audio or new private profile fields are distributed through Colyseus. Only the current controller can change privacy, using the current generation/revision. Noncontrollers see a disabled privacy indicator. Frozen rosters cannot admit an outsider by reusing a former generation.

## Consent, meetings and lifecycle

Enable proximity voice first requests capture, then sends the server opt-in. No automatic capture happens on entering the office. Cancel stops a late-granted track. Disable immediately pauses/stops local capture and sends opt-out without waiting for a fresh Auth request. Pending authenticated Enable results are invalidated by subsequent opt-out.

Entering the Meeting Room opts out of proximity and stops its capture. Meeting voice retains the explicit **Join Voice** action and its existing room authorization. Leaving that zone stops meeting media. Enable proximity again outside it; proximity does not silently resume. Refresh, socket interruption/reconnect, permission termination, office exit and environment retirement require renewed opt-in. The microphone mute preference remains local. The shared connection lifecycle serializes Room cleanup, including React Strict Mode replay.

If a Cloud removal event arrives just before the authoritative WebSocket transition, the client pauses capture immediately and allows 1.5 seconds for a replacement generation. It does not publish during that interval. Without an authoritative replacement it stops voice and shows an error.

Connection, departure, lock and unlock cues are original quiet two-note Web Audio patterns generated locally. They require user audio activation, deduplicate confirmed transitions, expose saved volume/mute controls, and are suppressed with reduced motion. The existing SDK **Enable audio playback** control handles blocked remote playback. Reduced motion also removes bubble fade/formation animation and camera glide. Floating controls use 44-pixel touch targets; HUD controls remain available if an anchor is outside the camera.

## Local two-user acceptance

Use a dedicated **test** organization and LiveKit project/environment. Do not reuse a running production voice authority or production tenant data. Follow the existing web/realtime environment setup; keep LiveKit keys only in realtime server configuration. No new credentials or database migrations are introduced.

1. Start the existing local web/realtime workflow (`pnpm dev:all`). Use two separate Brave profiles, signed in as active members of the same dedicated test office. A normal tab in the same profile shares its login; it is not a second identity.
2. Join the same office in both profiles. Confirm neither browser starts microphone capture automatically. Click **Enable proximity voice** and grant normal microphone permission in each. Headphones prevent local feedback.
3. Approach within roughly three tiles and wait about 700 ms. Confirm the cyan capsule, connected status, two-way speech and the connection cue. Mute one microphone and confirm it stays muted through subsequent changes.
4. Separate slightly: the bubble persists. Near five tiles it tightens; beyond five tiles for about a second it dissolves, audio stops and a departure cue plays. Return nearby to form a fresh conversation.
5. Lock with the controller's floating/HUD control. Confirm purple/private state, a brief paused transition, and retained member speech. With a third authenticated test user, confirm an outsider cannot join or hear the private group. Unlock and verify admission after dwell. Two users alone cannot establish the outsider/privacy acceptance case.
6. With four test users, form two groups at different locations; confirm no cross-group audio. Move the groups near each other and confirm they remain separate.
7. Enter the Meeting Room: proximity stops and **Join Voice** is required. Exit, re-enable proximity, and verify one capture/connection throughout transitions. Check refresh, socket interruption, tab close, controller leave, microphone permission removal and owner environment reload.
8. Repeat at mobile width, using keyboard controls and reduced motion; verify sound mute/volume persistence and the browser's blocked-playback recovery action.

Do not share access tokens or passwords in test notes. Record only test organization name, pass/fail, browser versions and redacted lifecycle categories. Real microphone quality, audible room isolation, device switching, autoplay on physical devices and Cloud revocation timing remain manual acceptance checks until these authenticated sessions are available.

## Automated verification and artifacts

Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` through the project's pinned pnpm. The production web build also runs TypeScript. `pnpm test:proximity:browser` runs actual OfficeCanvas/React/Phaser/LiveKit SDK components in an isolated Brave profile using synthetic authorization and generated silent tracks. It never opens a real microphone or contacts LiveKit. Set `OFFICE_TEST_BROWSER` to the Brave executable when necessary.

The real Colyseus HTTP/WebSocket suite covers separate groups, tenant denial, controller checks, a joining outsider racing a lock, generation rotation, stale requests, a pending token-signing race, consent cancellation during Auth and meeting precedence. Unit tests cover dwell/hysteresis/grace, bounded ten-person groups, provider-removal failure, controller transfer, permission cancellation, microphone generation leases, mute persistence, hull enclosure, sound suppression/deduplication and exact transport payloads.

Local results on October 30, 2026:

| Check | Result |
|---|---|
| Web tests | 128 passed |
| Realtime tests, including actual HTTP/WebSocket scenarios | 37 passed |
| Browser suites: office, chat, voice, communication, environments, proximity | All 6 passed in Brave |
| Production voice-route/bundle checks | 3 passed |
| Web production build and TypeScript | Passed |
| Realtime TypeScript check and build | Passed |
| Workspace lint | Passed, no warnings |
| Real authenticated microphone/audio and Cloud revocation timing | Pending; test profiles were not available |

The complete communication suite retains its individual assertion/command deadlines but has a 180-second total budget for software rendering. It completed in approximately 147 seconds while other local checks were running. Browser tests use isolated profiles and synthetic identities, not the user's signed-in Brave profile. Earlier failing checks were corrected and rerun; these results refer to the passing runs.

Browser screenshots are generated in ignored `.cache`:

- [Open conversation](../.cache/proximity-open-desktop.png)
- [Private conversation](../.cache/proximity-private-desktop.png)
- [Stretched capsule](../.cache/proximity-stretch-desktop.png)
- [Three-person boundary](../.cache/proximity-group-desktop.png)
- [Mobile controls](../.cache/proximity-mobile.png)

These screenshots are actual component/engine renders with synthetic people/media, not authenticated audio acceptance. Regenerate them with the browser command if the cache is cleared.

## Extension points

Room-occlusion rules, operator configuration UI, selective manual invitations, owner policy controls, touch avatar movement and multi-process coordination are separate work. The current office authority remains single-process, matching the existing admission architecture. Bubble metadata is intentionally ephemeral rather than persisted to Supabase. Membership/privacy rotations briefly interrupt speech; tune thresholds only after real-device testing. There are no automatic group merges or automatic consent restoration after reconnect.
