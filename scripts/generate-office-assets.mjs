// Original pixel drawings and editable Tiled map. No downloaded art or libraries.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { picture } from "./office-pixel-art.mjs";
import { generateAvatars } from "./generate-avatar-assets.mjs";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../apps/web/public/office/", import.meta.url));
mkdirSync(output, { recursive: true });
const art = picture(512, 256);
const { rect: r, ellipse: e, line: l } = art;
// Alternating oak boards, stitched carpet, stone and architectural tiles.
for (let tile = 0; tile < 8; tile++) {
  const x = tile * 32;
  if (tile < 3) {
    r(x, 0, 32, 32, ["c9a875", "d2b481", "c5a272"][tile]);
    for (let y = 0; y < 32; y += 8) {
      l(x, y, 32, "b49568"); l(x, y + 1, 32, "ddc398");
      r(x + ((y / 8 * 11 + tile * 7) % 30), y + 1, 1, 7, "b49568");
      l(x + 3 + tile, y + 5, 8 + tile * 2, "c09e6d");
    }
  } else {
    r(x, 0, 32, 32, ["", "", "", "698083", "c5c3ad", "d9d9c9", "c2ab88", "788b78"][tile]);
    for (let y = 2; y < 32; y += 4) for (let xx = 2; xx < 32; xx += 4) r(x + xx, y, 1, 1, tile === 3 ? "849899" : "e2dfcc");
    if (tile === 5) { l(x, 0, 32, "f2f0e2"); r(x, 0, 1, 32, "f2f0e2"); }
  }
}
r(256, 0, 32, 32, "344c48"); r(257, 1, 30, 22, "ede9d7"); l(258, 2, 28, "fff9e8"); r(257, 23, 30, 5, "71887b"); l(257, 28, 30, "253f3b"); r(257, 30, 30, 2, "a6977b");
r(288, 0, 32, 32, "344c48"); r(291, 0, 25, 32, "ede9d7"); r(292, 0, 3, 32, "fff9e8"); r(313, 0, 3, 32, "71887b");
r(320, 0, 32, 32, "78938c66"); r(320, 2, 32, 3, "304c48"); r(320, 27, 32, 3, "304c48"); r(321, 5, 2, 22, "bdd5ca"); r(348, 5, 3, 22, "304c48"); l(324, 8, 21, "c6d8ca");
// Developer station: shadow, oak edge, monitor, keyboard, mug and task chair.
r(4, 70, 56, 54, "263d3830"); r(3, 66, 58, 33, "6d5c48"); r(4, 64, 56, 31, "e0c49b"); l(5, 65, 54, "f5dfb6"); l(5, 94, 54, "b5956d");
r(8, 97, 4, 10, "4e5c57"); r(51, 97, 4, 10, "4e5c57"); r(19, 67, 27, 17, "243c41"); r(21, 69, 23, 12, "466e78");
l(23, 71, 10, "95bfba"); l(23, 74, 15, "689c9c"); l(23, 77, 8, "b3c8a2"); r(30, 84, 4, 3, "344d4b"); r(26, 87, 13, 2, "61736a");
r(21, 89, 25, 5, "8c9b94"); l(23, 90, 20, "dde0ce"); r(49, 88, 4, 5, "f7f0dc"); r(53, 89, 2, 3, "c4b79b");
function chair(x, y) { e(x + 5, y + 24, 23, 6, "243c3730"); r(x + 14, y + 18, 4, 10, "3b504e"); r(x + 7, y + 26, 18, 2, "304844"); r(x + 5, y + 8, 23, 14, "2c454c"); r(x + 7, y + 7, 19, 13, "627f87"); l(x + 8, y + 8, 17, "8da1a2"); r(x + 6, y + 3, 21, 6, "3b5961"); l(x + 8, y + 3, 17, "7e999a"); }
chair(16, 100); chair(64, 64);
// Tall ficus, terracotta pot, visible leaf clusters with a restrained three-tone ramp.
e(100, 118, 25, 7, "273e3830"); r(105, 106, 17, 13, "926750"); r(107, 108, 13, 11, "bf8a66"); l(105, 106, 17, "dfb086"); r(112, 83, 3, 26, "665e3d");
for (const [x, y, w, h] of [[99, 75, 16, 17], [111, 67, 15, 18], [104, 87, 19, 18], [98, 91, 14, 12], [115, 82, 13, 15]]) { e(x, y, w, h, "365b45"); e(x + 1, y, w - 3, h - 4, "537a50"); r(x + 4, y + 3, 3, 2, "89a36a"); }
// Upholstered sofa, three cushions, piping, wooden feet.
r(132, 75, 88, 49, "243c3730"); r(134, 73, 84, 45, "334e59"); r(137, 70, 78, 37, "557782"); r(139, 72, 74, 12, "77949a");
for (let i = 0; i < 3; i++) { r(140 + i * 24, 86, 22, 23, "6a8a94"); l(142 + i * 24, 88, 18, "89a4a6"); l(141 + i * 24, 107, 20, "415e68"); }
r(132, 83, 7, 29, "486873"); r(213, 83, 7, 29, "486873"); r(138, 117, 5, 5, "655644"); r(208, 117, 5, 5, "655644");
// Rounded coffee table with notebooks, a ceramic cup, and compact lounge seat.
e(226, 72, 59, 22, "243c3730"); r(230, 72, 50, 17, "8a7156"); r(228, 69, 54, 17, "d9bc8a"); l(232, 70, 46, "edd5aa"); r(236, 73, 12, 8, "507774"); l(238, 74, 8, "9cb1a1"); e(263, 74, 7, 6, "f5ebce"); e(265, 75, 3, 3, "80624d");
r(290, 69, 28, 22, "3d5b62"); r(294, 67, 20, 24, "8fa3a0"); r(296, 77, 16, 11, "aec0b4"); l(296, 69, 16, "ced7c3");
// Meeting table: four-tile oval-corner outline, inset surface, pads and center detail.
r(324, 76, 120, 43, "243c3730"); r(325, 72, 118, 42, "7c684f"); r(329, 68, 110, 46, "bd9d70"); r(332, 70, 104, 40, "e4cfaa"); l(334, 72, 100, "f6e6c7");
for (const x of [343, 378, 414]) { r(x, 76, 12, 6, "617b79"); l(x + 1, 77, 10, "a7b6a4"); r(x, 99, 12, 6, "617b79"); }
r(378, 86, 13, 7, "d1ba95"); e(383, 85, 4, 7, "678460");
// Bookshelf with hand-placed volumes and binders, whiteboard diagram, reception.
r(2, 164, 92, 25, "705b45"); r(4, 161, 88, 22, "c5a67a"); r(6, 164, 84, 17, "615b49");
for (let i = 0; i < 20; i++) { const x = 8 + i * 4; r(x, 165 + i % 3, 3, 14 - i % 3, ["7d9d96", "c99a78", "d6c69b", "627d89"][i % 4]); l(x, 168, 3, "ddcfac"); }
l(4, 183, 88, "ead2ab"); r(7, 188, 4, 3, "534f40"); r(85, 188, 4, 3, "534f40");
r(98, 162, 60, 28, "4e6764"); r(100, 164, 56, 23, "e9eddd"); r(106, 170, 11, 7, "9cae9a"); r(137, 173, 12, 7, "c3b28d"); l(118, 173, 18, "617d74"); r(124, 173, 1, 8, "617d74"); l(124, 181, 12, "617d74");
r(164, 169, 88, 51, "243c3730"); r(163, 165, 90, 45, "7c644c"); r(165, 172, 86, 35, "b69466");
for (let x = 170; x < 251; x += 8) r(x, 176, 1, 28, "9f805b");
r(161, 163, 94, 12, "e8d3ab"); l(163, 163, 90, "f9e8c8"); r(194, 157, 24, 12, "2e4b4c"); r(196, 159, 20, 7, "6a9192"); r(202, 170, 8, 2, "61736a"); r(233, 165, 8, 6, "78906c");
r(259, 164, 57, 25, "7b887b"); r(260, 161, 55, 24, "dadcc7"); r(286, 164, 1, 19, "a5ae9b"); r(282, 172, 2, 4, "73877b"); r(291, 172, 2, 4, "73877b");
e(324, 213, 24, 8, "273e3830"); r(335, 176, 2, 38, "5b6c59"); r(327, 169, 18, 13, "d6ca9c"); l(328, 169, 16, "f2e4b8"); r(329, 214, 14, 3, "62715b");
r(354, 163, 60, 26, "926f4d"); r(356, 165, 56, 22, "c5af81"); for (let i = 0; i < 4; i++) r(361 + i * 12, 169 + i % 2 * 3, 9, 11, ["ece6c9", "9fb7a7", "cda48a", "e3dbc0"][i]);
art.png("office-tiles.png");

