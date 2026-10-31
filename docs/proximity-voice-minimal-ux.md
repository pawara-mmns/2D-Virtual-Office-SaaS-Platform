# Icon-only proximity voice

The default top-center HUD now contains a microphone toggle and a small settings icon. Enable/disable text, connection labels, duplicate microphone controls, and the manual leave button have been removed from the visible proximity HUD. Accessible names, tooltips and screen-reader status remain available.

| Icon state | Meaning | Action |
|---|---|---|
| Slashed mic, unpressed | Proximity disabled | Click to request normal microphone permission and opt in |
| Mic with green indicator, pressed | Proximity enabled | Click to disable and release capture |
| Slashed mic with amber indicator, pressed | Proximity enabled with saved mute preference | Click to disable; use settings to change mute preference |
| Pending indicator | Waiting for capture or server opt-in | Click the same icon to cancel |
| Error indicator and compact feedback | Permission/connection failure | Review feedback and retry when ready |

Mute, sound effects volume/mute, participant details and devices live in the existing glass popover. The current controller can also lock/unlock there; the floating bubble lock remains available. Preferences continue using the existing local storage and shared audio owner.

## Automatic behavior

After the one opt-in gesture and permission grant, the existing server-authoritative proximity state drives media connection. There is no extra connect button or proximity confirmation dialog. Confirmed connection/departure sounds retain their existing deduplication.

Normal separation keeps opt-in enabled: the bubble stretches, the server applies its existing exit radius/grace, the old media session is retired, and capture pauses. Approaching again automatically joins a fresh authorized conversation using the held capture and saved mute preference. Tests now explicitly cover this cycle in both the authoritative coordinator and the browser UI.

Server membership, LiveKit isolation, generation rotation, controller checks, connection serialization, meeting precedence and bubble geometry were not changed. The Meeting Room retains its explicit Join Voice flow.

## Browser limits

The initial microphone permission prompt requires a click and can only be granted by the user. Denial shows compact feedback and never starts media signaling. Cancelling an unanswered request stops any track granted later. Settings never requests microphone permission by itself.

Some browsers require a further playback activation gesture. In that case the existing SDK recovery action appears as a compact speaker icon with the accessible label **Enable audio playback**; it is not a second proximity activation control.

The existing consent policy still requires opting in again after office/session loss, permission termination, refresh, or entering/leaving Meeting Room voice. Distance-based separation alone does not require another opt-in. No new authenticated real-microphone acceptance run is claimed for this UI revision; the earlier user-confirmed two-user smoke result is documented in [Phase 4](proximity-voice-phase4.md).

## Verification and screenshots

The updated isolated Brave harness checks icon-only activation, pressed/off/on/muted states, permission denial and late cancellation, automatic connection from authoritative state, automatic separation/reconnection without another enable or capture, mute preservation, floating/settings locks, generation serialization, and explicit Meeting Room join. It also checks settings contrast, keyboard dismissal, viewport bounds, closed-panel absence and compact dimensions at desktop/390/320-pixel widths. Its authorization and silent media are synthetic; authoritative distance rules are separately exercised through realtime tests.

- [Voice off](../.cache/minimal-voice-off.png)
- [Voice enabled](../.cache/minimal-voice-enabled.png)
- [Connected and muted](../.cache/minimal-voice-connected.png)
- [Private bubble](../.cache/minimal-voice-private.png)
- [Stretched bubble](../.cache/minimal-voice-stretched.png)
- [Settings](../.cache/minimal-voice-settings-connected.png)
- [Mobile controls](../.cache/minimal-voice-mobile.png)
- [Mobile settings](../.cache/minimal-voice-mobile-settings.png)

Regenerate screenshots with `pnpm test:proximity:browser` and Brave selected through `OFFICE_TEST_BROWSER`. Artifacts are in ignored `.cache`.

Local validation on October 30, 2026:

| Check | Result |
|---|---|
| Web unit tests | 128 passed |
| Realtime tests | 37 passed; expanded automatic re-approach scenario also passed in the focused coordinator run |
| Proximity browser suite | Passed, including icon-only controls, permissions, automatic disconnect/reconnect and mute preservation |
| Meeting voice browser suite | Passed |
| Full office communication/HUD browser suite | Passed |
| Production voice-route/bundle checks | 3 passed |
| Workspace lint and TypeScript | Passed |
| Web and realtime builds | Passed |

The browser run also checks enabled and muted microphone icon contrast in both color schemes (at least 3:1 against conservative backdrop extremes). A color-token specificity issue was corrected and the final screenshots and checks regenerated. All screenshots use isolated synthetic identities and silent tracks; no new real-audio acceptance is implied.
