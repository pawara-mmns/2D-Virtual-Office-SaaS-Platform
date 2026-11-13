# Avatar white pixel artifact fix

Implemented and validated locally on 2026-11-12. No Git commands, branches, commits, pushes, merges or deployments were performed.

## Root cause

The modular avatar composer drew grayscale atlas layers into a scratch canvas, called `getImageData()`, and recolored only pixels whose red, green and blue channels were exactly equal. Brave's canvas privacy protection perturbs those readback values. Many white primary-mask pixels consequently failed the equality check and were copied into the composed avatar as white speckles. The same composer fed Studio previews, option thumbnails, HUD portraits and Phaser textures, spreading the artifacts throughout the application.

The failure was reproduced in a fresh local Brave profile with the original code. Chrome rendered the same source correctly. A separate solid-white 32×32 canvas probe in Brave reported **209 changed pixels out of 1,024**, including **208 pixels with unequal RGB channels**. See [probe output](assets/avatar-artifacts/after-brave/canvas-readback-probe.json).

The PNG itself had the expected 768×4608 dimensions, transparent black outside the artwork, binary alpha, and exactly the six authored mask/detail colors. The cause was runtime canvas readback, rather than atlas background leakage, interpolated texture sampling or incorrect animation indexing.

## Implementation

The composer now draws the same integer-pixel templates used by the atlas generator. It resolves explicit primary, highlight and shadow tokens into the selected palette **before** drawing. It never samples or writes back rendered canvas pixels. Fixed ink and cream remain independent of the selected palette, and deliberately white clothing, shoes and accessories remain valid.

Unpainted areas stay transparent. The existing directional layer order, 24-frame layout, nearest-neighbor rendering, bounded composition/texture caches, texture reference counting and animation timing are preserved. Phaser and React previews use the same composed canvases. Removing the atlas download also removes the asynchronous texture-swap race; appearance changes preserve the current facing, seated pose and animation progress through the existing swap logic.

Formal and casual shoe details were also moved inside their actual shoe silhouettes in side/rear seated poses. The modular PNG was regenerated from those corrected templates.

The saved version-1 appearance schema, option IDs, colors, legacy presets, multiplayer messages, collision geometry and database migrations were not changed. Existing saved appearances load without conversion.

## Files changed

| File | Change |
| --- | --- |
| `packages/shared/src/avatar-art.ts` | Explicit palette resolution; corrected seated shoe details |
| `apps/web/src/features/avatars/composer.ts` | Draw resolved authored templates without canvas readback or atlas loading |
| `apps/web/src/features/avatars/avatar-preview.tsx` | Use the corrected composer for large previews and thumbnails |
| `apps/web/src/features/office/engine/avatar-textures.ts` | Use the same composer for nearest-filtered Phaser sheets |
| `apps/web/src/features/office/engine/player-avatar.ts` | Swap composed textures synchronously while preserving pose/progress |
| `apps/web/public/office/avatar-layers.png` | Regenerated corrected source atlas |
| `apps/web/src/features/avatars/composer.test.ts` | Readback prohibition, palette/white-detail preservation, customization coverage, shoe containment and atlas/source parity |
| `apps/web/src/features/avatars/customization.test.ts` | Require explicitly authored mask/detail colors |
| `scripts/test-avatar-customization-browser.mjs` | Shared Phaser-source assertion, blocked-readback regression, readback probe, evidence galleries, configurable screenshot directory and opt-in test-browser sandbox flag |
| `docs/avatar-white-pixel-fix.md` and `docs/assets/avatar-artifacts/` | Report and captured visual evidence |

## Before and after

These are actual screenshots from the local React Studio and Phaser office, using synthetic users. The Brave before/after pair reproduces and fixes the reported problem without changing browser privacy settings.

