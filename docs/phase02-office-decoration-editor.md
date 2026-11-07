# Phase 02 — In-game Office Decoration Editor

The original panel UX below has been replaced by the [compact direct-manipulation redesign](office-editor-direct-manipulation.md). Persistence, authorization and the additive migration described here remain in use.

Implemented locally in the existing checkout, 6 November 2026. No Git commands, branch changes, commits, pushes, merges, deployments, environment credential changes or hosted tenant writes were performed for Phase 02. The migration below was exercised only in disposable in-memory PostgreSQL.

## Architecture

The editor extends the existing environment system through a version-1 customization document. `composeOfficeEnvironment` delegates to the existing modular composer, then applies object overrides through `composeDecoratedEnvironment`. Phaser and Colyseus import this identical shared implementation. The base environment catalog, architectural maps and authored atlas allocations remain unchanged.

`OfficePage` uses the existing authenticated, active organization membership to expose **Edit office** only to OWNER users. The action is inside the office HUD. The editor panel uses the HUD's existing panel container; it is not a separate dashboard or renderer. Members continue using the published furniture.

Opening the editor preserves the current Phaser game, Colyseus connection, chat owner and voice owner. Movement intent becomes zero and contextual seating input is disabled. Draft furniture is rendered by replacing the existing scene's Furniture/Details visual layers and seating overlays. The live Collision layer, authoritative geometry, player position and seat reservations stay unchanged. Closing restores the original published visuals and gameplay controls.

Native pointer capture handles dragging and panning. Screen coordinates are converted through the host's actual size and `camera.getWorldPoint`, then snapped to the 32px grid. A ghost image, collision outline and hint update imperatively inside Phaser. React receives selection and committed placement events, not pointer-frame positions. Full map validation runs at a committed edit, explicit Validate, Save draft and Publish; dragging uses a bounded local footprint check. Native desktop asset drops and touch-to-place share the same commit path.

## Data model

```json
{
  "version": 1,
  "objects": [{
    "id": "custom/00000000-0000-4000-8000-000000000001",
    "assetId": "chairTask",
    "x": 864,
    "y": 736,
    "orientation": "left"
  }],
  "removed": []
}
```

New objects use UUID instance IDs. Composer-owned objects have a stable `base/<room>/<asset>/<authored-x>:<authored-y>` identity; moving one preserves that identity in its override. Removed base instances are tombstoned rather than deleting catalog definitions. Object dimensions, layer/depth, collision footprint, interaction radius, seating slots and anchors are derived from the trusted asset registry, never accepted as client-authored definitions. Published revision metadata participates in the shared map fingerprint, including rollback/reset publications.

The document allows at most **160 overrides/additions**, 512 base tombstones, a 65KB action envelope and 60 local undo steps. The client cannot submit external asset URLs, arbitrary layers, collision shapes, seat anchors, unknown keys or unsupported orientations.

## Asset and placement rules

- The searchable browser includes **106 existing authored assets**, including workstations, chairs, tables, sofas, benches, storage, reception, meeting, pantry, plants, electronics and wall decorations, plus the existing runner/grid rug treatments. Categories without corresponding artwork are not invented.
- Thumbnails reuse the existing theme atlas and browser image cache. Dimensions and blocking/surface/wall/floor placement mode are displayed.
- Chairs rotate among native UP/DOWN/LEFT/RIGHT artwork. Assets without authored directional variants, including compound desks, tables, sofas and benches, keep their authored orientation; Rotate is disabled.
- Blocking furniture must fit within the office and avoid other furniture, architecture, protected door clearance and corridor lanes.
- Wall decorations require a clear existing architectural wall. They cannot create/remove architectural partitions or change voice privacy boundaries.
- Small accessories require a clear top-row surface of a supported desk, shared workstation bench, table, reception counter or pantry counter. They cannot be placed on chair areas or left floating after their support is moved/removed. Move/remove accessories first when rearranging their supporting furniture.
- Owner-added rugs remain nonblocking, render below furniture, and must stay on interior floor. Existing composer-generated rugs, signs and passage treatments remain controlled by the base environment settings rather than arbitrary resizing in this editor.
- All walkable floor must remain connected to the entrance. Spawn/body clearance, room access markers, essential circulation, reachable meeting zones and approaches to furniture are checked. Every derived seat needs its expected slot count, a reachable validated approach, a clear path into the chair footprint and a safe stand anchor.

Changes that fail validation show a useful error and leave the draft unchanged. The green/red ghost is an immediate footprint hint; final shared validation remains authoritative.

## Persistence, authorization and publishing

Migration: [`20261105000100_office_decorations.sql`](../supabase/migrations/20261105000100_office_decorations.sql).

| Structure | Purpose |
| --- | --- |
| `public.office_decoration_settings` | Published document, optimistic edit revision, published revision, base revision, last editor/time; member-scoped SELECT through RLS |
| `private.office_decoration_drafts` | Shared owner draft, base association and previous publication for recovery; no direct browser grants |
| `load_office_decoration_draft` | Verified active OWNER-only access to the draft/recovery record |
| `write_office_decoration` | Server-only, fixed-search-path persistence function; locks office, organization and owner membership, rechecks current authorization and expected revisions |

