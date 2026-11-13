# Phase 05 — Multiplayer mini-games and Chess

Implemented locally. No Git operations, deployment, database migration, or production database changes were performed.

## Framework architecture

Each existing Colyseus `OfficeRoom` owns one `GameSessions` manager. Games do not create additional rooms or media connections. The manager owns session IDs, organization/office boundaries, stable table associations, two player slots, spectator subscriptions, readiness, revisions, request deduplication, recovery, and cleanup.

Lifecycle: `WAITING → READY → PLAYING → FINISHED → CLOSED`. A rematch preserves the session ID, increments the round and revision, swaps colors, and requires both players to ready again.

Key files:

- `packages/shared/src/games/protocol.ts`: bounded, strictly parsed commands and validated snapshots.
- `packages/shared/src/games/tables.ts`: registered table assets, stable placement IDs, collision-aware approach validation.
- `apps/realtime/src/games/sessions.ts`: common lifecycle and access controls.
- `apps/realtime/src/games/registry.ts`: game adapter interface and real Chess registration.
- `apps/realtime/src/rooms/office-room.ts`: existing authenticated room integration.
- `apps/web/src/features/games/channel.ts`: request correlation, bounded retries, stale snapshot filtering, and recovery.

Future games implement a rules adapter and register their asset and UI renderer. Additional move schemas and side/seat models can extend the common protocol when required. There are no pretend implementations of Tic-Tac-Toe, Connect Four, or Checkers.

## Chess implementation

