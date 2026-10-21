# Phase 2 Step 1 — interactive pixel-art office

Validated 2026-10-21, Asia/Colombo. Expected branch
`feature/p2-s01-phaser-office-engine` confirmed by reading `.git/HEAD`; no Git
command or Git mutation was performed. **Implementation complete.** Live
authenticated application navigation and ordinary GPU hardware performance still
need manual verification. No database/Auth/invitation changes were made.

## Integration and files

- `src/app/workspace/[organizationId]/office/{page,loading}.tsx`: protected route,
  existing organization/member/office queries and unavailable/denied states.
- Workspace `page.tsx`: Enter office for the existing real office record.
- `features/office/access.ts`: active matching tenant/member gate; no office read
  before authorization. Production queries independently require the verified
  user and use existing RLS. Missing/inaccessible tenants return the same 404.
- `components/office-experience.tsx`: client dynamic boundary, `ssr: false`.
- `components/office-canvas.tsx`: effect-only engine import, loading/retry/graphics
  errors, focusable canvas region, keyboard instructions and real zoom controls.
- `engine/{create-game,lifecycle,camera}.ts`: Phaser factory, serialized teardown
  across Strict Mode/remounts, ResizeObserver and bounded integer camera zoom.
- `scenes/office-scene.ts`: tile/asset loading, local Arcade Physics avatar,
  collision and camera follow. No React updates in the frame loop.
- `input/movement.ts`, `maps/map-data.ts`: focus-scoped input, normalized diagonal
  movement, structured collision/spawn validation independent of Phaser.
- `office.test.ts`, expanded `tests/auth-routes.test.mjs`: logic/security/regression
  tests. `scripts/test-office-browser.mjs`: isolated real-browser engine harness.
- `scripts/generate-office-assets.mjs`, `public/office/*`: original editable pixel
  drawing source, atlas, directional sprite sheet, Tiled JSON and asset provenance.
- `apps/web/package.json`, lockfile: **Phaser 4.2.1**, the registry's current stable
  version at installation; MIT licensed. No other runtime/test dependency added.
- Root `package.json`, `globals.css`, README and architecture notes updated for
  scoped controls/styles, asset generation and reproducible browser checks.

## Map and artwork

One original 36×26 orthogonal map: **1152×832 world pixels**, fixed **32×32 grid**.
Lounge to the west, six development stations through the center, an enclosed
meeting room to the east, and reception at the southern entrance. Open doorways
and corridors connect every area. There are no copied reference assets.

| Tiled layer | Purpose |
| --- | --- |
| Floor | Oak, carpet and reception stone; opaque floor tiles |
| Architecture | Walls and glass room boundaries |
| Furniture | Atlas tiles for desks, monitors, chairs, plants, sofa, bookshelves, tables and reception |
| Collision | Hidden binary grid: GID 0 empty, GID 1 blocked; independent of visual tile IDs |
| Markers | Exactly one `spawn` point and four `area` points with labels |

The embedded `office` tileset has 128 slots in a 512×256 PNG, nearest-neighbor
filtering and no padding. `avatar.png` is 96×128: rows down/left/right/up, three
32×32 frames per row. Idle uses the directional standing frame; walking alternates
standing/left-step/standing/right-step at seven animation frames per second.
Project-owned drawing source and licensing status: [asset provenance](../apps/web/public/office/ASSETS.md).
No separate project redistribution license has been selected; no third-party art
license or external asset dependency is introduced.

Collision is full-cell for walls/furniture, with a 14×10 player foot body offset
inside the sprite, plus world bounds. Spawn validation checks all foot corners.
The grid can support later server validation, but no server movement logic is
implemented. No migration, fake office record or position write is needed.

## Controls, lifecycle and rendering

Click or Tab into the office, then use WASD/arrows. Movement is 120 world pixels/s
and diagonal speed is normalized. Only the focused region captures movement
keys; Tab and form/toolbar focus remain available. Blur clears held keys. Phaser's
unused keyboard/mouse/touch/gamepad handlers and audio are disabled.

Zoom buttons step through integer zoom levels; Reset returns to 2×, clamped to a
viewport-dependent minimum. The camera follows the avatar, rounds pixels and
stays within the world. Minimum zoom covers both viewport dimensions. A
ResizeObserver owns canvas sizing with Scale.NONE, avoiding competing automatic
parent sizing. CSS/backing pixels remain 1:1 rather than multiplying the canvas
by device pixel ratio; nearest-neighbor scaling keeps artwork crisp at bounded
texture memory. Browser zoom/DPR combinations beyond the tested setup remain manual.

Engine/assets load only on office entry. Cleanup disconnects the observer and
custom input listeners, destroys Phaser with canvas removal and awaits its public
destroy event before a remount. A sleeping loop is awakened to complete deferred
destruction. No private Phaser methods or global Phaser singleton are used.

