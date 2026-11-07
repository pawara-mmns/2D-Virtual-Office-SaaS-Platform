# Client movement prediction and separate Supabase investigation

Implemented locally on 7 November 2026. No Git operations, deployment, infrastructure changes, SQL migrations, production writes, credential changes, or authorization caching were performed for this phase.

## Finding and movement pipeline

The local sprite previously read its position only from the decoded Colyseus player state. Keyboard input went through a 50 ms send gate (100 ms while an intent stayed unchanged), a 20 Hz authoritative simulation, a 20 Hz state patch, and an additional 32 ms exponential Phaser smoothing stage. Network transit therefore delayed the first visible movement. Movement and proximity geometry do not make per-frame Supabase requests. High database CPU remains a separate, unproven contributor to other operations.

The implementation uses the **installed** `@colyseus/sdk 0.18.5`, `@colyseus/core 0.18.21`, and schema `5.0.42`; no dependencies were upgraded. It follows the native [client prediction/reconciliation](https://docs.colyseus.io/netcode/client-prediction) and [fixed-timestep input](https://docs.colyseus.io/netcode/server-input) contracts, verified against the installed source and declarations.

1. Focus-scoped WASD/arrows and touch input stage signed axis intents and Shift/run state.
2. `OfficePrediction` uses `room.input({mode:'reliable'})`, `Predict.get`, and `predict.reconciler`. `predict.tick` supplies the fixed input budget. Sending an input immediately advances a separate presentation state through the same `advanceMovement` solver the server uses.
3. Commands carry only axes, run state, pose epoch and environment revision. The SDK owns reliable sequence numbers, consumed-input acknowledgements and replay history. Client positions, speed, elapsed time and client acknowledgements are never accepted as movement authority.
4. The server advertises and runs a 60 Hz fixed simulation. One client can consume **at most one movement step per server tick**, independent of a submitted burst. The input queue is bounded to eight frames; when more than three are queued, older frames are consumed/discarded before the newest one is simulated. Skipped frames are acknowledged as consumed, so the client corrects rather than replaying them forever.
5. State patches and proximity grouping remain at 20 Hz. Walk speed is 120 px/s and run multiplier is 1.6. Shared diagonal normalization and one-pixel collision substeps preserve walls, doors and live furniture geometry.
6. The local reconciler restores authoritative fields and replays only pending inputs. Ordinary corrections ease over 40 ms; large corrections (48 px), pose changes and invalid geometry restore safe authority. The Phaser avatar adds no second interpolation layer to SDK-presented positions.
7. Remote avatars use the SDK's passive interpolation with one 50 ms buffer, zero additional correction smoothing, and a 64 px teleport threshold. They are never locally predicted. Seat positions use raw authored server poses.

The old message handler remains for older clients, with its original validation and 35-message/s cap. Updated rooms advertise `movementProtocol:1`; updated clients use the native protocol exclusively. Mixing legacy and native input on the same connection is rejected. The overall room message budget is 100/s to accommodate native 60 Hz commands and control traffic. This increases input traffic compared with the former 10–20 Hz sender, including while idle; broader production-scale bandwidth/load validation remains necessary.

## Authority, seating, editing and recovery

- Decoded Schema objects are never modified by prediction. Interactions, seat occupancy, editor validation, proximity groups, meeting zones and voice eligibility continue using authoritative state.
- Successful sit/stand, live-map changes and reconnection increment a server-owned movement epoch and drain queued inputs. Commands with an old pose epoch or wrong environment revision do not move a player.
- A client reset drops its old replay lifetime without resetting the SDK's reliable input counters. Resetting those counters during an ordinary furniture edit would break consumed acknowledgements. The SDK handles transport reconnection epochs itself.
- The client clears held keys when its session/pose/environment lifetime changes. Reconnection performs fresh server authorization and restores the server pose; old held input does not resume automatically.
- While seated, standing, awaiting an interaction, disconnected, or following a frame gap over 250 ms, prediction pauses safely. If processed acknowledgements stop advancing for 750 ms, prediction resets to authority and sends neutral intent. Pending history is capped at 90 inputs; frame catch-up is capped at four sends.
- Prediction is gated on matching the state/environment epoch and revision. Corrected poses that intersect newly moved furniture cannot ease through that solid object.
- Existing authorization leases, membership revocation, normal Supabase Auth, chat validation, MFA/admin security, RLS and voice admission are unchanged.

## Reproducible measurements

`pnpm test:movement:latency` runs an actual local Colyseus server, two Chromium/Phaser clients and an ordered WebSocket delay proxy, with synthetic identities and no Supabase or LiveKit service. Set `OFFICE_TEST_BROWSER` to a Chromium executable when needed. It is an isolated test fixture, not an application authentication bypass.

The recorded `before` file was captured **before implementation**. Re-running with `MOVEMENT_MEASURE_PHASE=before` now would only label the current code and must not be presented as a new baseline. The normal command records `after`. The historical proxy scheduled individual packets at ordered target deadlines; the final harness uses a FIFO pump to guarantee ordering when a long acknowledgement gap releases many packets together. Treat the baseline as a historical reference, not a perfectly matched replay with the final recovery harness.

See [before raw results](assets/movement-prediction/before.json), [after raw results](assets/movement-prediction/after.json), [before screenshot](assets/movement-prediction/before.png) and [after screenshot](assets/movement-prediction/after.png). Screenshots were captured from actual Phaser and inspected. These are local simulated RTT/jitter measurements, **not deployed Railway or Vercel measurements**. Four key presses per profile are a small comparative sample, not a production latency distribution. Jitter is seeded variation of ±half the listed value on each direction; the proxy preserves WebSocket ordering.

| Simulated RTT / jitter | Before local response | After local response | After authoritative state response |
| --- | --- | --- | --- |
| 0 ? 0 ms | 132.2 ms | 27.0 ms | 60.1 ms |
| 80 ? 10 ms | 204.1 ms | 24.2 ms | 161.9 ms |
| 180 ? 35 ms | 291.1 ms | 25.0 ms | 250.0 ms |
| 300 ? 60 ms | 373.6 ms | 27.1 ms | 364.6 ms |

Final probe: 16.7 ms median frame time, 16.8 ms p95 over 120 frames; approximately 60.0 FPS. Mean server tick work 0.086 ms (before 0.201 ms, different run lengths and 20 versus 60 Hz, so this is not a controlled server-CPU improvement claim). Latest development RTT 89.3 ms, ACK-clock jitter 3.1 ms, 10 pending inputs and 0.00 px latest correction.

The controlled remote-pose probe collected 57 rendered samples, with 5.43 px maximum frame movement and 0.00 px final authority error at the 50 ms buffer. A 1400 ms downstream gap stopped speculation, kept pending history bounded, and recovered with 0.00 px final error. Forced transport interruption advanced the epoch, cleared held input and accepted fresh input after reconnection. Runtime exceptions: 0.

The key-to-first-sprite-change probe uses the keyboard event timestamp and an actual rendered sprite, independently of the diagnostics getter. The separate authoritative response measurement still includes network and patch timing. Local prediction removes the dependency on that response; it does not reduce geographical RTT.

The ten-client real-transport regression measured 72 ticks in 1.203 seconds (59.8 Hz), 0.329 ms mean tick work, and 4,305 payload bytes/s at one observer during its scenario. Those clients exercise authoritative legacy input and transport/security regressions; the dedicated prediction fixture exercises native input and two browser clients. These numbers are not Railway resource measurements or a maximum-capacity claim.

The prior read-only Railway hour showed approximately 0.0145 vCPU average, 0.0537 vCPU maximum, and 128.4 MB maximum memory. Configured limits were 2 vCPU/1 GB. This phase did not remeasure deployed usage or change those limits.

## Development diagnostics

The returned engine exposes `engine.movementDiagnostics?.()` in development. The network object also exposes `network.movementDiagnostics?.()`. There is no new React polling loop or user-facing diagnostics panel.

| Field | Meaning |
| --- | --- |
| `rttMs` | Application WebSocket ping/pong round trip, once per second in development; SDK ACK clock fallback before the first pong |
| `jitterMs` | Installed SDK's smoothed acknowledgement clock jitter estimate, not an independently measured one-way delay |
| `inputVisibleMs` | Most recent keyboard/touch intent event to first changed local sprite position; frame-intent fallback for programmatically supplied inputs |
| `serverMovementMs` | Mean measured server simulation-tick work, including bounded proximity updates; excludes network transit and asynchronous authorization |
| `fps` | Exponential moving average of Phaser frame deltas |
| `correctionPx` | Magnitude of the SDK's latest reconciliation correction |
| `pendingInputs` | Native SDK sent-but-unacknowledged count |

Production omits the getters, ping sending and detailed client bookkeeping. The server registers the diagnostic handler but immediately returns in production. Development pings are rate-limited and expose only a nonce and aggregate elapsed work. No identity, password, token, cookie, MFA seed, connection string or key is logged by these metrics.

## Validation

- **173 web tests passed**, including real installed-SDK rollback/replay, smoothing convergence, decoded-state immutability, lifetime reset, normalized speed and collision tests.
- **69 realtime tests passed**, including real binary native input reflection, processed acknowledgements, 1.6× run speed, invalid/stale input fencing, bounded burst processing, no retained native intent, live geometry, seating, tenant isolation, revocation, chat, proximity and voice authority.
- Six browser suites passed: movement/seating/touch, four-direction seating, direct editor with isolated PostgreSQL, Phaser engine/collision/lifecycle, proximity UI, and voice UI. Editor tests verify actual two-peer hot updates and save/reload without scene reload. Voice/media fixtures use synthetic authorization and simulated/silent media; they do not prove real deployed audio.
- The latency harness separately asserts immediate response across four latency profiles, remote presentation convergence, bounded acknowledgement-gap recovery and forced-drop reconnection with stale held-key rejection.
- Lint, TypeScript, web production build and realtime build passed.
- An initial test-runner import failure was fixed by replacing a TypeScript parameter property with an explicit field (the web test runner uses Node strip-only mode). A strict optional correction-field type error was fixed. One editor run timed out while running alongside the build; an isolated rerun passed the complete scenario. Its exact transient cause was not established.
- The new acknowledgement-gap probe initially failed intermittently. The delay proxy used independent timers for packets sharing the same release deadline, which did not guarantee FIFO order. It now uses a single queued pump per direction. The harness explicitly sets a failing exit code on assertions rather than relying on Colyseus's process-level exception logger.

Local logs are under `.cache/prediction-*`; the [validation manifest](assets/movement-prediction/validation.json) lists the final evidence. Production acceptance remains pending a user-controlled deployment and two users on actual networks. No deployed login, real audio, production CPU reduction or production movement percentile is claimed.

## Separate Supabase CPU investigation

The following repeated calls are confirmed from source; their database execution times and CPU shares remain **unmeasured**:

| Caller | Call path and cadence | Potential cost, not measured CPU attribution |
| --- | --- | --- |
| Active voice admission | `apps/realtime/src/voice/service.ts` `authTimer` → `refresh` → `authorize`, every 2 s per active admission; skips a refresh already in flight | Up to 30 complete authorizations/minute/admission |
| Environment guard | `rooms/office-room.ts` `checkEnvironment`, every 5 s per occupied room → `authorize` → `loadMap` | Up to 12 authorizations plus 24 environment row requests/minute/room |
| Connected-player lease | Room tick → `revalidate`, due every 10 s/player | Up to 6 authorizations/minute/player |
| Client credential refresh | `network/connection.ts` 10 s timer → `credential` message → server `revalidate` | Can add or overlap lease refresh work; in-flight checks coalesce, but this is not a shared authorization cache |
| Voice service observation | `voice/service.ts` `pollTimer`, every 2 s → LiveKit room/participant provider | LiveKit API work, distinct from Supabase authorization |

`auth/authorize.ts` → `supabaseAuthorizer` calls Supabase Auth `getUser`, then reads `offices`, `organizations`, `organization_members`, `profiles`, and calls `platform_office_access`. A successful modern-schema authorization therefore has **one Auth request plus five database HTTP requests**. RLS and RPCs can execute additional internal work. At ten active voice admissions, that path alone can issue about 300 Auth plus 1,500 database requests/minute (25 database requests/s), before other paths. This request-count estimate is not a SQL plan or a measurement of production query frequency.

`environment/maps.ts` reads `office_environment_settings` and `office_decoration_settings` on cache misses. Its existing per-office cache is only one second, so a solitary five-second guard normally misses it. Joins, credential changes, revocation checks, edit operations and other callers add work. No cache lifetime, lease, RLS, schema or index was changed in this phase.

### Next read-only evidence to collect

1. In the correct Supabase project, select the same 30–60 minute period in CPU/IO charts and Query Performance. Record query identifiers, calls, total/mean execution time, rows and block reads. Compare quiet and active-office windows with the number of connected and voice-active people. Keep query parameters, identities and credentials private.
2. If using an authorized SQL session, inspect the existing `pg_stat_statements` view (schema can be `extensions`) twice, five minutes apart. Do not reset statistics. A bounded example, after resolving its schema, is:

   ```sql
   select queryid, calls, total_exec_time, mean_exec_time, rows,
          shared_blks_hit, shared_blks_read
   from extensions.pg_stat_statements
   order by total_exec_time desc
   limit 20;
   ```

   Use counter deltas to calculate interval frequency/time; cumulative totals alone cannot establish current load. Restrict session statement timeout to a few seconds. If the view is unavailable, use the dashboard; do not enable extensions or modify infrastructure as part of this local task.
3. Inspect `pg_stat_activity` grouped by state/wait event without selecting query text, and retrieve existing index definitions for the specific office/member/environment paths. Inspect a proven costly query with plain `EXPLAIN` and representative safe parameters. Avoid production `EXPLAIN ANALYZE`, table scans or full-table analysis on Nano.
4. Only after identifying a costly statement, evaluate its RLS plan and existing primary/unique/composite indexes. No additional index is justified yet. Any authorization reuse must maintain token expiry, membership/organization/platform revocation, tenant binding and the existing fail-closed lease behavior; a longer generic cache is not a safe substitute.

These steps follow Supabase's [query statistics guidance](https://supabase.com/docs/guides/database/extensions/pg_stat_statements) and [performance investigation guidance](https://supabase.com/docs/guides/platform/performance). Sustained 90% CPU deserves investigation, but current evidence does **not establish that a compute upgrade is necessary**, nor that prediction will lower database CPU. No compute change is recommended as the movement fix. Upgrade decisions need query/IO measurements and the required workload headroom.

## Modified files

- `packages/shared/src/protocol.ts`: capability flag, fixed movement rate, optional presentation/diagnostics API.
- `apps/realtime/src/state/office-state.ts`: reflected native command and movement lifetime fields.
- `apps/realtime/src/rooms/office-room.ts`: bounded fixed-step native input, lifetime fencing, independent proximity cadence and development timing.
- `apps/realtime/src/tests/realtime.test.ts`: transport, acknowledgement, speed and generation regressions.
- `apps/web/src/features/office/network/prediction.ts`: SDK prediction, reconciliation, remote interpolation and recovery.
- `apps/web/src/features/office/network/connection.ts`: native input integration, legacy negotiation and safe diagnostics.
- `apps/web/src/features/office/network/prediction.test.ts`: installed-SDK deterministic reconciliation tests.
- `apps/web/src/features/office/scenes/office-scene.ts`: presentation integration, key reset and Phaser diagnostics.
- `apps/web/src/features/office/engine/player-avatar.ts`: avoid duplicate smoothing.
- `apps/web/src/features/office/engine/create-game.ts` and `input/movement.ts`: event timing and reset integration.
- `scripts/measure-movement-latency.mjs`: repeatable real-browser delay/recovery harness.
- `scripts/test-office-browser.mjs`: environment constant for the isolated unbundled browser fixture.
- `package.json`, `README.md`, this report and its evidence artifacts.
