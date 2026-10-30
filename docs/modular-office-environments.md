# Modular office environments

Implemented 29 October 2026. Working-tree changes only: no branch creation, commits, pushes, merges, deployment or remote database migration.

## What changed

The previous renderer loaded one 36 x 26 Tiled map (`studio.json`), a 512 x 256 atlas and the avatar sheet. Floor, Architecture and Furniture supplied visual tiles; a binary Collision layer supplied both Phaser and Colyseus movement geometry. Markers supplied spawn/camera areas and VoiceZones supplied the Meeting Room voice boundary. The server previously shared that one map across all offices.

The environment system composes a map from reusable room modules, a layout, a theme, decor and furniture rules, and bounded owner overrides. The architectural upgrade provides seven or eight bounded room modules per layout, stepped building footprints, corridors and explicit doorways. Plans occupy grids from 51 x 40 to 55 x 45, with Corporate HQ and Co-working Space using 47 rows. Asset expansion adds original themed content; the corridor pass adds six further assets and protected passage decoration recipes, for 118 registered fixtures/structural entries in total. The original legacy map, atlas and avatars remain unchanged for migration compatibility. Phaser movement, camera and avatar code are reused. No dependency was added. See the [corridor decoration report and current gallery](office-passage-decoration.md); the [asset expansion](office-asset-expansion.md), [architectural report](office-architecture-upgrade.md) and [Phase 2 report](office-environment-phase2-validation.md) record earlier stages.

| Structure | Location and responsibility |
| --- | --- |
| Versioned catalog and `EnvironmentConfig` | `packages/shared/src/environment/catalog.ts`; allowlisted IDs and canonical validation |
| Shared composer | `packages/shared/src/environment/compose.ts`; Tiled layers, props, collisions, markers, voice zone and configuration metadata |
| Floor plans | `packages/shared/src/environment/plans.ts`; dimensions, room footprints and enclosures for each layout |
| Architectural kit | `packages/shared/src/environment/architecture.ts`; room boundaries, wall/corner materials, thresholds, jamb vestibules and protected approaches |
| Room programs and fixtures | `packages/shared/src/environment/rooms.ts`; reusable furniture/prop programs and non-overlapping atlas regions |
| Expanded asset registry | `packages/shared/src/environment/assets.ts`; categories, drawing families, support/collision modes, deterministic atlas packing and bounded atlas metadata |
| Passage recipes | `packages/shared/src/environment/passages.ts`; clear lanes, doorway/spawn buffers, connected passage components, context-aware wall/edge props and runners |
| Shared visual rules | `packages/shared/src/environment/visuals.ts`; nonblocking rugs and company wall |
| Typed database contract | `packages/shared/src/environment/database.ts`; narrow table/RPC types |
| Saved settings | `public.office_environment_settings`; one row per office with JSON configuration, revision, timestamp and author |
| Owner write RPC | `public.save_office_environment`; verified active OWNER only, locked permission checks and optimistic concurrency |
| Web service and editor | `apps/web/src/features/environment/`; load/save, action, static preview and responsive controls |
| Owner route | `/workspace/[organizationId]/environment`; linked from the workspace only for OWNER |
| Authoritative map adapter | `apps/realtime/src/environment/maps.ts`; caller-scoped Supabase reads and bounded per-office cache |
| Runtime | OfficePage passes saved configuration through OfficeExperience/OfficeCanvas into Phaser; admission and each Colyseus room use the same composer |
| Assets | `scripts/generate-environment-assets.mjs` and five small atlases under `apps/web/public/office/environments/` |

Catalogs are code-owned content registries, rather than mutable catalog tables. Saved office configuration is persisted in Supabase. This keeps the initial content version, tile semantics and collision rules identical across both deployed runtimes.

## Initial content

| Type | Entries |
| --- | --- |
| Layouts | Open Office, Corporate HQ, Startup Office, Co-working Space, Training Hub |
| Themes | Warm Wood Corporate, Modern Minimal Light, Scandinavian Neutral, Dark Tech Office, Eco Green Office |
| Decor | Minimal, Balanced, Rich |
| Furniture arrangements | Standard, Executive, Collaborative |
| Accent override | Ocean, Forest, Clay, Plum, Gold, Teal, Rose, Slate |
| Rug override | Bare floor, Woven runner, Geometric rug |
| Planter override | Terracotta, Ceramic |
| Company wall | Optional plain text, up to 32 Unicode characters; defaults to YOUR TEAM |

