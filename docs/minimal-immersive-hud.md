# Minimal immersive office HUD

Implemented 29 October 2026 on the existing `feature/minimal-immersive-glass-hud` branch. No branch creation, commits, pushes, merges or deployments were performed.

The written brief was available. Its two referenced screenshots were not included in the attachment directory, so the layout was assessed against the explicit requirements and rendered before/after evidence.

## Audit and resulting hierarchy

| Area | Previous persistent UI | Implemented behavior |
| --- | --- | --- |
| Communication | 178px labeled vertical navigation dock | Two 44px icon targets in a 102 x 54px horizontal capsule; Chat, Participants and a compact count |
| Workspace | Large workspace/office/connection card | Small avatar, name, presence dot and chevron; workspace details appear inside its dropdown |
| Secondary actions | Persistent Settings and Exit, plus Avatar in navigation | Avatar settings, Settings and a separate red Exit workspace action inside the profile dropdown |
| Voice | Bottom panel with repeated contextual and session text | Top-center compact group; mic state, manual Join/Leave and existing audio playback/device controls; expanded people/device details on demand |
| Camera | Labeled lower-left zoom/area/orientation panel | 186px icon toolbar at lower right; native area selection behind a location disclosure; orientation/Return appear when the camera leaves self-follow |
| Connection | Repeated connection prose in identity and voice | Low-emphasis lower-left status; offline Retry and critical notices remain discoverable |
| Chat/editor | Large always-reserved chrome | One requested floating panel at a time, maximum 360px wide and 620px tall on larger screens; phone drawers use available height |

The idle office remains full viewport. The header only accepts pointer events on its actual controls. Opening Profile closes an unrelated feature panel; opening Chat or Participants closes the profile dropdown. Voice stays available alongside feature panels.

## Changed components

- `office-hud.tsx`: compact layout, profile capsule and dropdown, workspace information, connection status and focus handling.
- `office-canvas.tsx`: retains feature and engine ownership; supplies the profile information and secondary slots, compact camera area disclosure and concise voice-zone status. Camera commands, movement and transport effects are unchanged.
- `office-disclosure.tsx`: icon-button accessible names/titles, optional count badge and an optional focus-return callback for secondary controls whose triggers are inside a closed menu.
- `participants.tsx`: connected count badge; original roster and Find behavior retained.
- `voice-session.tsx`: icons and accessible labels for existing mic/leave controls, status indication and an expandable audio/people disclosure with Escape dismissal. LiveKit Room creation, capture, connection, publication, cleanup and device selection logic are unchanged.
- `hud-icon.tsx`: microphone, muted microphone, audio and chevron paths.
- `hud-glass.css`: neutral material palette, small grouped surfaces, responsive positioning, tooltips, selected-indicator motion and contrast refinement.
- Browser harnesses: compact geometry and hidden actions, profile keyboard navigation, camera/audio Escape, real touch-sized hit targets, readable icon states, settled screenshots and top voice/panel separation. The existing engine test now checks the same moving sample it waited for, avoiding a second-snapshot race.

No dependencies, backend routes, schema, permissions, protocols, artwork or engine files were changed.

## Material and interaction

Existing Clear/Regular/Elevated surfaces are reused. Light tint is neutral cool white, with alpha 0.60 / 0.70 / 0.81; dark uses charcoal with alpha 0.78 / 0.84 / 0.90. Clear surfaces use 6px desktop blur and 4px on smaller screens; Regular uses 8px desktop / 6px small-screen blur. Saturation is 1.25. Capsule geometry, a masked fine rim, subtle reflection and controlled shadow provide a CSS approximation of glass; no physical optical refraction or continuously animated distortion is claimed.

The existing single delegated reflection handler is retained. Pointer updates use one scheduled frame and cached geometry, without React updates per frame. Touch uses static glass. Hover-only tooltips are restricted to fine hover pointers; keyboard focus also exposes the communication tooltips. Controls have explicit accessible names and visible focus rings. Native titles cover other compact controls.

Reduced motion removes motion. Reduced transparency, unsupported backdrop filtering, forced colors and slow-update environments use opaque surfaces. The persisted Automatic / Liquid Glass / Solid setting remains under Profile > Settings > HUD appearance. Automatic reduces effects for software or limited renderers; explicit Glass is still subordinate to system accessibility settings.

