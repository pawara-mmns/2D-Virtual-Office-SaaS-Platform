# Phase 3 Step 1 — realtime multiplayer foundation

Verification date: 2026-10-22. Branch was confirmed by reading `.git/HEAD` as
`feature/p3-s01-colyseus-multiplayer` before editing. No Git commands, migrations,
remote schema changes, real-account creation, email sends or existing-data writes
were performed. This document distinguishes isolated verification from live
authenticated account testing.

## Implementation and runtime

- `apps/realtime` is one persistent Node process. Colyseus **0.18.9**,
  `@colyseus/sdk` **0.18.5**, `@colyseus/schema` **5.0.42** and
  `@colyseus/ws-transport` **0.18.4** are pinned. The locked compatible core is
  **0.18.21**. Version metadata and current official documentation were checked.
- State uses the current `schema()` / `t.*` builders, `patchRate`,
  `seatReservationTimeout`, `setFixedTimestep`, `onDrop`, `allowReconnection` and
  `onReconnect`. No deprecated `defineTypes` or seat timeout setters remain.
- No Redis service, database, Docker, task-runner service or infrastructure was
  added. The official `colyseus` bundle transitively contains optional Redis and
  tooling modules; this application does not initialize or use them.
- `packages/shared/src` owns the existing map validator, six original avatar
  definitions, protocol constants/types and the small reconnection adapter.
  Web compatibility re-exports preserve earlier imports and tests.
- The existing `public/office/studio.json`, office atlas and six-preset sheet are
  unchanged. The server reads that JSON directly; Phaser loads the same asset.
  A deterministic fingerprint of map geometry/layers/markers must match before
  admission and on initial synchronized state. No duplicated wall coordinates.
- The existing `/workspace/[organizationId]/office` page passes its authorized
  real office ID into the existing lazily loaded canvas. No second office route.

## Commands and configuration

From the repository root, using Node 24 LTS and pnpm 10.34.7:

```sh
pnpm install
pnpm check:realtime:env
pnpm dev:all
```

Alternatively run `pnpm dev` and `pnpm dev:realtime` in separate terminals.
Web: `http://localhost:3000`; realtime: `http://localhost:2567`.
Use the same hostname consistently; `127.0.0.1` is a different browser origin
and must be explicitly allowed if needed. `GET /health` on realtime reports only
process availability. `GET /api/health` on web is unchanged.