generateAvatars();

const width = 36, height = 26, size = width * height;
const floor = Array.from({ length: size }, (_, i) => 1 + ((i % width * 7 + Math.floor(i / width) * 3) % 3));
const walls = Array(size).fill(0), furniture = Array(size).fill(0), collision = Array(size).fill(0);
const set = (layer, x, y, gid) => { layer[y * width + x] = gid; };
function area(x, y, w, h, gid) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(floor, i, j, gid); }
function wall(x, y, gid = 9) { set(walls, x, y, gid); set(collision, x, y, 1); }
for (let x = 0; x < width; x++) { wall(x, 0); wall(x, height - 1); }
for (let y = 1; y < height - 1; y++) { wall(0, y, 10); wall(width - 1, y, 10); }
area(1, 1, 11, 11, 4); area(24, 1, 11, 11, 5); area(14, 20, 9, 5, 6);
for (let y = 1; y <= 12; y++) if (![9, 10].includes(y)) wall(12, y, 10);
for (let x = 1; x <= 12; x++) if (![7, 8].includes(x)) wall(x, 12, 11);
for (let y = 1; y <= 12; y++) if (![9, 10].includes(y)) wall(23, y, 10);
for (let x = 23; x < 35; x++) if (![26, 27].includes(x)) wall(x, 12, 11);
const sprites = { desk: [0, 64, 64, 64], chair: [64, 64, 32, 32], plant: [96, 64, 32, 64], sofa: [128, 64, 96, 64], coffee: [224, 64, 64, 32], armchair: [288, 64, 32, 32], meeting: [320, 64, 128, 64], books: [0, 160, 96, 32], board: [96, 160, 64, 32], reception: [160, 160, 96, 64], cabinet: [256, 160, 64, 32], lamp: [320, 160, 32, 64], notice: [352, 160, 64, 32] };
function stamp(name, x, y) {
  const [sx, sy, w, h] = sprites[name];
  for (let j = 0; j < h / 32; j++) for (let i = 0; i < w / 32; i++) {
    set(furniture, x + i, y + j, 1 + (sy / 32 + j) * 16 + sx / 32 + i);
    set(collision, x + i, y + j, 1);
  }
}
stamp("books", 3, 2); stamp("sofa", 3, 4); stamp("coffee", 4, 7); stamp("armchair", 8, 7); stamp("plant", 2, 8); stamp("plant", 10, 2); stamp("lamp", 9, 9);
for (const [x, y] of [[15, 4], [19, 4], [15, 9], [19, 9], [15, 15], [20, 15]]) stamp("desk", x, y);
stamp("meeting", 27, 5); for (const [x, y] of [[27, 4], [29, 4], [27, 7], [29, 7]]) stamp("chair", x, y);
stamp("board", 28, 2); stamp("plant", 33, 2); stamp("plant", 24, 2);
stamp("reception", 16, 21); stamp("notice", 15, 19); stamp("plant", 13, 21); stamp("plant", 22, 21);
stamp("cabinet", 28, 16); stamp("books", 29, 20); stamp("sofa", 28, 22); stamp("plant", 33, 21); stamp("plant", 2, 21); stamp("plant", 8, 20);
const layer = (id, name, data, visible = true) => ({ id, name, type: "tilelayer", x: 0, y: 0, width, height, opacity: 1, visible, data });
const marker = (id, name, type, x, y) => ({ id, name, type, x: x * 32, y: y * 32, width: 0, height: 0, point: true, visible: true, rotation: 0 });
const map = { type: "map", version: "1.10", tiledversion: "1.11.2", orientation: "orthogonal", renderorder: "right-down", infinite: false, width, height, tilewidth: 32, tileheight: 32, nextlayerid: 6, nextobjectid: 6,
  layers: [layer(1, "Floor", floor), layer(2, "Architecture", walls), layer(3, "Furniture", furniture), layer(4, "Collision", collision, false), { id: 5, name: "Markers", type: "objectgroup", x: 0, y: 0, opacity: 1, visible: true, objects: [marker(1, "Entrance", "spawn", 18.5, 24.2), marker(2, "LOUNGE", "area", 6, 10.8), marker(3, "DEVELOPMENT", "area", 18, 2.5), marker(4, "MEETING ROOM", "area", 29, 10), marker(5, "RECEPTION", "area", 18.5, 23.4)] }],
  tilesets: [{ firstgid: 1, name: "office", tilewidth: 32, tileheight: 32, tilecount: 128, columns: 16, spacing: 0, margin: 0, image: "office-tiles.png", imagewidth: 512, imageheight: 256 }],
};
const mapFile = output + "studio.json";
map.nextlayerid = 7; map.nextobjectid = 7;
map.layers.push({ id: 6, name: "VoiceZones", type: "objectgroup", x: 0, y: 0, opacity: 1, visible: false,
  objects: [{ id: 6, name: "Meeting Room", type: "voice", x: 24*32, y: 32, width: 11*32, height: 11*32, visible: false, rotation: 0 }] });
const lineEnding = existsSync(mapFile) && readFileSync(mapFile, "utf8").includes("\r\n") ? "\r\n" : "\n";
writeFileSync(mapFile, (JSON.stringify(map, null, 2) + "\n").replace(/\n/g, lineEnding));
console.log("Generated original office atlas, avatar sheet and editable Tiled JSON.");
