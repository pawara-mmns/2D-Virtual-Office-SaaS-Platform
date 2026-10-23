# Phase 1 — Step 2B live authentication verification

Validation date: 2026-10-21. Assigned branch was verified as
`feature/p1-s02-supabase-auth` before edits. No branch changes, staging, commits,
pushes, merges, or rebases were performed.

## Configuration and connectivity

- **PASSED:** the existing `apps/web/.env` contains both required variables and
  passes the application's URL/publishable-key validation. `.env.local` is not
  present; Next.js loads `.env` correctly. No file was moved or rewritten.
- **PASSED:** browser-client factory initialization in Node and SSR client
  initialization. This is not an interactive browser test.
- **PASSED:** real `GET /auth/v1/health` and `GET /auth/v1/settings` returned HTTP
  200 using the configured publishable key.
- **PASSED:** the public settings response reports email signup enabled and
  email confirmation required. That setting was not changed.
- No credential values, session tokens, real email links, or project URLs are
  included in this record or test output. No privileged key or admin API was used.
- Network requests initially failed inside the restricted execution sandbox
  (`EACCES`); the same requests passed with approved network execution. This was
  an execution-environment restriction, not a Supabase connectivity failure.

## Final automated results

| Check | Result |
| --- | --- |
| `pnpm lint` | PASSED: no errors or warnings |
| `pnpm typecheck` | PASSED |
| `pnpm test` | PASSED: 13 focused unit tests |
| `pnpm build` | PASSED with configured `.env`: landing static; auth/dashboard dynamic |
| `pnpm test:smoke` | PASSED: 5 production HTTP smoke tests |
| `pnpm test:live` | PASSED: 8 configured-project integration tests |
| Unresolved automated failures | None |

The opt-in live suite uses only public-key requests, deliberately invalid
synthetic proof, and requests that fail server validation. It creates no account,
sends no email, and updates no real user's password. Production HTTP forms are
submitted with their actual Server Action metadata and same-origin headers;
these are HTTP integration tests, not browser automation.

| Workflow/security check | Status and evidence |
| --- | --- |
| Public Auth endpoint without user token | PASSED: `/auth/v1/user` returns 401 |
| Anonymous dashboard access | PASSED: login redirect; no protected content; `no-store` |
| Configured registration form | PASSED: enabled; invalid fields rejected by real server-action POST |
| Real successful registration | NOT TESTED: user chose manual account verification |
| Unverified account access | PASSED in unit tests; NOT TESTED with a real unverified account |
| Invalid confirmation token | PASSED against live Auth and through the app callback |
| External `next` destinations | PASSED: callback remains local; recovery goes only to reset-password |
| Invalid recovery proof | PASSED against live Auth and through the real reset Server Action |
| Genuinely expired recovery email link | NOT TESTED: no issued email link/inbox used |
| Recovery cookie transport | PASSED by HTTP checks: HttpOnly, Secure, SameSite=Lax, 10-minute lifetime, reset-only path, no token in reset HTML/URL, cleared after submission |
| Forged expired session cookie | PASSED against configured app/provider: cannot authorize dashboard |
| Genuine session expiration/refresh | NOT TESTED: requires a valid signed-in session |
| Logout and local/remote revocation | PASSED helper tests/code review; NOT TESTED using a real authenticated session |
| Successful confirmation/login/recovery | NOT TESTED: requires a controlled account and inbox |
| Interactive browser/responsive/accessibility checks | NOT TESTED: no browser surface available to automation |

Supabase returned 403 / `otp_expired` for synthetic invalid email and recovery
proof. That is its combined invalid/expired error response. This does **not**
prove that a genuinely issued link was allowed to expire and then tested.

The smoke server uses an available loopback port and is stopped after the tests.
Callback redirects use relative paths to preserve the exact browser origin;
there is no `127.0.0.1` to `localhost` cookie-origin switch.

## SSR flow review and fixes

- **PASSED code review:** per-request Supabase SSR clients read/write cookie
  batches, Next.js 16 Proxy refreshes with `getClaims()`, and the dashboard
  independently calls fresh `getUser()` and requires `email_confirmed_at`.
  Cookie `getSession()` user data is not the authorization boundary.
- **PASSED negative integration:** email confirmation uses `token_hash` plus
  `type=email` with `verifyOtp`. Recovery transfers an opaque hash into a scoped
  HttpOnly cookie, then verifies `type=recovery` only on password submission.
  A regular session or forged cookie does not substitute for recovery proof.
  Valid-token email lifecycle behavior remains a manual check.
- **FIXED:** forgot-password handling treated a provider transport error with
  status 0/undefined as a successful submission. Recovery requests now return a
  controlled outage error for transport failures/5xx while preserving identical
  safe messaging for account-specific rejections and rate limits. Two regression
  tests cover outage handling and enumeration-safe responses.
- **TEST CORRECTION:** an initial live assertion mistook the Tailwind class
  `disabled:opacity-70` for an actual disabled fieldset attribute. The assertion
  now checks the HTML attribute. The final live suite passes all eight tests.

