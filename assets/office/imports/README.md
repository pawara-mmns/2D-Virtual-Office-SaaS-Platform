# Offline sprite imports

The original procedural source remains in `scripts/*office-art.mjs`. This directory accepts artist-authored replacements without changing gameplay metadata. No third-party artwork is bundled.

Export transparent, non-interlaced RGBA8 PNG at the **exact native dimensions** of `fixtures[assetId]` (32 pixels per grid cell). Do not upscale or resize. A chair's optional `facing` must name an existing authored direction. Maintain its seat anchor and silhouette. Importing artwork never creates new orientations, geometry or capabilities.

Add an entry to `manifest.json`:

```json
{
  "assetId": "wallDisplay",
  "theme": "warm-wood",
  "file": "warm-wood/display.png",
  "author": "Artist name",
  "license": "original",
  "source": "Original commissioned artwork; reference or license record",
  "sha256": "64 lowercase hex characters from the PNG's SHA256"
}
```

Permitted license labels are `original`, `CC0`, and `licensed`; the latter requires retaining the actual license record with the source. A label is not proof of permission: review provenance before adding files. Run `pnpm assets:office`, then the asset and browser tests. The importer rejects escaping paths/symlinks, mismatched hashes, dimensions, formats, duplicate targets and oversized decoded payloads. It supports all five PNG row filters. It copies native pixels into the same five atlases; editor thumbnails, preview and game consume that exact artwork. No remote fetch or runtime asset upload is involved.

The manifest starts empty intentionally: no generated image is misrepresented as commissioned high-resolution art. Higher-fidelity art can be introduced one reviewed asset at a time. Keep the primary grid and seating constraints, and capture actual Phaser screenshots for every replacement.

Phase 03 adds 90 stable design IDs in `packages/shared/src/environment/collection.ts`.
Their dimensions, orientation frames, seat anchors, display rectangles and theme
support are exported in `docs/assets/phase03-collection/catalog.json`. The atlas is
now 512×2048; the importer and editor use the shared dimensions. New chair frames
can be replaced individually with `facing: "down"`, `"up"`, `"left"` or `"right"`.
After replacements, regenerate the review sheets with
`node --experimental-strip-types scripts/generate-collection-review.mjs --capture`
and `OFFICE_TEST_BROWSER` set to an installed Chromium browser. Contact sheets use
the real atlas crops; the Phaser browser suite also renders every new design.
