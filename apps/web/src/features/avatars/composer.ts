import { appearanceLayers, avatarPalette, drawAvatarLayer, layerColor, layerOption, AVATAR_FRAME, AVATAR_FRAMES } from '../../../../../packages/shared/src/avatar-art.ts';
import { encodeCustomization, type AvatarCustomization } from '../../../../../packages/shared/src/avatar-customization.ts';

// Bounded shared, immutable compositions; editor and Phaser use identical pixels.
const compositions = new Map<string, HTMLCanvasElement>();
export function composeAvatar(appearance: AvatarCustomization): HTMLCanvasElement {
  const key = encodeCustomization(appearance);
  const cached = compositions.get(key);
  if (cached) { compositions.delete(key); compositions.set(key, cached); return cached; }
  const canvas = document.createElement('canvas'); canvas.width = AVATAR_FRAME * 3; canvas.height = AVATAR_FRAME * AVATAR_FRAMES / 3;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  const palettes = new Map(appearanceLayers(appearance, 0).map(name => [name, avatarPalette(layerColor(appearance, name))]));
  for (let frame = 0; frame < AVATAR_FRAMES; frame++) {
    for (const name of appearanceLayers(appearance, Math.floor(frame % 12 / 3))) {
      const palette = palettes.get(name)!;
      // Resolve the authored mask BEFORE drawing. Canvas readback can be perturbed
      // by browser privacy protection, breaking exact RGB matches and leaking white.
      // Unpainted pixels stay transparent; fixed ink/cream are never color-keyed away.
      for (const [x, y, width, height, color] of drawAvatarLayer(appearance.body, name, layerOption(appearance, name), frame)) {
        context.fillStyle = palette[color] ?? `#${color}`;
        context.fillRect(frame % 3 * AVATAR_FRAME + x, Math.floor(frame / 3) * AVATAR_FRAME + y, width, height);
      }
    }
  }
  compositions.set(key, canvas);
  if (compositions.size > 32) compositions.delete(compositions.keys().next().value!);
  return canvas;
}
