# Phase 01 — movement and interactive seating

The [workstation and four-direction seating correction](workstation-directional-seating.md) supersedes the initial down-only catalog and missing compound-desk seat handling described below. It also adds reserved chair access, native chair orientations, desk-edge layering and occupied prompts.

Implemented locally on 5 November 2026 in the existing branch. No branches, commits, pushes, merges, deployments, migrations, infrastructure changes, or real tenant data changes were performed. Supabase and Super Admin behavior remain separate and unchanged.

## Controls and movement

- WASD/arrows walk at the existing 120 world pixels/second. Hold either Shift key to run at **1.6× / 192 pixels/second**. Releasing Shift returns to walking.
- Touch devices and narrow screens have compact directional buttons plus an accessible Run toggle. Pointer capture, release/cancel, blur, hidden-document, panel changes, offline transitions, and unmount clear movement intent.
- E is focus-scoped to the office and edge-triggered (held key repeats do not send repeated actions). The same contextual action is a keyboard-focusable/clickable/tappable button.
- **E/tap to sit; E/tap to stand before walking.** Directional input while seated cannot move the player or clear occupancy. A successful interaction clears cached input; standing uses a brief 150ms state before fresh movement. No automatic seat exit occurs merely from a held direction.

`packages/shared/src/movement.ts` owns the single foot-body solver used by the server and isolated local preview. Every simulation tick is fixed at 50ms, normalizes diagonal intent, selects its own bounded speed, and subdivides displacement into steps of at most one pixel. Axis separation preserves wall sliding. The 14×10 foot body, map collision footprint, room partitions, furniture, world bounds, and existing walk speed remain intact. The obsolete Phaser-only local movement method was removed rather than maintained as a second solver.

The client sends only `{seq,x,y,run}`. `run` is optional for existing walk-only input. Extra speed, elapsed-time, position, non-boolean run, non-unit axes, nonfinite values, and stale sequence payloads are rejected by the server. The existing input-rate limit and 250ms stale-intent deadline remain in force. Running is a boolean permission to use the server-configured multiplier, never a supplied velocity.

The server replicates `isRunning`, `motionState`, and `seatId`. Rendering retains the existing reusable sprites and camera following; an exponential interpolation settles exactly at tiny residual distances and snaps validated seating transitions rather than interpolating through furniture. Running uses the established gait at 1.6× animation rate.

## Interaction framework

`packages/shared/src/interactions.ts` defines a reusable `OfficeObject` contract: stable instance/catalog IDs, object type, world position, generic action anchors/facing, radius, occupancy configuration, collision footprint, and supported actions. `InteractionAction` includes SIT, STAND, USE, OPEN, PLAY_GAME, and SHARE_SCREEN. Only **SIT/STAND** are executable; no fake TV/game/sharing controls are presented.

The content-owned `seatingCatalog` extends existing catalog IDs. Workstation benches (`benchShared`, `benchLaptop`, legacy `bench`) are desks, so they are deliberately not mistaken for seating. Chairs, armchairs, stools, waiting benches, compact/legacy sofas, and sectional sofas have seating metadata. Single chairs have one slot, waiting benches two, and sofas two or three according to their width. Artwork in this catalog faces down, so anchors use that facing; future directional art should supply matching catalog orientation.

Composed environments reuse their existing **Placements** metadata. They do not need an extra world copy or a second furniture placement list. The bundled legacy studio predates that layer; a bounded one-time adapter matches complete known seating rectangles in its existing Furniture atlas layer. It does not turn arbitrary solid tiles into seats. Registry construction occurs once per map, and target selection is checked at most ten times/second, with React updated only when the selected action changes.

Existing placement IDs are deterministically scoped by room, asset, and coordinates, with slot indices under each ID. A saved environment revision therefore regenerates the same IDs and anchors in both runtimes. `registerSeating` also accepts an explicit persistent `instanceId` for future owner-placed objects. The current API never accepts client-provided object positions or collision geometry.

The primary prompt selects the nearest **valid, reachable, unoccupied** slot, breaking ties by stable slot ID. While seated, STAND is the only primary action. The prompt disappears out of range, offline, or when an office panel is open. The overlay itself does not intercept pointer input; only its small buttons do. Existing HUD panels, camera controls, chat, and voice remain mounted through their existing lifecycles.

## Seating authority and lifecycle

`packages/shared/src/seating.ts` provides the map-owned synchronous seat controller, reused by the local preview; `apps/realtime/src/interactions/seating.ts` exposes it to the authenticated room. `OfficeState.seats` replicates slot → session ownership. A server-only owner index prevents a user from claiming multiple slots.

