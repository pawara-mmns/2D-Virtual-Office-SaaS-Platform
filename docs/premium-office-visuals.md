# Premium office visual overhaul

## Audit before changes

The playable renderer is Phaser with nearest-neighbor sampling and rounded camera pixels. Shared deterministic composition supplies both Colyseus collision and the Canvas2D preview. Five layouts, five themes, three decor densities, three furniture sets and owner accents/rugs/planters provide 10,800 configurations. The current 512×1024 atlas holds legacy art, 92 expanded definitions and native directional chairs. Live decoration updates preserve object identities and update sprites/collision in place.

The supplied reference has much stronger separation between dark fabrics, warm wood, bright trim and foliage, luminous fixtures, deeper furniture shading and deliberate clusters of room furnishings. The existing render is considerably flatter: narrow tonal ranges, plain monitor faces, repetitive circular foliage, simple rectangular cushions, thin shelving details, largely unlit walls and wide empty margins. Architecture and connected circulation are already substantially developed; replacing them with an illustration would lose working gameplay.

Constraints: a native 32-pixel cell and 64-pixel workstation cannot reproduce all the reference's fine detail at overview zoom. Existing asset and base-object identities must remain valid for saved owner overrides. Added furniture must pass the same doorway, seating and circulation rules. Cosmetic light must never alter authoritative collision, voice geometry or map revisions. No screen-sharing capability is implied by display art.

## Implemented art direction and assets

Native 32-pixel cells, consistent upper-left highlights, ink-blue seating, warm oak, cream joinery, colored book spines, linen sofa cushions, screen UI details, dense foliage and warm light pools replace the flatter presentation. Wood/stone floors and woven rugs remain distinct. Theme identity is retained: pale graphite Minimal, sage Scandinavian, slate Dark Tech, oak Warm Wood and green Eco. Existing glass, half walls, architectural corners, thresholds, corridors and room shapes remain modular.

The catalog now has **99 expanded definitions and 113 editor entries** including legacy assets and rugs. Seven new silhouettes are appended after the existing directional frames, within the same 512×1024 atlas:

| ID | Native size | Placement and behavior |
| --- | --- | --- |
| `deskTriple` | 96×64 | Three monitors, peripherals, embedded usable north-facing chair |
| `beanBag` | 32×32 | Canvas upholstery, one usable south-facing seat |
| `livingWall` | 96×32 | Hanging greenery; supported wall decoration |
| `gameConsole` | 64×32 | Entertainment display; supported wall decoration, no game/share action |
| `trophyShelf` | 64×32 | Recessed awards shelf; supported wall decoration |
| `sculpture` | 32×32 | Brass loop on a stone plinth; blocking decoration |
| `windowPanel` | 64×32 | Framed daylight/city artwork; supported wall decoration |

Existing desks, sofas, plants, shelves, reception/pantry joinery, meeting tables, sconces and displays have new artwork. Chair families retain their native four directions, and new desk/bean-bag seat anchors are explicitly registered. Art stays within each original crop. The new pieces have one authored orientation; the editor does not invent unsupported rotations. TV `displaySurfaces` metadata reserves exact screen rectangles for later integration, with `interactive:false` and no screen-sharing capability.

Metadata remains content-owned: `assets.ts` specifies IDs, atlas crops, dimensions and modes; `decoration.ts` supplies editor categories, footprints and valid orientations; `seating-metadata.ts` supplies anchors/exits; `interactions.ts` registers capabilities; `OfficeScene.renderFurniture()` supplies stable depth/foreground ordering. All assets are available in all five theme atlases. Editor thumbnails and hit-testing use the actual atlas pixels.

## Pipeline

`pnpm assets:office` builds five reusable atlases from original integer-pixel artwork. The premium pass is `scripts/premium-office-art.mjs`; it is layered over the maintained architecture/directional-chair sources. Existing atlas rectangles remain fixed. Each atlas is approximately 29–30 KiB compressed, 2 MiB RGBA decoded, and only the selected theme is loaded by a running office.

`scripts/import-office-art.mjs` adds an offline artist-sprite import stage after generation. [Import instructions](../assets/office/imports/README.md) cover exact-size RGBA8 PNG exports, theme/orientation selection, provenance, license record and SHA256. The importer supports all five PNG row filters and rejects wrong dimensions, oversized output, unknown targets, duplicate targets, missing provenance, changed hashes and paths escaping the import directory. It cannot change collision or grant interactions. The manifest intentionally contains no unlicensed or purported commissioned art.

