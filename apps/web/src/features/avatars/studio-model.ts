import { decodeCustomization, encodeCustomization, legacyCustomization, type AvatarCustomization, type AvatarPart, type AvatarColorKey } from '../../../../../packages/shared/src/avatar-customization.ts';
import type { AvatarKey } from './presets.ts';

export type StudioDraft = { key: AvatarKey; name: string; custom: boolean; config: AvatarCustomization };
export function studioDraft(key: AvatarKey, name: string, appearance?: string): StudioDraft {
  const config = decodeCustomization(appearance);
  return { key, name, custom: !!config, config: config ?? legacyCustomization(key) };
}
export function studioSignature(draft: StudioDraft): string {
  return JSON.stringify([draft.key, draft.name, draft.custom ? encodeCustomization(draft.config) : null]);
}
export function withAvatarOption(config: AvatarCustomization, part: AvatarPart | AvatarColorKey, value: string): AvatarCustomization {
  return { ...config, [part]: value, ...(part === 'top' ? { bottom: value === 'dress' ? 'none' : config.bottom === 'none' ? 'pants' : config.bottom } : {}) };
}
export const studioLabels: Record<string, string> = {
  tshirt: 'T-shirt', shirt: 'Formal shirt', overear: 'Over-ear', office: 'Badge', body: 'Body style', hair: 'Hairstyle', eyes: 'Eyes', eyebrows: 'Brows', expression: 'Expression',
  formal: 'Formal', casual: 'Casual', skinColor: 'Skin tone', hairColor: 'Hair color', topColor: 'Fabric color', bottomColor: 'Fabric color', shoeColor: 'Shoe color', accessoryColor: 'Accent color',
};
export const studioLabel = (key: string) => studioLabels[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
export type PreviewCrop = { x: number; y: number; width: number; height: number };
export function optionCrop(part: AvatarPart): { crop?: PreviewCrop; size: number } {
  if (part === 'hair' || part === 'hat' || part === 'headphones') return { crop: { x: 6, y: 0, width: 22, height: 19 }, size: 66 };
  if (part === 'eyes' || part === 'eyebrows' || part === 'expression' || part === 'glasses') return { crop: { x: 9, y: 5, width: 16, height: 12 }, size: 64 };
  if (part === 'top' || part === 'office') return { crop: { x: 4, y: 12, width: 24, height: 16 }, size: 72 };
  if (part === 'bottom') return { crop: { x: 6, y: 20, width: 24, height: 12 }, size: 72 };
  if (part === 'shoes') return { crop: { x: 3, y: 24, width: 27, height: 8 }, size: 81 };
  return { size: 64 };
}