## Actual results

| Check | Actual result |
| --- | --- |
| Install Phaser 4.2.1 | PASSED |
| `pnpm lint` / `pnpm typecheck` | PASSED |
| `pnpm build` | PASSED, including the new dynamic office route; no SSR DOM errors |
| `pnpm test` | PASSED: 58 unit/service tests, including 11 office tests |
| `pnpm test:team:database` | PASSED: 54 team + 26 foundation assertions, unverified-identity denial and rollback checks |
| `pnpm test:smoke` | PASSED: 9 HTTP tests, including unauthenticated office denial and absence of Phaser in homepage/login initial scripts |
| `pnpm test:office:browser` | PASSED: one real Chromium scenario containing rendering, asset loading, movement/idle, walls/desks, external-input focus, Tab exit, zoom, resize, bounds, two remounts, one/zero canvas counts, stopped loop and no uncaught JS errors |
| Strict Mode/lazy import cleanup | PASSED: isolated lifecycle tests cancel unmounted imports and wait for deferred cleanup before creating another instance |
| Office authorization | PASSED: mocked server-source tests for active/member/tenant/record boundaries; real HTTP unauthenticated redirect |
| Full signed-in app entry/refresh/back navigation and cross-tenant live requests | NOT TESTED: dedicated authorized credentials unavailable; no real users reused or accounts created |
| Interactive desktop/mobile visual review of protected app shell | NOT TESTED; isolated canvas screenshot inspected |
| Ordinary GPU hardware 60 FPS target | NOT ESTABLISHED |

Real browser environment: Chrome **155.0.8059.85**, Windows, Intel i7-1165G7,
1280×1024 viewport, forced **SwiftShader software WebGL**. Final 1.202-second
sample measured **57 frames / 47.4 FPS**; an earlier successful run measured 32.8
FPS. This is a short software-rendered harness sample, not a sustained hardware
benchmark or a claim that the 60 FPS target is met. A 360×420 canvas resize was
also exercised. Preview: ignored `.cache/office-preview-desktop.png`.

Measured production assets: atlas 3,950 bytes, avatar 689 bytes, Tiled JSON 44,274
bytes. Deferred Phaser chunk: 1,376,124 bytes raw, 357,725 bytes gzip via local
zlib (not a wire-transfer measurement; chunk names/sizes can change). The public
homepage/login initial script checks passed without that runtime. Only one avatar
physics body and one tile collider are created; no continuous database writes.

An initial sandboxed browser attempt timed out; rerunning with local browser
network access worked. Real-browser testing exposed and fixed a resize conflict
between Scale.RESIZE and the observer. Assertions now use Phaser's visible world
rectangle rather than raw camera scroll offsets. Final checks passed; no unresolved
automated failure remains.

## Run and manually verify

```sh
pnpm dev
pnpm assets:office             # only when intentionally regenerating artwork/map
pnpm test:office:browser       # installed Chromium; optional OFFICE_TEST_BROWSER path
```

1. Use a normally confirmed dedicated test account; sign in, select a workspace,
   then Enter office. Confirm the real organization and office name.
2. Inspect each room, pixel edges, spawn, avatar/name and loading/error feedback.
   Test WASD/arrows, diagonals, idle direction, walls, furniture and doorways.
3. Test camera follow at all four edges, zoom limits/reset, browser resize and
   different DPR/browser zoom values. Check 375px presentation and scrolling;
   a hardware keyboard is required, with no touch movement in this step.
4. Tab through Back to workspace, zoom and canvas; confirm inputs/controls do not
   move the avatar and that focus is visible. Back out, re-enter and refresh;
   verify exactly one canvas and no stale game/audio/listeners.
5. Try a workspace where the test account is not a member and an unavailable
   office. Confirm denial/unavailability with no unauthorized office data.
6. Use a representative desktop GPU and sustained profiling to validate 60 FPS,
   memory stability and loading performance. The software sample is insufficient.

The browser harness serves engine modules/assets on an ephemeral loopback port
with a disposable browser profile. It adds no production debug route and never
contacts Supabase, sends emails, changes records or bypasses app authentication.
No multiplayer, chat, voice, editor, presence, extra maps or Phase 2 Step 2 work.

References used: [Phaser game lifecycle](https://docs.phaser.io/phaser/concepts/game),
[scale manager](https://docs.phaser.io/phaser/concepts/scale-manager),
[Arcade Physics](https://docs.phaser.io/phaser/concepts/physics/arcade),
[Phaser pixel-art guidance](https://github.com/phaserjs/phaser/blob/master/docs/Phaser%204%20Pixel%20Art%20Guide/Phaser%204%20Pixel%20Art%20Guide.md).
