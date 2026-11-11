import { avatarCatalog, type AvatarCustomization, type AvatarPart } from './avatar-customization.ts';

// Original integer-pixel templates. Every layer uses the SAME animated skeleton.
// Columns 0..11: cardinal idle/steps. Columns 12..23: authored cardinal seats.
export const AVATAR_FRAME = 32;
export const AVATAR_FRAMES = 24;
export const avatarLayers = ['body', 'bottom', 'shoes', 'top', 'hairBack', 'eyes', 'eyebrows', 'expression', 'hair', 'office', 'hat', 'glasses', 'headphones'] as const;
export type AvatarLayer = typeof avatarLayers[number];
export const artColors = { main: 'ffffff', light: 'dddddd', shade: '999999', ink: '29333f', cream: 'f1e9d7' } as const;
export type PixelRect = [x: number, y: number, width: number, height: number, color: string];
const partFor = (layer: AvatarLayer): AvatarPart => layer === 'hairBack' ? 'hair' : layer;
export const avatarAtlasEntries = avatarCatalog.body.flatMap(body => avatarLayers.flatMap(layer => (avatarCatalog[partFor(layer)] as readonly string[]).filter(option => layer !== 'body' || option === body).map(option => ({ body, layer, option }))));
export const AVATAR_ATLAS_WIDTH = AVATAR_FRAME * AVATAR_FRAMES;
export const AVATAR_ATLAS_HEIGHT = AVATAR_FRAME * avatarAtlasEntries.length;
export function atlasRow(body: string, layer: AvatarLayer, option: string) {
  return avatarAtlasEntries.findIndex(entry => entry.body === body && entry.layer === layer && entry.option === option);
}
export function appearanceLayers(appearance: AvatarCustomization, direction: number): AvatarLayer[] {
  const layers: AvatarLayer[] = ['body', 'bottom', 'shoes', 'top'];
  // Long back hair covers the rear collar; it is behind the face facing south.
  if (direction !== 3) layers.unshift('hairBack');
  layers.push('eyes', 'eyebrows', 'expression', 'hair');
  if (direction === 3) layers.push('hairBack');
  layers.push('office', 'hat', 'glasses', 'headphones');
  return layers.filter(layer => !(appearance.top === 'dress' && layer === 'bottom'));
}
export function layerColor(appearance: AvatarCustomization, layer: AvatarLayer): string {
  if (layer === 'body' || layer === 'expression') return appearance.skinColor;
  if (layer === 'hair' || layer === 'hairBack' || layer === 'eyebrows') return appearance.hairColor;
  if (layer === 'top') return appearance.topColor;
  if (layer === 'bottom') return appearance.bottomColor;
  if (layer === 'shoes') return appearance.shoeColor;
  return appearance.accessoryColor;
}
export function layerOption(appearance: AvatarCustomization, layer: AvatarLayer) { return appearance[partFor(layer)]; }

