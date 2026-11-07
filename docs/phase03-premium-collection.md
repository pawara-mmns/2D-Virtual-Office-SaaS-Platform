# Phase 03 — Premium office asset collection

## Result and catalog

Implemented **90 unique new designs**, nine in each of ten collection groups. The editor now has **211 entries**, up from 121, and the expanded atlas registry has **197 definitions**, up from 107. Five theme palettes and the 21 additional cardinal chair frames are not counted as new designs.

The complete [catalog by category](assets/phase03-collection/catalog.md) lists every stable ID, display name, native size, placement mode, orientation and seating capacity. The [machine-readable catalog](assets/phase03-collection/catalog.json) additionally records atlas crops/frames, footprints, render depth/foreground rules, collisions, room eligibility, lighting, seat anchors, future display rectangles and theme compatibility.

| Collection group | Designs | Examples |
| --- | ---: | --- |
| Reception & welcome | 9 | Crescent/stone concierge desks, visitor kiosk, channel settee, cantilever chair, brochure carousel, directory totem, mail credenza, umbrella stand |
| Developer workstations | 9 | Ultrawide/dual-arm/L-shaped desks, raised standing station, headrest/drafting chairs, elevated laptop dock, acoustic divider, rolling pedestal |
| Meeting & conference | 9 | Oval/boat/boardroom tables, leather chair, presentation display, camera bar, speakerphone, rolling whiteboard, glass divider |
| Lounge & relaxation | 9 | Chaise/loveseat/Chesterfield sofas, wingback chair, knitted pouf, nesting tables, ladder bookcase, tripod lamp, magazine basket |
| Coffee & pantry | 9 | Espresso bar, grinder, tall fridge, microwave shelf, sink island, snack vending, cafe pedestal, saddle stool, tea trolley |
| Collaboration & creative | 9 | Team island, hex brainstorming table, modular sofa, scoop chair, planning wall, mobile felt screen, materials library, drafting table, digital easel |
| Print, storage & IT | 9 | Production copier, flatbed scanner, paper organizer, lateral filing, lockers, patch-panel rack, recycling station, supply cart, UPS |
| Corridors & greenery | 9 | Monstera/fig, foliage trough, hanging pothos, art triptych, flip clock, directory sign, slatted bench, achievement case |
| Lighting & architecture | 9 | Twin sconce, linear pendant, task/halo lamps, cove light, floor lantern, oak slats, arched glass screen, acoustic hex tiles |
| TV & recreation | 9 | TV credenza/mobile stand, arcade, chess/foosball/table tennis, board-game shelf, record console, aquarium |

These are original hand-specified pixel drawings in a shared offline art pipeline. Shared materials, joinery and equipment primitives keep their scale and lighting consistent. Distinct silhouettes, furniture construction and interior details differentiate designs. Tests compare both exact pixels and palette-normalized region geometry, rejecting duplicates and simple recolors against the existing collection in every theme. No third-party art, external image URLs or generated concept images are bundled.

## Atlases and visual review

The five runtime atlases are **512×2048 RGBA**, with nearest sampling. Existing crop/GID coordinates and original directional frames remain in place; new designs begin at row 1152. Each selected decoded atlas is 4 MiB, up from 2.25 MiB. Compressed sizes are 57,473–58,158 bytes per theme. Only the selected theme is loaded into the configured game; there is no texture per asset.

Actual contact sheets, using the same crops as Phaser/editor:

- [Warm Wood contact sheet](assets/phase03-collection/contact-warm-wood.png) · [interactive-size HTML](assets/phase03-collection/contact-warm-wood.html)
- [Dark Tech contact sheet](assets/phase03-collection/contact-dark-tech.png)
- [Eco Green contact sheet](assets/phase03-collection/contact-eco-green.png)

Runtime atlases: [Warm Wood](../apps/web/public/office/environments/warm-wood.png), [Dark Tech](../apps/web/public/office/environments/dark-tech.png), [Eco Green](../apps/web/public/office/environments/eco-green.png), [Scandinavian](../apps/web/public/office/environments/scandinavian.png), [Minimal Light](../apps/web/public/office/environments/minimal-light.png).

The browser suite also renders all 90 designs as actual Phaser image frames in ten category pages: [reception](assets/phase03-collection/phase03-phaser-library-01.png), [workstations](assets/phase03-collection/phase03-phaser-library-02.png), [meeting](assets/phase03-collection/phase03-phaser-library-03.png), [lounge](assets/phase03-collection/phase03-phaser-library-04.png), [pantry](assets/phase03-collection/phase03-phaser-library-05.png), [creative](assets/phase03-collection/phase03-phaser-library-06.png), [utility](assets/phase03-collection/phase03-phaser-library-07.png), [greenery](assets/phase03-collection/phase03-phaser-library-08.png), [lighting](assets/phase03-collection/phase03-phaser-library-09.png), [recreation](assets/phase03-collection/phase03-phaser-library-10.png).

Actual playable office captures in three themes:

