/**
 * Generates every icon slot from one vector definition, in pure Node (zlib only).
 *
 * Each slot has a different contract and getting one wrong fails silently:
 *  - PWA "any"      — full-bleed square, opaque.
 *  - PWA maskable   — the launcher may crop to a circle of 80% diameter, so the
 *                     glyph is checked on its DIAGONAL, not its width (~0.52).
 *  - Android badge  — rendered from the ALPHA CHANNEL alone: a white glyph on
 *                     transparent. An opaque tile here becomes a grey square.
 *  - apple-touch    — opaque, no transparency; iOS composites on white otherwise.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../client/public/icons");

const INK = [28, 24, 21, 255];
const CREAM = [244, 237, 226, 255];
const FLAME = [224, 139, 78, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

/* --------------------------- tiny PNG encoder --------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------- geometry ------------------------------- */

const roundedRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** A flame: a disc with a point pulled upward. */
const flame = (cx, cy, r) => (x, y) => {
  if (circle(cx, cy, r)(x, y)) return true;
  const top = cy - r * 2.05;
  if (y > cy || y < top) return false;
  const t = (cy - y) / (cy - top);
  return Math.abs(x - cx) <= r * (1 - t) * 0.95;
};

/**
 * The mark, in a unit square. `scale` shrinks it about the centre so the
 * maskable variant can stay inside the launcher's 80%-diameter safe circle.
 */
function birthdayMark(scale = 1) {
  const s = (v) => 0.5 + (v - 0.5) * scale;

  const cake = roundedRect(s(0.2), s(0.55), s(0.8), s(0.775), 0.055 * scale);
  const plate = roundedRect(s(0.13), s(0.8), s(0.87), s(0.855), 0.028 * scale);
  const candle = roundedRect(s(0.472), s(0.365), s(0.528), s(0.56), 0.028 * scale);
  const icing = [0.305, 0.5, 0.695].map((cx) => circle(s(cx), s(0.55), 0.098 * scale));
  const wick = flame(s(0.5), s(0.295), 0.062 * scale);

  return {
    cream: (x, y) => cake(x, y) || plate(x, y) || candle(x, y) || icing.some((f) => f(x, y)),
    flame: wick,
  };
}

/* ------------------------------- rendering ------------------------------- */

const SS = 4; // supersampling factor per axis

function render(size, { ground, glyph, accent, scale = 1, radius = 0 }) {
  const mark = birthdayMark(scale);
  const buffer = Buffer.alloc(size * size * 4);
  const tile = radius > 0 ? roundedRect(0, 0, 1, 1, radius) : null;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;

          let colour = CLEAR;
          if (!tile || tile(x, y)) colour = ground;
          if (mark.cream(x, y)) colour = glyph;
          if (accent && mark.flame(x, y)) colour = accent;
          else if (!accent && mark.flame(x, y)) colour = glyph;

          acc[0] += colour[0] * colour[3];
          acc[1] += colour[1] * colour[3];
          acc[2] += colour[2] * colour[3];
          acc[3] += colour[3];
        }
      }
      const samples = SS * SS;
      const alpha = acc[3] / samples;
      const offset = (py * size + px) * 4;
      buffer[offset] = acc[3] ? Math.round(acc[0] / acc[3]) : 0;
      buffer[offset + 1] = acc[3] ? Math.round(acc[1] / acc[3]) : 0;
      buffer[offset + 2] = acc[3] ? Math.round(acc[2] / acc[3]) : 0;
      buffer[offset + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, size, buffer);
}

mkdirSync(OUT_DIR, { recursive: true });

const files = {
  // Full-bleed app icons: cream cake on ink, amber flame.
  "icon-192.png": render(192, { ground: INK, glyph: CREAM, accent: FLAME }),
  "icon-512.png": render(512, { ground: INK, glyph: CREAM, accent: FLAME }),
  // Maskable: glyph pulled in to 0.62 so its DIAGONAL stays inside the 80% circle.
  "icon-maskable-512.png": render(512, { ground: INK, glyph: CREAM, accent: FLAME, scale: 0.62 }),
  // iOS home screen: opaque, slightly inset, Apple applies its own mask.
  "apple-touch-icon.png": render(180, { ground: INK, glyph: CREAM, accent: FLAME, scale: 0.82 }),
  // Android notification badge: alpha-only. White glyph, no ground, run large.
  "badge-96.png": render(96, { ground: CLEAR, glyph: WHITE, accent: null, scale: 1.06 }),
};

for (const [name, data] of Object.entries(files)) {
  writeFileSync(resolve(OUT_DIR, name), data);
  console.log(`icons: ${name} (${(data.length / 1024).toFixed(1)} kB)`);
}
