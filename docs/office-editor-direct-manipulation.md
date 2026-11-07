# Direct office editing — compact redesign

Follow-up: [Live office editing](live-office-editing.md) replaces this report's reload-on-publish behavior with incremental furniture updates and Save without reconnecting. The compact controls and popup pointer fix remain in use.

Implemented locally on 6 November 2026 in the existing checkout. No Git operations, deployment, hosted migration, credential changes or production tenant writes were performed.

## Visible changes

The permanent editor panel and existing-object list are gone. Default edit mode now has a compact floating bar: **Add, Undo, Redo, Save & Apply, More, Exit**. The office stays visible. The Add library opens only when needed, supports search/categories/thumbnails, and closes when an asset is selected. Small furniture previews now use their native pixel size for readability.

Hovering highlights painted furniture. Clicking selects it, and dragging moves it directly. A small toolbar follows the selected object, offering Move, Rotate, Duplicate and Delete. Unsupported rotation is disabled with an explanation. Covered objects can be reached with **Alt-click** or the contextual **select underneath** control. Clicking empty map space deselects.

The More menu retains Save draft, Restore previous, Preview layout, Check layout, Reset decorations and Reload draft. Error/status messages are temporary notices rather than permanent instructions or administration controls. Exiting with unsaved changes opens one focused dialog: **Save draft / Discard changes / Continue editing**.

Before and after, at the same viewport and initial office state:

- [Previous permanent panel](assets/phase02-decoration/01-editor-open.png)
- [New minimal edit mode](assets/editor-direct-manipulation/01-minimal-edit-mode.png)

## Direct manipulation

The existing Phaser scene remains the only office renderer. `DecorationOverlay` reads the current resolved object instances and the same atlas rectangles used to draw them. It lazily caches the atlas alpha channel, checks actual sprite bounds, rejects transparent pixels, and orders eligible hits by their rendered layers: desk foreground edges, directional chair images, surface/wall details, ordinary furniture and owner rugs. Floor tiles, architectural walls, markers and critical room geometry are not selectable.

Selection uses stable existing base/custom instance IDs. Alt-click cycles the painted objects beneath a point; the contextual covered-object action uses the last clicked stack. This avoids a separate selection list and large invisible hit regions.

Native pointer capture drives the ghost and footprint imperatively. Screen coordinates are converted through the host size and Phaser camera, then snapped to the existing 32px grid. The original remains rendered until a shared, fully validated commit succeeds. Invalid drops retain the original document and placement. Escape cancels the active drag before pointer-up can commit it.

Contextual controls are projected from world bounds into viewport coordinates and clamped away from the top HUD and bottom editing bar. Their positions update imperatively as the camera moves. Host geometry is cached until resize; toolbar size comes from ResizeObserver. Hover/anchor updates do not publish React state or rebuild the map. Pointer/drop/panning listeners attach only during editing and detach on exit/destruction.

Moving a desk or table also moves its attached surface accessories. Copy/delete treats those accessories as part of the same reversible operation. Stable base overrides remove the old rendered placement before adding the new one, so templates remain unchanged and moved furniture is not duplicated. Duplicate starts a pointer-attached copy, rather than placing it at an arbitrary nearby offset.

## Controls

| Desktop | Action |
| --- | --- |
| Hover / click / drag | Highlight / select / move |
| R | Rotate through authored orientations |
| Delete or Backspace | Delete selected furniture |
| Ctrl/Cmd+D | Place a duplicate |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z | Redo |
| Escape | Cancel drag/placement/selection, or close the active library/menu |
| Alt-click / select underneath | Cycle overlapping eligible objects |
| Space+drag / middle drag | Pan without moving furniture |
| Wheel | Existing camera zoom |

Touch uses tap-to-select, then drag of the selected object. Contextual buttons provide rotation, duplication and deletion. Two-finger pan/pinch cancels any tentative one-finger drag before moving the camera, so it cannot accidentally place furniture. Mobile camera buttons sit above the editing bar and its status label, including the two-row toolbar at 320px. Editor shortcuts do not run in inputs, textareas, selects, editable text or active confirmation dialogs. Avatar movement and sitting commands remain disabled while editing.

