# Phase 2 Step 2 — avatar system

Validated 2026-10-21 (Asia/Colombo). Branch
`feature/p2-s02-avatar-system` verified by reading `.git/HEAD`; no Git commands or
mutations. Implementation and automated checks are complete. **Full merge
sign-off remains pending dedicated-account browser save/reload verification.**

## Presets and editable assets

Six original presets share the existing 32×32 proportions and 14×10 foot body
(offset 9,22). They use distinct clothing, hair silhouettes and restrained palettes:

| Key | Appearance |
| --- | --- |
| fern | Teal overshirt, short chestnut hair; default |
| harbor | Blue jacket and sandy waves |
| clay | Terracotta sweater and dark curls |
| plum | Plum cardigan and long dark hair |
| ochre | Mustard shirt and close-cropped hair |
| slate | Navy knit, silver hair and glasses |

`features/avatars/presets.ts` is the supported-key catalog. One fixed
`public/office/avatar.png` atlas, **96×768 / 3,340 bytes**, contains all six presets.
Each 128px band has rows down/left/right/up; each row has three 32×32 frames:
standing, left step, right step. Frame base is preset index × 12. No arbitrary
image URLs or user-uploaded assets are accepted.

`scripts/generate-avatar-assets.mjs` is editable pixel/palette source, reusing
`scripts/office-pixel-art.mjs` for deterministic PNG encoding. `pnpm assets:avatars`
regenerates just the sheet; `pnpm assets:office` still regenerates the complete
original asset set. Repeated generation preserved all asset bytes; the office
atlas/layout drawing instructions are unchanged. No reference/third-party artwork
was downloaded or copied; existing project-owned asset licensing status applies.

## Runtime and settings workflow

`office/engine/player-avatar.ts` owns one sprite, one persistent text object,
directional animation state and label positioning. The existing scene, Arcade
Physics, collision grid, movement speed, camera and lazy-loading boundary remain.
All 24 walk definitions are registered once per game; changing presets reuses the
texture/body and preserves position, camera and velocity.

Walking cycles standing/step/standing/other-step at seven frames/s. Animation
changes only on direction, walking/idle or preset transitions. Actual resolved
sprite movement controls walking, so holding a key into furniture stays idle.
Directional facing is retained on diagonals while valid; wall slides face their
actual movement axis. WASD/arrows and normalized 120px/s movement remain unchanged.
The frame loop reuses a movement buffer and does not update React or Supabase.

Open **Avatar settings**, preview one of six radio choices, then **Save avatar**.
Only a confirmed successful save changes the live appearance. **Return to office**
closes settings and focuses the movement region. Pending/error/success states and
native keyboard radio controls are provided. Unsaved previews do not change the
player; changing the draft hides an earlier save-success message.

Office entry reads the current profile after office authorization. A missing,
null or unsupported legacy key uses Fern. A profile read failure shows a default
and a clear warning. Saved profile `display_name` supplies the label; blank,
email-like or invalid values use `You`. Names are normalized, control characters
removed and truncated to 18 Unicode code points, then shortened to fit the current
zoom if needed. No account email is passed to the renderer.

Labels normally sit above the character with a gap. At the top camera edge they
move below it to avoid clipping or covering the head; bounds are clamped to the
visible world. Text is remeasured only on name/zoom/available-width changes, not
recreated every frame. Existing map, room labels, furniture and default zoom were
retained; no whole-map redesign was necessary.

## Profile persistence and database review

`features/avatars/{service,actions}.ts` save to the existing `profiles.avatar_key`.
The Server Action requires a verified user and validates the key. The service
also uses a fresh verified Auth lookup and accepts **no user-ID parameter** for
saving. Extra form IDs cannot redirect a write to another profile.

Updates send only `{ avatar_key }`, filtered to the authenticated ID. Missing
profiles insert only ID/avatar key; concurrent creation retries a narrow update.
No broad upsert resets `display_name`. Other profile fields are preserved; the
existing updated-at trigger operates normally. Failed/denied/unconfirmed writes
cannot produce a successful save. Workspace views are revalidated after saving.

Read-only CLI inspection of linked development project `rofutnholbtdmxccrkbs`
confirmed eight catalog checks: column exists, RLS enabled, authenticated select,
avatar update and required insert grants, denied profile-ID update, denied
anonymous avatar update. All three deployed policies scope SELECT/INSERT/UPDATE
to `id = auth.uid()` and role `authenticated`; UPDATE checks both old/new rows.
`supabase/tests/avatar_schema_audit.sql` contains the catalog-only query. No user
rows, tokens or credentials were read/output by that inspection.

