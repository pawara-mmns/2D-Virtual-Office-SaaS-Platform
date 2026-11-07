import { schema, t, type SchemaType } from "@colyseus/schema";
export const MovementCommand=schema({x:t.int8().default(0),y:t.int8().default(0),run:t.boolean().default(false),epoch:t.uint32().default(0),revision:t.uint32().default(0)},'MovementCommand');
export const PlayerState = schema({
  sessionId: t.string().default(""), userId: t.string().default(""),
  displayName: t.string().default("Member"), avatarKey: t.string().default("fern"),
  x: t.float32().default(0), y: t.float32().default(0),
  direction: t.string<"down" | "left" | "right" | "up">().default("down"),
  isMoving: t.boolean().default(false), connected: t.boolean().default(true),
  isRunning: t.boolean().default(false), seatId: t.string().default(''),
  motionState: t.string<'IDLE'|'WALKING'|'RUNNING'|'SITTING'|'STANDING'>().default('IDLE'),
  availability: t.string<"AVAILABLE" | "BUSY" | "DO_NOT_DISTURB">().default("AVAILABLE"),
  movementEpoch:t.uint32().default(1),
}, "PlayerState");
export type PlayerState = SchemaType<typeof PlayerState>;
export const OfficeState = schema({ officeId: t.string().default(""), mapVersion: t.string().default(""),movementProtocol:t.uint8().default(1), structureVersion:t.string().default(''),environmentRevision:t.number().default(0),environmentEpoch:t.string().default(''),players: t.map(PlayerState), seats:t.map('string') }, "OfficeState");
export type OfficeState = SchemaType<typeof OfficeState>;
