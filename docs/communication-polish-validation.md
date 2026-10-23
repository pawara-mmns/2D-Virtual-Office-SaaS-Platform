# Communication, stabilization and private-beta validation

## Hosted voice disconnect investigation — 2026-10-23

**Merge-ready: YES for this scoped voice fix and preventive hardening.
Broader Cloud security/release sign-off remains
incomplete.** The user reports the existing hosted app passed single-user voice,
at least 60 seconds of connection stability, leave/rejoin, simultaneous two-user
voice, two-user audio communication and multiplayer presence, with no unexpected
disconnections after the conflicting local authority was stopped. These are
user-reported manual containment results, not automated
test or a hosted test of the undeployed code. This checkout's `.git/HEAD` references `main`; no Git command,
branch change, commit, deployment, migration or remote configuration change was
performed. Existing historical validation sections below remain historical.

### Evidence and root-cause boundary

**Confirmed condition: local and hosted voice authorities shared one Cloud
namespace. Leading explanation for the incident: conflicting orphan sweeps.**
The incident's exact disconnect reason and historical removal caller remain
unconfirmed; the manual improvement after stopping the local server strengthens
the explanation without proving that attribution definitively.
Read-only Railway CLI access confirmed project `adventurous-joy`, environment
`production`, service `realtime`. It had one active successful deployment and one
instance. Its current deployment was created at **2026-10-23 05:05:44.790 UTC**;
the preceding deployment was marked REMOVED. The deployment log snapshot contained
four startup/entry messages, including server/container startup around 05:07:39
UTC, and no per-admission authorization, removal or SDK-disconnection events.

Ten `/voice/token` HTTP records between **05:54:17.901 and 05:59:11.188 UTC** all
returned **200**, with recorded `totalDuration` **352–627 ms**. This verifies those
initial admission requests succeeded; it does not establish continued membership,
lease renewal, WebRTC media health, or why a later disconnection occurred.

An elevated, read-only process inspection then found a **local development
realtime watcher and child**, with the child listening on port **2567**. The watcher
started at **03:18:34.794 UTC**. A normal sandboxed process query had not exposed
these processes, so its earlier empty result was not evidence of their absence.
Local `/ready` reported voice **ready**. Local and Railway LiveKit configuration
was compared **only in memory**: Cloud URL, API key and derived namespace all
matched. No values, tokens, variable dumps or tenant identifiers were printed or
saved. Local `.env` leaves NODE_ENV unset; the existing development entry sets it
to development.

Before this fix, `livekitProvider()` derived the namespace only from the secret.
`createVoiceService().poll()` runs initially and every two seconds; it removes
participants missing from that process's `active` map. Thus the local authority
can classify a valid Railway admission as an orphan and call `removeParticipant`
with token revocation. This needs **only one voice user** and leaves Colyseus
multiplayer connected. The new isolated regression reproduces that exact
single-participant removal with two authorities sharing one provider namespace.

**Historical SDK reason: NOT TESTED / unavailable.** No captured browser
`RoomEvent.Disconnected` argument or matching Cloud session event was available.
The reported banner itself cannot prove PARTICIPANT_REMOVED: the old UI discarded
the reason and used the same banner for every established-session disconnect.
The shared-namespace operational conflict is confirmed and its failure mechanism
reproduced. Subsequent user-reported hosted retests passed for one user and for
two simultaneous voice users with audio communication and multiplayer presence
after the local authority was stopped, with no deployment or credential change. A matching
historical SDK/Cloud event is still missing. CLIENT_INITIATED, timeout and other
reasons have not been conclusively ruled out for that incident.

### Fix and modified files

| File | Change |
| --- | --- |
| `apps/realtime/src/voice/provider.ts` | Scope development and test inventory namespaces separately. Production retains its existing prefix, room identities and scoped grants. Each provider's actual `rooms()` filter excludes the other environments |
| `apps/realtime/src/voice/service.ts` | Timestamped fixed-category admission/renewal/removal/inventory/shutdown diagnostics with a random authority ID and only random UUID participant IDs. Record renewal duration, authorization age and remaining lease; retain the first removal cause. Route known inventory removals through the existing shared removal promise |
| `apps/realtime/.env.example` | Document environment isolation and the remaining one-authority-per-namespace requirement; warn against local production entry with hosted Cloud credentials |
| `apps/web/src/features/voice/disconnect.ts` | Translate installed SDK disconnect enums into fixed safe reason/message categories. A service removal does not assert membership revocation |
| `apps/web/src/features/voice/voice-session.tsx` | Record actual SDK reason, state, UTC timestamp, elapsed time and opaque participant correlation; record effect cleanup; remove added observers on cleanup. Preserve SDK reconnection and media teardown |
| `apps/web/src/features/voice/voice-bar.tsx` | Distinguish an explicit user stop from a failure in timestamped diagnostics, without logging message contents or admission proof |
| `apps/web/src/features/voice/voice.test.ts` | Reason-specific/unknown-reason privacy regression; finalization makes the existing watchdog-stage test deterministic with mocked timers |
| `apps/realtime/src/tests/voice.test.ts` | One/two-user valid renewals, environment isolation through the actual provider inventory method, competing-authority reproduction and concurrent inventory/timer removal regression |
| `scripts/test-voice-browser.mjs` | Single-user simulated session, distinct disconnect messages, explicit leave/rejoin, stopped tracks and application disconnect-listener cleanup |
| `docs/communication-polish-validation.md` | This actual-results update |

### Follow-up scope review — 2026-10-23, Asia/Colombo

Reviewed the **nine code/configuration/test files** listed above, plus this existing
report. **Retained all nine; no unnecessary experimental application changes
were identified.** Finalization changes only the existing timeout-stage test to
remove a reproduced wall-clock race; production code remains as reviewed. The
environment separation is a small guard against the observed configuration
collision; it preserves production room names. Shared removal fixes a separately
reproduced race. The fixed-category server/client diagnostics and accurate UI
messages address the inability to trace the original removal, without changing
connection policy. The configuration comments and three test files document and
exercise those specific behaviors. No unrelated existing modifications were
discarded, and no extra lifecycle rewrite, timer adjustment or feature was added.

**Single-authority operating requirement:** run exactly **one active realtime
voice authority per LiveKit inventory namespace**. A local/older production-mode
server must not share the hosted namespace. A replacement within the same
namespace requires stopping the previous authority before starting the next;
one configured replica does not by itself prove a rollout has no overlap.
The retained environment-scoping code isolates updated development/test builds,
but it does not protect against an old unpatched process, two processes in the
same environment, or a local production-mode entry. Separate Cloud projects and
credentials are preferable for independent environments; namespace filtering is
an accidental-cleanup guard, not a credential/security boundary. Do not weaken
or disable orphan cleanup to accommodate competing authorities. The conflicting
local server remains stopped and was not restarted during this follow-up.

**Security review:** retained token verification, verified membership/RLS checks,
tenant/office/zone binding, short initial tokens, independent authorization
renewal, lease expiry, explicit Cloud revocation cutoff and participant cleanup.
Production namespace behavior and existing security timings are unchanged.

**Operational containment performed:** stopped only the identified local Node
watcher and its current development realtime child, after verifying the listener,
entry flags and parent relationship. Port 2567 then had no listener. No local
frontend, hosted process or tenant record was changed. The watcher could restart
its child on source edits, so it was stopped before the namespace fix. Do not
restart an old build against the hosted Cloud project. The updated local
development command is `pnpm --filter @virtual-office/realtime dev`; a local
production-mode entry still intentionally shares the production namespace and
requires a different Cloud project or a cold stop of the hosted authority.

**Additional confirmed race:** the old inventory path bypassed `remove(record)`.
An inventory sweep and independent lease timer could issue concurrent removals
for one expired admission, with the sweep alone also leaving its local reservation
behind. An isolated in-memory before/after experiment restored just the old
inventory branch: **2 provider removal calls before, 1 after**. The fix shares the
existing removal promise, preserves its first cause and releases the admission
only after successful removal. This race is not asserted to explain removal of
an otherwise valid hosted participant.

Security budgets remain unchanged: **6,000 ms lease**, **2,000 ms independent
authorization/poll intervals**, **250 ms lease check**, **30 s initial token**,
and explicit future Cloud token-revocation cutoff. Supabase Auth validation/RLS,
membership checks, tenant-bound rooms, authoritative zone eligibility and orphan
cleanup remain enforced. There is no lease extension, new dependency or migration.
Multiple authorities within the **same** environment namespace still require a
cold handover; this fix is environment isolation, not distributed coordination.

### Checks executed

| Check | Result | Evidence / limit |
| --- | --- | --- |
| `pnpm lint` | PASS | Both applications, zero warnings |
| `pnpm typecheck` | PASS | Both applications and Next route generation |
| `pnpm build` | PASS | Fresh web and realtime production builds after namespace fix |
| `pnpm test` | PASS | **124**: 96 web + 28 realtime; synthetic Auth/media where applicable |
| Valid one/two-user authorization | PASS | Eight independent renewal/sweep cycles per scenario, **16 s simulated time**; no valid participant removed |
| Environment namespace isolation | PASS | Actual provider inventory with mocked SDK control-plane responses excludes production/development/test peers; signed room/microphone grants verified offline |
| Single-user competing-authority reproduction | PASS | Second same-namespace authority removes first authority's participant; distinct authority IDs correlate to the same opaque participant |
| Inventory/timer duplicate removal | PASS | Reproduced before/after 2→1 calls; no lost first cause; completed removal releases reservation |
| Explicit leave, zone exit, reconnection, revoked membership, tenant isolation | PASS | Existing lifecycle, lease, real local Colyseus transport and authorization regressions; synthetic identities/provider, not hosted users |
| Production routes / safe Supabase denials | PASS | **43/43**. Actual anonymous/invalid-proof Supabase requests and local production Next routes, no successful authenticated writes |
| Database/setup and deployment configuration | PASS | **6 database/setup + 2 deployment tests**; disposable local PostgreSQL, not a remote migration or live cross-tenant account test |
| Compiled realtime entry | PASS | **2/2**, including actual Supabase readiness and missing-config fail-closed startup; child Cloud settings explicitly blank |
| Browser regression suites | PASS | **4/4 final sequential run**: chat, communication composition, office/Phaser, expanded voice. Real Chromium/React/SDK, synthetic Auth/network/media; no real audio |
| Railway log/configuration inspection | PASS | Read-only; one hosted instance, 10 initial admissions HTTP 200; no captured removal/renewal events in the deployed version |
| Local competing authority containment | PASS | Verified watcher/runtime stopped; listener absent |
| Hosted realtime health/readiness after containment | PASS | **06:26:33 UTC**: `/health` 200; `/ready` 200 with configuration, authentication, database and voice ready. Control-plane readiness is not proof of audio stability |
| Hosted initial one-user voice connection after containment | PASS — user-reported manual | Existing hosted Vercel app, after stopping the local authority; no deployment |
| Hosted stationary voice maintained for at least 60 seconds | PASS — user-reported manual | User reported ≥60 seconds connected; no exact start/end timestamps supplied |
| Hosted Leave Voice | PASS — user-reported manual | Explicit leave passed |
| Hosted Rejoin Voice | PASS — user-reported manual | Rejoin passed |
| Hosted unexpected disconnects / additional errors during that retest | PASS — user-reported manual | User reported none; observation limited to this retest |
| Hosted two-user simultaneous voice | PASS — user-reported manual | Two users joined voice after the conflicting local server was stopped; agent did not operate their sessions |
| Hosted two-user audio communication | PASS — user-reported manual | User confirmed real audio communication; no automated audio/per-direction measurements or session traces supplied |
| Hosted multiplayer presence with two voice users | PASS — user-reported manual | User confirmed multiplayer presence passed |
| Unexpected disconnections during the hosted two-user test | PASS — user-reported manual | User reported none; limited to the reported test, with no supplied duration |
| Hosted revocation ≤10 seconds and original/refreshed replay | NOT TESTED | No membership mutation, replay attempt or actual Cloud revocation timing measurement performed |
| Hosted cross-company Cloud room admission and revoked-member new-token denial | NOT TESTED | Separate authenticated Cloud security scenarios were not part of the reported voice tests |
| Historical SDK reason / exact historical removal caller | NOT TESTED | Missing browser/Cloud event correlation; do not infer it from HTTP 200 or the old banner |

The first root script invocation hit a global pnpm 12 versus pinned 10.34.7 PATH
conflict; validations then used the existing `.cache/corepack` shim without
changing manifests. Initial sandboxed live requests failed for lack of network
access; all 43 route/live checks and both compiled-entry checks passed with
authorized network access. Initial sandboxed Chrome timed out. An elevated browser
run exposed a timing-sensitive, unchanged office interpolation assertion (passed
on isolated rerun) and a new fixture assertion that incorrectly expected zero
SDK listeners. That fixture now checks removal of the application's own registered
handler; the expanded voice suite passed. These failed attempts are not presented
as successful tests or as confirmed product defects.

The final sequential browser run passed all four suites without concurrent build
work. The unchanged office fixture measured **21.7 FPS** solo and **26.6 FPS** with
ten synthetic rendered players on Chrome 156 / SwiftShader software WebGL; these
short local laboratory samples are not hosted performance or real-user/audio
measurements. The final freshly compiled backend rerun also passed **2/2**.

**Previous follow-up regression run:** reran `pnpm test`, `pnpm lint`, `pnpm typecheck`
and `node --test scripts/test-voice-browser.mjs` after reviewing the retained
source. **All PASS: 124 tests (96 web + 28 realtime), both-app lint/typecheck,
and the expanded voice browser suite (1/1).** No new failure was observed. The existing
production-build, 43-route, database/setup and four-suite browser results above
belong to the preceding implementation run; they were not rerun or relabelled
as new hosted validation in this documentation-only follow-up. Local transport
tests use an isolated fake voice provider; the browser uses simulated media/Auth.
Neither starts the stopped conflicting Cloud authority.

**Finalization regression run (2026-10-23, Asia/Colombo):** the first `pnpm test`
run failed one existing watchdog-stage fixture: it expected `media` but observed
`connected`. The fixture used 5 ms watchdogs and a 15 ms real sleep without
ensuring the async stage had started; under concurrent load the gate could
release first. Replaced these sleeps with Node's existing mocked timers and an
explicit stage assertion before advancing the watchdog. The focused voice unit
suite passed **9/9**. This is a test determinism correction, not evidence of a
hosted product defect; no runtime timeout, lease, cleanup or authorization rule
changed. **Final rerun: PASS — 124/124 application/realtime tests (96 web + 28
realtime), both-app lint and both-app typecheck.** The isolated voice browser suite passed
**1/1**, with synthetic media/Auth only. No conflicting local server was restarted,
and no production configuration or credentials were changed during
this finalization.

### Hosted follow-up (manual; no deployment performed)

1. **Completed, user-reported manual PASS:** on the existing hosted Vercel app,
   initial connection, at least 60 seconds stationary in the meeting room,
   explicit leave and rejoin; no unexpected disconnections or additional errors.
   A subsequent user report also confirms simultaneous two-user voice, audio
   communication and multiplayer presence, with no unexpected disconnections.
   Do not restart the stopped conflicting server. The preventive code changes
   remain undeployed; this result verifies containment only.
2. If it disconnects again on the existing deployment, open the corresponding
   LiveKit Cloud room/session diagnostics and record only the disconnect enum,
   UTC time and opaque participant identity. Do not copy connection URLs,
   headers, JWTs, refreshed tokens or raw diagnostic exports. The existing server
   logs cannot retrospectively supply missing per-admission events.
3. After a **separately approved** release of these code changes, preserve browser
   Console logs filtered to `Voice lifecycle.` and Railway deployment logs filtered
   to `Voice authority.`. Correlate `participantId`, UTC timestamps and server
   `authorityId`. `admission_issued` → `authorization_renewed` should continue;
   inspect `removal_requested.reason` and `removal_completed` if removed.
   `orphan_removal_*` from a different authority indicates a competing server.
   `lease_expired` includes whether refresh was in flight; `authorization_failed`
   is not automatically proof of revocation rather than an Auth dependency failure.
   `client_cleanup` / `stop_requested` preceding CLIENT_INITIATED traces client
   teardown. CONNECTION_TIMEOUT/JOIN_FAILURE/MEDIA_FAILURE direct investigation
   to signaling/WebRTC, not membership assumptions. Temporary reconnection must
   retain the session and recover without a new Join click or duplicate tracks.
4. **Two-user voice/audio/presence: completed by user report.** Separate tests of
   device switching, network interruption, browser refresh, zone-exit cleanup
   and cross-company Cloud access were not established by that report. Keep
   those checks separate from the reported conversation; do not infer full
   lifecycle or tenant-security coverage from working audio.
5. Only with authorized disposable memberships, measure revocation from the
   authoritative database change to actual Cloud participant removal/audio loss;
   target **≤10 s**. Separately test original and SDK-refreshed unexpired token
   replay without logging either token. New-token HTTP rejection alone is not
   evidence of active connection revocation or replay protection.

