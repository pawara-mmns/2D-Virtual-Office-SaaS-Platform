export type Direction = "down" | "left" | "right" | "up";
const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",'ShiftLeft','ShiftRight']);
export const runningIntent=(pressed:ReadonlySet<string>)=>pressed.has('ShiftLeft')||pressed.has('ShiftRight')||pressed.has('TouchRun');
export type Movement = { x: number; y: number; facing: Direction };
export function movement(pressed: ReadonlySet<string>, facing: Direction = "down", result: Movement = { x: 0, y: 0, facing }) {
  const x = Number(pressed.has("KeyD") || pressed.has("ArrowRight")) - Number(pressed.has("KeyA") || pressed.has("ArrowLeft"));
  const y = Number(pressed.has("KeyS") || pressed.has("ArrowDown")) - Number(pressed.has("KeyW") || pressed.has("ArrowUp"));
  const length = Math.hypot(x, y) || 1;
  const horizontal: Direction = x < 0 ? "left" : "right";
  const vertical: Direction = y < 0 ? "up" : "down";
  // Keep a valid facing axis during diagonals instead of snapping to horizontal.
  result.facing = x && y ? facing === horizontal || facing === vertical ? facing : horizontal : x ? horizontal : y ? vertical : facing;
  result.x = x / length; result.y = y / length;
  return result;
}
export function attachMovementInput(target: EventTarget, focus: () => boolean, globalEvents: EventTarget, interact?:()=>void, onMovementInput?:()=>void) {
  const pressed = new Set<string>();
  const down = (event: Event) => {
    const key = event as KeyboardEvent;
    if(focus()&&key.code==='KeyE'&&!key.altKey&&!key.ctrlKey&&!key.metaKey){key.preventDefault();if(!key.repeat){interact?.();pressed.clear();}return;}
    if (!focus() || key.altKey || key.ctrlKey || key.metaKey || !movementKeys.has(key.code)) return;
    key.preventDefault(); if(!key.repeat&&!pressed.has(key.code)&&!key.code.startsWith('Shift'))onMovementInput?.(); pressed.add(key.code);
  };
  const up = (event: Event) => { pressed.delete((event as KeyboardEvent).code); };
  const clear = () => pressed.clear();
  target.addEventListener("keydown", down);
  target.addEventListener("blur", clear);
  globalEvents.addEventListener("keyup", up);
  globalEvents.addEventListener("blur", clear);
  return { pressed, destroy() { clear(); target.removeEventListener("keydown", down); target.removeEventListener("blur", clear); globalEvents.removeEventListener("keyup", up); globalEvents.removeEventListener("blur", clear); } };
}
