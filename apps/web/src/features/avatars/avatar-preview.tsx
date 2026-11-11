"use client";
import { useEffect, useRef, useState } from 'react';
import { avatarIdleFrame, safeAvatarKey, avatarDirections, type AvatarDirection, type AvatarKey } from './presets';
import { decodeCustomization } from '../../../../../packages/shared/src/avatar-customization';
import { composeAvatar, loadAvatarAtlas } from './composer';
import type { PreviewCrop } from './studio-model';
let legacyImage: Promise<HTMLImageElement> | undefined;
function loadLegacy() {
  return legacyImage ??= new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => { legacyImage = undefined; reject(Error('Avatar preview unavailable.')); }; image.src = '/office/avatar.png';
  });
}
export function AvatarPreview({ appearance, avatarKey = 'fern', direction = 'down', motion = 'idle', size = 96, crop, decorative = false }: { appearance?: string; avatarKey?: AvatarKey; direction?: AvatarDirection; motion?: 'idle' | 'walking' | 'running' | 'sitting'; size?: number; crop?: PreviewCrop; decorative?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const { x = 0, y = 0, width = 32, height = 32 } = crop ?? {};
  useEffect(() => {
    let disposed = false, animation = 0;
    const config = decodeCustomization(appearance);
    const source = config ? loadAvatarAtlas().then(atlas => composeAvatar(config, atlas)) : loadLegacy();
    void source.then(sheet => {
      if (disposed || !canvas.current) return;
      setError('');
      const context = canvas.current.getContext('2d')!; context.imageSmoothingEnabled = false;
      const draw = (time: number) => {
        const walking = motion === 'walking' || motion === 'running';
        const step = walking ? [0, 1, 0, 2][Math.floor(time / (motion === 'running' ? 90 : 143)) % 4]! : 0;
        const frame = config ? avatarDirections.indexOf(direction) * 3 + (motion === 'sitting' ? 12 : step) : avatarIdleFrame(safeAvatarKey(avatarKey), direction) + (motion === 'sitting' ? 72 : step);
        context.clearRect(0, 0, width, height); context.drawImage(sheet, frame % 3 * 32 + x, Math.floor(frame / 3) * 32 + y, width, height, 0, 0, width, height);
        if (walking) animation = requestAnimationFrame(draw);
      };
      draw(performance.now());
    }).catch(() => { if (!disposed) setError('Avatar artwork could not load. Reopen to retry.'); });
    return () => { disposed = true; cancelAnimationFrame(animation); };
  }, [appearance, avatarKey, direction, motion, x, y, width, height]);
  return <><canvas ref={canvas} width={width} height={height} role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${motion} avatar facing ${direction}`} className="pixel-art shrink-0" style={{ width: size, height: size * height / width }} />{error && <span role="alert" className="text-xs">{error}</span>}</>;
}