There are **5 x 5 x 3 x 3 = 225 base combinations**. Independent accent, rug and planter choices produce **225 x 8 x 3 x 2 = 10,800 configurations**. Custom company text is additional and is not counted in that total. An exhaustive test hashes visible recipes, excluding the configuration metadata, and confirms all 10,800 are distinct. All 10,800 runtime consistency fingerprints are also distinct in this catalog. No map file is generated for each combination.

Every layout contains reception, workstations, a meeting room, lounge, pantry/coffee corner, a collaboration/training area and an enclosed print/storage room. Corporate HQ and Co-working Space also include a private office. Full walls, low screens, glazing, rotated corner pieces and explicit thresholds define the rooms; nonrectangular wings provide reading/waiting alcoves. Themes retain distinct oak, stone, herringbone, raised-panel and bamboo floors and add architectural treatments such as planted screens and technical glazing. Standard desks, executive return desks and collaborative benches have different footprints and artwork. The asset pipeline calls `scripts/polish-environment-art.mjs` and `scripts/architecture-art.mjs` for original integer-pixel artwork, including printers, filing cabinets, water dispensers and espresso counters. Placement rules reject overlaps and protect doorway approaches. Rugs and signage remain nonblocking paint.

## Owner flow

From the workspace, choose **Customize office environment**. Select layout, theme, decor and furniture; expand **Personalize the details** for accent, rug, planters and wall sign. The preview updates before saving. It uses the same map, atlas and visual rules as the game, with a static Canvas2D renderer. It does not create Phaser, a multiplayer connection or microphone access.

**Save and apply office setup** stores the complete validated configuration and expected revision through the owner RPC. Concurrent edits produce a clear reload/review message; members and admins cannot save. The editor retains unsaved selections on errors. All fields are controlled, and native form reset is prevented so completed actions cannot make selectors disagree with the preview or saved setup.

Applying a setup changes the shared office for all members. Active rooms check for changes every five seconds while occupied; fresh admission always bypasses the short cache. A changed room closes with the dedicated environment-change code (4052), releases its claims and voice membership, and prompts clients to **Reload office**. The next room uses the new authoritative geometry. Avatars respawn safely; voice requires an explicit join again. Another tenant's room stays connected.

Geometry is never replaced beneath connected avatars. Existing chat history uses the same office/channel identity and remains persisted; sending pauses while disconnected. In-memory unsent drafts remain visible until the page is reloaded and are not persisted across reloads. Finish/copy an unsent draft before reloading.

## Persistence, safety and rollout

The additive migration is `supabase/migrations/20261029000100_office_environments.sql`.

- Member SELECT is governed by active-organization membership RLS. Other tenants and suspended organizations cannot read settings.
- Direct client INSERT/UPDATE/DELETE are revoked. Only the verified active organization OWNER can call the write RPC successfully. ADMIN deliberately cannot customize environments.
- Office, organization and owner membership are locked before revision comparison and save. SQL validates version, exact keys, catalog IDs, override IDs and branding text. Tenant IDs, revision and author cannot be assigned through the configuration JSON.
- No external asset URLs, HTML, uploaded code or arbitrary coordinates are accepted.
- Realtime authorizes the caller before loading or disclosing map consistency errors. It uses the existing publishable key plus caller bearer and RLS; no new privileged key is introduced.
- The selected geometry is pinned to each room. Dependency failures never substitute a different map into an active room. Existing auth leases still apply.
- Legacy map fingerprints remain unchanged. Modular maps use a wider two-word consistency fingerprint, including generated layers and canonical configuration metadata. This is a consistency check, not authorization.

**Activation:** Phase 2 read-only checks confirmed the environment table, owner RPC, RLS policy and access restrictions exist in the configured development database. This task did not apply a remote migration or change tenant records. The CLI migration history does not list `20261029000100` remotely even though these objects exist; reconcile that discrepancy through the project's normal migration workflow before deployment, without blindly reapplying SQL. Matching web and realtime builds must be released together when deployment is authorized. Before the schema is installed, web and realtime explicitly retain the legacy map; the owner page permits preview but disables saving and explains setup. A present but corrupt configuration or dependency outage fails visibly instead of silently replacing a customized office with a default.

No backfill of thousands of maps or rows is needed. Once the migration exists, an office with no settings row uses the new default composition; its first save creates revision 1. Existing office/organization records and permissions are not rewritten.

