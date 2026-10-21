# Virtual Office

A multi-tenant 2D virtual office SaaS platform for distributed teams. The planned
product will give companies private pixel-art offices with realtime movement,
chat, and voice. **Phase 2 — Step 1 adds the first interactive single-player office.**

The protected office route now uses Phaser 4.2.1, an original 32×32 pixel-art map,
local avatar movement, collision and camera controls. See
[office setup and actual validation results](docs/phaser-office-validation.md).

Step 4's approved migration is applied to the confirmed development project.
Schema, permission and account-independent regression checks passed. Real
invitation email and authenticated team workflows remain unverified; see
[Step 4 validation](docs/team-invitations-validation.md).

## Technology stack

- Next.js 16 App Router and React 19
- TypeScript in strict mode, with unchecked indexed access enabled
- Tailwind CSS 4 and ESLint 9 with Next.js Core Web Vitals and TypeScript rules
- pnpm 10 workspaces, with an exact package-manager version and lockfile
- Supabase Auth through `@supabase/supabase-js` and `@supabase/ssr`
- Phaser 4.2.1, loaded only when entering the protected office

Supabase PostgreSQL organization migrations and server data access are included;
check [migration and validation status](docs/organization-validation.md) before
using them. Planned, not installed: Colyseus and LiveKit. Storage remains
deferred.

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
        (auth)/
          layout.tsx
          login/page.tsx
          register/page.tsx
          forgot-password/page.tsx
          reset-password/page.tsx
        auth/confirm/route.ts
        invite/page.tsx
        invite/[token]/route.ts
        dashboard/page.tsx
        dashboard/layout.tsx
        dashboard/loading.tsx
        organizations/new/page.tsx
        workspace/layout.tsx
        workspace/[organizationId]/page.tsx
        workspace/[organizationId]/members/page.tsx
        workspace/[organizationId]/office/{page,loading}.tsx
        error.tsx
        globals.css
        icon.svg
        layout.tsx
        page.tsx
      components/
        office-preview.tsx
      features/auth/
        actions.ts, server.ts, service.ts, validation.ts, links.ts
        auth-form.tsx, auth-shell.tsx, sign-out-button.tsx
        auth.test.ts
      features/organizations/
        actions.ts, server.ts, service.ts, validation.ts
        organization-form.tsx, workspace-shell.tsx, workspace-switcher.tsx
        organizations.test.ts
      features/invitations/
        actions.ts, email.ts, errors.ts, service.ts, token.ts, validation.ts
        invitations.test.ts
      features/members/
        actions.ts, server.ts, service.ts, action-form.tsx, team-management.tsx
      features/office/
        access.ts, office.test.ts
        components/, engine/, scenes/, input/, maps/
      lib/supabase/
        client.ts, server.ts, proxy.ts, config.ts, config.test.ts
        database.types.ts
      proxy.ts
    tests/auth-routes.test.mjs
    tests/organizations-live.test.mjs
    tests/team-live.test.mjs
    public/office/
      office-tiles.png, avatar.png, studio.json, ASSETS.md
    .env.example
    eslint.config.mjs
    package.json
    postcss.config.mjs
    tsconfig.json
docs/
  architecture.md
  organizations.md
  organization-validation.md
  team-invitations.md
  team-invitations-validation.md
  phaser-office-validation.md
supabase/
  config.toml
  .env.organization-tests.example
  migrations/20261021000100_organization_foundation.sql
  migrations/20261021000200_team_invitations.sql
  tests/organization_policies.sql
  tests/team_invitations.sql
  tests/team_schema_audit.sql
  tests/team_access_guards.sql
scripts/
  test-organizations.mjs
  test-organizations.test.mjs
  team-database.test.mjs
  generate-office-assets.mjs
  test-office-browser.mjs
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

`apps/realtime` and `packages/shared` are reserved future
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

Open <http://localhost:3000>. The landing page and health endpoint run without
configuration. Authentication needs the existing Supabase project; no local
PostgreSQL database, Supabase CLI, or new project is required.

