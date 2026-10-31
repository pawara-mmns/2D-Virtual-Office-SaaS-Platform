# Phase 4 — Voice UI polish and local acceptance

Local implementation and validation on October 30, 2026. No Git operations, deployment, schema changes or production tenant writes were performed for this phase.

## UI changes

The live local office reproduced the reported defect: an oversized dark dock with pale sound settings and nearly white text. The settings lived inside the dock, expanded its layout, and used a hardcoded pale background instead of the HUD material tokens.

`voice-popover.tsx` now owns a small, nonmodal disclosure. Closed settings have no mounted panel or form controls. Open settings float below the capsule, inherit the existing elevated glass material, remain inside the viewport, and scroll when space is limited. Escape and Close return focus to the trigger; outside clicks and Tab leaving the disclosure dismiss it. The trigger exposes its expanded state and dialog relationship. Opening settings does not remount microphone capture or the LiveKit Room.

`office-voice.tsx` keeps a compact status/privacy label, controller lock control, leave action and microphone state. Connected sessions show a readable connection state and visible **On/Muted** label. Sound options, participant details and device selection share one settings popover. Waiting sessions keep a paused/muted microphone indication. Meeting voice retains its existing explicit Join Voice flow and now uses the same popover primitive for devices and participants.

The HUD CSS uses existing `--glass-*` colors, materials, borders and focus tokens. There is no hardcoded white sound panel. Touch controls retain 44-pixel targets. Verified default connected and idle capsules stay one row at desktop and 390-pixel mobile width; 320-pixel layouts may wrap within a bounded compact dock. A browser-requested audio-playback recovery action can add another control. Settings never enlarge the dock.

## Bubble polish

The server-authoritative lifecycle and membership logic were not rewritten. The Phaser fill remains translucent and below avatar sprites. A restrained dark keyline improves the cyan/purple boundary against pale floors. Floating lock targets stay offset from avatars even at low zoom, and hide outside the usable camera viewport; the HUD retains its privacy control. No physics bodies, pointer surfaces, shaders, extra particles or new animation loops were added.

Browser checks verify that the stretched boundary follows actual interpolated sprites and that position changes do not cause React renders. Reduced motion continues to remove formation/fade animation.

## Security verification

The existing server coordinator, token proxy, provider adapter and voice authority remain in force:

- Bubble membership comes from authenticated authoritative office positions and opt-in.
- Lock/unlock and roster changes rotate media generations after retiring old admissions.
- Wrong office/member references and stale generations fail authorization.
- Pending token-signing and simultaneous lock/join races are tested through real local HTTP/WebSockets.
- Provider-removal failure blocks replacement grants; separate bubbles receive different room scopes.
- Actual LiveKit Cloud removal latency and audible isolation are distinct from these synthetic provider tests.

The realtime suite re-exercises these behaviors with a synthetic provider. The browser suites use actual React/Phaser/LiveKit SDK components with generated silent tracks. Neither substitutes for listening to authenticated real audio.

## Local authenticated acceptance

Two authenticated Brave sessions were available in **DEV-WorkPlace / Main office**. Inspection showed two different displayed users, office presence of two, and both offering **Enable proximity voice** before testing. One inspected window was a Private window, providing an isolated login session. The supplied two-session setup was used; no credentials were read or account provisioning performed.

The tester was asked to enable both sessions, handle microphone permission normally, approach within three tiles, test each audio direction, separate beyond five tiles, and check sound counts and mute persistence after reconnect. The tester replied: **“i tested and its work”**.

| Acceptance area | Status | Evidence/remaining detail |
|---|---|---|
| Two authenticated users in the same local office | Observed | Same office route and two-person presence in both sessions |
| Explicit initial voice opt-in UI | Observed | Both sessions initially showed Enable proximity voice |
| Two-user real voice smoke test | User-confirmed working | Overall tester confirmation after the described workflow |
| Individual A→B and B→A listening results | Not separately recorded | Covered by the overall confirmation, not an itemized listening record |
| Connection/end sound played exactly once | Not separately recorded | Automated deduplication checks pass; audible counts were not itemized |
| Separation/reconnect and mute preservation on real devices | Not separately recorded | Overall smoke confirmation; automated transition/mute checks pass |
| Meeting Room real-audio acceptance | Pending explicit result | Automated precedence, explicit join and cleanup checks pass |
| Three-user private-lock outsider cannot hear/join | Pending third authenticated user | Controller/stale-grant/lock races pass automatically; no real outsider listening result |
| Four-user cross-bubble audible isolation | Pending fourth authenticated user | Automated distinct room scopes pass; no four-person listening result |
| LiveKit Cloud revocation timing | Not measured | No timing claim is made |

Computer Use was stopped by the tester's physical Escape key. No further Computer Use calls or app input were issued after that stop. The tester's later overall confirmation is recorded above; repository and isolated harness checks continued independently.

