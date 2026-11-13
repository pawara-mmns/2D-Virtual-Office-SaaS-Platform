import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { composeAvatar } from './composer.ts';
import { avatarCatalog, avatarSwatches, defaultCustomization, type AvatarCustomization } from '../../../../../packages/shared/src/avatar-customization.ts';
import { artColors, avatarPalette, avatarAtlasEntries, AVATAR_ATLAS_WIDTH, AVATAR_ATLAS_HEIGHT, AVATAR_FRAMES, drawAvatarLayer } from '../../../../../packages/shared/src/avatar-art.ts';

// A transparent integer-pixel canvas; any attempt to read pixels is a regression.
function canvasFixture() {
  const pixels = new Uint32Array(96 * 256);
  const context = {
    imageSmoothingEnabled: true, fillStyle: '',
    fillRect(x: number, y: number, width: number, height: number) {
      const color = Number.parseInt(this.fillStyle.slice(1), 16);
      for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) pixels[py * 96 + px] = 0xff000000 + color;
    },
    getImageData() { throw Error('Canvas readback must not be used to compose avatars'); },
  };
  return { width: 0, height: 0, pixels, context, getContext: () => context };
}

test('authored palette maps only explicit masks and preserves intentional white and fixed details', () => {
  assert.deepEqual(avatarPalette('#426c6e'), { ffffff: '#426c6e', dddddd: '#719192', '999999': '#2e4c4d' });
  assert.equal(avatarPalette('#ffffff')[artColors.main], '#ffffff');
  assert.equal(avatarPalette('#ffffff')[artColors.light], '#ffffff');
  assert.equal(avatarPalette('#000000')[artColors.main], '#000000');
  assert.equal(avatarPalette('#000000')[artColors.light], '#404040');
  assert.equal(avatarPalette('#ffffff')[artColors.cream], undefined);
  assert.equal(avatarPalette('#ffffff')[artColors.ink], undefined);
});

test('all catalog parts, body/hair/skin combinations and color swatches compose without canvas readback', context => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: canvasFixture } });
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as { document?: Document }).document;
  });
  const cases: AvatarCustomization[] = [];
  for (const body of avatarCatalog.body) {
    for (const hair of avatarCatalog.hair) for (const skinColor of avatarSwatches.skinColor) cases.push({ ...defaultCustomization, body, hair, skinColor });
    for (const [part, values] of Object.entries(avatarCatalog)) for (const option of values) {
      const config = { ...defaultCustomization, body, [part]: option };
      if (config.top === 'dress' || config.bottom === 'none') { config.top = 'dress'; config.bottom = 'none'; }
      cases.push(config);
    }
    for (const [key, values] of Object.entries(avatarSwatches)) for (const color of values) cases.push({ ...defaultCustomization, body, [key]: color });
  }
  const inspect = (config: AvatarCustomization) => composeAvatar(config) as unknown as ReturnType<typeof canvasFixture>;
  for (const config of cases) {
    const canvas = inspect(config);
    assert.deepEqual([canvas.width, canvas.height], [96, 256]);
    assert.equal(canvas.context.imageSmoothingEnabled, false);
    // No white mask remnants, including all 24 directional/animated/seated frames.
    assert.ok(!canvas.pixels.includes(0xffffffff), JSON.stringify(config));
    for (let frame = 0; frame < 24; frame++) assert.equal(canvas.pixels[Math.floor(frame / 3) * 32 * 96 + frame % 3 * 32], 0, 'frame corner stays transparent');
  }
  const normal = inspect({ ...defaultCustomization });
  const pixel = (x: number, y: number) => normal.pixels[y * 96 + x];
  assert.equal(pixel(10, 3), 0xff4c3c36, 'hair receives its selected color');
  assert.equal(pixel(12, 2), 0xff796d68, 'authored hair highlight is tinted');
  assert.equal(pixel(16, 10), 0xffd9a47f, 'face retains skin tone');
  assert.equal(pixel(13, 9), 0xff29333f, 'fixed eye ink survives');
  assert.equal(pixel(14, 14), 0xfff1e9d7, 'cream collar survives');
  assert.equal(pixel(17, 28), 0, 'gap between shoes stays transparent');
  assert.equal(inspect({ ...defaultCustomization }), normal, 'compositions are cached');
  const white = inspect({ ...defaultCustomization, topColor: '#ffffff', shoeColor: '#ffffff', accessoryColor: '#ffffff', hat: 'cap', eyes: 'bright', expression: 'cheerful', shoes: 'sneakers' });
  assert.equal(white.pixels[14 * 96 + 10], 0xffffffff, 'deliberately white clothing survives');
  assert.equal(white.pixels[27 * 96 + 11], 0xffffffff, 'deliberately white shoes survive');
  assert.equal(white.pixels[3 * 96 + 11], 0xffffffff, 'deliberately white accessories survive');
  assert.equal(white.pixels[9 * 96 + 13], 0xfff1e9d7, 'eye highlight survives');
  assert.equal(white.pixels[13 * 96 + 16], 0xfff1e9d7, 'teeth survive');
  assert.equal(white.pixels[28 * 96 + 11], 0xfff1e9d7, 'sneaker sole survives');
});

test('shoe detail pixels stay inside their shoe silhouette in every standing and seated frame', () => {
  for (const body of avatarCatalog.body) for (const option of avatarCatalog.shoes) for (let frame = 0; frame < 24; frame++) {
    const rects = drawAvatarLayer(body, 'shoes', option, frame);
    const footprint = new Set<string>();
    for (const [x, y, w, h, color] of rects) {
      for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
        if (color === artColors.main) footprint.add(`${px},${py}`);
        else assert.ok(footprint.has(`${px},${py}`), `${body}/${option}/${frame}: floating shoe detail at ${px},${py}`);
      }
    }
  }
});

test('generated atlas matches the shared source exactly, including transparent gaps and every frame boundary', () => {
  const png = readFileSync(new URL('../../../public/office/avatar-layers.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [AVATAR_ATLAS_WIDTH, AVATAR_ATLAS_HEIGHT]);
  assert.equal(png[25], 6, 'atlas is RGBA');
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const actual = inflateSync(Buffer.concat(chunks)), stride = AVATAR_ATLAS_WIDTH * 4 + 1;
  const expected = Buffer.alloc(stride * AVATAR_ATLAS_HEIGHT);
  for (const [row, { body, layer, option }] of avatarAtlasEntries.entries()) for (let frame = 0; frame < AVATAR_FRAMES; frame++) {
    for (const [x, y, w, h, color] of drawAvatarLayer(body, layer, option, frame)) {
      const rgba = Buffer.from(`${color}ff`, 'hex');
      for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) rgba.copy(expected, (row * 32 + py) * stride + 1 + (frame * 32 + px) * 4);
    }
  }
  assert.ok(actual.equals(expected), 'regenerate avatar-layers.png when authored templates change');
});