An `object.interact` request contains only an action, object ID, slot ID, and monotonic interaction sequence. The room checks current connected identity and authorization lease, validates its strict shape, applies a 250ms interaction throttle, and then validates the registry entry and availability. Claim plus avatar state update happens synchronously without an intervening await, so simultaneous requests cannot double-book a slot. Errors describe occupied, invalid, out-of-range, rate-limited, or denied requests without performing optimistic client occupancy changes.

A valid sit requires the avatar to be within 64 pixels of the anchor and able to reach a collision-safe approach. Both the avatar-to-approach segment and approach-to-anchor segment are sampled using the actual foot body. Only the selected furniture footprint is allowed on the latter segment; **architecture and every other obstacle remain blocking**. This prevents seat snaps through partitions. Stand exits use a validated approach; they never place the avatar in a wall or furniture. No pathfinding/automatic walk-to-seat is implemented: the user approaches manually.

Standing, immediate transport drop, final leave, access denial/revocation, and room disposal release occupancy. Reconnection starts standing without restoring a stale seat claim. Environment changes retain the existing room-retirement/rejoin behavior and clear all old occupancy; geometry is never hot-swapped under seated players. Stale sequence commands cannot affect a new environment's room.

## Animation and visual assets

States: IDLE, WALKING, RUNNING, SITTING, plus the brief server STANDING transition. Standing reuses the normal upright pose. Sitting uses new bent-leg frames in the existing palette, 32px dimensions, and character proportions. Avatar and label depth remain above furniture, with y ordering between characters.

`scripts/generate-avatar-assets.mjs` now appends seated rows to the existing sheet. `apps/web/public/office/avatar.png` grows from 96×768 to **96×1536**. The original first 72 frames are pixel-identical to the pre-change asset (verified against Git HEAD after PNG decompression); profile previews, original frame IDs, body offsets, and the six presets retain their contract. Seated frame lookup is the original directional idle index plus 72.

## Voice/privacy compatibility

No proximity settings, membership predicates, consent rules, microphone state, LiveKit token logic, private-conversation locks, or meeting precedence were changed. The authoritative proximity pass still consumes each connected player's actual server x/y. A seated player stays in that pass. Existing conversation line-of-sight intentionally considers partitions/unbuilt void rather than furniture, so being inside a validated seat does not remove eligibility. The two-client seating screenshot also shows the unchanged authoritative proximity bubble around seated members.

Unit tests cover the architectural visibility of seated anchors, and the existing realtime and browser proximity/privacy/voice regressions remain part of validation. No real microphone or cloud LiveKit room is used by the new tests.

## Screenshots

All images below are **isolated synthetic identities** in actual React/Phaser clients connected to a real local Colyseus server. They are not real authenticated Supabase multiplayer acceptance.

- [Walking](assets/phase01-movement-seating/01-walking-desktop.png)
- [Running](assets/phase01-movement-seating/02-running-desktop.png)
- [Seated pose and stand prompt](assets/phase01-movement-seating/03-seated-sofa-desktop.png)
- [Two synchronized users in separate sofa slots](assets/phase01-movement-seating/04-two-player-sofa.png)
- [Mobile movement and run controls](assets/phase01-movement-seating/05-mobile-run-controls.png)
- [Mobile seated interaction](assets/phase01-movement-seating/06-mobile-seated.png)

## Source map

- Shared: `movement.ts`, `interactions.ts`, `seating.ts`, `avatars.ts`, `protocol.ts`.
- Server: `movement/simulation.ts`, `interactions/seating.ts`, `rooms/office-room.ts`, `state/office-state.ts`.
- Client: `input/movement.ts`, `network/connection.ts`, `scenes/office-scene.ts`, `engine/player-avatar.ts`, `engine/create-game.ts`, `engine/lifecycle.ts`, `components/interaction-controls.tsx`, `components/office-canvas.tsx`, `components/hud-glass.css` under the office feature.
- Assets: avatar generator and PNG.
- Validation: `movement-seating.test.ts`, the new realtime transport scenario, `interaction-input.test.ts`, atlas-size expectation, new `scripts/test-movement-seating-browser.mjs`, and the existing engine fixture's shared-solver reset/geometry probes. `pnpm.cmd test:movement:browser` runs the new browser suite.

## Validation and acceptance