- [Warm Wood / Open Office / Rich](assets/phase03-collection/01-office-warm-wood.png)
- [Dark Tech / Corporate HQ / Executive](assets/phase03-collection/02-office-dark-tech.png)
- [Scandinavian / Startup / Collaborative](assets/phase03-collection/03-office-scandinavian.png)
- Room detail: [lounge](assets/phase03-collection/05-lounge.png), [workstations](assets/phase03-collection/06-workstations.png), [meeting](assets/phase03-collection/07-meeting.png), [reception](assets/phase03-collection/08-reception.png), [pantry](assets/phase03-collection/09-pantry.png), [collaboration](assets/phase03-collection/10-collaboration.png), [utility](assets/phase03-collection/11-utility.png), [corridor](assets/phase03-collection/12-corridor.png)
- [Mobile overview](assets/phase03-collection/13-mobile.png), [searchable editor library](assets/phase03-collection/14-editor-library.png), [successful live Save](assets/phase03-collection/15-editor-save.png)

## Integration and playability

All 90 assets are registered through the existing fixture/editor catalog. Thumbnails use the shared atlas dimensions; a legacy hard-coded thumbnail height was corrected. Search uses friendly display names, and the existing category selector and direct-manipulation controls remain the editing interface. Artwork fits the existing thumbnail cells, including the wider boardroom table.

Every new asset was placed on a valid support through the real shared owner validator in an owner-cleared test office. The actual live-editor browser scenario searches for and adds `chairErgoHeadrest`, rotates and duplicates it, removes a copy, saves it through isolated PostgreSQL, synchronizes it to another Colyseus client and seats that client on the saved chair. Occupied deletion/recovery is denied; refresh retains the saved revision. Scene, unaffected sprites, camera, avatar/session identities and simulated LiveKit ownership stay stable through Save.

Seven new chairs have four native directions. New sofas/settee/pouf/bench have explicit independent slots; three new seated developer desks expose the chair drawn within their sprite. Standing stations, tables and equipment do not invent seats. Tests exercise each new slot with authoritative SIT/STAND, occupied denial and collision-valid standing exits. Existing run, sofa occupancy, seated avatar frames, meeting zones and proximity behavior remain in their established systems.

TVs and the easel expose local future display rectangles with `interactive:false`. Chess, arcade and other recreation items have future metadata and no PLAY_GAME/SHARE_SCREEN actions. The kiosk, camera bar, coffee equipment and aquarium are decorative equipment. This phase adds no visitor check-in service, screen sharing, games or appliance actions.

## Composition and lighting

The collection uses bounded authored slots and deterministic choices based on room kind, theme, furniture set, layout and decor level. Across the 225 core combinations, **all 90 new designs are actually placed** at least once. Minimal decor retains its sparse recipe. Balanced rooms gain at most one new blocking item; rich rooms at most two. A mounted feature and a supported accessory have separate bounded slots. Top and bottom wall slots permit larger presentation/planning panels without replacing existing decorations.

Existing primary furniture identities remain intact. Additions are optional and yield to saved owner objects. An optional surface accessory is suppressed with its optional parent when an owner override displaces that parent; owner-authored accessories are never silently dropped. The composer and owner validator now share an explicit surface-support rule, including suitable low cabinets. A scanner cannot be placed on an arbitrary solid object.

Seat placement checks the complete route between standing point and anchor and reserves that route against later furniture. Optional furniture also checks that older cabinets retain perimeter access. These fixes preserve connected circulation and usable furniture, beyond merely checking an empty endpoint. Existing corridor prop/lane budgets are retained, and the new freestanding glass/slat screens remain furniture: they do not create new voice boundaries or architectural doors.

Warm sconces, pendants, task/halo/tripod lights, reception accents, monitors, TVs and equipment use baked highlights and the existing cached floor-clipped atmosphere. Grounding shadows are native art. Light sources remain bounded at 96 and use one nearest-filtered overlay refreshed on layout changes. No heavy shader, bloom or new per-frame light engine is introduced.

Repeated drag validation now reuses a bounded cache of 16 base compositions. Returned maps are cloned so callers and tenants cannot share mutable layers. The cache does not store owner documents or grow with every possible configuration.

## Performance observations

Final local headless Brave samples, 120 frames per profile; [raw measurements](assets/phase03-collection/performance.json):

| Profile | Median interval | P95 | Maximum |
| --- | --- | --- | --- |
| 1440×1000 desktop | 16.7 ms | 17.0 ms | 17.6 ms |
| 390×844, 4× CPU throttle | 16.7 ms | 50.1 ms | 116.6 ms |

The rich reference has 194 display objects versus 169 before this phase. Texture-manager entries remain 17 and the atmosphere remains 408×320 / 522,240 bytes. Desktop median is unchanged. The larger atlas costs an additional 1.75 MiB decoded, and mobile emulation still has intermittent stalls; these short samples do not establish negligible mobile regression or certify physical phones. The separate legacy software-rendering fixture measured 25 FPS alone and 23.3 FPS with ten synthetic players on a different map/workload. Existing reduced-effects and solid-HUD fallback remain available.

