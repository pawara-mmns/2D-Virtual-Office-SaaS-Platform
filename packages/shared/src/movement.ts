import { blocked, PLAYER_SPEED, TILE_SIZE, type OfficeMap } from './map.ts';
import { avatarBody, type AvatarDirection } from './avatars.ts';
export const movementRules = { walkSpeed: PLAYER_SPEED, runMultiplier: 1.6, tickMs: 50, collisionStep: 1 } as const;
export type MovingPosition = { x: number; y: number; direction: AvatarDirection; isMoving: boolean; isRunning?: boolean; motionState?: string; seatId?: string };
export function bodyCorners(x: number, y: number) {
  const left = x - 16 + avatarBody.offsetX, top = y - 16 + avatarBody.offsetY;
  return [[left, top], [left + avatarBody.width - .001, top], [left, top + avatarBody.height - .001], [left + avatarBody.width - .001, top + avatarBody.height - .001]] as const;
}
export function canStand(map: OfficeMap, x: number, y: number) {
  return Number.isFinite(x) && Number.isFinite(y) && bodyCorners(x,y).every(([a,b]) => !blocked(map, Math.floor(a/TILE_SIZE), Math.floor(b/TILE_SIZE)));
}
// Both authoritative ticks and the isolated local preview use this one solver.
// Intent is normalized; clients never supply speed, elapsed time or positions.
export function advanceMovement(map: OfficeMap, p: MovingPosition, input: { x: number; y: number; run?: boolean }, ms = movementRules.tickMs as number) {
  if (p.seatId) { p.isMoving = false; p.isRunning = false; p.motionState = 'SITTING'; return; }
  const length = Math.hypot(input.x, input.y) || 1;
  const speed = movementRules.walkSpeed * (input.run === true ? movementRules.runMultiplier : 1);
  const elapsed = Math.max(0, Math.min(movementRules.tickMs, ms))/1000;
  const dx = input.x/length*speed*elapsed, dy = input.y/length*speed*elapsed;
  const beforeX=p.x,beforeY=p.y,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/movementRules.collisionStep));
  for(let n=0;n<steps;n++) {
    if(canStand(map,p.x+dx/steps,p.y))p.x+=dx/steps;
    if(canStand(map,p.x,p.y+dy/steps))p.y+=dy/steps;
  }
  const x=p.x-beforeX,y=p.y-beforeY;
  p.isMoving=Math.hypot(x,y)>.001;p.isRunning=p.isMoving&&input.run===true;
  p.motionState=p.isMoving?p.isRunning?'RUNNING':'WALKING':'IDLE';
  if(Math.abs(x)>Math.abs(y))p.direction=x<0?'left':'right';else if(y)p.direction=y<0?'up':'down';
}