export function drawAvatarLayer(body: string, layer: AvatarLayer, option: string, frame: number): PixelRect[] {
  const pixels: PixelRect[] = [];
  const { main, light, shade, ink, cream } = artColors;
  const p = (x: number, y: number, w: number, h: number, c: string = main) => { if (w > 0 && h > 0) pixels.push([x, y, w, h, c]); };
  const seated = frame >= 12, direction = Math.floor(frame % 12 / 3), step = seated ? 0 : frame % 3 === 1 ? -1 : frame % 3 === 2 ? 1 : 0;
  const side = direction === 1 || direction === 2, back = direction === 3;
  const width = side ? 10 : body === 'slim' ? 11 : body === 'broad' ? 15 : 13;
  const left = Math.floor((33 - width) / 2), right = left + width;
  const bob = !seated && step !== 0 ? -1 : 0;
  const headY = 4 + bob, torsoY = 14 + bob;
  const hand = (color: string = main) => { p(left - 3, torsoY + 6 + step, 3, 4, color); p(right, torsoY + 6 - step, 3, 4, color); };
  const legs = (color: string = main, shoe = false) => {
    if (!seated) { p(11, (shoe ? 26 : 22) + step, shoe ? 6 : 5, shoe ? 3 : 5, color); p(18, (shoe ? 26 : 22) - step, shoe ? 6 : 5, shoe ? 3 : 5, color); }
    else if (direction === 0) { p(shoe ? 9 : 10, shoe ? 26 : 22, shoe ? 7 : 6, shoe ? 3 : 4, color); p(18, shoe ? 26 : 22, shoe ? 7 : 6, shoe ? 3 : 4, color); }
    else if (back) { p(11, shoe ? 25 : 21, 5, shoe ? 2 : 4, color); p(18, shoe ? 25 : 21, 5, shoe ? 2 : 4, color); }
    else if (direction === 1) { if (!shoe) { p(6, 22, 14, 4, color); p(6, 24, 4, 4, color); } else { p(3, 27, 8, 2, color); p(10, 25, 5, 3, color); } }
    else { if (!shoe) { p(14, 22, 13, 4, color); p(24, 24, 4, 4, color); } else { p(24, 27, 7, 2, color); p(18, 25, 6, 3, color); } }
  };
  if (option === 'none' || option === 'bald') return pixels;
  if (layer === 'body') {
    legs(); p(left, torsoY, width, 10); hand();
    p(11, headY, 12, 11); p(12, headY + 9, 10, 2, shade); p(15, headY + 10, 4, 3);
    p(direction === 2 ? 23 : 10, headY + 5, 2, 3);
  } else if (layer === 'bottom') {
    if (option === 'skirt') { p(left, 21, width, seated ? 4 : 5); p(left + 2, 22, 1, 3, light); p(right - 3, 22, 1, 3, shade); }
    else { legs(); p(left, 21, width, 3); if (option === 'jeans') { p(12, 23 + step, 1, 3, light); p(19, 23 - step, 1, 3, light); p(left + 1, 21, width - 2, 1, shade); } }
  } else if (layer === 'shoes') {
    legs(main, true);
    if (option === 'sneakers') { if (!seated || direction === 0) { p(seated ? 9 : 11, 28 + step, seated ? 7 : 6, 1, cream); p(18, 28 - step, seated ? 7 : 6, 1, cream); p(13, 26 + step, 2, 1, cream); p(20, 26 - step, 2, 1, cream); } else { p(direction === 1 ? 3 : back ? 11 : 24, back ? 26 : 28, back ? 5 : 7, 1, cream); } }
    if (option === 'formal') { p(12, seated ? 26 : 26 + step, 2, 1, light); }
    if (option === 'casual') p(19, seated ? 26 : 26 - step, 3, 1, shade);
  } else if (layer === 'top') {
    p(left, torsoY, width, 10); p(left + 2, torsoY + 1, width - 4, 7, light);
    p(left - 3, torsoY + 1 + step, 3, option === 'tshirt' || option === 'dress' ? 4 : 8);
    p(right, torsoY + 1 - step, 3, option === 'tshirt' || option === 'dress' ? 4 : 8);
    p(left, torsoY + 9, width, 1, shade);
    if (option === 'shirt' || option === 'jacket') { p(16, torsoY + 1, 1, 8, shade); if (!back) { p(14, torsoY, 2, 2, cream); p(17, torsoY, 2, 2, cream); p(17, torsoY + 4, 1, 1, ink); } }
    if (option === 'jacket' && !back) { p(14, torsoY + 3, 5, 6, ink); p(left + 1, torsoY + 6, 2, 1, cream); }
    if (option === 'hoodie') { p(13, torsoY - 1, 8, 3, shade); if (!back) { p(14, torsoY + 2, 1, 3, cream); p(19, torsoY + 2, 1, 3, cream); p(14, torsoY + 7, 6, 2, shade); } }
    if (option === 'dress') { p(left - 1, 21, width + 2, seated ? 4 : 6); p(left + 2, 23, width - 4, seated ? 2 : 4, light); p(left, 20, width, 1, shade); }
  } else if (layer === 'hairBack') {
    if (option === 'long' || option === 'bob') { p(9, headY + 2, 16, option === 'long' ? 17 : 11); p(10, headY + 5, 2, option === 'long' ? 13 : 7, light); }
    if (option === 'bun' && back) { p(12, headY + 2, 10, 9); p(14, headY - 3, 6, 5, shade); }
  } else if (layer === 'hair') {
    p(10, headY - 1, 14, option === 'crop' ? 3 : 5); p(12, headY - 2, 10, 2, light);
    if (back) { p(11, headY + 3, 12, 7); p(12, headY + 3, 2, 6, light); }
    else if (side) p(direction === 1 ? 21 : 10, headY + 2, 3, 7);
    if (option === 'waves') { p(9, headY + 1, 3, 5); p(15, headY + 2, 5, 2); p(21, headY, 4, 3, light); }
    if (option === 'curls') for (const [x, y] of [[9, 0], [13, -3], [18, -2], [22, 0]] as const) { p(x, headY + y, 4, 4); p(x + 1, headY + y, 2, 1, light); }
    if ((option === 'long' || option === 'bob') && !back) { p(9, headY + 2, 3, option === 'long' ? 15 : 9); p(22, headY + 2, 3, option === 'long' ? 15 : 9); }
    if (option === 'bun') p(14, headY - 3, 6, 3);
  } else if (layer === 'eyes' && !back) {
    for (const x of side ? [direction === 1 ? 12 : 21] : [13, 20]) { p(x, headY + 5, 2, option === 'soft' ? 1 : 2, ink); if (option === 'bright') p(x, headY + 5, 1, 1, cream); }
  } else if (layer === 'eyebrows' && !back) {
    for (const x of side ? [direction === 1 ? 12 : 20] : [12, 20]) { p(x, headY + 3, 3, 1); if (option === 'arched') p(x + 1, headY + 2, 2, 1); if (option === 'natural') p(x, headY + 3, 1, 1, shade); }
  } else if (layer === 'expression' && !back) {
    const x = side ? direction === 1 ? 11 : 22 : 16;
    p(x, headY + 9, side ? 2 : 3, 1, shade);
    if (option === 'smile') p(x + 1, headY + 10, side ? 1 : 2, 1, ink);
    if (option === 'cheerful') { p(x, headY + 9, side ? 2 : 3, 2, ink); p(x, headY + 9, side ? 1 : 3, 1, cream); }
  } else if (layer === 'glasses' && !back) {
    for (const x of side ? [direction === 1 ? 10 : 20] : [11, 18]) { p(x, headY + 4, 6, 4, ink); p(x + 1, headY + 5, 4, option === 'round' ? 2 : 1, light); }
    if (!side) p(17, headY + 5, 1, 1, ink);
  } else if (layer === 'headphones') {
    p(9, headY - 2, 16, 2, ink); p(8, headY, 2, 9, ink); p(24, headY, 2, 9, ink);
    p(8, headY + 5, 3, 5); p(23, headY + 5, 3, 5); p(9, headY + 6, 1, 3, light);
  } else if (layer === 'hat') {
    p(10, headY - 2, 14, 5); p(12, headY - 3, 10, 2, light);
    if (option === 'beanie') { p(9, headY + 1, 16, 2, shade); p(15, headY - 3, 4, 2); }
    else p(direction === 1 ? 6 : direction === 2 ? 21 : 9, headY + 2, side ? 7 : 16, 2, shade);
  } else if (layer === 'office' && !back) {
    p(14, torsoY, 1, 5, ink); p(19, torsoY, 1, 5, ink); p(15, torsoY + 5, 5, 4, cream); p(16, torsoY + 6, 3, 1); p(16, torsoY + 8, 2, 1, ink);
  }
  return pixels;
}