The implementation was reviewed against the official
[SSR client guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[password guide](https://supabase.com/docs/guides/auth/passwords), and
[email-template guide](https://supabase.com/docs/guides/auth/auth-email-templates).

## Exact Supabase Dashboard settings required

The publishable key cannot inspect the saved Site URL, redirect allowlist, email
template contents, or SMTP configuration. These settings are **NOT TESTED in the
Dashboard** and must be checked manually in the existing project:

1. **Authentication → Sign In / Providers → Email:** enable email/password signup
   and keep **Confirm email enabled**. Email/confirmation flags were verified via
   the public settings API. Set minimum password length to 12 to match the app.
2. **Authentication → URL Configuration → Site URL:** `http://localhost:3000`
   for local development. Use the actual browser origin/port, without a trailing
   slash. Do not mix localhost and 127.0.0.1 during account tests.
3. **Redirect URLs:** add exact local entries
   `http://localhost:3000/auth/confirm`,
   `http://localhost:3000/reset-password`, and
   `http://localhost:3000/dashboard`. Do not add broad wildcard destinations.
   These custom templates use Site URL directly; the app does not accept an
   arbitrary RedirectTo or request-derived email origin.
4. **Email Templates → Confirm signup:**

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">Verify email</a>
   ```

5. **Email Templates → Reset password:**

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a>
   ```

6. Confirm SMTP/test-recipient eligibility and email rate limits; disable email
   link tracking. Do not disable confirmation to work around email delivery.

## Manual verification still required and merge readiness

The user requested successful account flows be recorded as manual verification.
No test password or authenticated session was supplied. Browser inventory exposed
no automation-capable browser. No remote user was created or modified, and no
email was sent during the automated checks.

Run `pnpm dev`, then use a dedicated account and inbox you control:

1. Register at `http://localhost:3000/register`. Before opening the email, attempt
   login and direct dashboard access; both must deny the unverified account.
2. Open the verification link in your inbox using the same configured origin.
   Confirm dashboard email/empty state. Reopen the used link and check safe error
   handling in a signed-out browser. Do not paste email links or tokens in chat.
3. Sign out, then refresh/revisit dashboard and use browser Back. Protected data
   must stay gated. Sign in again with valid credentials and check login/register
   redirect appropriately.
4. Request recovery for that account via `/forgot-password`. Open the email link,
   check that the reset-page URL is clean, save a new password, then verify the
   new password works and the old one fails. Retry the used link.
5. Request another link, let the configured email token lifetime expire, and
   verify rejection. Separately wait over 10 minutes after opening a reset link
   to check the application's recovery-cookie expiry and fresh-link instructions.
6. Keep a legitimate session until access-token expiry, then reload dashboard
   and check refresh persistence. Verify sign-out/revocation behavior afterward.
   Do not fabricate a JWT or disable verification. Existing access tokens can
   remain valid until expiry even after refresh-token revocation.
7. Check mobile layout, keyboard focus, inline errors, pending controls, and a
   real browser/network outage.

**Merge readiness: pending manual end-to-end account checks.** Automated local
checks and live negative-path checks pass. Successful confirmation, recovery,
session refresh, and logout must be recorded before calling authentication fully
verified. There are no remaining automated test failures.

Follow the development instructions and full checklist in [README.md](../README.md). No application
tables, organization management, local PostgreSQL, new Supabase project, game,
realtime service, voice integration, or deployment was added.

Installed dependencies: `@supabase/supabase-js@2.118.0` and `@supabase/ssr@0.12.7`.
The existing ESLint 9 compatibility deprecation remains unchanged.

## Files changed in Step 2B

```text
apps/web/src/features/auth/actions.ts
apps/web/src/features/auth/service.ts
apps/web/src/features/auth/auth.test.ts
apps/web/tests/auth-routes.test.mjs
apps/web/tests/auth-live.test.mjs (new)
apps/web/tests/helpers/production-app.mjs (new)
apps/web/package.json
package.json
README.md
docs/authentication-validation.md
```

No dependencies were added or updated in Step 2B. The existing configuration file
was preserved. No Step 3, organization, or deployment work was performed.

## Original Step 2 created files

All paths below are relative to the repository root.

```text
apps/web/.env.example
apps/web/src/proxy.ts
apps/web/src/lib/supabase/client.ts
apps/web/src/lib/supabase/server.ts
apps/web/src/lib/supabase/proxy.ts
apps/web/src/lib/supabase/config.ts
apps/web/src/lib/supabase/config.test.ts
apps/web/src/features/auth/actions.ts
apps/web/src/features/auth/server.ts
apps/web/src/features/auth/service.ts
apps/web/src/features/auth/validation.ts
apps/web/src/features/auth/links.ts
apps/web/src/features/auth/auth-form.tsx
apps/web/src/features/auth/auth-shell.tsx
apps/web/src/features/auth/sign-out-button.tsx
apps/web/src/features/auth/auth.test.ts
apps/web/src/app/(auth)/layout.tsx
apps/web/src/app/(auth)/login/page.tsx
apps/web/src/app/(auth)/register/page.tsx
apps/web/src/app/(auth)/forgot-password/page.tsx
apps/web/src/app/(auth)/reset-password/page.tsx
apps/web/src/app/auth/confirm/route.ts
apps/web/src/app/dashboard/page.tsx
apps/web/src/app/error.tsx
apps/web/tests/auth-routes.test.mjs
docs/authentication-validation.md
```

## Original Step 2 modified files

```text
package.json
pnpm-lock.yaml
apps/web/package.json
apps/web/tsconfig.json
apps/web/src/app/globals.css
apps/web/src/app/page.tsx
README.md
docs/architecture.md
```