`pnpm assets:editor-catalog` regenerates the new SQL allowlist migration. It does not execute SQL.

## Composer, editor and live update compatibility

The five original floor plans and their distinct topology remain intact. A bounded additive furnishing pass supplies lamps, wall greenery, lounge media, bean bags, planters and selected executive triple-monitor desks. It never replaces or renames existing base furniture. `minimal` remains sparse by design; `rich` supplies the reference arrangement. Every new blocking placement preserves existing seat approaches and verifies connectivity of the remaining boundary neighbors. Failed optional slots are omitted rather than moved into doorways or circulation lanes.

New optional objects are marked in composition metadata. Saved owner-authored objects take priority if their footprints overlap new optional styling. Shared resolution and actual map composition both omit the competing optional object; the stored owner document is not rewritten. Tests cover a pre-existing lounge-chair placement over the new bean-bag slot.

The same original editor supports select, drag, duplicate, delete, supported rotation, undo/redo and authoritative Save. Lighting follows accepted/preview furniture positions, including move/delete/undo, without rebuilding the Phaser scene. Atlas alpha hit-testing and actual thumbnail artwork remain in use. No HUD components, movement speeds, voice protocols or tenant permissions were changed.

## Lighting and performance

`environmentAtmosphere()` builds a deterministic cosmetic paint list, clipped to actual interior floor and excluded from architectural cells. It supplies edge shadows, lamp/doorway pools, subtle monitor light and reception toe-light. It never changes map geometry, collision, seating, zone data or network revisions. The Canvas preview consumes the same paint rules.

The first implementation replayed about 53,000 Graphics commands per frame. The mobile-emulation capture exposed that cost, so it was replaced with **one nearest-filtered CanvasTexture**, rasterized at one texel per four world pixels and refreshed only when furniture positions change. The reference uses 408×320 texels (522,240 RGBA bytes) and one image. This is a static light overlay; furniture remains at native resolution. No blur, dynamic light engine or full-screen shader is used. Scene shutdown removes the owned texture.

Final isolated headless Brave/WebGL samples, 120 frames each:

| Profile | Median frame interval | P95 | Maximum |
| --- | --- | --- | --- |
| 1440×1000 desktop | 16.7 ms | 16.8 ms | 17.4 ms |
| 390×844, 4× CPU throttle | 16.7 ms | 50.0 ms | 199.8 ms |

The reference scene had 162 display objects and 17 texture-manager entries, including engine/avatar resources. [Raw measurements](assets/premium-office/performance.json) identify the profile. The mobile profile still showed intermittent stalls; this is not a claim of consistent 60 FPS on physical phones. The initial unbaked run was worse (50 ms median, 166 ms P95) but also ran alongside other checks, so it is not a controlled speedup ratio. Real mobile GPU/memory and long-session measurements remain outstanding.

## Actual visual review

The baseline and final images are actual Phaser captures, not concept images or static map replacements. The first rendered pass prompted fuller foliage, stronger lamps, more deliberate planter placement and the light-texture optimization. All five layouts and the mobile overview were inspected after rendering.

- [Before](assets/premium-office/00-before.png) and [same balanced Open Office after](assets/premium-office/01-open-office-balanced.png).
- [Premium reference: Open Office / Warm Wood / Rich / Standard / Gold / Woven runner / Ceramic](assets/premium-office/02-reference-rich.png).
- Close-ups: [lounge](assets/premium-office/03-lounge-closeup.png), [workstations](assets/premium-office/04-workstations-closeup.png), [reception](assets/premium-office/05-reception-closeup.png), [pantry](assets/premium-office/06-pantry-closeup.png).
- Other layouts: [Corporate HQ / Dark Tech](assets/premium-office/07-corporate-hq.png), [Startup / Scandinavian](assets/premium-office/08-startup-office.png), [Co-working / Minimal Light](assets/premium-office/09-coworking-space.png), [Training / Eco Green](assets/premium-office/10-training-hub.png).
- [Mobile reference overview](assets/premium-office/11-mobile-reference.png).

Visible improvement: upholstery/pillows and monitors read more clearly; foliage and shelves carry more color; warm lights ground the fixtures; woven rugs and stone corridor seams create better material separation. The five themes and layouts remain distinguishable.