### Supabase environment

Copy `apps/web/.env.example` to **`apps/web/.env.local`**, then fill in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Find the Project URL and publishable key in the existing project's **Connect**
dialog or **Project Settings → API Keys**. Use the `sb_publishable_...` key.
Secret keys (`sb_secret_...`), service-role keys, and legacy JWT keys are not
accepted by this implementation. Never paste a secret key into a public variable.
The URL must be an HTTPS origin (localhost HTTP is supported). These values are
public client configuration; Next.js embeds them into browser builds. Restart
development or rebuild production after changing them. `.env.local` is ignored.
An existing `apps/web/.env` is also supported and ignored by Git; the verified
Step 2B configuration uses that file. `.env.local` takes precedence if both exist.

With missing or invalid configuration, auth forms are disabled with an explicit
setup message, and the dashboard redirects to login. No credentials are invented.

### Supabase dashboard configuration

In the existing project's Authentication settings:

1. Enable email/password signup and **Confirm email**. Use a minimum password
   length of 12 to match the app; any stronger provider policy is still enforced.
2. Set **URL Configuration → Site URL** to exactly `http://localhost:3000` for
   this local setup (no trailing slash). If you use another port, update it.
3. Add these exact local Redirect URLs, avoiding broad wildcards:
   `http://localhost:3000/auth/confirm`, `http://localhost:3000/reset-password`,
   and `http://localhost:3000/dashboard`.
4. Under **Email Templates → Confirm signup**, use this link:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">Verify email</a>
   ```

5. Under **Email Templates → Reset password**, use this link:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a>
   ```

The custom templates are required: default implicit fragment links and OAuth
`?code=` callbacks are not handled in this email/password-only phase. Emails use
the trusted Supabase Site URL; the app does not accept a request-supplied email
redirect origin. The exact Redirect URLs keep configuration explicit, although
these templates build links directly from Site URL rather than RedirectTo.
Use separate projects or carefully change Site URL when testing another origin.

Review the project's SMTP recipient restrictions and email rate limits. The
default email service is limited; use an allowed test recipient or your own SMTP
provider. Disable email link tracking. Do not disable email confirmation to work
around delivery problems. Check Authentication logs without sharing tokens or
passwords.

