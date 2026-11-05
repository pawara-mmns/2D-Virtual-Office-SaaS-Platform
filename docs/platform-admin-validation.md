# Platform administration validation — 3 November 2026

Local working-tree implementation only. No Git branches/commits/pushes/merges, deployments, remote migration applications, real administrator creation or tenant mutations.

| Executed check | Result |
| --- | --- |
| Workspace lint | **PASS** — web and realtime, zero warnings |
| Workspace TypeScript | **PASS** — Next route generation and both apps, including tests |
| Production builds | **PASS** — Next.js and realtime |
| Workspace unit/regression suite | **PASS** — 139 web tests and 43 realtime tests |
| Admin database/security integration | **PASS** — 13 tests, no skips; isolated PostgreSQL execution with the restricted runtime role |
| Admin production HTTP/browser acceptance | **PASS** — 10 tests, no skips; disposable native PostgreSQL, actual Next server and actual browser |
| Existing auth/voice production-route checks | **PASS** — 13 tests |
| Existing team/chat/environment database suites | **PASS** — 3 suites; includes 54 team and 26 foundation assertions plus profile checks, 14 chat assertions plus explicit denials, and environment checks |
| Existing foundation/team/profile SQL after new migration | **PASS** — included in the 13-test admin database suite |
| Browser secret exposure scan | **PASS** — generated client chunks exclude admin database/key names, encrypted MFA fields and the randomly generated test password/key/secret |
| Responsive browser captures | **PASS** — 14 screenshots; no page overflow at desktop, 768px tablet and 390px mobile; local synthetic data only |
| Real Supabase/LiveKit/Resend authenticated manual acceptance | **NOT RUN** — requires a controlled local provider setup and explicitly selected test identities/mailboxes |
| Remote schema/history reconciliation and deployment | **NOT RUN** — intentionally left to the operator |

The native HTTP test covers unauthenticated/ordinary-session and owner-shaped session denial, invalid credentials, origin/CSRF/content-type rejection, mandatory MFA and session rotation, cross-tenant management, organization suspension/reactivation, membership/profile editing, ownership transfer, office revisions, Auth Admin suspension/reactivation/recovery through a local provider stub, concurrent ownership/suspension safeguards, strict settings validation, audit success/denial, logout-all revocation, and client secret exclusion. The browser signs in through the actual UI and verifies MFA using the synthetic account's authenticator. It then navigates every console module, opens real details, verifies empty and offline error feedback, and checks responsive layouts. It does not bypass production authorization or substitute fake UI data.

The database suite covers duplicate bootstrap refusal, Argon2 hashes, pending MFA sessions, valid/invalid passwords and codes, replay rejection, hashed session storage, expiration, credential-version invalidation, live step-up checks, cross-tenant create/update/suspend, last-owner constraints, safe profile and office configuration updates, optimistic revisions, versioned maintenance/registration gates, suspended-user restrictions, RLS/private permission denial for anon/authenticated roles, audit immutability, root protection, durable throttles, and normal tenant SQL regressions. The synthetic Auth table has RLS enabled; runtime user reads go through an explicit safe private projection, with direct Auth-table reads denied. The crypto tests also check an RFC 6238 SHA-1 vector, administrator-bound authenticated encryption, password policy, bounded request bodies and input validation. New realtime tests verify separate-key protection, aggregate counters, safe explicit room retirement and voice-disable admission denial.

The first broad regression run detected pnpm's unrelated Colyseus peer normalization loading two core copies. The original Colyseus peer resolution was restored while retaining new admin dependencies; the full suite subsequently passed. The first native database harness run needed Windows subprocess permissions and a pipe-handling correction; the final harness starts/stops its own loopback cluster successfully. A streaming loading boundary initially returned a redirect inside HTTP 200 for unauthorized pages; removing that boundary restored actual HTTP 307 redirects before protected rendering. These failures were resolved, not waived.

No real authenticated manual provider acceptance is claimed. The HTTP provider stub modifies only synthetic Auth fixture rows, and no test emails or voice content were sent/recorded. Hosted Auth hook activation, deployment TLS/cookies, actual email delivery, real voice revocation, operator backup/key recovery and independent security review remain acceptance gates. The known remote environment migration-history discrepancy was reviewed from repository evidence without connecting to or changing the remote target.

See [architecture, secure bootstrap/recovery instructions, limitations and the manual checklist](platform-admin.md). Representative screenshots: [desktop dashboard](assets/platform-admin/02-dashboard-desktop.png), [organization management](assets/platform-admin/04-organization-details.png), [mobile dashboard](assets/platform-admin/11-dashboard-mobile.png), [mobile network error](assets/platform-admin/14-error-state-mobile.png).

## Follow-up: local bootstrap configuration

`pnpm admin:setup:local` was added and executed successfully against this project's genuine Docker-based local Supabase stack. Pending migrations were applied locally; no reset or seed was run. A restricted runtime database login and server-only MFA/Auth configuration were saved in ignored `apps/web/.env.local`, without printing credentials. Re-running the setup completed successfully while preserving the runtime password and encryption key. Read-only checks confirmed restricted database access, a valid encryption-key format, local Auth Admin API readiness, and zero administrator accounts before interactive bootstrap. Existing hosted normal-user settings and tenant data were preserved. The user must choose the administrator password in the interactive bootstrap prompt, then enroll MFA. This readiness check does not constitute authenticated manual provider acceptance.
