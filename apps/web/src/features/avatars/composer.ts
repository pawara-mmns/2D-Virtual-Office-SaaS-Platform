import { appearanceLayers, atlasRow, layerColor, layerOption, AVATAR_ATLAS_WIDTH, AVATAR_ATLAS_HEIGHT, AVATAR_FRAMES } from '../../../../../packages/shared/src/avatar-art.ts';
import { encodeCustomization, type AvatarCustomization } from '../../../../../packages/shared/src/avatar-customization.ts';

let atlasPromise: Promise<HTMLImageElement> | undefined;
export function loadAvatarAtlas() {
  return atlasPromise ??= new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => { atlasPromise = undefined; reject(Error('Avatar artwork could not load. Please retry.')); };
    image.src = '/office/avatar-layers.png';
  });
}
// Bounded shared, immutable compositions; editor and Phaser use identical pixels.
const compositions = new Map<string, HTMLCanvasElement>();
export function composeAvatar(appearance: AvatarCustomization, atlas: CanvasImageSource): HTMLCanvasElement {
  const key = encodeCustomization(appearance);
  const cached = compositions.get(key);
  if (cached) { compositions.delete(key); compositions.set(key, cached); return cached; }
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 256;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const layer = document.createElement('canvas'); layer.width = 32; layer.height = 32;
  const paint = layer.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingEnabled = paint.imageSmoothingEnabled = false;
  for (let frame = 0; frame < AVATAR_FRAMES; frame++) {
    for (const name of appearanceLayers(appearance, Math.floor(frame % 12 / 3))) {
      const row = atlasRow(appearance.body, name, layerOption(appearance, name));
      paint.clearRect(0, 0, 32, 32);
      paint.drawImage(atlas, frame * 32, row * 32, 32, 32, 0, 0, 32, 32);
      const image = paint.getImageData(0, 0, 32, 32), color = layerColor(appearance, name);
      const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
      for (let i = 0; i < image.data.length; i += 4) {
        // Neutral primary/light/shade masks; fixed ink and cream remain legible.
        if (!image.data[i + 3] || image.data[i] !== image.data[i + 1] || image.data[i] !== image.data[i + 2]) continue;
        const tone = image.data[i]!;
        for (let channel = 0; channel < 3; channel++) image.data[i + channel] = Math.round(tone === 221 ? rgb[channel]! + (255 - rgb[channel]!) * .25 : rgb[channel]! * (tone === 153 ? .7 : 1));
      }
      paint.putImageData(image, 0, 0);
      context.drawImage(layer, frame % 3 * 32, Math.floor(frame / 3) * 32);
    }
  }
  compositions.set(key, canvas);
  if (compositions.size > 32) compositions.delete(compositions.keys().next().value!);
  return canvas;
}
export const avatarAtlasSize = { width: AVATAR_ATLAS_WIDTH, height: AVATAR_ATLAS_HEIGHT };