**No migration or remote data change was necessary or performed.** Existing
database constraints allow legacy keys; the application enforces the preset
allowlist and safely defaults unknown values. RLS remains the ownership boundary.
No privileged browser credentials or RLS bypass was introduced.

## Actual test results

| Check | Result |
| --- | --- |
| Lint / strict typecheck / production build | PASS |
| Unit/service suite | PASS: 67, including nine avatar tests |
| Valid/invalid keys, defaults, names and animation logic | PASS |
| Verified identity, narrow updates, missing-profile insertion/race and failures | PASS with mocked HTTP/Auth adapters |
| Two-user save/reload preference isolation | PASS with isolated service adapters; not live Auth |
| Profile SQL guards | PASS in disposable PostgreSQL: own save/name preservation, cross-user read/write denial, other-ID insert denial, immutable ID, anonymous denial and unchanged other-user preference |
| Existing database regressions | PASS: 54 team + 26 foundation assertions; all fixtures rolled back |
| Deployed profile schema/grant/RLS catalog inspection | PASS; read-only, not a live authenticated mutation test |
| HTTP smoke/security | PASS: 9; unauthenticated office redirect and deferred Phaser behavior preserved |
| Real Chromium engine harness | PASS: all four walk directions, idle, blocked movement, six live preset switches, consistent frame/body ranges and position, exactly 24 animations, email-label fallback, top-edge/no-overlap and resized label bounds, collisions, zoom, input focus, cleanup/remount |
| Real settings UI save, hard refresh and another account | NOT TESTED: dedicated authorized login credentials unavailable |
| Real GPU sustained 60 FPS | NOT TESTED / not established |
| Outstanding automated failures | NONE |

An introduced blocked-idle browser test exposed Phaser body deltas including
pre-separation attempted movement. Animation now uses resolved sprite-position
differences; the test passes. The top-edge case has explicit clipping and
non-overlap regressions. The complete sprite sheet was visually inspected.

Final browser environment: Chrome 155.0.8059.85, Windows / Intel i7-1165G7,
1280×1024, forced SwiftShader software WebGL. Measured **54 frames in 1.2036s,
44.9 FPS**; an earlier successful run measured 44.1 FPS. These are short isolated
engine samples, not a sustained hardware benchmark or a demonstrated FPS gain.
The headless harness contacts no Supabase, changes no live profiles and adds no
production debug route. Preview remains `.cache/office-preview-desktop.png`.

## Files and commands

Created: `features/avatars/{presets,animation,service,actions,avatars.test}.ts`,
`avatar-settings.tsx`, `office/engine/player-avatar.ts`, two drawing helpers,
`supabase/tests/avatar_{profiles,schema_audit}.sql` and this document.
Modified: office scene/factory/lifecycle/input, office client components/route,
sheet dimensions test and PNG, asset generator/root scripts, browser/SQL harnesses,
asset provenance, README and architecture/office validation notes. No dependency
or database-types update was required. Auth/org/invitation business logic is untouched.

```sh
pnpm dev
pnpm assets:avatars
pnpm lint
pnpm typecheck
pnpm test
pnpm test:team:database
pnpm build
pnpm test:smoke
pnpm test:office:browser
```

## Remaining manual validation / merge gate

1. Sign in with dedicated normally confirmed account A and enter an authorized
   office. Open settings, preview all six, save one, then Return to office.
2. Move in all directions and diagonally; release keys and push against walls and
   furniture. Check idle facing, foot position, label placement and zoom/resize.
3. Refresh and leave/re-enter. Confirm the selected preset persists with one
   canvas. If the existing display name is available, verify truncation/readability
   and no email exposure. No display-name editor is added in this step.
4. In another browser sign in with dedicated account B; save a different preset.
   Refresh both and confirm user-specific preferences and preserved names.
5. Verify errors when a session expires or a profile request fails; no false save
   message or unsaved preview should replace the live appearance. Recheck office
   tenant access, keyboard focus and existing team/invitation flows.
6. Profile on representative GPU hardware for sustained FPS and memory stability.

Ready for code review with passing automated checks. Full merge sign-off should
wait for the authenticated manual workflow above; it was not fabricated or
bypassed. No real test accounts were created/reused without authorization, no Git
operations performed and no multiplayer/later-phase work started. Stop at Step 2.
