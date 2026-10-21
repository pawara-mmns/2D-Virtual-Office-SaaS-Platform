# Virtual Office

A multi-tenant 2D virtual office SaaS platform for distributed teams. The planned
product will give companies private pixel-art offices with realtime movement,
chat, and voice. **Phase 1 — Step 1 is the frontend foundation only.**

## Technology stack

- Next.js 16 App Router and React 19
- TypeScript in strict mode, with unchecked indexed access enabled
- Tailwind CSS 4 and ESLint 9 with Next.js Core Web Vitals and TypeScript rules
- pnpm 10 workspaces, with an exact package-manager version and lockfile

Planned, not installed: Phaser, Colyseus, LiveKit, and Supabase.

ESLint is pinned to the latest 9.x release for compatibility with the React lint
plugin supplied by `eslint-config-next`. npm currently marks that major as
deprecated; upgrade when the plugin declares support for the next major.

## Folder structure

```text
apps/
  web/
    src/
      app/
        api/health/route.ts
        globals.css
        icon.svg
        layout.tsx
        page.tsx
      components/
        office-preview.tsx
    eslint.config.mjs
    package.json
    postcss.config.mjs
    tsconfig.json
docs/
  architecture.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

Create `apps/web/src/features` and `apps/web/src/lib` when the first feature or
utility needs them. `apps/realtime` and `packages/shared` are reserved future
locations, not initialized packages. See [architecture notes](docs/architecture.md)
for module boundaries and the approved pixel-art direction.

## Local development

Use Node.js 24 LTS (recorded in `.node-version`; minimum supported version for this
workspace is 22.14). Run commands from the repository root.

If pnpm is not installed and Corepack is available, enable its pnpm shim once:

```sh
corepack enable pnpm
```

Then, with pnpm available on your PATH:

```sh
pnpm install
pnpm dev
```

Open <http://localhost:3000>. No environment variables, external accounts, or
database are required, so there is no `.env.example` yet. Introduce one when the
first integration needs configuration, and never commit credentials.

On Windows with restrictive PowerShell execution policy, use `corepack.cmd pnpm`
or `pnpm.cmd` instead of their PowerShell shims. If Corepack is unavailable,
install pnpm 10.34.7 with `npm install --global pnpm@10.34.7` first.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the web development server |
| `pnpm build` | Create production builds for initialized workspaces |
| `pnpm start` | Serve the production web build |
| `pnpm lint` | Run ESLint; warnings fail the check |
| `pnpm typecheck` | Generate Next.js route types and run TypeScript checks |
| `pnpm install --frozen-lockfile` | Install the exact locked dependencies in CI |

The root scripts invoke `pnpm`, so its shim or installation must be on PATH.
Type checking works on a fresh checkout before a build; Next.js generates
`next-env.d.ts` and route types.

Validate changes with:

```sh
pnpm lint
pnpm typecheck
pnpm build
```

After `pnpm build`, run `pnpm start`. `GET /api/health` returns HTTP 200:

```json
{ "status": "ok", "service": "web" }
```

The endpoint checks that the web application is running. It does not check future
backend dependencies. The landing page is a static Server Component with an
original pixel-office illustration; its links navigate to the vision section.
It provides no authentication, signup, or office interaction.

## Future implementation phases

These are scope boundaries, not implemented features or a fixed delivery order:

1. **Foundation (current):** workspace, web app, landing page, health endpoint,
   documentation, and development checks.
2. **Identity and tenancy:** Supabase configuration, authentication, organizations,
   authorization, and tenant isolation.
3. **2D office:** lazily loaded Phaser renderer, 32×32 tiles, office assets,
   four-direction avatars, and subtle idle/walk animations.
4. **Realtime collaboration:** dedicated Colyseus service, shared contracts,
   multiplayer movement, presence, and chat.
5. **Voice and production hardening:** LiveKit, communication controls, operational
   validation, accessibility, security, and performance work.

Each phase requires a separate implementation task. No engine, realtime service,
auth, database schema, container infrastructure, or backend simulation is included
in Phase 1 — Step 1.
