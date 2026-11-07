# Live office furniture editing

Implemented locally in the existing checkout on 6 November 2026. No Git operations, deployment, hosted migrations or production tenant writes were performed.

## Why the office reloaded

The previous `mapVersion()` fingerprint covered all composed layers, including furniture, collision and the customization revision. Publishing changed that fingerprint. `OfficeRoom.checkEnvironment()` retired the room, admission replaced mismatched rooms, and the browser connection rejected mismatched maps. The editor then called `window.location.reload()` after the retirement signal. This was safe for complete layout replacement but unnecessarily interrupted ordinary furniture edits.

## Live update path

Dragging still uses an imperative local ghost; raw pointer frames are not broadcast or persisted. Release, rotation, add, delete, undo, redo, recovery and reset submit an `environment.edit` request. It contains the office ID, room epoch, expected live revision, UUID operation ID and a bounded batch of affected stable object instances. A batch includes a desk's attached accessories atomically. Clients never submit collision tiles, speed, actor identity or roles.

Colyseus revalidates the caller's Auth identity, then invokes the existing verified active OWNER RPC with that caller's JWT. Requests are serialized per room. The server checks the epoch/revision, parses the allowlisted assets and transforms, composes the proposed layout, validates navigation/geometry, checks current player bodies and their next authoritative movement step, and protects occupied seats. The final safety check and collision/seating swap execute synchronously with no intervening await. Rejection returns the last confirmed live snapshot and a clear explanation; the owner preview rolls back.

`environment.delta` broadcasts only affected instances and revision metadata. Clients ignore old/duplicate revisions. Gaps trigger a rate-bounded `environment.sync` / `environment.snapshot` exchange; movement input pauses until the collision revision catches up. Schema state also advertises the room epoch/live revision, so a missing final delta is detectable. Snapshots are bounded customization documents, not tilemaps. The first join and transport reconnect request the authoritative working snapshot.

The live revision and durable database revision are separate. Accepted edits are visible to teammates but remain **Live · unsaved** until Save. Unsaved working state survives reconnects while that canonical room remains alive; it is not crash durable and is discarded when the room closes. A private recovery draft can be saved and explicitly recovered through More.

## Renderer, collision, seating and voice

The existing Phaser scene remains mounted. A stable instance-ID-to-image registry creates/removes only changed sprites and updates positions/orientations in place. Authored directional chair art and desk foreground edges keep their layers. Existing editable tiles are cleared once, rather than redrawing complete furniture tile layers after every edit. Rug graphics redraw only when the rug data changes. Pointer movement never rebuilds the map or streams React state. Network acceptance applies geometry directly through the controller, including background tabs whose animation frames are paused; it does not wait for the next Phaser frame.

Confirmed snapshots update only changed client collision cells and their neighboring faces. The same shared composer supplies the authoritative server collision map and interaction registry. `createSeating.updateMap()` updates metadata while retaining occupancy owners and transition timers. Generated modular seats now use the same `base/...` IDs before and after the first edit. Moving/removing an occupied chair/sofa or changing its safe access is rejected; there is no teleport or occupant relocation workflow.

Walls, floor, layout/configuration, room markers and voice boundaries have a separate structural fingerprint. They retain the existing retirement/reload flow. Furniture operations cannot alter that fingerprint. The proximity space continues to use unchanged architectural barriers, and furniture changes do not recreate its controller, revoke media, rotate bubble generations, reset chat or recreate transport owners.

## Save and recovery

The primary action is **Save**. It never silently commits an unfinished carry/drag, asks users to reload, or starts a new room. The exact accepted server document is saved using both a live revision check and database optimistic concurrency.

The additive migration `20261106000100_live_office_decoration.sql` introduces a service-only atomic commit RPC and a private bounded idempotency ledger. It uses the existing owner lock, catalog validator and customization storage. Draft and publication run in one PostgreSQL transaction; a failed publication cannot leave a partially saved draft. Verified owner status is checked again inside SQL. Receipt reuse with a different actor, revision or document is rejected. At most 256 receipts per office are retained; older retries cannot pass the monotonic revision check.

The server broadcasts a persisted revision only after the commit is verified. Outages or lost responses never report success. An uncertain save blocks further mutations until the same operation is reconciled. Retry Save reuses its operation ID; reconnecting the original owner also retries the retained pending operation. A saved transaction cannot publish twice. Other edits wait during this uncertainty instead of guessing whether a write committed. Live geometry remains available to connected users.

Save draft, Recover saved draft, Restore previous, Reset, Preview, Check and Reload draft remain in More. Discard sends a validated inverse batch back to the saved layout; it can be refused if somebody occupies affected furniture. Direct legacy web publication/rollback actions are rejected: publication must go through the connected live authority. Structural setup actions remain separate.

## Local setup and hosted prerequisites

The ignored local realtime `.env` was configured with the **existing matching workspace server writer**, using `node scripts/configure-live-office.mjs`. The script verifies matching web/realtime project URLs, prints no keys, and does not rotate credentials or write database data. It never uses the separate platform-admin identity project. The realtime environment example documents `OFFICE_DECORATION_SUPABASE_URL` and `OFFICE_DECORATION_SUPABASE_SECRET_KEY`; the publishable admission credential remains separate.

**The new SQL migration has only been applied to disposable local test databases.** Hosted Save requires applying [the migration](../supabase/migrations/20261106000100_live_office_decoration.sql) to the workspace project through the project's normal approved process. This task did not apply it remotely. The realtime process must load the updated code/environment; no real user process was manually stopped or restarted. Missing configuration/schema produces an explicit save error while retaining live unsaved edits.