| View | Before | After |
| --- | --- | --- |
| Main preview and hair thumbnails | [Brave before](assets/avatar-artifacts/before-brave/studio-hair.png) | [Brave after](assets/avatar-artifacts/after-brave/studio-hair.png) |
| Studio initial appearance | [Before](assets/avatar-artifacts/before-brave/studio-desktop.png) | [After](assets/avatar-artifacts/after-brave/studio-desktop.png) |
| Mobile thumbnails | [Before](assets/avatar-artifacts/before-brave/studio-mobile-hair.png) | [After](assets/avatar-artifacts/after-brave/studio-mobile-hair.png) |
| West-facing seated avatar | [Before](assets/avatar-artifacts/before-brave/05-sitting-west.png) | [After](assets/avatar-artifacts/after-brave/05-sitting-west.png) |
| Ten customized in-game avatars | [Before](assets/avatar-artifacts/before-brave/12-ten-customized-avatars.png) | [After](assets/avatar-artifacts/after-brave/12-ten-customized-avatars.png) |

Additional inspected evidence:

- [All three bodies × all eight hairstyles, with eight skin tones and varied clothing/shoes](assets/avatar-artifacts/after-brave/15-body-hair-skin-matrix.png).
- [Four directions, Idle/Walk/Run/Sit frames, dark and intentionally white clothing/shoes/accessories](assets/avatar-artifacts/after-brave/16-directions-white-details.png).
- [Chrome rendering of the direction/white-detail gallery](assets/avatar-artifacts/after-chrome/16-directions-white-details.png).
- Both Brave evidence folders also contain all four in-game cardinal seats, desk and sofa seating, multiplayer synchronization, walking, running and responsive Studio sizes.

## Validation

| Check | Result |
| --- | --- |
| Focused avatar unit tests | **23 passed** |
| Full web unit suite | **187 passed**; the subsequently added atlas-parity test passed in the focused final run |
| Full realtime suite | **82 passed** |
| Local isolated avatar PostgreSQL test | **1 passed**; catalog parity, saved appearance reload, own-profile RLS and legacy preservation |
| Web TypeScript | Passed `next typegen` and `tsc --noEmit`; final `tsc --noEmit` also passed after test additions |
| Web/realtime ESLint | Passed with zero warnings |
| Web production build | Passed `next build` |
| Realtime TypeScript/build | Passed `tsc -p tsconfig.build.json` |
| Chrome local avatar browser suite | Passed |
| Brave local avatar browser suite | Passed, including final sequential rerun |
| Asset generation/parity | Regenerated atlas; test compares all 144 rows × 24 frames and transparent gaps against the authored source |

The compositor tests exercise 450 appearance scenarios across every catalog part, all body/hair/skin combinations, and every offered color swatch. Each composition covers all 24 frames, including the four native seated directions. They prohibit `getImageData()`, check transparent corners/gaps, reject leaked pure-white mask pixels for the nonwhite selections, and verify intentional white clothing, shoes, hats, cream eyes, teeth, collars and sneaker soles.

The browser suite verifies that Phaser's texture source is the shared composed canvas; composition succeeds with canvas readback blocked; Studio edits, save failures/retries and reload remain correct; local and remote appearances synchronize over actual local Colyseus HTTP/WebSockets; seated appearance edits preserve the seat and movement lifetime; all cardinal seats, sofa/desk foregrounds and camera zooms work; walking/running and ten-player rendering work; and the Studio remains usable at desktop, mobile, short and landscape sizes.

Browser tests use `OFFICE_TEST_BROWSER` to select Chrome or Brave, `AVATAR_SCREENSHOT_DIR` for evidence, and the opt-in `OFFICE_TEST_NO_SANDBOX=1` for this machine's headless Windows renderer. That flag affects only the test-owned browser. An overlapping Chrome/Brave run encountered a transient synthetic-client disconnect at save; the final Brave run executed separately and passed the complete suite.

Commands were run directly through the installed Node tools because this shell blocks `pnpm.ps1` and the pnpm launcher could not acquire its package-manager store lock. No dependencies were installed.

## Remaining visual limitations

No unwanted white artifacts were observed in the inspected corrected Chrome/Brave captures. The authored 32×32 silhouettes and fixed cream details remain part of the intended art. Run continues to reuse walking frames at a faster cadence. Validation used local synthetic multiplayer clients and headless browsers; no hosted office or other browser/device was tested.
