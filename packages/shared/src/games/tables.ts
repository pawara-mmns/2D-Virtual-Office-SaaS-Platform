import type { OfficeMap } from '../map.ts';
import { canStand } from '../movement.ts';
import { interactionRegistry, placements, pathClear, type Point } from '../interactions.ts';

export type GameTable = { id: string; gameType: string; assetId: string; x: number; y: number; width: number; height: number; orientation: string; approaches: Point[] };
export const gameTableCatalog: Readonly<Record<string, string>> = { chessTable: 'chess' };
export function gameTables(map: OfficeMap): GameTable[] {
  const ids = new Set<string>();
  return placements(map).flatMap(p => {
    const gameType = gameTableCatalog[p.name];
    if (!gameType || !p.width || !p.height) return [];
    const id = p.instanceId ?? `${map.layers.some(l => l.name === 'Environment') ? 'base/' : ''}${p.type}/${p.name}/${p.x}:${p.y}`;
    if (ids.has(id)) throw Error('Duplicate game table identity'); ids.add(id);
    const approaches: Point[] = [];
    for (let x = 8; x < p.width; x += 8) approaches.push({ x: p.x + x, y: p.y - 20 }, { x: p.x + x, y: p.y + p.height + 4 });
    for (let y = 0; y < p.height; y += 8) approaches.push({ x: p.x - 12, y: p.y + y - 10 }, { x: p.x + p.width + 12, y: p.y + y - 10 });
    return [{ id, gameType, assetId: p.name, x: p.x, y: p.y, width: p.width, height: p.height, orientation: p.facing ?? 'down', approaches: approaches.filter(a => canStand(map, a.x, a.y)) }];
  });
}
export function gameTableDistance(table: GameTable, from: Point) { return Math.min(...table.approaches.map(a => Math.hypot(from.x - a.x, from.y - a.y))); }
export function gameTableInRange(map: OfficeMap, table: GameTable, from: Point & { seatId?: string }): boolean {
  if (gameTableDistance(table, from) > 64) return false;
  const seat = from.seatId ? interactionRegistry(map).flatMap(o => o.slots).find(s => s.id === from.seatId) : undefined;
  if (!canStand(map, from.x, from.y) && !seat) return false;
  return table.approaches.some(a => Math.hypot(from.x - a.x, from.y - a.y) <= 64 && pathClear(map, from, a, seat?.collisionFootprint));
}
export function closestGameTable(map: OfficeMap, tables: readonly GameTable[], from: Point & { seatId?: string }) {
  return tables.filter(t => gameTableInRange(map, t, from)).sort((a, b) => gameTableDistance(a, from) - gameTableDistance(b, from) || a.id.localeCompare(b.id))[0] ?? null;
}