## Changed files

| Area | Files |
| --- | --- |
| Shared protocol/composition | `packages/shared/src/environment/live-decoration.ts`, `environment/decoration.ts`, `protocol.ts`, `interactions.ts`, `seating.ts` |
| Authoritative live state/storage | `apps/realtime/src/environment/live.ts`, `live-store.ts`, `rooms/office-room.ts`, `rooms/admission.ts`, `state/office-state.ts`, `server.ts`, `index.ts`, `.env.example` |
| Editor and Phaser | `apps/web/src/features/decoration/decoration-editor.tsx`, `overlay.ts`, `actions.ts`; `features/office/scenes/office-scene.ts`, `engine/create-game.ts`, `engine/lifecycle.ts`, `components/office-canvas.tsx`, `network/connection.ts` |
| Persistence/setup | The additive SQL migration; `scripts/configure-live-office.mjs`; ignored local realtime `.env` |
| Tests | `apps/realtime/src/tests/live-decoration.test.ts`, web `network/network.test.ts`, `scripts/decoration-database.test.mjs`, `test-decoration-browser.mjs`, `direct-editor-browser-scenario.mjs`, `environment-architecture-probe.mjs`, `test-office-browser.mjs` |
| Documentation | This report, README, and the previous editor report's follow-up link |

## Validation and screenshots

The final live browser scenario passed with actual React/Phaser, local Colyseus HTTP/WebSockets and isolated PGlite PostgreSQL. It covers both clients observing accepted edits, actual foreground/background Phaser collision cells matching the server, stable scene/sprite/camera/avatar/session identities, unchanged proximity generation and installed LiveKit SDK instance, member/occupied-seat denial, failed-save retry, revision conflict, live restoration, all unsaved-exit choices, later manual refresh of persisted state and structural retirement. It also loses a response **after a real SQL commit**, refreshes the original owner, and verifies reconciliation without another publication. SDK transport/media and verified identities are synthetic; no hosted Auth, actual microphone/audio or real tenant acceptance is implied.

| Validation | Result |
| --- | --- |
| `pnpm.cmd test` | 233 passed: realtime 68, web 165; zero failures/skips |
| `pnpm.cmd lint` | Web/realtime passed with zero warnings |
| `pnpm.cmd typecheck` | Web/realtime passed |
| `pnpm.cmd build` | Web/realtime passed |
| Decoration + environment PostgreSQL suites | 2 passed, including atomic live commit, receipt reuse/conflicts and denied browser/member/cross-tenant access |
| Browser regression suites | 9 distinct suites passed across the full run and targeted rechecks: live editor, directional seating, movement/seating, engine, environment editor, proximity, chat, communication and voice |
| Visual review | All eight live-editor screenshots reviewed |
| Generated client bundle scan | No live-commit RPC or workspace writer secret variable name in browser JavaScript |

Evidence is in ignored `.cache/live-editor-unit-verified.log`, `live-editor-lint-verified.log`, `live-editor-types-verified.log`, `live-editor-build-verified.log`, `live-editor-database.log`, `live-editor-brave-final.log`, `live-editor-browser-recheck.log` and `live-editor-brave-verified.log`. The initial nine-suite run had six passes and three failures; targeted renderer/engine rechecks and the final extended live-editor run resolved all three. The rendering probe now verifies exact authored atlas frames in stable sprites as well as remaining detail tiles, and the isolated engine harness allowlists the new shared module.

Integration testing also corrected Colyseus accessor-field lookahead, PostgreSQL JSONB property ordering, background-tab collision delivery, and an overly restrictive minimum delay between acknowledged editor commands. Requests remain bounded and rate limited, with one in-flight mutation per client and 20 editing requests per second. No geometry, authorization, occupancy or persistence assertion was relaxed.

Screenshots from the updated live editor:

1. [Minimal editing](assets/live-office-editing/01-minimal-edit-mode.png)
2. [Selected object](assets/live-office-editing/02-selected-object.png)
3. [Live drag preview](assets/live-office-editing/03-dragging-object.png)
4. [Rotated chair](assets/live-office-editing/04-rotated-chair.png)
5. [Furniture library](assets/live-office-editing/05-adding-furniture.png)
6. [Rejected placement](assets/live-office-editing/06-invalid-placement.png)
7. [Saved without reload](assets/live-office-editing/07-successful-save.png)
8. [Mobile live editor](assets/live-office-editing/08-mobile-editor.png)

## Restrictions and pending acceptance

- No hosted migration, real authenticated owner/member acceptance, physical touchscreen test or real LiveKit/audio acceptance was performed.
- Live unsaved state is room scoped. Use Save for durable publication or Save draft for private recovery. A process restart/last-user room disposal can lose unsaved working changes.
- An uncertain commit conservatively blocks new mutations until the original Save is reconciled; the original owner can retry or reconnect. A continuing database/Auth outage cannot be bypassed safely.
- Only authored orientations are supported. Architecture/configuration/catalog changes retain structural retirement. Moving an occupied seat is deliberately unsupported.
- Remote drag ghosts are not broadcast. Other clients see accepted drop/rotate/add/remove operations; authoritative collisions never follow a temporary ghost.
- The implementation retains the project's single canonical realtime authority per office. Cross-process collaborative authority or distributed multi-region writes are outside this phase.