## Repeatable local workflow

Use the existing local configuration and `pnpm dev:all`. Keep API keys server-side and use a dedicated development LiveKit authority. Open the same dedicated test office in distinct Brave profiles, with separate signed-in accounts. Each tester must click Enable and handle their own browser permission prompt. Use headphones and record observations without passwords, tokens, provider credentials or raw SDK errors.

| Step | Action | Required observation |
|---|---|---|
| 1 | Enter the same office as A and B | Two avatars and two connected office members |
| 2 | Wait before enabling | No microphone capture or voice connection starts automatically |
| 3 | Enable proximity in both sessions | Normal browser permission; clear microphone state |
| 4 | Approach within 96 world pixels (three tiles), hold ≥700 ms | Cyan boundary and connected status |
| 5 | Speak as A, then B | Each other participant hears the speaker; record both directions |
| 6 | Observe initial connection | One quiet connection cue per confirmed entry |
| 7 | Separate beyond 112 world pixels | Boundary stretches smoothly |
| 8 | Remain beyond 160 world pixels for ≥1 second | Audio ends and the boundary dissolves |
| 9 | Count departure cues | One end cue per confirmed departure |
| 10 | Approach again | Fresh authorized conversation; no duplicate playback |
| 11 | Mute before separating/rejoining | Microphone remains muted until explicitly unmuted |
| 12 | Enter/leave the Meeting Room | Proximity stops, explicit Join Voice works, outside proximity needs re-enable |
| 13 | Add C, lock A/B, approach with C | C neither joins nor hears private speech; unlock permits admission after dwell |
| 14 | Add D and form A/B plus C/D | Speech stays inside each bubble, including after groups approach each other |

For a detailed acceptance run, record each result as Pass, Fail or Not tested, plus browser version, test date, role labels A/B/C/D and a brief redacted observation. Do not infer provider revocation speed or outsider isolation merely from the visible purple boundary.

## Screenshots

The following updated artifacts are actual component/Phaser renders from isolated synthetic sessions. They do not depict the live authenticated listening test.

- [Compact default voice capsule](../.cache/phase4-voice-compact.png)
- [Light settings popover](../.cache/phase4-voice-settings-light.png)
- [Dark settings popover](../.cache/phase4-voice-settings-dark.png)
- [Connected settings popover](../.cache/phase4-voice-settings-connected.png)
- [Connected bubble](../.cache/phase4-connected-bubble.png)
- [Stretched bubble](../.cache/phase4-stretched-bubble.png)
- [Locked private bubble](../.cache/phase4-private-bubble.png)
- [Mobile controls](../.cache/phase4-mobile-controls.png)
- [Mobile settings](../.cache/phase4-mobile-settings.png)

Regenerate them with `pnpm test:proximity:browser`, setting `OFFICE_TEST_BROWSER` to the Brave executable. The files are in ignored `.cache`, not committed assets.

## Validation record

| Check | Result in this phase |
|---|---|
| Existing web unit tests | 128 passed |
| Existing realtime/unit/HTTP/WebSocket tests | 37 passed |
| Proximity and meeting-voice browser suites | Both passed |
| Office, chat, communication and environment browser suites | All four passed |
| Production voice-route and public-bundle checks | 3 passed |
| Workspace lint | Passed, zero warnings |
| Workspace TypeScript, including Next route type generation | Passed |
| Next.js production build | Passed |
| Realtime TypeScript build | Passed |
| Real two-user smoke | User-confirmed working; detailed acceptance ledger above |
| Real three/four-user listening | Pending additional authenticated users |

Commands used: pinned `pnpm -r test`, `pnpm -r lint`, `pnpm -r typecheck`, `next build apps/web`, realtime `tsc -p tsconfig.build.json`, the production voice-route harness from `apps/web`, and all six isolated browser scripts with Brave selected through `OFFICE_TEST_BROWSER`. No failing automated check remains after the fixes and reruns.

The passing proximity browser run measured settings text against conservative black/white backdrop extremes. Minimum contrast: **7.20:1 light glass**, **9.30:1 dark glass**, **10.38:1 light solid**, **11.89:1 dark solid**. Tests cover closed-panel absence, unchanged capsule size on opening, settings persistence, keyboard focus/dismissal, media ownership, visible privacy/leave controls, 390/320-pixel widths and reduced motion.

Initial checks caught a browser startup readiness race and a CSS selector that hid the connected privacy controls. Both were fixed and the affected suites rerun successfully. The settings/participants harnesses were updated to exercise the new button/dialog behavior while retaining their microphone, SDK and device-observer assertions.

Remaining limitations are the unrecorded or pending real-user checks above, world-distance proximity without wall occlusion, and the existing single-process office authority. This phase adds no new server privacy exceptions or persisted environment settings.