The implementation follows [Supabase's SSR client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[password authentication](https://supabase.com/docs/guides/auth/passwords), and
[SSR email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

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
| `pnpm test` | Run auth, organization, invitation and office unit tests with Node's built-in runner |
| `pnpm test:smoke` | Start a production build temporarily and check HTTP routes |
| `pnpm test:live` | Opt-in configured-project connectivity and invalid-proof checks |
| `pnpm test:organization-setup` | Check rollback-runner safety and configuration locally |
| `pnpm test:organizations:anonymous` | Live public-key-only organization access rejection checks |
| `pnpm test:organizations --check` | Validate local dedicated test-account configuration; no DB tests |
| `pnpm test:organizations` | Live provisioning/RLS suite with three confirmed test users; rolls back |
| `pnpm test:team:database` | Disposable in-memory PostgreSQL team/RLS and foundation regression tests |
| `pnpm test:team:live --check` | Validate dedicated test-account setup without running SQL |
| `pnpm test:team:live` | Live rollback-only team policy suite after migration approval/application |
| `pnpm test:team:anonymous` | Live invitation API permission denials and invalid-preview checks; no accounts |
| `pnpm assets:office` | Regenerate original pixel-art assets and the Tiled office map |
| `pnpm test:office:browser` | Run an isolated real Chromium engine test; no accounts or database |
| `pnpm install --frozen-lockfile` | Install the exact locked dependencies in CI |

The root scripts invoke `pnpm`, so its shim or installation must be on PATH.
Type checking works on a fresh checkout before a build; Next.js generates
`next-env.d.ts` and route types.

Validate changes with:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
```

With real Supabase configuration and network access, also run `pnpm test:live`
after building. It checks public Auth health/settings, unauthenticated access,
synthetic invalid tokens, and the application's negative paths. It does not create
accounts, send emails, change real passwords, or bypass email confirmation.

After `pnpm build`, run `pnpm start`. `GET /api/health` returns HTTP 200:

```json
{ "status": "ok", "service": "web" }
```

The endpoint checks that the web application is running. It does not check future
backend dependencies. The landing page is a static Server Component with an
original pixel-office illustration; its links navigate to the vision section.
The existing landing design is preserved, with a sign-in link added. It provides
no office interaction.

## Authentication behavior and manual test checklist

- `/register`: submit email, password, and confirmation. Invalid values fail on
  the server. The success message tells users to check their email; it does not
  claim that a particular address exists or that delivery is guaranteed.
- `/auth/confirm`: follow the verification email. A valid `type=email` token is
  verified with Supabase and redirects to `/dashboard`. Invalid/expired links
  return a controlled login notice; registering again can request verification.
- `/login`: test wrong credentials, an unverified account, and a verified account.
  A verified user is redirected to `/dashboard`; login/register pages also
  redirect existing verified sessions there.
- `/dashboard`: test a signed-out browser and a session with an expired/revoked
  token. Protected content requires a fresh `getUser()` and a confirmed email.
  A successful visit shows only the account email, sign-out, and empty workspace.
- Sign out, refresh, and use browser Back. Dashboard content must remain gated.
  Sign-out clears local cookies even if Auth is unavailable and reports that
  remote revocation could not be confirmed. No public caching is allowed.
- `/forgot-password`: request resets for an existing and unknown email; both use
  the same success wording. Check the email in the existing account's inbox.
- Open its reset link. `/auth/confirm` transfers the opaque token into a
  10-minute HttpOnly cookie scoped to `/reset-password` and redirects to a clean
  URL. Verification is deferred to submission so scanners cannot consume the
  token. Submit matching new passwords. Supabase must verify `type=recovery`
  before updating; a regular login alone does not authorize this form.
- A successful reset attempts to revoke all sessions, clears local cookies, and
  returns to login. Verify the new password works and the old one fails. Supabase
  access tokens already issued may remain valid until expiry. A revocation
  failure gets a separate notice rather than a claim that all sessions ended.
- Test an expired/used link, altered type/hash, duplicate callback parameters,
  direct `/reset-password`, mismatched passwords, and an external `next` URL.
  None should bypass verification or redirect outside this app.
- Use keyboard navigation and a mobile viewport. Check labels, focus visibility,
  pending buttons, inline errors, and success messages. Test a network outage;
  errors should stay generic and retryable, without exposing provider details.

Automated tests use isolated in-memory fixtures, not the remote project. Smoke
tests require `pnpm build` first and start/stop their own local production server.
They cover public routes, private caching headers, unauthorized dashboard access,
invalid callbacks, and reset without proof. They do not send emails or create
accounts. No test framework dependencies are installed.

### Troubleshooting

- **Setup message:** check `apps/web/.env.local`, the publishable key prefix, and
  the project URL. Restart/rebuild after changing public environment variables.
- **No email:** check spam, provider logs, SMTP restrictions, rate limits, and
  the recipient allowlist. The safe recovery message intentionally hides whether
  an address exists. Wait before retrying; do not repeatedly resend.
- **Expired link:** request a new one. Tokens are one-time; the app's reset
  cookie lasts 10 minutes after opening the link. If password updating fails after
  verification, the consumed token cannot be reused. Request another reset.
- **Session missing after confirmation:** verify the custom templates above,
  Site URL/port, cookie settings, and browser origin. `localhost` and `127.0.0.1`
  have separate cookie stores. Keep app and email links on the same configured
  origin. Use HTTPS outside localhost.
- **Verification required / signup configuration warning:** enable Confirm email
  in Supabase. The app deliberately rejects immediate signup sessions when that
  setting is disabled.
- **Auth unavailable:** the app denies private access during provider/network
  errors. Retry later; do not loosen authorization checks.

Step 2B verified real-project connectivity and negative paths with the configured
publishable key. Successful registration, email delivery, confirmation, login,
session refresh, logout, and recovery still require a permitted test inbox/account
and manual verification. See [actual validation results](docs/authentication-validation.md)
for the distinction between passed checks and untested workflows.

## Future implementation phases

These are scope boundaries, not implemented features or a fixed delivery order:

1. **Foundation (current):** workspace, web app, landing page, health endpoint,
   documentation, and development checks.
2. **Authentication (current step):** Supabase SSR clients, email verification,
   login/logout, password recovery, and server-protected dashboard. Live project
   configuration and email workflow verification remain external setup.
3. **Organizations (current):** atomic workspace/default office creation, member
   roles, workspace switching, and tenant RLS. Remote migration and database tests
   require the separate safety/approval workflow in [organization docs](docs/organizations.md).
4. **Team invitations (current):** real email adapter, verified-email acceptance,
   member management, ownership transfer and tenant RLS. The development migration
   is applied; authenticated/email/browser verification still needs the setup
   described in the validation report.
5. **2D office (current):** lazily loaded Phaser renderer, original 32×32 map and
   assets, one four-direction avatar with walking/idle state, collisions and camera.
6. **Realtime collaboration:** dedicated Colyseus service, shared contracts,
   multiplayer movement, presence, and chat.
7. **Voice and production hardening:** LiveKit, communication controls, operational
   validation, accessibility, security, and performance work.

Each phase requires a separate implementation task. The local office engine is
implemented; realtime, container infrastructure and later product features remain
deferred. Stop at Phase 2 Step 1; multiplayer is not implemented.

## Organization setup

Use the existing Supabase project and the same public URL/publishable key. Follow
[organization architecture, schema, security, migration and testing instructions](docs/organizations.md).
Migration `20261021000100_organization_foundation.sql` was applied with explicit
approval to development project `rofutnholbtdmxccrkbs`; its remote history/schema
checks passed. Live authenticated provisioning/cross-tenant tests remain NOT TESTED
until three dedicated, normally confirmed accounts are available. Prepare them
using the [account setup instructions](docs/organizations.md#dedicated-test-accounts).
No service-role browser key or local database is needed. Future migrations still
require target/history/schema/dry-run review and explicit approval.

## Team invitations

For local testing without an invitation email provider, set
`INVITATION_DELIVERY_MODE=link` in the existing ignored `apps/web/.env` and keep
`APP_URL=http://localhost:3000` (or your trusted local origin). Restart `pnpm dev`.
Team members offers **Create invitation link**, **Copy link**, and **Regenerate
invitation link**. Normal verified-email acceptance and database permissions still
apply. Links are displayed only for the issuing action; regeneration invalidates
older links. No email is sent in this mode. Production rejects link mode; use
`INVITATION_DELIVERY_MODE=email` or omit the setting for normal Resend delivery.
See [development link security/setup](docs/team-invitations.md#development-invitation-links).

Open **Team members** from a workspace. Owners/admins can send role-scoped
invitations, resend or revoke them, and manage authorized members. Ownership
transfer is explicit, atomic and audited. Members have a read-only directory.
Invitations reserve seats toward the ten-member limit and expire after seven days.

Configure server-only `APP_URL`, `RESEND_API_KEY` and `INVITATION_FROM_EMAIL` in
the existing ignored web env file. Use a verified Resend sender, HTTPS in deployed
environments and disabled email click/open tracking. Unconfigured sends report an
accurate error; no fake email is used. There is no new application dependency for
delivery. PGlite is development-only for disposable SQL tests.

The invitation link captures proof into an HttpOnly cookie, then uses clean
`/invite` for preview, normal registration/login continuation and explicit verified
email acceptance. Token-bearing paths need redaction in deployment access logs.
See [architecture/configuration/test instructions](docs/team-invitations.md) and
[actual PASS/NOT TESTED results and approval status](docs/team-invitations-validation.md).
