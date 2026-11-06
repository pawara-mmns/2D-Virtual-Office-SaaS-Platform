import type { EnvironmentConfig } from "../../../../../../packages/shared/src/environment/catalog.ts";
// Imported dynamically inside the client effect. Never import this module from a Server Component.
import Phaser from "phaser";
import { OfficeScene, type OfficeCallbacks } from "../scenes/office-scene.ts";
import { attachMovementInput } from "../input/movement.ts";
import { attachWheelZoom } from "../input/wheel-zoom.ts";
import { defaultAvatar, type AvatarAppearance } from "../../avatars/presets.ts";
import type { OfficeNetwork } from "../../../../../../packages/shared/src/protocol.ts";
import type { CameraCommand } from "./camera.ts";
import { softwareRenderer } from "./renderer-effects.ts";
import type {PublishedDecoration} from '../../../../../../packages/shared/src/environment/decoration.ts';
import type {EditorView} from '../../decoration/overlay.ts';

export function createOfficeGame(host: HTMLElement, callbacks: OfficeCallbacks, appearance: AvatarAppearance = { avatarKey: defaultAvatar, displayName: "You" }, multiplayer = false, officeId?: string, environment?: EnvironmentConfig,decoration?:PublishedDecoration) {
  const input = attachMovementInput(host, () => document.activeElement === host&&!scene.isEditing(), window,()=>scene.interact());
  const focus = () => host.focus({ preventScroll: true });
  host.addEventListener("pointerdown", focus);
  const scene = new OfficeScene(input.pressed, callbacks, appearance, multiplayer, officeId, environment,decoration);
  const coordinates=(event:{clientX:number;clientY:number})=>{const rect=host.getBoundingClientRect();return{x:(event.clientX-rect.left)*scene.scale.width/rect.width,y:(event.clientY-rect.top)*scene.scale.height/rect.height};};
  const pointer=(event:PointerEvent)=>{
    if(!scene.isEditing())return;event.preventDefault();
    if(event.type==='pointerdown')host.setPointerCapture(event.pointerId);
    const p=coordinates(event),type=event.type==='pointerdown'?'down':event.type==='pointermove'?'move':event.type==='pointerup'?'up':'cancel';scene.editorPointer(type,p.x,p.y);
    if((type==='up'||type==='cancel')&&host.hasPointerCapture(event.pointerId))host.releasePointerCapture(event.pointerId);
  };
  const dragover=(event:DragEvent)=>{if(scene.isEditing())event.preventDefault();};
  const drop=(event:DragEvent)=>{if(!scene.isEditing())return;event.preventDefault();const p=coordinates(event);scene.editorDrop(event.dataTransfer?.getData('application/x-office-asset')??'',p.x,p.y);};
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel'] as const)host.addEventListener(type,pointer);
  host.addEventListener('dragover',dragover);host.addEventListener('drop',drop);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const updateMotion = () => scene.setReducedMotion(motion.matches);
  updateMotion();
  let game: Phaser.Game;
  try {
    game = new Phaser.Game({ type: Phaser.AUTO, parent: host, width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight),
      backgroundColor: "#344c48", banner: false, pixelArt: true, roundPixels: true,
      render: { antialias: false, antialiasGL: false, roundPixels: true },
      // ResizeObserver owns the canvas size; avoid a second parent-sizing authority.
      scale: { mode: Phaser.Scale.NONE, autoRound: true, expandParent: false },
      input: { keyboard: false, mouse: false, touch: false, gamepad: false }, audio: { noAudio: true },
      callbacks: { postBoot(booted) {
        let reducedEffects = booted.renderer.type !== Phaser.WEBGL;
        if ("gl" in booted.renderer) {
          try {
            const gl = booted.renderer.gl, extension = gl.getExtension("WEBGL_debug_renderer_info");
            reducedEffects ||= !!extension && softwareRenderer(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL));
          } catch { /* Unavailable renderer details never prevent office entry. */ }
        }
        callbacks.onReducedEffects?.(reducedEffects);
        booted.canvas.setAttribute("aria-hidden", "true");
        booted.canvas.addEventListener("webglcontextlost", callbacks.onError);
        booted.events.once(Phaser.Core.Events.DESTROY, () => booted.canvas.removeEventListener("webglcontextlost", callbacks.onError));
      } },
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
      fps: { target: 60, min: 30 }, scene: [scene],
    });
  } catch (error) { input.destroy(); host.removeEventListener("pointerdown", focus); throw error; }
  motion.addEventListener("change", updateMotion);
  const removeWheel = attachWheelZoom(host, (pixels) => scene.zoomWheel(pixels));
  const observer = new ResizeObserver(([entry]) => {
    if (game.isBooted && game.canvas && entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) game.scale.resize(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
  });
  observer.observe(host);
  let destroyed: Promise<void> | undefined;
  return {
    game,
    setAppearance(appearance: AvatarAppearance) { scene.setAppearance(appearance); },
    setNetwork(network: OfficeNetwork) { scene.setNetwork(network); },
    setEditor(view:EditorView|null){input.pressed.clear();scene.setEditor(view);},
    interact(){const result=scene.interact();input.pressed.clear();return result;},
    setTouchMove(code:string,active:boolean){if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','TouchRun'].includes(code))return;if(active)input.pressed.add(code);else input.pressed.delete(code);},
    zoomBy(step: number) { scene.zoomBy(step); }, resetZoom() { scene.resetZoom(); },
    navigate(command: CameraCommand) { return scene.navigate(command); },
    destroy() {
      if (destroyed) return destroyed;
      observer.disconnect(); input.destroy(); removeWheel(); host.removeEventListener("pointerdown", focus); motion.removeEventListener("change", updateMotion);
      for(const type of ['pointerdown','pointermove','pointerup','pointercancel'] as const)host.removeEventListener(type,pointer);
      host.removeEventListener('dragover',dragover);host.removeEventListener('drop',drop);
      destroyed = new Promise<void>((resolve) => {
        game.events.once(Phaser.Core.Events.DESTROY, resolve);
        game.destroy(true, false);
        // Phaser destroys on the next frame. Wake a sleeping loop without using private APIs.
        if (game.isRunning) game.loop.wake();
      });
      return destroyed;
    },
  };
}
