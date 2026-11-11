// Stable v1 IDs are persisted, never atlas coordinates or rendered images.
export const avatarCatalog = {
  body: ['classic', 'slim', 'broad'],
  hair: ['short', 'waves', 'curls', 'long', 'crop', 'bob', 'bun', 'bald'],
  eyes: ['round', 'soft', 'bright'],
  eyebrows: ['natural', 'straight', 'arched'],
  expression: ['calm', 'smile', 'cheerful'],
  top: ['tshirt', 'shirt', 'hoodie', 'jacket', 'dress'],
  bottom: ['pants', 'jeans', 'skirt', 'none'],
  shoes: ['formal', 'sneakers', 'casual'],
  glasses: ['none', 'round', 'square'],
  headphones: ['none', 'overear'],
  hat: ['none', 'cap', 'beanie'],
  office: ['none', 'badge'],
} as const;
export type AvatarPart = keyof typeof avatarCatalog;
export const avatarColorKeys = ['skinColor', 'hairColor', 'topColor', 'bottomColor', 'shoeColor', 'accessoryColor'] as const;
export type AvatarColorKey = typeof avatarColorKeys[number];
export type AvatarCustomization = { version: 1 } & { [K in AvatarPart]: typeof avatarCatalog[K][number] } & Record<AvatarColorKey, string>;
export const defaultCustomization: Readonly<AvatarCustomization> = {
  version: 1, body: 'classic', hair: 'short', eyes: 'round', eyebrows: 'natural', expression: 'calm',
  top: 'shirt', bottom: 'pants', shoes: 'casual', glasses: 'none', headphones: 'none', hat: 'none', office: 'none',
  skinColor: '#d9a47f', hairColor: '#4c3c36', topColor: '#426c6e', bottomColor: '#354c60', shoeColor: '#293b42', accessoryColor: '#cfaf6d',
};
export const avatarSwatches = {
  skinColor: ['#f4d4b7', '#e0b18e', '#d9a47f', '#c18b68', '#a86f51', '#875a43', '#684333', '#482f29'],
  hairColor: ['#302f30', '#4c3c36', '#8e593f', '#bd995d', '#e2d3ad', '#8e9692', '#705467', '#426c6e'],
  topColor: ['#426c6e', '#426a87', '#985b48', '#705467', '#9a7a3c', '#424f65', '#d6c7aa', '#333b46'],
  bottomColor: ['#354c60', '#39434c', '#424850', '#4b4f61', '#45524d', '#756653', '#b8a68c', '#725267'],
  shoeColor: ['#293b42', '#f1e9d7', '#73513d', '#424f65', '#985b48', '#354c60'],
  accessoryColor: ['#cfaf6d', '#293b42', '#426a87', '#705467', '#985b48', '#e2d3ad'],
} as const;
export function parseCustomization(value: unknown): AvatarCustomization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Choose a valid appearance.');
  const input = value as Record<string, unknown>;
  const keys = ['version', ...Object.keys(avatarCatalog), ...avatarColorKeys];
  if (input.version !== 1 || Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key))) throw Error('This appearance version is not supported.');
  for (const [key, values] of Object.entries(avatarCatalog)) if (!(values as readonly unknown[]).includes(input[key])) throw Error('Choose valid avatar options.');
  for (const key of avatarColorKeys) if (typeof input[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(input[key])) throw Error('Use six-digit hex colors.');
  if ((input.top === 'dress') !== (input.bottom === 'none')) throw Error('Dresses require the matching dress silhouette.');
  // Construct in canonical order for stable composition keys and network comparisons.
  return Object.fromEntries(keys.map(key => [key, typeof input[key] === 'string' && avatarColorKeys.includes(key as AvatarColorKey) ? (input[key] as string).toLowerCase() : input[key]])) as AvatarCustomization;
}
export function encodeCustomization(value: unknown): string { return JSON.stringify(parseCustomization(value)); }
export function decodeCustomization(value: unknown): AvatarCustomization | undefined {
  try { return parseCustomization(typeof value === 'string' && value.length <= 2048 ? JSON.parse(value) : value); } catch { return undefined; }
}
export function legacyCustomization(key: string): AvatarCustomization {
  const index = ['fern', 'harbor', 'clay', 'plum', 'ochre', 'slate'].indexOf(key);
  const palettes = [
    ['#d9a47f', '#4c3c36', '#426c6e', '#354c60', 'short'], ['#a86f51', '#bd995d', '#426a87', '#39434c', 'waves'],
    ['#875a43', '#302f30', '#985b48', '#424850', 'curls'], ['#e0b18e', '#343236', '#705467', '#4b4f61', 'long'],
    ['#9d6b4d', '#393332', '#9a7a3c', '#45524d', 'crop'], ['#c18b68', '#8e9692', '#424f65', '#454f4d', 'short'],
  ][Math.max(0, index)]!;
  return { ...defaultCustomization, skinColor: palettes[0]!, hairColor: palettes[1]!, topColor: palettes[2]!, bottomColor: palettes[3]!, hair: palettes[4] as AvatarCustomization['hair'], glasses: index === 5 ? 'square' : 'none' };
}
export function randomCustomization(random = Math.random): AvatarCustomization {
  const pick = <T>(values: readonly T[]): T => values[Math.min(values.length - 1, Math.floor(random() * values.length))]!;
  const parts = Object.fromEntries(Object.entries(avatarCatalog).map(([key, values]) => [key, pick(values)]));
  const colors = Object.fromEntries(avatarColorKeys.map(key => [key, pick(avatarSwatches[key])]));
  return parseCustomization({ ...defaultCustomization, ...parts, ...colors, bottom: parts.top === 'dress' ? 'none' : pick(['pants', 'jeans', 'skirt']) });
}