New tests cover walk/run speed, normalized diagonals, speed/time/position exploits, high-speed wall/furniture collision, all supported layout/theme/furniture registries, reachability and wall-crossing, seat/stand, double-booking, multiple sofa slots, cleanup on drop/environment retirement, malformed commands, animation state, voice architecture compatibility, E-key lifecycle, and actual mobile touch press/release. The new browser test uses **two real HTTP/WebSocket clients with synthetic authorization**, with server-owned fixture placement only inside the test harness.

| Final check | Result |
| --- | --- |
| `pnpm.cmd -r lint` | Passed, zero warnings |
| `pnpm.cmd -r typecheck` | Both apps passed |
| `pnpm.cmd build` | Web production build and realtime build passed |
| `pnpm.cmd test` | **151 web + 51 realtime = 202 passed**, zero failures/skips |
| `pnpm.cmd test:movement:browser` | Two-client browser acceptance passed, zero runtime errors/skips; six screenshots regenerated from final source |
| Existing office engine browser | Passed walking, all directions, collision/idle, focus, camera/resize, profile appearance, interpolation and teardown |
| Existing environment browser | Passed editor/preview/apply fixtures, all five layouts and actual Phaser maps |
| Existing communication browser | Passed responsive panels, keyboard/focus, mobile, glass contrast, touch-height budgets, and lifecycles |
| Existing proximity/privacy browser | Passed consent, private controls, meeting precedence, serialized media, mobile/reduced motion and sprite containment |
| Existing voice browser | Passed explicit join/cancellation, SDK denial, mute/device/listener cleanup and mobile layout |
| Existing chat browser | Passed history, plain text, retries/drafts, scroll, mobile and Phaser focus |
| Super Admin production HTTP/browser fixture | **13 passed**, including independent password/MFA, sessions/revocation, tenant read isolation and outage recovery; existing admin screenshot assets were restored byte-for-byte after test output |
| Built realtime negative-path checks | **2 passed** for anonymous/invalid-token/origin denial and fail-closed production config; test LiveKit disabled |
| Original avatar pixel comparison | Original 72 frames pixel-identical to HEAD; appended seated art verified |
| `git diff --check` | Passed |

Initial failures were corrected, not waived: test startup polling now waits for Schema initialization, the environment-retirement scenario selects a genuinely changed theme, the atlas contract accounts for appended rows, and the old engine fixture resets the shared preview source instead of treating its disabled render body as authority. Tiny interpolation tails now settle at the target. Interaction controls unmount while offline/panels are open, preserving the existing mobile focus and touch-control checks. Parallel software-rendered Chromium fixtures caused timeouts/profile locks, so browser regressions were rerun sequentially and all passed. The software renderer's roughly 21–23 FPS engine samples are observations, not a 60-FPS or physical-device performance claim.

No dedicated pair of real-account test credentials was available in configured test settings. No ordinary user's session or MFA credentials were extracted or reused, and no real tenant was changed. **Real Supabase-authenticated two-person multiplayer and actual mobile-device/voice acceptance remain unverified.** The local fixtures and screenshots are explicitly separate from that acceptance.

## Phase 02 recommendations and limits

1. Persist owner-placed objects with immutable UUID instance IDs plus asset ID, orientation, and server-validated transform in the existing versioned environment save flow. Derive footprint, anchors, radius, and action capabilities from a server-owned catalog; never accept those as client authority.
2. Extend the composer to register those objects after its collision/door-clearance validation. Use `registerSeating(map,{...placement,instanceId})` for seats and the generic `OfficeObject` contract for new object capabilities. Preserve IDs while moving an object within a revision history; retain the environment version in the room admission consistency check.
3. Revalidate the entire owner edit atomically for overlap, egress, seat approaches, maximum object count, and catalog allowlists. Keep room retirement for applied geometry edits so no occupied seat retains an obsolete anchor.
4. Add action-specific server handlers for USE/OPEN/games/sharing with their own authorization, rate limits, state, and cleanup. Merely adding an action name to metadata must not enable it.
5. Current seats use straight validated approach paths and static map collision. Movable geometry, arbitrary rotations, pathfinding, persistent reservations, game state, TV/screen sharing, and the drag-and-drop editor are intentionally outside Phase 01. Seat ownership is ephemeral in the existing single Colyseus authority, not a Supabase row or cross-process lease.

Restart/update local web and realtime processes together when reviewing the new protocol and sprite sheet. No database migration is needed. Browser fixtures disable external media/provider writes and do not start a second real LiveKit authority.
