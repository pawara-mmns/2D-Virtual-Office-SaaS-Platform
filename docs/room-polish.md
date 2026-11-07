# Room identity and UI polish

## Before implementation

The previous pass established native pixel sprites, seven premium assets and a small cached light texture. The remaining UI problems are heavier double glass rims, inconsistent control padding, an expanded camera explanation that competes with the office, and contextual prompts outside the HUD's color-token scope. Nameplates grow too large at close camera zoom. Editor selection is a uniform debug-like rectangle rather than a restrained selection frame.

Room recipes are already safe and editable, but many wall details are generic. Workstations need a code accent, meeting rooms a consistent presentation identity, pantry a hospitality accent, collaboration a brainstorming board, storage recognizable supplies, reception a stronger focal point, and corridors restrained wayfinding. Additions must remain optional and yield to saved owner furniture; existing base identities, native seat orientations and protected circulation must remain stable.

## Implemented UI finish

The floating controls retain the Liquid Glass direction with softer rims/reflections, shorter shadows, consistent 18px icons, quieter typography and compact spacing. Active toolbar buttons highlight themselves, including the owner Edit action; the old index-based sliding marker could highlight the wrong action when Edit was present. Camera orientation remains available as a screen-reader status, while a 44px return-to-avatar icon replaces the expanded explanation card.

Sit/Stand prompts now use a small action icon, aligned label and inset E badge. Occupied seats use a lock icon and retain disabled semantics. The chips own light/dark/high-contrast tokens because they sit outside the HUD theme container. They retain 44px targets and keyboard focus outlines. Entry and press feedback are restrained; reduced-motion preferences disable entry animation.

Nameplates have a neutral backing, clearer shadow, disconnected opacity and a zoom cap to avoid oversized text. Profile/connection indicators, voice popovers and notices use consistent spacing and quieter corners. The editor has a smaller Save toolbar, subtle selection brackets, cleaner context menus and clearer error borders. Brackets are visual selection indicators, not resize handles. Native dialog pointer events remain enabled.

## Room assets and placement

Eight original pixel assets extend the existing furniture and room recipes. No external art was imported.

| Room | New asset | Purpose |
| --- | --- | --- |
| Lounge | `loungeArt` | Framed landscape above the existing sofa, lamp and casual furniture |
| Workstations / private office | `codePanel` | Code display complementing developer desks and planters |
| Meeting | `presentationPanel` | Presentation charts/participant display beside existing conference furniture |
| Reception | `receptionCrest` | Brass crest and slatted surround where wall space permits |
| Coffee & Pantry | `hospitalityShelf` | Mug/tin shelf above the hospitality area |
| Collaboration / training | `ideaBoard` | Sticky-note and diagram board |
| Print & Storage | `supplyCubbies` | Labeled supply boxes in grounded storage shelving |
| Corridor | `wayfindingLight` | Small mounted illuminated arrow |

The company-name wall also gains a slatted oak frame, dark inset plaque, brass strips and lower accent light. This is the focal point in the reference reception: its top wall has no spare slot for the optional crest. Small rooms and existing owner overrides can likewise suppress optional additions instead of losing furniture or walkable space. Corridors retain their existing 15-prop cap.

Catalog thumbnails use the atlas crops. All eight accents have one supported native orientation, placement metadata and no seating claims. Supply cubbies block their footprint; mounted accents use wall placement. The presentation display is decorative, not a new screen-sharing feature. Existing four-direction seat metadata and furniture identities are unchanged.

The atlas grows from 512×1024 to **512×1152** with existing crop positions preserved. It now contains **107 expanded definitions / 121 editor entries** across five palettes. A selected decoded atlas uses 2.25 MiB, an increase of 256 KiB; each compressed theme PNG is approximately 31–32 KB. The importer is tested against the new bottom rows.

## Lighting and performance

Purpose-specific screen glow, pantry warmth, reception accents and sparse corridor edge markers extend the existing floor-clipped atmosphere. Grounding shadows, wall edges and crisp native furniture remain visible. Both the Phaser scene and environment preview use the shared reception paint rules.

Lighting remains one cached, nearest-filtered CanvasTexture at one texel per four world pixels, refreshed on furniture changes. No per-frame geometry replay, new full-screen shader or blur is added. Source count stays bounded at 96. The reference has 169 display objects and 17 texture entries; its 408×320 atmosphere texture remains 522,240 RGBA bytes.

Actual isolated headless Brave samples, 120 frames per profile:

| Profile | Median frame interval | P95 | Maximum |
| --- | --- | --- | --- |
| Desktop 1440×1000 | 16.7 ms | 16.9 ms | 17.7 ms |
| Mobile 390×844, 4× CPU throttle | 16.7 ms | 33.4 ms | 50.2 ms |

[Raw measurements](assets/room-polish/performance.json). Median interval is unchanged from the previous pass. These short samples do not establish a controlled speedup or certify physical mobile performance. The separate legacy engine fixture, under concurrent software rendering, recorded 29.1 FPS alone and 27.7 FPS with ten synthetic players; its map/workload differs from the reference.

The broader HUD fixture deliberately forces glass on SwiftShader: it measured 7.5 FPS versus 23.3 FPS with solid surfaces and 21.4 FPS after automatic software-renderer fallback. Enhanced glass remains expensive on software rendering; the existing automatic fallback is preserved and passed. These results are distinct from the reference scene samples above.

## Actual screenshots

These are actual Phaser/React captures, not concept images. The reference uses Open Office, Warm Wood and Rich decoration. No real workspace settings were changed to force that configuration.