Icons use [Lucide React](https://lucide.dev/guide/react) within the existing Liquid Glass styles, with accessible labels, tooltips and focus states. No new raster assets or arbitrary sprite rotations were introduced.

## Save & Apply and safety

Save & Apply validates automatically and asks for confirmation before interrupting an occupied office. It saves the draft when needed, then publishes using the existing expected-revision checks. Every write still goes through the existing server-verified OWNER boundary and restricted persistence function. An intervening owner/base change causes a conflict; a failed publication does not silently overwrite someone else's work. A successfully saved private draft is retained if publication fails.

Success is shown before the established realtime environment-change signal retires the old room. The confirming owner then automatically reloads/rejoins the new revision; other members receive the existing reload notice. Admission still creates one canonical office authority. Live collision geometry is never changed underneath connected players. Chat persistence and voice cleanup semantics remain unchanged.

More → Restore previous uses the same interruption confirmation and existing recovery RPC. Recovery starts a fresh local undo baseline. A removed occupied chair loses its old authoritative claim when that room is retired. Four-direction seating, approaches, safe stand points and footprints continue to derive from the shared asset metadata after every accepted move/rotation and publication.

This redesign requires **no additional SQL migration**. The Phase 02 decoration schema remains a prerequisite for actual saved editing. This task neither applied nor inspected hosted migrations; fixture publication used disposable PostgreSQL only.

## Changed files

- `apps/web/src/features/decoration/decoration-editor.tsx`: compact UI, contextual actions, temporary library, confirmations, shortcuts and automatic apply/rejoin workflow.
- `apps/web/src/features/decoration/overlay.ts`: painted-pixel hit testing, hover, drag/cancel, covered selection, anchored controls and imperative ghosts.
- `apps/web/src/features/decoration/manipulation.ts` and `manipulation.test.ts`: pure hit ordering, viewport positioning and shortcut rules/tests.
- `packages/shared/src/environment/decoration.ts`: grouped move/copy/delete for support furniture and accessories; existing catalog, document format and final validators retained.
- `apps/web/src/features/office/engine/create-game.ts`, `engine/lifecycle.ts`, `scenes/office-scene.ts`, `components/office-canvas.tsx`: command bridge, pointer modifiers, native touch/pinch and context position updates.
- `apps/web/src/features/decoration/editor.css`: replaces the panel styling with compact bars/popovers/dialogs and responsive layouts.
- `scripts/test-decoration-browser.mjs`, `direct-editor-browser-scenario.mjs`, `test-office-browser.mjs`: actual direct manipulation, apply/rejoin, transparency, overlap, mobile and regression coverage.
- `scripts/test-voice-browser.mjs`: waits for its isolated browser to exit before profile cleanup; retains an ignored profile if Windows reports EPERM/EBUSY, while propagating other cleanup errors.
- `apps/web/package.json`, `apps/realtime/package.json`, `pnpm-lock.yaml`: Lucide and an explicit pin of the already-used Colyseus core version.
- `apps/realtime/src/tests/dependency-identity.test.ts`: guards that room admission and WebSocket transport use the same matchmaker singleton.
- README and this report; the Phase 02 report links to this replacement UX.

## Screenshots

Actual React/Phaser maps in the installed Brave browser, actual local Colyseus HTTP/WebSockets and isolated PostgreSQL; identity/action transport is synthetic.

1. [Minimal default editing](assets/editor-direct-manipulation/01-minimal-edit-mode.png)
2. [Selected base object and nearby controls](assets/editor-direct-manipulation/02-selected-object.png)
3. [Dragging a base object](assets/editor-direct-manipulation/03-dragging-object.png)
4. [Rotated chair](assets/editor-direct-manipulation/04-rotated-chair.png)
5. [Compact furniture library](assets/editor-direct-manipulation/05-adding-furniture.png)
6. [Invalid placement feedback](assets/editor-direct-manipulation/06-invalid-placement.png)
7. [Successful Save & Apply](assets/editor-direct-manipulation/07-successful-save.png)
8. [Mobile direct editor](assets/editor-direct-manipulation/08-mobile-editor.png)

## Validation

The redesigned flow passed direct base chair/desk/sofa editing, attached accessories, three zoom levels, transparent-pixel rejection, covered-object selection, native shortcuts, draft isolation, conflict rejection, confirmed publication, automatic owner rejoin, touch drag/pinch, sitting after reload and recovery of an occupied chair. Pointer hover/anchor movement produced zero additional React commits. Narrow 320px and 390px touch layouts were exercised.

| Check | Result |
| --- | --- |
| `pnpm.cmd lint` | Passed, zero warnings |
| `pnpm.cmd typecheck` | Web and realtime passed |
| `pnpm.cmd test` | 223 passed: web 164, realtime 59; no failures/skips |
| `pnpm.cmd build` | Realtime and web passed; web rebuilt successfully after the final mobile spacing adjustment |
| Decoration and environment database tests | 2 passed against disposable local PostgreSQL; no hosted data |
| Browser regression suites | 9 distinct suites passed across the full run and targeted editor/voice rechecks; zero skips |
| Screenshot review | Eight requested states captured; before/after compared at 1440×1000 |
| Privileged client bundle scan | No admin/decoration secret variable names or decoration write RPC names in generated browser JavaScript |

Local test logs are in ignored `.cache/editor-redesign-*-final.log`. Browser scenarios use the installed Brave browser with isolated profiles, actual React/Phaser and local Colyseus. Decoration persistence/permissions use actual PGlite PostgreSQL with synthetic verified identities and an action bridge. Voice/media tests simulate the SDK; no hosted Auth, physical audio, or production tenant acceptance is implied.

Browser suites covered direct editing, four-direction seating, authoritative movement/seating, engine rendering/collisions/camera, environment editing, proximity, chat, communication composition and voice UI. The final editor/voice command passed both suites (`.cache/editor-redesign-browser-recheck-final.log`); the final rebuilt mobile screenshot has separated camera and editing controls.

Adding the icon dependency exposed stale Colyseus peer links: the room and transport resolved different physical instances of core 0.18.21, causing valid reservations to appear expired. The existing core version is now explicitly declared, dependency links were repaired from the frozen lockfile, and a singleton-identity regression was added. No transport authentication checks were relaxed. A Windows native-file lock also left Tailwind metadata incomplete; missing metadata was restored from integrity-verified cached package files without replacing the loaded binary, then generated production caches were cleared and the build passed.

The nine-suite browser run initially reported eight passes and one voice failure after all voice assertions had succeeded: Windows blocked deletion of that test's isolated profile. Cleanup now waits for browser exit and safely retains a locked ignored profile. The initial mobile camera-spacing recheck also used the previous compiled stylesheet; the web was rebuilt before the final targeted recheck. Neither issue was hidden by relaxing a behavior assertion.

## Manual review and limits

### Follow-up: unresponsive confirmation buttons

The native editor dialogs inherited `pointer-events: none` from the HUD/panel host. This left their visible Apply, Cancel and unsaved-exit buttons unable to receive real pointer clicks. `.editor-dialog` now explicitly enables pointer events while preserving native modal focus and background blocking. Save/publish authorization and persistence are unchanged.

The browser scenario now dispatches real mouse input for dialog buttons instead of calling their DOM `click()` method. Before the fix, it failed because a dialog button computed `pointer-events: none`; the original programmatic clicks had bypassed this browser hit-testing failure. After the fix, the web build (including TypeScript) and full direct-editor scenario passed, with physical pointer clicks for Continue editing, Cancel, Apply and reload, Save draft and Discard changes. Successful publication and safe owner/member rejoin were verified against isolated local PostgreSQL/Colyseus, with synthetic identity/action transport. Logs: `.cache/editor-dialog-before-fix.log`, `.cache/editor-dialog-build.log`, `.cache/editor-dialog-after-fix.log`. Hosted user acceptance remains unverified.

1. With the existing Phase 02 schema configured, enter the office as an active verified organization OWNER and click Edit. Members/ADMIN users should have no edit action and cannot persist through the server actions.
2. Hover and drag an existing chair, desk or sofa. Try rotating the chair with R, copying with Ctrl/Cmd+D, deleting and undoing. A desk's accessories should follow it.
3. Add → search → choose → click the map. The library should close and the new object should immediately have contextual controls. Try a wall/door/spawn obstruction and Escape during a drag.
4. Save & Apply → review the connected-user warning → Apply and reload. Confirm that the owner rejoins automatically, other members receive a reload notice, only one office authority remains and moved/new chairs still support safe sit/stand.
5. Use More for drafts/recovery. Exercise the three unsaved-exit choices and concurrent-owner revision conflicts. On touch, tap then drag, rotate through the nearby button and use two fingers to navigate.

Known limits:

- Real hosted Supabase owner/member acceptance and physical touchscreen/audio acceptance were not performed. Browser identity/action/media fixtures remain explicitly separate from real-user acceptance.
- Rotation supports only native authored orientations. Current four-direction assets are chairs; desks, tables, sofas and other single-view artwork retain their valid view.
- Architecture, voice zones, generated base rug/sign dimensions and passage geometry remain outside this furniture editor. Owner-added rugs remain editable nonblocking objects.
- Initial object discovery uses pointer/touch; selected objects then support keyboard shortcuts and accessible contextual buttons. There is no arbitrary wall construction, freeform resize or multi-object marquee tool.
- Save & Apply retains the controlled reload transition. A live voice call is cleaned up during publication; it is not carried across a changed collision map.
