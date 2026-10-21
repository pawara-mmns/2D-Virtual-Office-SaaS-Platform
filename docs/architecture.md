# Architecture and scope

## Current foundation, authentication, and organizations

This repository uses pnpm workspaces without an additional task runner. Only
`apps/web` is an executable workspace. Root build, lint, and typecheck commands
run recursively so future workspaces can participate by defining those scripts.

The web application uses the Next.js App Router. Pages and layouts are Server
Components by default. The landing page is statically rendered, uses system
fonts, and its page content has no application client components or third-party
scripts. The office illustration is server-rendered SVG artwork, not a game runtime.

`GET /api/health` returns HTTP 200 with `{"status":"ok","service":"web"}`
and `Cache-Control: no-store`. It reports web process availability only; it does
not check any future service or database.

## Code placement

- `src/app`: routes, layouts, page composition, and route handlers.
- `src/components`: reusable presentation components.
- `src/features/auth`: authentication UI, validation, actions, and access rules.
- `src/features/organizations`: organization validation, RPC/data access, and UI.
- `src/lib/supabase`: centralized Supabase client and session-refresh utilities.

Keep business rules in feature modules rather than presentation components.
Introduce abstractions only when actual reuse or complexity calls for them.
Use `@/*` for imports within `apps/web/src`.

## Future service boundaries

The workspace patterns reserve `apps/*` and `packages/*`. Add `apps/realtime`
for a dedicated Colyseus process and `packages/shared` for cross-service contracts
when those phases begin. No empty service packages are initialized now.

Phaser will own rendering and local movement in a lazily loaded office view.
Keep its game loop separate from React state. LiveKit will handle voice.
Supabase Auth is configured through the two public environment variables in
`apps/web/.env.example`. Organization schema/RLS and server data access are now
defined in the Step 3 migration. Remote application has a separate approval gate.
Storage, game, realtime, and voice integrations remain deferred.

## Authentication boundary

`src/lib/supabase` owns browser/server clients and cookie refresh. Next.js 16
`src/proxy.ts` refreshes sessions with `getClaims()` and marks auth/dashboard
responses private and uncached. The Proxy does not grant access: the dashboard
calls `requireUser()`, which uses a fresh `getUser()` lookup and checks
`email_confirmed_at`. Authentication failures deny access. Never authorize using
`getSession()` cookie user data.

`src/features/auth` owns server actions, validation, access helpers, and form UI.
Server Actions provide Next.js origin checks for form mutations. Passwords are
validated on the server and never returned in action state. Errors shown to users
are controlled messages, not raw provider exceptions. Session cookies follow the
Supabase SSR package defaults, which permit browser-client access; do not treat
cookie contents as trusted identity. No custom JWT signing or auth tables exist.

Signup verification uses a `token_hash` email template and `verifyOtp`. Accepted
types are limited to `email` and `recovery`; destinations are fixed local paths.
Recovery GET requests transfer the opaque token to a 10-minute HttpOnly cookie
scoped to `/reset-password`, then redirect to a clean URL. Presence of this cookie
only enables a generic form. On submission Supabase must verify the token with
`type: recovery` before `updateUser` can run; an existing session is insufficient.
Deferring verification avoids consuming recovery tokens through email scanners.
The cookie is cleared after the attempt. If verification consumes a token but the
password update fails, users must request a new link. Successful resets attempt
global sign-out and always clear the local session. Existing access tokens can
remain valid until expiry, as with Supabase sign-out generally.

Missing configuration disables forms with setup instructions, leaves public
routes functional, and denies dashboard access. No placeholder credentials are
used. Live Supabase tests require the user's existing configured project.

## Organization boundary

Organization creation uses one PostgreSQL RPC transaction for profile, organization,
OWNER membership, and default office. User/request UUIDs give retries an exact
idempotency key; tenant identity and roles come from trusted Auth/database context.
All four public tables have RLS and restricted grants. Private read-only helpers
avoid circular membership policies. Direct authenticated membership writes remain
denied; Step 4 adds the narrowly authorized operations described below.

The active organization is represented by `/workspace/[organizationId]`. Pages
and data access verify the caller, membership, and RLS-visible records. The URL or
a client state value never grants access. React request-scoped auth deduplication
and pre-loading-boundary authentication preserve private HTTP redirects; pages
and data helpers retain their checks. All private routes are no-store.

See [organization architecture](organizations.md) and [actual validation status](organization-validation.md).
SQL syntax/mock tests do not prove deployed tenant isolation. Real database tests
and application require the approved development migration; no guarantees about
remote RLS are claimed before execution. Realtime tenant authorization remains a
future service responsibility.

## Team and invitation boundary

The applied Step 4 migration adds hashed invitations, private audit records,
authorized membership functions and a last-owner guard. Organization row locks
serialize reservations, acceptance and membership changes. Existing tables and
Auth internals are preserved. Public-role table writes remain denied; scoped
definer functions independently verify identity, tenant and permission hierarchy.

`features/invitations` separates validation/token handling, data access and real
Resend delivery; `features/members` separates server authorization/actions and
membership presentation. Database and external email requests are separate steps,
with explicit uncertainty handling and token rotation on intentional resend.
Raw invitation proof never enters database rows or member-list props. The optional
development/test-only link mode returns it once in the authorized manager's action
result for copying, using the existing create/rotation RPCs. Production rejects
link mode before writes. Email mode keeps proof in server delivery only. HttpOnly cookie
continuation permits only fixed local post-login paths. All team/invite routes
are private/no-store. Provider credentials are server-only.

See [team architecture and security](team-invitations.md) and
[actual validation/application status](team-invitations-validation.md). Isolated
PostgreSQL tests execute real roles and RLS with synthetic local Auth fixtures;
live Auth/PostgREST, provider delivery and concurrent sessions remain distinct
verification requirements. Future realtime/media services must revoke access and
disconnect removed members themselves; those services are not implemented.

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