Scoped merge recommendation: **YES** for the reviewed preventive fix, removal
race correction, diagnostics and regressions. This does not authorize a merge or
deployment. Single-user stability, leave/rejoin, simultaneous two-user voice,
audio communication and multiplayer presence have passed by user report.
Active Cloud revocation within 10 seconds, original/refreshed-token replay and
the separately listed Cloud authorization scenarios remain **NOT TESTED**. Broader release
security sign-off remains incomplete. Correlate actual SDK/Cloud events if the
failure recurs. No hosted deployment/configuration change was performed.

## Phase 5 Step 3A — Vercel + Railway hosting preparation

Date: **2026-10-22, Asia/Colombo**. Existing branch confirmed by reading
`.git/HEAD`: `feature/p5-s03-private-beta-pilot`. The unmerged Step 3 shutdown
admission fixes are preserved. No Git operation, remote project configuration,
deployment, account creation, email send, migration or tenant-data mutation was
performed. Commands in the manual guide below are **future owner actions after
separate approval**, not actions executed in Step 3A.

**Merge-ready: YES for this preparation substep. Deployment preparation complete:
YES. Hosted beta ready: NO.** The parent Step 3 real-team release gate remains
blocked; the preparation decision does not mark its pilot/security tests passed.

### Architecture verification

| Component | Actual implementation / deployment boundary |
| --- | --- |
| Workspace | Shared pnpm monorepo: root `pnpm-workspace.yaml` includes `apps/*` and `packages/*`, with one root lockfile and `packageManager: pnpm@10.34.7`. Node 24 LTS is recorded in `.node-version`; root minimum `>=22.14.0` is not a provider version pin |
| Frontend | `apps/web`, package `@virtual-office/web`, Next 16.4.2 App Router / React 19 / strict TS / Tailwind. `pnpm --filter @virtual-office/web build` produces Next server routes and static public assets; local start is `pnpm --filter @virtual-office/web start` |
| Realtime | `apps/realtime`, package `@virtual-office/realtime`. `pnpm --filter @virtual-office/realtime build` runs TypeScript, emitting `apps/realtime/dist/apps/realtime/src/index.js` and shared JS under that dist tree. Persistent Node/Colyseus remains on Railway |
| Shared source/assets | Both apps directly import `packages/shared/src/*.ts`; this small package has no separate build. Realtime validates the same `apps/web/public/office/studio.json` served to Phaser. An isolated upload of only `apps/realtime` omits required source/map files |
| Frontend APIs | `/api/health`, `/api/ready`, `/api/v1/voice/token`, Auth confirmation/recovery routes and Server Actions remain Next Node runtime work. They perform bounded HTTP/data operations, not persistent multiplayer/media hosting |
| Browser runtime | Phaser/office engine and LiveKit client load through existing client-only deferred paths. `/office/*` assets stay in web `public`; no `apps/web` URL prefix, CDN rewrite, game server or canvas SSR is required |
| Auth/data | Existing Supabase SSR cookie refresh, fresh verified user lookup, explicit recovery proof, active membership/RLS and append-only chat RPCs. No new database service, privileged client key or OAuth callback is introduced |
| Voice | Existing server-authorized Meeting Room zone and explicit microphone join. Railway alone holds LiveKit API credentials; Vercel forwards verified user/session admission via HTTPS. Browser receives its scoped short-lived token. This is zone-based eligibility, not a newly added distance-radius feature |
| Health | Web `/api/health` and realtime `/health` are liveness. Web `/api/ready` and realtime `/ready` are dependency readiness, with 200/503, no-store, fixed statuses, bounded probes and no tenant data |

