/* Copia htmx in static/ e genera le icone PWA. Nessuna dipendenza esterna. */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staticDir = join(root, 'static');
const iconsDir = join(staticDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

/* ------------------------------------------------------------------ htmx */

const require = createRequire(import.meta.url);
copyFileSync(require.resolve('htmx.org/dist/htmx.min.js'), join(staticDir, 'htmx.min.js'));

/* ------------------------------------------------------------------ icone */

const OLIVE = [0x5c, 0x6b, 0x2a];
const PAPER = [0xf4, 0xef, 0xe6];

/** PNG RGBA senza dipendenze. */
function png(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro "none"
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let table = null;
function crc32(buf) {
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/** Il barattolo: quadrato oliva, etichetta chiara in basso, una C tagliata a destra. */
function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const s = size;
  const pad = maskable ? s * 0.14 : 0; // zona di sicurezza per il crop circolare
  const box = { x0: pad, y0: pad, x1: s - pad, y1: s - pad };
  const w = box.x1 - box.x0;
  const radius = maskable ? 0 : s * 0.22;

  const cx = box.x0 + w / 2;
  const cy = box.y0 + w * 0.41;
  const rOut = w * 0.275;
  const rIn = w * 0.168;

  const label = { y0: box.y0 + w * 0.72, y1: box.y0 + w * 0.88, x0: box.x0 + w * 0.14, x1: box.x1 - w * 0.14 };

  const set = (i, [r, g, b], a) => {
    // "sopra" semplice: il fondo e sempre opaco
    const ia = 1 - a;
    px[i] = Math.round(px[i] * ia + r * a);
    px[i + 1] = Math.round(px[i + 1] * ia + g * a);
    px[i + 2] = Math.round(px[i + 2] * ia + b * a);
    px[i + 3] = Math.max(px[i + 3], Math.round(255 * a));
  };

  // antialias a 3x3 campioni
  const SS = 3;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px_ = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!inRoundRect(px_, py, box, radius)) continue;
          bg++;
          if (py >= label.y0 && py <= label.y1 && px_ >= label.x0 && px_ <= label.x1) {
            fg++;
            continue;
          }
          const dx = px_ - cx;
          const dy = py - cy;
          const d = Math.hypot(dx, dy);
          if (d <= rOut && d >= rIn) {
            // taglio della C: apertura verso destra, ±38°
            const ang = Math.atan2(dy, dx);
            if (Math.abs(ang) > 0.66) fg++;
          }
        }
      }
      const i = (y * s + x) * 4;
      const n = SS * SS;
      if (bg) set(i, OLIVE, bg / n);
      if (fg) set(i, PAPER, fg / n);
    }
  }
  return png(s, s, px);
}

function inRoundRect(x, y, b, r) {
  if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
  if (r <= 0) return true;
  const cx = Math.min(Math.max(x, b.x0 + r), b.x1 - r);
  const cy = Math.min(Math.max(y, b.y0 + r), b.y1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

for (const [name, size, opts] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
]) {
  writeFileSync(join(iconsDir, name), drawIcon(size, opts));
}

writeFileSync(
  join(iconsDir, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#5C6B2A"/>
  <path d="M62 30a22 22 0 1 0 0 32" fill="none" stroke="#F4EFE6" stroke-width="12" stroke-linecap="butt"/>
  <rect x="14" y="72" width="72" height="16" rx="3" fill="#F4EFE6"/>
</svg>
`,
);

writeFileSync(
  join(staticDir, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'Cache',
      short_name: 'Cache',
      description: 'La dispensa di casa, sempre in tasca.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#F4EFE6',
      theme_color: '#F4EFE6',
      lang: 'it',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  ),
);

console.log('[vendor] htmx, icone e manifest pronti in static/');
