export const avatarPresets = [
  { key: "fern", name: "Fern", description: "Teal overshirt, short chestnut hair", index: 0 },
  { key: "harbor", name: "Harbor", description: "Blue jacket, sandy waves", index: 1 },
  { key: "clay", name: "Clay", description: "Terracotta sweater, dark curls", index: 2 },
  { key: "plum", name: "Plum", description: "Plum cardigan, long dark hair", index: 3 },
  { key: "ochre", name: "Ochre", description: "Mustard shirt, close-cropped hair", index: 4 },
  { key: "slate", name: "Slate", description: "Navy knit, silver hair and glasses", index: 5 },
] as const;
export type AvatarKey = typeof avatarPresets[number]["key"];
export type AvatarAppearance = { avatarKey: AvatarKey; displayName: string };
export const defaultAvatar: AvatarKey = "fern";
export const avatarDirections = ["down", "left", "right", "up"] as const;
export type AvatarDirection = typeof avatarDirections[number];
export const avatarBody = { width: 14, height: 10, offsetX: 9, offsetY: 22 } as const;
export function isAvatarKey(value: unknown): value is AvatarKey { return avatarPresets.some((preset) => preset.key === value); }
export function safeAvatarKey(value: unknown): AvatarKey { return isAvatarKey(value) ? value : defaultAvatar; }
export function avatarBaseFrame(key: AvatarKey) { return avatarPresets.find((preset) => preset.key === key)!.index * 12; }
export function avatarIdleFrame(key: AvatarKey, direction: AvatarDirection) { return avatarBaseFrame(key) + avatarDirections.indexOf(direction) * 3; }
export function avatarAnimationKey(key: AvatarKey, direction: AvatarDirection) { return `avatar-${key}-${direction}-walk`; }
export function avatarDisplayName(value: unknown) {
  if (typeof value !== "string") return "You";
  const normalized = value.normalize("NFKC");
  if (normalized.includes("@")) return "You";
  const cleaned = normalized.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "You";
  const characters = [...cleaned];
  return characters.length > 18 ? characters.slice(0, 17).join("") + "…" : cleaned;
}