Chat drafts, history and reading position survive panel switches. Hidden editors remain mounted but inert and hidden, retaining state while preventing focus. Closing a secondary editor returns focus to the profile capsule. Profile, area selection and voice details support Escape. Native area/device selects remain usable with keyboard and touch. Existing manual voice consent is preserved; approaching arbitrary avatars does not invent a proximity voice feature. Entering the existing Meeting Room zone exposes its supported Join action.

Critical failures persist with connection status or alerts. Routine state is concise; there is no continuously animated or repeated notification stream.

## Validation

- Production Next.js/Turbopack build passed; feature CSS remains imported by the root layout, avoiding the earlier missing CSS import failure.
- Recursive ESLint and TypeScript checks passed.
- Web unit tests: 103 passed. Realtime tests: 28 passed.
- Production auth/readiness/voice route checks: 13 passed.
- Existing browser suites for chat, communication composition, Phaser rendering/movement/camera and voice: all 4 passed.
- Additional final HUD run passed with profile ArrowDown/Escape, camera disclosure Escape, audio disclosure Escape, clear-material contrast, touch/static glass, reduced effects, retained lifecycle and settled screenshots.
- Viewports: 1440 x 900, 1024 x 900, 820 x 1180, 390 x 844 and 320 x 740. No horizontal page overflow; canvas retains full viewport dimensions. Native phone drawer scrolling is also exercised at 390 x 640, and enlarged text at 320px.
- 44px controls, 48px inputs, 16px input text. Necessary input-boundary contrast: 5.55:1 minimum over composited black/white backgrounds. Regular light primary/muted text: 7.27:1 / 5.27:1 over black. Regular dark text: 5.88:1 / 4.95:1 over white including a conservative 15% white reflection allowance. Clear dock base/hover/selected icon and text states also meet 4.5:1 in these conservative checks.
- One active media session, one authorization/capture/publication and stable Room identity through responsive/panel/preference changes; zero runtime errors and zero pointer-driven React commits. Engine mounts/closes balance at 3/3 through the deliberate lifecycle tests.

The short Intel Iris Xe / Direct3D11 sample with glass, chat and simulated voice measured 60.8 FPS over 1.2 seconds (p95 frame 17.0ms), versus 60.0 FPS for Solid. Wheel interpolation produced 33 distinct zoom samples over about 560ms with only 2 navigation callbacks. These are local short samples, not sustained hardware benchmarks.

The complete final HUD suite also passed with forced SwiftShader software rendering (72.1 seconds). Actual software-renderer detection selected the Automatic opaque fallback: 30.8 FPS versus 13.3 FPS when Glass was deliberately forced, and 32.5 FPS with explicit Solid, each measured over about 1.2 seconds with chat and simulated voice. Automatic remains the default. The software-only timeout is 120 seconds to accommodate this broader optical/theme/menu coverage; native remains 90 seconds. No assertions were dropped.

Browser tests use the actual React/Phaser composition and LiveKit UI, with synthetic identity, history, transport and media tracks. They do not verify hosted authentication, a real LiveKit service, real microphone/speaker audio, physical phones, Safari, Firefox or a screen reader.

The browser harness resolves custom CSS colors through computed styles because the production CSS compiler may optimize custom-property colors to hex. Animation checks wait for entrance completion before testing exit, and screenshots wait for settled panel visibility. These are fixture timing/color-resolution corrections; lifecycle and camera assertions are retained.

## Visual evidence

All screenshots use the local synthetic fixture and original office assets. Before images were preserved from the previous implementation before new captures replaced the local cache.

| View | Evidence |
| --- | --- |
| Previous desktop | [Before](assets/immersive-hud/before-desktop.png) |
| Previous mobile | [Before](assets/immersive-hud/before-mobile.png) |
| Compact desktop | [After](assets/immersive-hud/after-desktop.png) |
| Compact mobile | [After](assets/immersive-hud/after-mobile.png) |
| Profile menu | [After](assets/immersive-hud/profile-menu.png) |
| Light chat | [After](assets/immersive-hud/chat-light.png) |
| Dark chat | [After](assets/immersive-hud/chat-dark.png) |
| Mobile chat + voice | [After](assets/immersive-hud/chat-mobile.png) |
| 320px phone | [After](assets/immersive-hud/chat-narrow.png) |
| Tablet | [After](assets/immersive-hud/tablet.png) |
| Reduced transparency | [After](assets/immersive-hud/reduced-transparency.png) |
| Automatic software fallback | [After](assets/immersive-hud/automatic-fallback.png) |
