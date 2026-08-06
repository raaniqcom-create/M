// Generates the PWA icons as PNGs from a tiny hand-built raster — no sharp,
// no canvas, no design tool. Run once: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [30, 41, 59]; // brand slate-800
const FG = [34, 197, 94]; // accent green

function crc32(buf) {
  let c,
    table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = -1;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// draws a fuel-drop glyph: rounded square background + a centered droplet
function png(size, maskable) {
  const pad = maskable ? Math.round(size * 0.18) : Math.round(size * 0.1);
  const rows = [];
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - pad * 2) / 2;

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // droplet: circle on the bottom, tapering to a point at the top
      const dx = x - cx;
      const dy = y - cy;
      const inCircle = dx * dx + (dy - r * 0.22) ** 2 < (r * 0.62) ** 2;
      const taper = Math.abs(dx) < (r * 0.62 * (y - (cy - r * 0.8))) / (r * 1.02);
      const inTaper = y < cy + r * 0.22 && y > cy - r * 0.8 && taper;
      const color = inCircle || inTaper ? FG : BG;
      row.set(color, 1 + x * 3);
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, false));
writeFileSync('public/icons/icon-512.png', png(512, false));
writeFileSync('public/icons/icon-512-maskable.png', png(512, true));
console.log('icons written to public/icons/');