Web env (`apps/web/.env` is the user's existing ignored file):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<existing project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<existing publishable key>
NEXT_PUBLIC_REALTIME_URL=http://localhost:2567
```

Realtime env (`apps/realtime/.env`, ignored):

```dotenv
SUPABASE_URL=<same existing project URL>
SUPABASE_PUBLISHABLE_KEY=<same publishable key>
PORT=2567
REALTIME_ALLOWED_ORIGINS=http://localhost:3000
```

The diagnostic uses Next's actual development env loader, including process-env
and `.env.development.local` / `.env.local` / `.env.development` precedence over
`.env`. It prints only file names, presence flags and project-match booleans.
Actual result: web loaded `.env`; URL/key present; expected project
`rofutnholbtdmxccrkbs` matched. Local realtime configuration was created from the
existing public project settings and its URL was added to web `.env`. No existing
provider configuration was replaced. Restart both processes after env changes;
rebuild for changed `NEXT_PUBLIC_*` values.

For a future production environment, `NEXT_PUBLIC_REALTIME_URL` must be an exact
HTTPS origin, resulting in WSS sockets. Set exact HTTPS frontend origin(s), comma
separated, in `REALTIME_ALLOWED_ORIGINS`; no wildcard. Use TLS at a trusted proxy
which forwards WebSocket upgrades, Origin and Sec-WebSocket-Protocol. Configure
`OFFICE_MAP_PATH` as the absolute path to the matching canonical map if not
starting in `apps/realtime`. `pnpm build` compiles both apps;
`pnpm start:realtime` starts compiled Node code and defaults to production, which
rejects local HTTP origins. Production hosting/TLS deployment is outside scope.

## Admission, identity and tenant boundaries

1. The protected Next route retains its existing verified-user and RLS guards.
2. Browser `getSession()` obtains a bearer for transport only. It does not grant
   access. `POST /office/join` sends it in the Authorization header, together with
   only office ID and map version in the JSON body.
3. The independent server calls Supabase `auth.getUser(token)`, rejects anonymous
   or unconfirmed users, then enforces token expiry. Reading `exp` is performed
   only after independent Auth validation; unverified decoded claims never grant
   access.
4. Using the publishable key and that user's bearer, RLS-scoped reads check the
   office's real organization, ACTIVE organization, ACTIVE membership and valid
   role. The profile read is self-scoped. No service-role key is accepted.
5. A queue serializes canonical room creation and seat reservation per office.
   Unauthenticated requests cannot create rooms or reserve seats. A full room
   produces an error instead of creating a parallel room. Reservations expire
   after ten seconds. Both joined players and pending claims prevent duplicate
   sessions for the same user. The policy is **first tab wins**.
6. Default HTTP matchmaking methods, including create/join/joinById/reconnect, are
   disabled. The room's static `onAuth` explicitly denies default admission; it
   never inherits the bundle's permissive missing-token behavior. Trusted server
   seat reservation supplies auth data, followed by another fresh check in
   `onJoin`. The implementation does not depend on instance `onAuth` running.
7. Ten distinct members maximum. Authorized joins use the canonical map spawn,
   with collision-checked nearby offsets for readable initial placement. Other
   tenants have separate room state. No emails, tokens, roles or private profile
   fields are synchronized.

HTTP admission accepts at most 1 KiB and 30 requests/IP/minute with bounded
counter storage. Forwarded IP headers are not trusted. Socket payloads are capped
at 12 KiB; room-wide message limits and a separate 35 movement messages/second
limit apply. Invalid/extra movement fields cause disconnection.

## State and authoritative movement

Schema players contain session ID, verified user UUID, sanitized display name,
allowlisted saved avatar key, x/y, facing direction, walking and connection flags.
Auth data remains server memory only. No position is written to PostgreSQL.

Clients send only `{seq,x,y}`: safe integer sequence and each axis -1/0/1.
Coordinates, arbitrary speed, direction strings, non-finite values and extra
fields are rejected. Old sequences are ignored. Held input times out after
250 ms without a heartbeat, including backgrounded/unfocused browser tabs.

The server simulates fixed 50 ms steps, 120 pixels/second with normalized
diagonals and sub-pixel axis separation. The shared 32px map's Collision layer
and the exact existing 14×10 foot body determine walls, furniture and bounds.
No input-provided timestamps/deltas can increase speed. Avatar-to-avatar blocking
is not introduced; members can pass each other.

Clients send at most 20 input updates/second, retaining a 100 ms held-input
heartbeat. Phaser interpolates authoritative positions using reused sprites and
cached animations. Local physics is disabled in multiplayer: no client position
is treated as authority. The local label is distinguished with “You” and the
existing green UI color. Camera follow, zoom and focus-scoped WASD/arrows remain.
There is deliberately no prediction/replay in this first step; movement begins
after server receipt/tick and rendering adds smoothing delay. Test on real WAN
latency before deciding whether prediction is needed.

Avatar settings still persist through the existing authenticated action/RLS path.
The server rereads the profile on credential refresh or its next authorization
check and publishes the validated appearance (normally promptly, bounded by the
periodic check during overlapping requests). Browser-supplied appearance never
updates another participant's authoritative profile.

## Presence, expiry, reconnection and cleanup

- Online counts include only `connected` players from actual room state.
  Join/leave notices and connecting/online/reconnecting/offline feedback are
  accessible live status text. There are no fake online participants.
- On abnormal drop, input stops and the player is marked disconnected. Current
  `allowReconnection(client,10)` holds its existing seat/state for ten seconds.
  SDK automatic retry uses current onDrop/onReconnect hooks, six retries, max
  2-second delay, zero buffered movement messages and zero minimum uptime.
- Native SDK reconnection ordinarily puts its proof in the URL. A narrow adapter
  over its public `Connection.transport` moves that proof to the WebSocket
  Sec-WebSocket-Protocol header. An exported server transport subclass handles
  that header using `WebSocketClient` and `connectClientToRoom`. There is no fork
  or private Room API access. Both bearer and reconnection proof are absent from
  request URLs; the required protocol session ID is still present.
- No SDK auth token is assigned (the SDK otherwise appends `_authToken`). The
  server rejects either token query parameter. Keep Authorization,
  Sec-WebSocket-Protocol, cookies and socket message bodies out of access/error
  logs. Application diagnostics never print raw library errors or credentials.
- Reconnection independently revalidates Auth, expiry, office and membership
  before the server sends room state. A revoked member cannot resume a held seat.
  Reconnection proof remains in memory and is never placed in browser storage.
- Auth/membership/profile checks repeat every ten seconds. Requests have per-fetch
  deadlines and a 4.5-second total authorization deadline. A **15-second hard
  lease**, checked each simulation step, disconnects even if a refresh stalls.
  Expiry also disconnects. This adds an explicit bounded realtime revocation
  target where earlier docs described only immediate denial of subsequent data
  requests. Failures/outages close access rather than retaining an unbounded
  cached membership. Timing assumes the Node event loop is running normally.
- Browser Auth token refresh sends a newly obtained bearer in a socket message;
  it must independently validate and match the same user/organization. Local
  sign-out, pagehide and route teardown close the connection. Global logout's
  already-issued JWT lifetime follows Supabase semantics; it is not claimed as
  instant global JWT revocation.
- Refresh starts a fresh authorized admission, not a persisted resume credential.
  If the old tab vanished without consent, wait up to ten seconds for its held
  seat to expire, then use Retry connection. Explicit exit normally releases it
  immediately. No second avatar for the same account is created.
- Offline state hides stale avatars. Leave destroys sprite/label objects.
  Renderer destruction also closes networking; Strict Mode lifecycle cleanup
  remains serialized. Disposed transports block delayed reconnect attempts.

## Actual validation results

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Expected branch and configured project match | PASSED | Local read-only diagnostics; no Git command |
| `pnpm lint` | PASSED | Web and realtime, zero warnings |
| `pnpm typecheck` | PASSED | Both apps and referenced shared sources |
| `pnpm build` | PASSED | Next production build and compiled realtime Node output |
| `pnpm test` | PASSED | 70 web unit/service tests; 7 realtime unit/transport tests |
| `pnpm test:team:database` | PASSED | Disposable PostgreSQL: 54 team + 26 foundation assertions and avatar RLS guards; rollback |
| `pnpm test:organization-setup` | PASSED | 4 runner/configuration safety tests |
| `pnpm test:smoke` | PASSED | 9 production HTTP checks; Auth/team routes and deferred Phaser preserved |
| `pnpm test:live` | PASSED | 8 live Auth health/settings/invalid-proof checks; email confirmation remains required |
| `pnpm test:organizations:anonymous` | PASSED | 5 configured-project permission denials |
| `pnpm test:team:anonymous` | PASSED | 11 configured-project permission/invalid-invitation checks |
| Configured compiled realtime server negative paths | PASSED | 1 built-server test: health, anonymous/invalid-token/foreign-origin rejection; no authenticated join |
| Real Chromium engine/multiplayer render fixture | PASSED | Six presets, four directions, focus, walls/furniture, camera, resize, stable remote sprites, interpolation/idle, ten avatars, leave/disconnect/remount/teardown |
| Native browser reconnect header / disposed retries | PASSED | Actual native Chromium WebSocket handshake fixture; no live Supabase user |
| Two actual authenticated browsers in one organization | NOT TESTED | No dedicated authorized test logins configured |
| Actual-account cross-tenant join and removal | NOT TESTED | Requires dedicated accounts and authorized test memberships |
| Authenticated avatar save/reload on new network path | NOT TESTED | Same account prerequisite |
| Production TLS/proxy and sustained normal-GPU 60 FPS | NOT TESTED | No production deployment; software Chromium only |

The transport test uses real HTTP, SDK sockets and binary Schema patches with a
synthetic identity provider. It verifies canonical/concurrent joining, duplicate
rejection, two-tenant state separation, ten-member capacity without parallel room
creation, validated presets, movement/stale input, malformed/teleport rejection,
message-rate rejection, reconnection/state retention, periodic removal, hard
lease expiry, revoked reconnection rejection and explicit leave. Authorization
unit tests separately cover unverified/anonymous/expired/invalid identities and
inactive memberships/organizations. These are not claims of successful live
Supabase logins or two authenticated browsers.

## Performance observations

On Windows, Intel i7-1165G7, Node 24.18.0, an isolated ten-player
transport sample measured 24 server ticks / 1.201 seconds (**20.0 Hz**), mean
simulation work **0.351 ms/tick**, **1,571 received payload bytes** across 21
packets (**1,308 bytes/s for one observer**). A later run measured 23 ticks /
1.201 seconds (**19.2 Hz**), **0.207 ms/tick**, **1,571 payload bytes** in 21
packets (**1,308 bytes/s**), first remote motion **105 ms**. These are loopback, synthetic-auth samples;
the latency includes polling/scheduling and the bandwidth excludes TCP/TLS/
WebSocket framing. They are not production load/WAN measurements or upper bounds.

Real Chrome 155.0.8059.85 at 1280×1024 used **SwiftShader software WebGL**. One
final recorded sample: single-player fixture 53 frames / 1.2017 s (**44.1 FPS**), ten
rendered avatars 55 frames / 1.201 s (**45.8 FPS**). Earlier runs ranged from
30.0–42.3 FPS for one player and 32.5 FPS for ten. These short software-rendered samples, including development
machine contention, do not establish 60 FPS on a normal GPU. The harness prints
fresh actual measurements on each run; no performance improvement is asserted.

## Manual verification and merge gate

No dedicated accounts were found in local configuration. Do not select existing
real users, create accounts without authorization, or weaken email verification.
When authorized, prepare dedicated A/B/C accounts through normal `/register`
and each account's real confirmation email. Create a dedicated test organization
with A; invite verified B using the existing development invitation link flow
and explicitly accept. Give C its own independent test organization. No test
passwords, email links, session cookies or socket proofs belong in documentation.

1. Start `pnpm dev:all`. Use the same localhost origin configured above.
2. In separate browser profiles, sign in as A and B and enter the same office.
   Confirm two correctly named/preset avatars and `2 online` in both windows.
3. Move each player in turn, including diagonal movement, walls and furniture.
   Confirm both see movement and idle; check camera, zoom, focus and Tab exit.
4. Save a different preset, verify the other browser receives the validated
   change, reload and confirm persistence.
5. Open another A tab: first-tab-wins denial; counts remain two. Close it.
6. Drop B's network briefly: check reconnecting feedback, count changes, restored
   position and no duplicate sprite. Inspect only sanitized Network metadata:
   bearer/reconnection credentials must not appear in URLs or logs.
7. Refresh B; if its old connection was abruptly lost, wait at most ten seconds
   and retry. Explicitly exit A and verify B sees presence removal.
8. Open C's office independently: only C is present. Try A/B's organization
   route as C; access must be denied with no cross-tenant player state.
9. With A authorized to manage the dedicated test membership, remove B while B
   remains connected. Verify disconnection within the 15-second lease target,
   no further state and denied reconnect. Restore test membership only through
   the normal authorized invitation flow if needed.
10. Check session expiry/sign-out and unauthorized/expired-token admission.
    Use normal session expiry or disposable test state; do not modify real Auth
    records or bypass verification. Verify manual retry after reauthentication.
11. Profile sustained ten-player operation on representative GPU hardware and
    actual network latency. A future production proxy must forward the required
    handshake headers and redact credentials; this has not been deployed here.

Merge readiness: **pending the real-account browser checklist**. Automated and
account-independent checks do not replace that gate. No database migration is
needed. Positions/rooms are in memory and reset on realtime process restart.
Exactly one realtime process is supported; do not launch multiple workers for the
same deployment. Horizontal scaling, durable position recovery, client prediction,
voice, chat and all subsequent phases remain outside this step.
No final automated check is marked FAILED. The remaining account, production and
normal-GPU checks above are NOT TESTED rather than passed.

## Changed files

- New `apps/realtime/{package.json,tsconfig.json,tsconfig.build.json,
  eslint.config.mjs,.env.example}` and `src/{dev,index,server,transport}.ts`,
  `auth/authorize.ts`, `config/environment.ts`, `movement/simulation.ts`,
  `rooms/{admission,office-room}.ts`, `state/office-state.ts`,
  `tests/{security,realtime}.test.ts`.
- New `packages/shared/package.json` and
  `src/{avatars,map,protocol,socket-transport}.ts`.
- New web `features/office/network/{connection.ts,network.test.ts}`; changed
  existing office page, canvas/experience, scene, lifecycle, game and avatar
  renderer; map/avatar definitions now re-export their shared canonical sources.
- Root/web package manifests, lockfile, web `.env.example`, README and
  `docs/architecture.md`; this validation document.
- New `scripts/{check-realtime-environment,test-realtime-live}.mjs`; expanded
  `scripts/test-office-browser.mjs`. Ignored local web/realtime env configuration.

Primary references: [Colyseus server](https://docs.colyseus.io/server),
[static authentication behavior](https://docs.colyseus.io/auth/room),
[server matchmaking](https://docs.colyseus.io/matchmaker),
[Schema builders](https://docs.colyseus.io/state/schema),
[reconnection](https://docs.colyseus.io/room/reconnection),
[SDK connection lifecycle](https://docs.colyseus.io/sdk/connection), and
[Supabase verified user lookup](https://supabase.com/docs/reference/javascript/auth-getuser).
Supabase [session](https://supabase.com/docs/guides/auth/sessions) and
[sign-out](https://supabase.com/docs/guides/auth/signout) guidance explains the
already-issued JWT lifetime noted above.
Installed TypeScript definitions/source were also checked for the exact pinned APIs.