## Performance and extension points

Composition is deterministic and runs on entry or configuration checks rather than animation frames. Structural arrays are cached privately for the finite 25 layout/theme pairs and copied before furnishing; returned maps cannot mutate that cache. Passage recipes are cached per shell/layout/theme/decor/planter combination; they protect central lanes and reject props that disconnect remaining passage tiles. Phaser renders four visible tile layers, including Details for nonblocking mounted/desktop props, with small static rug/sign graphics. Only the selected 512 x 1024 themed atlas and existing avatar sheet are needed in-game; the five PNG atlases total 105,707 bytes after the corridor pass. The preview caches at most the five theme images. Realtime retains at most 128 short-lived cached office maps and polls only occupied rooms. Equivalent React configuration objects keep the existing renderer/network owner rather than remounting it.

Exhaustive validation still checks all 10,800 visible recipes and consistency fingerprints. Its runtime varies with concurrent builds and browser work; it is not an FPS or hosted load benchmark.

Layouts compose bounded room cores, optional rectangular wings and explicit hall rectangles; furniture uses predefined slots. This is not a drag-and-drop map editor or uploaded-asset system. Add content through the room programs, floor-plan definitions and atlas generator, retaining the perimeter, door and connectivity tests. New owner-selectable catalog IDs require matching SQL allowlists in a versioned migration. The current upgrade reuses all existing saved IDs and requires no schema migration. Hot-applying visual-only changes without reconnecting remains a future extension; applying a setup uses safe room replacement.

## Validation

- Web production build and realtime TypeScript build: passed.
- Recursive ESLint and TypeScript checks: passed.
- Web tests: 122 passed. Realtime tests: 32 passed, including real local HTTP/WebSocket tenant selection, collision, room rotation, active-room apply polling and outage behavior, plus authoritative doorway traversal, clear passage routes and corridor-prop collisions across all 225 layout/theme/decor/furniture recipes.
- All 225 base configurations: sealed boundaries, every walkable tile connected to spawn, reachable approaches to placed furniture, valid markers and Meeting Room voice-zone checks.
- All 10,800 configurations: distinct visible recipes and distinct consistency fingerprints.
- Local in-memory PostgreSQL migration/policy test: passed for persistence, owner enforcement, direct-write denial, tenant isolation, suspended access, malformed settings and stale revisions.
- Production auth/readiness/voice routes: 13 passed, including anonymous denial on the new owner route.
- Browser suites: editor/environment, chat, HUD composition, Phaser movement/collision/camera and voice each passed. The standalone engine fixture's allowlist was extended for the three new shared modules; its original assertions remain intact.
- Editor browser coverage: five layout/theme previews, saved setup/revision, conflict and denial feedback, 390px layout, five actual configured Phaser maps, 44 bidirectional doorway probes, 30 decorated passage route traversals, corridor prop and solid/glass/low wall collisions, wheel/fit controls, equivalent-prop stability, one active transport, no legacy map fetch for a configured office, and zero runtime errors.

Browser fixtures use actual UI/Phaser components with synthetic persistence, identity and transport. SQL uses isolated in-memory PostgreSQL; transport tests use real local HTTP/WebSockets with synthetic authorization. These are not hosted Supabase/LiveKit or physical-phone acceptance tests. No remote database or real user data was changed.

## Screenshots

Current five-layout gallery, corridor close-up and responsive screenshots: [corridor decoration](office-passage-decoration.md#screenshots). Earlier captures are preserved in the [asset expansion](office-asset-expansion.md#screenshots), [architectural upgrade](office-architecture-upgrade.md#screenshots), [Phase 2 report](office-environment-phase2-validation.md#screenshot-gallery) and historical Phase 1 links below.

- [Owner editor, desktop](assets/modular-office/owner-desktop.png)
- [Owner editor, mobile](assets/modular-office/owner-mobile.png)
- [Training Hub / Eco Green / Rich / Collaborative](assets/modular-office/training-eco.png)
- [Corporate HQ / Dark Tech / Rich / Executive](assets/modular-office/corporate-dark.png)
- [Configured office, mobile](assets/modular-office/office-mobile.png)

Useful commands: `pnpm assets:office`, `pnpm test`, `pnpm test:environment:database`, `pnpm test:environment:browser`, `pnpm test:communication:browser`, `pnpm test:office:browser`.
