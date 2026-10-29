import type { AvatarAppearance } from "../../avatars/presets.ts";
import type { OfficeNetwork } from "../../../../../../packages/shared/src/protocol.ts";
import type { CameraCommand } from "./camera.ts";
export type OfficeController = { destroy(): Promise<void>; zoomBy(step: number): void; resetZoom(): void; navigate?(command: CameraCommand): boolean; setAppearance?(appearance: AvatarAppearance): void; setNetwork?(network: OfficeNetwork): void };
// Serialize cleanup across rapid route changes and React Strict Mode remounts.
export function createOfficeLifecycle() {
  let tail: Promise<unknown> = Promise.resolve();
  return function mount(load: () => Promise<() => OfficeController>, onError: () => void) {
    let cancelled = false;
    let controller: OfficeController | undefined;
    const ready = tail.then(async () => {
      const create = await load();
      if (!cancelled) controller = create();
    }).catch(() => { if (!cancelled) onError(); });
    tail = ready;
    return {
      zoomBy(step: number) { if (!cancelled) controller?.zoomBy(step); },
      resetZoom() { if (!cancelled) controller?.resetZoom(); },
      navigate(command: CameraCommand) { return !cancelled && (controller?.navigate?.(command) ?? false); },
      setAppearance(appearance: AvatarAppearance) { if (!cancelled) controller?.setAppearance?.(appearance); },
      setNetwork(network: OfficeNetwork) { if (!cancelled) controller?.setNetwork?.(network); },
      dispose() {
        cancelled = true;
        const closed = ready.then(async () => { await controller?.destroy(); controller = undefined; });
        tail = closed.catch(() => {});
        return closed;
      },
    };
  };
}
export const mountOffice = createOfficeLifecycle();
