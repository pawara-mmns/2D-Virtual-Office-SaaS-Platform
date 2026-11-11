# Avatar Studio redesign

Implemented locally in the current workspace. No branches, commits, pushes, merges, deployment, or remote database changes were made.

## UI architecture

The narrow disclosure panel is replaced by a native modal character studio, approximately 880×654px on desktop and constrained to the available viewport. The left column contains the large, crisp avatar preview, compact display name, rotation, and idle/walk/run/sit controls. The right column contains a single-row icon category rail, real pixel-art option cards, and contextual colors. Only the option region scrolls vertically. Save/Cancel and feedback occupy a fixed footer within the studio.

Mobile uses a full-screen dialog with a compact preview and controls at the top, a horizontal category rail, a three-column card grid, and anchored actions. At 390×844, all eight hairstyles and the color palette fit together. Short landscape screens retain two columns and let the option region scroll. The desktop and mobile previews remain visible while options scroll.

Thumbnails are cropped views of actual composed catalog appearances, rather than separate illustrations. Hairstyles, face details, tops, bottoms, shoes, accessories, and body shapes show the pixels that the existing game composer can render. All choices preserve dress/bottom compatibility. Original presets are available within Body; randomize and reset remain in the footer.

The studio mounts only while open. It retains the existing office, Phaser, network, and media owners. Supabase actions, catalog IDs, JSON versioning, RLS, Colyseus state, sprite layering, and in-game animations are unchanged by this redesign.

## Save, cancel, and accessibility

- A canonical draft signature detects actual appearance/name changes. Preview rotation, animation, and category changes do not enable Save.
- Save shows pending state and disables duplicate submissions. A successful save disables Save and shows concise feedback. Validation and request failures preserve the edited draft; editing clears old errors.
- Cancel, Close, backdrop dismissal, and Escape protect unsaved edits with Keep editing / Discard changes. Browser navigation also receives the native unsaved-change warning. Discard restores the saved appearance on the next opening and never publishes the draft.
- Native dialog modality contains keyboard focus and prevents gameplay controls from receiving input while editing. Closing restores focus to the profile trigger. Escape is handled inside the studio so office-level handlers cannot intercept it.
- Category tabs support arrow keys, Home, and End with a single tab stop. Visual cards use native radio inputs and selected checkmarks. Swatches have accessible hex labels, pressed states, and keyboard activation.
- Decorative thumbnail canvases are hidden from assistive technology. The main preview has a descriptive accessible name. Feedback uses status/alert announcements; focus rings and input boundary contrast are explicit. Primary actions and mobile preview controls have 44px heights.

## Components modified

| File | Responsibility |
| --- | --- |
| `apps/web/src/features/avatars/avatar-settings.tsx` | Trigger, modal studio, visual categories/cards, preview controls, draft/save/dismissal lifecycle |
| `apps/web/src/features/avatars/avatar-studio.css` | Dark neutral Liquid Glass styling, two-column/full-screen layouts, fixed actions and isolated option scrolling |
| `apps/web/src/features/avatars/avatar-preview.tsx` | Optional real-asset crops and decorative thumbnail semantics; shared nearest-neighbor composer retained |
| `apps/web/src/features/avatars/studio-model.ts` | Draft signatures, compatible candidate appearances, labels and crop definitions |
| `apps/web/src/app/globals.css` | Studio stylesheet import; obsolete single-column avatar styles removed |
| `apps/web/src/features/office/components/hud-glass.css` | Removed the old avatar drawer height override |
| Browser/unit test files | New studio behavior, layout, visual selection, accessibility and retained integration coverage |

## Screenshots

- [Character Studio desktop](assets/avatar-studio/studio-desktop.png)
- [Hair selection](assets/avatar-studio/studio-hair.png)
- [Outfit selection](assets/avatar-studio/studio-outfit.png)
- [Hair color selection](assets/avatar-studio/studio-color.png)
- [Mobile Character Studio](assets/avatar-studio/studio-mobile.png)
- [Mobile hair options and palette](assets/avatar-studio/studio-mobile-hair.png)
- [Short laptop](assets/avatar-studio/studio-short-laptop.png)
- [Mobile landscape](assets/avatar-studio/studio-landscape.png)
- [320px portrait](assets/avatar-studio/studio-small-mobile.png)
- [200% zoom-equivalent CSS viewport](assets/avatar-studio/studio-zoom-200.png)

All screenshots come from real React/Phaser rendering with local synthetic identities. The same folder includes screenshots of cardinal sitting, desk foreground occlusion, walking/running, ten customized clients, and two-client appearance synchronization.

## Validation

- 28 relevant automated tests passed: avatar profiles, metadata validation, legacy compatibility, studio draft comparison and valid thumbnail configurations, and client network lifecycle.
- The real two-client Chromium suite passed visual card hit testing, immediate pixel updates, colors, all animation previews, category keyboard controls, modal focus containment, clean/dirty Escape, discard/keep editing, invalid display names, failed-save preservation, success/unchanged Save states, persistence after a new document load, authoritative appearance updates, seated swaps, movement, and ten-client rendering.
- Layout assertions cover 1440×1000 desktop, 1280×600 laptop, 390×844 portrait, 320×640 portrait, 844×390 landscape, and a 640×450 zoom-equivalent viewport. They verify visible preview/footer, a single category row, bounds, and no scrolling of the whole dialog.
- The existing HUD/communication browser suite passed desktop/tablet/mobile layouts, keyboard focus, old preset/name persistence, settings changes, camera ownership, synthetic voice ownership, media lifecycle, and teardown without runtime errors. The name field boundary measured approximately 3.99:1 contrast in that fixture.
- Both web and realtime passed lint, TypeScript, and production builds. Checks used the installed Node entry points because the pnpm launcher requires an external store lock unavailable in the sandbox.

The local browser fixtures do not add an application debug route or contact a remote database. The synthetic save-failure case verifies that errors retain the draft without publishing appearance metadata. Performance remains environment-specific; the browser measurement is recorded in [performance.json](assets/avatar-studio/performance.json).

## Remaining limitations

Mobile validation uses Chromium viewport emulation; physical mobile keyboards, Safari, Firefox, and a screen reader session were not exercised. The 640×450 case checks a 200% zoom-equivalent layout rather than a browser chrome zoom setting. Very short/narrow screens require scrolling within the options region; preview and actions remain anchored.

Hosted Supabase and live microphone services were not used for this UI-only redesign. The previous Phase 04 additive database migration remains a separate manual review/application step; this redesign adds no migration and changes no persistence or multiplayer contract.