**Fidelity limitation:** this is a substantive playable art pass, not a match for the reference illustration. The reference still has finer organic foliage, more convincing volumetric furniture, larger/lusher feature walls and more carefully dressed room clusters. Some existing furniture families remain simple, the broad original circulation is retained, and overview zoom reduces visible detail (especially mobile). Commissioned native-scale sprite replacements through the new import pipeline, plus reviewed room recipes, are still needed for that final level of visual polish. Passing tests is not subjective visual acceptance.

## Validation

| Check | Result and evidence |
| --- | --- |
| Full unit suites | 236 passed: realtime 68, web 168; `.cache/premium-unit-final.log`, `.cache/premium-web-verified.log` |
| Final composition/art/safety recheck | 13 passed after the connectivity optimization; `.cache/premium-composition-final.log` |
| Configuration coverage | All 225 core compositions have connected floor, reachable markers/fixtures, valid meeting zones and deterministic geometry; all 10,800 option combinations remain distinct; final exhaustive composition run 42.7 seconds under concurrent checks |
| Disposable PostgreSQL | 2 suites passed: private drafts, active verified OWNER checks, denied browser writer, cross-tenant access, revisions, atomic live Save/retries and new 113-entry catalog; `.cache/premium-database-art.log` |
| Artwork import | 2 tests passed including all PNG filters, native crop placement and invalid manifest/hash/dimensions; same log |
| Lint / TypeScript | Web and realtime passed, zero lint warnings; `.cache/premium-lint-final.log`, `.cache/premium-typecheck-final.log` |
| Production builds | Web and realtime passed; `.cache/premium-build-final.log` |
| Actual renderer / environment browser | Passed all five layouts, real Arcade wall/door probes, preview variants, owner feedback, camera/resize, one renderer and final screenshots; `.cache/premium-render-final.log` |
| Live editor browser | Passed incremental peer updates, stable scene/unaffected sprites/camera/avatar/voice owners, occupied-seat/member denial, conflict, failed Save retry and durable refresh |
| Directional seating browser | Passed two-client native cardinal frames, desk alignment/foreground, occupancy, sofa and safe standing |
| Movement/seating browser | Passed authoritative run/sit/stand, closest prompt and mobile controls |
| Engine browser | Passed rendering, focus, collision, camera/zoom, resize and repeated destruction |
| Proximity and voice browsers | Both passed consent, zone cleanup, capsule containment, responsive controls, serialized media ownership and denial handling |

The latter six browser suites all passed with no skips in `.cache/premium-browser-regressions.log`; together with the environment renderer suite this is **7 passing browser suites**. Those fixtures explicitly distinguish simulated authorization/media boundaries from real user acceptance.

The legacy engine regression also recorded 24.1 FPS alone / 21.5 FPS with ten synthetic players using SwiftShader during the concurrent validation workload. That is a different map, viewport and workload from the isolated premium-reference frame samples; it reinforces that these measurements are local diagnostics, not a general performance certification.

## Main changed files

- Art: `scripts/premium-office-art.mjs`, `generate-environment-assets.mjs`, `expanded-office-art.mjs`, `import-office-art.mjs`; five generated `apps/web/public/office/environments/*.png` files.
- Shared content: `packages/shared/src/environment/assets.ts`, `catalog.ts`, `rooms.ts`, `compose.ts`, `visuals.ts`, `decoration.ts`, `seating-metadata.ts`, plus `map.ts` and `interactions.ts`.
- Rendering: `apps/web/src/features/office/scenes/office-scene.ts`, `features/environment/environment-preview.tsx`.
- Persistence allowlist: `scripts/generate-editor-catalog.mjs`, `supabase/migrations/20261106000200_premium_office_catalog.sql`.
- Validation: `premium.test.ts`, updated editor catalog test, `scripts/office-art.test.mjs`, updated environment and live-editor browser fixtures and disposable SQL tests.

## Local activation and remaining scope

Reload local web/realtime code together so both authorities compose the same catalog. Existing playable office layouts acquire the upgraded art automatically; select the reference settings above to see the richest example. No real workspace settings were changed to force that configuration.

**The new `20261106000200_premium_office_catalog.sql` migration has only been applied to disposable PGlite test databases.** Hosted persistence of the seven new asset IDs requires applying that migration through the approved database process (and the preceding live-editing migration, if still pending). The migration replaces only the private asset-validation allowlist. No remote SQL, tenant rows or production data were changed here.

Browser fixtures use actual Phaser/Colyseus and isolated PostgreSQL, with synthetic verified identities and simulated media/provider boundaries. They do not prove real hosted Auth acceptance or physical LiveKit audio. No deployment or Git operations were performed.
