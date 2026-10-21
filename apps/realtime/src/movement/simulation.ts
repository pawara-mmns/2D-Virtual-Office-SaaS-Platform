import { blocked, PLAYER_SPEED, TILE_SIZE, type OfficeMap } from "../../../../packages/shared/src/map.ts";
import { avatarBody, type AvatarDirection } from "../../../../packages/shared/src/avatars.ts";
import { TICK_MS, type MoveInput } from "../../../../packages/shared/src/protocol.ts";
export type Position = { x: number; y: number; direction: AvatarDirection; isMoving: boolean };
export function canStand(map: OfficeMap, x: number, y: number) {
  const left = x - 16 + avatarBody.offsetX, top = y - 16 + avatarBody.offsetY;
  for (const tx of [Math.floor(left / TILE_SIZE), Math.floor((left + avatarBody.width - 0.001) / TILE_SIZE)])
    for (const ty of [Math.floor(top / TILE_SIZE), Math.floor((top + avatarBody.height - 0.001) / TILE_SIZE)])
      if (blocked(map, tx, ty)) return false;
  return true;
}
export function simulate(map: OfficeMap, position: Position, input: Pick<MoveInput, "x" | "y">) {
  const length = Math.hypot(input.x, input.y) || 1;
  const dx = input.x / length * PLAYER_SPEED * TICK_MS / 1000;
  const dy = input.y / length * PLAYER_SPEED * TICK_MS / 1000;
  const beforeX = position.x, beforeY = position.y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let step = 0; step < steps; step++) {
    if (canStand(map, position.x + dx / steps, position.y)) position.x += dx / steps;
    if (canStand(map, position.x, position.y + dy / steps)) position.y += dy / steps;
  }
  const movedX = position.x - beforeX, movedY = position.y - beforeY;
  position.isMoving = Math.hypot(movedX, movedY) > 0.001;
  if (Math.abs(movedX) > Math.abs(movedY)) position.direction = movedX < 0 ? "left" : "right";
  else if (movedY) position.direction = movedY < 0 ? "up" : "down";
}
