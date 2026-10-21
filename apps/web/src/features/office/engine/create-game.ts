// Imported dynamically inside the client effect. Never import this module from a Server Component.
import Phaser from "phaser";
import { OfficeScene, type OfficeCallbacks } from "../scenes/office-scene.ts";
import { attachMovementInput } from "../input/movement.ts";
import { defaultAvatar, type AvatarAppearance } from "../../avatars/presets.ts";

export function createOfficeGame(host: HTMLElement, callbacks: OfficeCallbacks, appearance: AvatarAppearance = { avatarKey: defaultAvatar, displayName: "You" }) {
  const input = attachMovementInput(host, () => document.activeElement === host, window);
  const focus = () => host.focus({ preventScroll: true });
  host.addEventListener("pointerdown", focus);
  const scene = new OfficeScene(input.pressed, callbacks, appearance);
  let game: Phaser.Game;
  try {
    game = new Phaser.Game({ type: Phaser.AUTO, parent: host, width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight),
      backgroundColor: "#344c48", banner: false, pixelArt: true, roundPixels: true,
      render: { antialias: false, antialiasGL: false, roundPixels: true },
      // ResizeObserver owns the canvas size; avoid a second parent-sizing authority.
      scale: { mode: Phaser.Scale.NONE, autoRound: true, expandParent: false },
      input: { keyboard: false, mouse: false, touch: false, gamepad: false }, audio: { noAudio: true },
      callbacks: { postBoot(booted) {
        booted.canvas.setAttribute("aria-hidden", "true");
        booted.canvas.addEventListener("webglcontextlost", callbacks.onError);
        booted.events.once(Phaser.Core.Events.DESTROY, () => booted.canvas.removeEventListener("webglcontextlost", callbacks.onError));
      } },
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
      fps: { target: 60, min: 30 }, scene: [scene],
    });
  } catch (error) { input.destroy(); host.removeEventListener("pointerdown", focus); throw error; }
  const observer = new ResizeObserver(([entry]) => {
    if (game.isBooted && game.canvas && entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) game.scale.resize(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
  });
  observer.observe(host);
  let destroyed: Promise<void> | undefined;
  return {
    game,
    setAppearance(appearance: AvatarAppearance) { scene.setAppearance(appearance); },
    zoomBy(step: number) { scene.zoomBy(step); }, resetZoom() { scene.resetZoom(); },
    destroy() {
      if (destroyed) return destroyed;
      observer.disconnect(); input.destroy(); host.removeEventListener("pointerdown", focus);
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
