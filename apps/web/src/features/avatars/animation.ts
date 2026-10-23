import type { AvatarDirection } from "./presets.ts";

export function avatarIsWalking(requestedX: number, requestedY: number, actualX: number, actualY: number) {
  return !!(requestedX || requestedY) && Math.abs(actualX) + Math.abs(actualY) > .001;
}
export function animationDirection(facing: AvatarDirection, requestedX: number, requestedY: number, actualX: number, actualY: number): AvatarDirection {
  // At a diagonal wall slide, face the axis that actually moved.
  if (requestedX && requestedY) {
    if (Math.abs(actualX) < .001 && Math.abs(actualY) > .001) return actualY < 0 ? "up" : "down";
    if (Math.abs(actualY) < .001 && Math.abs(actualX) > .001) return actualX < 0 ? "left" : "right";
  }
  return facing;
}