Vercel Root Directory is **`apps/web`**, with outside-root source inclusion.
Railway build Root Directory is **repository root `/`**, not `/apps/realtime`.
This follows [Railway shared-monorepo guidance](https://docs.railway.com/deployments/monorepo)
and [Vercel monorepo source inclusion](https://vercel.com/docs/monorepos/monorepo-faq).
Direct relative shared imports are retained; no package/build framework was added.

### Deployment configuration and modified files

| File | Prepared change |
| --- | --- |
| `railway.json` | Railpack, realtime-only build, direct Node start with `exec`, `/ready`, 120s startup readiness timeout, one replica, ON_FAILURE with three retries, 0s additional overlap and 30s drain. Field types/options checked against the official Railway schema |
| `.vercelignore` | Root CLI upload rules exclude both apps' local env files, private key/local tooling paths, pnpm/cache artifacts and emitted backend files; preserve examples, manifests, shared TypeScript and office assets. This is needed for manual source uploads, including the existing `.env` convention |
| `scripts/deployment-config.test.mjs` | Two focused configuration/upload-policy regressions; no provider CLI or upload executed |
| `scripts/test-realtime-live.mjs` | Exercises the Node entry arguments/CWD in Railway config, ephemeral dynamic PORT, readiness/denials, and missing-config exit. Child-only Cloud settings remain blank to prevent a second authority |
| Root `package.json` | Adds `pnpm test:deployment`; no dependency/version/lockfile change |
| `apps/web/.env.example`, `apps/realtime/.env.example` | Provider-specific comments for public build values, hosted HTTPS forwarding, Railway PORT and one-authority operation; no real environment file was changed |
| `apps/realtime/src/index.ts` | Comment correction: the default map path depends on the documented `apps/realtime` CWD. Runtime logic and literal `0.0.0.0`/configured PORT binding remain unchanged |
| `README.md`, this report | Exact settings, full variable matrix, deployment order, A–O manual guide, tests, risks and release decision |

No Dockerfile, `vercel.json`, new dependency, database migration, Git hook or
deployment workflow was added. The Step 3 server and lifecycle regressions remain
in place, including rejection of new and late office admissions during drain.

### Provider settings — prepared locally, not applied

| Vercel setting | Required value |
| --- | --- |
| Project | Dedicated private-beta frontend project, initially **not Git-connected**; keep all deployment actions manual |
| Root Directory | `apps/web` |
| Framework / Node | **Next.js**, **24.x** |
| Source inclusion | Enable **Include source files outside of the Root Directory in the Build Step** |
| Dependency/build selection | Set provider `ENABLE_EXPERIMENTAL_COREPACK=1` to honor the root package-manager pin. Install override: `corepack pnpm install --frozen-lockfile`; build: `corepack pnpm build`, run from the selected web root |
| Output / start | Framework default output, no static `out` override and no custom start command; Vercel handles Next API routes/SSR |
| Shared-source rebuilds | Disable skipping unaffected projects if later connecting Git: shared imports are relative source, not a declared package dependency graph. Do not create automatic feature-branch deployments here |
| Environment scope | This dedicated beta project's stable deployment scope must have the public build values and server-only values below. Its provider “Production” scope denotes this beta project, not permission to touch an existing production SaaS project |
| Origin/protection | Use one stable HTTPS alias/domain. Confirm pilot users and callback links can reach it under intended deployment protection. Never put protection-bypass tokens in links or weaken application Auth/RLS |

Corepack setup follows [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build#corepack).
Explicit Corepack avoids relying on an override's default pnpm binary. Upload
exclusions follow [Vercel ignore behavior](https://vercel.com/docs/deployments/vercel-ignore).
No provider build adapter, function limits or dashboard setting was exercised here.

| Railway setting | Required value |
| --- | --- |
| Service / source | One empty persistent Node service named, for example, `realtime`, in an explicitly selected private-beta project/environment; manual CLI source uploads, no Git-triggered deploys |
| Root / config file | Repository root `/`; config file `/railway.json` |
| Builder / install | **Railpack**, root pnpm workspace/lockfile detection, including build-time dev dependencies. Confirm pinned pnpm 10.34.7 in build logs; do not isolate/filter away the shared source or map before compilation |
| Build command | `pnpm --filter @virtual-office/realtime build` |
| Start command | `cd apps/realtime && exec node --env-file-if-exists=.env dist/apps/realtime/src/index.js` |
| Bind / networking | Existing code listens on `0.0.0.0` and the Railway-injected `PORT`; do not invent a HOST variable or copy local PORT=2567. Generate public HTTPS networking to that listener. The browser SDK upgrades the configured HTTPS origin to WSS |
| Readiness | `/ready`, timeout 120s from config. Do not substitute `/health` to mask missing Cloud/Auth/database configuration. GET readiness does not require an Origin header, so the platform healthcheck host does not need admission permission |
| Lifecycle | One replica/one region, Serverless/sleeping disabled; no scale-out. ON_FAILURE with max 3 retries; 0s extra overlap and 30s draining in config |
| Replacement | Manual cold replacement only: stop the prior authority, verify process exit, then start the replacement. This also applies to local dev processes sharing the same Cloud namespace |

Railpack shell start commands support `cd ... && exec node ...`, so the shell is
replaced by Node for signal delivery. [Railway start-command behavior](https://docs.railway.com/deployments/start-command)
was checked; the actual Linux/Railpack image was not built in this Windows pass.
Node version selection is explicitly pinned through the documented
`RAILPACK_NODE_VERSION` provider variable; see [Railpack Node support](https://railpack.com/languages/node/).

**Important lifecycle finding:** Railway's ordinary replacement starts a new
container before retiring the old deployment. `overlapSeconds: 0` removes extra
overlap after activation; it does **not** prevent concurrent startup. This app's
existing Cloud orphan sweep assumes a single authority and can remove another
process's participants. A one-replica setting alone does not solve that race.
Stop/confirm the old authority first, accepting pilot downtime, before manually
uploading a replacement. See [Railway teardown lifecycle](https://docs.railway.com/deployments/deployment-teardown).
No distributed lease/scaling feature was added to work around this constraint.

Railway healthchecks gate activation, not continuous uptime monitoring. Use the
existing readiness/liveness checks for manual pilot observation; do not claim a
monitor was installed. [Railway healthcheck semantics](https://docs.railway.com/deployments/healthchecks)
also require the service's injected PORT to match the actual listener.

### Exact environment variable matrix

All URLs/senders/keys in this table are placeholders, not configured hosted
values. `WEB_ORIGIN` and `REALTIME_ORIGIN` below are explanatory labels, **not new
application environment variables**: use the actual stable Vercel HTTPS origin
and actual Railway public HTTPS origin, without trailing slash/path/query.

| Exact variable | Purpose | Platform | Visibility | Development / hosted beta example | Requirement |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/SSR public project endpoint | Vercel | Public | `https://<existing-project-ref>.supabase.co` in both environments | Required, same approved project as realtime |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public browser/SSR API key | Vercel | Public | `sb_publishable_<existing-project-key>` | Required at build and runtime; never service role/secret |
| `NEXT_PUBLIC_REALTIME_URL` | Browser admission + SDK connection origin | Vercel | Public | Dev `http://localhost:2567`; beta `https://<service>.up.railway.app` | Required at build; **HTTPS**, not WSS in this variable |
| `APP_URL` | Trusted invitation/voice request origin | Vercel | Server-only configuration | Dev `http://localhost:3000`; beta `https://<beta-project>.vercel.app` or stable custom domain | Required; matches chosen web origin/Site URL |
| `REALTIME_INTERNAL_URL` | Optional server-to-server voice/readiness target | Vercel | Server-only configuration | Dev loopback allowed; beta omit or same public Railway HTTPS origin | Optional; Vercel cannot reach your localhost or Railway private HTTP DNS |
| `INVITATION_DELIVERY_MODE` | Existing invitation delivery selector | Vercel | Server-only configuration | Dev `link` or `email`; beta `email` | Defaults to email; production rejects link |
| `RESEND_API_KEY` | Existing invitation delivery credential | Vercel | Secret | `<sending-key-entered-in-provider>` | Required for beta email mode; never public |
| `INVITATION_FROM_EMAIL` | Configured server sender | Vercel | Server-only configuration | Dev `onboarding@resend.dev` restricted; beta `invites@<verified-domain>` | Required for beta; verified domain for general team recipients |
| `SUPABASE_URL` | Membership/Auth/data endpoint | Railway | Server-only configuration, public endpoint | `https://<existing-project-ref>.supabase.co` | Required, matches Vercel public project |
| `SUPABASE_PUBLISHABLE_KEY` | User-scoped server API access | Railway | Public key held on server | `sb_publishable_<same-project-key>` | Required; no service-role/secret key |
| `LIVEKIT_URL` | Cloud media/control endpoint | Railway | Server-only configuration | `wss://<existing-project>.livekit.cloud` | Required for full beta readiness |
| `LIVEKIT_API_KEY` | Cloud server API identifier | Railway | Server-only credential | `<existing-cloud-api-key>` | Required; no Vercel/browser copy |
| `LIVEKIT_API_SECRET` | Cloud signing/control secret | Railway | Secret | `<existing-cloud-api-secret>` | Required; no Vercel/browser copy |
| `PORT` | Realtime listener port | Railway | Provider-managed | Dev default 2567; beta injected by Railway | Use injected value, not a new hardcoded port |
| `OFFICE_MAP_PATH` | Alternate canonical map location | Railway | Server-only configuration | `/<deploy-root>/apps/web/public/office/studio.json` | Optional; omit with prepared root context/start CWD |
| `NODE_ENV` | Runtime security/production behavior | Both | Non-secret | Dev `development`; beta `production` | Set on Railway; Vercel manages production builds/runtime. Never set development to enable link mode |
| `RAILPACK_NODE_VERSION` | Provider Node version selection | Railway | Provider-only, non-secret | `24` | Set for beta to pin tested LTS; not read by application code |
| `ENABLE_EXPERIMENTAL_COREPACK` | Provider honors root package-manager pin | Vercel | Provider-only, non-secret | `1` | Set for this preparation's pinned install/build instructions; not application code |

No application environment variable was renamed or invented. The last two are
documented provider settings. Teardown values live in `railway.json`; remove any
conflicting provider-variable overrides rather than maintaining two settings.
Next public changes require a rebuild; server changes require the appropriate
manual redeploy/restart. Keep existing local `.env` files ignored and local.

Test-only diagnostic settings such as `AUTH_TEST_EMAIL`/`AUTH_TEST_PASSWORD` and
the existing `ORG_TEST_USER_A/B/C`, `ORG_TEST_CONFIRM_DEVELOPMENT`,
`ORG_TEST_PROJECT_REF` belong in ignored local test configuration only, not either
hosting platform. Their absence is not permission to use real tenant accounts.
They do not automatically create/verify accounts or replace the real pilot.

### Manual deployment guide A–O — not executed

**Order:** reserve the stable frontend hostname/project without deployment →
prepare Railway and stop any old/local authority → manually deploy realtime →
obtain its HTTPS origin → complete Vercel, Supabase and email configuration →
manually deploy frontend → verify end-to-end/security → run the pilot. There is
no health dependency cycle: realtime readiness checks Supabase/Cloud, not the web.

Before A, the owner reserves a stable HTTPS frontend alias or controlled domain.
For a Vercel project without importing a Git repository/deploying, the documented
interactive `vercel project add` and `vercel link` commands can create/link it;
run linking from the repository root and choose the dedicated beta project.
Record the exact domain shown under that project's Domains settings; do not
guess a name or use an ephemeral preview URL. No command in this paragraph was
run here. [Vercel project creation](https://vercel.com/docs/cli/project) and
[project linking](https://vercel.com/docs/cli/link) do not authorize deployment.

**A. Create/configure Railway service.** After separate approval, use the intended
Railway workspace/project, create or select the private-beta environment, and add
one **Empty Service**, named `realtime`. Do not select a database template or
connect a Git deployment source. Keep staged configuration changes manual.

**B. Build/start settings.** In that service's Settings, keep repository-root
build context `/`, select `/railway.json`, and verify the build/start commands and
readiness/lifecycle settings in the table above. Disable Serverless/sleeping and
keep one replica. Do not upload only `apps/realtime`. The build needs the root
lock/workspace, shared source and web public map. No pre-deploy migration command.

**C. Railway variables.** Enter only Railway rows from the matrix in its beta
environment. Use the reserved stable frontend origin for
`REALTIME_ALLOWED_ORIGINS`; include neither wildcards nor a guessed Vercel
preview hostname. Let Railway inject PORT. Supply the existing development
Supabase public project/key and matching server-only Cloud values. Do not copy
the web's Resend secret or any service-role key to realtime.

**D. Manually deploy realtime.** First stop every old/local Colyseus authority
using that Cloud namespace, including `pnpm dev:realtime` on a developer machine.
For an existing Railway deployment, pause the pilot, remove/stop only that beta
application deployment through its deployment menu, and confirm the old process
has stopped before a replacement. Preserve the prior source/artifact/config first.
Do not remove a project, database, volume or tenant record. Actual provider stop
signal/drain behavior still needs the later hosted rehearsal.

On the owner's machine, authenticate using the official Railway CLI interactively,
then explicitly link the intended existing beta project/environment/service.
From the **repository root**, review `railway status` before the separately
approved manual upload:

```sh
railway login
railway link
railway status
# Only after checking the selected beta project/environment and old-authority stop:
railway up --service realtime --environment <beta-environment-name>
```

Do not use `--new`, `--yes`, `--no-gitignore` or a subdirectory upload. Railway CLI
normally respects `.gitignore`, keeping local env/dependency files out; inspect
source/build settings before uploading. [Railway CLI upload behavior](https://docs.railway.com/cli/up)
is a future operator step, not a local test. Verify Railpack installs pinned pnpm,
compiles realtime, starts Node with the expected CWD and passes `/ready` before
proceeding. Stop on config/map/Cloud errors instead of changing the gate.

**E. Obtain Railway HTTPS/WSS endpoint.** In the realtime service's Networking
settings, Generate Domain targeting its actual injected listener port. Record the
public `https://<generated>.up.railway.app` origin and verify its certificate,
`/health`=200 and `/ready`=200. WSS uses the same hostname, but
`NEXT_PUBLIC_REALTIME_URL` must contain **https://**, as required by the existing
SDK adapter. Preserve Authorization, Origin and reconnect subprotocol proof
through provider networking. A health response alone does not verify WS upgrade.

**F. Configure Vercel frontend project.** Return to the reserved beta project;
Settings → Build and Deployment: Root Directory `apps/web`, framework Next.js,
Node 24.x, outside-root inclusion on, default output, and exact Corepack
install/build settings above. Keep this project without a Git integration for
manual uploads; do not use the feature branch as an automatic production source.
Do not use `vercel link --repo`, which is the Git-integration workflow. If the
owner later elects Git integration, they must review all triggers separately.

**G. Vercel variables.** Add Vercel rows to this beta project's intended stable
deployment scope, with its actual web origin and the actual Railway public HTTPS
origin. Omit `REALTIME_INTERNAL_URL` or set it to the same public origin. Enter
Resend credentials only in server settings and enable Corepack. Do not enter
LiveKit server credentials on Vercel. Do not upload local `.env` files or pull
remote variables over an existing local env file. `.vercelignore` excludes local
env/keys from the manual source archive; inspect the future archive/build too.

**H. Supabase Auth URLs.** In the existing designated development project's Auth
URL Configuration, set Site URL to the exact stable Vercel beta HTTPS origin and
allow these exact URLs there: `/auth/confirm`, `/reset-password`, `/dashboard`.
Keep Confirm email enabled, email/password auth and the existing password policy.
Keep these existing custom email links:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">Verify email</a>
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a>
```

The templates use shared Site URL, so changing it also changes this project's
development confirmation/recovery destination. Confirm environment ownership
before editing it; extra redirect entries do not override these templates.
The implemented SSR flow verifies email proof, or moves recovery proof into a
scoped HttpOnly cookie and verifies it on password submission. Do not substitute
default implicit links, an OAuth callback or a broad redirect allowlist. Manual
Dashboard Auth configuration is not a schema migration; no setting was changed here.

**I. Production-capable email.** In the existing Resend account, verify the chosen
sender domain and DNS status, allow the sending key on that domain, and use its
plain address as `INVITATION_FROM_EMAIL`. Beta mode is `email`. The existing
`resend.dev` testing sender only delivers to its permitted account recipient and
cannot onboard the whole pilot. Configure/verify Supabase Auth SMTP separately;
the app adapter does not configure Auth mail. Keep link tracking disabled. The
owner later verifies normal inbox delivery/confirmation/recovery; no real emails
were sent automatically. The [Resend testing restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
and [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp) remain
external prerequisites.

**J. Verify LiveKit Cloud integration.** Confirm the three Railway values belong
to the same existing Cloud project; its URL must pass the existing strict Cloud
origin parser. Keep microphone-only/tenant-room grants, 30s original token TTL,
6s authorization lease, explicit removal cutoff and independent refresh/revoke
loops unchanged. No key goes to browser/Vercel public env. Later verify real
control-plane reachability and corporate WebRTC/TURN access before actual audio.
Do not start a second service to test Cloud readiness. The Step 3 security protocol
below specifies genuine original/refreshed replay and active voice timing; mocks
and new-token denial are not substitutes.

**K. Manually deploy Vercel beta.** Only after the separately approved beta
environment/configuration is reviewed and Railway is ready, the owner may run
from the linked **repository root**:

```sh
vercel deploy --prod
```

Here `--prod` selects the **dedicated beta project's** stable alias/environment;
it is not permission to deploy the existing production SaaS. Confirm project/scope
first; stop if either is wrong. Do not execute this command during preparation.
No Vercel CLI build/deploy/project-link action was executed here. Verify the exact stable
domain, `/api/health`=200, `/api/ready`=200 and server-only bundle boundaries after
that future deploy; do not turn readiness 503 into an unconditional 200.

**L. Authenticated end-to-end test.** Normally register/verify or sign in dedicated
accounts; test protected workspace, refresh/logout/recovery, admission OPTIONS,
real WSS upgrade/reconnect, names/presence, persisted/deduplicated chat, Phaser
assets/canvas, explicit voice join and real bidirectional audio. Validate zone
exit, tab refresh/close, microphone/device cleanup and UI error/draft retention.
Vercel logs/platform request telemetry must redact callback/invitation proof,
cookies, bodies and reconnect headers; inspect only sanitized evidence.

**M. Multi-company isolation.** Use the designated second company and its own
verified session; exercise office/chat/voice denials while positive own-company
access works. Remove only the authorized disposable pilot member, test active
voice removal against 10s and both original/refreshed Cloud token replay before
expiry, retaining proof only in operator memory. Do not loosen RLS or use a
privileged token to make these tests pass. The existing Step 3 protocol below
details timing bounds and distinct original/refreshed runs.

**N. Six–ten-member pilot.** Run the existing Step 3 schedule below with 6–10 total
Company A members (admin included in capacity), a separate Company B and real
headsets/listeners. Record actual counts, frame/latency/resource samples, chat
persistence, voice, recovery and leave cleanup. Synthetic browser/transport
numbers in this report are not completed pilot observations. All hosted pilot
rows remain NOT TESTED until that session is actually executed.

**O. Safe rollback.** Preserve a compatible known-good source/build and securely
stored provider environment/map pair before replacement. Pause the beta, stop and
confirm the failed/current Railway authority, then manually upload/redeploy the
known-good backend as a **cold** replacement. Restore the matching Vercel beta
deployment/alias through the intended beta project's deployment controls. Confirm
health/readiness, Auth/origins and explicit user reconnect/rejoin. Do not invoke
an overlapping Railway rollback/redeploy while an authority is still running.
Never reset/delete Supabase data, down-migrate, delete Auth users or rotate Cloud
keys as an unreviewed rollback shortcut. Hosted rollback is NOT TESTED here.

### Automated validation and actual limitations

| Check | Result / scope |
| --- | --- |
| Clean frozen install | PASS: isolated workspace copied only manifests/lock/workspace and then explicit sources/assets/config, **no env files**. pnpm 10.34.7 installed 549 locked packages. Backend and frontend builds also pass using that clean dependency tree |
| Existing workspace install attempt | Initially blocked by pre-existing pnpm module metadata/purge-without-TTY guard; no current modules were purged. Isolated validation above completed instead. No production secret/config was involved |
| Install-script policy | Existing allowlist retained; pnpm reported ignored optional esbuild/msgpackr-extract scripts. No approve-builds/security relaxation was made; both clean builds pass |
| Lint/typecheck | PASS, both apps, zero lint warnings and strict route/type checks |
| Production builds | PASS, exact filtered realtime and web commands in current workspace, and again from isolated clean dependencies |
| Application/realtime suites | PASS, **95 + 24 = 119**, retaining Step 3 shutdown/admission and prior security regressions |
| `pnpm test:deployment` | PASS, **2** configuration/upload-policy tests; public source inclusion and local secret/cache exclusions |
| Database/setup regressions | PASS, **6** runner tests; 14 chat, 54 team, 26 foundation assertions plus profile access guards, disposable PostgreSQL/rollback fixtures |
| Production routes/live Supabase denials | PASS, **43**; Auth/SSR/recovery, private caching, anonymous grants, malformed proof, voice API and deferred public bundles |
| Configured compiled realtime entry | PASS, **2** tests: dynamic PORT + actual compiled/shared/map startup with Cloud intentionally disabled, readiness 503 when voice absent, denial paths, and missing-config exit **1** in ~595ms |
| Chromium suites | PASS, **4/4**, actual chat/Phaser/composition/voice controls with synthetic identity/store/media boundaries |
| Hosted Vercel / Railway | NOT TESTED / NOT CONFIGURED; no provider project/variables/domain/adapter/image/signal path certified |
| Real pilot, audible Cloud media, replay and measured Cloud revocation | NOT TESTED in Step 3A; prior user-reported Step 1 results remain historical, not new hosted proof |

An initial compiled-entry run exceeded the new test's 5s cold-import watchdog
while installation/browser work was concurrent. An isolated diagnostic exited 1
in ~678ms; the focused rerun exited 1 in ~636ms. The fixture watchdog was adjusted
to 15s (20s test budget), and the final two-test rerun passes. This changes **no
application security, token, lease or admission timeout**; no startup defect was
claimed from that single harness timeout. No unresolved final test failure.

Final lab measurements remain synthetic/local: ten transport clients, 24 ticks
over 1.201s (20Hz), 0.187ms mean simulation work/tick, 1,429 payload bytes to one
observer (~1,190 bytes/s), first remote movement 106ms, synthetic-store chat 21ms.
Chrome software-rendering sample: 41.7fps one avatar, 43.7fps ten avatars; chat
synthetic commit observation 45ms, short panel samples 48.3/60fps. These are not
Vercel/Railway network latency, a real Cloud call or a hardware-GPU pilot benchmark.

Validation commands:

```sh
pnpm lint
pnpm typecheck
pnpm --filter @virtual-office/realtime build
pnpm --filter @virtual-office/web build
pnpm test
pnpm test:deployment
node --test scripts/chat-database.test.mjs scripts/team-database.test.mjs scripts/test-organizations.test.mjs
node --experimental-strip-types --test scripts/test-realtime-live.mjs
node --test --test-concurrency=1 scripts/test-chat-browser.mjs scripts/test-communication-browser.mjs scripts/test-office-browser.mjs scripts/test-voice-browser.mjs
```

The existing 43 route/live-negative checks were executed from `apps/web` using
the command recorded in the Step 3 section below. New configuration tests check
the local glob policy; they do not claim an actual Vercel archive upload. The
compiled tests execute Node arguments/CWD directly on Windows; Linux shell exec,
Railpack image construction, provider TLS/WS forwarding and stop/replacement
behavior remain future hosted checks.

### Final state and blockers

| State | Result |
| --- | --- |
| Prepared locally | YES — configuration, full matrix, A–O guide, fail-closed/local regressions and clean builds complete |
| Configured remotely by this task | NO — no Vercel/Railway/Supabase/LiveKit/Resend setting changed |
| Deployed | NO — no staging/beta/production deployment performed |
| Tested with real hosted users | NO — no pilot group/session supplied or created |

Remaining owner requirements: reserve actual stable domains and intended provider
projects/environments; separately approve any deployment; configure secrets and
verified invitation/Auth email delivery; enforce cold replacement/one authority;
review host privacy logging and access/protection; prepare verified test companies,
6–10 participants/admin and real audio devices; execute hosted isolation, replay,
revocation, recovery and pilot measurements. Do not repeatedly retry unsupported
email recipients or unavailable authenticated sessions to fill those gaps.

**Step 3A preparation merge-ready: YES. Deployment preparation complete: YES.
Hosted beta ready: NO.** Parent Step 3's real-world release gate remains NO until
its actual pilot passes. Work stops at Step 3A; deployment and Step 3B were not begun.

## Historical record — Phase 5 Step 3 — Private beta environment and real team pilot

Date: 2026-10-22. Branch confirmed by reading `.git/HEAD`:
`feature/p5-s03-private-beta-pilot`. The user explicitly answered **“not
configured”** when asked about an existing hosted environment and pilot group.
No staging/production deployment, infrastructure creation, Git command, migration,
account creation, email send or tenant-data change was performed. The sections
below Step 3 are historical; the Step 2 merge-ready result is preserved. Step 3A
above now records provider preparation; the real-team release gate here remains outstanding.

**Merge-ready: NO for Step 3 acceptance. Private-beta deployment-ready: NO.**
The narrow shutdown fix and all available regressions pass. Environment audit and
pilot preparation are complete; execution of the hosted real-team/security pilot
is **BLOCKED**, not passed. Earlier user-reported Step 1 manual results are not
new Step 3 pilot evidence. No real-team benchmark or Cloud revocation timing is
claimed. The blockers below require owner preparation, not repeated failed login
attempts or weaker security.

### Implementation and reproduced defect

The audit found that readiness changed to 503 at shutdown, but `/office/join`
could still return a new seat while the voice close hook was being awaited.
A real local HTTP/WebSocket fixture reproduced **200 instead of 503** during
drain. Readiness alone did not prevent new admissions reaching the process.

`apps/realtime/src/server.ts` now returns a fixed, uncached 503 for office/voice
admissions during shutdown and rejects new WebSocket upgrades. It rechecks drain
after asynchronous authorization and reservation work so an office request
started before shutdown cannot return a late seat. Existing voice-service
cancellation/lease checks and awaited close behavior remain in place.

The existing `apps/realtime/src/tests/realtime.test.ts` now checks a new office
request during voice cleanup, a gated authorization started before drain and a
voice request during drain, all returning 503. It retains readiness and awaited
cleanup assertions. The primary reservation regression failed before the fix;
the focused rerun and full suite pass afterward. This is synthetic authorization
over real local transport, not a hosted shutdown or Cloud test.

Other modified files: `README.md` and this report. No new documentation file,
dependency, product feature, visual redesign, auth/RLS rule or migration was added.

### Current environment and completed configuration checks

| Check | Result | Actual evidence |
| --- | --- | --- |
| Expected branch | PASS | Read-only HEAD reference matches Step 3; no branch operation |
| Development Supabase identity | PASS | Web/realtime public configuration matches `rofutnholbtdmxccrkbs`; credential values suppressed |
| Environment and secret separation audit | PASS for inspected local settings | Next loaded web `.env`; realtime uses its own `.env`; no populated suspicious `NEXT_PUBLIC_` secret/key/password variable names found; server LiveKit values present |
| Local application/public realtime origins | BLOCKED for hosted beta | Both are loopback HTTP; realtime allowed origins are development HTTP, not a configured HTTPS pilot origin |
| Invitation delivery settings | BLOCKED for real-team onboarding | Local mode is `link`; configured sender is the Resend testing sender. Values of keys and recipients were not printed |
| Hosted environment / provider / domains | BLOCKED | User confirmed “not configured”; repository contains no host-specific deployment/proxy definition, and no existing beta service was identified through available capabilities |
| Auth callback/SMTP and verified email domain on target environment | NOT TESTED | No hosted target or Dashboard configuration was changed or certified |
| Auth email confirmation enforcement | PASS, existing development project | Live settings check requires confirmation and email auth; invalid proof and unverified/anonymous paths remain denied |
| Local realtime CORS preflight | PASS | `/office/join` and `/voice/token`: trusted origin receives exact origin, POST and Content-Type/Authorization allowlists; no wildcard or credential allowance. Foreign origin gets no matching allow-origin. HTTP 204 alone is not permission |
| Fresh production web readiness with local settings | PASS, expected guard | 04:40:43 UTC, HTTP **503** in **230ms**: configuration unavailable, Auth/database/realtime ready |
| Existing running realtime readiness | PASS | 04:40:43 UTC, HTTP **200** in **10ms**, all checks ready; cached response timing is not dependency latency |
| LiveKit Cloud control API | PASS, read-only availability | 04:39:52 UTC, **657ms**, zero application rooms. No participant join/removal or token replay was performed |
| Accessible authenticated pilot sessions | BLOCKED | Browser inventory at 04:34:17 UTC: zero connected browsers/apps, zero inventory errors; no configured dedicated login or UUID file |
| Real 6–10-user pilot | NOT TESTED — blocked | No test company, participant roster or hosted session was supplied or created |

Only safe probes and existing negative-path requests contacted the development
project. The database readiness probe uses an anonymous zero-row privilege denial;
it is not an authenticated RLS or schema certification. No test was run against
unrelated real user records. Missing hosted configuration is an environment
prerequisite, not a reason to change local development secrets.

### Exact environment requirements — prepared, not applied

`https://beta.example.test` and `https://realtime.beta.example.test` below are
reserved example origins, not deployed services. Replace them with the owner's
actual controlled DNS names after a separate environment/deployment authorization.
The existing development project is the only approved database target. Confirm
it is intended for disposable pilot tenants before onboarding; do not silently
point the pilot at a production tenant database or create another project.

| Process / scope | Variable | Required beta value or condition |
| --- | --- | --- |
| Web, public build configuration | `NEXT_PUBLIC_SUPABASE_URL` | Intended project's exact HTTPS origin |
| Web, public build configuration | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same project's `sb_publishable_...` key; no service-role/secret key |
| Web, public build configuration | `NEXT_PUBLIC_REALTIME_URL` | `https://realtime.beta.example.test`, exact origin, no path/query/trailing slash; not a `wss:` value |
| Web, server only | `APP_URL` | `https://beta.example.test`, matching browser origin and designated Supabase Site URL |
| Web, server only | `REALTIME_INTERNAL_URL` | Omit to use public realtime HTTPS. Remote/private DNS targets must also use HTTPS. Only `http://localhost:2567` or `http://127.0.0.1:2567` is supported as an HTTP internal origin |
| Web, server only | `INVITATION_DELIVERY_MODE` | `email`; production rejects `link` |
| Web, server only | `RESEND_API_KEY`, `INVITATION_FROM_EMAIL` | Sending credentials and plain sender on an actually verified domain; no personal fallback sender |
| Both processes | `NODE_ENV` | `production`, supplied to the process; no dev/watch command on the host |
| Realtime, server only | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Same project as built web configuration; exact HTTPS origin/public key; no privileged database key |
| Realtime, server only | `REALTIME_ALLOWED_ORIGINS` | Exactly `https://beta.example.test`, or explicit comma-separated approved HTTPS frontend origins; no wildcard/preview catch-all |
| Realtime, server only | `LIVEKIT_URL` | The configured project's exact `wss://<project>.livekit.cloud` origin; Cloud is required for the existing revocation design |
| Realtime, server only | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Matching Cloud project; never web public variables, browser bundles or logs |
| Realtime | `PORT` | Host-assigned integer 1–65535; default 2567, private upstream listener binds `0.0.0.0` |
| Realtime | `OFFICE_MAP_PATH` | Optional absolute deployed path to the exact web `public/office/studio.json`; required if the sibling web asset is not present at the default working-directory path |

Next production precedence: process environment, `.env.production.local`,
`.env.local`, `.env.production`, `.env`. Public values must be set during build;
changing only runtime variables cannot repair an already built browser endpoint.
Realtime's Node command loads `.env` only and preserves inherited process values.
Do not ship local development env files into the hosted artifact. Use the host's
existing secret store; do not copy secrets into this table or application logs.

Supabase Auth owner setup for the designated pilot origin:

1. Keep email confirmation enabled. Set Site URL to the approved beta origin;
   allow exact `/auth/confirm`, `/reset-password` and `/dashboard` URLs there.
   Do not add broad external redirect patterns. The app accepts only its existing
   email/recovery SSR flow, not an invented OAuth/code callback.
2. Retain the existing confirmation and recovery templates from README:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">Verify email</a>
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a>
   ```

   These templates use the project's shared Site URL. Switching it affects dev
   confirmations/recovery too; the owner must designate the environment before
   changing it. An additional redirect allowlist entry does not change Site URL.
   This follows the [Supabase template variables](https://supabase.com/docs/guides/auth/auth-email-templates)
   and [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
3. Verify Supabase Auth SMTP separately from application invitation delivery;
   the Resend adapter does not configure Auth mail. The default Auth sender has
   recipient restrictions, so all pilot inboxes need supported delivery through
   the existing approved SMTP setup. Keep tracking disabled for one-time links.
   See [Supabase SMTP requirements](https://supabase.com/docs/guides/auth/auth-smtp).
4. Use the existing Resend provider with a verified domain for team invitations.
   `onboarding@resend.dev` cannot deliver to the general pilot roster; its testing
   recipient restriction remains enforced. See [Resend's domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
   No new provider or automatic send was introduced.

### Hosting contract — inaccessible infrastructure remains BLOCKED

| Requirement | Exact host setting / acceptance check |
| --- | --- |
| Runtime and artifacts | Node 24 LTS / locked pnpm 10.34.7. From workspace root, install with `pnpm install --frozen-lockfile` and run `pnpm build`. Retain emitted realtime `dist` including shared JS, web `.next`/`public`, runtime dependencies and the matching map. No static export for authenticated web |
| Web process | Working directory `apps/web`; start `node node_modules/next/dist/bin/next start --hostname 0.0.0.0`, with host `PORT` or default 3000. Preserve SSR cookies, Server Actions and response streaming |
| Realtime process | Working directory `apps/realtime`; start `node --env-file-if-exists=.env dist/apps/realtime/src/index.js`. One persistent process, one replica, no idle sleeping or function timeout, no watch mode |
| Lifecycle | Deliver SIGTERM/SIGINT to the actual Node process, not just a package-manager wrapper. Configure 30s graceful-stop allowance for rehearsal; do not overlap old/new realtime authorities. No automatic rolling surge or horizontal scaling with current in-memory presence/driver/voice ownership |
| TLS and routing | Valid publicly trusted certificate for both approved origins. Public HTTPS 443 and WSS upgrades; private upstream ports inaccessible from the public Internet. Reject unexpected Host values; no TLS-warning bypass |
| Proxy request forwarding | Preserve client `Origin`, `Authorization`, cookies, `Sec-WebSocket-Protocol`, Upgrade/Connection and complete realtime paths/query parameters. Never replace every caller's Origin with the trusted frontend origin. Overwrite forwarded Host/Proto from trusted proxy context |
| WebSocket lifetime | HTTP/1.1 upstream, Upgrade forwarding, no response buffering/cache, 3600s read/send idle timeouts as the proposed pilot proxy setting; verify all upstream/CDN hard duration limits. Existing transport sends 3s heartbeats |
| CORS | Let the app enforce exact origins; no injected `Access-Control-Allow-Origin: *`, forced credentials, or unauthenticated matchmaking shortcut. Test real browser OPTIONS + authenticated admission + upgrade, not only HTTP health |
| Liveness | Web `/api/health`, realtime `/health`; 10s interval and 5s timeout are proposed host settings. Do not restart a live process because Auth/Cloud is unavailable |
| Readiness | Web `/api/ready`, realtime `/ready`; require 200 before pilot entry. Proposed 30s startup grace, 10s probes, three consecutive failures before an availability alert/traffic decision. Preserve no-store/503. Existing 3s probe deadline and 5s per-process cache are unchanged |
| Private web/cache policy | Preserve Cache-Control/no-store on auth/workspace/invite/voice; no CDN caching or log body capture for private HTML/RSC/actions. Keep deployed web/realtime/map versions paired |
| Privacy logs | Log service/status/duration only. Redact or disable request URLs, query strings, headers, bodies, cookies, invitation paths, Auth proof and WebSocket reconnect proof in access/error/APM traces. Next's development suppression is not host redaction |

These are requirements and proposed rehearsal settings, **not verified hosting
configuration or a deployment instruction approval**. No resource sizing capacity
is certified. Use the current host's CPU/RAM metrics during the pilot and record
limits/throttling; no new service or paid plan was selected.

The upstream forwarding contract follows [Nginx WebSocket handling](https://nginx.org/en/docs/http/websocket.html).
This reference excerpt illustrates an existing TLS realtime virtual host; replace
its host/certificate directives outside the excerpt and review actual host
configuration before use. It was not installed or executed:

```nginx
# In http context:
map $http_upgrade $pilot_connection { default upgrade; '' close; }

# Inside the owner's existing TLS realtime server block:
location / {
    proxy_pass http://127.0.0.1:2567;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $pilot_connection;
    proxy_set_header Sec-WebSocket-Protocol $http_sec_websocket_protocol;
    proxy_set_header Origin $http_origin;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

Do not copy a generic multi-instance Colyseus deployment example into this
single-authority application. Shared drivers/scaling are not implemented in this
step. The [Colyseus deployment contract](https://docs.colyseus.io/deployment) and
[Next self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting)
inform this review; no proxy package, process manager or container was added.

Client network prerequisites for actual Cloud media: allow outbound TCP 443 to
`*.livekit.cloud` and `*.turn.livekit.cloud`, UDP 3478 to `*.host.livekit.cloud`,
and the recommended media paths UDP 50000–60000 / TCP 7881. Verify the actual
corporate VPN/firewall and fallback behavior with the operator; do not disable
the firewall. Server-side outbound HTTPS must reach Supabase, Cloud control APIs
and Resend from their respective processes. [LiveKit Cloud firewall requirements](https://docs.livekit.io/deploy/admin/firewall/)
are distinct from self-hosted LiveKit port instructions.

### Controlled pilot prerequisites and runbook — NOT EXECUTED

The smallest unblock is an owner-provided, separately authorized hosted test
environment with its two HTTPS origins and service names, plus a scheduled group
of dedicated verified participants. The owner/user must explicitly authorize
any later staging deployment; this request does not do so. Do not create users,
select existing real tenants or modify production data to fill the gap.

| Test identity group | Setup before the pilot |
| --- | --- |
| Company A | 6–10 total active members, including its owner/admin and a disposable non-owner revocation subject. The admin counts toward the ten-seat cap; pending invitations also reserve seats |
| Company B | Separate dedicated owner and member, with no Company A membership. Both companies and their test offices must be explicitly designated as pilot data |
| Participants | Individually controlled inboxes and normal registration, email confirmation, invitation acceptance/login. Separate browser profiles/devices; no shared session, auto-confirm, admin-minted client tokens or RLS bypass |
| Audio | At least two independent microphones/speakers/headsets and listeners, supported browsers and permitted corporate network; synthetic tracks cannot satisfy this requirement |
| Coordination | One test operator/timekeeper and company admin; consent for any recordings. Use aliases in this report and record aggregate metrics only; never save raw HAR, heap dumps, cookies, JWTs or invitation URLs |
| Optional existing SQL runner | Only dedicated A/B/C UUIDs in ignored `supabase/.env.organization-tests.local`, with the existing exact development target/link guards. Run `pnpm test:organizations --check` before an approved live rollback-only suite. Do not paste UUID configuration secrets/passwords into this report |

Prepare participants before the scheduled workload window; verification emails
and invitations must be normal provider deliveries. Do not promote users through
Dashboard edits, disable confirmation, overfill the office, or remove the last
owner. Clear account/test-data scope before any membership revocation. If a live
rollback-only database suite is later run, it must still end in ROLLBACK.

Proposed pilot schedule (a test plan, not an elapsed observation):

| Stage | Procedure | Required observation / current result |
| --- | --- | --- |
| Preflight | Validate DNS/TLS, exact origins, callbacks/SMTP, both health/readiness responses, single process and safe logs | BLOCKED: environment absent |
| 0–5 min | Six Company A participants log in normally and enter one office, saving names/presets | NOT TESTED: membership, matching roster, one avatar per active user and consistent display names |
| 5–15 min | Concurrent movement around walls/furniture; participants send unique numbered plain-text messages within existing quotas; two users explicitly join voice | NOT TESTED: remote movement/presence, one copy of each message, persistence after reload, actual two-way audible phrases, mute/unmute and devices |
| 15–25 min | Increase to ten total members if available; repeat movement/chat, rotate speaking pairs, open panels on desktop/tablet/mobile | NOT TESTED: actual peak count, frame/latency samples, no missing participants, no cross-panel keyboard input, usable controls |
| 25–35 min | Refresh one browser; briefly interrupt/recover its network, then a small group; retry unconfirmed chat with the original draft | NOT TESTED: bounded reconnect, retained draft/idempotency, no duplicates, old socket/track cleanup and explicit voice rejoin when needed |
| 35–45 min | Run second-company and dedicated-member revocation cases below; restore only pilot access through normal invitations when needed | NOT TESTED: tenant isolation and measured active voice removal/replay denial |
| Final 5 min | Leave office/voice, sign out and close tabs; observe the remaining roster and resource metrics during cooldown | NOT TESTED: participant/track/listener cleanup, no continuing microphone use; record resource changes rather than assuming GC timing |

Existing voice eligibility is **Meeting Room zone-based**, from authoritative
server position, with explicit Join Voice. Test outside-zone rejection, boundary
entry, joining two users in the zone, and automatic media cleanup on zone exit.
There is no distance-radius attenuation or arbitrary nearby-avatar calling to
test in this implementation. Such functionality was not added under “proximity.”
Mobile chat/settings are responsive; office movement remains keyboard-based.
Record that limitation with pilot participants rather than inventing touch input.

### Multi-tenant and Cloud security test protocol — NOT TESTED here

| Case | Required actual execution / evidence |
| --- | --- |
| Company/office isolation | A member requests B workspace/office and B requests A; no private data, roster or state leaks. Own-company positive access must work in the same run |
| Chat authorization | A sends unique markers visible exactly once to A only; B cannot read history or send to A with its own valid session. Reload proves persisted isolation; anonymous/invalid-token rejection alone is insufficient |
| Voice admission | Cross-company office/session requests and an outside-zone user are rejected. A valid own-room token cannot grant access to the other company. A forged JWT only tests signature rejection, not authenticated tenancy |
| Membership removal | Company admin removes the dedicated non-owner using normal team management while its voice session remains active; measure loss of actual participation/audio, not only denial of a new token request |
| Original-token replay | Separate removal run immediately after normal admission; retain original app-issued token only in authorized operator memory and attempt Cloud rejoin while that token is still unexpired. An expired-token rejection is not evidence of revocation |
| Refreshed-token replay | Another normally authorized session/removal run; observe an actual Cloud-refreshed token, retain it privately in memory, and attempt Cloud rejoin after removal before it expires. Requesting a new application token is not this test |
| Post-removal access | Fresh app admission/token, chat and office attempts remain denied; old active connection cannot retain voice. Do not restore membership until negative observations finish |

The operator needs a controlled in-memory token-capture/replay procedure on the
approved test session; no such authenticated session or secure replay run was
available here. Do not export Network/HAR traces, paste tokens into a public
playground, log them, or mint privileged replacements. If original/refreshed proof
cannot be captured and positively identified, leave that individual row BLOCKED.
The original token's existing 30-second TTL must not be extended to simplify QA.
Use two normal membership-removal runs if the original proof has expired by the
time an actual Cloud refresh is observed; restore the test member through the
normal invitation/acceptance flow between runs.

Measure the existing **10-second** active voice revocation target with one
coordinator clock or a recorded clock uncertainty. Capture admin request start
`t0`, successful removal acknowledgement `t_ack`, and confirmed last loss-of-access
event `t_loss` (the later of actual disconnect and peer-observed audio cessation).
Commit occurs within the request/ack interval. Report the conservative elapsed
bound `t_loss - t0`; if it is <=10s, it satisfies the target. If
`t_loss - t_ack >10s`, it fails. An interval straddling 10s is inconclusive until
timing is refined. Record replay result categories and elapsed time, not proof.
Current `t0`, `t_ack`, `t_loss` and revocation elapsed: **NOT MEASURED**.

Short token expiry does not establish active-session termination. The existing
explicit removal cutoff is retained for Cloud refresh/replay protection. Testing
must distinguish an expired credential from a still-valid revoked credential.
These expectations follow [LiveKit token lifecycle/revocation](https://docs.livekit.io/frontends/reference/tokens-grants/).
Earlier user-reported security checks remain historical evidence; this hosted
pilot has not independently re-established those properties.

### Executed regressions and laboratory measurements

| Check | Result / scope |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` | PASS, both applications, strict checks and zero lint warnings |
| `pnpm build` | PASS, frontend and realtime production artifacts |
| `pnpm test` | PASS, **95 web + 24 realtime = 119**, including extended drain/auth race assertions |
| Database/setup suites | PASS, **6 runner tests**, 14 chat + 54 team + 26 foundation assertions and avatar/name access guards in disposable PostgreSQL; rollback fixtures |
| Production route / configured-project negative suites | PASS, **43 tests**, including SSR callback/recovery proof, private access, anonymous grants and browser secret boundaries |
| Compiled realtime negative suite | PASS, **1 test**; Cloud disabled in isolated child, live DB/Auth availability and denied admission |
| Chromium regression suites | PASS, **4/4**, chat, composition, office engine and voice controls; actual components with synthetic identity/store/media boundaries |
| Cloud control API and local readiness/CORS | PASS as availability/configuration observations above; no authenticated Cloud pilot |
| Real hosted load / target shutdown / true audio / tenant security / replay | NOT TESTED — BLOCKED by missing environment and participants |

**FAIL: the shutdown reservation regression failed before the fix; no unresolved
failure remains in the final executed checks.** Passing fixtures are not relabeled
as real-team, Cloud media or hosted infrastructure tests.

Commands used after the ordinary root lint/typecheck/build/test commands:

```powershell
node --test scripts/chat-database.test.mjs scripts/team-database.test.mjs scripts/test-organizations.test.mjs
node --experimental-strip-types --test scripts/test-realtime-live.mjs
node --test --test-concurrency=1 scripts/test-chat-browser.mjs scripts/test-communication-browser.mjs scripts/test-office-browser.mjs scripts/test-voice-browser.mjs
```

From `apps/web`:

```powershell
node --test --experimental-strip-types tests/auth-routes.test.mjs tests/voice-routes.test.mjs tests/auth-live.test.mjs tests/organizations-live.test.mjs tests/team-live.test.mjs tests/chat-live.test.mjs
```

Current lab observations, not a real pilot or capacity certification:

| Metric | Actual result | Qualification |
| --- | --- | --- |
| Concurrent transport clients | 10 synthetic-authorized clients in one canonical office, second isolated tenant room | Local actual HTTP/WS/Schema; no real logins |
| Simulation | **25 ticks / 1.201s = 20.8Hz** sampled, configured 20Hz; **0.228ms** mean work/tick | Short scheduler sample, no performance improvement claimed |
| One observer payload | **1,571 bytes / 21 packets**, **1,308 bytes/s** | Excludes wire/TLS framing and voice |
| First remote movement / committed chat | **78ms / 21ms** | Chat store has an intentional 15ms fixture delay; not Supabase/WAN timing |
| Phaser rendering | Chrome 155, i7-1165G7, SwiftShader: **44.0fps** one avatar, **45.8fps** ten avatars, ~1.2s samples | Synthetic rendered players, software GPU, no authenticated transport or audible media |
| Chat UI | **23ms** synthetic commit to DOM; **54/60fps** closed/open short samples | Includes observation/polling; not live message latency |
| Responsive composition | Desktop canvas 1388x634; tablet open-chat canvas 446x1010; 390px chat and 320px settings checks pass | Automated viewport/focus assertions, no real mobile keyboard/screen reader |
| Cleanup | Existing socket/renderer/subscription/track and repeated mount/unmount assertions pass | No byte-count memory leak or prolonged host RSS measurement claimed |
| Real pilot connected users, FPS, latency, audio, reconnection and memory | **NOT MEASURED** | No prepared hosted group |

During the real pilot, sample the browser Performance Frames track on actual
participant hardware at six and ten users; record device/browser/resolution,
sample duration, FPS/frame stalls, host CPU/RSS and post-leave cooldown values.
Inspect metrics locally and retain aggregates, not raw traces or heap snapshots
containing credentials. Label input-to-remote/chat timing only when a shared
clock or instrumented observation supports it; otherwise record qualitative
behavior and “latency not measured.” Count reconnect successes/attempts and
lingering sockets/tracks across repeated leave/rejoin, not just one success.
No numerical pilot acceptance result has been filled in from fixture data.

### Operational risks, rollback and final release gate

- Single voice authority/in-memory multiplayer ownership: no overlapping restart,
  autosleep or automatic replicas. A crashed process can interrupt calls; only
  the intended replacement may run the orphan sweep. Do not launch another
  Cloud-enabled test authority alongside the user's service.
- Readiness is cached availability, not authorization or a 10-second security
  monitor. Host TLS, proxy logging, restart/signal handling and actual corporate
  media connectivity remain unverified. Control-plane reachability is not audio.
- Existing rate limits remain enforced. Through a shared proxy, socket-address
  admission counters can group users; stagger repeated connection/voice attempts
  and report 429s instead of weakening limits or trusting arbitrary forwarded IPs.
- Separate invitation and Auth email setups can block onboarding. No unsupported
  recipient send, confirmation bypass or new provider was used to hide that risk.
- Existing Site URL is shared by the chosen project; choose its intended pilot
  origin deliberately. Public Next endpoint changes require a rebuild, and map
  versions must match the web/realtime artifacts.

Rollback/rehearsal plan: retain the prior compatible web/realtime artifact, map
and securely stored environment. Pause pilot entry, signal the current Node
authority, verify 503 readiness/admission during drain, wait for cleanup/exit
and only then start the previous authority and matching web artifact. Confirm
liveness/readiness, normal re-login and explicit voice rejoin; old sessions must
not be treated as recovered audio without observation. If graceful stop fails,
stop the pilot and investigate; do not run competing authorities. No database
reset, down migration, Auth-user deletion, tenant overwrite or unreviewed key
rotation is part of rollback. Hosted rollback itself is **NOT TESTED**.

Outstanding release requirements:

1. Owner names the existing/approved beta host and actual HTTPS web/realtime
   origins, grants appropriate test visibility, and separately authorizes any
   environment deployment. Nothing was deployed here.
2. Owner completes TLS/proxy/lifecycle, secret separation, verified sender and
   Auth SMTP/callback setup; actual host configuration and safe logs are reviewed.
3. Owner schedules the verified 6–10-member Company A group, separate Company B,
   authorized company admin and real audio endpoints on dedicated test data.
4. Execute and record the pilot/security/recovery protocol, including genuine
   unexpired original/refreshed replay and <=10s active voice loss measurements;
   any inaccessible capture/timing prerequisite stays BLOCKED.

**Step 3 preparation and available validation are finished. The hosted real-team
pilot is not executed, so Step 3 merge acceptance and private-beta deployment
approval remain NO.** No later phase or automatic staging deployment was started.

## Historical record — Phase 5 Step 2 — Private beta readiness and operational reliability

Date: 2026-10-22. Current branch confirmed by reading `.git/HEAD`:
`feature/p5-s02-private-beta-readiness`. No Git commands, migration, deployment,
new dependency, account creation, email send or tenant-data mutation was performed.
This section records Step 2's result; Step 3 above is the current release gate.

**Merge-ready: YES. Private-beta deployment-ready: NO.** The scoped operational
changes and available regressions pass. The supplied Step 2 brief reports that
the outstanding Step 1 manual checks have passed; that is accepted as
**user-reported PASS**, rather than agent-executed Cloud/audio evidence. No new
authenticated or audio test is claimed here. Deployment settings, host-level
operational rehearsal and measured real-team workload remain release gates.

### Implementation and audit findings

| Finding | Change and evidence |
| --- | --- |
| Existing health endpoints showed process availability without dependency readiness | Preserve web `/api/health` and realtime `/health`; add separate `/api/ready` and `/ready` with fixed check names/statuses and HTTP 200/503. A live dependency check and the intentionally voice-disabled compiled-server fixture exercise their actual behavior. |
| Realtime accepted malformed Supabase service URLs, including credentials, path/query/fragment, and non-HTTP localhost protocols | Require an HTTPS origin, or development/test loopback HTTP, before constructing the adapter. The added malformed-origin assertion failed before the fix and passes afterward. No credential values are used in regression fixtures. |
| A draining server could still report ready while media cleanup was being awaited | Set shutdown readiness false before awaiting the existing voice close hook; check again after pending readiness work. The actual HTTP/WebSocket regression observed 200 before the fix and now receives 503 during cleanup. Existing awaited shutdown/revocation regressions remain intact. |
| Next development access logs excluded invitations but not Auth confirmation/recovery query proof | Exclude `/auth/confirm` as well as `/invite` from incoming-request logging. The proof-path regression failed before the configuration change. Installed Next code confirms its access logger otherwise prints the request URL. |
| Default framework Server Function logging serializes prior action state, which can contain a one-time invitation URL | Disable `logging.serverFunctions`. A regression exercises the installed Next formatter with the actual prior-state shape and synthetic proof, confirming that its default formatter does not redact the URL. The configuration guard failed before the fix and now passes. No real proof was used or logged. |

Readiness uses one small shared server-side utility. It is not imported by client
components or normal page loads. No UI, map, sprite, movement protocol, database
schema, RLS rule or admission permission was changed.

### Readiness contract and safety

| Endpoint | Contract |
| --- | --- |
| Web `/api/health` | Existing HTTP 200 `{"status":"ok","service":"web"}`; liveness only |
| Realtime `/health` | Existing HTTP 200 `{"status":"ok"}`; now explicitly no-store |
| Web `/api/ready` | Configuration, Auth availability, database permission round trip and configured realtime `/ready`; HTTP 200 only if all are ready |
| Realtime `/ready` | Validated startup configuration/map, Auth, database round trip and recent voice control-plane availability; HTTP 503 during drain or missing/unavailable voice |

- Reports contain only `status` and fixed `checks` with `ready`/`unavailable`.
  Missing monitor wiring or shutdown can return just `{"status":"not_ready"}`.
  No provider errors, URLs, credentials, database schema names, user information,
  room inventory or timings are returned by these endpoints.
- Probes run in parallel with a **3-second deadline**, abort outbound fetches,
  reject redirects, use no-store and accept no request-selected destination.
  Only the configured public project key is sent to Supabase. Request cookies,
  bearer tokens and privileged keys are never forwarded. Incoming query strings
  do not control probes. A stalled dependency regression resolves in about 3s.
- One in-flight probe is shared per process and the completed result is retained
  for **5 seconds**. One hundred concurrent unit calls executed one dependency
  request; expiry and recovery were checked without an automatic retry loop.
  HTTP responses remain no-store. Aggregated status can lag a dependency change
  by this cache/deadline; it is not an authorization or revocation timer.
- Database availability expects the existing anonymous PostgreSQL `42501`
  privilege denial on `profiles?select=id&limit=0`. This is a safe round trip
  through PostgREST into PostgreSQL, not a tenant read or write. Missing schema,
  invalid keys, redirects and unexpected public read grants all fail readiness.
  It does not validate all migrations, positive authenticated queries or RLS.
- Voice readiness reuses the running authority's existing sweeps. It requires a
  successful control-plane observation less than **6 seconds** old and no known
  revocation failure. No second authority or extra Cloud sweeper is started.
  Missing voice leaves existing movement/chat behavior available while full-beta
  readiness is 503. The existing single-authority architecture is preserved.
- Email configuration is checked for required values/syntax; domain verification,
  recipient support and delivery are not probed. No automatic email is sent.
  Production rejects development link mode and public HTTP origins. Server-only
  loopback HTTP to realtime remains supported behind a trusted TLS proxy.
- Readiness proves service availability only. It does not prove end-to-end
  WebSockets, media, audible audio, issued-token replay protection or revocation
  timing. Use liveness for process restart decisions and readiness for alerts/
  host admission; dependency outages should not cause repeated restarts.

### Actual live observations and environment review

| Check | Result | Observation |
| --- | --- | --- |
| Existing development target and project consistency | PASS | Both app configurations match `rofutnholbtdmxccrkbs`; values/keys suppressed |
| Running web/realtime liveness | PASS | Both HTTP 200 at 04:18 UTC |
| Running realtime full readiness | PASS | HTTP 200 in 660ms at 04:18 UTC; configuration/Auth/database/voice ready |
| LiveKit Cloud read-only control API | PASS | 04:19:11 UTC, inventory completed in **529ms**, zero application rooms; no joins or participant changes |
| Final production web liveness using local development settings | PASS | 04:24:12 UTC, HTTP 200 in **7ms** |
| Final production web readiness correctly rejects development settings | PASS | 04:24:13 UTC, HTTP **503** in **229ms**: configuration unavailable, authentication/database/realtime ready |
| Built realtime with Cloud deliberately disabled | PASS | HTTP 503 readiness with only voice unavailable; liveness 200; actual configured-project DB/Auth checks succeeded |
| Dedicated test account configuration preflight | NOT TESTED prerequisite | No configured login or three dedicated UUIDs. `node scripts/test-organizations.mjs --check` reports the missing three authorized verified accounts and exits nonzero; no live rollback suite was attempted |
| Step 1 authenticated isolation, real audio, original/refreshed replay and <=10s Cloud revocation | PASS — user-reported | Supplied Step 2 context states outstanding checks passed manually. No raw timing, token proof, credentials or recordings were supplied or requested. Agent did not repeat these scenarios |
| Hosted beta TLS/WebSocket/media, process-manager shutdown and external logging | NOT TESTED | No target deployment configured or performed in this task |

The existing local web file is `.env`, not `.env.local`; both are supported and
ignored. Next's production order is inherited process environment, then
`.env.production.local`, `.env.local`, `.env.production`, `.env`. Public Next
variables are embedded at build time. The Node realtime start command loads only
its `.env`, preserving inherited values; dev explicitly sets development mode.
No local or production secret value was changed.

Current local settings use loopback HTTP for the application and public realtime
origin, a development HTTP allowed origin, and `INVITATION_DELIVERY_MODE=link`.
Email and server-only Cloud values are present. Their presence is not evidence
of a verified sender or working deployed email. Private beta needs HTTPS public
origins, exact matching realtime origin allowlists, production mode and normal
email invitations. This expected local/deployment separation explains readiness
503 in the production web observation; it is not a database outage.

### Automated validation executed

| Check | Result / scope |
| --- | --- |
| `pnpm lint` | PASS, both apps, no warnings |
| `pnpm typecheck` | PASS, both apps with generated Next route types |
| `pnpm build` | PASS, frontend and compiled realtime backend; rerun after final logging changes |
| `pnpm test` | PASS, **95 web + 24 realtime = 119**, zero failures/skips in final run |
| Database security/setup runners | PASS, **6 tests**: 14 chat, 54 team and 26 foundation SQL assertions plus avatar/name and anonymous/cross-user guards; disposable PostgreSQL, rollback fixtures |
| Production routes and live-negative Supabase suites | PASS, **43 tests**, final build; Auth/organization/invitation/chat/voice denials and public readiness response contract |
| Compiled realtime live-negative fixture | PASS, **1 test**, including actual DB/Auth readiness and intentional voice-unavailable 503; isolated child has Cloud credentials blanked |
| Actual Chromium chat suite | PASS, drafts, failure/idempotent retry, history/disconnect race, scroll/pagination, plain text, mobile and movement focus |
| Actual Chromium office composition suite | PASS, names, presets, focus, draft/panel persistence, responsive layouts, equivalent snapshot/render suppression and cleanup |
| Actual Chromium Phaser suite | PASS, controls/collisions, camera/resize, 10-avatar rendering/reuse and repeated teardown/remount |
| Actual Chromium voice UI suite | PASS, explicit capture, cancellation, mute/unmute, device/error observers, reconnection feedback and track/listener cleanup using synthetic media/participants |
| Agent-executed positive authenticated remote DB/Cloud workflow in Step 2 | NOT TESTED; no accessible dedicated account/session configuration |
| Real mobile keyboard/screen reader, prolonged memory soak, real 6–10-person browser/audio benchmark | NOT TESTED in this pass |

The focused tests deliberately reproduced the pre-fix failures described above.
**FAIL: no unresolved failures in final executed regression checks.** The account
preflight's nonzero exit is a documented prerequisite result, not a passing live
database test. UI browser fixtures use actual React/Phaser/SDK controls with
synthetic identity/store/provider boundaries; they are not Cloud/audio proof.

Commands beyond normal root scripts (production-route command runs in `apps/web`):

```powershell
node --test scripts/chat-database.test.mjs scripts/team-database.test.mjs scripts/test-organizations.test.mjs
node --test --test-concurrency=1 scripts/test-chat-browser.mjs scripts/test-communication-browser.mjs scripts/test-office-browser.mjs scripts/test-voice-browser.mjs
node --experimental-strip-types --test scripts/test-realtime-live.mjs
node --test --experimental-strip-types tests/auth-routes.test.mjs tests/voice-routes.test.mjs tests/auth-live.test.mjs tests/organizations-live.test.mjs tests/team-live.test.mjs tests/chat-live.test.mjs
```

### Measured performance and recovery review

- Final full realtime run: **10 synthetic-authorized clients**, real local
  HTTP/WebSocket/Schema transport. **23 ticks over 1.200s (19.2Hz sampled,
  configured 20Hz)**, **0.211ms** average simulation work/tick. One observer
  received **1,500 payload bytes / 20 packets / 1,250 bytes/s**, excluding framing.
  First remote movement was observed in **103ms**; committed synthetic-store
  chat in **21ms**, including the fixture's 15ms store delay. This is not WAN,
  Supabase persistence latency or Cloud capacity.
- Chrome 155 / i7-1165G7 / SwiftShader software WebGL, separate short render
  samples: **29.9fps one avatar**, **30.8fps ten avatars**, about 1.2s each.
  This does not establish sustained hardware-GPU 60fps or real-user capacity.
  No rendering change or measured speed improvement is claimed. Real team
  hardware, prolonged usage and concurrent voice require the beta rehearsal.
- Actual chat fixture: **40ms** committed synthetic event to DOM observation,
  panel closed/open **50.0/60.0fps** short samples. No live chat latency claim.
- Desktop 1422x804 kept a 1388x634 canvas; tablet 820x1180 with open chat kept
  446x1010 canvas; mobile 390x844 and settings at 320x740 had no horizontal
  overflow. Fresh desktop/mobile screenshots were visually inspected under
  ignored `.cache/`; controls, draft and the original pixel-art direction remain.
- Existing bounded reconnect, non-retryable auth denials, idempotent chat retry
  and draft retention, microphone permission feedback and explicit rejoin were
  reviewed and retested. Late history/state, Strict Mode replay, cancelled
  capture, shutdown and listener cleanup regressions remain passing. No new UI
  defect was reproduced, so no UI redesign or retry mechanism was added.

### Modified files

- Operational utility: `packages/shared/src/readiness.ts`.
- Web route/service/tests: `apps/web/src/app/api/ready/route.ts`,
  `apps/web/src/lib/readiness.ts`, `readiness.test.ts`, `logging.test.ts`,
  `apps/web/tests/auth-routes.test.mjs`, `apps/web/next.config.ts`.
- Realtime wiring/config/lifecycle: `apps/realtime/src/index.ts`, `server.ts`,
  `config/environment.ts`, `voice/service.ts`.
- Regressions: `apps/realtime/src/tests/security.test.ts`, `voice.test.ts`,
  `realtime.test.ts`, `scripts/test-realtime-live.mjs`.
- Existing docs/config examples: `README.md`, `docs/architecture.md`, this
  validation report, `apps/web/.env.example`, `apps/realtime/.env.example`.

### Remaining environment requirements and manual beta checklist

1. Provision no new infrastructure through this task. In the intended existing
   beta host, configure HTTPS `APP_URL`, public `NEXT_PUBLIC_REALTIME_URL`, exact
   `REALTIME_ALLOWED_ORIGINS`, the same intended Supabase project/public key on
   both apps, and server-only LiveKit values. Set realtime `NODE_ENV=production`.
   A server-only loopback internal origin is supported behind trusted TLS.
   Rebuild web after public-variable changes; restart after server changes.
2. Use `INVITATION_DELIVERY_MODE=email`, a verified sender domain and permitted
   Resend recipients. `onboarding@resend.dev` is restricted to the account's
   registered recipient and is insufficient for general team onboarding.
   Retain email confirmation; configure exact HTTPS Supabase Site URL/redirects
   and existing SSR confirmation/recovery templates from README. Verify a real
   invitation and Auth email manually; no email was sent here.
3. Build, start one realtime authority and the web process, allow warm-up, then
   check liveness and readiness. Probe every 10–15s using your existing host,
   with transient-failure tolerance. Verify alerts/traffic handling distinguish
   unavailable dependencies from a dead process. Require healthy readiness before
   inviting a team; no monitor/dashboard integration was installed here.
4. Confirm proxy TLS/WSS upgrades, timeouts, trusted origin forwarding, privacy
   headers and log redaction. Remove proof from invitation paths/Auth callback
   queries, request/action bodies, cookies, Authorization and reconnect
   subprotocol headers in proxy/error telemetry. Public health URLs need no proof.
5. With dedicated normally verified beta accounts, rehearse 6–10 concurrent team
   members and a second company: names, movement, presence, chat persistence,
   drafts, refresh/drop/reconnect, leaving and signed-out/cross-tenant denial.
   Record actual devices, duration, frame/latency/resource observations, not
   synthetic fixture numbers. Do not select unrelated tenant accounts.
6. Recheck real two-way audio/device/permission behavior on the target network;
   leave, zone exit, sign-out and interruption must release microphone/tracks.
   Preserve the user-reported Step 1 security results; capture safe timing-only
   evidence on the deployed configuration if repeating original/refreshed replay
   and active-member revocation against the 10-second target. Never log tokens.
7. Rehearse temporary Auth/database/realtime/Cloud failures without altering tenant
   data or RLS. Confirm feedback/drafts, bounded retries and readiness recovery.
   Verify the host delivers graceful shutdown to the actual Node process, allows
   at least 15 seconds for drain and does not overlap Cloud authorities. Check
   microphone/room cleanup and explicit voice rejoin after restart.

Known limits: readiness is cached availability, not security/E2E certification;
email delivery and real audio are external; office movement remains keyboard-
based; rendering samples use software GPU; no prolonged memory soak or hosted
operational rehearsal was performed. One voice authority per Cloud namespace is
required; horizontal scaling/failover infrastructure is outside this step.

Rollback: retain the prior compatible web/realtime artifact, environment and map
pair. Stop admission, gracefully drain and stop the current authority before
starting the prior one; expect users to reconnect/rejoin voice. Restore monitor
paths if the prior artifact lacks readiness endpoints. Do not roll back or reset
the database: this step contains no migration or tenant-data change. Do not
rotate keys or change namespaces as an unreviewed rollback shortcut.

**Final decision:** scoped code is merge-ready, with all executed checks passing
and the user's reported Step 1 manual sign-off recorded. Private-beta deployment
is not signed off until the intended host has correct production settings and
the target-environment checklist/rehearsal above is completed. No deployment was
attempted. Phase 5 Step 2 stops here; Step 3 was not started.

## Historical record — Phase 5 Step 1 — MVP stabilization and security hardening

Date: 2026-10-22. Branch confirmed by reading `.git/HEAD`:
`feature/p5-s01-mvp-stabilization`. Phase 4 merge status and successful manual
voice use were reported by the user; no Git history operation was performed to
verify that merge. The Phase 4 sections below are historical records. This
section records the stabilization result at that time; the Step 2 section above
records the subsequent user-reported manual sign-off and current decisions.
The latest real-world validation preflight is recorded in the continuation below
at 04:02 UTC; it remains blocked on accessible authenticated test sessions.

**Implementation and available automated validation are complete. Merge-ready:
NO.** Required authenticated multi-user, issued-token replay and measured Cloud
revocation checks remain NOT TESTED. User-reported working voice is useful
feedback, but does not supply those security measurements.

### Audit findings and fixes

| Finding / root cause | Minimal fix and regression evidence |
| --- | --- |
| Pending chat history survived connection loss and later changed the visible message window | Disconnect invalidates the history generation and clears its loading/anchor refs, retaining the draft and existing window. Actual component regression reproduced 60 messages instead of the expected unchanged 30 before the fix; it now passes and reconnect/history/retry remain usable. |
| Late state patches repopulated participants and changed presence to online after drop/final leave | Ignore synchronized state callbacks while the transport is offline. Regression failed with `online` instead of `reconnecting` before the fix; it now also checks final leave keeps an empty roster and no snapshot. |
| Production server shutdown did not await voice-service shutdown; the previous test manually closed it | Register the existing voice close operation with Colyseus `onBeforeShutdown`. The real HTTP/WebSocket fixture now relies on server shutdown and asserts that delayed voice cleanup completes before shutdown resolves. It failed without the hook and passes with it. |
| Shutdown could finish while a different caller was already removing media | Share both the overall close promise and each participant's removal promise. Gated-provider regressions prove overlapping close calls and an already-running zone-exit removal are awaited and issue one removal, instead of shutdown completing early. |
| A Cloud inventory response arriving after close could continue orphan removal against a replacement authority | Stop closed-service notification/observation and check the closed flag after inventory awaits and between identities. Gated room-list and participant-list regressions prove no later inventory/removal operation occurs after shutdown. An already-issued provider request cannot be undone. |
| A slow token signer could return admission after the fresh authorization lease expired, before the timer checked it | Recheck the existing lease immediately after signing; revoke and reject expired/cancelled admission. Regression first returned a token unexpectedly and now rejects it with 403. Consolidated the error path so this rejection does not remove the same admission twice. |
| Voice admission described an Auth service outage as a sign-in problem | Keep HTTP 503 and return a temporary-authentication-unavailability message. Regression proves neither session retrieval nor token forwarding runs after an unavailable Auth result. |

These are narrow lifecycle, freshness and feedback fixes. No new feature, schema,
dependency, map, sprite or authentication architecture was added. No confirmed
cross-company RLS bypass was found in this audit; that is not a claim that the
unexecuted authenticated Cloud cases pass.

### Scope reviewed and retained

- Auth: SSR cookie refresh/no-store behavior, fresh verified `getUser` at protected
  boundaries, expired/unverified/anonymous denial, recovery proof and redirects.
- Multiplayer: authoritative movement/collisions, canonical office admission,
  duplicate-user/seat limits, bounded reconnect, credential checks and hard lease.
- Chat/presence/profile: tenant RLS and database RPCs, committed-only messages,
  idempotency, quotas, bounded history, roster updates, display-name privacy,
  own-profile grants and listener cleanup. Movement remains outside React state.
- Voice: server-authorized meeting zone, office/company/session binding,
  server-only keys, microphone-only grants, explicit join, cancellation races,
  independent lease, Cloud removal cutoff, restart sweep and media cleanup.
- UI: existing compact panels, focus return, keyboard-scoped movement, mobile
  chat, status/error announcements and pixel-art rendering. No redesign was made.

The existing [Colyseus reconnect lifecycle](https://docs.colyseus.io/room/reconnection)
is retained. Cloud replay expectations follow the [LiveKit revocation contract](https://docs.livekit.io/frontends/reference/tokens-grants/):
the explicit cutoff covers initial and refreshed proof; token expiry alone is not
evidence of active-session termination. Enforcement still requires real testing.

### Current environment and actual live observations

- PASS: web and realtime configurations match the development Supabase project
  `rofutnholbtdmxccrkbs`. Both already-running health endpoints returned HTTP 200.
- PASS: existing local config scan found `apps/web/.env` and `apps/realtime/.env`;
  no populated dedicated test email/password, session/token or authorized test-user
  UUID settings were available. No such current-process test settings were found.
  Browser inventory returned zero connected browsers/apps, without inventory errors.
  This is a confirmed test prerequisite limitation, not a successful login test.
- PASS: on 2026-10-22 at 03:01:49 UTC, the configured Cloud control API accepted a
  read-only inventory request in **625ms**. It reported zero application rooms.
  The actual Cloud signaling endpoint rejected deliberately invalid proof with
  **HTTP 401**. This was not a valid-token join or a revoked-token replay.
- No real microphone, speaker, listening second endpoint or signed-in account
  was accessible for this pass. Hardware absence was not inferred. No account
  was created or selected from real-user records and no token was admin-minted to
  substitute for application authorization.

### Test results executed in this phase

| Check | Result and scope |
| --- | --- |
| `pnpm lint` | PASS, both applications, no warnings |
| `pnpm typecheck` | PASS, Next route types and strict TypeScript for both applications |
| `pnpm build` | PASS, web and realtime production builds |
| `pnpm test` | PASS, **88 web + 23 realtime = 111 tests**, zero failures/skips in the final run |
| Database security/setup suites | PASS, 6 runner tests; 14 chat, 54 team and 26 foundation SQL assertions plus avatar/name self-write, cross-user and anonymous guards; fixtures rolled back in disposable PostgreSQL |
| Production-route and live-negative Supabase suites | PASS, 42 tests across Auth, organization, invitations, chat and voice; no valid-user writes or emails |
| Built realtime negative-admission suite | PASS, 1 test: anonymous/invalid-proof/foreign-origin denial against configured Supabase; isolated child has Cloud voice disabled |
| Chat browser suite | PASS, extended delayed-history/disconnect regression, drafts, plain text, pagination, idempotent retries, scroll, focus and mobile behavior |
| Office composition browser suite | PASS, native panels, six presets, name/save/remount behavior, one engine, responsive layout and cleanup; synthetic action/identity/transport boundaries |
| Phaser browser suite | PASS, movement, walls/furniture, zoom/resize, six presets, sprite reuse, ten-avatar rendering and renderer teardown |
| Voice browser suite | PASS, actual React/SDK controls, simulated participants/connection and synthetic tracks: explicit capture, denial, names, mute/unmute, reconnect-disabled controls, device observers and cleanup |
| Actual Supabase/Cloud positive authenticated multi-user workflows | NOT TESTED; no authorized accessible sessions |

The new race/security tests first failed against the pre-fix implementation as
described above. A subsequent browser-batch failure was a test assumption: the
fixture expected Show latest after reconnect without putting the reader away
from the bottom. It now explicitly sets that reading position and waits for the
control; the focused rerun passed. Other browser suites passed unchanged.
**FAIL: no unresolved failures in the final executed checks.**

Commands used beyond normal root scripts:

```powershell
node --test scripts/chat-database.test.mjs scripts/team-database.test.mjs scripts/test-organizations.test.mjs
node --test --test-concurrency=1 scripts/test-chat-browser.mjs scripts/test-communication-browser.mjs scripts/test-office-browser.mjs scripts/test-voice-browser.mjs
node --experimental-strip-types --test scripts/test-realtime-live.mjs
```

Production/live-negative suites were run from `apps/web` using:

```powershell
node --test --experimental-strip-types tests/auth-routes.test.mjs tests/voice-routes.test.mjs tests/auth-live.test.mjs tests/organizations-live.test.mjs tests/team-live.test.mjs tests/chat-live.test.mjs
```

The final chat fixture correction was verified with
`node --test scripts/test-chat-browser.mjs`. Tests that use simulated users or
media are not represented as real authenticated/Cloud successes.

### Multi-user and Cloud security gate

| Required real scenario | Status | Available evidence / missing observation |
| --- | --- | --- |
| Two verified users join the same company office and see matching movements/presence/names | NOT TESTED | Local real-transport/synthetic-authorization and render fixtures pass; no two real authenticated sessions |
| Real chat synchronization, no duplicates, reload and persisted history | NOT TESTED | Local PostgreSQL and browser/transport fixtures pass; no authenticated live sends/history performed |
| Real refresh/reconnect/leave restores state and removes presence | NOT TESTED | Transport/component cleanup/reconnect regressions pass; real signed-in tab lifecycle unavailable |
| Real users in different companies remain isolated across office/chat | NOT TESTED | Local tenant fixtures and actual anonymous denials pass; authenticated tenant identities unavailable |
| Only authorized members obtain valid Cloud admission; cross-company requests fail | NOT TESTED | Unsigned/forged-input route denials and service binding tests pass; no positive authenticated token workflow |
| Revoked members cannot obtain new tokens | NOT TESTED | Synthetic membership denial passes; no dedicated live removable test membership |
| Original and refreshed token replay rejected by actual Cloud after revocation | NOT TESTED | Only fresh invalid proof was rejected by Cloud; no issued-token capture/replay executed |
| Active voice revoked within 10 seconds | NOT TESTED | No real removal performed and no elapsed revocation measurement; fake-provider timing is not Cloud evidence |
| Disconnected/zone-exited/revoked users cannot retain real voice participation | NOT TESTED | Lease/cancellation/shutdown regressions pass with fake provider; real Cloud participant not available |
| Two-way audible audio, microphone/device changes, real reconnect and track/listener cleanup | NOT TESTED | User reports working manual voice; no agent-observed two-endpoint audio or real-device checks |
| 6–10 real authenticated concurrent users with voice | NOT TESTED | Ten simulated-authorized transport clients and ten rendered avatars were measured separately |

### Performance and responsive observations

No frame-rate or latency improvement is claimed. Short local samples are not
production capacity, WAN latency or a sustained 60fps benchmark.

- Final full application/realtime run: ten-player transport fixture observed
  **24 simulation ticks over 1.202s (20Hz sample; configured 20Hz)** and mean
  simulation work **0.226ms/tick**. One observer received 1,571 payload bytes
  (1,307 bytes/s, excluding wire framing). Synthetic-store chat was observed in
  21ms and first remote movement in 105ms. No live Supabase commit/audio latency.
- Chromium 155 / i7-1165G7 / SwiftShader: separate Phaser fixture measured
  **44.1fps with one avatar, 46.6fps with ten avatars**, approximately 1.2s each.
  Sprite/texture reuse and destruction assertions passed; real hardware GPU,
  prolonged memory growth and ten-person voice load remain NOT TESTED.
- Final focused chat run: committed synthetic message to DOM observation **7ms**
  including polling. Closed/open panel samples were **55.0/59.6fps** over about
  1.2s. These are workload-dependent fixture observations, not service latency.
- Composition: desktop 1422×804 has a 1388×634 closed-chat canvas; tablet 820×1180
  retains a 446×1010 canvas with chat open. The 390×844 chat and 320×740 settings
  checks pass without horizontal overflow. Real mobile keyboards and assistive
  technology remain manual checks. The map, camera and controls were preserved.
- 1,000 equivalent voice snapshots cause one initial composition commit; roster
  callbacks remain independent of movement-only patches. Listener/canvas cleanup
  assertions pass. No per-frame React state or new texture path was added.

Current screenshots remain under ignored `.cache/` using the existing chat,
communication, office and voice preview filenames. These show isolated fixtures.

### Files modified in Phase 5 Step 1

- `apps/realtime/src/server.ts`: awaited pre-shutdown voice cleanup.
- `apps/realtime/src/voice/service.ts`: closed-poll guards, post-signing freshness,
  shared shutdown/removal promises and one rejection cleanup path.
- `apps/realtime/src/tests/{voice,realtime}.test.ts`: race and actual server-hook
  regression coverage; no Cloud credentials used by the fake provider.
- `apps/web/src/features/chat/chat-panel.tsx`: disconnect invalidation.
- `apps/web/src/features/office/network/{connection,network.test}.ts`: offline
  state guard and regression.
- `apps/web/src/features/voice/{token-service,voice.test}.ts`: temporary Auth outage
  feedback and no-forward regression.
- `scripts/test-chat-browser.mjs`: delayed-history fixture and reconnect reading
  setup; existing browser infrastructure reused.
- This existing validation report; no new documentation file was created.

### Remaining production blockers / decision

**Merge-ready: NO.** Supply access to approved verified test accounts in separate
connected browser profiles, a safe non-production cross-company/removal fixture,
and two real audio endpoints to complete the live gate. Do not paste credentials
or tokens. The existing manual sequence later in this report remains applicable.
Capture actual removal timestamps and original/refreshed replay outcomes in the
authorized private test context before claiming the 10-second security target.

Deployment remains a **single realtime/voice authority per configured namespace**.
Concurrent authorities can orphan-sweep each other's sessions. Graceful shutdown
now awaits cleanup attempts; process crashes, force-kill and Cloud/API outage
still cannot guarantee removal within ten seconds. These limits must remain
explicit until actual failure-path and Cloud enforcement tests supply evidence.

No Git command, branch switch, commit, push, merge, deployment, remote migration,
email delivery, production data reset or tenant-data write was performed. Stop
after Phase 5 Step 1; Phase 5 Step 2 was not started.

### Real-world validation continuation — 2026-10-22, 04:02 UTC

This continuation inspected the current Auth, workspace membership and voice
admission paths, the existing test-account configuration and available browser
connections. Only this report was edited. No new application defect was
established; no code, dependencies, migrations or test accounts were added.
The previous 111 application/realtime tests and 42 route checks are historical
executed results, not newly executed authenticated integration tests. They were
not repeatedly rerun in the absence of authentication prerequisites.

#### Actual prerequisite results

| Prerequisite/check performed now | Result | Observation |
| --- | --- | --- |
| Expected branch | PASS | `.git/HEAD` identifies `feature/p5-s01-mvp-stabilization`; no Git command used |
| Development project configuration | PASS | Web/realtime public configuration matches `rofutnholbtdmxccrkbs` |
| Running web and realtime health | PASS | Both configured health endpoints returned HTTP 200 at 04:02:01 UTC |
| Cloud configuration and control API | PASS | Existing server-only configuration valid; read-only room inventory completed in **466ms** at 04:02:02 UTC; zero application rooms observed |
| Accessible authorized browser sessions | BLOCKED | Inventory: zero connected browsers/apps, zero inventory errors; existing account availability/roles cannot be inferred from this |
| Dedicated login/session configuration | BLOCKED | Recognized local files present: `apps/web/.env`, `apps/realtime/.env`; no populated test email/password/session/token/user-UUID settings found, including in process environment; ignored organization-test config absent |
| Physical audio endpoints | NOT TESTED | No connected signed-in browser/device session through which to inspect permissions or devices; no claim that hardware is absent |

Cloud control-API credentials are available. They do not authenticate a person to
Supabase or establish workspace membership. No account listing/admin Auth bypass
was used to select real users. No tenant records, memberships, profiles or chat
were changed. No media token, original/refreshed replay proof or audio was
captured. The running realtime authority was not restarted or duplicated.

#### Smallest safe account setup to unblock

Reuse approved existing development test users and workspaces if already prepared.
The minimum is **three accounts**, with A also acting as the administrator:

| Test identity | Required company membership | Purpose | Current verification |
| --- | --- | --- | --- |
| A | OWNER of disposable test company X | Company administrator; observes B's movement/audio and removes only B's test membership | NOT TESTED |
| B | Verified ACTIVE MEMBER of X | Second user, audio endpoint and revocation/replay subject; never the last owner | NOT TESTED |
| C | Verified ACTIVE member/owner of separate disposable company Y, with no X membership | Cross-company isolation checks | NOT TESTED |

1. In three separate browser profiles, sign in normally to the configured local
   app's `/login` as A, B and C. Make those profiles/tabs accessible through this
   workspace's browser connection. Merely opening unconnected browser windows or
   providing user UUIDs does not provide authenticated sessions. Do not share
   passwords, session cookies, invitation links or tokens. A and B alone unblock
   the first same-office checks; C is additionally required to complete isolation.
2. If membership setup is needed, use only approved disposable development data.
   As A, open `/dashboard` → **Create workspace**, create test company X, and use
   **Team members** to invite B as MEMBER. B must explicitly accept with the
   invited, verified account. Reuse the existing permitted email or development
   invitation-link mode; do not change sender/security configuration to bypass a
   delivery restriction. As C, reuse or create test company Y and confirm X is
   not among C's memberships. Never reuse a real company's records for removal.
3. If an account is missing, its owner must first register through `/register`,
   complete the real inbox confirmation and sign in normally. Do not auto-confirm
   users, edit Auth tables or disable confirmation. Follow the existing
   [dedicated account instructions](organizations.md#dedicated-test-accounts)
   and [Supabase password-auth guidance](https://supabase.com/docs/guides/auth/passwords).
   No new account was created by the agent during this pass.
4. In each session, set distinguishable non-email display names in **Avatar
   settings**, then use **Enter office**. Confirm A's OWNER role and B/C's expected
   active memberships through normal application views before any destructive
   test action. Remove only the explicitly designated disposable B membership.
5. If using the existing rollback-only SQL suites as additional checks, place
   only the approved test UUIDs in ignored
   `supabase/.env.organization-tests.local`, following its existing example.
   UUID configuration enables those database tests; it does **not** authenticate
   browser, chat or voice sessions and cannot satisfy this integration gate.

No further Cloud key setup is needed to begin. The smallest immediate action is
to connect the already verified A/B browser profiles, then C's separate-company
profile for isolation. If browser connection is unavailable, perform the manual
sequence below and supply sanitized observations; those must be labelled
user-observed, not agent-executed tests.

#### Individual real-world results for this continuation

| Test | Result | Evidence available now |
| --- | --- | --- |
| A and B authenticate and enter X's office | NOT TESTED | No accessible real account session |
| A/B avatar movement synchronizes | NOT TESTED | No authenticated concurrent office users |
| Join/leave presence updates match on both sides | NOT TESTED | No real presence lifecycle observed |
| Chat synchronizes without duplicates; persists after refresh | NOT TESTED | No authenticated send/history request executed |
| Refresh and temporary network reconnect restore state | NOT TESTED | No authenticated tab/socket available |
| C cannot access X's office or see its presence | NOT TESTED | No verified C/X membership context |
| C cannot read/send X's chat | NOT TESTED | No real C-authenticated request |
| Authorized A/B obtain tokens and connect to Cloud | NOT TESTED | No valid application admission issued |
| Unauthenticated admission fails in this continuation | NOT TESTED anew | Earlier actual denial checks remain recorded above; not rerun as a substitute for authentication |
| C cannot obtain admission to X or receive X's audio | NOT TESTED | No authenticated cross-company request or C media endpoint |
| Removed B cannot obtain a new token | NOT TESTED | No live disposable B membership removed |
| Existing B participation ends after membership revocation | NOT TESTED | No established B Cloud participation or removal |
| Original issued-token replay after revocation | NOT TESTED | No legitimately issued original proof, replay attempt or Cloud rejection captured |
| Cloud-refreshed-token replay after revocation | NOT TESTED | No refresh event/proof observed and no replay attempt |
| Effective revocation within 10 seconds | NOT TESTED | **No revocation time measured; no numeric removal latency available** |
| Bidirectional audible audio | NOT TESTED | No two controlled physical audio endpoints/listeners |
| Mic mute/unmute and supported device switching | NOT TESTED | No real microphone/device interaction |
| Leave/rejoin/reconnect, zone exit and media cleanup | NOT TESTED | No actual media session or duplicate-track/listener observation |

**FAIL:** no new executed check failed. Blocked/unexecuted cases remain NOT
TESTED. User-reported basic voice success and the previously passing synthetic
browser/provider tests do not change any of these live results.

#### Controlled integration and audio checklist once accounts are connected

1. Keep exactly one configured realtime/voice authority. A/B enter X concurrently;
   move each avatar, change availability, send uniquely labelled non-sensitive
   chat messages, and observe both sessions. Refresh B, then briefly interrupt
   and restore only B's network. Check one participant per user, synchronized
   presence/names, one copy of each message and restored valid state.
2. As C, attempt X's office route and authenticated chat/admission requests using
   X's test office identifier. Require permission denial and no X data, roster,
   messages, token or audio. C's legitimate Y session must remain isolated.
   An anonymous denial alone does not prove this authenticated isolation check.
3. With two people/devices and headphones, A/B enter the server-authorized
   Meeting Room and explicitly Join Voice. Allow microphone permission normally.
   A speaks a unique test phrase; B confirms hearing it. Reverse direction. Mute
   each side and verify the other stops hearing it, then unmute. A participant
   count or speaking indicator alone is insufficient proof of audibility.
4. Switch real input/output devices where supported; record unsupported output
   switching as a capability limit. Verify Leave, explicit rejoin, temporary
   reconnect and zone exit. Check the browser microphone indicator clears, remote
   audio stops/tracks disappear and no duplicate participant/track remains.
   Do not use fake/synthetic media or recordings as proof of this audio test.

#### Replay and timing evidence required before a security PASS

The original admission is signed by the existing application server after normal
Supabase/member/zone checks and must actually be accepted by Cloud. A refreshed
token must be genuinely delivered by Cloud during that participant session.
Do not replace either with an admin-generated test JWT. The existing browser
scripts simulate media and do not currently constitute a real-token replay
harness. Ordinary UI-only voice use cannot establish either replay result.

An authorized private, memory-only test controller must retain those proofs
without console output, screenshots of token-bearing panels, HAR exports,
clipboard sharing or persistent files. Once genuine admission is available,
instrument that test session rather than adding a token/debug endpoint to the
application. If refresh proof is not observed, leave its check NOT TESTED.
The required [LiveKit token lifecycle and cutoff behavior](https://docs.livekit.io/frontends/reference/tokens-grants/)
is separate from new-token-request authorization.

- Run original-proof and refreshed-proof trials separately if necessary. The
  original admission lifetime is currently 30 seconds. Join, revoke and attempt
  replay while the proof is still unexpired; expiration rejection does not prove
  revocation. Capture only sanitized validity-at-replay and rejection categories.
- As A, remove only B's disposable membership through **Team members** while B
  has an established, active voice session. Do not press Leave Voice or otherwise
  voluntarily end B's session first. Observe B's actual Cloud disconnection and
  A's loss of B's media; rejection of B's next token request is a separate test.
- Using one measurement clock, record removal-request start `Tstart`, successful
  commit acknowledgement `Tack`, and effective observed loss `Tloss`. Record
  both `Tloss - Tstart` (conservative upper bound from commit) and
  `Tloss - Tack` (lower bound). An upper bound <=10s establishes the target; a
  lower bound >10s fails it. If the bounds straddle 10s, obtain more precise
  commit timing instead of inventing a pass. Never subtract unrelated devices'
  unsynchronized clocks. Check both actual disconnection and media loss.
- Attempt reconnect with each saved proof using its original opaque identity;
  require Cloud authorization rejection, not merely a later application sweep,
  duplicate-identity conflict, timeout or expired-proof error. Then test fresh
  application admission denial. Record each result independently.
- Record safe timestamps, durations, token category (`original`/`refreshed`),
  unexpired-at-replay boolean, sanitized Cloud rejection category and active
  media-loss observation. Never record token values, keys or personal addresses.
  Restore B only through a normal authorized invitation and explicit acceptance
  if a second trial is needed; no production membership changes or SQL bypasses.

No such timing or replay evidence exists from this continuation. Current
merge-readiness remains **NO**. Authentication/session access is the immediate
blocker; real audio and genuine replay instrumentation are additional requirements
for their respective checks. No Phase 5 Step 2 work was started.

## Historical record — Phase 4 Step 2

Validation date: 2026-10-22. Expected branch was confirmed by reading `.git/HEAD`:
`feature/p4-s02-communication-polish`. No Git commands, branch changes, commits,
remote migrations, email delivery, Auth user creation or production data changes.

Implementation is complete. **Not merge-ready until the authenticated browser
and LiveKit Cloud security/media checks below have been completed.** Local tests
and synthetic browser fixtures cannot establish those live guarantees.
The validation-only continuation below reconfirmed the available environment and
live denial paths; the authenticated/media gates remain blocked, not passed.

## UX changes and inspection

1. **Office layout — PASSED in isolated browser composition.** The protected
   office page fills the viewport with a compact workspace header, one toolbar,
   flexible canvas, contextual voice controls and a status footer. Avatar and
   participant settings no longer add sections above/below the canvas. The map,
   assets, collision geometry, camera tracking and zoom algorithm are unchanged.
2. **Office Chat — PASSED in isolated browser tests.** A 340px desktop side panel
   leaves the canvas visible; tablets retain side-by-side layout from 768px.
   Smaller screens use a dedicated chat view. Own messages have a border and
   `(you)` label, readable local date/time, plain text and a bounded composer.
   Closing/reopening preserves the draft, loaded history and reading position.
   Reconnect does not interrupt older-history reading; Show latest is explicit.
   The five-per-ten-second quota, database commits, idempotency and authorization
   contracts are unchanged. No new channels, attachments or direct messages.
3. **Appearance and participants — PASSED in isolated browser tests.** Both are
   native, non-modal disclosures closed initially. Only one stays open. Panels
   support outside-pointer dismissal, Close, Escape and focus return. The six
   original presets use the existing spritesheet with integer scaling. Selection
   remains a preview until Save appearance; saving does not recreate the engine.
   A display-name field edits the existing `profiles.display_name` column.
4. **Voice — PASSED in SDK-simulated browser tests; live media NOT TESTED.** Join,
   Leave, microphone status/toggle, participants, permission errors and device
   controls remain compact. The participant/device expansion is height-bounded.
   No automatic microphone capture, new Room creation path or silent forbidden
   retry was introduced. Device observer and Strict Mode cleanup fixes from
   Step 1 are preserved.

Current-run screenshots were saved and visually inspected under ignored `.cache/`:
`communication-before-chat.png`, `communication-before-mobile.png`,
`communication-office-desktop.png`, `communication-chat-desktop.png`,
`communication-tablet.png`, `communication-chat-mobile.png`,
`communication-settings-mobile.png`, plus existing chat/engine/voice previews.
The before image is the existing isolated chat/Phaser harness, not the complete
authenticated office page. These are component/composition checks with synthetic
identities, not an audit of a live signed-in two-user flow.

## Display-name source and privacy

The existing profile defaults `display_name` to an empty string. No previous UI
allowed setting it. The web server and realtime authorizer already read that
profile; blank values therefore propagated as generic labels. Appearance settings
now provide the missing edit without adding a profile system or migration.

The action and service derive the identity from fresh verified Supabase Auth,
then use the existing narrow profile grants and self-only RLS. A single PATCH
saves the explicitly edited name/avatar; missing-profile insertion and creation
races retain both fields. Existing avatar-only callers preserve unrelated names.
Tests cover denied/anonymous/unverified writes and cross-user SQL denial.

Names normalize NFKC/spacing, accept 1–18 Unicode code points for new edits,
reject email-like names and hidden control/bidi characters, and render as text.
Existing longer names are safely truncated for presentation. The shared missing
or private-name fallback is `Member`; a real display name literally `You` is no
longer confused with a missing profile. The local avatar uses its profile name
with a green label instead of spending the name budget on a `You ·` prefix.

Chat uses the already authorized office roster's names where present and the
stored sender-name snapshot otherwise. Historical rows are not rewritten and
other users' private profile rows are not queried. No N+1 lookup was added.
Realtime profile changes arrive through existing credential/authorization refresh;
LiveKit names are the verified profile snapshot at admission. After changing a
name during an existing voice call, leave and explicitly join again to refresh
that call's participant name. Offline/historical senders without a current roster
entry retain their persisted snapshot or private fallback.

## Reliability fixes

- Chat previously resubscribed on every open/close and loaded latest history,
  replacing reading position. Its connection subscription is now stable and
  opening loads only when necessary. Async request invalidation also resets
  in-flight refs for Strict Mode effect replay and initially open remounts.
- Office presence now distinguishes authorization denial from recoverable
  disconnection. Missing/expired credentials and HTTP 401/403 deny access;
  server close code 4000 is terminal. Denied states stop credential polling and
  reconnection recovery handlers cannot restore them. No Retry button is shown
  for denial. Network recovery still uses existing bounded Colyseus reconnects.
- LiveKit components-react 2.9.24 overwrites `TrackToggle.disabled` with its own
  pending state. A native disabled fieldset now enforces connection readiness
  independently. The browser regression verifies `:disabled` during simulated
  reconnect, then normal mute/unmute after connection is restored.
- Chat rows and panel are memoized with stable production callbacks. Participants
  remain presentation-only; movement coordinates never enter React state.
  Existing equivalent voice snapshots still bail out before React updates.

## Accessibility and responsive checks

Native summaries, labeled inputs/selects, radio fieldset/legend, explicit Close
buttons, Escape, focus return, visible focus outlines and error/status roles are
preserved or added. Panels are non-modal and do not trap focus. The canvas still
releases keyboard input with Tab; chat typing does not move the avatar. Mobile
continues to state that office movement requires a keyboard; touch movement was
not added. Very short viewports can scroll rather than hiding essential controls.

Office input/control borders now use `#87958b` (3.13:1 against white); existing
muted text is 5.76:1 and forest text/focus is 8.34:1 against white, calculated from
the CSS colors. Disabled controls are excluded from these contrast claims. This
is targeted checking, not a full WCAG or screen-reader compliance certification.
Real mobile virtual keyboards, assistive technology and browser engines other
than the installed Chromium remain manual checks.

## Security verification and limits

| Check | Actual result |
| --- | --- |
| Configured web/realtime development target | PASSED: both match `rofutnholbtdmxccrkbs`; values/keys suppressed |
| Anonymous Supabase profile/org/team/chat reads and RPCs | PASSED against actual configured project |
| Invalid Auth proof, session cookies, confirmation/recovery and redirects | PASSED against actual configured project/production app |
| Cross-tenant office, removed-member rejoin, reconnect and session expiry | PASSED with real Colyseus transport and synthetic authorization |
| Chat tenant RLS, append-only persistence, idempotency, rate limits | PASSED in disposable PostgreSQL with synthetic identities; live authenticated version NOT TESTED |
| Own profile name/avatar writes, cross-user and anonymous denial | PASSED in service tests and disposable PostgreSQL; live authenticated save NOT TESTED |
| Voice tenant/office/session/zone binding and microphone-only grants | PASSED in server/service and signed synthetic-token tests |
| Voice cancellation races, lease expiry, membership removal and provider failure | PASSED with fake provider; explicit cutoff/removal calls asserted |
| Microphone capture consent, leave/cancel/unmount cleanup | PASSED in lifecycle and actual UI tests using synthetic tracks |
| Browser bundles contain no server LiveKit credential references/admin SDK | PASSED in production bundle checks |
| LiveKit Cloud control API connectivity | PASSED: latest read-only inventory 477ms, zero application rooms at observation; earlier sample 496ms |
| Actual initial/refreshed token replay after revocation | NOT TESTED: requires authorized Cloud sessions |
| Actual active-session revocation within 10 seconds | NOT TESTED: no authorized live sessions; no timing guarantee inferred from fake provider |
| Two-user authenticated office/chat/audio and remote-device playback | NOT TESTED: no dedicated test logins or connected authorized sessions |

The existing server-controlled zone, fresh Auth/RLS membership checks, short
admission, independent voice lease, explicit Cloud revocation cutoff and opaque
identities remain intact. No RLS, token grants, email verification, migrations or
auth architecture were weakened. Cloud removal failure still pauses admission;
provider/API outage prevents promising a hard 10-second removal bound. See the
[LiveKit token revocation contract](https://docs.livekit.io/frontends/reference/tokens-grants/).

## Executed checks (implementation baseline)

| Command/check | Result |
| --- | --- |
| `pnpm lint` | PASSED, web and realtime, zero warnings |
| `pnpm typecheck` | PASSED, Next route generation and both TypeScript projects |
| `pnpm build` | PASSED, production web and realtime builds |
| `pnpm test` | PASSED, 86 web + 19 realtime tests, no failures/skips |
| `node --test scripts/chat-database.test.mjs scripts/team-database.test.mjs scripts/test-organizations.test.mjs` | PASSED, 6 runner tests; 14 chat + 54 team + 26 foundation SQL assertions, profile name/avatar RLS guards and rollback completion |
| Web production-route + live-negative suites | PASSED, 42 tests across Auth smoke/live, organization, invitation, chat and voice suites |
| Final production auth/voice route rerun | PASSED, 12 tests, including public bundle deferral and no server credential/admin SDK references |
| `pnpm test:realtime:live` | PASSED, one built-server anonymous/invalid-proof/foreign-origin test; isolated child has Cloud voice disabled |
| `pnpm test:office:browser` | PASSED, actual Phaser movement/collisions/focus/zoom/resize, six presets, sprite reuse, network fixture and teardown |
| Final chat/composition/voice browser pass | PASSED, 3 suites, Chromium, no runtime exceptions/React loop warnings |
| Node syntax checks on all four browser scripts | PASSED |

Browser fixtures run sequentially with:

```powershell
node --test --test-concurrency=1 scripts/test-chat-browser.mjs scripts/test-communication-browser.mjs scripts/test-voice-browser.mjs
```

The separate engine run uses `pnpm test:office:browser`. The new focused command
is `pnpm test:communication:browser`; build first so generated production CSS is
available. Actual connected Cloud audio and positive authenticated database
workflows are **NOT TESTED**, independently of these passing fixture suites.

Earlier **FAILED** runs were resolved: an isolated fixture lacked the public env
replacement normally supplied by Next; concurrent Chromium teardown caused
Windows cache file locks; the engine test expected the old `You` fallback; and
the new voice reconnect assertion exposed the real ignored-disabled-prop defect
fixed above. Final executed suites pass. The communication harness preserves
the original assertion error if Windows delays cache-profile deletion; it never
treats an application assertion failure as success.

## Measurements

Measurements are short local samples, not a WAN/media benchmark or evidence of
production 60fps. Browser: Chrome 155 on Windows, i7-1165G7, SwiftShader software
WebGL. No representative hardware-GPU or real microphone session was measured.

- Full office at 1422×804: canvas 1388×634 while chat is closed (about 79% of
  viewport height); document width/height exactly match the viewport.
- Tablet at 820×1180 with chat open: canvas 446×1010; no page overflow. Mobile
  at 390×844: dedicated chat and composer fit the viewport, canvas intentionally
  hidden. Additional 320×740 settings/keyboard-focus checks pass without horizontal
  overflow. Actual mobile virtual-keyboard behavior remains manual.
- 1,000 equivalent voice snapshots caused **one** full-composition React commit,
  for the first changed state, not 1,000. A separate transport regression sent
  1,000 movement-only patches and observed one initial roster callback; changing
  the profile name produced the next callback. Ten reconnect notifications did
  not add message subscriptions; teardown discarded stale callbacks/listeners.
- Final chat fixture: committed-message-to-DOM observation 70ms, including test
  polling and synthetic commits. Short closed/open panel samples were 55.5/60.0fps
  over about 1.2 seconds each. Different workload/warmup means this is **not** a
  measured frame-rate improvement or actual database/network latency.
- Separate Phaser fixture: 44.9fps single avatar and 46.6fps ten avatars in short
  software-rendered samples; all renderer/movement correctness checks passed.
- Real local Colyseus transport with synthetic authorization: 24 ticks / 1.201s
  (20Hz), mean simulation work 0.309ms/tick; committed synthetic-store chat observed
  in 21ms, first remote movement 103ms; one observer received 1,571 payload bytes
  (1,308 bytes/s) during the ten-player measurement. Not live Supabase/Cloud timing.
- Read-only Cloud API inventory completed in 496ms; this does not measure voice
  signaling, ICE establishment, sound latency or revocation.

No animation/texture allocation path was added. Existing sprite reuse, deferred
Phaser import, deferred LiveKit import after explicit Join and bounded message
window are retained. Memoization follows the [React memo guidance](https://react.dev/reference/react/memo)
with stable production props; no new library was installed.

No new dependencies or environment variables are required. Existing ignored
`apps/web/.env` and `apps/realtime/.env` remain the configuration sources.
No migration was created or applied; existing grants already support name edits.

## Validation-only continuation — 2026-10-22

Observed at 02:40–02:41 UTC (08:10–08:11 Asia/Colombo). The branch was reconfirmed
by reading `.git/HEAD`; no Git operations were performed. Only this existing
report was edited. No application defect was established, so no code, dependency,
environment or migration changes were made. The baseline checks above were not
relabelled as newly executed authenticated or Cloud media tests.

### Available environment and actual observations

- **PASS:** the effective development web environment loads `apps/web/.env`.
  Web and realtime public configuration both match the approved Supabase project
  `rofutnholbtdmxccrkbs`. Configured web `/api/health` and realtime `/health`
  returned HTTP 200 from the already-running services.
- **PASS:** all required server-side LiveKit configuration is present and passes
  the existing Cloud-only configuration validation. An authenticated, read-only
  Cloud room-list request completed in **477ms** and found **zero application
  rooms**. This was a single control-API sample, not media or revocation latency.
  No room was created and no participant was removed.
- **PASS:** a signaling handshake using deliberately invalid, synthetic proof
  was rejected by the actual configured LiveKit Cloud endpoint with **HTTP 401**.
  No issued application token was used. This proves invalid-proof rejection,
  **not replay rejection of an originally valid or refreshed token**.
- **BLOCKED prerequisite:** browser inventory returned **0 connected browsers,
  0 connected apps, 0 inventory errors**. There are no accessible signed-in
  sessions for either approved test member. The two running services do not
  themselves provide an authenticated user session.
- **BLOCKED prerequisite:** the recognized local env files present were
  `apps/web/.env` and `apps/realtime/.env`; no populated test email/password,
  test session/token or authorized test-user UUID settings were found in those
  files or the current process. The ignored organization-test configuration file
  was absent. No arbitrary real user was selected and no Auth user was created.
- **NOT TESTED prerequisite:** physical input/output devices, browser microphone
  permissions and a listening second user could not be inspected through an
  accessible browser. This does **not** establish that the machine has no audio
  hardware. No real microphone was captured or audio playback claimed.

No credentials, account addresses, participant identities, invitation links or
issued tokens were printed, persisted for testing or requested from the user.
No Cloud administrator token was used to bypass normal application admission.
No production data, membership, profile or chat record was changed. The existing
configured voice authority was left running; no competing Cloud-enabled realtime
process was started.

### Requested scenario results

These rows concern **actual authenticated application/Cloud workflows**. Earlier
synthetic fixtures remain separate evidence and cannot change these results.

| Requested check | Result | Observation / blocker |
| --- | --- | --- |
| Two different authenticated users join the office | NOT TESTED | No accessible authorized sessions or configured test logins |
| Both users observe correct participant presence | NOT TESTED | Requires those two live office sessions |
| Display names match across avatars, chat, office and voice lists | NOT TESTED | Requires authenticated profiles and actual voice admissions |
| Chat synchronizes between users and persists after reload | NOT TESTED | No authorized send/history workflow executed |
| Authenticated authorization and cross-company office/chat isolation | NOT TESTED | No authorized test identities and isolated tenant fixtures available |
| Two users join the same real voice room through normal admission | NOT TESTED | No authenticated office/zone sessions; zero application Cloud rooms observed |
| Real microphone enable/disable | NOT TESTED | No accessible signed-in browser/audio device session |
| Bidirectional audible audio | NOT TESTED | No two real endpoints or listening users; no sound observation |
| Real input/output device switching where supported | NOT TESTED | Browser/device capabilities unavailable for inspection |
| Real voice leave and rejoin | NOT TESTED | No valid Cloud participant session established |
| Real network reconnection | NOT TESTED | No valid Cloud participant session to interrupt/recover |
| Zone exit disconnects voice and stops microphone tracks | NOT TESTED | No authenticated in-zone media session |
| No duplicate tracks or listeners after real join/reconnect/leave | NOT TESTED | No actual media lifecycle to inspect; baseline simulated checks are insufficient |
| Revoked members lose active voice access and cannot rejoin | NOT TESTED | No dedicated authorized removable membership/media session was available |
| Previously issued initial-token replay after revocation | NOT TESTED | No legitimately admitted test participant or original issued token |
| Refreshed-token replay after revocation | NOT TESTED | No established participant/session refresh; invalid-proof 401 is not a substitute |
| Revocation completes within 10 seconds | NOT TESTED | No removal was performed; elapsed revocation time was **not measured** |
| Cross-company voice access is rejected for an authenticated user | NOT TESTED | No authorized cross-company test identity/fixture; anonymous rejection does not prove tenant isolation |
| Unauthenticated users cannot obtain application voice admission | PASS | Running web token endpoint returned 401; running realtime token endpoint returned 403; neither returned a token |
| Missing/foreign Origin cannot obtain web voice admission | PASS | Both returned 403 from the running web service; no token returned |
| Invalid proof cannot join the actual Cloud signaling endpoint | PASS | HTTP 401; fresh deliberately invalid proof only |

All four direct running-service token-denial responses also had `Cache-Control:
no-store`. Requests contained no valid user credentials and created no session.

### Existing test infrastructure rerun

| Executed command | Result / precise scope |
| --- | --- |
| `node scripts/check-realtime-environment.mjs` | PASS: matching development configuration; dedicated test login/trio unavailable; values suppressed |
| `node --test tests/voice-routes.test.mjs` from `apps/web` | PASS: 3 production-build route/bundle checks; unsigned session 401, missing/foreign Origin 403, forged zone/input rejection, no server credential/admin SDK in browser bundles |
| `node --experimental-strip-types --test scripts/test-realtime-live.mjs` | PASS: 1 built-server negative admission test against configured Supabase; anonymous/invalid proof/foreign Origin denied |

The negative realtime child explicitly sets its LiveKit configuration empty and
therefore cannot orphan-sweep or remove participants belonging to the running
development authority. Its result is an office/Auth denial result, not an actual
Cloud voice-session test. No simulated audio suites were rerun to fill the live
testing gaps. Lint/typecheck/build and the broader baseline suites above remain
their previously executed results; application code was unchanged in this pass.

**FAIL:** no failures in checks actually executed during this continuation.
Blocked or unexecuted scenarios are **NOT TESTED**, not successful assertions.

### Remaining blockers and merge decision

**Phase 4 Step 2 is NOT MERGE-READY.** Cloud credentials and connectivity are
available; the blockers are authorized user/browser sessions and real audio
endpoints, not a demonstrated Cloud configuration error.

To finish the gate, make two existing, normally verified, authorized test accounts
accessible in separate connected browser profiles, with real audio input/output
and a listening participant at each end. Tenant/removal checks also need a
dedicated non-production workspace/membership and another-company test context
whose records are explicitly safe to exercise. Continue using normal Auth and
application admission; do not paste passwords/tokens, select unrelated real users,
weaken RLS or use admin-minted participant tokens as an authorization shortcut.
Run the manual sequence below, retaining original/refreshed replay proof only in
the authorized private test context and recording actual removal timestamps.
Until that evidence exists, no 10-second revocation or real audio claim is made.

This validation continuation stops after updating this report. Phase 4 Step 3,
deployment and new feature development were not started.

## Manual verification before merge

1. Start the web and the single configured realtime authority with `pnpm dev:all`.
   Use the existing development Supabase project and LiveKit Cloud configuration.
   Do not start a second configured voice authority; its orphan sweep is designed
   for one process. Use two approved invitation-test members in separate browser
   profiles, signing in normally with verified accounts. Do not bypass email
   confirmation or share passwords, invitation links, access or media tokens.
2. Save a name and each preset. Reload and re-enter the office. Confirm persistence,
   matching names/appearance on the second browser and no extra canvas/socket.
   Rejoin an existing voice call after a name edit to refresh its admission name.
3. Open/close chat, type a draft, read older messages while the other member sends,
   briefly interrupt/recover the network, then use Show latest. Confirm scroll,
   focus, draft/idempotent retry and actual persisted history after reload.
4. Join voice explicitly in the server-authorized meeting zone. Check real browser
   permission allow/deny, two-way audio, mute/unmute, devices, playback restrictions,
   reconnection notices and leave/zone-exit/sign-out/route cleanup. Check the browser
   microphone indicator clears and audio stops.
5. With a dedicated authorized member, test another tenant and forged office/zone
   admission. Remove the member through normal team management, record actual
   wall-clock media removal time and test that active audio ends within 10 seconds.
   Test original and refreshed Cloud-token rejoin rejection through the approved
   private security harness; never print or paste the tokens. Rejoin after removal
   must remain denied. Repeat session expiration and revoked membership scenarios.
6. Check desktop/tablet/mobile with actual browser zoom, a real mobile keyboard and
   assistive technology. Verify controls remain reachable at 200% zoom, the panel
   does not trap focus, status/errors are announced and typing never moves avatars.

## Files changed

- New: `apps/web/src/components/office-disclosure.tsx`,
  `scripts/test-communication-browser.mjs`, this report.
- Office composition: protected office `page.tsx`, `office-experience.tsx`,
  `office-canvas.tsx`, `engine/player-avatar.ts`, `app/globals.css`.
- Profile/name path: shared `avatars.ts`/`chat.ts`, avatar settings/action/service
  and tests, realtime `auth/authorize.ts` and its security tests.
- Communication: `chat-panel.tsx`, `participants.tsx`, `voice-session.tsx`, shared
  `protocol.ts`, office `network/connection.ts` and its tests.
- Regressions/documentation: chat/voice/office browser scripts,
  `supabase/tests/avatar_profiles.sql` (rollback-only test, not a migration),
  root `package.json` and README.

Implementation stops at Phase 4 Step 2. No later feature phase was started.
