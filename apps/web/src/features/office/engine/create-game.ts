// Imported dynamically inside the client effect. Never import this module from a Server Component.
import Phaser from "phaser";
import { OfficeScene, type OfficeCallbacks } from "../scenes/office-scene.ts";
import { attachMovementInput } from "../input/movement.ts";
import { attachWheelZoom } from "../input/wheel-zoom.ts";
import { defaultAvatar, type AvatarAppearance } from "../../avatars/presets.ts";
import type { OfficeNetwork } from "../../../../../../packages/shared/src/protocol.ts";
import type { CameraCommand } from "./camera.ts";
import { softwareRenderer } from "./renderer-effects.ts";

export function createOfficeGame(host: HTMLElement, callbacks: OfficeCallbacks, appearance: AvatarAppearance = { avatarKey: defaultAvatar, displayName: "You" }, multiplayer = false, officeId?: string) {
  const input = attachMovementInput(host, () => document.activeElement === host, window);
  const focus = () => host.focus({ preventScroll: true });
  host.addEventListener("pointerdown", focus);
  const scene = new OfficeScene(input.pressed, callbacks, appearance, multiplayer, officeId);
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
    zoomBy(step: number) { scene.zoomBy(step); }, resetZoom() { scene.resetZoom(); },
    navigate(command: CameraCommand) { return scene.navigate(command); },
    destroy() {
      if (destroyed) return destroyed;
      observer.disconnect(); input.destroy(); removeWheel(); host.removeEventListener("pointerdown", focus); motion.removeEventListener("change", updateMotion);
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