The server uses pinned `chess.js` 1.4.0 ([official documentation](https://jhlywa.github.io/chess.js/)). The server retains the engine's complete move history for repetition detection. It validates turn ownership and every move, including castling, en passant, and all four promotions. Outcomes cover checkmate, stalemate, insufficient material, repetition, the fifty-move rule, agreed draw, resignation, disconnect forfeit, and abandonment. A 1,000-ply resource limit also ends the game as a draw.

Clients submit squares and an optional promotion choice. They cannot supply a board, FEN, player identity, organization, or office in a command. Client FEN decoding only renders server snapshots. Original pixel silhouettes for all six piece types are defined in `chess-piece.tsx`; ivory and slate palettes distinguish sides without relying on platform chess fonts.

The overlay supports click/tap and keyboard selection, legal destination indicators, selected/previous/check highlights, captured pieces, player names, board flipping, move history, promotion selection, readiness, draw offers, resignation confirmation, and rematches. It uses the existing glass surfaces and controls, a compact desktop panel, and a scrollable mobile layout with visible actions.

## Synchronization and authorization

`game.request`, `game.reply`, and `game.state` run over the existing office connection. Schema capability `gameProtocol: 1` gates client recovery. No sprite images are transmitted and no Supabase write happens per move.

Game actions pass the existing freshly verified office membership/tenant authorization. Identity and position come from the authenticated connection and authoritative player state. Initial opening, creation, joining, and spectating require a valid nearby approach. Once admitted, players can close and resume a match without being tethered to the table. Spectators cannot change the match. Updates go only to table subscribers with a valid authorization lease; unauthorized errors and duplicate replies do not expose an unjoined board.

Bound requests include a session ID and revision. UUID request fingerprints reject changed-payload replays and deduplicate retries; caches are bounded to 128 requests per user. Revisions remain monotonic across rematches. Client requests have bounded concurrency, retry, and timeout behavior. One user can participate in one active game per office.

Temporary disconnects pause moves for up to 45 seconds. Authorized reconnection, including a replacement connection ID, restores the same engine state. Old socket cleanup cannot disconnect its replacement. Grace expiry produces a forfeit when an opponent remains connected, otherwise abandonment. Revoked sessions are closed and cannot be restored. Non-playing sessions expire after five idle minutes; closed sessions are retained for 60 seconds. Each room retains at most 32 sessions, and disposal clears manager state.

## Phaser and office integration

The existing chess discussion table is now enabled in the premium catalog. Generated and owner-placed tables share the existing placement registry; custom IDs survive reloads. Approaching shows **E — Play Chess** without creating a game. Existing seating retains priority where approaches overlap, with a separate Play Chess control available nearby.

The game overlay is mounted through the current office panel host. Phaser, the Colyseus connection, and media owners remain mounted. Office input stops while focus is on overlay controls. Closing the overlay preserves an active player's match; the HUD offers Resume. Existing seats, positions, movement epochs, proximity voice, and microphone consent remain independent. Moving, rotating, or removing a table closes its associated session safely.

## Screenshots

These show the actual React/Phaser application under an isolated local authorization fixture, not mockups or hosted accounts.

| View | Screenshot |
| --- | --- |
| Nearby table prompt | [01-table-interaction.png](assets/chess/01-table-interaction.png) |
| Table lobby | [02-table-lobby.png](assets/chess/02-table-lobby.png) |
| Read-only spectator | [03-spectator.png](assets/chess/03-spectator.png) |
| Desktop match | [04-playing-desktop.png](assets/chess/04-playing-desktop.png) |
| Legal destinations | [05-legal-move-indicators.png](assets/chess/05-legal-move-indicators.png) |
| Reconnected board | [06-reconnected-board.png](assets/chess/06-reconnected-board.png) |
| Checkmate | [07-checkmate.png](assets/chess/07-checkmate.png) |
| Captured piece | [08-captured-piece.png](assets/chess/08-captured-piece.png) |
| Mobile, 390 × 844 | [09-chess-mobile.png](assets/chess/09-chess-mobile.png) |
| Promotion chooser | [10-promotion-choice.png](assets/chess/10-promotion-choice.png) |

## Validation

| Check | Result |
| --- | --- |
| Web ESLint, zero warnings | Passed |
| Realtime ESLint, zero warnings | Passed |
| Realtime TypeScript and production build | Passed |
| Next.js production build, including TypeScript | Passed |
| Complete web unit suite | 184 passed |
| Complete realtime unit/integration suite | 82 passed |
| Focused web game model/channel tests | 4 passed |
| Three-client chess browser acceptance | Passed |
| Existing directional seating browser regression | Passed |
| Existing communication/HUD/voice ownership browser regression | Passed with browser-selected Intel GPU renderer |
| Existing voice UI/SDK-denial browser regression | Passed |

Total: **266 unit/integration tests passed**, plus **four browser suites**. The four focused web game tests are included in the 184-test web total. Final local output is retained in `.cache/phase05-web-tests-final.log`, `.cache/phase05-web-build.log`, `.cache/phase05-communication-native.log`, and `.cache/phase05-voice-browser.log`.

The realtime suite covers all existing movement, seating, authorization and proximity/voice tests alongside ten new game-manager/rules tests and a real WebSocket transport integration test. Chess coverage includes illegal moves, both turns, castling, en passant, all promotions, mate, stalemate, material/repetition/fifty-move draws, readiness, spectator restrictions, request replay, stale revisions, rematches, grace expiry, replacement sockets, cross-office/tenant denial, revoked users, removal, and cleanup.

`scripts/test-chess-browser.mjs` runs actual React, Phaser, the office network client, Colyseus HTTP/WebSockets, and the authoritative chess engine in three isolated browser tabs. Two players and a spectator complete a full match, reconnect, rematch with swapped colors, capture, agree a draw, and exercise resignation confirmation. Closing/resuming the overlay and playing an entire match preserves an occupied seat, position, and movement epoch. Each client creates one Phaser instance and one office connection, with zero microphone captures or browser exceptions. Desktop cells are verified square; the 390 × 844 mobile panel and footer stay within the viewport.

Promotion browser acceptance seeds a position directly in the test-owned server engine, then uses the actual four-choice UI and network move to underpromote to a knight. No FEN-setting client message or application debug route exists. [Machine-readable acceptance](assets/chess/acceptance.json) records these checks. Run it again with `pnpm test:games:browser`.

The directional seating regression covers four cardinal seated frames, workstation anchors/depth, occupied UI, sofas, safe standing, synchronization, and Shift behavior with two real local clients. The communication regression verifies responsive panels, focus/drafts, avatar save/remount, engine ownership, camera input, one media owner, explicit voice consent, mute/reconnect/leave/denial handling, and cleanup. Its original SwiftShader run timed out on screenshot capture; the existing browser-selected renderer mode then passed all assertions with zero runtime errors. The separate voice browser suite passed no-auto-capture, cancellation, SDK microphone denial, invalid-token feedback, Strict Mode, one connection, mute/unmute, device observers, mobile layout, and subscription cleanup. This is not a physical-device or hosted audio certification.

Reproduction commands (from the repository root):

```powershell
pnpm --filter @virtual-office/web lint
pnpm --filter @virtual-office/realtime lint
pnpm --filter @virtual-office/realtime typecheck
pnpm --filter @virtual-office/realtime build
pnpm --filter @virtual-office/web build
pnpm --filter @virtual-office/web test
pnpm --filter @virtual-office/realtime test
pnpm test:games:browser
pnpm test:seating:browser
$env:OFFICE_TEST_RENDERER = 'native'
pnpm test:communication:browser
pnpm test:voice:browser
```

Validation used the installed Node entrypoints where the restricted environment's pnpm launcher was unsuitable. Browser tests ran outside the restricted renderer sandbox with isolated, test-owned profiles and local services.

## Remaining limitations

- Active games and results are in memory. A room/process restart loses them. Optional completed-result persistence was deliberately omitted; no migration is needed.
- Participation uniqueness is enforced inside an office room, not by a distributed lock across different offices.
- There are no chess clocks, AI opponents, matchmaking, or drag gestures; click/tap and keyboard moves are supported.
- The 45-second game grace is separate from the existing shorter SDK room-resume window. A fresh authorized office connection can restore a retained game after the SDK window expires.
- Browser acceptance uses real local HTTP/WebSocket clients with synthetic authorization. No supplied authenticated local Supabase sessions were available, so hosted-account gameplay was not performed.
- Mobile validation uses Chromium viewport emulation; physical iOS/Android hardware and Safari were not tested. Voice regression fixtures do not capture a live microphone or connect to a hosted LiveKit service.