- [Before](assets/room-polish/00-before.png) / [full office after](assets/room-polish/01-full-office.png)
- [Lounge](assets/room-polish/02-lounge.png), [workstations](assets/room-polish/03-workstations.png), [meeting](assets/room-polish/04-meeting.png), [reception](assets/room-polish/05-reception.png)
- [Pantry](assets/room-polish/06-pantry.png), [collaboration](assets/room-polish/07-collaboration.png), [storage](assets/room-polish/08-storage.png), [corridor](assets/room-polish/09-corridor.png)
- [Top HUD](assets/room-polish/10-top-hud.png), [profile pill](assets/room-polish/11-profile.png), [interaction chip](assets/room-polish/12-interaction.png)
- [Mobile overview](assets/room-polish/13-mobile.png), [live editor selection](assets/room-polish/14-editor-selection.png), [seated avatar/nameplate](assets/room-polish/15-seated-nameplate.png)

Room accents, improved reception composition and clearer controls are visible at normal play zoom. Full-office zoom, especially on mobile, necessarily reduces sprite detail. The art retains the existing native pixel style; it does not reproduce the reference illustration's organic foliage, volumetric furniture or dense feature walls. Physical phone/GPU and subjective owner acceptance remain manual checks.

## Validation

| Check | Result |
| --- | --- |
| Web and realtime unit suites | 236 passed: 168 web + 68 realtime; `.cache/room-polish-unit-final.log` |
| Lint and TypeScript | Both projects passed; `.cache/room-polish-lint.log`, `.cache/room-polish-types.log` |
| Production builds | Web and realtime passed; `.cache/room-polish-build-final.log` |
| Final web rebuild | Passed after the dark-hover correction; `.cache/room-polish-build-contrast.log` |
| Isolated database and art tests | Original four checks passed; final three-test rerun passed after expanding new-asset SQL and bottom-row import coverage; `.cache/room-polish-data-art.log`, `.cache/room-polish-data-art-final.log` |
| Environment browser | All five layouts, preview variants, actual Arcade probes, camera/resize and reference captures passed; `.cache/room-polish-render.log` |
| Live editor browser | Incremental peer updates, stable scene/camera/avatar/media ownership, occupied-seat/member denial, conflict, failed-save retry and durable refresh passed |
| Directional and movement browsers | Native cardinal poses, workstation alignment, occupancy, safe standing, authoritative run/sit/stand, prompt and mobile controls passed |
| Engine browser | Rendering, input, collisions, focus, zoom, resize and repeated teardown passed |
| Proximity and voice browsers | Consent, capsule containment, private controls, responsive UI, serialized media ownership, denial and zone cleanup passed |
| Full HUD/communication browser | Passed light/dark contrast, 44px controls, 320px text resize, focus, drafts, responsive chat/profile/voice, camera, reduced effects and clean media teardown; `.cache/room-polish-communication-verified.log` |

The latter six browser suites passed without skips in `.cache/room-polish-browser-regressions.log`. SQL checks use disposable PGlite databases and include the 121-entry catalog, denied cross-tenant access and persistence/revision behavior. Browser tests use actual Phaser/Colyseus or React/installed LiveKit SDK with synthetic authorization and simulated media boundaries. They do not prove real hosted login or physical LiveKit audio.

The initial composition run caught an extra corridor sign exceeding the existing prop cap; placement was corrected and all unit suites rerun. HUD validation also identified an obsolete sliding-marker assertion and a dark-hover contrast regression; the assertion now checks the active button and the original accessible dark hover color was restored. The final HUD run passed with zero runtime errors. Together with the environment suite and six gameplay/media suites, this is **eight passing browser suites**.

## Changed files

- UI: `apps/web/src/components/hud-icon.tsx`; `features/office/components/{hud-glass.css,interaction-controls.tsx,office-canvas.tsx}`; `features/office/engine/player-avatar.ts`; `features/decoration/{editor.css,overlay.ts}`.
- Art/content: `scripts/room-accent-art.mjs`, `scripts/generate-environment-assets.mjs`; five `apps/web/public/office/environments/*.png` files; `packages/shared/src/environment/{assets.ts,rooms.ts,passages.ts,compose.ts,visuals.ts}`.
- Rendering: `apps/web/src/features/office/scenes/office-scene.ts`, `apps/web/src/features/environment/environment-preview.tsx`.
- Persistence: `scripts/generate-editor-catalog.mjs`, `supabase/migrations/20261106000300_room_polish_catalog.sql`.
- Validation: `apps/web/src/features/decoration/decoration.test.ts`; `scripts/{decoration-database.test.mjs,office-art.test.mjs,test-decoration-browser.mjs,test-environment-browser.mjs,test-movement-seating-browser.mjs,test-communication-browser.mjs}`; this report, README and screenshot artifacts.

UI paths in the first bullet after the initial file are relative to `apps/web/src`.

## Activation and remaining scope

Reload local web/realtime code together so both compose the same content. Saved owner furniture continues to take priority over optional decorations.

**The new `20261106000300_room_polish_catalog.sql` migration was applied only to disposable test databases.** Hosted saving of the eight new IDs requires this private allowlist migration after the existing editor/live/premium catalog migrations. Existing migrations were not rewritten. Until that approved database step, hosted persistence of new IDs can be rejected; local validation does not bypass the server catalog.

No remote SQL, production tenant data, Git operations or deployment were performed. Real authenticated sessions, real audio and physical mobile testing remain outside these synthetic browser results.
