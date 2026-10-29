# Modular office environments

Implemented 29 October 2026. Working-tree changes only: no branch creation, commits, pushes, merges, deployment or remote database migration.

## What changed

The previous renderer loaded one 36 x 26 Tiled map (`studio.json`), a 512 x 256 atlas and the avatar sheet. Floor, Architecture and Furniture supplied visual tiles; a binary Collision layer supplied both Phaser and Colyseus movement geometry. Markers supplied spawn/camera areas and VoiceZones supplied the Meeting Room voice boundary. The server previously shared that one map across all offices.

The new environment system composes a 38 x 30 map from reusable room modules, a layout, a palette, decor and furniture rules, and bounded owner overrides. The original map, atlas and avatars remain unchanged for migration compatibility. Phaser movement, camera and avatar code are reused. No dependency was added.

| Structure | Location and responsibility |
| --- | --- |
| Versioned catalog and `EnvironmentConfig` | `packages/shared/src/environment/catalog.ts`; allowlisted IDs and canonical validation |
| Shared composer | `packages/shared/src/environment/compose.ts`; Tiled layers, props, collisions, markers, voice zone and configuration metadata |
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

Every layout contains reception, workstations, a meeting room, lounge, pantry/coffee corner and a collaboration/training area. Boards, bookshelves, storage, plants, lamps, rugs and a company wall add office detail. Themes recolor the original artwork; furniture sets arrange the existing furniture differently. A coffee corner and ceramic planter variation extend the atlas. Placement rules reject overlapping furniture and retain clear circulation routes. Rugs and signage are nonblocking paint.

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

**Activation:** review and apply the migration through the project's normal Supabase migration workflow, and deploy matching web and realtime builds together. The migration has been tested locally but has not been applied to a remote database by this task. Before it is installed, web and realtime explicitly retain the legacy map; the owner page permits preview but disables saving and explains setup. A present but corrupt configuration or dependency outage fails visibly instead of silently replacing a customized office with a default.

No backfill of thousands of maps or rows is needed. Once the migration exists, an office with no settings row uses the new default composition; its first save creates revision 1. Existing office/organization records and permissions are not rewritten.

## Performance and extension points

Composition is deterministic, linear in a small fixed grid, and runs on entry or configuration checks rather than animation frames. Phaser still renders three tile layers, with small static rug/sign graphics. Only the selected 512 x 256 themed atlas and existing avatar sheet are needed in the game; the five PNG atlases total about 21 KB compressed. The preview caches at most the five theme images. Realtime retains at most 128 short-lived cached office maps and polls only occupied rooms. Equivalent React configuration objects keep the existing renderer/network owner rather than remounting it.

The exhaustive 10,800-recipe/fingerprint validation took about 3.5 seconds locally including composition and hashing; that is not an FPS or hosted load benchmark.

Initial layouts use a six-module floor-plan grid and predefined placement slots. This is not a drag-and-drop map editor or uploaded-asset system. Add layouts and content by extending the registry, placement modules and atlas generator. Expand the SQL allowlists in a versioned migration and extend tests alongside catalog changes. Future versions can add new prop modules, room shapes, palettes or a content-authoring pipeline. Hot-applying visual-only changes without reconnecting is a future extension; the initial implementation deliberately uses safe room replacement for every applied setup.

## Validation

- Web production build and realtime TypeScript build: passed.
- Recursive ESLint and TypeScript checks: passed.
- Web tests: 110 passed. Realtime tests: 30 passed, including real local HTTP/WebSocket tenant selection, collision, room rotation, active-room apply polling and outage behavior.
- All 225 base configurations: sealed boundaries, connected area markers, valid spawn and Meeting Room voice-zone checks.
- All 10,800 configurations: distinct visible recipes and distinct consistency fingerprints.
- Local in-memory PostgreSQL migration/policy test: passed for persistence, owner enforcement, direct-write denial, tenant isolation, suspended access, malformed settings and stale revisions.
- Production auth/readiness/voice routes: 13 passed, including anonymous denial on the new owner route.
- Browser suites: editor/environment, chat, HUD composition, Phaser movement/collision/camera and voice each passed. The standalone engine fixture's allowlist was extended for the three new shared modules; its original assertions remain intact.
- New editor browser coverage: five layout/theme previews, saved setup/revision, conflict and denial feedback, 390px layout, two actual configured Phaser maps, wheel/fit controls, equivalent-prop stability, one active transport, no legacy map fetch for a configured office, and zero runtime errors.

Browser fixtures use actual UI/Phaser components with synthetic persistence, identity and transport. SQL uses isolated in-memory PostgreSQL; transport tests use real local HTTP/WebSockets with synthetic authorization. These are not hosted Supabase/LiveKit or physical-phone acceptance tests. No remote database or real user data was changed.

## Screenshots

- [Owner editor, desktop](assets/modular-office/owner-desktop.png)
- [Owner editor, mobile](assets/modular-office/owner-mobile.png)
- [Training Hub / Eco Green / Rich / Collaborative](assets/modular-office/training-eco.png)
- [Corporate HQ / Dark Tech / Rich / Executive](assets/modular-office/corporate-dark.png)
- [Configured office, mobile](assets/modular-office/office-mobile.png)

Useful commands: `pnpm assets:office`, `pnpm test`, `pnpm test:environment:database`, `pnpm test:environment:browser`, `pnpm test:communication:browser`, `pnpm test:office:browser`.
