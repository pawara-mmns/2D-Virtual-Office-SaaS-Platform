import Phaser from 'phaser';
import { composeAvatar } from '../../avatars/composer.ts';
import { encodeCustomization, type AvatarCustomization } from '../../../../../../packages/shared/src/avatar-customization.ts';
type Entry = { key: string; users: number };
const caches = new WeakMap<Phaser.Textures.TextureManager, Map<string, Entry>>();
let serial = 0;
export function acquireAvatarTexture(scene: Phaser.Scene, appearance: AvatarCustomization) {
  let cache = caches.get(scene.textures);
  if (!cache) { cache = new Map(); caches.set(scene.textures, cache); }
  const identity = encodeCustomization(appearance);
  let entry = cache.get(identity);
  if (!entry || !scene.textures.exists(entry.key)) {
    const key = `custom-avatar-${++serial}`, canvas = composeAvatar(appearance);
    const texture = scene.textures.addCanvas(key, canvas)!;
    for (let frame = 0; frame < 24; frame++) texture.add(frame, 0, frame % 3 * 32, Math.floor(frame / 3) * 32, 32, 32);
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (let direction = 0; direction < 4; direction++) {
      const first = direction * 3;
      scene.anims.create({ key: `${key}-${direction}`, frames: [first, first + 1, first, first + 2].map(frame => ({ key, frame })), frameRate: 7, repeat: -1 });
    }
    entry = { key, users: 0 }; cache.set(identity, entry);
  }
  entry.users++;
  const current = entry;
  return { key: current.key, release() {
    current.users--;
    // Never evict a texture used by another player. Bound retained inactive GPU sheets.
    for (const [id, unused] of cache!) if (cache!.size > 32 && unused.users === 0) {
      for (let direction = 0; direction < 4; direction++) scene.anims.remove(`${unused.key}-${direction}`);
      scene.textures.remove(unused.key); cache!.delete(id);
    }
  } };
}