## Validation

| Check | Evidence / result |
| --- | --- |
| Registry/art | All 90 contracts, all five PNG palettes, non-overlapping crops, stable original coordinates, no duplicate/recolor designs, native orientations passed |
| Owner placement/seating | Every new design validates on its real support; all new chair directions and seat slots pass occupancy/entry/stand checks |
| Full unit suites | 170 web + 68 realtime = 238 tests; final results in `.cache/phase03-unit-complete.log` |
| Composition | All 225 core maps retain connected floor, reachable furniture/markers and meeting zones; all 10,800 option combinations remain visibly distinct |
| Isolated SQL/art import | Four tests passed; all 211 catalog IDs and all 360 new design/direction combinations checked against private PostgreSQL validation; `.cache/phase03-data-art-complete.log` |
| Lint, TypeScript, builds | Both projects; `.cache/phase03-lint-complete.log`, `.cache/phase03-types-complete.log`, `.cache/phase03-build-complete.log` |
| Actual environment/Phaser browser | Five layouts/preview themes, Arcade wall/door probes, one renderer, 90-image gallery and final captures passed; `.cache/phase03-render-verified.log` |
| Live owner editor browser | Added/rotated/duplicated/removed/saved new headrest chair; actual peer seating, denials, conflict/retry and durable refresh passed; `.cache/phase03-browser-isolated.log` |
| Gameplay/media browsers | Directional seating, run/sit/stand/touch, proximity and voice passed; `.cache/phase03-browser-regressions.log` |
| Legacy engine browser | Rendering/input/collisions/focus/camera/resize/teardown passed after allowing the new shared collection module in the isolated server; `.cache/phase03-render-verified.log` |

Early checks found and corrected unsupported surface placements, blocked seat-entry paths and an enclosed older cabinet. Initial parallel browser runs timed out/lost the editor connection under the concurrent workload. The isolated editor rerun passed; the engine harness additionally needed its explicit module allowlist updated. No authentication, collision or test acceptance rules were relaxed to pass these checks. Seven browser suites ultimately passed across the logs above.

Browser fixtures use actual Phaser/Colyseus or the installed LiveKit SDK, synthetic verified identities and simulated media boundaries. SQL uses disposable PGlite PostgreSQL only. These are not real hosted Auth/LiveKit audio acceptance or physical-device performance tests.

## Main modified files and reproduction

- Content: `packages/shared/src/environment/{collection.ts,collection-catalog.ts,assets.ts,seating-metadata.ts,rooms.ts,compose.ts,visuals.ts,decoration.ts}`, plus `packages/shared/src/interactions.ts`.
- Runtime/editor: `apps/web/src/features/office/scenes/office-scene.ts`, `apps/web/src/features/decoration/decoration-editor.tsx`. Existing preview/render paths consume the shared fixtures/paint/catalog automatically.
- Art: `scripts/collection-office-art.mjs`, `scripts/{expanded-office-art.mjs,generate-environment-assets.mjs,generate-collection-review.mjs}`, and five generated `apps/web/public/office/environments/*.png` atlases.
- Persistence: `scripts/generate-editor-catalog.mjs`, `supabase/migrations/20261107000100_premium_asset_collection.sql`.
- Tests: environment `collection.test.ts`/`assets.test.ts`, editor `decoration.test.ts`; `scripts/{decoration-database.test.mjs,office-art.test.mjs,test-decoration-browser.mjs,direct-editor-browser-scenario.mjs,test-environment-browser.mjs,test-office-browser.mjs}`.
- Documentation: this report, README, generated catalog/contact/gallery/room artifacts and `assets/office/imports/README.md`.

Regenerate original art with `pnpm assets:office`, the SQL catalog with `pnpm assets:editor-catalog`, and review artifacts with `node --experimental-strip-types scripts/generate-collection-review.mjs --capture` plus `OFFICE_TEST_BROWSER`. Artist-authored exact-size RGBA replacements can override any new design or supported chair direction through the existing provenance/hash-checked [offline import workflow](../assets/office/imports/README.md). Imports never alter geometry, seats or permissions. The import tests cover the new lower atlas rows.

## Activation and remaining limitations

Reload local web/realtime code together to use the same catalog and composed map versions. Hosted persistence of the 90 new IDs requires the prepared **`20261107000100_premium_asset_collection.sql`** allowlist migration after the preceding editor/live/premium/room-polish migrations. This migration has only been applied to isolated test databases. Existing migrations were not rewritten; no hosted rows or tenant data were changed.

The art is a coherent native pixel collection with readable materials and equipment detail. It retains the existing top-down perspective and does not reproduce the supplied isometric/reference illustrations' volumetric furniture, organic foliage or densely dressed interiors. Chairs remain compact at 32×32; most equipment has a single native orientation; transparent screens still occupy rectangular collision footprints. Small room recipes omit objects that cannot fit safely rather than forcing the full collection into every office. Physical phones, real audio and owner visual acceptance remain manual checks.

Work remained local. No Git operations, deployment or remote database changes were performed.
