// Shared deterministic integer-pixel drawing and PNG encoding; no image dependencies.
import {mkdirSync,writeFileSync} from "node:fs";
import {deflateSync} from "node:zlib";
import {fileURLToPath} from "node:url";
const output=fileURLToPath(new URL("../apps/web/public/office/",import.meta.url));
mkdirSync(output,{recursive:true});
export function picture(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  const color = (hex) => [...hex.match(/../g).map((v) => parseInt(v, 16)), ...(hex.length === 6 ? [255] : [])];
  function rect(x, y, w, h, hex) {
    const rgba = color(hex);
    for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
      for (let c = 0; c < 4; c++) pixels[(py * width + px) * 4 + c] = rgba[c];
    }
  }
  function ellipse(x, y, w, h, hex) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (((i + .5 - w / 2) / (w / 2)) ** 2 + ((j + .5 - h / 2) / (h / 2)) ** 2 <= 1) rect(x + i, y + j, 1, 1, hex);
  }
  const line = (x, y, w, hex) => rect(x, y, w, 1, hex);
  function png(file) {
    function chunk(type, data) {
      const bytes = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
      for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
      const result = Buffer.alloc(data.length + 12); result.writeUInt32BE(data.length); bytes.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4); return result;
    }
    const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
    const scanlines = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    writeFileSync(output + file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(scanlines, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
  }
  return { rect, ellipse, line, png, pixels };
}
