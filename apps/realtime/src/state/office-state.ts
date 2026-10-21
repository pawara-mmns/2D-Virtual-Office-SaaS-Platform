import { schema, t, type SchemaType } from "@colyseus/schema";
export const PlayerState = schema({
  sessionId: t.string().default(""), userId: t.string().default(""),
  displayName: t.string().default("Member"), avatarKey: t.string().default("fern"),
  x: t.float32().default(0), y: t.float32().default(0),
  direction: t.string<"down" | "left" | "right" | "up">().default("down"),
  isMoving: t.boolean().default(false), connected: t.boolean().default(true),
  availability: t.string<"AVAILABLE" | "BUSY" | "DO_NOT_DISTURB">().default("AVAILABLE"),
}, "PlayerState");
export type PlayerState = SchemaType<typeof PlayerState>;
export const OfficeState = schema({ officeId: t.string().default(""), mapVersion: t.string().default(""), players: t.map(PlayerState) }, "OfficeState");
export type OfficeState = SchemaType<typeof OfficeState>;
