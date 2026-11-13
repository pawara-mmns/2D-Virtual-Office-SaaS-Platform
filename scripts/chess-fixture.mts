// Synthetic local test geometry. Uses the real owner-decoration validator and atlas.
import { defaultEnvironment } from '../packages/shared/src/environment/catalog.ts';
import { composeDecoratedEnvironment, type DecorationDocument } from '../packages/shared/src/environment/decoration.ts';
import { tileLayer } from '../packages/shared/src/map.ts';
import { gameTables } from '../packages/shared/src/games/tables.ts';
export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function chessFixture() {
  const document: DecorationDocument = { version: 1, objects: [], removed: [] };
  let map = composeDecoratedEnvironment(defaultEnvironment, document);
  for (let count = 0; count < 2; count++) {
    let found = false;
    for (let y = 64; y < map.height * 32 - 64 && !found; y += 32) for (let x = 64; x < map.width * 32 - 96 && !found; x += 32) {
      if (document.objects.some(o => Math.abs(o.x - x) < 160 && Math.abs(o.y - y) < 96)) continue;
      const i = y / 32 * map.width + x / 32;
      if (tileLayer(map, 'Collision').data[i] || tileLayer(map, 'Collision').data[i + 1]) continue;
      const candidate: DecorationDocument = { ...document, objects: [...document.objects, { id: 'custom/' + fixtureId(300 + count), assetId: 'chessTable', x, y, orientation: 'down' }] };
      try {
        const next = composeDecoratedEnvironment(defaultEnvironment, candidate);
        if (!gameTables(next).find(t => t.id === candidate.objects.at(-1)!.id)?.approaches.length) continue;
        map = next; document.objects = candidate.objects; found = true;
      } catch { /* Try another validated location, never loosen publication validation. */ }
    }
    if (!found) throw Error('No safe chess table placement found');
  }
  map = composeDecoratedEnvironment(defaultEnvironment, document, 1);
  return { map, document, tables: gameTables(map), environment: defaultEnvironment };
}
