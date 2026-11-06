# Workstation chairs and four-direction seating

Implemented locally on 5 November 2026 in the existing checkout. No branch creation/switch, commit, push, merge, deployment, database migration, infrastructure change, or real tenant mutation was performed. Existing Phase 01 work was retained and extended.

## Root causes

1. Standard, executive, developer and training desk artwork **contains a chair inside the desk sprite**. The previous registry recognized standalone chair IDs only, so those rendered chairs had no seat slot at all. The standard and executive room recipes intentionally place compound desks rather than a separate chair object; adding another chair would have duplicated the artwork.
2. The prior catalog hardcoded every seat to face `down`, while placements carried no facing metadata. Meeting and collaborative chairs consequently faced away from their tables. Registry code also applied the same `height - 22` offset to every asset, regardless of the actual cushion or embedded-chair location.
3. Several otherwise valid workstation seats had no walkable exit because later decorative furniture occupied the area below the chair. After adding the missing desk metadata, an audit found 21 such instances in the 75 balanced layout/style/theme compositions. Reserving the seat's access area in the common composer removes this second obstruction.
4. The avatar atlas had directional head identity but nearly identical front-projected seated legs. Renderer layering always put the full avatar above all desk pixels, and a north-facing seated name label could cover its monitor.

## Catalog and placement changes

`packages/shared/src/environment/seating-metadata.ts` is the common source of seat geometry. It declares real chair/cushion bounds, per-family anchors, facing, exit preference, and slots. It also describes embedded chairs in desk, executiveDesk, deskSingle, deskDual, deskLaptop, deskCreative, deskReturn, deskManager and classroomDesk. Standing desks and collaboration tables without a drawn chair do not invent a seat.

Standalone chairs supported: legacy chair/armchair, mesh, task, visitor, meeting, lounge, classroom and stool families. Waiting benches and sofas retain their independent multiple-slot occupancy and authored orientation. Collaborative workstation benches remain desks; their separately placed chairs are registered and face the monitors.

`PlaceFixture` and placement markers now carry an optional cardinal `facing`. Meeting chairs face inward on all four sides, collaborative/training workstation chairs face up toward monitors, and dining/bar chairs face inward. Compound workstation chairs use the desk's authored north-facing geometry. Lounge chairs, sofas and waiting benches use their catalog orientation unless a native directional chair placement overrides it.

The composer reserves the foot-body cells of a validated seat approach before later room/corridor furniture is placed. An object with a real chair is not painted into an inaccessible arrangement. This respects the existing doorway/egress restrictions and does not modify world size, avatar collision size, walking speed, running speed, privacy rules, or database environment configuration.

Native up/left/right chair artwork is appended to unused space in the existing 512×1024 themed atlas. These are render variants of the same catalog object, with unchanged asset identity; existing atlas rectangles and tile IDs retain their allocations. The composer emits the appropriate variant GID while preserving the original asset ID and facing in Placements. Owner-placed chairs using the common placement/catalog path therefore receive the same registration without a layout-specific seat list.

The bundled legacy studio still has no Placements layer. Its adapter now recognizes the full known compound desk rectangles as well as individual chairs, and derives the existing meeting-chair facing from the actual meeting-table bounds. Legacy rendering loads the shared warm-wood chair variants, retaining its original map collision/tile limits.

## Anchors, collision, standing and replication

Each registered slot exposes its stable `id`/seat ID, `parentObjectId`, world position, sitting anchor plus direction, chair-only collision footprint, preferred approach/stand anchor, and validated alternative approaches. Availability comes from the existing authoritative `OfficeState.seats` map; no mutable occupancy copy is hidden in catalog data.

Embedded desk seats are children of the stable desk instance ID. Their exception footprint covers **only the chair area**, not the complete desk. Server path sampling still rejects architecture and any other furniture. It cannot turn a desk into a walk-through surface or teleport a player through it. The common `seatExits` calculation is shared by composition and runtime registration, avoiding different geometry assumptions between them.

The existing synchronous claim, one-slot-per-session index, monotonic request sequences, authorization lease checks, rate limits, and movement restrictions remain active. An occupied slot cannot be stolen. The server snaps to the validated authored anchor and replicates its facing and SITTING state; clients choose the corresponding native frame. E/touch Stand searches the preferred exit and then validates alternatives, releases occupancy only on success, faces the avatar toward its exit, and retains the existing brief standing transition.

Drop/disconnect releases the seat immediately; reconnect returns the player standing at a valid exit without restoring a stale claim. Room retirement on environment changes clears the old occupancy. These behaviors are exercised through real local HTTP/WebSocket transport with synthetic authorization.

## Rendering and contextual UI

- Avatar UP, DOWN, LEFT and RIGHT seated poses have separately authored knee/shoe projections, with existing head/hair/palette identity and 32px proportions. Sprites are not rotated or flipped to produce a direction.
- Desk-embedded chair art faces its monitor. Directional standalone chair art uses matching backrest/cushion geometry.
- A small cropped foreground strip reuses the actual desk-edge pixels at depth 3.1, above character sprites and below labels. It does not place a whole desk over the character. World-coordinate depth is independent of camera zoom.
- North-facing seated labels appear below the avatar so computer monitors remain visible.
- The prompt shows **E — Sit** or **E — Stand**. If there is no available reachable alternative, the relevant occupied seat produces a small disabled **Seat occupied** state, without an E command. Keyboard E also refuses an unavailable primary target.
- The minimal HUD layout, mobile controls, camera behavior and lifecycle remain intact.

