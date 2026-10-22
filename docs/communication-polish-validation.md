# Communication, stabilization and private-beta validation

## Phase 5 Step 2 — Private beta readiness and operational reliability

Date: 2026-10-22. Current branch confirmed by reading `.git/HEAD`:
`feature/p5-s02-private-beta-readiness`. No Git commands, migration, deployment,
new dependency, account creation, email send or tenant-data mutation was performed.
This section is the current result; Step 1 and Phase 4 below are historical.

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
