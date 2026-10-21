# Original office artwork

`office-tiles.png`, `avatar.png` and `studio.json` were authored specifically for
this repository by `scripts/generate-office-assets.mjs`. No third-party asset
pack, screenshot extraction, downloaded sprite or copied product artwork is used.
The supplied references informed room readability only.

The editable drawing source uses a small fixed palette and integer pixel shapes:
oak boards, cream/teal walls, glass partitions, desks/computers/task chairs,
meeting furniture, upholstered lounge seating, shelving, plants and reception.
Avatar frames are 32×32, three poses in each of four directional rows.

No external asset license applies. These are original project-owned source
assets; no separate redistribution license has been selected for the repository.
This file does not grant rights to the reference products or their artwork.
Phaser itself is MIT licensed; its license is included in the installed package.

Run `pnpm assets:office` to regenerate all three runtime files deterministically.
`studio.json` is an embedded-tileset Tiled orthogonal map that can also be opened
and edited in Tiled. If editing it directly, do not regenerate without first
carrying the layout changes into the generator (which also writes the map).