## Screenshots

Captured in the installed **Brave** executable using two actual React/Phaser clients and the actual local Colyseus server. Authorization/identity is synthetic; these are not live Supabase-user acceptance screenshots.

- [UP](assets/workstation-seating/01-sitting-up.png)
- [DOWN](assets/workstation-seating/02-sitting-down.png)
- [LEFT](assets/workstation-seating/03-sitting-left.png)
- [RIGHT](assets/workstation-seating/04-sitting-right.png)
- [Computer workstation](assets/workstation-seating/05-computer-workstation.png)
- [Sofa](assets/workstation-seating/06-sofa.png)

## Files modified for this correction

- Shared catalog/composition: `environment/seating-metadata.ts` (new), `environment/assets.ts`, `environment/rooms.ts`, `environment/compose.ts`, `map.ts`.
- Shared runtime: `interactions.ts`, `seating.ts`.
- Client: `office/scenes/office-scene.ts`, `office/engine/player-avatar.ts`, `office/components/interaction-controls.tsx`.
- Procedural art: `scripts/seating-art.mjs` (new), `expanded-office-art.mjs`, `polish-environment-art.mjs`, `generate-office-assets.mjs`, `generate-avatar-assets.mjs`; generated office/avatar/themed PNGs.
- Tests: `apps/realtime/src/tests/workstation-seating.test.ts` (new), `movement-seating.test.ts`, `realtime.test.ts`, `scripts/test-directional-seating-browser.mjs` (new); existing engine/chat/communication harnesses now serve the shared legacy chair art/module.
- `package.json` adds `test:seating:browser`; README links this report.

## Validation

New automated regressions exercise every actual seated asset in all **5 layouts × 3 furniture styles × 5 themes = 75** balanced compositions, rather than merely checking that each room has at least one seat. They verify registration counts, stable identities, exact catalog anchors, actual sit/stand, desk-facing direction, collision-safe exits, all four directions, native artwork GIDs, occupied feedback, blocked preferred-exit fallback, future explicit object IDs and seated architectural proximity visibility. Existing full environment tests additionally cover the broader decor/override combinations.

The new two-client Brave test verifies nearest-chair E interaction, each cardinal avatar frame and synchronized remote direction, no sprite rotation/flip, exact authoritative anchor position, workstation foreground depth across four camera zoom levels, occupied UI and denied occupied E action, sofa seating, stand safety and Shift-to-run. Existing real-transport tests cover contention, multiple sofa slots, seated input rejection, drop/reconnect standing cleanup, re-claim and environment retirement. No production services are used by those fixtures.

Final results on 5 November 2026:

| Check | Result |
| --- | --- |
| Workspace lint, zero warnings | Passed |
| Web and realtime TypeScript checks | Passed |
| Web production build and realtime build | Passed |
| Web unit tests | 151 passed, zero failed/skipped |
| Realtime unit tests | 57 passed, zero failed/skipped |
| Brave directional seating and two-client/mobile movement | 2 passed |
| Brave environment editor, Phaser engine and proximity | 3 passed |
| Brave communication composition and voice UI | 2 passed |
| Brave chat component | 1 passed on final rerun |
| Six requested screenshots | Captured and visually inspected |

The browser checks used the installed Brave executable, isolated test profiles and SwiftShader software WebGL. There were no skipped browser checks. They verify actual local React/Phaser/Colyseus behavior; Auth and media fixtures remain synthetic, so this is not real Supabase-user or physical microphone acceptance.

During validation, the test-only reconnect adapter needed the same required Origin header as the existing Node transport fixture. The production browser protocol was not weakened. Final TypeScript validation also caught two inference errors in the new exhaustive test, resolved with explicit `Point`/`InteractionRequest` annotations. The first chat run completed its assertions but failed temporary-profile deletion with Windows `EPERM`; its harness now waits for graceful Brave shutdown before cleanup, and the complete rerun passed.

Verification logs are local under `.cache/workstation-*-final.log`, `.cache/workstation-brave-regressions.log` and `.cache/workstation-brave-communication.log`. The latter preserves the initial chat cleanup failure; `.cache/workstation-brave-chat-final.log` records its successful rerun.

Workflow note: one initial read-only `git status` ran before the attachment's no-Git instruction was read. No further Git commands were run, and no Git state was changed.

## Remaining limitations

- No real Supabase-authenticated two-person session or physical mobile-device acceptance was performed. Test identities and synthetic media are explicitly separated from those checks.
- Native four-direction **chair/avatar** seating is supported. Current sofa/bench artwork retains its authored south-facing orientation; arbitrary rotated sofa assets and an owner drag-and-drop editor are outside this fix.
- Seat occupancy is ephemeral in the current single Colyseus authority. Dynamic geometry edits retain the existing room-retirement flow; no live obstacle hot-swap or persistent reservation was added.
- Runtime placement data must remain server-owned and validated. A future editor should persist immutable instance IDs, validate asset/facing/collision/egress and use the common placement/seat metadata; clients must never submit authoritative seat positions.
- Reload/restart local web and realtime together when reviewing changed composition/art. No database migration or production deployment is required.