Normal browser JWTs, including an owner's JWT, have **no execute grant on the write function** and cannot write the tables directly. Next Server Actions verify the cookie-backed user and owner RPC, load the current base through user-scoped RLS, validate with the shared composer, then call the restricted write RPC through a server-only Supabase secret-key client. The SQL function independently rechecks the trusted actor's confirmed account and current active OWNER membership under locks. The SQL payload allowlist is tested for exact parity with the shared catalog.

The server key must belong to the exact `NEXT_PUBLIC_SUPABASE_URL` project. Optional dedicated settings are `OFFICE_DECORATION_SUPABASE_URL` and `OFFICE_DECORATION_SUPABASE_SECRET_KEY`. Otherwise the matching existing `PLATFORM_DATA_SUPABASE_URL`/`PLATFORM_DATA_SUPABASE_SECRET_KEY` pair is used; the legacy generic server pair is eligible only if it matches the workspace project. The independent super-admin identity database is not used. Local inspection found a matching tenant-data pair and a different generic admin project; no secret values were printed or changed. Existing platform administrator read-only gateway behavior is unchanged.

**Save draft** increments the edit revision while leaving the published document and published map version unchanged. **Publish** requires an identical saved draft for the same base revision and expected edit revision. A concurrent owner save, membership change or base change causes a conflict/denial instead of overwriting another owner's work. The panel displays unsaved changes, warns before discarding or leaving, and offers explicit reload/review.

Publishing persists the new authoritative configuration. The existing realtime environment polling detects the new fingerprint within a few seconds, disconnects the old room with the established environment-change code, releases seat claims and voice resources, and asks clients to reload/rejoin. Admission remains serialized per office; the new room is created with the new map and safe spawn, and mismatched client maps cannot join. Geometry is never hot-swapped underneath avatars. Chat persistence remains independent of the room.

**Restore previous** validates the prior publication against the current base and publishes it as a new revision; it does not decrement revision counters. One previous publication is retained. To change the modular base while decorations are published, explicitly **Reset decorations → Save draft → Publish** first. A database trigger prevents silently discarding a nonempty published overlay through the existing base environment settings. Saved drafts from an older base stay in storage, but the editor starts from the current publication and requires review/save against the new base.

## Created and modified files

- Shared: `packages/shared/src/environment/decoration.ts`, `decoration-database.ts`.
- Editor: `apps/web/src/features/decoration/decoration-editor.tsx`, `overlay.ts`, `editor.css`, `actions.ts`, `service.ts`, `writer.ts`, `writer-config.ts`, `decoration.test.ts`.
- Existing integration: office route, `office/access.ts`, `office-experience.tsx`, `office-canvas.tsx`, `engine/create-game.ts`, `engine/lifecycle.ts`, `scenes/office-scene.ts`, `app/globals.css`; realtime `environment/maps.ts` and its tests.
- Migration: the additive SQL file linked above.
- Test harnesses: `scripts/test-decoration-browser.mjs`, `decoration-database.test.mjs`, `unused-decoration-fixture.mjs`; existing browser fixtures explicitly isolate unused editor Server Actions and permit the new shared engine modules.
- Setup/docs: `apps/web/.env.example`, root package scripts, README and this report. Ignored real environment files and credentials were not changed.

## Screenshots

Captured from actual local React/Phaser clients in installed Brave, with actual local Colyseus and isolated PostgreSQL. Identity/action transport is synthetic; these are not hosted Supabase-user acceptance captures.

1. [Editor open](assets/phase02-decoration/01-editor-open.png)
2. [Searchable asset library](assets/phase02-decoration/02-asset-library.png)
3. [Ghost placement and footprint](assets/phase02-decoration/03-ghost-placement.png)
4. [Selected furniture controls](assets/phase02-decoration/04-selected-controls.png)
5. [Invalid placement feedback](assets/phase02-decoration/05-invalid-placement.png)
6. [Published office and usable added chair](assets/phase02-decoration/06-published-office.png)
7. [Mobile editor with office still visible](assets/phase02-decoration/07-mobile-editor.png)

## Validation

Final results on 6 November 2026:

| Check | Result |
| --- | --- |
| Workspace lint with zero warnings | Passed |
| Web and realtime TypeScript | Passed |
| Web production and realtime builds | Passed |
| Web unit tests | 160 passed, zero failed/skipped |
| Realtime unit tests | 58 passed, zero failed/skipped |
| New decoration and existing environment SQL suites | 2 passed in isolated PostgreSQL |
| Brave decoration editor | Passed, including recovery of an occupied added chair |
| Brave directional seating, movement/mobile, Phaser engine, environment editor, proximity, chat and voice UI | 7 passed |
| Brave communication composition | Passed after fixing inactive editor listener ownership |
| Seven requested screenshots | Captured and visually inspected |
| Privileged editor credential identifiers/write RPC in client bundles | None found |

