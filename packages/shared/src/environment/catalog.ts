export const layouts = [
  { id: "open-office", name: "Open Office", description: "Open work neighborhoods around a shared meeting room." },
  { id: "corporate-hq", name: "Corporate HQ", description: "Distinct departments, reception and private meeting space." },
  { id: "startup-office", name: "Startup Office", description: "A social work floor with coffee and collaboration nearby." },
  { id: "coworking-space", name: "Co-working Space", description: "Independent work, shared amenities and a welcoming lounge." },
  { id: "training-hub", name: "Training Hub", description: "Learning tables and whiteboards, with breakout and meeting rooms." },
] as const;
export const themes = [
  { id: "warm-wood", name: "Warm Wood Corporate", description: "Oak, warm cream and ink-blue upholstery.", floor: "b38e72", wood: "c29362", wall: "f1dfc9", fabric: "405874", background: "1c3036" },
  { id: "minimal-light", name: "Modern Minimal Light", description: "Pale stone, white cabinetry and graphite seating.", floor: "c5cbcf", wood: "b8aa99", wall: "f3f6f7", fabric: "465466", background: "34434e" },
  { id: "scandinavian", name: "Scandinavian Neutral", description: "Bleached timber, linen and soft sage.", floor: "cfbfa3", wood: "c1a681", wall: "f0ebdf", fabric: "637c70", background: "354642" },
  { id: "dark-tech", name: "Dark Tech Office", description: "Charcoal timber, slate walls and blue seating.", floor: "505865", wood: "707986", wall: "85909f", fabric: "577fa4", background: "242d3a" },
  { id: "eco-green", name: "Eco Green Office", description: "Natural wood, leafy greens and warm off-white walls.", floor: "acac83", wood: "b99a65", wall: "e5ebda", fabric: "456f5c", background: "233d34" },
] as const;
export const decorPacks = [
  { id: "minimal", name: "Minimal", description: "Essential plants, storage and clear circulation.", density: 0 },
  { id: "balanced", name: "Balanced", description: "Plants, reading shelves, lamps and notice boards.", density: 1 },
  { id: "rich", name: "Rich", description: "Layered greenery, extra storage and small office details.", density: 2 },
] as const;
export const furnitureSets = [
  { id: "standard", name: "Standard", description: "Individual desks and practical shared seating." },
  { id: "executive", name: "Executive", description: "Spacious desk arrangements, lounge chairs and extra storage." },
  { id: "collaborative", name: "Collaborative", description: "Grouped workstations and more shared seating." },
] as const;
export const accents = [
  { id: "ocean", name: "Ocean", color: "527caa" }, { id: "forest", name: "Forest", color: "4c805e" },
  { id: "clay", name: "Clay", color: "b87758" }, { id: "plum", name: "Plum", color: "8d6696" },
  { id: "gold", name: "Gold", color: "bb9446" }, { id: "teal", name: "Teal", color: "438d8d" },
  { id: "rose", name: "Rose", color: "b56b80" }, { id: "slate", name: "Slate", color: "6c7c90" },
] as const;
export const rugs = [{ id: "none", name: "Bare floor" }, { id: "runner", name: "Woven runner" }, { id: "grid", name: "Geometric rug" }] as const;
export const planters = [{ id: "terracotta", name: "Terracotta" }, { id: "ceramic", name: "Ceramic" }] as const;
export type EnvironmentConfig = {
  version: 1; layout: typeof layouts[number]["id"]; theme: typeof themes[number]["id"];
  decor: typeof decorPacks[number]["id"]; furniture: typeof furnitureSets[number]["id"];
  overrides: { accent: typeof accents[number]["id"]; rug: typeof rugs[number]["id"]; planter: typeof planters[number]["id"]; branding: string };
};
export const defaultEnvironment: EnvironmentConfig = { version: 1, layout: "open-office", theme: "warm-wood", decor: "balanced", furniture: "standard", overrides: { accent: "ocean", rug: "runner", planter: "terracotta", branding: "YOUR TEAM" } };
export const environmentCombinations = layouts.length * themes.length * decorPacks.length * furnitureSets.length * accents.length * rugs.length * planters.length;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const has = (list: readonly { id: string }[], value: unknown) => list.some(item => item.id === value);
// Canonical key ordering is shared by browser, preview and authoritative server.
// Unknown IDs/versions/keys fail closed; never accept asset URLs, HTML or geometry.
export function parseEnvironment(value: unknown): EnvironmentConfig {
  if (!record(value) || Object.keys(value).sort().join() !== "decor,furniture,layout,overrides,theme,version" || value.version !== 1 || !has(layouts,value.layout) || !has(themes,value.theme) || !has(decorPacks,value.decor) || !has(furnitureSets,value.furniture) || !record(value.overrides)) throw new Error("Choose a supported office configuration.");
  const o = value.overrides;
  if (Object.keys(o).sort().join() !== "accent,branding,planter,rug" || !has(accents,o.accent) || !has(rugs,o.rug) || !has(planters,o.planter) || typeof o.branding !== "string" || o.branding !== o.branding.trim() || Array.from(o.branding).length > 32 || /[\u0000-\u001f\u007f<>]/u.test(o.branding)) throw new Error("Check the office accent, rug, planters and company sign (up to 32 characters).");
  return { version: 1, layout: value.layout, theme: value.theme, decor: value.decor, furniture: value.furniture, overrides: { accent: o.accent, rug: o.rug, planter: o.planter, branding: o.branding } } as EnvironmentConfig;
}
