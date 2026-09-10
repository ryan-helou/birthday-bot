/**
 * iOS launch images.
 *
 * Without these, tapping the Home Screen icon shows a white flash before the
 * app paints — iOS does not use the manifest's background_color. It only
 * accepts an image whose media query matches the device EXACTLY, so each
 * screen size needs its own file, in both appearances.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../client/public/splash");

/* Portrait CSS points and scale for the iPhones still in use. */
export const SCREENS = [
  { w: 440, h: 956, s: 3 }, // 16 Pro Max
  { w: 402, h: 874, s: 3 }, // 16 Pro
  { w: 430, h: 932, s: 3 }, // 15 Pro Max / 14 Pro Max
  { w: 393, h: 852, s: 3 }, // 15 / 15 Pro / 14 Pro
  { w: 428, h: 926, s: 3 }, // 14 Plus / 13 Pro Max
  { w: 390, h: 844, s: 3 }, // 14 / 13 / 12  ← Ryan's
  { w: 375, h: 812, s: 3 }, // 13 mini / X / XS / 11 Pro
  { w: 414, h: 896, s: 2 }, // XR / 11
  { w: 375, h: 667, s: 2 }, // SE
];

const THEMES = {
  light: { bg: [245, 246, 244], mark: [20, 23, 26], accent: [180, 35, 90] },
  dark: { bg: [15, 18, 20], mark: [236, 238, 239], accent: [255, 122, 166] },
};

/* --- PNG encoder (zlib only; no image dependency) --- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const byte of b) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour, no alpha
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* The same candle mark as the app icon, centred small — a launch image should
   be quiet, not a second splash screen. */
function render(width, height, theme) {
  const { bg, mark, accent } = THEMES[theme];
  const buf = Buffer.alloc(width * height * 3);
  const cx = width / 2;
  const cy = height / 2;
  const u = Math.min(width, height) * 0.13; // mark size
  const SS = 3;

  const rrect = (x0, y0, x1, y1, r) => (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const qx = Math.min(Math.max(x, x0 + r), x1 - r);
    const qy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - qx) ** 2 + (y - qy) ** 2 <= r * r;
  };
  const circ = (a, b, r) => (x, y) => (x - a) ** 2 + (y - b) ** 2 <= r * r;

  const cake = rrect(cx - u * 0.6, cy + u * 0.05, cx + u * 0.6, cy + u * 0.5, u * 0.11);
  const plate = rrect(cx - u * 0.74, cy + u * 0.55, cx + u * 0.74, cy + u * 0.7, u * 0.06);
  const candle = rrect(cx - u * 0.055, cy - u * 0.33, cx + u * 0.055, cy + u * 0.06, u * 0.055);
  const icing = [-0.39, 0, 0.39].map((d) => circ(cx + u * d, cy + u * 0.05, u * 0.2));
  const flameBall = circ(cx, cy - u * 0.46, u * 0.125);
  const flameTip = (x, y) => {
    const top = cy - u * 0.72;
    if (y > cy - u * 0.46 || y < top) return false;
    const t = (cy - u * 0.46 - y) / (cy - u * 0.46 - top);
    return Math.abs(x - cx) <= u * 0.125 * (1 - t);
  };

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          let c = bg;
          if (cake(x, y) || plate(x, y) || candle(x, y) || icing.some((f) => f(x, y))) c = mark;
          else if (flameBall(x, y) || flameTip(x, y)) c = accent;
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      const o = (py * width + px) * 3;
      buf[o] = Math.round(r / n);
      buf[o + 1] = Math.round(g / n);
      buf[o + 2] = Math.round(b / n);
    }
  }
  return png(width, height, buf);
}

/** The <link> tags iOS needs — each must match one device exactly. */
export function linkTags() {
  const out = [];
  for (const { w, h, s } of SCREENS) {
    for (const theme of ["light", "dark"]) {
      const scheme = theme === "dark" ? "dark" : "light";
      out.push(
        `<link rel="apple-touch-startup-image" href="/splash/${w}x${h}@${s}-${theme}.png" ` +
          `media="(prefers-color-scheme: ${scheme}) and (device-width: ${w}px) and (device-height: ${h}px) ` +
          `and (-webkit-device-pixel-ratio: ${s}) and (orientation: portrait)" />`,
      );
    }
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("generate-splash.mjs")) {
  mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const { w, h, s } of SCREENS) {
    for (const theme of ["light", "dark"]) {
      const data = render(w * s, h * s, theme);
      writeFileSync(resolve(OUT, `${w}x${h}@${s}-${theme}.png`), data);
      total += data.length;
    }
  }
  console.log(`splash: ${SCREENS.length * 2} images, ${(total / 1024).toFixed(0)} kB total`);
}
