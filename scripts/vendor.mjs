/* Copia htmx in static/ e genera le icone PWA. Nessuna dipendenza esterna. */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staticDir = join(root, 'static');
const iconsDir = join(staticDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

/* ------------------------------------------------------------------ htmx */

// htmx.org e una devDependency: dopo `npm prune --omit=dev` non c'e piu.
// Se il file e gia stato copiato va bene cosi, altrimenti e un errore vero.
const require = createRequire(import.meta.url);
const htmxDest = join(staticDir, 'htmx.min.js');
try {
  copyFileSync(require.resolve('htmx.org/dist/htmx.min.js'), htmxDest);
} catch (err) {
  if (!existsSync(htmxDest)) throw err;
  console.log('[vendor] htmx.org non installato, tengo la copia gia presente');
}

/* ------------------------------------------------------------------ icone */

const OLIVE = [0x5c, 0x6b, 0x2a];
const PAPER = [0xf4, 0xef, 0xe6];
const BAND = [0xeb, 0xe4, 0xd6];

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

/**
 * Il tappo del vasetto visto dall'alto (proposta 2f del design), con l'unica
 * differenza voluta: il cerchio e oliva e non inchiostro.
 *
 * Le proporzioni vengono dalla scheda a 120px: tappo 88/120, ghiera a 7px dal
 * bordo spessa 2, C in Gabarito 800 a 54px. Qui la C e disegnata come un arco,
 * non come un glifo, perche nel PNG non c'e un motore di testo.
 */
function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const s = size;
  // maskable: fondo a tutto campo, il crop dei launcher se lo mangia dagli angoli.
  // Il tappo sta dentro il 36,7% del raggio, quindi la zona sicura (80%) e rispettata.
  const box = { x0: 0, y0: 0, x1: s, y1: s };
  const radius = maskable ? 0 : s * 0.225;

  const cx = s / 2;
  const cy = s / 2;
  const rLid = s * 0.3667;
  const ringOut = s * 0.3083;
  const ringIn = s * 0.2917;
  const cOut = s * 0.1955;
  const cIn = s * 0.1295;
  const GAP = 0.66; // apertura della C verso destra, +-38 gradi

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
  const n = SS * SS;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let bg = 0;
      let lid = 0;
      let ring = 0;
      let letter = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px_ = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!inRoundRect(px_, py, box, radius)) continue;
          bg++;
          const dx = px_ - cx;
          const dy = py - cy;
          const d = Math.hypot(dx, dy);
          if (d > rLid) continue;
          lid++;
          if (d >= ringIn && d <= ringOut) ring++;
          else if (d >= cIn && d <= cOut && Math.abs(Math.atan2(dy, dx)) > GAP) letter++;
        }
      }
      const i = (y * s + x) * 4;
      if (bg) set(i, BAND, bg / n);
      if (lid) set(i, OLIVE, lid / n);
      if (ring) set(i, PAPER, (ring / n) * 0.35); // la ghiera e appena accennata
      if (letter) set(i, PAPER, letter / n);
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
  // Questa e la favicon: la ghiera del design a 16px sarebbe solo una sbavatura,
  // e infatti anche la scheda a 28px la lascia fuori.
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22.5" fill="#EBE4D6"/>
  <circle cx="50" cy="50" r="36.7" fill="#5C6B2A"/>
  <path d="M62.8 40A16.2 16.2 0 1 0 62.8 60" fill="none" stroke="#F4EFE6" stroke-width="6.6" stroke-linecap="butt"/>
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
