export type Direction = "down" | "left" | "right" | "up";
const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]);
export function movement(pressed: ReadonlySet<string>, facing: Direction = "down") {
  const x = Number(pressed.has("KeyD") || pressed.has("ArrowRight")) - Number(pressed.has("KeyA") || pressed.has("ArrowLeft"));
  const y = Number(pressed.has("KeyS") || pressed.has("ArrowDown")) - Number(pressed.has("KeyW") || pressed.has("ArrowUp"));
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length, facing: x ? x < 0 ? "left" as const : "right" as const : y ? y < 0 ? "up" as const : "down" as const : facing };
}
export function attachMovementInput(target: EventTarget, focus: () => boolean, globalEvents: EventTarget) {
  const pressed = new Set<string>();
  const down = (event: Event) => {
    const key = event as KeyboardEvent;
    if (!focus() || key.altKey || key.ctrlKey || key.metaKey || !movementKeys.has(key.code)) return;
    key.preventDefault(); pressed.add(key.code);
  };
  const up = (event: Event) => { pressed.delete((event as KeyboardEvent).code); };
  const clear = () => pressed.clear();
  target.addEventListener("keydown", down);
  target.addEventListener("blur", clear);
  globalEvents.addEventListener("keyup", up);
  globalEvents.addEventListener("blur", clear);
  return { pressed, destroy() { clear(); target.removeEventListener("keydown", down); target.removeEventListener("blur", clear); globalEvents.removeEventListener("keyup", up); globalEvents.removeEventListener("blur", clear); } };
}
