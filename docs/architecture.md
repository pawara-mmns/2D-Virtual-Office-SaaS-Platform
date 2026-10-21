# Architecture and scope

## Current foundation

This repository uses pnpm workspaces without an additional task runner. Only
`apps/web` is an executable workspace. Root build, lint, and typecheck commands
run recursively so future workspaces can participate by defining those scripts.

The web application uses the Next.js App Router. Pages and layouts are Server
Components by default. The landing page is statically rendered, uses system
fonts, and has no application client components or third-party scripts. The
office illustration is server-rendered SVG artwork, not a game runtime.

`GET /api/health` returns HTTP 200 with `{"status":"ok","service":"web"}`
and `Cache-Control: no-store`. It reports web process availability only; it does
not check any future service or database.

## Code placement

- `src/app`: routes, layouts, page composition, and route handlers.
- `src/components`: reusable presentation components.
- `src/features`: future feature-specific UI and business logic; create when needed.
- `src/lib`: future shared utilities and server integrations; create when needed.

Keep business rules in feature modules rather than presentation components.
Introduce abstractions only when actual reuse or complexity calls for them.
Use `@/*` for imports within `apps/web/src`.

## Future service boundaries

The workspace patterns reserve `apps/*` and `packages/*`. Add `apps/realtime`
for a dedicated Colyseus process and `packages/shared` for cross-service contracts
when those phases begin. No empty service packages are initialized now.

Phaser will own rendering and local movement in a lazily loaded office view.
Keep its game loop separate from React state. LiveKit will handle voice, while
Supabase will supply PostgreSQL, authentication, and storage. None of these
dependencies, credentials, schemas, or integrations are part of this step.

Tenant isolation must be designed and enforced at data and realtime service
boundaries in its assigned phase; the foundation makes no isolation guarantees.

## Visual direction

Use an original, top-down 2D pixel office on a 32×32 logical tile grid, crisp
nearest-neighbor scaling, consistent sprite dimensions, and uncluttered layouts.
Future assets should include office furniture and decoration. Four-direction
avatars and subtle idle/walk animation belong to the engine phase. Load texture
atlases and office assets only when entering an office.

Surrounding application UI uses clean typography, accessible controls, restrained
colors, and consistent spacing. Avoid mixing realistic or 3D art with the pixel
environment. The current static illustration establishes visual direction only;
it is not a map format, sprite sheet, or avatar implementation.
