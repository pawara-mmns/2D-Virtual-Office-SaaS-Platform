export type TileLayer = { type: "tilelayer"; name: string; width: number; height: number; data: number[] };
export type Marker = { name: string; type: string; x: number; y: number };
export type OfficeMap = { width: number; height: number; tilewidth: number; tileheight: number; layers: (TileLayer | { type: "objectgroup"; name: string; objects: Marker[] })[] };
export const TILE_SIZE = 32;
export const PLAYER_SPEED = 120;

export function tileLayer(map: OfficeMap, name: string): TileLayer {
  const layer = map.layers.find((layer) => layer.type === "tilelayer" && layer.name === name);
  if (!layer || layer.type !== "tilelayer") throw new Error(`Missing office layer: ${name}`);
  return layer;
}
export function mapMarkers(map: OfficeMap) {
  const layer = map.layers.find((layer) => layer.type === "objectgroup" && layer.name === "Markers");
  if (!layer || layer.type !== "objectgroup") throw new Error("Missing office markers");
  return layer.objects;
}
export function blocked(map: OfficeMap, x: number, y: number) {
  return x < 0 || y < 0 || x >= map.width || y >= map.height || tileLayer(map, "Collision").data[y * map.width + x] !== 0;
}
export function validateOfficeMap(value: unknown): OfficeMap {
  if (!value || typeof value !== "object") throw new Error("Invalid office map");
  const map = value as OfficeMap;
  if (!Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width < 4 || map.height < 4 || map.width > 128 || map.height > 128 || map.tilewidth !== TILE_SIZE || map.tileheight !== TILE_SIZE || !Array.isArray(map.layers)) throw new Error("Invalid office dimensions");
  for (const name of ["Floor", "Architecture", "Furniture", "Collision"]) {
    const layer = tileLayer(map, name);
    if (layer.width !== map.width || layer.height !== map.height || !Array.isArray(layer.data) || layer.data.length !== map.width * map.height || layer.data.some((tile) => !Number.isInteger(tile) || tile < 0 || tile > 128)) throw new Error("Invalid office tiles");
    if (name === "Collision" && layer.data.some((tile) => tile !== 0 && tile !== 1)) throw new Error("Collision tiles must be binary");
  }
  for (let x = 0; x < map.width; x++) if (!blocked(map, x, 0) || !blocked(map, x, map.height - 1)) throw new Error("Open office boundary");
  for (let y = 0; y < map.height; y++) if (!blocked(map, 0, y) || !blocked(map, map.width - 1, y)) throw new Error("Open office boundary");
  const markers = mapMarkers(map);
  if (!Array.isArray(markers) || markers.some((marker) => !Number.isFinite(marker.x) || !Number.isFinite(marker.y))) throw new Error("Invalid office markers");
  const spawns = markers.filter((marker) => marker.type === "spawn");
  if (spawns.length !== 1) throw new Error("Office needs one spawn");
  const spawn = spawns[0]!;
  // Check the player's 14x10 foot body, not only its center tile.
  for (const x of [spawn.x - 7, spawn.x + 6]) for (const y of [spawn.y + 6, spawn.y + 15]) if (blocked(map, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))) throw new Error("Blocked office spawn");
  return map;
}