All **218 unit tests**, both SQL suites and **9 distinct Brave suites** passed. The first combined Brave run passed 8/9 and detected a second pointer-move listener while the editor was closed. Editor pointer/drop handlers now attach only during active editing and detach on close/destroy; the unchanged communication assertion then passed. The editor rerun additionally verified that restoring the previous publication resets local undo history and releases the old authority's occupied custom-chair claim. These final two browser suites passed together with no runtime errors. No test assertions were relaxed to accept duplicate listeners.

The new Brave flow passed actual isolated SQL draft/publication, owner/member access, a second-owner revision conflict, combined search/category filters, pointer movement at three zoom levels, native asset drops, preview panning, undo/redo, invalid placement, retained transports, safe two-client room retirement/rejoin, matching client/server fingerprints and sitting in an added chair after reload. Mobile inspection confirmed no horizontal overflow and an editor drawer below half the viewport while the world stays visible. Selected asset colors were corrected after screenshot inspection to retain readable text in dark mode.

The browser used the installed Brave executable with SwiftShader software WebGL. Existing automatic Solid HUD fallback and explicit Liquid Glass behavior passed; these timing samples are not a physical GPU/mobile performance benchmark or proof of 60fps. Identity/action transport and media remain synthetic, while local SQL, Phaser rendering and Colyseus HTTP/WebSockets are real.

Logs: `.cache/phase02-lint-final.log`, `phase02-typecheck-final.log`, `phase02-build-final.log`, `phase02-unit-final.log`, `phase02-database-final.log`, `phase02-brave-final.log` and `phase02-brave-corrections.log`. The combined browser log retains the initial listener failure; the corrections log records the successful communication/editor rerun.

The unit suite covers all 75 balanced layout/style/theme compositions with an added owner chair, all four seat directions, anchors, safe standing, allowlisted payloads, blocked spawn/doors/corridors, overlaps, accessory support, nonblocking rugs, history, credential project matching, optimistic persistence, migration rollout versus outages and published-only realtime resolution. Existing environment tests retain their broader 10,800 configuration coverage.

The SQL suite uses actual disposable PostgreSQL via PGlite to exercise grants/RLS, confirmed active owners, ADMIN/MEMBER denial, anonymous denial, cross-tenant isolation, private drafts, concurrent revision rejection, saved-draft publication, recovery, stale-base rejection and the base-change guard. No remote migration is applied by these tests.

## Local activation and manual acceptance

1. Review and apply the additive migration **only to your intended local/disposable Supabase database** through your normal migration workflow. Do not reset existing data. This task does not apply it to hosted Supabase; before application the app retains the existing published office and reports editor setup as unavailable.
2. Confirm a matching server-only tenant secret key as described above. Do not copy a secret into a `NEXT_PUBLIC_*` variable. Restart local web/realtime after source/config changes; use one dev server per app to avoid the previous port/lock conflict.
3. Sign in as a verified active organization OWNER at `/workspace/<organizationId>/office`. Open **Edit office**, search/select an asset, place it on the grid, drag existing furniture, rotate a chair, duplicate/remove, undo/redo and use camera pan/zoom. Keyboard users can choose an existing object in the selector and use the move buttons. Mobile users can choose an asset and tap the map, with the compact panel below it.
4. Attempt a doorway/wall/spawn obstruction and verify feedback and unchanged draft. Move a desk accessory away before moving its support. Validate, Save draft, and confirm another member still sees the old office.
5. With another OWNER open, save a competing edit and confirm conflict/reload behavior. Publish only the reviewed saved draft. Both clients should receive a reload notice, rejoin a single new authority and see the same decorated office. Sit/stand in moved/new chairs; check voice privacy and normal walking/Shift-to-Run.
6. Test Restore previous, cancellation/unsaved warnings, and mobile/reduced-motion/keyboard interaction. A MEMBER or ADMIN should see no Edit office action, and direct editor actions should be denied.

Local commands:

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd build
pnpm.cmd test
pnpm.cmd test:decoration:database
$env:OFFICE_TEST_BROWSER='C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'
pnpm.cmd test:decoration:browser
```

## Known limitations and remaining activation

- The hosted migration is intentionally **not applied** under the local-only scope. Real hosted owner/member acceptance, physical touchscreen acceptance and actual microphone/audio verification remain outstanding. Synthetic authorization is not claimed as real Supabase login acceptance.
- Rotation uses authored chair variants only. Architecture, voice zones, base signs/passage treatments and generated rug dimensions remain base-controlled. There is no arbitrary sprite rotation, wall construction or external asset import.
- Publication uses the established safe reload/rejoin transition; it does not retain a live voice call across geometry revisions. Privacy and cleanup take precedence during that transition.
- History is bounded and local to the open editor. One previous publication is recoverable while its base revision matches; this is not an unlimited revision-history browser or automatic stale-draft merge.
- Supporting furniture with accessories must be rearranged in a safe sequence. Group selection/moving, freeform sub-tile placement and resizable furniture are not included.
